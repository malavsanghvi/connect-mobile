import { afterEach, describe, expect, it } from '@jest/globals';

import { createActivityLogger, type ActivityEvent, type ActivityLogger } from '../activity';
import { contextFor, createNoticeController, noticeKey, parseStatus } from '../activity-notice';

const ME = 'user-1';
const HERE = 'center-1';
const ON = { enabled: true, opted_out: false, eligible: true, member: true, portal: false };

type Answer = unknown | Error;

function noticeHarness(opts: { status?: Answer; kept?: string[]; localOptOut?: boolean; saveThrows?: boolean; loadThrows?: boolean; optOutVia?: ActivityLogger['setOptOut'] } = {}) {
  const store = { value: opts.kept ?? ([] as string[]) };
  const calls = { fetch: [] as string[], noted: [] as string[], optOut: [] as [string, boolean][] };
  const answers = { status: opts.status === undefined ? ON : opts.status, optOutSynced: true };
  const make = () =>
    createNoticeController({
      loadSeen: async () => {
        if (opts.loadThrows) throw new Error('storage');
        return store.value;
      },
      saveSeen: async (keys) => {
        if (opts.saveThrows) throw new Error('storage');
        store.value = [...keys];
      },
      fetchStatus: async (centerId) => {
        calls.fetch.push(centerId);
        if (answers.status instanceof Error) throw answers.status;
        return answers.status;
      },
      isOptedOut: async () => !!opts.localOptOut,
      noteOptedOut: (userId) => calls.noted.push(userId),
      setOptOut: async (userId, out) => {
        calls.optOut.push([userId, out]);
        return opts.optOutVia ? opts.optOutVia(userId, out) : { synced: answers.optOutSynced };
      },
    });
  return { notice: make(), make, store, calls, answers };
}

describe('when the first-run notice is shown', () => {
  it('shows it when recording is on for the community, the person can be recorded, and they have not seen it', async () => {
    const h = noticeHarness();
    await expect(h.notice.check(ME, HERE)).resolves.toBe('show');
    expect(h.calls.fetch).toEqual([HERE]);
  });

  it('shows nothing when recording is off for the community', async () => {
    const h = noticeHarness({ status: { ...ON, enabled: false } });
    await expect(h.notice.check(ME, HERE)).resolves.toBe('quiet');
  });

  it('shows nothing when the database cannot be asked, or answers in a shape we do not know', async () => {
    await expect(noticeHarness({ status: new Error('offline') }).notice.check(ME, HERE)).resolves.toBe('quiet');
    await expect(noticeHarness({ status: null }).notice.check(ME, HERE)).resolves.toBe('quiet');
    await expect(noticeHarness({ status: 'on' }).notice.check(ME, HERE)).resolves.toBe('quiet');
    await expect(noticeHarness({ status: {} }).notice.check(ME, HERE)).resolves.toBe('quiet');
  });

  it('shows nothing to someone who cannot be recorded (a child, a learner)', async () => {
    await expect(noticeHarness({ status: { ...ON, eligible: false, member: false } }).notice.check(ME, HERE)).resolves.toBe('quiet');
  });

  it('shows nothing when the privacy switch is already off, without asking the database', async () => {
    const h = noticeHarness({ localOptOut: true });
    await expect(h.notice.check(ME, HERE)).resolves.toBe('quiet');
    expect(h.calls.fetch).toEqual([]);
  });

  it('shows nothing when the database says they opted out (perhaps from another phone), and stops recording here too', async () => {
    const h = noticeHarness({ status: { ...ON, opted_out: true } });
    await expect(h.notice.check(ME, HERE)).resolves.toBe('quiet');
    expect(h.calls.noted).toEqual([ME]);
  });

  it('reads the answer of the database', () => {
    expect(parseStatus(ON)).toEqual({ enabled: true, optedOut: false, eligible: true });
    expect(parseStatus({ enabled: false })).toEqual({ enabled: false, optedOut: false, eligible: false });
    expect(parseStatus({ enabled: 'yes' })).toBeNull();
    expect(parseStatus(undefined)).toBeNull();
  });
});

