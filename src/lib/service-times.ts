/**
 * The times Today's "service_times" variant shows (src/features/service-times.tsx): the rows of the community's own "timings"
 * guide page (a | What | When | table, src/features/guide.ts parseTimingsTable). Pure, so the rule is unit-tested.
 */
export type ServiceTime = { what: string; when: string };

/** How many times Today's card lists; the rest are one tap away on the Timings page. */
export const SERVICE_TIMES_SHOWN = 3;

/** The rows to list: those with both a name and a time, a repeated row once, the first few. */
export function serviceTimeRows(rows: readonly ServiceTime[], limit: number = SERVICE_TIMES_SHOWN): ServiceTime[] {
  const out: ServiceTime[] = [];
  for (const r of rows) {
    const what = r.what.trim();
    const when = r.when.trim();
    if (!what || !when) continue;
    if (out.some((x) => x.what === what && x.when === when)) continue;
    out.push({ what, when });
    if (out.length >= limit) break;
  }
  return out;
}
