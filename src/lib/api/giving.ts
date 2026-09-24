import type { Enums, Tables } from '../database.types';
import { AppError, check, must } from '../errors';
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

export type PledgeWithPeople = Pledge & { pledgedByName: string | null; campaignName: string | null };

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
  const campaigns = campaignIds.length ? must(await supabase.from('campaigns').select('id, name').in('id', campaignIds), 'load your pledges') : [];
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
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
