/**
 * Pure rules for the Give tab and the screens reachable from it. No I/O,
 * no React: everything here is unit-tested (features/__tests__/give-rules).
 * Money is integer cents; formatting happens in the screens.
 */

import { addDays, formatTime, parseISODate, toISODate, weekdayOf, zonedParts } from '@/lib/format';

// ---------------------------------------------------------------------------
// Opportunity kinds (app.opportunities.kind / options, migration 0022)
// ---------------------------------------------------------------------------

export type OpportunityKind = 'fixed' | 'tier' | 'multi' | 'amount' | 'open';

/** A tier tile or a multi (pujan) row. `key` is what the pledge records in opportunity_option. */
export type OpportunityOption = { key: string; label: string; amountCents: number; note: string | null; fixed: boolean; recognition: string | null };

export function opportunityKind(kind: string | null | undefined): OpportunityKind {
  return kind === 'fixed' || kind === 'tier' || kind === 'multi' || kind === 'open' ? kind : 'amount';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function centsOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Tier / multi options from the jsonb column. Rows without a key, label or a
 * positive amount are dropped (the portal validates on save; the app never
 * guesses an amount).
 */
export function parseOptions(options: unknown): OpportunityOption[] {
  if (!Array.isArray(options)) return [];
  const out: OpportunityOption[] = [];
  const seen = new Set<string>();
  for (const raw of options) {
    if (!isRecord(raw)) continue;
    const key = typeof raw.key === 'string' ? raw.key.trim() : '';
    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    const amountCents = centsOf(raw.amount_cents);
    if (!key || !label || amountCents === null || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label,
      amountCents,
      note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null,
      fixed: raw.fixed !== false,
      recognition: typeof raw.recognition === 'string' && raw.recognition.trim() ? raw.recognition.trim() : null,
    });
  }
  return out;
}

