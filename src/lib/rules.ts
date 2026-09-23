/**
 * Business rules the app needs for DISPLAY. Anything that must hold regardless
 * of caller lives in Postgres (RLS + RPCs); these mirror those rules so the UI
 * can explain them, never to replace them.
 */
import { addDays, daysBetween, formatTime, joinNames, parseISODate } from './format';

export const ADULT_AGE = 18;
export const SENIOR_AGE = 65;
export const LUNCH_CHILD_AGE = 12;

/** Completed years between a DOB and a date (both 'YYYY-MM-DD'); null if DOB unknown. */
export function ageOn(dob: string | null | undefined, onDate: string): number | null {
  const b = parseISODate(dob);
  const t = parseISODate(onDate);
  if (!b || !t) return null;
  let age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age -= 1;
  return age;
}

/**
 * Adult = 18+ OR unknown date of birth. Mirrors app.i_am_adult(), which gates
 * money, RSVPs, bolis and pledges in RLS.
 */
export function isAdult(dob: string | null | undefined, today: string): boolean {
  const age = ageOn(dob, today);
  return age == null || age >= ADULT_AGE;
}

export function isUnder12(dob: string | null | undefined, onDate: string): boolean {
  const age = ageOn(dob, onDate);
  return age != null && age < LUNCH_CHILD_AGE;
}

export function isSenior(dob: string | null | undefined, onDate: string): boolean {
  const age = ageOn(dob, onDate);
  return age != null && age >= SENIOR_AGE;
}

// ---------------------------------------------------------------------------
// Digital bolis (mirrors app.boli_minimum / place_boli_entry)
// ---------------------------------------------------------------------------

/** Minimum next pledge: the floor when there are no pledges, else top + step. */
export function boliMinimumCents(topCents: number | null | undefined, floorCents: number, stepCents: number): number {
  return topCents == null || topCents <= 0 ? floorCents : topCents + stepCents;
}

/** Never let the stepper sit below the current minimum. */
export function clampPledge(pledgeCents: number, minCents: number): number {
  return Math.max(pledgeCents, minCents);
}

/** One press of − / +, in steps of the boli's step amount, floored at the minimum. */
export function stepPledge(pledgeCents: number, stepCents: number, direction: 1 | -1, minCents: number): number {
  const step = stepCents > 0 ? stepCents : 100;
  return clampPledge(clampPledge(pledgeCents, minCents) + direction * step, minCents);
}

export function canStepDown(pledgeCents: number, stepCents: number, minCents: number): boolean {
  return pledgeCents - (stepCents > 0 ? stepCents : 100) >= minCents;
}

export type BoliStatus = 'closed' | 'mine_top' | 'pledged_more' | 'no_pledges' | 'open';

export function boliStatus(s: { mineCents: number | null | undefined; topCents: number | null | undefined; entries: number; closed: boolean }): BoliStatus {
  const mine = s.mineCents ?? 0;
  const top = s.topCents ?? 0;
  if (s.closed) return 'closed';
  if (mine > 0 && mine >= top) return 'mine_top';
  if (mine > 0 && mine < top) return 'pledged_more';
  if (s.entries === 0) return 'no_pledges';
  return 'open';
}

// ---------------------------------------------------------------------------
// Lunch slots (assignment happens in app.assign_lunch_for_rsvp at check-in)
// ---------------------------------------------------------------------------

export type LunchAttendee = {
  name: string;
  checkedIn: boolean;
  slotStartsAt: string | null;
};

export type LunchGroup = { startsAt: string; time: string; names: string[]; isFirstSlot: boolean };

export type LunchCard =
  | { state: 'not_checked_in' }
  | { state: 'assigning' }
  | { state: 'ready'; groups: LunchGroup[]; nowServing: string | null };

/**
 * Group a family's attendees by assigned lunch slot for the Home lunch card
 * and the tickets screen.
 */
