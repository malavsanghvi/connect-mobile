import { parseOptions, WAITING_STATUS, type Availability } from '@/features/give/rules';

import type { Enums, Tables } from '../database.types';
import { AppError, check, maybe, must } from '../errors';
import { supabase } from '../supabase';
import type { PledgePayment } from '../proofs';
import { openBalanceCents } from '../rules';
import { retargetActive } from '../wording';

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
  /** Open balance: amount - paid - soft credit, over the pledges that are Open or Partly paid (owner rule, 2026-10-15). */
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
    // A pledge fully covered by Soft credit has status soft_credit and adds nothing to the open balance; a partly covered one is subtracted below.
    supabase.from('pledges').select('amount_cents, paid_cents, soft_credit_cents, status, pledged_at, closed_at').eq('household_id', householdId).in('status', ['open', 'partially_paid']),
    supabase.from('recurring_gifts').select('amount_cents, frequency, status').eq('household_id', householdId),
  ]);
  const payments = must(paymentsRes, 'load your giving');
  const open = must(pledgesRes, 'load your pledges');
  const recurring = must(recurringRes, 'load your recurring gifts');
  const given = payments.filter((p) => COUNTED_PAYMENT.includes(p.status)).reduce((s, p) => s + p.amount_cents - p.refunded_cents, 0);
  const active = recurring.filter((r) => r.status === 'active');
  const payable = open.filter((p) => openBalanceCents(p) > 0);
  const PER_YEAR: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1, special_day: 1 };
  return {
    year,
    givenThisYearCents: given,
    openCount: payable.length,
    openCents: payable.reduce((s, p) => s + openBalanceCents(p), 0),
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

/**
 * Which pledge source a campaign's opportunities create (limited to member-allowed sources). A gift to a Pathshala-kind
 * campaign is an ordinary gift (`general`), never a fee: since connect-crm 0591 a member cannot insert a `pathshala_fee`
 * pledge (the database creates those itself, one per enrollment, when a family registers), and a gift is not a fee.
 */
export function pledgeSourceFor(campaign: Campaign | null): PledgeSource {
  switch (campaign?.kind) {
    case 'sponsorship':
      return 'sponsorship';
    case 'construction':
      return 'construction';
    case 'membership':
      return 'membership_fee';
    default:
      return 'general';
  }
}

export type PledgeWithPeople = Pledge & { pledgedByName: string | null; campaignName: string | null; opportunityName: string | null; optionLabel: string | null };

/** What each pledge is for: the names of its campaign and opportunity, and who pledged it. */
async function decoratePledges(pledges: Pledge[], names: Map<string, string>): Promise<PledgeWithPeople[]> {
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
  return pledges.map((p) => ({
    ...p,
    pledgedByName: p.pledged_by_person_id ? (names.get(p.pledged_by_person_id) ?? null) : null,
    campaignName: p.campaign_id ? (campaignName.get(p.campaign_id) ?? null) : null,
    opportunityName: p.opportunity_id ? (oppById.get(p.opportunity_id)?.name ?? null) : null,
    optionLabel: optionLabel(p.opportunity_id, p.opportunity_option),
  }));
}

/**
 * The family's pledges in every status and year, newest first. `select('*')` carries the Soft credit status and the new
 * columns (soft_credit_cents, reconciled_at; connect-crm 0865); the screens read them through lib/rules.
 */
export async function listPledges(householdId: string, names: Map<string, string>): Promise<{ pledges: PledgeWithPeople[]; paymentsByYear: Record<number, number>; statements: Tables<'statements'>[] }> {
  const [pledgesRes, paymentsRes, statementsRes] = await Promise.all([
    supabase.from('pledges').select('*').eq('household_id', householdId).order('pledged_at', { ascending: false }).limit(500),
    supabase.from('payments').select('amount_cents, refunded_cents, status, received_on').eq('household_id', householdId).limit(2000),
    supabase.from('statements').select('*').eq('household_id', householdId).order('tax_year', { ascending: false }),
  ]);
  const pledges = must(pledgesRes, 'load your pledges');
  const payments = must(paymentsRes, 'load your payments');
  const statements = must(statementsRes, 'load your statements');
  const paymentsByYear: Record<number, number> = {};
  for (const p of payments) {
    if (!COUNTED_PAYMENT.includes(p.status)) continue;
    const y = Number(p.received_on.slice(0, 4));
    paymentsByYear[y] = (paymentsByYear[y] ?? 0) + p.amount_cents - p.refunded_cents;
  }
  return { pledges: await decoratePledges(pledges, names), paymentsByYear, statements };
}

/** One pledge of the household, in any status and from any year (the Pledge details screen). Null when it is not one the family can read. */
export async function getPledgeDetail(householdId: string, pledgeId: string, names: Map<string, string>): Promise<PledgeWithPeople | null> {
  const rows = must(await supabase.from('pledges').select('*').eq('id', pledgeId).eq('household_id', householdId).limit(1), 'load this pledge');
  if (rows.length === 0) return null;
  return (await decoratePledges(rows, names))[0] ?? null;
}

/** The payments that credited one pledge, newest first, with what each put on it (an adult of the family reads them; failed and voided ones are left out). */
export async function listPledgePayments(pledgeId: string): Promise<PledgePayment[]> {
  const allocations = must(await supabase.from('payment_allocations').select('payment_id, amount_cents').eq('pledge_id', pledgeId), 'load the payments on this pledge');
  if (allocations.length === 0) return [];
  const ids = [...new Set(allocations.map((a) => a.payment_id))];
  const payments = must(
    await supabase.from('payments').select('id, method, status, received_on, receipt_number, check_number, amount_cents, reconciled_at').in('id', ids),
    'load the payments on this pledge',
  );
  const applied = new Map<string, number>();
  for (const a of allocations) applied.set(a.payment_id, (applied.get(a.payment_id) ?? 0) + a.amount_cents);
  return payments
    .filter((p) => p.status !== 'failed' && p.status !== 'voided')
    .map((p) => ({
      paymentId: p.id,
      method: p.method,
      receivedOn: p.received_on.slice(0, 10),
      receiptNumber: p.receipt_number,
      checkNumber: p.check_number,
      appliedCents: applied.get(p.id) ?? 0,
      totalCents: p.amount_cents,
      reconciledAt: p.reconciled_at,
    }))
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn));
}

