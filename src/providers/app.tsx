import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { loadCenter, loadMember, orgIdentifierRules, type Center, type Member } from '@/lib/api/member';
import { env, isConfigured } from '@/lib/env';
import { AppError, logError, report } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type Loaded<T> = { key: string; value?: T; error?: AppError };

export type AppContextValue = {
  /** False when EXPO_PUBLIC_* env vars are missing (setup screen is shown). */
  configured: boolean;
  /** Center + initial session are still being resolved. */
  booting: boolean;
  bootError: AppError | null;
  retryBoot: () => void;
  center: Center | null;
  session: Session | null;
  /** Browsing without an account (events, guide, timings). */
  guest: boolean;
  setGuest: (guest: boolean) => void;
  /** Linked member record, or null when signed out / not yet linked. */
  member: Member | null;
  memberLoading: boolean;
  memberError: AppError | null;
  /** Re-read the member, household and family (after linking or edits). */
  refreshMember: () => Promise<Member | null>;
  /** True while the onboarding steps are in progress. */
  onboarding: boolean;
  setOnboarding: (on: boolean) => void;
  /** Label for the org's person id, e.g. "JSH member ID". */
  orgMemberLabel: string;
  /** Label for the org's household id, e.g. "JSH household ID". */
  orgHouseholdLabel: string;
  signOut: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [bootNonce, setBootNonce] = useState(0);
  const [centerResult, setCenterResult] = useState<Loaded<Center> | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [guest, setGuest] = useState(false);
  const [memberResult, setMemberResult] = useState<Loaded<Member | null> | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  const centerKey = `${env.centerSlug}#${bootNonce}`;

  // Resolve the center (public read — works for guests too).
  useEffect(() => {
    if (!isConfigured) return;
    let active = true;
    loadCenter(env.centerSlug)
      .then((value) => active && setCenterResult({ key: centerKey, value }))
      .catch((err: unknown) => active && setCenterResult({ key: centerKey, error: report(err, 'open your center') }));
    return () => {
      active = false;
    };
  }, [centerKey]);

  // Track the auth session.
  useEffect(() => {
    if (!isConfigured) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) logError('restoring your sign-in (continuing signed out)', error);
        if (!active) return;
        setSession(data.session);
        setSessionReady(true);
      })
      .catch((err: unknown) => {
        logError('restoring your sign-in (continuing signed out)', err);
        if (active) setSessionReady(true);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) setGuest(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const center = centerResult?.key === centerKey ? (centerResult.value ?? null) : null;
  const userId = session?.user.id ?? null;
  const memberKey = `${center?.id ?? ''}#${userId ?? ''}`;

  // Latest center/session for the member loader, which is keyed on ids only
  // (the session object changes on every token refresh).
  const latest = useRef({ center, session });
  useEffect(() => {
    latest.current = { center, session };
  });

  // Load the linked member whenever the user or center changes.
  useEffect(() => {
    const { center: c, session: s } = latest.current;
    if (!c || !s) return;
    let active = true;
    loadMember(c, s.user)
      .then((value) => {
        if (!active) return;
        setMemberResult({ key: memberKey, value });
        // A new login starts onboarding only when it isn't linked to a person yet.
        setOnboarding(!value);
      })
      .catch((err: unknown) => active && setMemberResult({ key: memberKey, error: report(err, 'load your family') }));
    return () => {
      active = false;
    };
  }, [memberKey]);

  const refreshMember = async (): Promise<Member | null> => {
    if (!center) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw report(error ?? new Error('no user'), 'load your family');
    const key = `${center.id}#${data.user.id}`;
    try {
      const value = await loadMember(center, data.user);
      setMemberResult({ key, value });
      return value;
    } catch (err) {
      const appErr = report(err, 'load your family');
      setMemberResult({ key, error: appErr });
      throw appErr;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw report(error, 'sign out');
    setMemberResult(null);
    setOnboarding(false);
  };

  const currentMember = session && memberResult?.key === memberKey ? memberResult : null;
  const { memberLabel, householdLabel } = orgIdentifierRules(center);
  const shortName = center?.short_name || center?.name || '';

  const value: AppContextValue = {
    configured: isConfigured,
    booting: isConfigured && (!sessionReady || !centerResult || centerResult.key !== centerKey),
    bootError: centerResult?.key === centerKey ? (centerResult.error ?? null) : null,
    retryBoot: () => setBootNonce((n) => n + 1),
    center,
    session,
    guest: !session && guest,
    setGuest,
    member: currentMember?.value ?? null,
    memberLoading: !!session && !!center && !currentMember,
    memberError: currentMember?.error ?? null,
    refreshMember,
    onboarding,
    setOnboarding,
    orgMemberLabel: memberLabel ?? `${shortName} member ID`.trim(),
    orgHouseholdLabel: householdLabel ?? `${shortName} household ID`.trim(),
    signOut,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** For screens that only render for a linked member (the (app) group guarantees it outside guest mode). */
export function useMember(): Member | null {
  return useApp().member;
}
