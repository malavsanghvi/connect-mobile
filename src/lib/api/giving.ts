import { parseOptions, WAITING_STATUS, type Availability } from '@/features/give/rules';

import type { Enums, Tables } from '../database.types';
import { AppError, check, maybe, must } from '../errors';
import { supabase } from '../supabase';

export type Pledge = Tables<'pledges'>;
export type Campaign = Tables<'campaigns'>;
export type Opportunity = Tables<'opportunities'>;
export type PledgeSource = Enums<'pledge_source'>;

/**
 * Insert an open pledge for the household. RLS (pledges_household_insert)
 * requires an adult of the household, status 'open', paid 0 and a
 * member-allowed source. The pledge number is issued by a trigger.
 */
export async function createPledge(args: {
  centerId: string;
  householdId: string;
  personId: string;
  userId: string;
  amountCents: number;
  source: PledgeSource;
  sourceRefId?: string | null;
  campaignId?: string | null;
  opportunityId?: string | null;
  fundId?: string | null;
  dedication?: string | null;
  anonymous?: boolean;
  recognitionName?: string | null;
  /** Tier or multi option key (opportunities.options[].key). */
  opportunityOption?: string | null;
}): Promise<{ id: string; pledge_number: string | null }> {
  if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) throw new AppError('Please choose an amount greater than $0.', 'invalid amount');
  return must(
    await supabase
      .from('pledges')
      .insert({
        center_id: args.centerId,
        household_id: args.householdId,
        pledged_by_person_id: args.personId,
        created_by: args.userId,
        amount_cents: args.amountCents,
        paid_cents: 0,
        status: 'open',
        source: args.source,
        source_ref_id: args.sourceRefId ?? null,
        campaign_id: args.campaignId ?? null,
        opportunity_id: args.opportunityId ?? null,
        fund_id: args.fundId ?? null,
        dedication: args.dedication ?? null,
        anonymous: args.anonymous ?? false,
        recognition_name: args.recognitionName ?? null,
        opportunity_option: args.opportunityOption ?? null,
      })
      .select('id, pledge_number')
      .single(),
    'save your pledge',
  );
}

export type GiveSummary = {
  year: number;
  givenThisYearCents: number;
  openCount: number;
  openCents: number;
  paidThisYearCents: number;
  recurringActive: number;
  recurringTotal: number;
  recurringYearlyCents: number;
};

const COUNTED_PAYMENT = ['captured', 'settled', 'pending_clearing', 'partially_refunded'];

export async function loadGiveSummary(householdId: string, year: number): Promise<GiveSummary> {
  const [paymentsRes, pledgesRes, recurringRes] = await Promise.all([
    supabase.from('payments').select('amount_cents, refunded_cents, status, received_on').eq('household_id', householdId).gte('received_on', `${year}-01-01`).lte('received_on', `${year}-12-31`),
    supabase.from('pledges').select('amount_cents, paid_cents, status').eq('household_id', householdId).in('status', ['open', 'partially_paid']),
    supabase.from('recurring_gifts').select('amount_cents, frequency, status').eq('household_id', householdId),
  ]);
  const payments = must(paymentsRes, 'load your giving');
  const open = must(pledgesRes, 'load your pledges');
  const recurring = must(recurringRes, 'load your recurring gifts');
  const given = payments.filter((p) => COUNTED_PAYMENT.includes(p.status)).reduce((s, p) => s + p.amount_cents - p.refunded_cents, 0);
  const active = recurring.filter((r) => r.status === 'active');
  const PER_YEAR: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1, special_day: 1 };
  return {
    year,
    givenThisYearCents: given,
    openCount: open.length,
    openCents: open.reduce((s, p) => s + Math.max(0, p.amount_cents - p.paid_cents), 0),
    paidThisYearCents: given,
    recurringActive: active.length,
    recurringTotal: recurring.length,
    recurringYearlyCents: active.reduce((s, r) => s + r.amount_cents * (PER_YEAR[r.frequency] ?? 1), 0),
  };
}

export type OpportunityWithCampaign = Opportunity & { campaign: Campaign | null };

export async function listOpportunities(centerId: string): Promise<OpportunityWithCampaign[]> {
  const [oppsRes, campaignsRes] = await Promise.all([
    supabase.from('opportunities').select('*').eq('center_id', centerId).eq('status', 'open').order('sort_order').limit(50),
    supabase.from('campaigns').select('*').eq('center_id', centerId).eq('status', 'published'),
  ]);
  const opps = must(oppsRes, 'load giving opportunities');
  const campaigns = must(campaignsRes, 'load giving opportunities');
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  // Only opportunities whose campaign is published are live for members.
  return opps.filter((o) => byId.has(o.campaign_id)).map((o) => ({ ...o, campaign: byId.get(o.campaign_id) ?? null }));
}

