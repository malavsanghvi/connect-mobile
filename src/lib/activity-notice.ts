/**
 * The first-run notice of the usage logger (connect-crm B91; owner decision 2026-10-10: a NOTICE with an opt-out, not consent).
 *
 * Nothing is recorded for a person in a community until they have seen the notice there once. The notice is shown only when
 * recording is really on for that community (`app.activity_status`); when the call fails, or says it is off, nothing is shown
 * and nothing is recorded (it is looked at again the next time the app comes back). "Got it" and "Turn off" both count as
 * seen. Pure apart from the injected dependencies: unit-tested in src/lib/__tests__/activity-notice.test.ts.
 */

import type { ActivityContext } from './activity';

/** What the database says about recording for this person here (`app.activity_status`). */
export type ActivityStatus = { enabled: boolean; optedOut: boolean; eligible: boolean };

/** Reads the database's answer; null when it is not the shape we know (treated as "off"). */
export function parseStatus(raw: unknown): ActivityStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.enabled !== 'boolean') return null;
  return { enabled: r.enabled, optedOut: r.opted_out === true, eligible: r.eligible === true };
}

/**
 * What to do for this person in this community:
 *  - `record`: the notice was seen; the logger may record (the database and the person's opt-out still decide);
 *  - `show`: recording is on and the notice has not been seen: show it, record nothing yet;
 *  - `quiet`: recording is off, not known, or the person opted out: show nothing, record nothing.
 */
export type NoticePhase = 'record' | 'show' | 'quiet';

/** The logger's context for a phase: only `record` lets it record. */
export function contextFor(phase: NoticePhase, userId: string, centerId: string): ActivityContext | null {
  return phase === 'record' ? { userId, centerId } : null;
}

export function noticeKey(userId: string, centerId: string): string {
  return `${userId}|${centerId}`;
}

const KEEP_AT_MOST = 100;

export type NoticeDeps = {
  /** The people-and-communities that have seen the notice, as kept on this phone. */
  loadSeen: () => Promise<string[]>;
  saveSeen: (keys: string[]) => Promise<void>;
  /** `app.activity_status(p_center)`: the raw answer; throws when it cannot be had. */
  fetchStatus: (centerId: string) => Promise<unknown>;
  /** Has this person turned recording off on this phone? */
  isOptedOut: (userId: string) => Promise<boolean>;
  /** The database says they opted out: obey on this phone too. */
  noteOptedOut: (userId: string) => void;
  /** Their own choice, "Turn off": stops the logger at once and tells the account. */
  setOptOut: (userId: string, out: boolean) => Promise<{ synced: boolean }>;
};

export function createNoticeController(deps: NoticeDeps) {
  let loading: Promise<Set<string>> | null = null;

  const loadSeen = (): Promise<Set<string>> => {
    if (!loading) {
      loading = (async () => {
        try {
          return new Set(await deps.loadSeen());
        } catch {
          // Not readable: treated as not seen yet (the notice may show again; nothing is recorded meanwhile).
          return new Set<string>();
        }
      })();
    }
    return loading;
  };

  const markSeen = async (userId: string, centerId: string): Promise<void> => {
    const set = await loadSeen();
    set.add(noticeKey(userId, centerId));
    try {
      await deps.saveSeen([...set].slice(-KEEP_AT_MOST));
    } catch {
      // Could not be kept: it stays seen for this session and the notice may show once more after a restart.
    }
  };

  return {
    /** Decide for this person here. Never throws. */
    async check(userId: string, centerId: string): Promise<NoticePhase> {
      if ((await loadSeen()).has(noticeKey(userId, centerId))) return 'record';
      try {
        if (await deps.isOptedOut(userId)) return 'quiet';
        const status = parseStatus(await deps.fetchStatus(centerId));
        if (!status) return 'quiet';
        if (status.optedOut) {
          deps.noteOptedOut(userId);
          return 'quiet';
        }
        return status.enabled && status.eligible ? 'show' : 'quiet';
      } catch {
        return 'quiet';
      }
    },
    /** "Got it": remembered for this person in this community. */
    async gotIt(userId: string, centerId: string): Promise<void> {
      await markSeen(userId, centerId);
    },
    /** "Turn off": stops the logger at once (and tells the account), and the notice is not shown again. */
    async turnOff(userId: string, centerId: string): Promise<{ synced: boolean }> {
      const pending = deps.setOptOut(userId, true);
      await markSeen(userId, centerId);
      return pending;
    },
  };
}

export type NoticeController = ReturnType<typeof createNoticeController>;
