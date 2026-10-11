import { afterEach, describe, expect, it } from '@jest/globals';

import {
  BATCH_SIZE,
  QUEUE_CAP,
  SESSION_IDLE_MS,
  UNAVAILABLE_PAUSE_MS,
  advanceSession,
  classifyFailure,
  cleanKey,
  createActivityLogger,
  errorCodeOf,
  installActivityLogger,
  parsePersisted,
  retryDelay,
  track,
  trackAction,
  trackFlow,
  type ActivityEvent,
} from '../activity';
import { AppError } from '../errors';

const ME = { userId: 'user-1', centerId: 'center-1' };
const SOMEONE_ELSE = { userId: 'user-2', centerId: 'center-1' };
const NETWORK_DOWN = { error: { code: '', status: 0 } };
const OK = { error: null };

const made: ReturnType<typeof createActivityLogger>[] = [];

function harness(shared?: { store: { value: unknown }; clock: { now: number } }) {
  const store = shared?.store ?? { value: null as unknown };
  const clock = shared?.clock ?? { now: Date.UTC(2026, 9, 10, 12, 0, 0) };
  const sent: { centerId: string; events: ActivityEvent[] }[] = [];
  const optOutCalls: boolean[] = [];
  const answers = { send: OK as { error: unknown }, optOut: OK as { error: unknown }, sendThrows: false };
  const logger = createActivityLogger({
    now: () => clock.now,
    newId: (() => {
      let n = 0;
      return () => `session-${(n += 1)}`;
    })(),
    load: async () => store.value,
    save: async (state) => {
      store.value = JSON.parse(JSON.stringify(state));
    },
    send: async (centerId, events) => {
      sent.push({ centerId, events: JSON.parse(JSON.stringify(events)) as ActivityEvent[] });
      if (answers.sendThrows) throw new Error('boom');
      return answers.send;
    },
    sendOptOut: async (out) => {
      optOutCalls.push(out);
      return answers.optOut;
    },
    appVersion: '1.17.0',
    platform: 'ios',
  });
  made.push(logger);
  return { logger, store, clock, sent, optOutCalls, answers, advance: (ms: number) => (clock.now += ms) };
}

afterEach(async () => {
  installActivityLogger(null);
  // Clears the logger's save timers.
  await Promise.all(made.splice(0).map((l) => l.persistNow()));
});

describe('a guest or a signed-out phone records nothing', () => {
  it('keeps nothing and sends nothing without a sign-in and a community', async () => {
    const h = harness();
    h.logger.track('rsvp_started', { entityKind: 'event' });
    expect(h.logger.beginScreen('screen:/events')).toBeNull();
    await h.logger.flush({ force: true });
    expect(h.logger.pending()).toBe(0);
    expect(h.sent).toEqual([]);
  });

  it('stops recording when the context goes away, and forgets what waited when it is reset (sign-out, under 18)', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.logger.track('rsvp_started');
    expect(h.logger.pending()).toBe(1);
    h.logger.setContext(null);
    h.logger.track('rsvp_started');
    expect(h.logger.pending()).toBe(1);
    await h.logger.flush({ force: true });
    expect(h.sent).toEqual([]);
    h.logger.reset();
    expect(h.logger.pending()).toBe(0);
    h.logger.setContext(ME);
    expect(h.logger.pending()).toBe(0);
    await h.logger.persistNow();
    expect(parsePersisted(h.store.value).queue).toEqual([]);
  });

  it('never sends one person\'s events as another person', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.logger.track('rsvp_started');
    h.logger.setContext(SOMEONE_ELSE);
    expect(h.logger.pending()).toBe(0);
    await h.logger.flush({ force: true });
    expect(h.sent).toEqual([]);
  });
});

