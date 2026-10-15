import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { parseChoices, type DemoChoices, type DemoState } from '@/lib/demo';
import { AppError } from '@/lib/errors';

import { DemoProvider, useDemo, type DemoContextValue } from '../demo';

// ── The outside world: the portal calls, the database checks, the sign-in client and the device storage ──────────────────
const mockCheck = jest.fn<() => Promise<DemoState>>();
const mockLeave = jest.fn<() => Promise<void>>();
const mockStart = jest.fn<(persona: string) => Promise<unknown>>();
const mockChoices = jest.fn<() => Promise<DemoChoices>>();
const mockGetSession = jest.fn<() => Promise<{ data: { session: unknown } }>>();
const mockSetSession = jest.fn<(tokens: { access_token: string; refresh_token: string }) => Promise<{ error: unknown }>>();
const mockSignOut = jest.fn<(opts?: { scope: string }) => Promise<{ error: unknown }>>();
const mockInitialUrl = jest.fn<() => Promise<string | null>>();
let authListener: ((event: string, session: unknown) => void) | null = null;
let urlListener: ((event: { url: string }) => void) | null = null;
const mockPrefs: Record<string, unknown> = {};
const calls: string[] = [];

jest.mock('@/lib/api/demo', () => ({
  checkDemoState: () => mockCheck(),
  leaveDemo: () => mockLeave(),
  startDemo: (persona: string) => mockStart(persona),
  loadDemoChoices: () => mockChoices(),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      setSession: (t: { access_token: string; refresh_token: string }) => mockSetSession(t),
      signOut: (o?: { scope: string }) => mockSignOut(o),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => (authListener = null) } } };
      },
    },
  },
}));
jest.mock('@/lib/storage', () => ({
  readPref: async (key: string, fallback: unknown) => (key in mockPrefs && mockPrefs[key] !== null ? mockPrefs[key] : fallback),
  writePref: async (key: string, value: unknown) => {
    mockPrefs[key] = value;
  },
}));
const mockEnv = { demoUrl: 'https://admin.example' };
// A getter: the mock is built when the provider is first imported, before mockEnv exists; reading it later finds it.
jest.mock('@/lib/env', () => ({
  get env() {
    return mockEnv;
  },
  isConfigured: true,
}));
jest.mock('expo-linking', () => ({
  getInitialURL: () => mockInitialUrl(),
  addEventListener: (_type: string, cb: (event: { url: string }) => void) => {
    urlListener = cb;
    return { remove: () => (urlListener = null) };
  },
}));

const demoLogin = { user: { email: 'anita@demo.weaverams.org' } };
const realLogin = { user: { email: 'member@example.org' } };
const ok = (over: Record<string, unknown> = {}): DemoState =>
  ({ state: 'ok', secondsLeft: 7200, endsAt: null, role: 'Teacher', name: 'Anita Bhandari', centerName: 'Sunrise Worship Center', centerSlug: 'demo-worship', ...over }) as DemoState;
const started = { ok: true, session: { access_token: 'acc', refresh_token: 'ref' }, demo: { endsAt: '', role: 'Teacher', name: 'Anita Bhandari', community: 'Sunrise Worship Center' } };

// What the portal lists (GET /api/demo/choices): the family person of each community is the one in the community area.
const choices = (): DemoChoices => {
  const parsed = parseChoices({
    ok: true,
    enabled: true,
    communities: [
      {
        kind: 'faith',
        id: 'c-faith',
        slug: 'demo-worship',
        name: 'Sunrise Worship Center',
        people: [
          { id: 'f-teacher', role: 'Teacher', name: 'Anita Bhandari', story: 'Teaches a class.', area: 'operations' },
          { id: 'f-adult', role: 'Community member · Adult', name: 'Tarun Patni', story: 'The main adult of a family.', area: 'community' },
        ],
      },
      {
        kind: 'neutral',
        id: 'c-club',
        slug: 'demo-club',
        name: 'Lakeside Neighbors Club',
        people: [
          { id: 'n-lead', role: 'Event lead', name: 'Irina Petrov', story: 'Runs one event.', area: 'operations' },
          { id: 'n-adult', role: 'Community member · Adult', name: 'Kwame Osei', story: 'The main adult of a family.', area: 'community' },
        ],
      },
    ],
  });
  if (!parsed) throw new Error('bad fixture');
  return parsed;
};
// The database words the role for the banner as it likes (the live demo says "Primary adult"); the app shows that, not the portal list's role.
const familyOk = (over: Record<string, unknown> = {}): DemoState => ok({ role: 'Primary adult', name: 'Tarun Patni', ...over });

let latest!: DemoContextValue;
function Probe() {
  const demo = useDemo();
  useEffect(() => {
    latest = demo;
  });
  return null;
}

// Every provider mounted by a test is unmounted after it: a running demo person keeps a one-minute timer that would hold the test run open.
const mounted: renderer.ReactTestRenderer[] = [];

