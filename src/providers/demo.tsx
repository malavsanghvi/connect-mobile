import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { AppState } from 'react-native';

import { checkDemoState, leaveDemo, loadDemoChoices, startDemo, type DemoStartResult } from '@/lib/api/demo';
import { openedPath } from '@/lib/community';
import {
  DEMO_CHECK_MS,
  canRetryStart,
  endFor,
  infoFromState,
  isDemoGuest,
  isDemoInfo,
  isDemoLogin,
  isDemoPath,
  parseDemoLink,
  pickFamily,
  secondsUntil,
  startFailureMessage,
  type DemoFailureCode,
  type DemoGuest,
  type DemoInfo,
  type DemoLink,
  type DemoMode,
} from '@/lib/demo';
import { forgetDemoLink } from '@/lib/demo-address';
import { env, isConfigured } from '@/lib/env';
import { AppError, logError } from '@/lib/errors';
import { readPref, writePref } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * "Try the demo", app-wide (owner request 2026-10-14). The demo is the ordinary app in a demo community, in two modes:
 *
 *  - GUEST (`mode: 'guest'`): looking around a demo community with no sign-in, the same experience as any visitor (the app's guest
 *    mode, scoped to that community). This is where "Try the demo" lands, with no question asked first.
 *  - PERSON (`mode: 'person'`): signed in as one of the invented demo people, a real sign-in that lasts two hours.
 *
 * The shortest way in (owner request 2026-10-15) is one tap, or a link, straight to PERSON: "Start as a community member" on a demo
 * community starts the family's main adult (`start(id)`, the same path as choosing that person in the list), and the addresses
 * `/demo?as=family[&community=<web name>]` and `/demo?persona=<id>` (also `connect://demo?...`) do the same without a tap (`runLink`).
 * A start that fails never leaves a blank screen: the chooser comes back with the reason (`startError`) and Try again (`retryStart`).
 * A link does not start over a REAL sign-in on the device (that would sign the person out without asking): it opens the chooser, which warns.
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
  /** Why the latest start did not happen, in plain words (the portal's own sentence when it sent one); cleared when another start begins. */
  startError: string | null;
  /** Trying the latest start again can help (the portal was busy or unreachable), as opposed to a person or community that is not on the list. */
  canRetry: boolean;
  /** The demo community whose people the person step lists when no demo is running yet (reached from "Choose someone else"). */
  peopleOf: string | null;
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
  /** Why the latest start did not happen, in plain words; null when none failed (or another start has begun). */
  startError: string | null;
  /** Whether `retryStart` is worth offering for `startError`. */
  canRetry: boolean;
  /** The community the person step lists when no demo runs yet ("Choose someone else" on a demo community); otherwise `slug` names it. */
  peopleOf: string | null;
  /** "Try the demo" / "Be someone in the demo" / "Switch person": the community step when not in a demo, the person step when in one. */
  openChooser: () => void;
  /** Back: from the people of a community reached from the community step, to that step; from anything else, out of the chooser. */
  closeChooser: () => void;
  /** "Choose someone else" on a demo community: the people of that community (the web name), with no demo running yet. */
  openPeople: (slug: string) => void;
  /** Open this demo community as a guest: no sign-in, no question. A sign-in on this device is signed out first. */
  enterGuest: (community: DemoGuest) => Promise<void>;
  /** Start a demo as this person. A refusal or a failure comes back as a result with a plain sentence; nothing throws. */
  start: (persona: string) => Promise<DemoStartResult>;
  /** Try the latest start again (the same person, or the same `?as=family` request). */
  retryStart: () => void;
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
  startError: null,
  canRetry: false,
  peopleOf: null,
  openChooser: () => undefined,
  closeChooser: () => undefined,
  openPeople: () => undefined,
  enterGuest: async () => undefined,
  start: async () => ({ ok: false, code: 'failed', message: startFailureMessage('failed') }),
  retryStart: () => undefined,
  toGuest: async () => undefined,
  leave: async () => undefined,
};

export const DemoContext = createContext<DemoContextValue>(inert);

/** What a start asked for, kept so "Try again" repeats it: one exact person, or the family's main adult of a community (null: the first). */
type StartRequest = { kind: 'persona'; persona: string } | { kind: 'family'; community: string | null };