describe('what an event carries', () => {
  it('has only the fixed fields, with the sign-in kept out of it', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.logger.track('rsvp_completed', { entityKind: 'event', outcome: 'error', errorCode: 'P0001', durationMs: 1234 });
    await h.logger.flush();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].centerId).toBe('center-1');
    expect(h.sent[0].events).toEqual([
      {
        key: 'rsvp_completed',
        kind: 'action',
        entity_kind: 'event',
        outcome: 'error',
        error_code: 'P0001',
        duration_ms: 1234,
        via: 'app',
        seq: 1,
        session_id: 'session-1',
        app_version: '1.17.0',
        platform: 'ios',
        at: new Date(h.clock.now).toISOString(),
      },
    ]);
    const body = JSON.stringify(h.sent);
    expect(body).not.toContain('user-1');
    expect(body).not.toContain('open');
  });

  it('defaults to ok and leaves the optional fields out', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.logger.track('account_linked');
    await h.logger.flush();
    const e = h.sent[0].events[0];
    expect(e.outcome).toBe('ok');
    expect(Object.keys(e).sort()).toEqual(['app_version', 'at', 'key', 'kind', 'outcome', 'platform', 'seq', 'session_id', 'via']);
  });

  it('refuses free text, ids and anything that is not a key from the fixed shape', () => {
    const h = harness();
    h.logger.setContext(ME);
    for (const key of ['Alice paid $50', 'rsvp started', 'Rsvp_Started', '', 'screen:/event/8f0c1a2e-1111-4b6a-9d7e-3f2a6b5c4d3e', 'screen:/event/123', 'screen:/x?y=1', 'a'.repeat(100)]) {
      h.logger.track(key);
      expect(h.logger.beginScreen(key)).toBeNull();
    }
    h.logger.track(undefined as unknown as string);
    h.logger.track({ key: 'x' } as unknown as string);
    expect(h.logger.pending()).toBe(0);
    expect(cleanKey('giving.record_payment')).toBe('giving.record_payment');
    expect(cleanKey('screen:/event/[id]')).toBe('screen:/event/[id]');
  });

  it('drops an entity kind, error code or duration that is not safe, instead of sending it', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.logger.track('pledge_placed', { entityKind: 'Alice Shah', errorCode: 'We could not place your pledge of $501', durationMs: -5 });
    h.logger.track('pledge_placed', { durationMs: 99 * 60 * 60_000 });
    await h.logger.flush();
    const [a, b] = h.sent[0].events;
    expect(a.entity_kind).toBeUndefined();
    expect(a.error_code).toBeUndefined();
    expect(a.duration_ms).toBeUndefined();
    expect(b.duration_ms).toBe(30 * 60_000);
  });

  it('takes an error code from a database error and never from a message', () => {
    expect(errorCodeOf(new AppError('We could not place your pledge of $50.', 'detail', 'P0001'))).toBe('P0001');
    expect(errorCodeOf(new AppError('Something failed.', 'detail'))).toBe('error');
    expect(errorCodeOf({ code: 'PGRST116' })).toBe('PGRST116');
    expect(errorCodeOf(new Error('Network request failed for Alice'))).toBe('error');
    expect(errorCodeOf(null)).toBe('error');
    expect(errorCodeOf({ code: 'has spaces and is far too long to be a code at all' })).toBe('error');
  });
});

describe('sessions and sequence', () => {
  it('numbers the events of a session in order and starts a new session after 30 idle minutes', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.logger.track('rsvp_started');
    h.advance(60_000);
    h.logger.track('rsvp_completed');
    h.advance(SESSION_IDLE_MS - 1);
    h.logger.track('pledge_placed');
    h.advance(SESSION_IDLE_MS);
    h.logger.track('payment_started');
    await h.logger.flush();
    const e = h.sent[0].events;
    expect(e.map((x) => [x.session_id, x.seq])).toEqual([
      ['session-1', 1],
      ['session-1', 2],
      ['session-1', 3],
      ['session-2', 1],
    ]);
  });

  it('advances a session as a pure step', () => {
    let n = 0;
    const id = () => `s${(n += 1)}`;
    const first = advanceSession(null, 1_000, id);
    expect(first).toEqual({ id: 's1', lastAt: 1_000, seq: 1 });
    expect(advanceSession(first, 2_000, id)).toEqual({ id: 's1', lastAt: 2_000, seq: 2 });
    expect(advanceSession(first, 1_000 + SESSION_IDLE_MS, id).id).toBe('s2');
    expect(advanceSession(first, 500, id).id).toBe('s3'); // the clock went backwards
  });
});

describe('batches', () => {
  it('sends at most 50 events at a time, in order, and empties the queue', async () => {
    const h = harness();
    h.logger.setContext(ME);
    for (let i = 0; i < 120; i += 1) h.logger.track('rsvp_started');
    await h.logger.flush();
    expect(h.sent.map((b) => b.events.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 20]);
    expect(h.sent.flatMap((b) => b.events.map((e) => e.seq))).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
    expect(h.logger.pending()).toBe(0);
  });

  it('sends a full batch without waiting for the next tick', async () => {
    const h = harness();
    h.logger.setContext(ME);
    for (let i = 0; i < BATCH_SIZE; i += 1) h.logger.track('rsvp_started');
    await h.logger.flush();
    expect(h.sent.map((b) => b.events.length)).toEqual([BATCH_SIZE]);
  });

  it('sends nothing when nothing waits', async () => {
    const h = harness();
    h.logger.setContext(ME);
    await h.logger.flush({ force: true });
    expect(h.sent).toEqual([]);
  });
});