describe('once seen, it is remembered', () => {
  it('"Got it" is remembered, so the next look records without asking again, and survives a restart', async () => {
    const h = noticeHarness();
    await expect(h.notice.check(ME, HERE)).resolves.toBe('show');
    await h.notice.gotIt(ME, HERE);
    await expect(h.notice.check(ME, HERE)).resolves.toBe('record');
    expect(h.calls.fetch).toHaveLength(1);

    const restarted = h.make();
    await expect(restarted.check(ME, HERE)).resolves.toBe('record');
    expect(h.calls.fetch).toHaveLength(1);
  });

  it('is remembered for the person and the community only', async () => {
    const h = noticeHarness();
    await h.notice.gotIt(ME, HERE);
    await expect(h.notice.check(ME, 'center-2')).resolves.toBe('show');
    await expect(h.notice.check('user-2', HERE)).resolves.toBe('show');
    expect(h.store.value).toEqual([noticeKey(ME, HERE)]);
  });

  it('"Turn off" tells the account, is remembered too, and does not show the notice again', async () => {
    const h = noticeHarness();
    await expect(h.notice.turnOff(ME, HERE)).resolves.toEqual({ synced: true });
    expect(h.calls.optOut).toEqual([[ME, true]]);
    await expect(h.notice.check(ME, HERE)).resolves.toBe('record');
    expect(h.store.value).toEqual([noticeKey(ME, HERE)]);
  });

  it('says so when "Turn off" could not reach the account', async () => {
    const h = noticeHarness();
    h.answers.optOutSynced = false;
    await expect(h.notice.turnOff(ME, HERE)).resolves.toEqual({ synced: false });
  });

  it('keeps going when the phone cannot keep the choice: seen for this session, never an error', async () => {
    const h = noticeHarness({ saveThrows: true });
    await expect(h.notice.gotIt(ME, HERE)).resolves.toBeUndefined();
    await expect(h.notice.check(ME, HERE)).resolves.toBe('record');
    expect(h.store.value).toEqual([]);
  });

  it('treats what cannot be read as not seen yet', async () => {
    const h = noticeHarness({ loadThrows: true });
    await expect(h.notice.check(ME, HERE)).resolves.toBe('show');
  });
});

describe('nothing is recorded before the notice, and "Turn off" stops everything', () => {
  const made: ActivityLogger[] = [];
  afterEach(async () => {
    await Promise.all(made.splice(0).map((l) => l.persistNow()));
  });

  function logger() {
    const sent: ActivityEvent[][] = [];
    const optOut: boolean[] = [];
    const clock = { now: Date.UTC(2026, 9, 10, 12, 0, 0) };
    const l = createActivityLogger({
      now: () => clock.now,
      newId: () => 'session-1',
      load: async () => null,
      save: async () => undefined,
      send: async (_centerId, events) => {
        sent.push(events);
        return { error: null };
      },
      sendOptOut: async (out) => {
        optOut.push(out);
        return { error: null };
      },
      appVersion: '1.17.0',
      platform: 'ios',
    });
    made.push(l);
    return { l, sent, optOut };
  }

  it('only the "record" phase gives the logger a context', () => {
    expect(contextFor('record', ME, HERE)).toEqual({ userId: ME, centerId: HERE });
    expect(contextFor('show', ME, HERE)).toBeNull();
    expect(contextFor('quiet', ME, HERE)).toBeNull();
  });

  it('records nothing while the notice has not been seen, and records after "Got it"', async () => {
    const h = noticeHarness();
    const { l, sent } = logger();

    const phase = await h.notice.check(ME, HERE);
    expect(phase).toBe('show');
    l.setContext(contextFor(phase, ME, HERE));
    l.track('rsvp_started');
    expect(l.beginScreen('screen:/events')).toBeNull();
    expect(l.pending()).toBe(0);
    await l.flush({ force: true });
    expect(sent).toEqual([]);

    await h.notice.gotIt(ME, HERE);
    l.setContext(contextFor(await h.notice.check(ME, HERE), ME, HERE));
    l.track('rsvp_started');
    expect(l.pending()).toBe(1);
    await l.flush();
    expect(sent).toHaveLength(1);
  });

  it('"Turn off" stops the logger at once and keeps it stopped, including after the notice is seen', async () => {
    const { l, sent, optOut } = logger();
    const h = noticeHarness({ optOutVia: (userId, out) => l.setOptOut(userId, out) });
    // The person had been recorded in another community or before, and has something waiting.
    l.setContext({ userId: ME, centerId: HERE });
    l.track('rsvp_started');
    expect(l.pending()).toBe(1);

    const result = h.notice.turnOff(ME, HERE);
    // Before anything has been awaited: the logger is already off and has forgotten what waited.
    l.track('rsvp_completed');
    expect(l.pending()).toBe(0);
    await expect(result).resolves.toEqual({ synced: true });
    expect(optOut).toEqual([true]);

    // Seen, so the phase is "record", but the logger stays off for this person.
    l.setContext(contextFor('record', ME, HERE));
    l.track('pledge_placed');
    expect(l.beginScreen('screen:/give')).toBeNull();
    await l.flush({ force: true });
    expect(sent).toEqual([]);
  });
});
