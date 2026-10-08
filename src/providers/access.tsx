import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { accessReadDue, accessScope, currentSlot, decideFeature, fallbackSnapshot, settleSlot, type AccessRead, type AccessReason, type AccessSlot, type AccessSnapshot, type FeatureKey } from '@/lib/access';
import { loadAccess } from '@/lib/api/access';
import { report, type AppError } from '@/lib/errors';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useForegroundTick } from '@/providers/foreground';
import { useModules } from '@/providers/modules';

export type AccessValue = {
  /** What this person may use here, or null until the answer is in (and while it could not be had). */
  snapshot: AccessSnapshot | null;
  /** The answer for this person and community is on its way. */
  loading: boolean;
  /** Why there is no answer (shown with a retry). Never set while an earlier answer for the same person is still held. */
  error: AppError | null;
  reload: () => Promise<void>;
};

const AccessContext = createContext<AccessValue>({ snapshot: null, loading: false, error: null, reload: async () => {} });

/** One read of the answer. Never rejects: a failure comes back as `error`; a portal without the function gets the rules from before. */
async function readAccess(centerId: string, signedIn: boolean): Promise<AccessRead & { missing?: boolean }> {
  try {
    const answer = await loadAccess(centerId);
    return answer.kind === 'answered' ? { snapshot: answer.snapshot } : { snapshot: fallbackSnapshot(signedIn), missing: true };
  } catch (err) {
    return { error: report(err, 'check what you can use here') };
  }
}

/**
 * Loads `app.feature_access_for_me` once the community is known: for a signed-in person AND for a visitor
 * who is not signed in (the anonymous role may call it). It reads again when the person signs in or out,
 * when the community is switched, when a login becomes linked to the community (onboarding: the database
 * counts a login that is not linked yet as public) and after any write (so a membership that was just recorded
 * shows up). A signed-in person's first read waits until their link to the community is known.
 * An answer belongs to one person in one community and is never shown to another. A portal that does not
 * have the function yet gets the rules from before access levels (members: everything; visitors: the guide
 * and today's timings), so this app can ship before the database change.
 */
export function AccessProvider({ children }: { children: ReactNode }) {
  const { center, session, member, memberLoading } = useApp();
  const { version } = useDataVersion();
  const tick = useForegroundTick();
  const centerId = center?.id ?? null;
  const signedIn = !!session;
  // The person the login is linked to in this community: the answer changes when the link is made.
  const scope = accessScope(centerId, session?.user.id ?? null, member?.person.id ?? null);
  const [slot, setSlot] = useState<AccessSlot | null>(null);
  // The latest inputs for reload(), and the scope the last read found the function missing for (null when it did not).
  const latest = useRef({ centerId, signedIn, scope, waiting: signedIn && memberLoading });
  const missingFor = useRef<string | null>(null);
  useEffect(() => {
    latest.current = { centerId, signedIn, scope, waiting: signedIn && memberLoading };
  });

  /** Hold one read, and remember whether it found the function missing, for this person and community only. */
  const settle = useCallback((forScope: string, read: AccessRead & { missing?: boolean }) => {
    missingFor.current = 'missing' in read && read.missing ? forScope : null;
    setSlot((prev) => settleSlot(prev, forScope, read));
  }, []);

  useEffect(() => {
    if (!centerId || !accessReadDue({ signedIn, memberLoading, scope, missingFor: missingFor.current })) return;
    let active = true;
    void readAccess(centerId, signedIn).then((read) => {
      if (active) settle(scope, read);
    });
    return () => {
      active = false;
    };
    // `scope` is the community, the login and the person it is linked to; `version` reads again after a write and
    // `tick` when the app returns to the foreground, so a level the organization changed shows without a restart.
  }, [centerId, signedIn, memberLoading, scope, version, tick, settle]);

  const reload = useCallback(async () => {
    const { centerId: c, signedIn: s, scope: sc, waiting } = latest.current;
    // Nothing to retry before the community is known or while the person's link is being looked up (the read follows by itself).
    if (!c || waiting) return;
    // Show "checking" again while the retry runs.
    setSlot((prev) => (prev && prev.scope === sc && !prev.snapshot ? { ...prev, error: null } : prev));
    const read = await readAccess(c, s);
    // The person or the community changed while this was on its way: that answer is not wanted any more.
    if (latest.current.scope !== sc) return;
    settle(sc, read);
  }, [settle]);

  const current = currentSlot(slot, scope);
  const snapshot = current?.snapshot ?? null;
  const error = snapshot ? null : (current?.error ?? null);
  const loading = !!centerId && !snapshot && !error;
  const value = useMemo<AccessValue>(() => ({ snapshot, loading, error, reload }), [snapshot, loading, error, reload]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessValue {
  return useContext(AccessContext);
}

export type FeatureAccess = {
  /** The person may use the area now. False while the answer is loading (except for the guide and timings, which were always open). */
  allowed: boolean;
  /** Why not: `sign_in` (a visitor), `level` (a member below the area's minimum level), `module_off`. Null when allowed or not known. */
  reason: AccessReason | null;
  /** The lowest level that may use the area ("Member", "Life member"), when the answer said. */
  minLevelLabel: string | null;
  loading: boolean;
  error: AppError | null;
  reload: () => Promise<void>;
};

/**
 * May this person use this area (Live darshan, Virtual puja, Listen, Look, Learn, Ask Niva, the guide)
 * in their community? Combines the portal's answer with the community's modules. Check `loading` and `error`
 * before treating `allowed: false` as a "no" (`FeatureNotice` does).
 */
export function useFeature(key: FeatureKey): FeatureAccess {
  const { snapshot, loading, error, reload } = useAccess();
  const { map } = useModules();
  const d = decideFeature(snapshot, key, map);
  return { allowed: d.allowed, reason: d.reason, minLevelLabel: d.minLevel?.label ?? null, loading, error, reload };
}
