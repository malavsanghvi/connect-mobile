/**
 * Gyan Path points shown in the app (pure; tested in __tests__/points.test.ts).
 * The database is the only thing that awards points (connect-crm 0570):
 * - the first completion of a step pays gyan_steps.points once (trigger);
 * - app.record_gyan_attempt pays gyan_steps.repeat_points for a successful
 *   practice try (voice steps, and hotspot steps in practice mode), up to the
 *   community's daily cap per activity; a cap of 0 switches try points off;
 * - finishing every step of a level pays the level bonus (gyan_levels.points
 *   unless a teacher signs it off) and gyan_levels.treasure_points, once.
 * These helpers only read and describe what the server did.
 */
import type { StringKey } from '../../i18n/en';

export const DEFAULT_PRACTICE_CAP = 10;
/** The server's upper bound for the daily cap (rules form: 0–1000). */
export const MAX_PRACTICE_CAP = 1000;
/** record_gyan_attempt refuses p_detail over 2 KB; the app stays below that. */
export const MAX_ATTEMPT_DETAIL_BYTES = 2000;

/**
 * record_gyan_attempt's answer. A successful try also completes the step, so
 * `pointsAwarded` is everything the call paid: the try's repeat points plus,
 * the first time, the step's points and (finishing the level) the level bonus
 * and treasure. `tryPoints` is the repeat part alone.
 */
export type AttemptResult = {
  pointsAwarded: number;
  tryPoints: number;
  stepPoints: number;
  levelPoints: number;
  treasurePoints: number;
  triesToday: number;
  cap: number;
  firstTime: boolean;
  /**
   * The server already had this try (the same try id, sent again after an
   * answer was lost): it returned the first answer and paid nothing new. The
   * points in it were paid once, by the first call, and are still news to the
   * phone, which never saw that answer.
   */
  replayed: boolean;
};

function int(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : d;
}

/** record_gyan_attempt's jsonb answer, read defensively. A cap of 0 stays 0 (try points switched off). */
export function parseAttemptResult(raw: unknown): AttemptResult {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pointsAwarded = int(o.points_awarded, 0);
  const stepPoints = int(o.step_points, 0);
  const levelPoints = int(o.level_points, 0);
  const treasurePoints = int(o.treasure_points, 0);
  return {
    pointsAwarded,
    // Without try_points, the try's part is what is left after the once-only awards.
    tryPoints: int(o.try_points, Math.max(0, pointsAwarded - stepPoints - levelPoints - treasurePoints)),
    stepPoints,
    levelPoints,
    treasurePoints,
    triesToday: int(o.tries_today, 0),
    cap: Math.min(MAX_PRACTICE_CAP, int(o.cap, DEFAULT_PRACTICE_CAP)),
    firstTime: o.first_time === true,
    replayed: o.replayed === true,
  };
}

/** Stars for a try's 0–100 score, the same rule the server uses when a try completes the step (90+ → 3, 60+ → 2, else 1). */
export function scoreStars(score: number): number {
  return score >= 90 ? 3 : score >= 60 ? 2 : 1;
}

/**
 * centers.rules.points.gyan_practice_daily_cap, read the way the server reads
 * it: a JSON number, rounded down and kept within 0–1000; anything else
 * (missing, a string) means the default of 10. 0 switches try points off.
 */
export function practiceCap(rules: unknown): number {
  const r = rules && typeof rules === 'object' && !Array.isArray(rules) ? (rules as Record<string, unknown>) : {};
  const pts = r.points && typeof r.points === 'object' && !Array.isArray(r.points) ? (r.points as Record<string, unknown>) : {};
  const v = pts.gyan_practice_daily_cap;
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_PRACTICE_CAP, Math.max(0, Math.floor(v))) : DEFAULT_PRACTICE_CAP;
}

/** Do good tries of this step earn points at all? Not with a cap of 0, nor for a step without repeat points. */
export function triesPay(cap: number, repeatPoints: number): boolean {
  return cap > 0 && repeatPoints > 0;
}