async function mount(): Promise<renderer.ReactTestRenderer> {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <DemoProvider>
        <Probe />
      </DemoProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}

/** Run something that changes the demo, and let everything it triggers settle. */
const run = async (work: () => Promise<unknown> | void): Promise<void> => {
  await act(async () => {
    await work();
  });
};

let logSpy: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  for (const m of [mockCheck, mockLeave, mockStart, mockChoices, mockGetSession, mockSetSession, mockSignOut, mockInitialUrl]) m.mockReset();
  for (const k of Object.keys(mockPrefs)) delete mockPrefs[k];
  calls.length = 0;
  authListener = null;
  urlListener = null;
  mockChoices.mockResolvedValue(choices());
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockInitialUrl.mockResolvedValue('https://app.weaverams.org/');
  mockSignOut.mockImplementation(async (o) => {
    calls.push(`signOut:${o?.scope ?? 'default'}`);
    return { error: null };
  });
  mockSetSession.mockImplementation(async () => {
    calls.push('setSession');
    return { error: null };
  });
  mockLeave.mockImplementation(async () => {
    calls.push('leave');
  });
  mockCheck.mockResolvedValue(ok());
  logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const tree of mounted.splice(0)) act(() => tree.unmount());
  mockEnv.demoUrl = 'https://admin.example';
  jest.useRealTimers();
  jest.restoreAllMocks();
  logSpy.mockRestore();
});

