import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { AppState } from 'react-native';

import { checkDemoState, leaveDemo, startDemo, type DemoStartResult } from '@/lib/api/demo';
import { openedPath } from '@/lib/community';
import {
  DEMO_CHECK_MS,
  endFor,
  infoFromState,
  isDemoGuest,
  isDemoInfo,
  isDemoLogin,
  isDemoPath,
  secondsUntil,
  startFailureMessage,
  type DemoGuest,
  type DemoInfo,
  type DemoMode,
} from '@/lib/demo';
import { env, isConfigured } from '@/lib/env';
import { logError } from '@/lib/errors';
import { readPref, writePref } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * "Try the demo", app-wide (owner request 2026-10-14). The demo is the ordinary app in a demo community, in two modes:
 *
 *  - GUEST (`mode: 'guest'`): looking around a demo community with no sign-in, the same experience as any visitor (the app's guest
 *    mode, scoped to that community). This is where "Try the demo" lands, with no question asked first.
 *  - PERSON (`mode: 'person'`): signed in as one of the invented demo people, a real sign-in that lasts two hours.
 *
 * This provider holds which of the three the device is in (`mode`, `guest`, `active`), the community the demo opens (`slug`), the
 * chooser that is open (`chooser`: the community step or the person step), starting and leaving, and the check of a running person
 * session with the database (app.demo_session_state, every minute and when the app comes back). When it says the person session is
 * over, or the sign-in can no longer be refreshed, this device signs out and the chooser comes back with a plain sentence.
 *
 * How a demo is known after a reload or restart: a saved demo sign-in that the database confirms (person), or the saved guest choice
 * with no sign-in on the device (guest). Both live in the same device storage as any sign-in.
 *
 * This sits ABOVE AppProvider (which reads `slug`, `ready` and `guest` to decide which community to open and whether to show the guest
 * app) and only uses the Supabase client. A demo person signs out with scope "local": Supabase's default signs the login out
 * EVERYWHERE, and a demo person is shared by every visitor who chose them, so that would end other people's demos.
 */

const DEMO_PREF = 'demo';
const GUEST_PREF = 'demoGuest';

/** A check that cannot be answered keeps the demo going until the clock says it is over for this long (ms). */
const LOCAL_GRACE_MS = 30_000;

/** Why the chooser is showing a sentence: the person session ran out or could not be kept, or the demo was switched off. */
export type DemoNotice = 'ended' | 'off';

/** Which chooser is open: the demo communities (the first step) or the people of the community being looked at. */
export type DemoChooser = 'community' | 'person';

type Core = {
  /** The saved demo (if any) has been read and checked: the app may now decide which community to open. */
  ready: boolean;
  chooser: DemoChooser | null;
  starting: boolean;
  notice: DemoNotice | null;
  info: DemoInfo | null;
  guest: DemoGuest | null;
  /** The device clock when `info` was last read or checked, for the countdown (kept in state so a render never reads the clock). */
  now: number;
};

export type DemoContextValue = {
  /** This build has a portal address to run the demo from: the "Try the demo" button is shown. */
  available: boolean;
  ready: boolean;
  mode: DemoMode;
  /** Looking around a demo community as a guest. */
  guest: boolean;
  /** A demo person is signed in on this device. */
  active: boolean;
  info: DemoInfo | null;
  /** The demo community being looked at as a guest, or null. */
  guestCommunity: DemoGuest | null;
  secondsLeft: number;
  /** The web name of the community the demo opens (the guest's or the person's), or null when no demo is running. */
  slug: string | null;
  /** A demo person is being started: the app opens no community meanwhile. */
  starting: boolean;
  /** A chooser is on screen, and which one. */
  choosing: boolean;
  chooser: DemoChooser | null;
  notice: DemoNotice | null;
  /** "Try the demo" / "Be someone in the demo" / "Switch person": the community step when not in a demo, the person step when in one. */
  openChooser: () => void;
  closeChooser: () => void;
  /** Open this demo community as a guest: no sign-in, no question. A sign-in on this device is signed out first. */
  enterGuest: (community: DemoGuest) => Promise<void>;
  /** Start a demo as this person. A refusal or a failure comes back as a result with a plain sentence; nothing throws. */
  start: (persona: string) => Promise<DemoStartResult>;
  /** From a demo person back to looking around the same community as a guest. */
  toGuest: () => Promise<void>;
  /** Leave the demo: tell the database (a person), sign out on this device, back to "Find your community". */
  leave: () => Promise<void>;
};

const inert: DemoContextValue = {
  available: false,
  ready: true,
  mode: 'off',
  guest: false,
  active: false,
  info: null,
  guestCommunity: null,
  secondsLeft: 0,
  slug: null,
  starting: false,
  choosing: false,
  chooser: null,
  notice: null,
  openChooser: () => undefined,
  closeChooser: () => undefined,
  enterGuest: async () => undefined,
  start: async () => ({ ok: false, code: 'failed', message: startFailureMessage('failed') }),
  toGuest: async () => undefined,
  leave: async () => undefined,
};

export const DemoContext = createContext<DemoContextValue>(inert);

