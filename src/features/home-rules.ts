/**
 * Pure rules behind Home's Plan a special day row (src/features/home-rails.tsx): which of the family's special
 * days it shows. The rest of Home's tiles are built in home-rail-items.ts. Unit-tested in
 * src/features/__tests__/home-rules.test.ts.
 */
import { daysBetween } from '@/lib/format';

import { specialDayDismissKey } from './event-rules';
import { SPECIAL_DAY_LIMIT, SPECIAL_DAY_WINDOW_DAYS } from './home-rail-items';

/** The fields of a saved special day these rules read (app.special_days). */
export type HomeSpecialDayFields = { id: string; show_on_home: boolean; reminder_days_before: number };

/** A saved day with the date it next falls on (null while a tithi's date is not published yet). */
export type DayNext<D extends HomeSpecialDayFields> = { day: D; next: string | null };

/**
 * The days Home may mention, soonest first: the family left "Show on Home"
 * on, the next date is known, and nobody chose "Not this year" for that
 * year's occurrence (`hidden` holds specialDayDismissKey values).
 */
export function homeSpecialDays<D extends HomeSpecialDayFields>(rows: readonly DayNext<D>[], hidden: readonly string[]): { day: D; next: string }[] {
  return rows
    .filter((r): r is { day: D; next: string } => r.day.show_on_home && typeof r.next === 'string' && r.next.length > 0)
    .filter((r) => !hidden.includes(specialDayDismissKey(r.day.id, r.next)))
    .sort((a, b) => a.next.localeCompare(b.next) || a.day.id.localeCompare(b.day.id));
}

/**
 * The days of the Plan a special day row: those coming within the next two months (`withinDays`, today
 * counts), soonest first, at most `limit`. Empty means the whole row is hidden. A day further off waits until
 * it comes inside the window.
 */
export function upcomingSpecialDays<D extends HomeSpecialDayFields>(
  rows: readonly DayNext<D>[],
  hidden: readonly string[],
  today: string,
  withinDays: number = SPECIAL_DAY_WINDOW_DAYS,
  limit: number = SPECIAL_DAY_LIMIT,
): { day: D; next: string; inDays: number }[] {
  if (!today) return [];
  return homeSpecialDays(rows, hidden)
    .map((r) => ({ ...r, inDays: daysBetween(today, r.next) }))
    .filter((r) => Number.isFinite(r.inDays) && r.inDays >= 0 && r.inDays <= withinDays)
    .slice(0, Math.max(0, limit));
}
