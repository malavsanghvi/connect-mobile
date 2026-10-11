/**
 * The usage logger of the member app (connect-crm B91, "record every action, then automate it").
 *
 * It counts WHICH screens are used and for how long, and a handful of funnel steps (RSVP, pledge, payment, linking an
 * account). It never records what someone types, a name, an amount or any id: an event is only
 *   key (from a fixed list) · kind · entity kind (a word such as "event") · outcome · error code · duration · sequence ·
 *   session · app version · platform · time.
 * The database decides who and where from the sign-in (never from this code), drops keys it does not know, drops people
 * who opted out and under-18 accounts, and does nothing at all while the community's recording switch is off. This file
 * only keeps the phone's half honest:
 *
 *   - a guest, or anyone not signed in to a community, records nothing;
 *   - the person's own choice ("Help improve the app", Settings › Privacy) stops the logger at once and empties the queue;
 *   - events wait in memory and in AsyncStorage (at most 500, oldest dropped first), are sent in batches of at most 50 when
 *     the app goes to the background, comes back, every 60 seconds, and again later after a failure;
 *   - it never throws and is never visible: a failure is retried, or dropped when the database function does not exist yet.
 *
 * Pure apart from the injected dependencies, so it is unit-tested in src/lib/__tests__/activity.test.ts without React
 * Native. The real dependencies (AsyncStorage, the Supabase client, Expo constants) are wired in activity-runtime.ts.
 */

import { isScreenKey, type ScreenVisit } from './activity-routes';

export type ActivityOutcome = 'ok' | 'error' | 'cancelled';

export type TrackOptions = {
  /** What the step is about, as a word: "event", "boli", "account", a payment context. Never an id or a name. */
  entityKind?: string;
  outcome?: ActivityOutcome;
  /** A short code (a database error code such as "P0001"), never a message. */
  errorCode?: string;
  durationMs?: number;
};

/** One event as the database receives it (`app.record_activity`). */
export type ActivityEvent = {
  key: string;
  kind: 'action' | 'screen';
  entity_kind?: string;
  outcome: ActivityOutcome;
  error_code?: string;
  duration_ms?: number;
  via: 'app';
  seq: number;
  session_id: string;
  app_version?: string;
  platform?: string;
  at: string;
};

/** Who the events on this phone belong to right now: signed in, and in a community. */
export type ActivityContext = { userId: string; centerId: string };

type Queued = { userId: string; centerId: string; /** A screen still in view: its duration is not known yet. */ open: boolean; event: ActivityEvent };
type SessionState = { id: string; lastAt: number; seq: number };
type Unsynced = { userId: string; out: boolean };

/** What is kept on the phone between launches. */
export type PersistedActivity = { v: 1; queue: Queued[]; session: SessionState | null; optedOut: string[]; unsynced: Unsynced | null };

export const BATCH_SIZE = 50;
export const QUEUE_CAP = 500;
export const FLUSH_EVERY_MS = 60_000;
/** A new session starts after this long without an event. */
export const SESSION_IDLE_MS = 30 * 60_000;
/** A visit to a screen shorter than this is a redirect or a tab flick, not a visit. */
export const MIN_SCREEN_MS = 300;
export const MAX_DURATION_MS = 30 * 60_000;
/** When the database function is missing (or not allowed), the logger pauses this long before it tries again. */
export const UNAVAILABLE_PAUSE_MS = 60 * 60_000;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 10 * 60_000;
const PERSIST_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------------------------------------------------
// Pure helpers

const ACTION_KEY = /^[a-z][a-z0-9_.]{0,63}$/;
const ENTITY_KIND = /^[a-z][a-z0-9_]{0,31}$/;
const ERROR_CODE = /^[A-Za-z0-9_.-]{1,32}$/;

/** A key that may be recorded: a fixed-looking action word or a screen pattern; anything else (free text, an id) is refused. */
export function cleanKey(key: unknown): string | null {
  if (typeof key !== 'string') return null;
  if (key.startsWith('screen:')) return isScreenKey(key) && key.length <= 160 ? key : null;
  return ACTION_KEY.test(key) ? key : null;
}

export function cleanEntityKind(value: unknown): string | undefined {
  return typeof value === 'string' && ENTITY_KIND.test(value) ? value : undefined;
}