export type Line = { key: StringKey; vars?: Record<string, string | number> };

/**
 * What to say after a practice try:
 * "+3 points · 4 of 10 today", "Today's practice points are done — keep
 * practising!", or, for a try that didn't count, the counter alone. When
 * tries don't earn points (cap 0, or no repeat points) there is no counter:
 * just the points the try paid (a first success still completes the step),
 * "Well done!" or "Not counted this time".
 */
export function attemptLine(result: AttemptResult, success: boolean, repeatPoints: number): Line {
  if (!triesPay(result.cap, repeatPoints)) {
    if (success && result.pointsAwarded > 0) return { key: 'gyan.tryPointsOnly', vars: { points: result.pointsAwarded } };
    return success ? { key: 'gyan.tryWellDone' } : { key: 'gyan.tryNotCountedOnly' };
  }
  const counter = { n: Math.min(result.triesToday, result.cap), cap: result.cap };
  if (success && result.pointsAwarded > 0) return { key: 'gyan.tryPoints', vars: { points: result.pointsAwarded, ...counter } };
  if (success && result.triesToday >= result.cap) return { key: 'gyan.tryCapped' };
  if (success) return { key: 'gyan.tryCounted', vars: counter };
  return { key: 'gyan.tryNotCounted', vars: counter };
}

/** "3 of 10 today" before or between tries (only shown when tries earn points). */
export function counterLine(triesToday: number, cap: number): Line {
  return triesToday >= cap ? { key: 'gyan.counterDone', vars: { cap } } : { key: 'gyan.counter', vars: { n: triesToday, cap } };
}

/** A points_ledger row (connect-crm: reason 'level' with a step id is a step's first completion; with the level id, the level bonus). */
export type LedgerRow = { points: number; reason: string; ref_id: string | null };

/**
 * What the server paid for this level during the lesson, from the ledger rows
 * written since it started (the caller asks for those): step points for steps
 * that weren't done at the start, and the level bonus and treasure unless the
 * level was already done. Both are paid once ever, so a row from an earlier
 * run is never counted again.
 */
export function levelAwards(rows: readonly LedgerRow[], o: { stepIds: readonly string[]; levelId: string; alreadyDone: ReadonlySet<string>; wasLevelDone: boolean }): { steps: number; bonus: number; treasure: number } {
  const steps = new Set(o.stepIds);
  let s = 0;
  let bonus = 0;
  let treasure = 0;
  for (const r of rows) {
    const pts = Math.max(0, Math.round(r.points || 0));
    if (!r.ref_id) continue;
    if (r.reason === 'level' && steps.has(r.ref_id) && !o.alreadyDone.has(r.ref_id)) s += pts;
    else if (r.reason === 'level' && r.ref_id === o.levelId && !o.wasLevelDone) bonus += pts;
    else if (r.reason === 'gyan_treasure' && r.ref_id === o.levelId && !o.wasLevelDone) treasure += pts;
  }
  return { steps: s, bonus, treasure };
}

function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

export type AttemptDetail = Record<string, string | number | boolean | null>;

/**
 * p_detail for record_gyan_attempt: what the screen wants to remember plus
 * the try id (one per try, the same when the try is sent again after a lost
 * answer, so the server records and pays it once). Kept under 2 KB: long
 * text is dropped first, the try id is always kept.
 */
export function attemptDetail(detail: AttemptDetail, tryId: string): AttemptDetail {
  const full: AttemptDetail = { ...detail, try_id: tryId };
  if (utf8Length(JSON.stringify(full)) <= MAX_ATTEMPT_DETAIL_BYTES) return full;
  const slim: AttemptDetail = {};
  for (const [k, v] of Object.entries(detail)) if (k.length <= 40 && (typeof v !== 'string' || v.length <= 40)) slim[k] = v;
  slim.try_id = tryId;
  return utf8Length(JSON.stringify(slim)) <= MAX_ATTEMPT_DETAIL_BYTES ? slim : { try_id: tryId };
}
