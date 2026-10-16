import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { getPledgeDetail, listOpenPledges, listPledgePayments, listPledges, loadGiveSummary } from '../api/giving';

type Result = { data: unknown; error: unknown };
const tables: Record<string, Result> = {};
const asked: { table: string; select: string; filters: [string, unknown][] }[] = [];

/** A query that answers with the table's rows whatever it is asked, and remembers what it was asked. */
function mockQuery(table: string, select: string): unknown {
  const entry = { table, select, filters: [] as [string, unknown][] };
  asked.push(entry);
  const chain: Record<string, unknown> = {};
  for (const m of ['eq', 'in', 'gte', 'lte', 'order', 'limit']) {
    chain[m] = (col?: string, val?: unknown) => {
      if (m === 'eq' || m === 'in') entry.filters.push([`${m}:${col}`, val]);
      return chain;
    };
  }
  chain.then = (resolve: (r: Result) => unknown) => resolve(tables[table] ?? { data: [], error: null });
  return chain;
}

jest.mock('../supabase', () => ({ supabase: { from: (table: string) => ({ select: (cols: string) => mockQuery(table, cols) }) } }));

const pl = (over: Record<string, unknown> & { id: string }) => ({ pledge_number: null, amount_cents: 10000, paid_cents: 0, soft_credit_cents: 0, status: 'open', pledged_at: '2026-09-01T00:00:00Z', closed_at: null, ...over });

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  asked.length = 0;
});

describe('the Give tab summary with soft credit', () => {
  it('counts what is left to pay (amount - paid - soft credit), not the pledge amounts', async () => {
    tables.payments = { data: [{ amount_cents: 12000, refunded_cents: 0, status: 'captured', received_on: '2026-03-01' }], error: null };
    tables.recurring_gifts = { data: [], error: null };
    tables.pledges = {
      data: [pl({ id: 'a', amount_cents: 30000, soft_credit_cents: 9000 }), pl({ id: 'b', amount_cents: 10000, status: 'partially_paid', paid_cents: 4000 }), pl({ id: 'c', amount_cents: 5000, soft_credit_cents: 5000 })],
      error: null,
    };
    const s = await loadGiveSummary('h1', 2026);
    // a: 21000, b: 6000, c: nothing left (a pledge fully covered adds nothing)
    expect(s.openCents).toBe(27000);
    expect(s.openCount).toBe(2);
    expect(s.givenThisYearCents).toBe(12000);
    const pledgesQuery = asked.find((q) => q.table === 'pledges');
    expect(pledgesQuery?.select).toContain('soft_credit_cents');
  });
});

describe('the pledges still to pay', () => {
  it('leaves out a pledge with nothing left to pay and carries the soft credit column', async () => {
    tables.pledges = { data: [pl({ id: 'a', soft_credit_cents: 4000 }), pl({ id: 'full', amount_cents: 5000, soft_credit_cents: 5000 })], error: null };
    const open = await listOpenPledges('h1');
    expect(open.map((p) => p.id)).toEqual(['a']);
    expect(asked[0].select).toContain('soft_credit_cents');
    expect(asked[0].filters).toContainEqual(['in:status', ['open', 'partially_paid']]);
  });
});

describe('all pledges, one pledge, and its payments', () => {
  it('lists every status, with the new columns carried through untouched', async () => {
    tables.pledges = { data: [pl({ id: 's', status: 'soft_credit', soft_credit_cents: 10000 }), pl({ id: 'p', status: 'paid', paid_cents: 10000, reconciled_at: '2026-10-20T00:00:00Z' })], error: null };
    tables.payments = { data: [], error: null };
    tables.statements = { data: [], error: null };
    const res = await listPledges('h1', new Map());
    expect(res.pledges.map((p) => [p.id, p.status, p.soft_credit_cents, p.reconciled_at ?? null])).toEqual([['s', 'soft_credit', 10000, null], ['p', 'paid', 0, '2026-10-20T00:00:00Z']]);
    expect(asked.find((q) => q.table === 'pledges')?.select).toBe('*');
  });

  it('reads one pledge of the household, in any status, or null when it is not theirs', async () => {
    tables.pledges = { data: [pl({ id: 'old', status: 'paid', paid_cents: 10000, pledged_at: '2018-02-20T00:00:00Z', campaign_id: null, opportunity_id: null, pledged_by_person_id: null })], error: null };
    const p = await getPledgeDetail('h1', 'old', new Map());
    expect(p?.id).toBe('old');
    expect(asked[0].filters).toEqual(expect.arrayContaining([['eq:id', 'old'], ['eq:household_id', 'h1']]));
    tables.pledges = { data: [], error: null };
    expect(await getPledgeDetail('h1', 'gone', new Map())).toBeNull();
  });

  it('lists the payments that credited a pledge with what each put on it, newest first, leaving out failed ones', async () => {
    tables.payment_allocations = { data: [{ payment_id: 'x1', amount_cents: 16000 }, { payment_id: 'x2', amount_cents: 500 }, { payment_id: 'x3', amount_cents: 100 }], error: null };
    tables.payments = {
      data: [
        { id: 'x1', method: 'check', status: 'captured', received_on: '2026-10-12', receipt_number: 'R-1', check_number: '1048', amount_cents: 25000, reconciled_at: null },
        { id: 'x2', method: 'cash', status: 'settled', received_on: '2026-11-01', receipt_number: null, check_number: null, amount_cents: 500, reconciled_at: '2026-11-05T00:00:00Z' },
        { id: 'x3', method: 'card', status: 'failed', received_on: '2026-11-02', receipt_number: null, check_number: null, amount_cents: 100, reconciled_at: null },
      ],
      error: null,
    };
    const list = await listPledgePayments('p1');
    expect(list.map((p) => [p.paymentId, p.appliedCents, p.totalCents, p.receiptNumber])).toEqual([['x2', 500, 500, null], ['x1', 16000, 25000, 'R-1']]);
    expect(list[1].checkNumber).toBe('1048');
  });

  it('asks nothing more when a pledge has no payments yet', async () => {
    tables.payment_allocations = { data: [], error: null };
    expect(await listPledgePayments('p1')).toEqual([]);
    expect(asked.map((q) => q.table)).toEqual(['payment_allocations']);
  });
});