describe('a failure is retried later and never shown', () => {
  it('keeps the events, waits before the next try, and sends them when the network is back', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.answers.send = NETWORK_DOWN;
    h.logger.track('rsvp_started');
    h.logger.track('rsvp_completed');
    await expect(h.logger.flush()).resolves.toBeUndefined();
    expect(h.sent).toHaveLength(1);
    expect(h.logger.pending()).toBe(2);

    // The 60-second tick inside the wait does not hammer a server that is down.
    h.advance(10_000);
    await h.logger.flush();
    expect(h.sent).toHaveLength(1);

    h.answers.send = OK;
    h.advance(retryDelay(1));
    await h.logger.flush();
    expect(h.sent).toHaveLength(2);
    expect(h.sent[1].events.map((e) => e.key)).toEqual(['rsvp_started', 'rsvp_completed']);
    expect(h.logger.pending()).toBe(0);
  });

  it('tries again at once when the app goes to the background or comes back (a forced flush)', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.answers.send = NETWORK_DOWN;
    h.logger.track('rsvp_started');
    await h.logger.flush();
    h.answers.send = OK;
    h.advance(1_000);
    await h.logger.flush({ force: true });
    expect(h.sent).toHaveLength(2);
    expect(h.logger.pending()).toBe(0);
  });

  it('waits longer after each failure in a row, up to ten minutes', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(retryDelay)).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000, 600_000]);
  });

  it('survives a send that throws', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.answers.sendThrows = true;
    h.logger.track('rsvp_started');
    await expect(h.logger.flush({ force: true })).resolves.toBeUndefined();
    expect(h.logger.pending()).toBe(1);
  });

  it('drops a batch the database refuses as bad, instead of retrying it for ever', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.answers.send = { error: { code: '22P02', status: 400 } };
    h.logger.track('rsvp_started');
    await h.logger.flush();
    expect(h.logger.pending()).toBe(0);
    h.answers.send = OK;
    h.logger.track('rsvp_completed');
    await h.logger.flush();
    expect(h.sent).toHaveLength(2);
  });

  it('drops the batch quietly and pauses when the database function does not exist yet', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.answers.send = { error: { code: 'PGRST202', status: 404 } };
    h.logger.track('rsvp_started');
    h.logger.track('rsvp_completed');
    await expect(h.logger.flush({ force: true })).resolves.toBeUndefined();
    expect(h.logger.pending()).toBe(0);
    expect(h.sent).toHaveLength(1);

    // Nothing piles up and nothing is sent while paused.
    h.answers.send = OK;
    h.advance(UNAVAILABLE_PAUSE_MS - 1_000);
    h.logger.track('rsvp_started');
    expect(h.logger.pending()).toBe(0);
    await h.logger.flush({ force: true });
    expect(h.sent).toHaveLength(1);

    // Then it tries again.
    h.advance(2_000);
    h.logger.track('rsvp_started');
    await h.logger.flush({ force: true });
    expect(h.sent).toHaveLength(2);
  });

  it('classifies failures: retry the network and busy servers, drop bad batches and a missing function', () => {
    expect(classifyFailure({ code: '', status: 0 })).toBe('retry');
    expect(classifyFailure(undefined)).toBe('retry');
    expect(classifyFailure({ status: 503 })).toBe('retry');
    expect(classifyFailure({ status: 429 })).toBe('retry');
    expect(classifyFailure({ code: 'PGRST301', status: 401 })).toBe('retry');
    expect(classifyFailure({ code: '08006' })).toBe('retry');
    expect(classifyFailure({ code: 'PGRST202', status: 404 })).toBe('missing');
    expect(classifyFailure({ code: '42883' })).toBe('missing');
    expect(classifyFailure({ code: '42501', status: 403 })).toBe('missing');
    expect(classifyFailure({ status: 404 })).toBe('missing');
    expect(classifyFailure({ code: '22P02', status: 400 })).toBe('drop');
    expect(classifyFailure({ code: 'P0001' })).toBe('drop');
  });
});