export function cleanErrorCode(value: unknown): string | undefined {
  return typeof value === 'string' && ERROR_CODE.test(value) ? value : undefined;
}

export function cleanDuration(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(Math.round(value), MAX_DURATION_MS);
}

/** The code to record for a failure: a database error code when there is one, otherwise a plain "error". Never a message. */
export function errorCodeOf(err: unknown): string {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  return cleanErrorCode(code) ?? 'error';
}

/** Moves the session on for an event at `now`: the same session while the person stays active, a new one after 30 idle minutes. */
export function advanceSession(prev: SessionState | null, now: number, newId: () => string): SessionState {
  if (prev && now >= prev.lastAt && now - prev.lastAt < SESSION_IDLE_MS) return { id: prev.id, lastAt: now, seq: prev.seq + 1 };
  return { id: newId(), lastAt: now, seq: 1 };
}

export type FailureKind = 'retry' | 'drop' | 'missing';

/**
 * What to do with a batch the database refused. `missing`: the function is not there (or not allowed yet): drop and pause.
 * `retry`: the network, an expired sign-in, a busy server: keep and try later. `drop`: the batch itself is bad: retrying
 * cannot help.
 */
export function classifyFailure(error: unknown): FailureKind {
  const e = (error && typeof error === 'object' ? error : {}) as { code?: unknown; status?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' && e.status > 0 ? e.status : 0;
  if (code === 'PGRST202' || code === '42883' || code === '42501' || status === 404) return 'missing';
  if (/^(PGRST30[0-9]|PGRST00[0-3]|08|53|57)/.test(code)) return 'retry';
  if (status) return status === 401 || status === 408 || status === 429 || status >= 500 ? 'retry' : 'drop';
  return code === '' ? 'retry' : 'drop';
}

/** How long to wait after the nth failure in a row: 30 s, 1 min, 2 min … at most 10 min. */
export function retryDelay(failures: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, failures - 1), RETRY_MAX_MS);
}

const OUTCOMES = new Set<string>(['ok', 'error', 'cancelled']);

function isQueued(x: unknown): x is Queued {
  if (!x || typeof x !== 'object') return false;
  const q = x as Partial<Queued>;
  const ev = q.event as Partial<ActivityEvent> | undefined;
  return (
    typeof q.userId === 'string' &&
    typeof q.centerId === 'string' &&
    !!ev &&
    typeof ev === 'object' &&
    cleanKey(ev.key) !== null &&
    (ev.kind === 'action' || ev.kind === 'screen') &&
    typeof ev.outcome === 'string' &&
    OUTCOMES.has(ev.outcome) &&
    typeof ev.seq === 'number' &&
    typeof ev.session_id === 'string' &&
    typeof ev.at === 'string'
  );
}

/** Reads what was kept on the phone; anything unexpected is ignored (the logger starts empty rather than failing). */
export function parsePersisted(raw: unknown): PersistedActivity {
  const empty: PersistedActivity = { v: 1, queue: [], session: null, optedOut: [], unsynced: null };
  if (!raw || typeof raw !== 'object') return empty;
  const r = raw as Record<string, unknown>;
  const queue = Array.isArray(r.queue) ? r.queue.filter(isQueued).map((q) => ({ ...q, open: false })) : [];
  const s = r.session as Partial<SessionState> | null | undefined;
  const session = s && typeof s.id === 'string' && typeof s.lastAt === 'number' && typeof s.seq === 'number' ? { id: s.id, lastAt: s.lastAt, seq: s.seq } : null;
  const optedOut = Array.isArray(r.optedOut) ? r.optedOut.filter((u): u is string => typeof u === 'string') : [];
  const u = r.unsynced as Partial<Unsynced> | null | undefined;
  const unsynced = u && typeof u.userId === 'string' && typeof u.out === 'boolean' ? { userId: u.userId, out: u.out } : null;
  return { v: 1, queue: queue.slice(-QUEUE_CAP), session, optedOut, unsynced };
}

// ---------------------------------------------------------------------------------------------------------------------
// The logger

type SendResult = { error: unknown | null };

