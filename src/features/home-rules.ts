/**
 * Pure rules behind the Home cards (src/features/home.tsx, home-giving.tsx):
 * what goes in "Up next", which special day the Plan card offers, and the
 * slides of the rotating Giving card. Unit-tested in
 * src/features/__tests__/home-rules.test.ts.
 */
import { isWithinReminder } from '@/lib/rules';

import { specialDayDismissKey, tierLadder } from './event-rules';

// ---------------------------------------------------------------------------
// Up next
// ---------------------------------------------------------------------------

/** The rows of the "Up next" card, in the order they show. */
export const UP_NEXT_KINDS = ['confirm', 'lunch', 'nextEvent', 'specialDay'] as const;
export type UpNextKind = (typeof UP_NEXT_KINDS)[number];

export type UpNextInput = {
  /** The event whose RSVP waits for "Still coming?" (Home events `confirm`). */
  confirmEventId: string | null;
  /** Today's event with the family's lunch times (Home events `lunch`). */
  lunchEventId: string | null;
  /** The next published event (Home events `next`). */
  nextEventId: string | null;
  /** The special day whose reminder window has started (reminderSpecialDay). */
  specialDayId: string | null;
  /** Which rows this member may see: the community's modules (isHomeCardVisible) and adults-only rules. */
  show: Partial<Record<UpNextKind, boolean>>;
};

/**
 * What the "Up next" card lists, in order: the RSVP waiting to be confirmed,
 * today's lunch times, the next event and an upcoming special day. The next
 * event is left out when it is the event already shown to confirm or with
 * lunch times (one row per event). Empty means the card is hidden.
 */
export function upNextItems(input: UpNextInput): UpNextKind[] {
  const out: UpNextKind[] = [];
  const confirm = input.show.confirm === true && !!input.confirmEventId;
  const lunch = input.show.lunch === true && !!input.lunchEventId;
  if (confirm) out.push('confirm');
  if (lunch) out.push('lunch');
  const covered = [confirm ? input.confirmEventId : null, lunch ? input.lunchEventId : null];
  if (input.show.nextEvent === true && input.nextEventId && !covered.includes(input.nextEventId)) out.push('nextEvent');
  if (input.show.specialDay === true && input.specialDayId) out.push('specialDay');
  return out;
}

// ---------------------------------------------------------------------------
// Special days on Home
// ---------------------------------------------------------------------------

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

/** The special day "Up next" reminds about: the soonest whose reminder window (reminder_days_before) has started; null when none has. */
export function reminderSpecialDay<D extends HomeSpecialDayFields>(rows: readonly DayNext<D>[], today: string, hidden: readonly string[]): { day: D; next: string } | null {
  return homeSpecialDays(rows, hidden).find((r) => isWithinReminder(r.next, today, r.day.reminder_days_before)) ?? null;
}

/**
 * The family's next special day for the "Plan a special day" card, however
 * far off (a labh can be planned ahead). `excludeId` is the day "Up next"
 * already shows, so the two cards never offer the same day: the Plan card
 * moves on to the one after it, or is hidden when there is none.
 */
export function nextSpecialDay<D extends HomeSpecialDayFields>(rows: readonly DayNext<D>[], hidden: readonly string[], excludeId?: string | null): { day: D; next: string } | null {
  return homeSpecialDays(rows, hidden).find((r) => r.day.id !== excludeId) ?? null;
}

// ---------------------------------------------------------------------------
// Giving
// ---------------------------------------------------------------------------

/** The fields of an open opportunity (with its published campaign) a slide is built from. */
export type GivingOpportunity = {
  id: string;
  name: string;
  campaign_id: string;
  amount_cents: number | null;
  min_amount_cents: number | null;
  campaign: { name: string } | null;
};

export type GivingSlide = {
  /** Stable key: the campaign for a tier ladder, else the opportunity. */
  key: string;
  /** The opportunity "View and sponsor" opens. */
  opportunityId: string;
  title: string;
  /** "Gold $5,001 · Silver $2,501 · …" when the campaign has fixed levels; then the campaign is the title. */
  ladder: string | null;
  campaignName: string | null;
  /** The fixed or smallest amount (cents), null for any amount. */
  fromCents: number | null;
};

/**
 * One slide per open opportunity, in the portal's order, for the rotating
 * Giving card. A campaign whose opportunities are fixed levels (two or more
 * amounts) becomes one slide with its tier ladder, opening its first level,
 * so the card never rotates through "Gold", "Silver", "Bronze" one by one.
 */
export function givingSlides(opps: readonly GivingOpportunity[], format: (cents: number) => string): GivingSlide[] {
  const out: GivingSlide[] = [];
  const folded = new Set<string>();
  for (const opp of opps) {
    if (folded.has(opp.campaign_id)) continue;
    const ladder = opp.campaign ? tierLadder(opps.filter((o) => o.campaign_id === opp.campaign_id), format) : null;
    if (ladder && opp.campaign) {
      folded.add(opp.campaign_id);
      out.push({ key: `campaign:${opp.campaign_id}`, opportunityId: opp.id, title: opp.campaign.name, ladder, campaignName: opp.campaign.name, fromCents: null });
      continue;
    }
    const from = opp.amount_cents ?? opp.min_amount_cents;
    out.push({ key: `opportunity:${opp.id}`, opportunityId: opp.id, title: opp.name, ladder: null, campaignName: opp.campaign?.name ?? null, fromCents: typeof from === 'number' && from > 0 ? from : null });
  }
  return out;
}