describe('the queue', () => {
  it('keeps at most 500 events, dropping the oldest first', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.answers.send = NETWORK_DOWN;
    for (let i = 0; i < QUEUE_CAP + 100; i += 1) h.logger.track('rsvp_started');
    expect(h.logger.pending()).toBe(QUEUE_CAP);
    expect(h.logger.waiting()[0].seq).toBe(101);
    expect(h.logger.waiting()[QUEUE_CAP - 1].seq).toBe(QUEUE_CAP + 100);
  });

  it('is kept on the phone and sent after a restart', async () => {
    const first = harness();
    first.logger.setContext(ME);
    first.logger.track('rsvp_started');
    first.logger.track('rsvp_completed');
    await first.logger.persistNow();

    const second = harness({ store: first.store, clock: first.clock });
    second.logger.setContext(ME);
    await second.logger.flush({ force: true });
    expect(second.sent).toHaveLength(1);
    expect(second.sent[0].events.map((e) => e.key)).toEqual(['rsvp_started', 'rsvp_completed']);
    // Same session, so the numbering carries on.
    second.logger.track('pledge_placed');
    await second.logger.flush({ force: true });
    expect(second.sent[1].events[0].seq).toBe(3);
  });

  it('does not send what another person left on the phone', async () => {
    const first = harness();
    first.logger.setContext(ME);
    first.logger.track('rsvp_started');
    await first.logger.persistNow();

    const second = harness({ store: first.store, clock: first.clock });
    second.logger.setContext(SOMEONE_ELSE);
    await second.logger.flush({ force: true });
    expect(second.sent).toEqual([]);
    expect(second.logger.pending()).toBe(0);
  });

  it('starts empty when what was kept cannot be read', async () => {
    const h = harness({ store: { value: { queue: 'nonsense', session: 7 } }, clock: { now: 1 } });
    h.logger.setContext(ME);
    h.logger.track('rsvp_started');
    await h.logger.flush({ force: true });
    expect(h.sent).toHaveLength(1);
    expect(parsePersisted('garbage')).toEqual({ v: 1, queue: [], session: null, optedOut: [], unsynced: null });
    expect(parsePersisted({ queue: [{ userId: 'u', centerId: 'c', event: { key: 'Free text', kind: 'action', outcome: 'ok', seq: 1, session_id: 's', at: 'x' } }] }).queue).toEqual([]);
  });
});

describe('the "Help improve the app" choice', () => {
  it('stops everything at once, empties the queue, and tells the account', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.logger.track('rsvp_started');
    const pending = h.logger.setOptOut(ME.userId, true);
    // Immediately, before the database has answered:
    h.logger.track('rsvp_completed');
    expect(h.logger.beginScreen('screen:/events')).toBeNull();
    expect(h.logger.pending()).toBe(0);
    await expect(pending).resolves.toEqual({ synced: true });
    expect(h.optOutCalls).toEqual([true]);
    await h.logger.flush({ force: true });
    expect(h.sent).toEqual([]);
    await expect(h.logger.isOptedOut(ME.userId)).resolves.toBe(true);
  });

  it('is remembered after a restart', async () => {
    const first = harness();
    first.logger.setContext(ME);
    await first.logger.setOptOut(ME.userId, true);

    const second = harness({ store: first.store, clock: first.clock });
    second.logger.setContext(ME);
    second.logger.track('rsvp_started');
    await second.logger.flush({ force: true });
    expect(second.logger.pending()).toBe(0);
    expect(second.sent).toEqual([]);
    await expect(second.logger.isOptedOut(ME.userId)).resolves.toBe(true);
  });

  it('only stops the person who chose it', async () => {
    const h = harness();
    await h.logger.setOptOut(ME.userId, true);
    h.logger.setContext(SOMEONE_ELSE);
    h.logger.track('rsvp_started');
    expect(h.logger.pending()).toBe(1);
    await expect(h.logger.isOptedOut(SOMEONE_ELSE.userId)).resolves.toBe(false);
  });

  it('says so when the account could not be told, keeps the choice on the phone, and sends it again later', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.answers.optOut = NETWORK_DOWN;
    await expect(h.logger.setOptOut(ME.userId, true)).resolves.toEqual({ synced: false });
    h.logger.track('rsvp_started');
    expect(h.logger.pending()).toBe(0);

    h.answers.optOut = OK;
    h.advance(retryDelay(1));
    await h.logger.flush();
    expect(h.optOutCalls).toEqual([true, true]);
    // Told: not sent a third time.
    await h.logger.flush({ force: true });
    expect(h.optOutCalls).toEqual([true, true]);
    expect(h.sent).toEqual([]);
  });

  it('records again when turned back on', async () => {
    const h = harness();
    h.logger.setContext(ME);
    await h.logger.setOptOut(ME.userId, true);
    await expect(h.logger.setOptOut(ME.userId, false)).resolves.toEqual({ synced: true });
    expect(h.optOutCalls).toEqual([true, false]);
    h.logger.track('rsvp_started');
    await h.logger.flush();
    expect(h.sent).toHaveLength(1);
  });
});