describe('before any demo', () => {
  it('is ready, off, with the button offered and no chooser open', async () => {
    await mount();
    expect(latest).toMatchObject({ ready: true, mode: 'off', guest: false, active: false, slug: null, choosing: false, chooser: null, notice: null, available: true });
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('opens the demo communities when the app is opened on /demo (the address the website links to)', async () => {
    mockInitialUrl.mockResolvedValue('https://app.weaverams.org/demo');
    await mount();
    expect(latest).toMatchObject({ mode: 'off', choosing: true, chooser: 'community' });
  });

  it('opens them for connect://demo too', async () => {
    mockInitialUrl.mockResolvedValue('connect://demo');
    await mount();
    expect(latest.chooser).toBe('community');
  });

  it('opens the communities step from "Try the demo", and Back closes it', async () => {
    await mount();
    await run(() => latest.openChooser());
    expect(latest.chooser).toBe('community');
    await run(() => latest.closeChooser());
    expect(latest).toMatchObject({ chooser: null, choosing: false });
  });
});

describe('looking around as a guest (no sign-in)', () => {
  it('opens the chosen community at once: guest mode, its web name, nothing signed in, the chooser closed', async () => {
    await mount();
    await run(() => latest.openChooser());
    await run(() => latest.enterGuest({ slug: 'demo-worship', name: 'Sunrise Worship Center' }));
    expect(latest).toMatchObject({ mode: 'guest', guest: true, active: false, slug: 'demo-worship', chooser: null, choosing: false });
    expect(latest.guestCommunity).toEqual({ slug: 'demo-worship', name: 'Sunrise Worship Center' });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('keeps the guest demo after a reload or restart', async () => {
    await mount();
    await run(() => latest.enterGuest({ slug: 'demo-worship', name: 'Sunrise Worship Center' }));
    expect(mockPrefs.demoGuest).toEqual({ slug: 'demo-worship', name: 'Sunrise Worship Center' });
    const second = await mount();
    expect(latest).toMatchObject({ ready: true, mode: 'guest', slug: 'demo-worship' });
    second.unmount();
  });

  it('does not open the chooser on /demo when a guest demo is running already', async () => {
    mockPrefs.demoGuest = { slug: 'demo-worship', name: 'Sunrise Worship Center' };
    mockInitialUrl.mockResolvedValue('https://app.weaverams.org/demo');
    await mount();
    expect(latest).toMatchObject({ mode: 'guest', chooser: null });
  });

  it('signs out a sign-in that was on the device first (only here), so the demo never runs under somebody’s own', async () => {
    mockGetSession.mockResolvedValue({ data: { session: realLogin } });
    await mount();
    await run(() => latest.enterGuest({ slug: 'demo-club', name: 'Lakeside Neighbors Club' }));
    expect(calls).toEqual(['signOut:local']);
    expect(latest.mode).toBe('guest');
  });

  it('forgets a saved guest choice when somebody has signed in for real since', async () => {
    mockPrefs.demoGuest = { slug: 'demo-worship', name: 'Sunrise Worship Center' };
    mockGetSession.mockResolvedValue({ data: { session: realLogin } });
    await mount();
    expect(latest.mode).toBe('off');
    expect(mockPrefs.demoGuest).toBeNull();
  });

  it('leaving a guest demo goes back to Find your community: no database call, no sign-out, nothing saved', async () => {
    await mount();
    await run(() => latest.enterGuest({ slug: 'demo-worship', name: 'Sunrise Worship Center' }));
    await run(() => latest.leave());
    expect(latest).toMatchObject({ mode: 'off', slug: null, chooser: null, notice: null });
    expect(calls).toEqual([]);
    expect(mockPrefs.demoGuest).toBeNull();
  });

  it('offers the people (step 2) from a guest demo, and Back returns to the guest look around', async () => {
    await mount();
    await run(() => latest.enterGuest({ slug: 'demo-worship', name: 'Sunrise Worship Center' }));
    await run(() => latest.openChooser());
    expect(latest).toMatchObject({ chooser: 'person', mode: 'guest' });
    await run(() => latest.closeChooser());
    expect(latest).toMatchObject({ chooser: null, mode: 'guest', slug: 'demo-worship' });
  });
});

describe('being someone in the demo', () => {
  it('signs in with the portal’s tokens, takes the community and the time from the database, and leaves guest mode', async () => {
    await mount();
    await run(() => latest.enterGuest({ slug: 'demo-worship', name: 'Sunrise Worship Center' }));
    await run(() => latest.openChooser());
    mockStart.mockResolvedValue(started);
    let result: unknown;
    await run(async () => {
      result = await latest.start('persona-1');
    });
    expect(mockStart).toHaveBeenCalledWith('persona-1');
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'acc', refresh_token: 'ref' });
    expect(result).toMatchObject({ ok: true });
    expect(latest).toMatchObject({ mode: 'person', active: true, guest: false, slug: 'demo-worship', chooser: null, starting: false, secondsLeft: 7200 });
    expect(latest.info).toMatchObject({ role: 'Teacher', name: 'Anita Bhandari', community: 'Sunrise Worship Center' });
    expect(mockPrefs.demoGuest).toBeNull();
    expect(mockPrefs.demo).toMatchObject({ slug: 'demo-worship', role: 'Teacher' });
  });

  it('opens the community the database names, even when the portal calls it something else', async () => {
    await mount();
    mockStart.mockResolvedValue({ ...started, demo: { ...started.demo, community: 'A different display name' } });
    mockCheck.mockResolvedValue(ok({ centerSlug: 'demo-club', centerName: 'Lakeside Neighbors Club' }));
    await run(() => latest.start('persona-9'));
    expect(latest.slug).toBe('demo-club');
  });

  it('says why in plain words, and changes nothing, when the portal refuses (the limit, switched off, busy)', async () => {
    await mount();
    await run(() => latest.enterGuest({ slug: 'demo-worship', name: 'Sunrise Worship Center' }));
    const message = "We couldn't start the demo — you have started a lot of demos in the last hour. Please wait a while, then try again.";
    mockStart.mockResolvedValue({ ok: false, code: 'ip_limit', message });
    let result: unknown;
    await run(async () => {
      result = await latest.start('persona-1');
    });
    expect(result).toEqual({ ok: false, code: 'ip_limit', message });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ mode: 'guest', starting: false });
  });

  it('signs the new session out again, and says so, when the sign-in or the check after it fails', async () => {
    await mount();
    mockStart.mockResolvedValue(started);
    mockSetSession.mockResolvedValueOnce({ error: new Error('bad token') });
    let first: unknown;
    await run(async () => {
      first = await latest.start('persona-1');
    });
    expect(first).toMatchObject({ ok: false, code: 'failed', message: expect.stringContaining("We couldn't start the demo") });
    expect(calls).toContain('signOut:local');
    expect(latest.mode).toBe('off');

    calls.length = 0;
    mockCheck.mockResolvedValueOnce({ state: 'unknown' });
    let second: unknown;
    await run(async () => {
      second = await latest.start('persona-1');
    });
    expect(second).toMatchObject({ ok: false, code: 'failed' });
    expect(calls).toEqual(['setSession', 'signOut:local']);
    expect(latest).toMatchObject({ mode: 'off', starting: false });
  });

  it('holds the community back while starting, so no other community flashes first', async () => {
    await mount();
    let finish!: (v: unknown) => void;
    mockStart.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    let pending!: Promise<unknown>;
    await run(() => {
      pending = latest.start('persona-1');
    });
    expect(latest.starting).toBe(true);
    await run(async () => {
      finish(started);
      await pending;
    });
    expect(latest.starting).toBe(false);
  });

  it('switching person ends the person before first, then signs in as the new one', async () => {
    await mount();
    mockStart.mockResolvedValue(started);
    await run(() => latest.start('persona-1'));
    calls.length = 0;
    mockStart.mockResolvedValue({ ...started, session: { access_token: 'acc2', refresh_token: 'ref2' } });
    mockCheck.mockResolvedValue(ok({ role: 'Treasurer', name: 'Meera Doshiwal' }));
    await run(() => latest.openChooser());
    expect(latest.chooser).toBe('person');
    await run(() => latest.start('persona-2'));
    expect(calls).toEqual(['leave', 'setSession']);
    expect(latest.info).toMatchObject({ role: 'Treasurer', name: 'Meera Doshiwal' });
    expect(latest.mode).toBe('person');
  });
});

