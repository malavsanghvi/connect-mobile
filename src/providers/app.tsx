import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { pendingSteps, type LegalStepDoc } from '@/features/legal-step';
import { loadLegalSteps } from '@/lib/api/legal';
import { loadCenter, loadMember, orgIdentifierRules, type Center, type Member } from '@/lib/api/member';
import { brandPalette, communityToOpen, isCommunityChoice, openedPath, type CommunityChoice } from '@/lib/community';
import { env, isConfigured } from '@/lib/env';
import { AppError, logError, report } from '@/lib/errors';
import { readPref, writePref } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { applyPalette } from '@/theme';

const COMMUNITY_PREF = 'community';

type Loaded<T> = { key: string; value?: T; error?: AppError };

export type AppContextValue = {
  /** False when EXPO_PUBLIC_* env vars are missing (setup screen is shown). */
  configured: boolean;
  /** Center + initial session are still being resolved. */
  booting: boolean;
  bootError: AppError | null;
  retryBoot: () => void;
  center: Center | null;
  /** The chosen community is a sandbox: show the "Sandbox · test data" watermark. */
  sandbox: boolean;
  /** No community chosen yet on this device (a new install): show "Find your community". */
  needsCommunity: boolean;
  /** The member opened "Switch community" from settings (cancellable). */
  choosingCommunity: boolean;
  /** Open a community and remember it on this device. */
  chooseCommunity: (choice: CommunityChoice) => Promise<void>;
  /** Show "Find your community" again (Settings › Switch community). */
  switchCommunity: () => void;
  cancelSwitchCommunity: () => void;
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
  /**
   * The community's documents this member must accept or answer before continuing (#20): the
   * first sign-in, and again for a newly published version. Empty when nothing is due; null
   * while they load.
   */
  legalPending: LegalStepDoc[] | null;
  legalError: AppError | null;
  retryLegal: () => void;
  /** After the answers are recorded: read the step again (it comes back empty). */
  finishLegal: () => void;
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
  // The community chosen on this device (undefined while it is being read).
  const [saved, setSaved] = useState<CommunityChoice | null | undefined>(undefined);
  const [choosingCommunity, setChoosingCommunity] = useState(false);

  // The link the app was opened with: a link into one of its screens belongs to the build's community.
  const [openedAt, setOpenedAt] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isConfigured) return;
    let active = true;
    readPref<unknown>(COMMUNITY_PREF, null).then((v) => {
      if (active) setSaved(isCommunityChoice(v) ? v : null);
    });
    Linking.getInitialURL()
      .then((url) => active && setOpenedAt(openedPath(url)))
      .catch((err: unknown) => {
        logError('reading the link that opened the app (treating it as a plain launch)', err);
        if (active) setOpenedAt('/');
      });
    return () => {
      active = false;
    };
  }, []);

  // Saved choice → the build's default for an install that is already signed
  // in (existing JSH members see no new step) → none ("Find your community").
  const slug =
    saved === undefined || !sessionReady || openedAt === undefined
      ? undefined
      : communityToOpen({ saved, signedIn: !!session, defaultSlug: env.centerSlug, openedAt });
  const centerKey = `${slug ?? ''}#${bootNonce}`;

  // Resolve the center (public read — works for guests too) and theme the app from its brand kit.
  useEffect(() => {
    if (!isConfigured || !slug) return;
    let active = true;
    loadCenter(slug)
      .then((value) => {
        if (!active) return;
        applyPalette(brandPalette(value.branding));
        setCenterResult({ key: centerKey, value });
      })
      .catch((err: unknown) => active && setCenterResult({ key: centerKey, error: report(err, 'open your community') }));
    return () => {
      active = false;
    };
  }, [centerKey, slug]);

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

  // An install that opened the default community without choosing one keeps
  // it from now on, so signing out later does not ask again.
  useEffect(() => {
    if (!center || saved !== null) return;
    const choice = { slug: center.slug, name: center.name };
    writePref(COMMUNITY_PREF, choice)
      .then(() => setSaved(choice))
      .catch((err: unknown) => logError('remembering the community on this device (it will be asked again next time)', err));
  }, [center, saved]);

  const chooseCommunity = async (choice: CommunityChoice) => {
    try {
      await writePref(COMMUNITY_PREF, choice);
    } catch (err) {
      // Still open it for this session; the member is asked again next launch.
      logError('remembering the chosen community on this device', err);
    }
    setMemberResult(null);
    setOnboarding(false);
    setGuest(false);
    setSaved(choice);
    setChoosingCommunity(false);
  };
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

  // The legal step: loaded for a linked member, re-read after answering or on retry.
  const [legalNonce, setLegalNonce] = useState(0);
  const [legalResult, setLegalResult] = useState<Loaded<LegalStepDoc[] | null> | null>(null);
  const linkedPerson = session && memberResult?.key === memberKey ? (memberResult.value?.person.id ?? null) : null;
  const legalKey = `${memberKey}#${linkedPerson ?? ''}#${legalNonce}`;
  useEffect(() => {
    const c = latest.current.center;
    if (!c || !linkedPerson) return;
    let active = true;
    loadLegalSteps(c.id)
      .then((value) => active && setLegalResult({ key: legalKey, value: value === null ? [] : pendingSteps(value) }))
      .catch((err: unknown) => active && setLegalResult({ key: legalKey, error: report(err, "load your community's documents") }));
    return () => {
      active = false;
    };
  }, [legalKey, linkedPerson]);
  const currentLegal = linkedPerson && legalResult?.key === legalKey ? legalResult : null;

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
    booting: isConfigured && (slug === undefined || (slug !== null && (!centerResult || centerResult.key !== centerKey))),
    bootError: slug && centerResult?.key === centerKey ? (centerResult.error ?? null) : null,
    retryBoot: () => setBootNonce((n) => n + 1),
    center: slug ? center : null,
    sandbox: !!slug && center?.environment === 'sandbox',
    needsCommunity: isConfigured && slug === null,
    choosingCommunity,
    chooseCommunity,
    switchCommunity: () => setChoosingCommunity(true),
    cancelSwitchCommunity: () => setChoosingCommunity(false),
    session,
    guest: !session && guest,
    setGuest,
    member: currentMember?.value ?? null,
    memberLoading: !!session && !!center && !currentMember,
    memberError: currentMember?.error ?? null,
    refreshMember,
    onboarding,
    setOnboarding,
    legalPending: linkedPerson ? (currentLegal ? (currentLegal.value ?? null) : null) : [],
    legalError: currentLegal?.error ?? null,
    retryLegal: () => setLegalNonce((n) => n + 1),
    finishLegal: () => setLegalNonce((n) => n + 1),
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
