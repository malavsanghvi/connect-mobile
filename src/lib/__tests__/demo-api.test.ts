import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { checkDemoState, leaveDemo, loadDemoChoices, refuseMessageInDemo, startDemo } from '../api/demo';
import { AppError } from '../errors';

const mockRpc = jest.fn<(name: string) => Promise<{ data: unknown; error: unknown }>>();
const mockGetSession = jest.fn<() => Promise<{ data: { session: { user: { email: string } } | null } }>>();

jest.mock('../supabase', () => ({
  supabase: { rpc: (name: string) => mockRpc(name), auth: { getSession: () => mockGetSession() } },
}));
jest.mock('../env', () => ({ env: { demoUrl: 'https://admin.example' } }));

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };
const mockFetch = jest.fn<(url: string, init?: FetchInit) => Promise<Response>>();

function answer(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}

let logSpy: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  mockRpc.mockReset();
  mockGetSession.mockReset();
  mockFetch.mockReset();
  (globalThis as { fetch?: unknown }).fetch = mockFetch;
  logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  logSpy.mockRestore();
});

const choicesBody = {
  ok: true,
  enabled: true,
  communities: [{ kind: 'faith', id: 'c1', slug: 'demo-worship', name: 'Sunrise Worship Center', people: [{ id: 'p1', role: 'Teacher', name: 'Anita', story: 'Teaches.', area: 'operations' }] }],
};

describe('loadDemoChoices (GET /api/demo/choices)', () => {
  it('asks the portal at the configured address with a plain GET (no sign-in, no custom header)', async () => {
    mockFetch.mockResolvedValueOnce(answer(200, choicesBody));
    const choices = await loadDemoChoices();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://admin.example/api/demo/choices');
    expect(init?.method).toBe('GET');
    expect(init?.headers).toBeUndefined();
    expect(choices.enabled).toBe(true);
    expect(choices.communities[0]).toMatchObject({ slug: 'demo-worship', name: 'Sunrise Worship Center' });
  });

  it("reads a switched-off demo as a normal answer, with the portal's message", async () => {
    mockFetch.mockResolvedValueOnce(answer(200, { ok: true, enabled: false, communities: [], message: 'The demo is switched off right now. Please try again later.' }));
    await expect(loadDemoChoices()).resolves.toEqual({ enabled: false, communities: [], message: 'The demo is switched off right now. Please try again later.' });
  });

  it("shows the portal's own sentence when the list cannot be loaded (503)", async () => {
    const sentence = 'Could not load the demo — the list of demo people could not be loaded. Please try again in a minute.';
    mockFetch.mockResolvedValueOnce(answer(503, { ok: false, error: sentence, code: 'failed' }));
    await expect(loadDemoChoices()).rejects.toMatchObject({ userMessage: sentence });
  });

  it('says it could not reach the portal, in plain words, when nothing answers', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await loadDemoChoices().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toContain('Check your internet connection');
    expect((err as AppError).detail).toContain('Failed to fetch');
  });

  it('says the answer was not what it expected for a server error or a body it cannot read', async () => {
    mockFetch.mockResolvedValueOnce(answer(502, { error: 'bad gateway' }));
    await expect(loadDemoChoices()).rejects.toMatchObject({ userMessage: expect.stringContaining('not what we expected') });
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true, json: async () => Promise.reject(new Error('not json')) } as unknown as Response);
    await expect(loadDemoChoices()).rejects.toMatchObject({ userMessage: expect.stringContaining('not what we expected') });
  });
});