export function lunchCard(
  attendees: LunchAttendee[],
  slots: { starts_at: string; status: string }[],
  timeZone?: string | null,
): LunchCard {
  const checked = attendees.filter((a) => a.checkedIn);
  if (checked.length === 0) return { state: 'not_checked_in' };
  const assigned = checked.filter((a) => a.slotStartsAt);
  if (assigned.length === 0) return { state: 'assigning' };
  const firstSlot = [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]?.starts_at ?? null;
  const byTime = new Map<string, string[]>();
  for (const a of assigned) {
    const key = a.slotStartsAt as string;
    byTime.set(key, [...(byTime.get(key) ?? []), a.name]);
  }
  const groups = [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([startsAt, names]) => ({
      startsAt,
      time: formatTime(startsAt, timeZone),
      names,
      isFirstSlot: firstSlot != null && new Date(startsAt).getTime() === new Date(firstSlot).getTime(),
    }));
  const serving = slots.find((s) => s.status === 'now_serving');
  return { state: 'ready', groups, nowServing: serving ? formatTime(serving.starts_at, timeZone) : null };
}

/** One line per group for the lunch card: "Priya and Rahul · 12:45 PM". */
export function lunchLines(card: LunchCard): string[] {
  if (card.state !== 'ready') return [];
  return card.groups.map((g) => `${joinNames(g.names)} · ${g.time}`);
}

// ---------------------------------------------------------------------------
// My Jain Way streaks
// ---------------------------------------------------------------------------

export type StreakRow = { current_days: number; longest_days: number; last_logged_on: string | null } | null;

export type StreakDisplay = {
  /** Streak that still counts today (0 once a whole day was missed). */
  days: number;
  best: number;
  /** Today already completed. */
  completedToday: boolean;
  /** Still alive but today is not complete yet. */
  atRisk: boolean;
};

/** The server extends the streak on the day all selected practices are done. */
export function streakDisplay(row: StreakRow, today: string): StreakDisplay {
  if (!row || !row.last_logged_on) return { days: 0, best: row?.longest_days ?? 0, completedToday: false, atRisk: false };
  const gap = daysBetween(row.last_logged_on, today);
  if (gap <= 0) return { days: row.current_days, best: row.longest_days, completedToday: true, atRisk: false };
  if (gap === 1) return { days: row.current_days, best: row.longest_days, completedToday: false, atRisk: true };
  return { days: 0, best: row.longest_days, completedToday: false, atRisk: false };
}

/** "12-day streak" / "No streak yet". */
export function streakLabel(days: number): string {
  if (days <= 0) return 'No streak yet';
  return days === 1 ? '1-day streak' : `${days}-day streak`;
}

// ---------------------------------------------------------------------------
// Tithi
// ---------------------------------------------------------------------------

export type TithiDay = { tithi: string; month_name: string; paksha: string };