describe('from a person back to a guest, or out of the demo', () => {
  async function asPerson() {
    await mount();
    mockStart.mockResolvedValue(started);
    await run(() => latest.start('persona-1'));
    calls.length = 0;
  }

  it('"Look around as a guest" tells the database, signs out here only (scope local), and keeps the same community as a guest', async () => {
    await asPerson();
    await run(() => latest.toGuest());
    expect(calls).toEqual(['leave', 'signOut:local']);
    expect(latest).toMatchObject({ mode: 'guest', guest: true, active: false, info: null, slug: 'demo-worship', chooser: null });
    expect(latest.guestCommunity).toEqual({ slug: 'demo-worship', name: 'Sunrise Worship Center' });
    expect(mockPrefs.demo).toBeNull();
    expect(mockPrefs.demoGuest).toEqual({ slug: 'demo-worship', name: 'Sunrise Worship Center' });
  });

  it('still goes back to guest mode when the database cannot be told (and says nothing false)', async () => {
    await asPerson();
    mockLeave.mockRejectedValueOnce(new Error('offline'));
    await run(() => latest.toGuest());
    expect(latest.mode).toBe('guest');
    expect(calls).toEqual(['signOut:local']);
  });

  it('"Leave the demo" tells the database, signs out here only, forgets the demo and goes back to Find your community', async () => {
    await asPerson();
    await run(() => latest.leave());
    expect(calls).toEqual(['leave', 'signOut:local']);
    expect(latest).toMatchObject({ mode: 'off', info: null, guest: false, slug: null, chooser: null, notice: null });
    expect(mockPrefs.demo).toBeNull();
    expect(mockPrefs.demoGuest).toBeNull();
  });

  it('never signs out everywhere: a demo person is shared, and a global sign-out would end other visitors’ demos', async () => {
    await asPerson();
    await run(() => latest.leave());
    expect(mockSignOut).toHaveBeenCalled();
    for (const call of mockSignOut.mock.calls) expect(call[0]).toEqual({ scope: 'local' });
  });
});