type Live = { info: DemoInfo | null; guest: DemoGuest | null; ending: boolean };
type Controls = { setCore: Dispatch<SetStateAction<Core>>; live: RefObject<Live> };

async function signOutHere(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) logError('signing the demo out on this device', error);
  } catch (err) {
    logError('signing the demo out on this device', err);
  }
}

function forget(pref: string): Promise<void> {
  return writePref(pref, null).catch((err: unknown) => logError('forgetting the demo on this device', err));
}

/**
 * The demo is over for this device. `how.chooser` is what comes next: null goes back to "Find your community" (the person left), the
 * community step shows a sentence about why (the session ran out, or the demo was switched off). The database is told when this device
 * is the one ending a person session; this device is signed out; what was saved is forgotten.
 */
async function endDemo(ctrl: Controls, how: { notice: DemoNotice | null; chooser: DemoChooser | null }, tellDatabase: boolean): Promise<void> {
  if (ctrl.live.current.ending) return;
  ctrl.live.current.ending = true;
  ctrl.setCore((c) => ({ ...c, chooser: how.chooser, notice: how.notice }));
  try {
    if (ctrl.live.current.info) {
      if (tellDatabase) {
        try {
          await leaveDemo();
        } catch (err) {
          logError('telling the database the demo was left (signing out on this device anyway)', err);
        }
      }
      await signOutHere();
    }
    await forget(DEMO_PREF);
    await forget(GUEST_PREF);
    ctrl.live.current.info = null;
    ctrl.live.current.guest = null;
    ctrl.setCore((c) => ({ ...c, info: null, guest: null, starting: false }));
  } finally {
    ctrl.live.current.ending = false;
  }
}

/** From a demo person to looking around the same community as a guest: the database is told, this device is signed out, the guest choice saved. */
async function personToGuest(ctrl: Controls): Promise<void> {
  const info = ctrl.live.current.info;
  if (!info || ctrl.live.current.ending) return;
  ctrl.live.current.ending = true;
  try {
    try {
      await leaveDemo();
    } catch (err) {
      logError('telling the database the demo person was left (signing out on this device anyway)', err);
    }
    await signOutHere();
    await forget(DEMO_PREF);
    const guest: DemoGuest = { slug: info.slug, name: info.community };
    await writePref(GUEST_PREF, guest).catch((err: unknown) => logError('remembering the demo on this device', err));
    ctrl.live.current.info = null;
    ctrl.live.current.guest = guest;
    ctrl.setCore((c) => ({ ...c, info: null, guest, chooser: null, notice: null }));
  } finally {
    ctrl.live.current.ending = false;
  }
}

