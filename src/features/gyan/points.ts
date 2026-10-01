/**
 * Gyan Path points shown in the app (pure; tested in __tests__/points.test.ts).
 * The database is the only thing that awards points (connect-crm 0570):
 * - the first completion of a step pays gyan_steps.points once (trigger);
 * - app.record_gyan_attempt pays gyan_steps.repeat_points for a successful
 *   practice try, up to the community's daily cap per activity;
 * - finishing every step of a level pays the level bonus (gyan_levels.points
 *   unless a teacher signs it off) and gyan_levels.treasure_points, once.
 * These helpers only read and describe what the server did.
 */
import type { StringKey } from '../../i18n/en';

export const DEFAULT_PRACTICE_CAP = 10;

export type AttemptResult = { pointsAwarded: number; triesToday: number; cap: number; firstTime: boolean };

function int(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : d;
}

/** record_gyan_attempt's jsonb answer, read defensively. */
export function parseAttemptResult(raw: unknown): AttemptResult {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { pointsAwarded: int(o.points_awarded, 0), triesToday: int(o.tries_today, 0), cap: int(o.cap, DEFAULT_PRACTICE_CAP) || DEFAULT_PRACTICE_CAP, firstTime: o.first_time === true };
}

/** centers.rules.points.gyan_practice_daily_cap (default 10), for the counter shown before the first try. */
export function practiceCap(rules: unknown): number {
  const r = rules && typeof rules === 'object' && !Array.isArray(rules) ? (rules as Record<string, unknown>) : {};
  const pts = r.points && typeof r.points === 'object' && !Array.isArray(r.points) ? (r.points as Record<string, unknown>) : {};
  return int(pts.gyan_practice_daily_cap, DEFAULT_PRACTICE_CAP) || DEFAULT_PRACTICE_CAP;
}

export type Line = { key: StringKey; vars?: Record<string, string | number> };

/**
 * What to say after a practice try:
 * "+3 points · 4 of 10 today", "Today's practice points are done — keep
 * practising!", or, for a try that didn't count, the counter alone.
 */
export function attemptLine(result: AttemptResult, success: boolean): Line {
  const counter = { n: Math.min(result.triesToday, result.cap), cap: result.cap };
  if (success && result.pointsAwarded > 0) return { key: 'gyan.tryPoints', vars: { points: result.pointsAwarded, ...counter } };
  if (success && result.triesToday >= result.cap) return { key: 'gyan.tryCapped' };
  if (success) return { key: 'gyan.tryCounted', vars: counter };
  return { key: 'gyan.tryNotCounted', vars: counter };
}

/** "3 of 10 today" before or between tries. */
export function counterLine(triesToday: number, cap: number): Line {
  return triesToday >= cap ? { key: 'gyan.counterDone', vars: { cap } } : { key: 'gyan.counter', vars: { n: triesToday, cap } };
}

/** Points the server pays for finishing a level for the first time (on top of the step points). */
export function levelBonus(level: { points: number; requires_teacher_signoff: boolean; treasure_points?: number | null }, wasLevelDone: boolean): { bonus: number; treasure: number } {
  if (wasLevelDone) return { bonus: 0, treasure: 0 };
  return { bonus: level.requires_teacher_signoff ? 0 : Math.max(0, level.points || 0), treasure: Math.max(0, level.treasure_points || 0) };
}