export type RecurringGift = Tables<'recurring_gifts'> & { purpose: string };

/** What a gift is towards: the opportunity it renews, else its campaign, else its fund. */
function purposeOf(g: Pick<Tables<'recurring_gifts'>, 'opportunity_id' | 'campaign_id' | 'fund_id'>, names: { opportunities: Map<string, string>; campaigns: Map<string, string>; funds: Map<string, string> }): string {
  return (g.opportunity_id && names.opportunities.get(g.opportunity_id)) || (g.campaign_id && names.campaigns.get(g.campaign_id)) || (g.fund_id && names.funds.get(g.fund_id)) || 'General fund';
}

export async function listRecurring(householdId: string): Promise<RecurringGift[]> {
  const gifts = must(await supabase.from('recurring_gifts').select('*').eq('household_id', householdId).order('created_at', { ascending: false }), 'load your recurring gifts');
  const opportunityIds = [...new Set(gifts.map((g) => g.opportunity_id).filter((x): x is string => !!x))];
  const campaignIds = [...new Set(gifts.map((g) => g.campaign_id).filter((x): x is string => !!x))];
  const fundIds = [...new Set(gifts.map((g) => g.fund_id).filter((x): x is string => !!x))];
  const [opportunities, campaigns, funds] = await Promise.all([
    opportunityIds.length ? supabase.from('opportunities').select('id, name').in('id', opportunityIds).then((r) => must(r, 'load your recurring gifts')) : Promise.resolve([]),
    campaignIds.length ? supabase.from('campaigns').select('id, name').in('id', campaignIds).then((r) => must(r, 'load your recurring gifts')) : Promise.resolve([]),
    fundIds.length ? supabase.from('funds').select('id, name').in('id', fundIds).then((r) => must(r, 'load your recurring gifts')) : Promise.resolve([]),
  ]);
  const names = { opportunities: new Map(opportunities.map((o) => [o.id, o.name])), campaigns: new Map(campaigns.map((c) => [c.id, c.name])), funds: new Map(funds.map((f) => [f.id, f.name])) };
  return gifts.map((g) => ({ ...g, purpose: purposeOf(g, names) }));
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

/**
 * New recurring gift via app.create_recurring_gift (adults of the household).
 * It is stored waiting for a payment method and is never charged until the
 * payment worker attaches one. With `opportunityId` it renews that opportunity:
 * the database checks the opportunity allows recurring and the chosen frequency,
 * and takes the campaign and fund from it.
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
  opportunityId?: string | null;
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
      p_opportunity: (args.opportunityId ?? null) as string,
    }),
    'set up your recurring gift',
  );
}

export type PayMethodChoice = 'card' | 'ach';

/** Record how the family wants to pay (card or bank account). No card or bank details are stored here. */
export async function setRecurringMethod(id: string, method: PayMethodChoice): Promise<void> {
  check(await supabase.from('recurring_gifts').update({ method }).eq('id', id), 'save how you want to pay');
}

/** Edit an existing gift's amount, frequency, end rule and payment method. What it is towards and its status are never changed here. */
export async function updateRecurringGift(
  id: string,
  fields: { amountCents: number; frequency: string; endKind: string; endCount: number | null; endOn: string | null; method: PayMethodChoice },
): Promise<void> {
  if (!Number.isInteger(fields.amountCents) || fields.amountCents <= 0) throw new AppError('Please choose an amount greater than $0.', 'invalid amount');
  check(
    await supabase
      .from('recurring_gifts')
      .update({
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

export type RecurringForEdit = { gift: Tables<'recurring_gifts'>; purpose: string; opportunity: Opportunity | null };

/** One gift with what it is towards and, when it renews an opportunity, that opportunity's rules (null when it is no longer visible to the member). */
export async function loadRecurringForEdit(id: string): Promise<RecurringForEdit> {
  const gift = await getRecurringGift(id);
  const [opportunities, campaigns, funds] = await Promise.all([
    gift.opportunity_id ? supabase.from('opportunities').select('*').eq('id', gift.opportunity_id).limit(1).then((r) => must(r, 'load this recurring gift')) : Promise.resolve([] as Opportunity[]),
    gift.campaign_id ? supabase.from('campaigns').select('id, name').eq('id', gift.campaign_id).limit(1).then((r) => must(r, 'load this recurring gift')) : Promise.resolve([] as { id: string; name: string }[]),
    gift.fund_id ? supabase.from('funds').select('id, name').eq('id', gift.fund_id).limit(1).then((r) => must(r, 'load this recurring gift')) : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const opportunity = opportunities[0] ?? null;
  const names = {
    opportunities: new Map(opportunity ? [[opportunity.id, opportunity.name] as [string, string]] : []),
    campaigns: new Map(campaigns.map((c) => [c.id, c.name] as [string, string])),
    funds: new Map(funds.map((f) => [f.id, f.name] as [string, string])),
  };
  return { gift, purpose: purposeOf(gift, names), opportunity };
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

/** The center's active labh options in display order, each with what it supports (its campaign, else its fund). */
export async function loadLabhOptions(centerId: string): Promise<LabhOption[]> {
  const options = must(await supabase.from('labh_options').select('*').eq('center_id', centerId).eq('active', true).order('sort_order').order('name'), 'load the labh options');
  const fundIds = [...new Set(options.map((o) => o.fund_id).filter((x): x is string => !!x))];
  const campaignIds = [...new Set(options.map((o) => o.campaign_id).filter((x): x is string => !!x))];
  const [funds, campaigns] = await Promise.all([
    fundIds.length ? supabase.from('funds').select('id, name').in('id', fundIds).then((r) => must(r, 'load the labh options')) : Promise.resolve([]),
    campaignIds.length ? supabase.from('campaigns').select('id, name').in('id', campaignIds).then((r) => must(r, 'load the labh options')) : Promise.resolve([]),
  ]);
  const fName = new Map(funds.map((f) => [f.id, f.name]));
  const cName = new Map(campaigns.map((c) => [c.id, c.name]));
  return options.map((o) => ({ ...o, purpose: (o.campaign_id && cName.get(o.campaign_id)) || (o.fund_id && fName.get(o.fund_id)) || null }));
}

export async function loadLabh(centerId: string, dayId: string, nextDate: (day: Tables<'special_days'>) => Promise<string | null>): Promise<LabhData & { next: string | null }> {
  const dayLoad = supabase
    .from('special_days')
    .select('*')
    .eq('id', dayId)
    .maybeSingle()
    .then((res) => {
      const found = maybe(res, 'load this special day');
      if (!found) throw new AppError("We couldn't find this special day. It may have been removed.", `special day ${dayId} not visible`);
      return found;
    });
  const [day, options, next] = await Promise.all([dayLoad, loadLabhOptions(centerId), dayLoad.then(nextDate)]);
  let tithi: LabhData['tithi'] = null;
  if (next) {
    const t = maybe(
      await supabase.from('tithi_days').select('tithi, month_name, center_id').eq('gregorian', next).or(`center_id.eq.${centerId},center_id.is.null`).limit(1).maybeSingle(),
      'look up the tithi',
    );
    tithi = t ? { tithi: t.tithi, month_name: t.month_name } : null;
  }
  return { day, next, tithi, options };
}

/** One open pledge per chosen option (+ a yearly gift each when repeating). Returns the pledge numbers. */
export async function commitLabh(args: { dayId: string; optionIds: string[]; dedication: string; repeatYearly: boolean }): Promise<string[]> {
  if (args.optionIds.length === 0) throw new AppError(retargetActive('Choose at least one labh.'), 'no labh options');
  return must(
    await supabase.rpc('commit_labh', { p_special_day: args.dayId, p_option_ids: args.optionIds, p_dedication: args.dedication.trim(), p_repeat_yearly: args.repeatYearly }),
    'save your labh',
  );
}

export type OpenPledge = Pick<Pledge, 'id' | 'pledge_number' | 'amount_cents' | 'paid_cents' | 'soft_credit_cents' | 'status' | 'pledged_at' | 'created_at' | 'closed_at'>;

/**
 * The pledges with these ids (an adult of the family sees their own). Used to open the payment confirmation form for pledges that were
 * just saved: a row the database does not return is simply missing, and the caller says so in words.
 */
export async function listPledgesByIds(ids: readonly string[]): Promise<Pledge[]> {
  if (ids.length === 0) return [];
  return must(await supabase.from('pledges').select('*').in('id', [...ids]), 'load your pledge');
}

/**
 * The pledges a labh was saved as. `commit_labh` answers with their numbers only, so the rows are found by number inside the family
 * (a pledge number is issued once). Oldest first, like the database orders them.
 */
export async function pledgesByNumbers(householdId: string, numbers: readonly string[]): Promise<Pledge[]> {
  const wanted = numbers.filter(Boolean);
  if (wanted.length === 0) return [];
  return must(await supabase.from('pledges').select('*').eq('household_id', householdId).in('pledge_number', wanted).order('created_at').order('id'), 'load your pledge');
}

/**
 * Pledges of the household that still have something to pay (Give → "Pay open balance"): Open or Partly paid, and not
 * already covered by Soft credit. What is left to pay on each is `openBalanceCents` (amount - paid - soft credit).
 */
export async function listOpenPledges(householdId: string): Promise<OpenPledge[]> {
  const rows = must(
    await supabase.from('pledges').select('id, pledge_number, amount_cents, paid_cents, soft_credit_cents, status, pledged_at, created_at, closed_at').eq('household_id', householdId).in('status', ['open', 'partially_paid']),
    'load your pledges',
  );
  return rows.filter((p) => openBalanceCents(p) > 0);
}