type Live = {
  info: DemoInfo | null;
  guest: DemoGuest | null;
  ending: boolean;
  /** A start is running (a link that arrives meanwhile is not acted on). */
  starting: boolean;
  /** The latest start, for Try again. */
  last: StartRequest | null;
  /** The saved demo and the opening link have been read. */
  ready: boolean;
};
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
  ctrl.setCore((c) => ({ ...c, chooser: how.chooser, notice: how.notice, startError: null, peopleOf: null }));
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
    ctrl.setCore((c) => ({ ...c, info: null, guest, chooser: null, notice: null, startError: null, peopleOf: null }));
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

/**
 * Start a demo as this person (the portal signs them in, this device keeps the tokens, the database names the community and the time
 * left). A refusal or a failure comes back as a result AND is kept as `startError`, so whichever screen is showing can say it; the
 * previous demo person (if any) ends first, and a new session that cannot be kept is signed out again.
 */
async function startPerson(ctrl: Controls, persona: string, request: StartRequest = { kind: 'persona', persona }): Promise<DemoStartResult> {
  ctrl.live.current.last = request;
  ctrl.live.current.starting = true;
  ctrl.setCore((c) => ({ ...c, starting: true, startError: null, canRetry: false }));
  try {
    const result = await startDemo(persona);
    if (!result.ok) {
      ctrl.setCore((c) => ({ ...c, starting: false, startError: result.message, canRetry: canRetryStart(result.code) }));
      return result;
    }
    try {
      // Switching person: the one before ends first (with its own sign-in), so it does not wait out its two hours.
      if (ctrl.live.current.info) {
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
      ctrl.live.current.info = info;
      ctrl.live.current.guest = null;
      await writePref(DEMO_PREF, info).catch((err: unknown) => logError('remembering the demo on this device', err));
      await forget(GUEST_PREF);
      ctrl.setCore((c) => ({ ...c, info, guest: null, now, starting: false, chooser: null, notice: null, startError: null, peopleOf: null }));
      return result;
    } catch (err) {
      logError('start the demo (signing out the new session)', err);
      await signOutHere();
      const message = startFailureMessage('failed');
      ctrl.setCore((c) => ({ ...c, starting: false, startError: message, canRetry: true }));
      return { ok: false, code: 'failed', message };
    }
  } finally {
    ctrl.live.current.starting = false;
  }
}

/**
 * Start as the family's main adult: read who the demo communities have (the portal's list), pick by area then by role (`pickFamily`),
 * and start that person. `community` is a web name (`?as=family&community=`), or null for the first community that has a family.
 */
async function startFamily(ctrl: Controls, community: string | null): Promise<DemoStartResult> {
  const request: StartRequest = { kind: 'family', community };
  ctrl.live.current.last = request;
  ctrl.live.current.starting = true;
  ctrl.setCore((c) => ({ ...c, starting: true, startError: null, canRetry: false }));
  const refuse = (code: DemoFailureCode, message: string): DemoStartResult => {
    ctrl.live.current.starting = false;
    ctrl.setCore((c) => ({ ...c, starting: false, startError: message, canRetry: canRetryStart(code) }));
    return { ok: false, code, message };
  };
  let choices;
  try {
    choices = await loadDemoChoices();
  } catch (err) {
    // loadDemoChoices has logged the detail; what it says is already plain English.
    return refuse('failed', err instanceof AppError ? err.userMessage : startFailureMessage('failed'));
  }
  if (!choices.enabled || choices.communities.length === 0) return refuse('off', choices.message ?? startFailureMessage('off'));
  const pick = pickFamily(choices, community);
  if (!pick.ok) return refuse(pick.code, startFailureMessage(pick.code));
  return startPerson(ctrl, pick.person.id, request);
}

/** Try the latest start again. */
function retry(ctrl: Controls): void {
  const last = ctrl.live.current.last;
  if (!last || ctrl.live.current.starting) return;
  void (last.kind === 'persona' ? startPerson(ctrl, last.persona) : startFamily(ctrl, last.community));
}

/**
 * Start what a demo link asked for, then clean the address. A failure (an id the portal does not know, the limit, the demo switched off,
 * the portal not answering) brings the chooser back with the reason and Try again, never a blank screen.
 */
async function runLink(ctrl: Controls, link: DemoLink): Promise<void> {
  let result: DemoStartResult;
  if (link.kind === 'unknown_person') {
    const message = startFailureMessage('unknown_person');
    ctrl.setCore((c) => ({ ...c, starting: false, startError: message, canRetry: false }));
    result = { ok: false, code: 'unknown_person', message };
  } else {
    result = link.kind === 'persona' ? await startPerson(ctrl, link.persona) : await startFamily(ctrl, link.community);
  }
  forgetDemoLink(result.ok);
  if (!result.ok) ctrl.setCore((c) => ({ ...c, chooser: c.info || c.guest ? 'person' : 'community' }));
}

/**
 * A link that arrives while the app is open. Over a REAL sign-in on this device it starts nothing (the start would sign that person
 * out): the chooser opens instead, and it says so before anything is tapped.
 */
async function openLink(ctrl: Controls, link: DemoLink): Promise<void> {
  let real = false;
  try {
    const { data } = await supabase.auth.getSession();
    real = !!data.session && !isDemoLogin(data.session.user);
  } catch (err) {
    logError('checking for a sign-in before a demo link (treating it as none)', err);
  }
  if (real) {
    forgetDemoLink(false);
    ctrl.setCore((c) => ({ ...c, chooser: 'community', notice: null }));
    return;
  }
  await runLink(ctrl, link);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [core, setCore] = useState<Core>({ ready: !isConfigured, chooser: null, starting: false, notice: null, startError: null, canRetry: false, peopleOf: null, info: null, guest: null, now: 0 });
  const live = useRef<Live>({ info: null, guest: null, ending: false, starting: false, last: null, ready: false });
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
      live.current.ready = true;
      // /demo opens the chooser, but only in a build that has a demo to offer and only when no demo is running already.
      const opened = env.demoUrl.length > 0 && isDemoPath(openedPath(url));
      // /demo?as=family and /demo?persona=<id> start straight away (no chooser, no tap), unless a REAL sign-in is on the device: starting
      // would sign that person out, so the chooser opens instead and warns. The demo that was running (a reload) is replaced by the link.
      const link = env.demoUrl.length > 0 ? parseDemoLink(url, openedPath(url)) : null;
      const realSignIn = !!session && !isDemoLogin(session.user);
      const auto = link !== null && !realSignIn;
      if (link && !auto) forgetDemoLink(false);
      const chooser: DemoChooser | null = !auto && !info && !guest && (opened || notice !== null) ? 'community' : null;
      setCore((c) => ({ ...c, ready: true, info, guest, now: Date.now(), notice, chooser, starting: auto || c.starting }));
      if (link && auto) void runLink(ctrl, link);
    })().catch((err: unknown) => {
      logError('reading the saved demo (continuing without one)', err);
      if (alive) setCore((c) => ({ ...c, ready: true }));
    });
    return () => {
      alive = false;
    };
    // Once, when the app opens. (`ctrl` only holds a setter and a ref, which never change.)
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setCore((c) => ({ ...c, guest, info: null, chooser: null, notice: null, startError: null, peopleOf: null }));
  };

  // A demo link that arrives while the app is open (connect://demo?as=family tapped on a phone that already runs the app).
  useEffect(() => {
    if (!isConfigured) return;
    const sub = Linking.addEventListener('url', ({ url }) => {
      const link = env.demoUrl.length > 0 ? parseDemoLink(url, openedPath(url)) : null;
      if (link && live.current.ready && !live.current.starting) void openLink(ctrl, link);
    });
    return () => sub.remove();
    // `ctrl` only holds a setter and a ref, which never change.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    startError: core.startError,
    canRetry: core.canRetry,
    peopleOf: core.peopleOf,
    openChooser: () => setCore((c) => ({ ...c, chooser: c.info || c.guest ? 'person' : 'community', notice: null, startError: null, peopleOf: null })),
    // Back from the people of a community that was reached from the community step returns to that step; from anywhere else it closes.
    closeChooser: () => setCore((c) => ({ ...c, chooser: c.chooser === 'person' && !c.info && !c.guest ? 'community' : null, notice: null, startError: null, peopleOf: null })),
    openPeople: (slug) => setCore((c) => ({ ...c, chooser: 'person', peopleOf: slug, notice: null, startError: null })),
    enterGuest,
    start: (persona) => startPerson(ctrl, persona),
    retryStart: () => retry(ctrl),
    toGuest: () => personToGuest(ctrl),
    leave: () => endDemo(ctrl, { notice: null, chooser: null }, true),
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

/** The demo, app-wide. Outside the provider (in a test) it is inert: no demo, nothing offered. */
export function useDemo(): DemoContextValue {
  return useContext(DemoContext);
}
