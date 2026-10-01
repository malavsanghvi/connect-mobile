/**
 * One listening session of the voice practice: what the phone has heard so
 * far, and what to do when the recogniser pauses, fails or ends. Pure (the
 * screen owns the recogniser), tested in __tests__/voice-session.test.ts.
 */

export type Mode = 'verse' | 'all';

export type Session = {
  mode: Mode | null;
  /** Finished segments, best guess each. */
  finals: string[];
  /** Every alternative for the last finished segment. */
  lastAlts: string[];
  /** The segment still being heard. */
  interim: string;
  /** An error was shown; nothing is scored. */
  errored: boolean;
  /** The member tapped the microphone to finish. */
  stopRequested: boolean;
  /** Stop got no answer, so the recogniser was aborted. */
  forced: boolean;
  /**
   * Android 12 and below can't keep listening through a pause: the
   * recogniser is started again after each one until the member taps to
   * finish (or goes quiet), and the whole recitation is scored together.
   */
  restart: boolean;
  restarts: number;
  /** Pauses in a row with nothing new heard. */
  quiet: number;
  startedAt: number;
};

/** Limits for restarting on old Android, so a forgotten microphone stops by itself. */
export const MAX_RESTARTS = 40;
export const MAX_QUIET_PAUSES = 3;
export const MAX_SESSION_MS = 4 * 60 * 1000;

export function freshSession(mode: Mode | null, restart = false, now = 0): Session {
  return { mode, finals: [], lastAlts: [], interim: '', errored: false, stopRequested: false, forced: false, restart, restarts: 0, quiet: 0, startedAt: now };
}

/** Listening through pauses ("continuous") needs Android 13 (API 33) or later; iOS and browsers have it. */
export function continuousSupported(os: string, version: number | string | undefined): boolean {
  if (os !== 'android') return true;
  const v = typeof version === 'number' ? version : Number(version);
  return Number.isFinite(v) && v >= 33;
}

/** A recogniser result: the alternatives (best first) and whether the segment is finished. */
export function addResult(s: Session, alternatives: readonly string[], isFinal: boolean): void {
  if (isFinal) {
    s.finals.push(alternatives[0] ?? '');
    s.lastAlts = [...alternatives];
    s.interim = '';
    s.quiet = 0;
  } else s.interim = alternatives[0] ?? '';
}

/** Everything heard so far, including the segment still being heard. */
export function heardText(s: Session): string {
  return [...s.finals, s.interim].join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * What to score: one text per alternative of the last segment (with the
 * earlier segments before it and any unfinished words after it), or just
 * what was heard. Empty when nothing was heard.
 */
export function heardCandidates(s: Session): string[] {
  const said = heardText(s);
  if (!said) return [];
  if (s.lastAlts.length <= 1) return [said];
  const before = s.finals.slice(0, -1).join(' ');
  return s.lastAlts.map((a) => `${before} ${a} ${s.interim}`.replace(/\s+/g, ' ').trim());
}

/**
 * An error from the recogniser:
 * - ignore: no session, or our own abort;
 * - pause: old Android paused between lines; keep listening;
 * - evaluate: "no speech" after words were already heard; score those;
 * - fail: show the problem.
 */
export function errorAction(s: Session, code: string): 'ignore' | 'pause' | 'evaluate' | 'fail' {
  if (!s.mode || code === 'aborted') return 'ignore';
  const quiet = code === 'no-speech' || code === 'speech-timeout';
  if (quiet && s.restart && !s.stopRequested) return 'pause';
  if (quiet && heardText(s)) return 'evaluate';
  return 'fail';
}

/** The recogniser ended: start it again (old Android, still reciting) or finish the session. */
export function endAction(s: Session, now: number): 'ignore' | 'restart' | 'finish' {
  if (!s.mode) return 'ignore';
  if (s.restart && !s.stopRequested && !s.errored && s.restarts < MAX_RESTARTS && s.quiet < MAX_QUIET_PAUSES && now - s.startedAt < MAX_SESSION_MS) return 'restart';
  return 'finish';
}