export async function getOpportunity(id: string): Promise<OpportunityWithCampaign> {
  const opp = must(await supabase.from('opportunities').select('*').eq('id', id).single(), 'load this opportunity');
  const campaign = must(await supabase.from('campaigns').select('*').eq('id', opp.campaign_id).limit(1), 'load this opportunity')[0] ?? null;
  return { ...opp, campaign };
}

/** Which pledge source a campaign's opportunities create (limited to member-allowed sources). */
export function pledgeSourceFor(campaign: Campaign | null): PledgeSource {
  switch (campaign?.kind) {
    case 'sponsorship':
      return 'sponsorship';
    case 'construction':
      return 'construction';
    case 'pathshala':
      return 'pathshala_fee';
    case 'membership':
      return 'membership_fee';
    default:
      return 'general';
  }
}

export type PledgeWithPeople = Pledge & { pledgedByName: string | null; campaignName: string | null; opportunityName: string | null; optionLabel: string | null };

export async function listPledges(householdId: string, names: Map<string, string>): Promise<{ pledges: PledgeWithPeople[]; paymentsByYear: Record<number, number>; statements: Tables<'statements'>[] }> {
  const [pledgesRes, paymentsRes, statementsRes] = await Promise.all([
    supabase.from('pledges').select('*').eq('household_id', householdId).order('pledged_at', { ascending: false }).limit(500),
    supabase.from('payments').select('amount_cents, refunded_cents, status, received_on').eq('household_id', householdId).limit(2000),
    supabase.from('statements').select('*').eq('household_id', householdId).order('tax_year', { ascending: false }),
  ]);
  const pledges = must(pledgesRes, 'load your pledges');
  const payments = must(paymentsRes, 'load your payments');
  const statements = must(statementsRes, 'load your statements');
  const campaignIds = [...new Set(pledges.map((p) => p.campaign_id).filter((x): x is string => !!x))];
  const oppIds = [...new Set(pledges.map((p) => p.opportunity_id).filter((x): x is string => !!x))];
  const [campaigns, opps] = await Promise.all([
    campaignIds.length ? supabase.from('campaigns').select('id, name').in('id', campaignIds).then((r) => must(r, 'load your pledges')) : Promise.resolve([]),
    oppIds.length ? supabase.from('opportunities').select('id, name, options').in('id', oppIds).then((r) => must(r, 'load your pledges')) : Promise.resolve([]),
  ]);
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const oppById = new Map(opps.map((o) => [o.id, o]));
  const optionLabel = (oppId: string | null, key: string | null): string | null => {
    if (!oppId || !key) return null;
    return parseOptions(oppById.get(oppId)?.options).find((o) => o.key === key)?.label ?? null;
  };
  const paymentsByYear: Record<number, number> = {};
  for (const p of payments) {
    if (!COUNTED_PAYMENT.includes(p.status)) continue;
    const y = Number(p.received_on.slice(0, 4));
    paymentsByYear[y] = (paymentsByYear[y] ?? 0) + p.amount_cents - p.refunded_cents;
  }
  return {
    pledges: pledges.map((p) => ({
      ...p,
      pledgedByName: p.pledged_by_person_id ? (names.get(p.pledged_by_person_id) ?? null) : null,
      campaignName: p.campaign_id ? (campaignName.get(p.campaign_id) ?? null) : null,
      opportunityName: p.opportunity_id ? (oppById.get(p.opportunity_id)?.name ?? null) : null,
      optionLabel: optionLabel(p.opportunity_id, p.opportunity_option),
    })),
    paymentsByYear,
    statements,
  };
}

export type RecurringGift = Tables<'recurring_gifts'> & { purpose: string };

export async function listRecurring(householdId: string): Promise<RecurringGift[]> {
  const gifts = must(await supabase.from('recurring_gifts').select('*').eq('household_id', householdId).order('created_at', { ascending: false }), 'load your recurring gifts');
  const campaignIds = [...new Set(gifts.map((g) => g.campaign_id).filter((x): x is string => !!x))];
  const fundIds = [...new Set(gifts.map((g) => g.fund_id).filter((x): x is string => !!x))];
  const [campaigns, funds] = await Promise.all([
    campaignIds.length ? supabase.from('campaigns').select('id, name').in('id', campaignIds).then((r) => must(r, 'load your recurring gifts')) : Promise.resolve([]),
    fundIds.length ? supabase.from('funds').select('id, name').in('id', fundIds).then((r) => must(r, 'load your recurring gifts')) : Promise.resolve([]),
  ]);
  const cName = new Map(campaigns.map((c) => [c.id, c.name]));
  const fName = new Map(funds.map((f) => [f.id, f.name]));
  return gifts.map((g) => ({ ...g, purpose: (g.campaign_id && cName.get(g.campaign_id)) || (g.fund_id && fName.get(g.fund_id)) || 'General fund' }));
}