describe('startDemo (POST /api/demo/session)', () => {
  const ok = {
    ok: true,
    session: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600, expires_at: 1_800_000_000, token_type: 'bearer' },
    demo: { ends_at: '2026-10-14T14:00:00Z', role: 'Teacher', name: 'Anita Bhandari', community: 'Sunrise Worship Center' },
  };

  it('posts the person as JSON and returns the tokens and the demo details', async () => {
    mockFetch.mockResolvedValueOnce(answer(200, ok));
    const res = await startDemo('persona-1');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://admin.example/api/demo/session');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init?.body ?? '{}')).toEqual({ persona: 'persona-1' });
    expect(res).toEqual({
      ok: true,
      session: { access_token: 'acc', refresh_token: 'ref' },
      demo: { endsAt: '2026-10-14T14:00:00Z', role: 'Teacher', name: 'Anita Bhandari', community: 'Sunrise Worship Center' },
    });
  });

  it.each([
    [429, 'limit', 'Could not start the demo — you have started a lot of demos in the last hour. Please wait a while, then try again.'],
    [503, 'off', 'Could not start the demo — the demo is switched off right now. Please try again later.'],
    [404, 'unknown_person', 'Could not start the demo — that demo person is not available. Choose another one.'],
    [500, 'failed', 'Could not start the demo — the demo sign-in did not work. Please try again in a minute.'],
  ])("shows the portal's own sentence as it is for %s %s", async (status, code, sentence) => {
    mockFetch.mockResolvedValueOnce(answer(status, { ok: false, error: sentence, code }));
    const res = await startDemo('persona-1');
    expect(res).toEqual({ ok: false, code, message: sentence });
  });

  it.each([
    ['limit', 'you have started a lot of demos in the last hour'],
    ['off', 'switched off'],
    ['unknown_person', 'Choose someone else'],
    ['failed', 'something went wrong'],
  ])("says it in the app's own words when the portal sent a code but no sentence (%s)", async (code, words) => {
    mockFetch.mockResolvedValueOnce(answer(400, { ok: false, code }));
    const res = await startDemo('persona-1');
    expect(res).toMatchObject({ ok: false, code });
    if (!res.ok) {
      expect(res.message).toContain(words);
      expect(res.message).toMatch(/^We couldn't start the demo — /);
    }
  });

  it('reads the code names of an earlier draft of the contract too', async () => {
    mockFetch.mockResolvedValueOnce(answer(400, { ok: false, code: 'ip_limit' }));
    expect(await startDemo('persona-1')).toMatchObject({ ok: false, code: 'limit' });
  });

  it('treats a bare 429 as the limit', async () => {
    mockFetch.mockResolvedValueOnce(answer(429, { ok: false, error: 'Could not start the demo — slow down.' }));
    const res = await startDemo('persona-1');
    expect(res).toMatchObject({ ok: false, code: 'limit', message: 'Could not start the demo — slow down.' });
  });

  it('says it could not reach the portal when nothing answers', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    const res = await startDemo('persona-1');
    expect(res).toMatchObject({ ok: false, code: 'network' });
    if (!res.ok) expect(res.message).toContain('Check your internet connection');
  });

  it('does not take an ok without tokens, or a body that is not JSON, for a start', async () => {
    mockFetch.mockResolvedValueOnce(answer(200, { ok: true, session: { access_token: 'acc' } }));
    expect(await startDemo('persona-1')).toMatchObject({ ok: false, code: 'unreadable' });
    mockFetch.mockResolvedValueOnce(answer(200, null));
    expect(await startDemo('persona-1')).toMatchObject({ ok: false, code: 'unreadable' });
    mockFetch.mockResolvedValueOnce(answer(503, null));
    expect(await startDemo('persona-1')).toMatchObject({ ok: false, code: 'failed' });
  });

  it('logs the technical detail and never shows it', async () => {
    mockFetch.mockResolvedValueOnce(answer(400, { ok: false, error: 'Could not start the demo — nope', code: 'off' }));
    const res = await startDemo('persona-1');
    expect(logSpy).toHaveBeenCalled();
    if (!res.ok) expect(res.message).not.toContain('session 400');
  });

  it('shows a very long error as the apps own words instead', async () => {
    mockFetch.mockResolvedValueOnce(answer(500, { ok: false, error: 'x'.repeat(2000), code: 'failed' }));
    const res = await startDemo('persona-1');
    if (!res.ok) expect(res.message).toBe("We couldn't start the demo — something went wrong. Please try again.");
  });
});

describe('checkDemoState (app.demo_session_state)', () => {
  it('asks the database as the signed-in demo person and reads the answer', async () => {
    mockRpc.mockResolvedValueOnce({ data: { state: 'ok', seconds_left: 5400, role: 'Teacher', name: 'Anita', center_name: 'Sunrise', center_slug: 'demo-worship' }, error: null });
    const state = await checkDemoState();
    expect(mockRpc).toHaveBeenCalledWith('demo_session_state');
    expect(state).toMatchObject({ state: 'ok', secondsLeft: 5400, centerSlug: 'demo-worship' });
  });

  it.each(['expired', 'off', 'unknown', 'not_demo'])('returns %s as a verdict, not an error', async (s) => {
    mockRpc.mockResolvedValueOnce({ data: { state: s }, error: null });
    await expect(checkDemoState()).resolves.toEqual({ state: s });
  });

  it('throws a plain error (no verdict) when the question could not be answered', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch', name: 'TypeError' } });
    await expect(checkDemoState()).rejects.toBeInstanceOf(AppError);
    mockRpc.mockResolvedValueOnce({ data: { state: 'maybe' }, error: null });
    await expect(checkDemoState()).rejects.toMatchObject({ userMessage: expect.stringContaining('not what we expected') });
  });
});

describe('leaveDemo (app.demo_leave)', () => {
  it('tells the database the demo person is leaving', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await leaveDemo();
    expect(mockRpc).toHaveBeenCalledWith('demo_leave');
  });
  it('throws a plain error when it could not be told (the caller still signs out here)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await expect(leaveDemo()).rejects.toBeInstanceOf(AppError);
  });
});

describe('refuseMessageInDemo (the last lock under every message to a team)', () => {
  it('refuses for a demo login, whatever screen asked', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { email: 'anita@demo.weaverams.org' } } } });
    await expect(refuseMessageInDemo()).rejects.toMatchObject({ userMessage: 'Messages are turned off in the demo. Nothing was sent.' });
  });
  it('lets a real member and a guest through', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { email: 'member@example.org' } } } });
    await expect(refuseMessageInDemo()).resolves.toBeUndefined();
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(refuseMessageInDemo()).resolves.toBeUndefined();
  });
});