export type ActivityDeps = {
  now: () => number;
  /** A fresh random id for a session. */
  newId: () => string;
  load: () => Promise<unknown>;
  save: (state: PersistedActivity) => Promise<void>;
  /** `app.record_activity(p_center, p_events)`. */
  send: (centerId: string, events: ActivityEvent[]) => Promise<SendResult>;
  /** `app.set_activity_opt_out(p_out)`: acts for whoever is signed in. */
  sendOptOut: (out: boolean) => Promise<SendResult>;
  appVersion?: string;
  platform?: string;
};

export function createActivityLogger(deps: ActivityDeps) {
  let ctx: ActivityContext | null = null;
  let queue: Queued[] = [];
  let session: SessionState | null = null;
  const optedOut = new Set<string>();
  let unsynced: Unsynced | null = null;
  let loaded = false;
  let loading: Promise<void> | null = null;
  let disabledUntil = 0;
  let retryAt = 0;
  let failures = 0;
  let inflight: Promise<void> | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let loggedFailure = false;
  /** Set when the phone's kept events must not come back (a reset before they were read). */
  let wiped = false;
  /** People whose choice changed before the kept data was read: the kept value must not overwrite it. */
  const touched = new Set<string>();

  const snapshot = (): PersistedActivity => ({ v: 1, queue, session, optedOut: [...optedOut], unsynced });

  const persistNow = async (): Promise<void> => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await ensureLoaded(); // never overwrite what is kept before it has been read
    try {
      await deps.save(snapshot());
    } catch {
      // Keeping the queue is best effort: the events still wait in memory.
    }
  };

  const persistSoon = () => {
    if (persistTimer !== null || !loaded) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void persistNow();
    }, PERSIST_DELAY_MS);
  };

  const ensureLoaded = (): Promise<void> => {
    if (!loading) {
      loading = (async () => {
        try {
          const kept = parsePersisted(await deps.load());
          for (const u of kept.optedOut) if (!touched.has(u)) optedOut.add(u);
          if (!unsynced) unsynced = kept.unsynced;
          if (!wiped) {
            if (!session) session = kept.session;
            // What waited from the last launch goes first; only this person's, and nothing from an opted-out person.
            queue = [...kept.queue, ...queue].filter((q) => !optedOut.has(q.userId) && (!ctx || q.userId === ctx.userId)).slice(-QUEUE_CAP);
          }
        } catch {
          // Nothing readable was kept: start empty.
        }
        loaded = true;
        wiped = false;
        persistSoon();
      })();
    }
    return loading;
  };

  const active = (): boolean => !!ctx && !optedOut.has(ctx.userId) && deps.now() >= disabledUntil;

  const enqueue = (key: string, opts: TrackOptions, open: boolean): Queued | null => {
    try {
      const cleaned = cleanKey(key);
      if (!cleaned || !ctx || !active()) return null;
      const now = deps.now();
      session = advanceSession(session, now, deps.newId);
      const event: ActivityEvent = {
        key: cleaned,
        kind: cleaned.startsWith('screen:') ? 'screen' : 'action',
        entity_kind: cleanEntityKind(opts.entityKind),
        outcome: opts.outcome && OUTCOMES.has(opts.outcome) ? opts.outcome : 'ok',
        error_code: cleanErrorCode(opts.errorCode),
        duration_ms: cleanDuration(opts.durationMs),
        via: 'app',
        seq: session.seq,
        session_id: session.id,
        app_version: deps.appVersion,
        platform: deps.platform,
        at: new Date(now).toISOString(),
      };
      const item: Queued = { userId: ctx.userId, centerId: ctx.centerId, open, event };
      queue.push(item);
      if (queue.length > QUEUE_CAP) queue = queue.slice(queue.length - QUEUE_CAP);
      persistSoon();
      if (queue.length >= BATCH_SIZE) void flush();
      return item;
    } catch {
      return null; // telemetry never throws
    }
  };

  /** A screen still in view whose visit has ended: set its duration, or forget a visit too short to count. */
  const closeVisit = (item: Queued, visibleMs: number) => {
    if (!item.open) return;
    item.open = false;
    const ms = cleanDuration(visibleMs);
    if (ms === undefined || ms < MIN_SCREEN_MS) queue = queue.filter((q) => q !== item);
    else item.event.duration_ms = ms;
    persistSoon();
  };

  const closeOpenVisits = () => {
    const now = deps.now();
    for (const q of [...queue]) if (q.open) closeVisit(q, now - Date.parse(q.event.at));
  };

  const remove = (items: Queued[]) => {
    const gone = new Set(items);
    queue = queue.filter((q) => !gone.has(q));
  };

  const noteFailure = (what: string) => {
    if (loggedFailure) return;
    loggedFailure = true;
    // console.log, not console.error: a usage logger must never raise a red box.
    console.log(`[connect] usage logger: ${what}`);
  };

  const pushOptOut = async (u: Unsynced): Promise<boolean> => {
    let res: SendResult;
    try {
      res = await deps.sendOptOut(u.out);
    } catch (error) {
      res = { error };
    }
    if (res.error) return false;
    if (unsynced && unsynced.userId === u.userId && unsynced.out === u.out) {
      unsynced = null;
      persistSoon();
    }
    return true;
  };

  const fail = (what: string) => {
    failures += 1;
    retryAt = deps.now() + retryDelay(failures);
    noteFailure(what);
  };

  const sendChunk = async (centerId: string, chunk: Queued[]): Promise<'next' | 'stop'> => {
    let res: SendResult;
    try {
      res = await deps.send(centerId, chunk.map((q) => q.event));
    } catch (error) {
      res = { error };
    }
    if (!res.error) {
      remove(chunk);
      failures = 0;
      retryAt = 0;
      loggedFailure = false;
      return 'next';
    }
    const kind = classifyFailure(res.error);
    if (kind === 'drop') {
      remove(chunk);
      noteFailure('a batch was refused and dropped');
      return 'next';
    }
    if (kind === 'missing') {
      queue = [];
      disabledUntil = deps.now() + UNAVAILABLE_PAUSE_MS;
      noteFailure('not available on this server yet; paused');
      return 'stop';
    }
    fail('could not send; will retry');
    return 'stop';
  };

  const doFlush = async (force: boolean): Promise<void> => {
    await ensureLoaded();
    const c = ctx;
    if (!c) return;
    if (!force && deps.now() < retryAt) return;
    // A choice that could not be sent to the database is tried again, but only for the person who is signed in now.
    const choice = unsynced;
    if (choice && choice.userId === c.userId && !(await pushOptOut(choice))) {
      fail('could not save the opt-out choice; will retry');
      return;
    }
    if (optedOut.has(c.userId)) {
      if (queue.length) {
        queue = [];
        await persistNow();
      }
      return;
    }
    if (force) closeOpenVisits();
    if (deps.now() < disabledUntil) return;
    const ready = queue.filter((q) => q.userId === c.userId && !q.open);
    if (ready.length === 0) {
      if (force) await persistNow();
      return;
    }
    const byCenter = new Map<string, Queued[]>();
    for (const q of ready) byCenter.set(q.centerId, [...(byCenter.get(q.centerId) ?? []), q]);
    for (const [centerId, items] of byCenter) {
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        if ((await sendChunk(centerId, items.slice(i, i + BATCH_SIZE))) === 'stop') {
          await persistNow();
          return;
        }
      }
    }
    await persistNow();
  };

  const flush = (opts: { force?: boolean } = {}): Promise<void> => {
    if (inflight) return inflight;
    const run: Promise<void> = doFlush(!!opts.force)
      .catch(() => undefined) // telemetry never throws
      .finally(() => {
        if (inflight === run) inflight = null;
      });
    inflight = run;
    return run;
  };

  void ensureLoaded();

  return {
    /** Who the events belong to. Null: nothing is recorded (not signed in, or no community yet). Another person's waiting events are dropped. */
    setContext(next: ActivityContext | null) {
      ctx = next;
      if (next) {
        const mine = queue.filter((q) => q.userId === next.userId);
        if (mine.length !== queue.length) {
          queue = mine;
          persistSoon();
        }
      }
    },
    /** Sign-out, a guest, an under-18 account: forget everything that waited and start a new session next time. */
    reset() {
      ctx = null;
      queue = [];
      session = null;
      if (!loaded) wiped = true;
      void ensureLoaded().then(persistNow);
    },
    /** Record one step. Never throws, never waits. */
    track(key: string, opts: TrackOptions = {}) {
      enqueue(key, opts, false);
    },
    /** Record the start of a screen visit; call `end(visibleMs)` when it is over. Null when nothing is being recorded. */
    beginScreen(key: string): ScreenVisit | null {
      if (!isScreenKey(key)) return null;
      const item = enqueue(key, {}, true);
      if (!item) return null;
      return { end: (visibleMs: number) => closeVisit(item, visibleMs) };
    },
    flush,
    /** Has this person turned recording off (on this phone)? */
    async isOptedOut(userId: string): Promise<boolean> {
      await ensureLoaded();
      return optedOut.has(userId);
    },
    /**
     * The person's own choice. Off stops the logger at once and forgets what waited; the database is told too, and when it
     * cannot be reached the choice is kept and sent again at the next flush (`synced: false` so the screen can say so).
     */
    async setOptOut(userId: string, out: boolean): Promise<{ synced: boolean }> {
      touched.add(userId);
      if (out) {
        optedOut.add(userId);
        queue = queue.filter((q) => q.userId !== userId);
      } else {
        optedOut.delete(userId);
      }
      const u: Unsynced = { userId, out };
      unsynced = u;
      await ensureLoaded();
      await persistNow();
      const synced = await pushOptOut(u);
      await persistNow();
      return { synced };
    },
    /** The database says this person opted out (perhaps from another phone): obey here too, without telling the database again. */
    acceptOptOut(userId: string) {
      if (unsynced && unsynced.userId === userId) return; // their own newer choice is still on its way
      touched.add(userId);
      optedOut.add(userId);
      queue = queue.filter((q) => q.userId !== userId);
      persistSoon();
    },
    /** Saves what waits (used when the app goes to the background and by tests). */
    persistNow,
    /** How many events wait to be sent (tests and diagnostics). */
    pending: () => queue.length,
    /** The waiting events as they would be sent (tests and diagnostics). */
    waiting: () => queue.map((q) => q.event),
  };
}

