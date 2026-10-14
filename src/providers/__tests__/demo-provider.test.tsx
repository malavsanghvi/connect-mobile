import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import type { DemoState } from '@/lib/demo';

import { DemoProvider, useDemo, type DemoContextValue } from '../demo';

// ── The outside world: the portal calls, the database checks, the sign-in client and the device storage ──────────────────
const mockCheck = jest.fn<() => Promise<DemoState>>();
const mockLeave = jest.fn<() => Promise<void>>();
const mockStart = jest.fn<(persona: string) => Promise<unknown>>();
const mockGetSession = jest.fn<() => Promise<{ data: { session: unknown } }>>();
const mockSetSession = jest.fn<(tokens: { access_token: string; refresh_token: string }) => Promise<{ error: unknown }>>();
const mockSignOut = jest.fn<(opts?: { scope: string }) => Promise<{ error: unknown }>>();
const mockInitialUrl = jest.fn<() => Promise<string | null>>();
let authListener: ((event: string, session: unknown) => void) | null = null;
const mockPrefs: Record<string, unknown> = {};
const calls: string[] = [];

jest.mock('@/lib/api/demo', () => ({
  checkDemoState: () => mockCheck(),
  leaveDemo: () => mockLeave(),
  startDemo: (persona: string) => mockStart(persona),
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
jest.mock('expo-linking', () => ({ getInitialURL: () => mockInitialUrl() }));

const demoLogin = { user: { email: 'anita@demo.weaverams.org' } };
const realLogin = { user: { email: 'member@example.org' } };
const ok = (over: Record<string, unknown> = {}): DemoState =>
  ({ state: 'ok', secondsLeft: 7200, endsAt: null, role: 'Teacher', name: 'Anita Bhandari', centerName: 'Sunrise Worship Center', centerSlug: 'demo-worship', ...over }) as DemoState;
const started = { ok: true, session: { access_token: 'acc', refresh_token: 'ref' }, demo: { endsAt: '', role: 'Teacher', name: 'Anita Bhandari', community: 'Sunrise Worship Center' } };

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
  for (const m of [mockCheck, mockLeave, mockStart, mockGetSession, mockSetSession, mockSignOut, mockInitialUrl]) m.mockReset();
  for (const k of Object.keys(mockPrefs)) delete mockPrefs[k];
  calls.length = 0;
  authListener = null;
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
});