/** Ask the database how the demo person's session is doing and act on the answer. An unanswered check keeps it until the clock says it is over. */
async function verify(ctrl: Controls): Promise<void> {
  const info = ctrl.live.current.info;
  if (!info || ctrl.live.current.ending) return;
  try {
    const state = await checkDemoState();
    if (state.state === 'ok') {
      const now = Date.now();
      const next = infoFromState(state, now);
      ctrl.live.current.info = next;
      ctrl.setCore((c) => (c.info ? { ...c, info: next, now } : c));
      writePref(DEMO_PREF, next).catch((err: unknown) => logError('remembering the demo on this device', err));
      return;
    }
    await endDemo(ctrl, { notice: endFor(state.state), chooser: 'community' }, false);
  } catch (err) {
    logError('checking the demo (keeping it going)', err);
    const now = Date.now();
    ctrl.setCore((c) => ({ ...c, now }));
    if (now > info.deadline + LOCAL_GRACE_MS) await endDemo(ctrl, { notice: 'ended', chooser: 'community' }, false);
  }
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [core, setCore] = useState<Core>({ ready: !isConfigured, chooser: null, starting: false, notice: null, info: null, guest: null, now: 0 });
  const live = useRef<Live>({ info: null, guest: null, ending: false });
  const ctrl: Controls = { setCore, live };
  const running = core.info !== null;

  // Read the saved sign-in and demo once: is a demo running, is it still, and was the app opened on /demo.
  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    (async () => {
      const [stored, storedGuest, url, session] = await Promise.all([
        readPref<unknown>(DEMO_PREF, null),
        readPref<unknown>(GUEST_PREF, null),
        Linking.getInitialURL().catch(() => null),
        supabase.auth.getSession().then(
          (r) => r.data.session,
          () => null,
        ),
      ]);
      let info: DemoInfo | null = null;
      let guest: DemoGuest | null = null;
      let notice: DemoNotice | null = null;
      if (session && isDemoLogin(session.user)) {
        const known = isDemoInfo(stored) ? stored : null;
        try {
          const state = await checkDemoState();
          if (state.state === 'ok') {
            info = infoFromState(state, Date.now());
          } else {
            notice = endFor(state.state);
          }
        } catch (err) {
          logError('checking the saved demo (carrying on with what is saved, if it has not run out)', err);
          if (known && Date.now() < known.deadline) info = known;
          else notice = 'ended';
        }
        if (!info) {
          await signOutHere();
          await forget(DEMO_PREF);
        }
      } else if (stored != null) {
        // A demo that is no longer a demo sign-in here (signed out some other way): forget it.
        await forget(DEMO_PREF);
      }
      if (!info && !session && isDemoGuest(storedGuest)) guest = storedGuest;
      // A guest choice that no longer fits (a demo person is signed in, or somebody signed in for real since) is forgotten.
      if (storedGuest != null && !guest) await forget(GUEST_PREF);
      if (!alive) return;
      live.current.info = info;
      live.current.guest = guest;
      // /demo opens the chooser, but only in a build that has a demo to offer and only when no demo is running already.
      const opened = env.demoUrl.length > 0 && isDemoPath(openedPath(url));
      const chooser: DemoChooser | null = !info && !guest && (opened || notice !== null) ? 'community' : null;
      setCore((c) => ({ ...c, ready: true, info, guest, now: Date.now(), notice, chooser }));
    })().catch((err: unknown) => {
      logError('reading the saved demo (continuing without one)', err);
      if (alive) setCore((c) => ({ ...c, ready: true }));
    });
    return () => {
      alive = false;
    };
    // Once, when the app opens.
  }, []);

  // While a demo person is signed in: ask the database every minute, and when the app comes back to the foreground.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void verify(ctrl), DEMO_CHECK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void verify(ctrl);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
    // `ctrl` only holds a setter and a ref, which never change.
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  // A sign-in that goes away while a demo person is signed in (the token could no longer be refreshed, or it was signed out elsewhere) ends the demo.
  useEffect(() => {
    if (!isConfigured) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Not inside the callback: calling the client from here can wait on the very lock the event is raised under.
      if (!session && live.current.info && !live.current.ending) setTimeout(() => void endDemo(ctrl, { notice: 'ended', chooser: 'community' }, false), 0);
    });
    return () => data.subscription.unsubscribe();
    // `ctrl` only holds a setter and a ref, which never change.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enterGuest = async (community: DemoGuest): Promise<void> => {
    // A guest has no account, and a demo must never run under somebody's own sign-in: one on this device is signed out here first.
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) await signOutHere();
    } catch (err) {
      logError('checking for a sign-in before the demo (continuing as a guest)', err);
    }
    const guest: DemoGuest = { slug: community.slug, name: community.name };
    live.current.guest = guest;
    await writePref(GUEST_PREF, guest).catch((err: unknown) => logError('remembering the demo on this device', err));
    setCore((c) => ({ ...c, guest, info: null, chooser: null, notice: null }));
  };

  const start = async (persona: string): Promise<DemoStartResult> => {
    setCore((c) => ({ ...c, starting: true }));
    const result = await startDemo(persona);
    if (!result.ok) {
      setCore((c) => ({ ...c, starting: false }));
      return result;
    }
    try {
      // Switching person: the one before ends first (with its own sign-in), so it does not wait out its two hours.
      if (live.current.info) {
        try {
          await leaveDemo();
        } catch (err) {
          logError('ending the previous demo person (carrying on)', err);
        }
      }
      const { error } = await supabase.auth.setSession({ access_token: result.session.access_token, refresh_token: result.session.refresh_token });
      if (error) throw error;
      // The database names the community the demo person belongs to and the time left; the portal's own answer is only a fallback for the words.
      const state = await checkDemoState();
      if (state.state !== 'ok') throw new Error(`the new demo session was not accepted (${state.state})`);
      const now = Date.now();
      const info = infoFromState(state, now);
      live.current.info = info;
      live.current.guest = null;
      await writePref(DEMO_PREF, info).catch((err: unknown) => logError('remembering the demo on this device', err));
      await forget(GUEST_PREF);
      setCore((c) => ({ ...c, info, guest: null, now, starting: false, chooser: null, notice: null }));
      return result;
    } catch (err) {
      logError('start the demo (signing out the new session)', err);
      await signOutHere();
      setCore((c) => ({ ...c, starting: false }));
      return { ok: false, code: 'failed', message: startFailureMessage('failed') };
    }
  };

  const mode: DemoMode = core.info ? 'person' : core.guest ? 'guest' : 'off';
  const value: DemoContextValue = {
    available: env.demoUrl.length > 0,
    ready: core.ready,
    mode,
    guest: mode === 'guest',
    active: mode === 'person',
    info: core.info,
    guestCommunity: core.guest,
    secondsLeft: core.info ? secondsUntil(core.info.deadline, core.now) : 0,
    slug: core.info?.slug ?? core.guest?.slug ?? null,
    starting: core.starting,
    choosing: core.chooser !== null,
    chooser: core.chooser,
    notice: core.notice,
    openChooser: () => setCore((c) => ({ ...c, chooser: c.info || c.guest ? 'person' : 'community', notice: null })),
    closeChooser: () => setCore((c) => ({ ...c, chooser: null, notice: null })),
    enterGuest,
    start,
    toGuest: () => personToGuest(ctrl),
    leave: () => endDemo(ctrl, { notice: null, chooser: null }, true),
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

/** The demo, app-wide. Outside the provider (in a test) it is inert: no demo, nothing offered. */
export function useDemo(): DemoContextValue {
  return useContext(DemoContext);
}