describe('the check of a running demo person', () => {
  async function asPerson(secondsLeft = 7200) {
    jest.useFakeTimers();
    await mount();
    mockStart.mockResolvedValue(started);
    mockCheck.mockResolvedValue(ok({ secondsLeft }));
    await run(() => latest.start('persona-1'));
    mockCheck.mockClear();
    calls.length = 0;
  }
  const minute = async (n = 1) => {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000 * n);
    });
  };

  it('asks the database every minute and shows the time left going down', async () => {
    await asPerson(7200);
    expect(latest.secondsLeft).toBe(7200);
    mockCheck.mockResolvedValue(ok({ secondsLeft: 7140 }));
    await minute();
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(latest.secondsLeft).toBe(7140);
    mockCheck.mockResolvedValue(ok({ secondsLeft: 7080 }));
    await minute();
    expect(mockCheck).toHaveBeenCalledTimes(2);
    expect(latest.secondsLeft).toBe(7080);
    expect(latest.mode).toBe('person');
  });

  it('asks again when the app comes back to the foreground', async () => {
    const spy = jest.spyOn(AppState, 'addEventListener');
    await asPerson();
    const handler = spy.mock.calls.at(-1)?.[1] as ((s: string) => void) | undefined;
    expect(handler).toBeDefined();
    await act(async () => {
      handler?.('background');
    });
    expect(mockCheck).not.toHaveBeenCalled();
    await act(async () => {
      handler?.('active');
    });
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['expired', 'ended'],
    ['unknown', 'ended'],
    ['off', 'off'],
  ])('when the database says %s the demo is over: signed out here, back to the chooser with a sentence (%s)', async (state, notice) => {
    await asPerson();
    mockCheck.mockResolvedValue({ state } as DemoState);
    await minute();
    expect(latest).toMatchObject({ mode: 'off', active: false, info: null, slug: null, chooser: 'community', notice });
    expect(calls).toEqual(['signOut:local']);
    expect(mockLeave).not.toHaveBeenCalled();
    expect(mockPrefs.demo).toBeNull();
  });

  it('keeps the demo going when a check cannot be answered, and ends it once the clock says the time is up', async () => {
    await asPerson(120);
    mockCheck.mockRejectedValue(new Error('offline'));
    await minute();
    expect(latest.mode).toBe('person');
    expect(latest.secondsLeft).toBe(60);
    // The two minutes are up, but the half minute of grace after them is not.
    await minute();
    expect(latest.mode).toBe('person');
    expect(latest.secondsLeft).toBe(0);
    await minute();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', notice: 'ended' });
  });

  it('ends the demo when the sign-in can no longer be refreshed (Supabase signs the login out)', async () => {
    await asPerson();
    expect(authListener).not.toBeNull();
    await act(async () => {
      authListener?.('SIGNED_OUT', null);
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', notice: 'ended' });
  });

  it('does not end a guest look around when a sign-in goes away (there is none to lose)', async () => {
    jest.useFakeTimers();
    await mount();
    await run(() => latest.enterGuest({ slug: 'demo-worship', name: 'Sunrise Worship Center' }));
    await act(async () => {
      authListener?.('SIGNED_OUT', null);
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(latest.mode).toBe('guest');
    await minute(2);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('does not check a guest look around with the database (no session to check)', async () => {
    jest.useFakeTimers();
    await mount();
    await run(() => latest.enterGuest({ slug: 'demo-worship', name: 'Sunrise Worship Center' }));
    await minute(3);
    expect(mockCheck).not.toHaveBeenCalled();
  });
});

describe('a page reload or app restart during a demo person', () => {
  it('keeps the demo when the database confirms the saved demo sign-in, and takes the time from it', async () => {
    mockGetSession.mockResolvedValue({ data: { session: demoLogin } });
    mockCheck.mockResolvedValue(ok({ secondsLeft: 3000 }));
    await mount();
    expect(latest).toMatchObject({ ready: true, mode: 'person', slug: 'demo-worship', secondsLeft: 3000, chooser: null });
  });

  it('knows a demo sign-in marked in app_metadata too', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'x@example.org', app_metadata: { demo: true } } } } });
    await mount();
    expect(latest.mode).toBe('person');
  });

  it('ends it with a sentence when the database says it is over (the chooser, signed out here)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: demoLogin } });
    mockCheck.mockResolvedValue({ state: 'expired' });
    await mount();
    expect(latest).toMatchObject({ ready: true, mode: 'off', chooser: 'community', notice: 'ended' });
    expect(calls).toEqual(['signOut:local']);
  });

  it('says it was switched off when it was', async () => {
    mockGetSession.mockResolvedValue({ data: { session: demoLogin } });
    mockCheck.mockResolvedValue({ state: 'off' });
    await mount();
    expect(latest).toMatchObject({ mode: 'off', notice: 'off' });
  });

  it('carries on with what is saved when the database cannot be reached and the time is not up', async () => {
    mockGetSession.mockResolvedValue({ data: { session: demoLogin } });
    mockPrefs.demo = { role: 'Teacher', name: 'Anita', community: 'Sunrise Worship Center', slug: 'demo-worship', deadline: Date.now() + 3_600_000 };
    mockCheck.mockRejectedValue(new Error('offline'));
    await mount();
    expect(latest).toMatchObject({ mode: 'person', slug: 'demo-worship' });
  });

  it('ends it when the database cannot be reached and nothing saved says it is still running', async () => {
    mockGetSession.mockResolvedValue({ data: { session: demoLogin } });
    mockCheck.mockRejectedValue(new Error('offline'));
    await mount();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', notice: 'ended' });
    expect(calls).toEqual(['signOut:local']);
  });

  it('forgets a saved demo that is no longer a demo sign-in (signed out some other way)', async () => {
    mockPrefs.demo = { role: 'Teacher', name: 'Anita', community: 'S', slug: 'demo-worship', deadline: Date.now() + 1000 };
    await mount();
    expect(latest.mode).toBe('off');
    expect(mockPrefs.demo).toBeNull();
  });
});

describe('a build with no demo address', () => {
  it('offers no demo and does not open the chooser on /demo', async () => {
    mockEnv.demoUrl = '';
    mockInitialUrl.mockResolvedValue('https://app.weaverams.org/demo');
    await mount();
    expect(latest).toMatchObject({ available: false, chooser: null, mode: 'off' });
  });

  it('does not act on a demo link either', async () => {
    mockEnv.demoUrl = '';
    mockInitialUrl.mockResolvedValue('https://app.weaverams.org/demo?persona=f-adult');
    await mount();
    expect(mockStart).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ mode: 'off', starting: false, chooser: null, startError: null });
  });
});

const limitSentence = 'Could not start the demo — you have started a lot of demos in the last hour. Please wait a while, then try again.';