/** Preset amounts for the `amount` kind: [{amount_cents}] (also accepts bare numbers), ascending, unique. */
export function parsePresets(options: unknown): number[] {
  if (!Array.isArray(options)) return [];
  const set = new Set<number>();
  for (const raw of options) {
    const c = isRecord(raw) ? centsOf(raw.amount_cents) : centsOf(raw);
    if (c !== null) set.add(c);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * The amount tiles for an "amount" opportunity: its presets, or — when the
 * center set only a suggested amount (amount_cents) and no presets — that one
 * amount, so the screen offers what the Give list advertises ("From $5K")
 * instead of an empty "Your amount" box. "Other" stays available either way.
 */
export function presetAmounts(o: { kind: string; options: unknown; amount_cents: number | null }): number[] {
  const presets = parsePresets(o.options);
  if (presets.length || opportunityKind(o.kind) !== 'amount') return presets;
  return o.amount_cents && o.amount_cents > 0 ? [o.amount_cents] : [];
}

/** The "From $X" amount on the Give list; null means "Any amount". */
export function fromAmountCents(o: { kind: string; options: unknown; amount_cents: number | null; min_amount_cents: number | null }): number | null {
  const kind = opportunityKind(o.kind);
  if (kind === 'tier' || kind === 'multi') {
    const amounts = parseOptions(o.options).map((x) => x.amountCents);
    if (amounts.length) return Math.min(...amounts);
  }
  if (kind === 'amount') {
    const presets = parsePresets(o.options);
    if (presets.length) return Math.max(presets[0], o.min_amount_cents ?? 0);
  }
  return o.amount_cents ?? o.min_amount_cents ?? null;
}

export type Availability = { optionKey: string | null; taken: boolean; takenCount: number; slotsTaken: number; slotsTotal: number | null; goalPercent: number | null };

/** Keys of multi options another family already holds. */
export function takenKeys(rows: Availability[]): Set<string> {
  return new Set(rows.filter((r) => r.taken && r.optionKey).map((r) => r.optionKey as string));
}

export type SlotsLine =
  | { kind: 'multi'; taken: number; total: number }
  | { kind: 'goal'; percent: number }
  | { kind: 'slots'; taken: number; total: number }
  | { kind: 'families'; n: number };

/**
 * The bold availability line on the opportunity card:
 * multi → "2 of 8 already taken"; amount/open with a campaign goal → "41% of
 * campaign goal"; a limited quantity → "3 of 10 taken"; otherwise how many
 * families have taken part so far.
 */
export function slotsLine(kind: OpportunityKind, rows: Availability[], hasCampaignGoal: boolean): SlotsLine {
  const head = rows[0];
  const taken = head?.slotsTaken ?? 0;
  const total = head?.slotsTotal ?? null;
  if (kind === 'multi') return { kind: 'multi', taken, total: total ?? 0 };
  if ((kind === 'amount' || kind === 'open') && hasCampaignGoal && head?.goalPercent != null) return { kind: 'goal', percent: head.goalPercent };
  if (total != null && total > 0) return { kind: 'slots', taken, total };
  return { kind: 'families', n: taken };
}

/** Bar fill 0..1 from the availability rows; null when nothing is known. */
export function availabilityFraction(rows: Availability[]): number | null {
  const pct = rows[0]?.goalPercent;
  return pct == null ? null : Math.max(0, Math.min(100, pct)) / 100;
}

/** Selected total for a multi checklist; ignores keys that are unknown or taken. */
export function multiTotalCents(options: OpportunityOption[], selected: string[], taken: Set<string>): number {
  return options.filter((o) => selected.includes(o.key) && !taken.has(o.key)).reduce((s, o) => s + o.amountCents, 0);
}

// ---------------------------------------------------------------------------
// Family pledges: year groups
// ---------------------------------------------------------------------------

/**
 * Which year groups start open. With "All years", only the newest group that
 * is not in the future (normally the current year) is open and older years
 * are collapsed; picking one year opens it. The member's own taps override.
 */
export function isYearOpen(year: number, groupYears: number[], filterYear: number | null, currentYear: number, overrides: Record<number, boolean>): boolean {
  if (year in overrides) return overrides[year];
  if (filterYear !== null) return true;
  const eligible = groupYears.filter((y) => y <= currentYear);
  const openYear = eligible.length ? Math.max(...eligible) : Math.max(...groupYears);
  return year === openYear || year > currentYear;
}

// ---------------------------------------------------------------------------
// Recurring gifts
// ---------------------------------------------------------------------------

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'special_day';

/** Gifts per year; `special_day` = the number of family special days (at least 1). */
export function giftsPerYear(frequency: string, specialDayCount: number): number {
  switch (frequency) {
    case 'weekly':
      return 52;
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'special_day':
      return Math.max(1, specialDayCount);
    default:
      return 1;
  }
}

/** The prototype's "Starting" dates: the next 1st and the next 15th after today, soonest first. */
export function startDateChoices(today: string): string[] {
  const p = parseISODate(today);
  if (!p) return [];
  const next = (day: number) => {
    const candidate = toISODate(p.y, p.m, day);
    if (candidate > today) return candidate;
    return p.m === 12 ? toISODate(p.y + 1, 1, day) : toISODate(p.y, p.m + 1, day);
  };
  return [next(1), next(15)].sort();
}

export type EndChoice = 'until_stopped' | 'count12' | 'through_next_year';

/** Arguments for app.create_recurring_gift's end rule. */
export function endRule(choice: EndChoice, today: string): { kind: 'until_stopped' | 'count' | 'until_date'; count: number | null; on: string | null } {
  if (choice === 'count12') return { kind: 'count', count: 12, on: null };
  if (choice === 'through_next_year') {
    const y = (parseISODate(today)?.y ?? new Date().getFullYear()) + 1;
    return { kind: 'until_date', count: null, on: toISODate(y, 12, 31) };
  }
  return { kind: 'until_stopped', count: null, on: null };
}

/** Year the "Through {year}" option ends in. */
export function throughYear(today: string): number {
  return (parseISODate(today)?.y ?? new Date().getFullYear()) + 1;
}

/**
 * How a recurring gift reads on the list. Gifts created in the app
 * (create_recurring_gift / commit_labh) start as 'pending_payment_method'
 * (migration 0026): "Waiting for a payment method", never charged until the
 * payment worker attaches one and activates them.
 */
export type RecurringState = 'active' | 'paused' | 'waiting' | 'failed' | 'stopped';

export const WAITING_STATUS = 'pending_payment_method';

export function recurringState(g: { status: string }): RecurringState {
  switch (g.status) {
    case 'active':
      return 'active';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'stopped';
    case WAITING_STATUS:
      return 'waiting';
    default:
      return 'paused';
  }
}

// ---------------------------------------------------------------------------
// Labh
// ---------------------------------------------------------------------------

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Age turned on `onDate` (both 'YYYY-MM-DD'); null when unknown or not yet born. */
export function turningAge(dob: string | null | undefined, onDate: string | null): number | null {
  const b = parseISODate(dob);
  const d = parseISODate(onDate);
  if (!b || !d) return null;
  const age = d.y - b.y - (d.m < b.m || (d.m === b.m && d.d < b.d) ? 1 : 0);
  return age > 0 ? age : null;
}

export type Pronoun = 'her' | 'his' | 'their';

export function pronounFor(gender: string | null | undefined): Pronoun {
  const g = (gender ?? '').trim().toLowerCase();
  if (g === 'female' || g === 'f' || g === 'woman' || g === 'girl') return 'her';
  if (g === 'male' || g === 'm' || g === 'man' || g === 'boy') return 'his';
  return 'their';
}

// ---------------------------------------------------------------------------
// Satvik Store
// ---------------------------------------------------------------------------

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shortTime(ts: string, tz: string | null): string {
  // "9:00 PM" → "9 PM" as the prototype writes it.
  return formatTime(ts, tz).replace(':00 ', ' ');
}

/**
 * The store hero pill, e.g. { cutoff: "Thu 9 PM", days: ["Sat", "Sun"] }: the
 * soonest order cutoff still ahead, and the pickup days of every open window
 * that shares that cutoff. Null when no window is open.
 */
export function pickupPill(windows: { starts_at: string; order_cutoff_at: string; status?: string }[], now: Date, tz: string | null): { cutoff: string; days: string[] } | null {
  const upcoming = windows.filter((w) => (w.status ?? 'open') === 'open' && new Date(w.order_cutoff_at).getTime() > now.getTime());
  if (upcoming.length === 0) return null;
  const soonest = upcoming.reduce((a, w) => (new Date(w.order_cutoff_at) < new Date(a.order_cutoff_at) ? w : a));
  const same = upcoming.filter((w) => w.order_cutoff_at === soonest.order_cutoff_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const days: string[] = [];
  for (const w of same) {
    const d = DAY_SHORT[weekdayOf(zonedParts(new Date(w.starts_at), tz).iso)];
    if (!days.includes(d)) days.push(d);
  }
  const cut = zonedParts(new Date(soonest.order_cutoff_at), tz);
  return { cutoff: `${DAY_SHORT[cut.weekday]} ${shortTime(soonest.order_cutoff_at, tz)}`, days };
}

// ---------------------------------------------------------------------------
// Files in Supabase Storage
// ---------------------------------------------------------------------------

/**
 * A stored path as `{bucket, key}`. Paths may be written as "bucket/key" when
 * they start with the expected bucket name, or as a bare key inside the
 * default bucket. Full URLs are returned as `url`.
 */
export function storageRef(path: string | null | undefined, defaultBucket: string): { url: string } | { bucket: string; key: string } | null {
  const p = (path ?? '').trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return { url: p };
  const clean = p.replace(/^\/+/, '');
  if (clean.startsWith(`${defaultBucket}/`)) return { bucket: defaultBucket, key: clean.slice(defaultBucket.length + 1) };
  return { bucket: defaultBucket, key: clean };
}

// ---------------------------------------------------------------------------
// Dates used by several screens
// ---------------------------------------------------------------------------

/** The earliest date on or after `today` in a list ('YYYY-MM-DD'), or null. */
export function soonestOnOrAfter(dates: (string | null)[], today: string): string | null {
  const ok = dates.filter((d): d is string => !!d && d >= today).sort();
  return ok[0] ?? null;
}

/** Tomorrow at the center (the RPCs refuse start dates in the past). */
export function tomorrow(today: string): string {
  return addDays(today, 1);
}
