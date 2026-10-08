/**
 * When the app re-reads what the organization's administrators and Community Connect can change while a phone has the app
 * open: the kind of organization, which modules are on, the Home shortcuts and the other community settings, the access
 * levels. Nothing here needs an app update: the app reads these from the database, and this decides how soon a change shows.
 *
 *  - coming back to the app after at least FOREGROUND_REFRESH_MS away from the last read;
 *  - while the app stays open, every PERIODIC_REFRESH_MS;
 *  - pulling a screen down (the data version, src/providers/data-version.tsx), which every provider already follows.
 *
 * Pure, unit-tested in src/lib/__tests__/foreground.test.ts. The timer is src/providers/foreground.tsx.
 */

/** Coming back to the app re-reads when the last read is older than this (ms). */
export const FOREGROUND_REFRESH_MS = 30_000;

/** An app left open re-reads this often (ms). */
export const PERIODIC_REFRESH_MS = 5 * 60_000;

/** Is a read due? `lastAt` is when the last one happened (null: never). */
export function refreshDue(lastAt: number | null, now: number, minMs: number = FOREGROUND_REFRESH_MS): boolean {
  return lastAt === null || now - lastAt >= minMs || now < lastAt;
}
