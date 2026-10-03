/**
 * Pure rules behind Home's Plan a special day row (src/features/home-rails.tsx): which of the family's special
 * days it shows. The rest of Home's tiles are built in home-rail-items.ts. Unit-tested in
 * src/features/__tests__/home-rules.test.ts.
 */
import { addMonths, daysBetween, parseISODate } from '@/lib/format';

import { specialDayDismissKey } from './event-rules';
import { SPECIAL_DAY_LIMIT, SPECIAL_DAY_WINDOW_MONTHS } from './home-rail-items';

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
 * Home's alerts, split by where they show: the urgent ones above the first row (they are meant to be seen first), the
 * important and informational ones under it with the other notices, so that an alert arriving late does not push Today down.
 * The order given (urgent first, as api/home listAlerts sorts them) is kept.
 */
export function splitAlerts<A extends { severity: string }>(alerts: readonly A[]): { urgent: A[]; other: A[] } {
  return { urgent: alerts.filter((a) => a.severity === 'urgent'), other: alerts.filter((a) => a.severity !== 'urgent') };
}

/**
 * The days of the Plan a special day row: those coming within the next two calendar months, soonest first, at most
 * `limit`. The window runs from `today` (the community's date, today counts) to the same day two months on, inclusive:
 * Oct 2 to Dec 2, Dec 15 to Feb 15, and for a day that month does not have the last day of the month (Dec 31 to Feb 28,
 * or 29 in a leap year). Empty means the whole row is hidden. A day further off waits until it comes inside the window.
 */
export function upcomingSpecialDays<D extends HomeSpecialDayFields>(
  rows: readonly DayNext<D>[],
  hidden: readonly string[],
  today: string,
  months: number = SPECIAL_DAY_WINDOW_MONTHS,
  limit: number = SPECIAL_DAY_LIMIT,
): { day: D; next: string; inDays: number }[] {
  if (!parseISODate(today)) return [];
  const last = addMonths(today, months);
  return homeSpecialDays(rows, hidden)
    .filter((r) => parseISODate(r.next) !== null && daysBetween(today, r.next) >= 0 && daysBetween(r.next, last) >= 0)
    .map((r) => ({ ...r, inDays: daysBetween(today, r.next) }))
    .slice(0, Math.max(0, limit));
}