describe('one tap: Start as a community member (no guest step, no list)', () => {
  it('starts the family person straight from "Try the demo": a signed-in person, the same state as choosing them in the list', async () => {
    await mount();
    await run(() => latest.openChooser());
    expect(latest.chooser).toBe('community');
    mockStart.mockResolvedValue({ ...started, demo: { ...started.demo, role: 'Community member · Adult', name: 'Tarun Patni' } });
    mockCheck.mockResolvedValue(familyOk());
    await run(() => latest.start('f-adult'));
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith('f-adult');
    expect(latest).toMatchObject({ mode: 'person', active: true, guest: false, slug: 'demo-worship', chooser: null, starting: false, startError: null, secondsLeft: 7200 });
    expect(latest.info).toMatchObject({ role: 'Primary adult', name: 'Tarun Patni', community: 'Sunrise Worship Center' });
    // Never passed through the guest look around.
    expect(latest.guestCommunity).toBeNull();
    expect(mockPrefs.demoGuest ?? null).toBeNull();
    expect(mockPrefs.demo).toMatchObject({ slug: 'demo-worship', role: 'Primary adult' });
    expect(calls).toEqual(['setSession']);
  });

  it('says why in plain words, keeps the chooser, and offers Try again when the portal is at its limit', async () => {
    await mount();
    await run(() => latest.openChooser());
    mockStart.mockResolvedValue({ ok: false, code: 'limit', message: limitSentence });
    await run(() => latest.start('f-adult'));
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', starting: false, startError: limitSentence, canRetry: true });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('Try again repeats the same start, and the error goes away once it works', async () => {
    await mount();
    await run(() => latest.openChooser());
    mockStart.mockResolvedValueOnce({ ok: false, code: 'limit', message: limitSentence });
    await run(() => latest.start('f-adult'));
    mockStart.mockResolvedValue(started);
    mockCheck.mockResolvedValue(familyOk());
    await run(() => latest.retryStart());
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockStart).toHaveBeenLastCalledWith('f-adult');
    expect(latest).toMatchObject({ mode: 'person', startError: null, chooser: null });
  });

  it('says it could not keep the session, in plain words, when the sign-in fails after the portal said yes', async () => {
    await mount();
    mockStart.mockResolvedValue(started);
    mockSetSession.mockResolvedValueOnce({ error: new Error('bad token') });
    await run(() => latest.start('f-adult'));
    expect(latest).toMatchObject({ mode: 'off', starting: false, canRetry: true });
    expect(latest.startError).toContain("We couldn't start the demo");
  });

  it('Choose someone else: the people of that community with no demo running, and Back returns to the communities, then out', async () => {
    await mount();
    await run(() => latest.openChooser());
    await run(() => latest.openPeople('demo-club'));
    expect(latest).toMatchObject({ chooser: 'person', mode: 'off', peopleOf: 'demo-club', slug: null });
    await run(() => latest.closeChooser());
    expect(latest).toMatchObject({ chooser: 'community', peopleOf: null });
    await run(() => latest.closeChooser());
    expect(latest.chooser).toBeNull();
  });

  it('Look around as a guest still works from the same place', async () => {
    await mount();
    await run(() => latest.openChooser());
    await run(() => latest.enterGuest({ slug: 'demo-club', name: 'Lakeside Neighbors Club' }));
    expect(latest).toMatchObject({ mode: 'guest', slug: 'demo-club', chooser: null });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('a failure shown in the people list goes away when the list is closed or another demo starts', async () => {
    await mount();
    await run(() => latest.openChooser());
    mockStart.mockResolvedValue({ ok: false, code: 'off', message: 'Could not start the demo — the demo is switched off right now. Please try again later.' });
    await run(() => latest.start('f-adult'));
    expect(latest.startError).toContain('switched off');
    await run(() => latest.openPeople('demo-worship'));
    expect(latest.startError).toBeNull();
  });
});

describe('demo links that start straight away', () => {
  const link = (query: string, base = 'https://app.weaverams.org/demo') => mockInitialUrl.mockResolvedValue(`${base}${query}`);
  const asFamily = () => {
    mockStart.mockResolvedValue({ ...started, demo: { ...started.demo, role: 'Community member · Adult', name: 'Tarun Patni' } });
    mockCheck.mockResolvedValue(familyOk());
  };

  it('?as=family starts the community-area person of the first demo community and lands signed in, with no chooser', async () => {
    asFamily();
    link('?as=family');
    await mount();
    expect(mockChoices).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith('f-adult');
    expect(latest).toMatchObject({ ready: true, mode: 'person', active: true, guest: false, slug: 'demo-worship', chooser: null, starting: false, startError: null });
    expect(latest.info).toMatchObject({ role: 'Primary adult', name: 'Tarun Patni' });
  });

  it('?as=family&community=<web name> picks that community', async () => {
    asFamily();
    mockCheck.mockResolvedValue(familyOk({ centerSlug: 'demo-club', centerName: 'Lakeside Neighbors Club', name: 'Kwame Osei' }));
    link('?as=family&community=demo-club');
    await mount();
    expect(mockStart).toHaveBeenCalledWith('n-adult');
    expect(latest).toMatchObject({ mode: 'person', slug: 'demo-club' });
  });

  it('works for connect://demo?as=family too', async () => {
    asFamily();
    link('?as=family', 'connect://demo');
    await mount();
    expect(mockStart).toHaveBeenCalledWith('f-adult');
    expect(latest.mode).toBe('person');
  });

  it('?persona=<id> starts exactly that person, without reading the list', async () => {
    mockStart.mockResolvedValue(started);
    link('?persona=f-teacher');
    await mount();
    expect(mockChoices).not.toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledWith('f-teacher');
    expect(latest).toMatchObject({ mode: 'person', chooser: null, starting: false, slug: 'demo-worship' });
    expect(latest.info).toMatchObject({ role: 'Teacher', name: 'Anita Bhandari' });
  });

  it('holds the community back while it starts (ready and starting, no chooser, nothing else flashes)', async () => {
    let finish!: (v: unknown) => void;
    mockStart.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    link('?persona=f-teacher');
    await mount();
    expect(latest).toMatchObject({ ready: true, starting: true, chooser: null, mode: 'off', slug: null });
    await run(async () => {
      finish(started);
    });
    expect(latest).toMatchObject({ starting: false, mode: 'person' });
  });

  it('an id the portal does not know falls back to the chooser with the portal’s sentence, and no Try again', async () => {
    const sentence = 'Could not start the demo — that person is not on the list. Please choose someone from the list.';
    mockStart.mockResolvedValue({ ok: false, code: 'unknown_person', message: sentence });
    link('?persona=00000000-0000-4000-8000-000000000000');
    await mount();
    expect(latest).toMatchObject({ ready: true, mode: 'off', chooser: 'community', starting: false, startError: sentence, canRetry: false });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('an id that cannot be an id never reaches the portal: the chooser says that person is not available', async () => {
    link('?persona=%3Cscript%3E');
    await mount();
    expect(mockStart).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', startError: "We couldn't start the demo — that person is not available. Choose someone else.", canRetry: false });
  });

  it('a community that is not on the list falls back to the chooser, without starting anyone', async () => {
    link('?as=family&community=nowhere');
    await mount();
    expect(mockStart).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', canRetry: false });
    expect(latest.startError).toContain('that demo community is not available');
  });

  it('a community with no family to start as says so', async () => {
    mockChoices.mockResolvedValue({ ...choices(), communities: choices().communities.map((c) => ({ ...c, people: c.people.filter((p) => p.area !== 'community') })) });
    link('?as=family');
    await mount();
    expect(mockStart).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community' });
    expect(latest.startError).toContain('no family to start as');
  });

  it('shows the limit, Try again, and recovers: the chooser comes back and Try again repeats the link’s start', async () => {
    mockStart.mockResolvedValueOnce({ ok: false, code: 'limit', message: limitSentence });
    link('?as=family');
    await mount();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', startError: limitSentence, canRetry: true });
    mockStart.mockResolvedValue(started);
    mockCheck.mockResolvedValue(familyOk());
    await run(() => latest.retryStart());
    // Try again repeats ?as=family: it reads the list again and starts the same person.
    expect(mockChoices).toHaveBeenCalledTimes(2);
    expect(mockStart).toHaveBeenLastCalledWith('f-adult');
    expect(latest).toMatchObject({ mode: 'person', chooser: null, startError: null });
  });

  it('says so when the demo is switched off (the portal’s own sentence)', async () => {
    mockStart.mockResolvedValue({ ok: false, code: 'off', message: 'Could not start the demo — the demo is switched off right now. Please try again later.' });
    link('?persona=f-teacher');
    await mount();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', canRetry: true });
    expect(latest.startError).toContain('switched off');
  });

  it('says so when the list cannot be read for ?as=family, in plain words with Try again', async () => {
    mockChoices.mockRejectedValue(new AppError("We couldn't load the demo. Check your internet connection and try again.", 'offline'));
    link('?as=family');
    await mount();
    expect(mockStart).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', startError: "We couldn't load the demo. Check your internet connection and try again.", canRetry: true });
  });

  it('says the demo is switched off from the list when ?as=family is used then', async () => {
    mockChoices.mockResolvedValue({ enabled: false, communities: [], message: 'The demo is switched off right now. Please try again later.' });
    link('?as=family');
    await mount();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', startError: 'The demo is switched off right now. Please try again later.' });
  });

  it('a plain /demo (or another kind of start) still just opens the chooser and starts nobody', async () => {
    link('?as=teacher');
    await mount();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockChoices).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', startError: null, starting: false });
  });

  it('keeps the notice of a demo that ended, next to the link’s own failure', async () => {
    mockGetSession.mockResolvedValue({ data: { session: demoLogin } });
    mockCheck.mockResolvedValue({ state: 'expired' });
    mockStart.mockResolvedValue({ ok: false, code: 'limit', message: limitSentence });
    link('?persona=f-teacher');
    await mount();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', notice: 'ended', startError: limitSentence });
  });

  it('does not start over a real sign-in: the chooser opens and nothing is signed out', async () => {
    mockGetSession.mockResolvedValue({ data: { session: realLogin } });
    link('?as=family');
    await mount();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockChoices).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ mode: 'off', chooser: 'community', starting: false, startError: null });
  });

  it('replaces a demo that was running (a reload with a link in the address): the person before ends first', async () => {
    mockGetSession.mockResolvedValue({ data: { session: demoLogin } });
    mockCheck.mockResolvedValue(ok());
    mockStart.mockResolvedValue({ ...started, session: { access_token: 'acc2', refresh_token: 'ref2' } });
    link('?persona=f-adult');
    await mount();
    expect(calls).toEqual(['leave', 'setSession']);
    expect(latest).toMatchObject({ mode: 'person', chooser: null, starting: false });
  });

  it('does not start again on a reload once the address is clean (the saved demo is kept instead)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: demoLogin } });
    mockCheck.mockResolvedValue(familyOk({ secondsLeft: 3000 }));
    link('');
    await mount();
    expect(mockStart).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ mode: 'person', secondsLeft: 3000, chooser: null });
  });

  describe('the address bar (web)', () => {
    const where = globalThis as unknown as { history?: unknown; location?: unknown };
    const before = { history: where.history, location: where.location };
    const replaceState = jest.fn<(state: unknown, unused: string, url: string) => void>();
    beforeEach(() => {
      replaceState.mockReset();
      where.history = { state: null, replaceState };
    });
    afterEach(() => {
      where.history = before.history;
      where.location = before.location;
    });

    it('is cleaned to / after the demo started, so no id stays in the address or the history', async () => {
      where.location = { search: '?persona=f-teacher' };
      mockStart.mockResolvedValue(started);
      link('?persona=f-teacher');
      await mount();
      expect(replaceState).toHaveBeenCalledTimes(1);
      expect(replaceState).toHaveBeenCalledWith(null, '', '/');
    });

    it('is cleaned to /demo (the chooser) when the start failed', async () => {
      where.location = { search: '?persona=f-teacher' };
      mockStart.mockResolvedValue({ ok: false, code: 'failed', message: "We couldn't start the demo — something went wrong. Please try again." });
      link('?persona=f-teacher');
      await mount();
      expect(replaceState).toHaveBeenCalledWith(null, '', '/demo');
    });

    it('is cleaned when a real sign-in kept the link from starting anything', async () => {
      where.location = { search: '?as=family' };
      mockGetSession.mockResolvedValue({ data: { session: realLogin } });
      link('?as=family');
      await mount();
      expect(replaceState).toHaveBeenCalledWith(null, '', '/demo');
    });

    it('is left alone by a plain /demo visit', async () => {
      where.location = { search: '' };
      link('');
      await mount();
      expect(replaceState).not.toHaveBeenCalled();
    });
  });

  describe('a link that arrives while the app is open (connect://demo?...)', () => {
    it('starts the family person', async () => {
      await mount();
      expect(urlListener).not.toBeNull();
      asFamily();
      await run(() => urlListener?.({ url: 'connect://demo?as=family' }));
      expect(mockStart).toHaveBeenCalledWith('f-adult');
      expect(latest).toMatchObject({ mode: 'person', chooser: null });
    });

    it('starts the exact person', async () => {
      await mount();
      mockStart.mockResolvedValue(started);
      await run(() => urlListener?.({ url: 'connect://demo?persona=f-teacher' }));
      expect(mockStart).toHaveBeenCalledWith('f-teacher');
      expect(latest.mode).toBe('person');
    });

    it('ignores any other link, and a demo link in a build with no demo', async () => {
      await mount();
      await run(() => urlListener?.({ url: 'connect://events/12?as=family' }));
      await run(() => urlListener?.({ url: 'connect://demo' }));
      expect(mockStart).not.toHaveBeenCalled();
      expect(latest.mode).toBe('off');
      mockEnv.demoUrl = '';
      await run(() => urlListener?.({ url: 'connect://demo?persona=f-teacher' }));
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('opens the chooser, with its warning, instead of signing a real sign-in out', async () => {
      mockGetSession.mockResolvedValue({ data: { session: realLogin } });
      await mount();
      await run(() => urlListener?.({ url: 'connect://demo?as=family' }));
      expect(mockStart).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(latest).toMatchObject({ chooser: 'community', mode: 'off' });
    });

    it('does not start a second demo while one is starting', async () => {
      await mount();
      let finish!: (v: unknown) => void;
      mockStart.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      await run(() => urlListener?.({ url: 'connect://demo?persona=f-teacher' }));
      expect(latest.starting).toBe(true);
      await run(() => urlListener?.({ url: 'connect://demo?persona=f-adult' }));
      expect(mockStart).toHaveBeenCalledTimes(1);
      await run(async () => {
        finish(started);
      });
      expect(latest.mode).toBe('person');
    });
  });
});