export async function setRecurringStatus(id: string, status: 'active' | 'paused'): Promise<void> {
  check(await supabase.from('recurring_gifts').update({ status }).eq('id', id), status === 'paused' ? 'pause this recurring gift' : 'resume this recurring gift');
}

// ---------------------------------------------------------------------------
// Opportunity availability (app.opportunity_availability, migration 0022)
// ---------------------------------------------------------------------------

export async function opportunityAvailability(opportunityId: string): Promise<Availability[]> {
  const rows = must(await supabase.rpc('opportunity_availability', { p_opportunity: opportunityId }), 'check availability');
  return rows.map((r) => ({
    optionKey: r.option_key ?? null,
    taken: !!r.taken,
    takenCount: r.taken_count ?? 0,
    slotsTaken: r.slots_taken ?? 0,
    slotsTotal: r.slots_total ?? null,
    goalPercent: r.goal_percent ?? null,
  }));
}

export type OpportunityListItem = OpportunityWithCampaign & { availability: Availability[] };

/** Give list: open opportunities with their live availability. */
export async function listOpportunitiesWithAvailability(centerId: string): Promise<OpportunityListItem[]> {
  const opps = await listOpportunities(centerId);
  const availability = await Promise.all(opps.map((o) => opportunityAvailability(o.id)));
  return opps.map((o, i) => ({ ...o, availability: availability[i] }));
}

// ---------------------------------------------------------------------------
// Recurring gifts
// ---------------------------------------------------------------------------

export type GivingPurpose = { key: string; label: string; sub: string | null; fundId: string | null; campaignId: string | null };

/** What a recurring gift can go towards: the center's active funds, then its published campaigns. */
export async function listGivingPurposes(centerId: string): Promise<GivingPurpose[]> {
  const [fundsRes, campaignsRes] = await Promise.all([
    supabase.from('funds').select('id, name').eq('center_id', centerId).eq('active', true).order('name'),
    supabase.from('campaigns').select('id, name, description, fund_id').eq('center_id', centerId).eq('status', 'published').order('name'),
  ]);
  const funds = must(fundsRes, 'load what you can give towards');
  const campaigns = must(campaignsRes, 'load what you can give towards');
  return [
    ...funds.map((f) => ({ key: `fund:${f.id}`, label: f.name, sub: null, fundId: f.id, campaignId: null })),
    ...campaigns.map((c) => ({ key: `campaign:${c.id}`, label: c.name, sub: c.description?.trim() || null, fundId: c.fund_id, campaignId: c.id })),
  ];
}

/**
 * New recurring gift via app.create_recurring_gift (adults of the household).
 * It is stored waiting for a payment method and is never charged until the
 * payment worker attaches one.
 */
export async function createRecurringGift(args: {
  householdId: string;
  fundId: string | null;
  campaignId: string | null;
  amountCents: number;
  frequency: string;
  startsOn: string;
  endKind: 'until_stopped' | 'count' | 'until_date';
  endCount: number | null;
  endOn: string | null;
  specialDayId?: string | null;
}): Promise<string> {
  if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) throw new AppError('Please choose an amount greater than $0.', 'invalid amount');
  return must(
    await supabase.rpc('create_recurring_gift', {
      p_household: args.householdId,
      // The RPC accepts null for either; the generated Args type marks them required.
      p_fund: args.fundId as string,
      p_campaign: args.campaignId as string,
      p_amount_cents: args.amountCents,
      p_frequency: args.frequency,
      p_starts_on: args.startsOn,
      p_end_kind: args.endKind,
      p_end_count: (args.endCount ?? null) as number,
      p_end_on: (args.endOn ?? null) as string,
      p_special_day: (args.specialDayId ?? null) as string,
    }),
    'set up your recurring gift',
  );
}

export type PayMethodChoice = 'card' | 'ach';

/** Record how the family wants to pay (card or bank account). No card or bank details are stored here. */
export async function setRecurringMethod(id: string, method: PayMethodChoice): Promise<void> {
  check(await supabase.from('recurring_gifts').update({ method }).eq('id', id), 'save how you want to pay');
}