export type ActivityLogger = ReturnType<typeof createActivityLogger>;

// ---------------------------------------------------------------------------------------------------------------------
// The installed logger: call sites import these; they do nothing until the root layout has installed the real one.

let installed: ActivityLogger | null = null;

export function installActivityLogger(logger: ActivityLogger | null): void {
  installed = logger;
}

/** Record one step. Safe anywhere: never throws, never waits, does nothing for a guest or someone who opted out. */
export function track(key: string, opts: TrackOptions = {}): void {
  try {
    installed?.track(key, opts);
  } catch {
    // telemetry never throws
  }
}

/** Record the start of a screen visit. */
export function beginScreen(key: string): ScreenVisit | null {
  try {
    return installed?.beginScreen(key) ?? null;
  } catch {
    return null;
  }
}

export function flushActivity(opts: { force?: boolean } = {}): Promise<void> {
  return installed ? installed.flush(opts) : Promise.resolve();
}

/** Before signing out: send what waits while the sign-in is still valid, but never hold the sign-out up for long. */
export async function flushActivityBriefly(maxMs = 2_500): Promise<void> {
  await Promise.race([flushActivity({ force: true }), new Promise<void>((resolve) => setTimeout(resolve, maxMs))]);
}

export async function readActivityOptOut(userId: string): Promise<boolean> {
  return installed ? installed.isOptedOut(userId) : false;
}

/** The database says this person opted out: stop recording on this phone too. */
export function noteActivityOptOut(userId: string): void {
  try {
    installed?.acceptOptOut(userId);
  } catch {
    // telemetry never throws
  }
}

export async function setActivityOptOut(userId: string, out: boolean): Promise<{ synced: boolean }> {
  return installed ? installed.setOptOut(userId, out) : { synced: false };
}

/** Run one step and record how it ended (ok, or error with a code) and how long it took. The step's own result or error passes through. */
export async function trackAction<T>(key: string, opts: Pick<TrackOptions, 'entityKind'>, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const value = await run();
    track(key, { ...opts, outcome: 'ok', durationMs: Date.now() - started });
    return value;
  } catch (err) {
    track(key, { ...opts, outcome: 'error', errorCode: errorCodeOf(err), durationMs: Date.now() - started });
    throw err;
  }
}

/** Like trackAction, with a "started" event first (the start of a funnel). */
export async function trackFlow<T>(startKey: string, endKey: string, opts: Pick<TrackOptions, 'entityKind'>, run: () => Promise<T>): Promise<T> {
  track(startKey, opts);
  return trackAction(endKey, opts, run);
}