describe('screens', () => {
  it('records a visit with how long it was in view, and only once it has ended', async () => {
    const h = harness();
    h.logger.setContext(ME);
    const visit = h.logger.beginScreen('screen:/event/[id]');
    expect(visit).not.toBeNull();
    const startedAt = new Date(h.clock.now).toISOString();
    h.advance(8_000);
    await h.logger.flush(); // still in view: not sent yet
    expect(h.sent).toEqual([]);
    visit?.end(8_000);
    await h.logger.flush();
    expect(h.sent[0].events).toEqual([
      expect.objectContaining({ key: 'screen:/event/[id]', kind: 'screen', outcome: 'ok', duration_ms: 8_000, at: startedAt, via: 'app' }),
    ]);
  });

  it('orders a screen before the steps taken on it', async () => {
    const h = harness();
    h.logger.setContext(ME);
    const visit = h.logger.beginScreen('screen:/event/[id]');
    h.advance(1_000);
    h.logger.track('rsvp_started');
    h.advance(1_000);
    h.logger.track('rsvp_completed');
    h.advance(1_000);
    visit?.end(3_000);
    await h.logger.flush();
    expect(h.sent[0].events.map((e) => [e.seq, e.key])).toEqual([
      [1, 'screen:/event/[id]'],
      [2, 'rsvp_started'],
      [3, 'rsvp_completed'],
    ]);
  });

  it('forgets a visit too short to count (a redirect or a flick between tabs)', async () => {
    const h = harness();
    h.logger.setContext(ME);
    h.logger.beginScreen('screen:/')?.end(120);
    expect(h.logger.pending()).toBe(0);
  });

  it('closes the screen in view when the app goes to the background, with the time it was visible', async () => {
    const h = harness();
    h.logger.setContext(ME);
    const visit = h.logger.beginScreen('screen:/give');
    h.advance(7_000);
    await h.logger.flush({ force: true });
    expect(h.sent[0].events[0]).toEqual(expect.objectContaining({ key: 'screen:/give', duration_ms: 7_000 }));
    // The screen tracker ends the same visit a moment later: nothing is added or changed.
    h.advance(50);
    visit?.end(7_050);
    expect(h.logger.pending()).toBe(0);
  });
});

describe('the helpers call sites use', () => {
  it('do nothing, and pass results and errors through, when no logger is installed', async () => {
    expect(() => track('rsvp_started')).not.toThrow();
    await expect(trackAction('pledge_placed', { entityKind: 'boli' }, async () => 42)).resolves.toBe(42);
    await expect(trackAction('pledge_placed', { entityKind: 'boli' }, async () => Promise.reject(new Error('no')))).rejects.toThrow('no');
  });

  it('record a started step and how it ended, with a code on failure, and rethrow the error untouched', async () => {
    const h = harness();
    h.logger.setContext(ME);
    installActivityLogger(h.logger);

    await expect(trackFlow('rsvp_started', 'rsvp_completed', { entityKind: 'event' }, async () => 'saved')).resolves.toBe('saved');
    const failure = new AppError('We could not save your RSVP.', 'detail', 'P0001');
    await expect(trackFlow('rsvp_started', 'rsvp_completed', { entityKind: 'event' }, async () => Promise.reject(failure))).rejects.toBe(failure);

    await h.logger.flush();
    expect(h.sent[0].events.map((e) => [e.key, e.outcome, e.error_code, e.entity_kind])).toEqual([
      ['rsvp_started', 'ok', undefined, 'event'],
      ['rsvp_completed', 'ok', undefined, 'event'],
      ['rsvp_started', 'ok', undefined, 'event'],
      ['rsvp_completed', 'error', 'P0001', 'event'],
    ]);
    expect(typeof h.sent[0].events[1].duration_ms).toBe('number');
  });
});