/** Edit an existing gift's purpose, amount, frequency and end rule (status is never changed here). */
export async function updateRecurringGift(
  id: string,
  fields: { fundId: string | null; campaignId: string | null; amountCents: number; frequency: string; endKind: string; endCount: number | null; endOn: string | null; method: PayMethodChoice },
): Promise<void> {
  if (!Number.isInteger(fields.amountCents) || fields.amountCents <= 0) throw new AppError('Please choose an amount greater than $0.', 'invalid amount');
  check(
    await supabase
      .from('recurring_gifts')
      .update({
        fund_id: fields.fundId,
        campaign_id: fields.campaignId,
        amount_cents: fields.amountCents,
        frequency: fields.frequency,
        end_kind: fields.endKind,
        end_count: fields.endKind === 'count' ? fields.endCount : null,
        end_on: fields.endKind === 'until_date' ? fields.endOn : null,
        method: fields.method,
      })
      .eq('id', id),
    'save your recurring gift',
  );
}

export async function getRecurringGift(id: string): Promise<Tables<'recurring_gifts'>> {
  return must(await supabase.from('recurring_gifts').select('*').eq('id', id).single(), 'load this recurring gift');
}

export { WAITING_STATUS };

// ---------------------------------------------------------------------------
// Labh on a special day (app.commit_labh, migration 0022)
// ---------------------------------------------------------------------------

export type LabhOption = Tables<'labh_options'> & { purpose: string | null };

export type LabhData = {
  day: Tables<'special_days'>;
  options: LabhOption[];
  /** Tithi on the day's next date, from the published tithi table (null when not published). */
  tithi: { tithi: string; month_name: string } | null;
};

export async function loadLabh(centerId: string, dayId: string, nextDate: (day: Tables<'special_days'>) => Promise<string | null>): Promise<LabhData & { next: string | null }> {
  const [dayRes, optionsRes] = await Promise.all([
    supabase.from('special_days').select('*').eq('id', dayId).maybeSingle(),
    supabase.from('labh_options').select('*').eq('center_id', centerId).eq('active', true).order('sort_order').order('name'),
  ]);
  const day = maybe(dayRes, 'load this special day');
  if (!day) throw new AppError("We couldn't find this special day. It may have been removed.", `special day ${dayId} not visible`);
  const options = must(optionsRes, 'load the labh options');
  const fundIds = [...new Set(options.map((o) => o.fund_id).filter((x): x is string => !!x))];
  const campaignIds = [...new Set(options.map((o) => o.campaign_id).filter((x): x is string => !!x))];
  const [funds, campaigns, next] = await Promise.all([
    fundIds.length ? supabase.from('funds').select('id, name').in('id', fundIds).then((r) => must(r, 'load the labh options')) : Promise.resolve([]),
    campaignIds.length ? supabase.from('campaigns').select('id, name').in('id', campaignIds).then((r) => must(r, 'load the labh options')) : Promise.resolve([]),
    nextDate(day),
  ]);
  const fName = new Map(funds.map((f) => [f.id, f.name]));
  const cName = new Map(campaigns.map((c) => [c.id, c.name]));
  let tithi: LabhData['tithi'] = null;
  if (next) {
    const t = maybe(
      await supabase.from('tithi_days').select('tithi, month_name, center_id').eq('gregorian', next).or(`center_id.eq.${centerId},center_id.is.null`).limit(1).maybeSingle(),
      'look up the tithi',
    );
    tithi = t ? { tithi: t.tithi, month_name: t.month_name } : null;
  }
  return {
    day,
    next,
    tithi,
    options: options.map((o) => ({ ...o, purpose: (o.campaign_id && cName.get(o.campaign_id)) || (o.fund_id && fName.get(o.fund_id)) || null })),
  };
}

/** One open pledge per chosen option (+ a yearly gift each when repeating). Returns the pledge numbers. */
export async function commitLabh(args: { dayId: string; optionIds: string[]; dedication: string; repeatYearly: boolean }): Promise<string[]> {
  if (args.optionIds.length === 0) throw new AppError('Choose at least one labh.', 'no labh options');
  return must(
    await supabase.rpc('commit_labh', { p_special_day: args.dayId, p_option_ids: args.optionIds, p_dedication: args.dedication.trim(), p_repeat_yearly: args.repeatYearly }),
    'save your labh',
  );
}

/** Open pledges of the household (Give → "Pay open balance"). */
export async function listOpenPledges(householdId: string): Promise<Pick<Pledge, 'id' | 'pledge_number' | 'amount_cents' | 'paid_cents'>[]> {
  return must(await supabase.from('pledges').select('id, pledge_number, amount_cents, paid_cents').eq('household_id', householdId).in('status', ['open', 'partially_paid']), 'load your pledges');
}
