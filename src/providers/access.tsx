import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { accessScope, currentSlot, decideFeature, fallbackSnapshot, settleSlot, type AccessRead, type AccessReason, type AccessSlot, type AccessSnapshot, type FeatureKey } from '@/lib/access';
import { loadAccess } from '@/lib/api/access';
import { report, type AppError } from '@/lib/errors';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
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
 * when the community is switched and after any write (so a membership that was just recorded shows up).
 * An answer belongs to one person in one community and is never shown to another. A portal that does not
 * have the function yet gets the rules from before access levels (members: everything; visitors: the guide
 * and today's timings), so this app can ship before the database change.
 */
export function AccessProvider({ children }: { children: ReactNode }) {
  const { center, session } = useApp();
  const { version } = useDataVersion();
  const centerId = center?.id ?? null;
  const signedIn = !!session;
  const scope = accessScope(centerId, session?.user.id ?? null);
  const [slot, setSlot] = useState<AccessSlot | null>(null);
  // The latest inputs for reload(), and the scope a portal without the function was found for.
  const latest = useRef({ centerId, signedIn, scope });
  const missingFor = useRef<string | null>(null);
  useEffect(() => {
    latest.current = { centerId, signedIn, scope };
  });

  useEffect(() => {
    if (!centerId) return;
    // A portal that lacks the function does not gain it between two writes: ask again when the person or the community changes.
    if (missingFor.current === scope) return;
    let active = true;
    void readAccess(centerId, signedIn).then((read) => {
      if (!active) return;
      if ('missing' in read && read.missing) missingFor.current = scope;
      setSlot((prev) => settleSlot(prev, scope, read));
    });
    return () => {
      active = false;
    };
    // `scope` is the community and the person; `version` reads again after a write.
  }, [centerId, signedIn, scope, version]);

  const reload = useCallback(async () => {
    const { centerId: c, signedIn: s, scope: sc } = latest.current;
    if (!c) return;
    // Show "checking" again while the retry runs.
    setSlot((prev) => (prev && prev.scope === sc && !prev.snapshot ? { ...prev, error: null } : prev));
    missingFor.current = null;
    const read = await readAccess(c, s);
    // The person or the community changed while this was on its way: that answer is not wanted any more.
    if (latest.current.scope !== sc) return;
    if ('missing' in read && read.missing) missingFor.current = sc;
    setSlot((prev) => settleSlot(prev, sc, read));
  }, []);

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