/** Short calendar-cell label: "Sud 11", "Vad 3", "Punam", "Amas". */
export function tithiShort(t: TithiDay): string {
  const raw = t.tithi.trim();
  if (/^(sud|vad)\b/i.test(raw)) return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (/^\d+$/.test(raw)) return `${t.paksha.charAt(0).toUpperCase()}${t.paksha.slice(1).toLowerCase()} ${raw}`;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Long label: "Bhadarva sud 11", "Aso Punam". */
export function tithiLabel(t: TithiDay): string {
  const short = tithiShort(t);
  const lowered = /^(sud|vad)\b/i.test(short) ? short.charAt(0).toLowerCase() + short.slice(1) : short;
  return `${t.month_name.trim()} ${lowered}`;
}

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/**
 * Organization IDs (external_ids kinds 'org_member' / 'org_household') are
 * displayed exactly as the organization issued them — never parsed as numbers,
 * so significant leading zeros survive ("0417"). See connect-crm 0015.
 */
export function orgIdDisplay(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return v.length ? v : null;
}

/** "JSH member ID 0417 · Connect JSH-10421" (either part omitted when absent). */
export function identifierLine(parts: { orgLabel: string; orgId: string | null; connectNumber: string | null }): string {
  const out: string[] = [];
  if (parts.orgId) out.push(`${parts.orgLabel} ${parts.orgId}`);
  if (parts.connectNumber) out.push(`Connect ${parts.connectNumber}`);
  return out.join(' · ');
}

// ---------------------------------------------------------------------------
// Pathshala attendance QR (connect-crm 0017): the class screen shows
// connect:pathshala-attendance?session=<uuid>&token=<token>
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAttendanceQr(text: string): { session: string; token: string } | null {
  const m = /^connect:pathshala-attendance\?(.+)$/i.exec(text.trim());
  if (!m) return null;
  const params: Record<string, string> = {};
  for (const pair of m[1].split('&')) {
    const eq = pair.indexOf('=');
    const k = eq < 0 ? pair : pair.slice(0, eq);
    const v = eq < 0 ? '' : pair.slice(eq + 1);
    try {
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    } catch {
      return null;
    }
  }
  const session = params.session ?? '';
  const token = params.token ?? '';
  return UUID_RE.test(session) && token.length > 0 ? { session, token } : null;
}

// ---------------------------------------------------------------------------
// Pledges and giving
// ---------------------------------------------------------------------------

export type PledgeLike = {
  amount_cents: number;
  paid_cents: number;
  status: string;
  pledged_at: string;
  closed_at: string | null;
};

export function isOpenPledge(p: Pick<PledgeLike, 'status'>): boolean {
  return p.status === 'open' || p.status === 'partially_paid';
}

export function openBalanceCents(p: PledgeLike): number {
  return isOpenPledge(p) ? Math.max(0, p.amount_cents - p.paid_cents) : 0;
}

/** Group by the year of the PLEDGE date (Family pledges screen), newest first. */
export function groupPledgesByYear<T extends PledgeLike>(pledges: T[]): { year: number; pledges: T[]; pledgedCents: number; paidCents: number }[] {
  const map = new Map<number, T[]>();
  for (const p of pledges) {
    const y = Number(p.pledged_at.slice(0, 4));
    map.set(y, [...(map.get(y) ?? []), p]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, list]) => ({
      year,
      pledges: list,
      pledgedCents: list.reduce((s, p) => s + p.amount_cents, 0),
      paidCents: list.reduce((s, p) => s + p.paid_cents, 0),
    }));
}

export type PledgeFilter = 'all' | 'open' | 'closed';

export function filterPledges<T extends PledgeLike>(pledges: T[], filter: PledgeFilter, year: number | null): T[] {
  return pledges.filter((p) => {
    if (year != null && Number(p.pledged_at.slice(0, 4)) !== year) return false;
    if (filter === 'open') return isOpenPledge(p);
    if (filter === 'closed') return !isOpenPledge(p);
    return true;
  });
}

const PER_YEAR: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1, special_day: 1 };

/** Approximate yearly total of a recurring gift. */
export function annualEstimateCents(amountCents: number, frequency: string): number {
  return amountCents * (PER_YEAR[frequency] ?? 1);
}

/** RSVP commitment total: per person × attendees, or the family lump sum. */
export function commitmentTotalCents(mode: 'none' | 'per_person' | 'lump_sum', unitCents: number, people: number): number {
  if (mode === 'per_person') return unitCents * Math.max(0, people);
  if (mode === 'lump_sum') return unitCents;
  return 0;
}

// ---------------------------------------------------------------------------
// Special days
// ---------------------------------------------------------------------------

/** Next yearly occurrence (>= today) of a calendar date; Feb 29 falls back to Feb 28. */
export function nextOccurrence(dateISO: string, today: string): string | null {
  const d = parseISODate(dateISO);
  const t = parseISODate(today);
  if (!d || !t) return null;
  const candidate = (y: number) => {
    const day = d.m === 2 && d.d === 29 && !isLeap(y) ? 28 : d.d;
    return `${y}-${String(d.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  const thisYear = candidate(t.y);
  return daysBetween(today, thisYear) >= 0 ? thisYear : candidate(t.y + 1);
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** A special day is "soon" inside its reminder window (default 14 days). */
export function isWithinReminder(nextDate: string | null, today: string, reminderDays: number): boolean {
  if (!nextDate) return false;
  const n = daysBetween(today, nextDate);
  return n >= 0 && n <= reminderDays;
}

/** Last 7 days (oldest first) for the week row on My Jain Way. */
export function lastSevenDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
}
