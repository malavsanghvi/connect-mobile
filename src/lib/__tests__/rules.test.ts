import { describe, expect, it } from '@jest/globals';

import {
  ageOn,
  annualEstimateCents,
  boliMinimumCents,
  boliStatus,
  canStepDown,
  clampPledge,
  commitmentTotalCents,
  filterPledges,
  groupPledgesByYear,
  identifierLine,
  isAdult,
  isPayablePledge,
  isSenior,
  isSoftCreditPledge,
  isUnder12,
  isWithinReminder,
  lastSevenDays,
  lunchCard,
  lunchLines,
  nextOccurrence,
  openBalanceCents,
  orgIdDisplay,
  pledgeTotals,
  previewProofAllocation,
  softCreditOf,
  softCreditWaitingCents,
  stepPledge,
  stillToPayCents,
  streakDisplay,
  streakLabel,
  tithiLabel,
  tithiShort,
} from '../rules';

describe('adult check (mirrors app.i_am_adult)', () => {
  it('treats an unknown date of birth as an adult', () => {
    expect(isAdult(null, '2026-09-22')).toBe(true);
    expect(isAdult(undefined, '2026-09-22')).toBe(true);
  });
  it('becomes an adult on the 18th birthday, not the day before', () => {
    expect(isAdult('2008-09-22', '2026-09-22')).toBe(true);
    expect(isAdult('2008-09-23', '2026-09-22')).toBe(false);
  });
  it('children are not adults', () => {
    expect(isAdult('2012-05-09', '2026-09-22')).toBe(false);
    expect(ageOn('2012-05-09', '2026-09-22')).toBe(14);
  });
  it('flags lunch priority ages on the event date', () => {
    expect(isUnder12('2016-11-21', '2026-09-27')).toBe(true);
    expect(isUnder12('2014-09-27', '2026-09-27')).toBe(false);
    expect(isSenior('1961-09-27', '2026-09-27')).toBe(true);
    expect(isSenior('1961-09-28', '2026-09-27')).toBe(false);
    expect(isUnder12(null, '2026-09-27')).toBe(false);
  });
});

describe('boli minimum and pledge stepper', () => {
  it('uses the floor when nobody has pledged', () => {
    expect(boliMinimumCents(null, 50100, 2100)).toBe(50100);
    expect(boliMinimumCents(0, 50100, 2100)).toBe(50100);
  });
  it('is the top pledge plus one step once there are pledges', () => {
    expect(boliMinimumCents(75100, 50100, 2100)).toBe(77200);
  });
  it('never lets the stepper go below the minimum', () => {
    expect(clampPledge(50000, 77200)).toBe(77200);
    expect(stepPledge(77200, 2100, -1, 77200)).toBe(77200);
    expect(canStepDown(77200, 2100, 77200)).toBe(false);
  });
  it('moves in steps of the boli step', () => {
    expect(stepPledge(77200, 2100, 1, 77200)).toBe(79300);
    expect(stepPledge(79300, 2100, -1, 77200)).toBe(77200);
    expect(canStepDown(79300, 2100, 77200)).toBe(true);
  });
  it('reports status in pledge terms', () => {
    expect(boliStatus({ mineCents: 77200, topCents: 77200, entries: 7, closed: false })).toBe('mine_top');
    expect(boliStatus({ mineCents: 50100, topCents: 77200, entries: 7, closed: false })).toBe('pledged_more');
    expect(boliStatus({ mineCents: null, topCents: null, entries: 0, closed: false })).toBe('no_pledges');
    expect(boliStatus({ mineCents: null, topCents: 77200, entries: 3, closed: false })).toBe('open');
    expect(boliStatus({ mineCents: 77200, topCents: 77200, entries: 3, closed: true })).toBe('closed');
  });
});

describe('lunch card copy', () => {
  const slots = [
    { starts_at: '2026-09-27T17:00:00Z', status: 'now_serving' },
    { starts_at: '2026-09-27T17:45:00Z', status: 'scheduled' },
  ];
  it('explains the rules before check-in', () => {
    expect(lunchCard([{ name: 'Priya', checkedIn: false, slotStartsAt: null }], slots, 'America/Chicago')).toEqual({ state: 'not_checked_in' });
  });
  it('says the slot is being assigned right after check-in', () => {
    expect(lunchCard([{ name: 'Priya', checkedIn: true, slotStartsAt: null }], slots, 'America/Chicago').state).toBe('assigning');
  });
  it('groups the family by slot in center time, with now serving', () => {
    const card = lunchCard(
      [
        { name: 'Anya', checkedIn: true, slotStartsAt: '2026-09-27T17:00:00Z' },
        { name: 'Priya', checkedIn: true, slotStartsAt: '2026-09-27T17:45:00Z' },
        { name: 'Rahul', checkedIn: true, slotStartsAt: '2026-09-27T17:45:00Z' },
      ],
      slots,
      'America/Chicago',
    );
    expect(card.state).toBe('ready');
    if (card.state !== 'ready') return;
    expect(card.nowServing).toBe('12:00 PM');
    expect(card.groups[0].isFirstSlot).toBe(true);
    expect(lunchLines(card)).toEqual(['Anya · 12:00 PM', 'Priya and Rahul · 12:45 PM']);
  });
});

describe('streak display', () => {
  const row = { current_days: 11, longest_days: 21, last_logged_on: '2026-09-21' };
  it('keeps yesterday’s streak alive but at risk', () => {
    expect(streakDisplay(row, '2026-09-22')).toEqual({ days: 11, best: 21, completedToday: false, atRisk: true });
  });
  it('is complete when today was logged', () => {
    expect(streakDisplay({ ...row, last_logged_on: '2026-09-22', current_days: 12 }, '2026-09-22')).toEqual({ days: 12, best: 21, completedToday: true, atRisk: false });
  });
  it('drops to zero after a missed day', () => {
    expect(streakDisplay(row, '2026-09-24').days).toBe(0);
    expect(streakDisplay(null, '2026-09-24').days).toBe(0);
  });
  it('labels the streak', () => {
    expect(streakLabel(0)).toBe('No streak yet');
    expect(streakLabel(1)).toBe('1-day streak');
    expect(streakLabel(12)).toBe('12-day streak');
  });
  it('lists the last seven days oldest first', () => {
    expect(lastSevenDays('2026-09-22')).toEqual(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22']);
  });
});

describe('tithi labels', () => {
  it('builds long and short labels from the tithi table', () => {
    expect(tithiLabel({ month_name: 'Bhadarva', tithi: 'Sud 11', paksha: 'sud' })).toBe('Bhadarva sud 11');
    expect(tithiShort({ month_name: 'Bhadarva', tithi: 'Sud 11', paksha: 'sud' })).toBe('Sud 11');
  });
  it('handles numeric tithis and named days', () => {
    expect(tithiShort({ month_name: 'Aso', tithi: '3', paksha: 'vad' })).toBe('Vad 3');
    expect(tithiLabel({ month_name: 'Aso', tithi: '3', paksha: 'vad' })).toBe('Aso vad 3');
    expect(tithiLabel({ month_name: 'Aso', tithi: 'Punam', paksha: 'sud' })).toBe('Aso Punam');
  });
});

describe('identifiers', () => {
  it('keeps the organization’s leading zeros', () => {
    expect(orgIdDisplay('0417')).toBe('0417');
    expect(orgIdDisplay(' 0212 ')).toBe('0212');
    expect(orgIdDisplay('')).toBeNull();
    expect(orgIdDisplay(null)).toBeNull();
  });
  it('joins the org id and member number, hiding what is absent', () => {
    expect(identifierLine({ orgLabel: 'JSH member ID', orgId: '0417', connectNumber: 'JSH-10421' })).toBe('JSH member ID 0417 · JSH-10421');
    expect(identifierLine({ orgLabel: 'JSH member ID', orgId: null, connectNumber: 'JSH-10421' })).toBe('JSH-10421');
  });
});

describe('pledges and giving math', () => {
  const pledges = [
    { amount_cents: 15100, paid_cents: 0, status: 'open', pledged_at: '2026-09-12T10:00:00Z', closed_at: null },
    { amount_cents: 10100, paid_cents: 10100, status: 'paid', pledged_at: '2026-04-10T10:00:00Z', closed_at: '2026-04-12T10:00:00Z' },
    { amount_cents: 25100, paid_cents: 25100, status: 'paid', pledged_at: '2025-10-20T10:00:00Z', closed_at: '2025-11-02T10:00:00Z' },
  ];
  it('groups by pledge year, newest first', () => {
    const groups = groupPledgesByYear(pledges);
    expect(groups.map((g) => g.year)).toEqual([2026, 2025]);
    expect(groups[0].pledgedCents).toBe(25200);
    expect(groups[0].paidCents).toBe(10100);
  });
  it('filters open / closed and by year', () => {
    expect(filterPledges(pledges, 'open', null)).toHaveLength(1);
    expect(filterPledges(pledges, 'closed', 2026)).toHaveLength(1);
    expect(filterPledges(pledges, 'all', 2025)).toHaveLength(1);
  });
  it('estimates recurring gifts per year', () => {
    expect(annualEstimateCents(2100, 'monthly')).toBe(25200);
    expect(annualEstimateCents(5100, 'quarterly')).toBe(20400);
  });
  it('computes the RSVP commitment', () => {
    expect(commitmentTotalCents('per_person', 500, 3)).toBe(1500);
    expect(commitmentTotalCents('lump_sum', 2500, 3)).toBe(2500);
    expect(commitmentTotalCents('none', 2500, 3)).toBe(0);
  });
});

describe('special days', () => {
  it('finds the next yearly occurrence', () => {
    expect(nextOccurrence('2016-10-06', '2026-09-22')).toBe('2026-10-06');
    expect(nextOccurrence('1985-03-14', '2026-09-22')).toBe('2027-03-14');
    expect(nextOccurrence('2000-02-29', '2026-09-22')).toBe('2027-02-28');
  });
  it('is "soon" inside the reminder window', () => {
    expect(isWithinReminder('2026-10-06', '2026-09-22', 14)).toBe(true);
    expect(isWithinReminder('2026-10-07', '2026-09-22', 14)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Soft credit (connect-crm 0864-0866; owner rule 2026-10-15: Open balance = amount - paid - soft credit)
// ---------------------------------------------------------------------------

type P = { id: string; created_at: string; pledged_at: string; closed_at: string | null; amount_cents: number; paid_cents: number; soft_credit_cents: number; status: string };
const pledge = (over: Partial<P> & { id: string }): P => ({ created_at: '2026-09-01T00:00:00Z', pledged_at: '2026-09-01T00:00:00Z', closed_at: null, amount_cents: 10000, paid_cents: 0, soft_credit_cents: 0, status: 'open', ...over });

describe('open balance leaves out soft credit', () => {
  it('is amount - paid - soft credit for an Open or Partly paid pledge', () => {
    expect(openBalanceCents(pledge({ id: 'a' }))).toBe(10000);
    expect(openBalanceCents(pledge({ id: 'a', status: 'partially_paid', paid_cents: 2500 }))).toBe(7500);
    expect(openBalanceCents(pledge({ id: 'a', soft_credit_cents: 9000 }))).toBe(1000);
    expect(openBalanceCents(pledge({ id: 'a', status: 'partially_paid', paid_cents: 2500, soft_credit_cents: 5000 }))).toBe(2500);
  });
  it('adds nothing for a Soft credit, Paid, Written off or Cancelled pledge', () => {
    expect(openBalanceCents(pledge({ id: 'a', status: 'soft_credit', soft_credit_cents: 10000 }))).toBe(0);
    for (const status of ['paid', 'written_off', 'cancelled']) expect(openBalanceCents(pledge({ id: 'a', status, paid_cents: 3000 }))).toBe(0);
  });
  it('never goes below zero and reads a portal without the column as no soft credit', () => {
    expect(openBalanceCents(pledge({ id: 'a', soft_credit_cents: 99999 }))).toBe(0);
    expect(openBalanceCents({ amount_cents: 5000, paid_cents: 0, status: 'open', pledged_at: '2026-09-01', closed_at: null })).toBe(5000);
    expect(softCreditOf({ soft_credit_cents: null })).toBe(0);
    expect(softCreditOf({})).toBe(0);
  });
  it('a pledge is payable only while something is left to pay; Soft credit is its own status', () => {
    expect(isPayablePledge(pledge({ id: 'a' }))).toBe(true);
    expect(isPayablePledge(pledge({ id: 'a', status: 'soft_credit', soft_credit_cents: 10000 }))).toBe(false);
    expect(isSoftCreditPledge(pledge({ id: 'a', status: 'soft_credit' }))).toBe(true);
    expect(isSoftCreditPledge(pledge({ id: 'a' }))).toBe(false);
  });
  it('soft credit waiting counts a chip on a partly covered pledge and a Soft credit pledge, but not a paid one', () => {
    expect(softCreditWaitingCents(pledge({ id: 'a', soft_credit_cents: 9000 }))).toBe(9000);
    expect(softCreditWaitingCents(pledge({ id: 'a', status: 'soft_credit', soft_credit_cents: 10000 }))).toBe(10000);
    expect(softCreditWaitingCents(pledge({ id: 'a', status: 'paid', paid_cents: 10000, soft_credit_cents: 4000 }))).toBe(0);
  });
  it('the three tiles: Open balance, Soft credit waiting, closed count (the owner example)', () => {
    const family = [
      pledge({ id: 'supper', amount_cents: 16000, status: 'soft_credit', soft_credit_cents: 16000 }),
      pledge({ id: 'building', amount_cents: 30000, soft_credit_cents: 9000 }),
      pledge({ id: 'food', amount_cents: 10000 }),
      pledge({ id: 'membership', amount_cents: 12000, paid_cents: 12000, status: 'paid' }),
    ];
    expect(pledgeTotals(family)).toEqual({ openCents: 21000 + 10000, openCount: 2, softCreditCents: 25000, softCreditCount: 2, closedCount: 1 });
  });
  it('the Open filter keeps Soft credit with the pledges not paid yet; Closed is Paid, Written off and Cancelled', () => {
    const list = [pledge({ id: 'o' }), pledge({ id: 's', status: 'soft_credit', soft_credit_cents: 10000 }), pledge({ id: 'p', status: 'paid', paid_cents: 10000 }), pledge({ id: 'c', status: 'cancelled' })];
    expect(filterPledges(list, 'open', null).map((p) => p.id)).toEqual(['o', 's']);
    expect(filterPledges(list, 'closed', null).map((p) => p.id)).toEqual(['p', 'c']);
  });
  it('still-to-pay for the ticked pledges, or for all when none is ticked', () => {
    const list = [pledge({ id: 'a', soft_credit_cents: 4000 }), pledge({ id: 'b', amount_cents: 5000 }), pledge({ id: 's', status: 'soft_credit', soft_credit_cents: 10000 })];
    expect(stillToPayCents(list)).toBe(11000);
    expect(stillToPayCents(list, [])).toBe(11000);
    expect(stillToPayCents(list, ['b'])).toBe(5000);
    expect(stillToPayCents(list, ['s'])).toBe(0);
  });
});

describe('where a proof will go: the oldest-first preview (mirrors app.submit_payment_proof, connect-crm 0866)', () => {
  const family = [
    pledge({ id: 'building', amount_cents: 30000, pledged_at: '2026-09-20T10:00:00Z', created_at: '2026-09-20T10:00:00Z' }),
    pledge({ id: 'supper', amount_cents: 16000, pledged_at: '2026-09-02T10:00:00Z', created_at: '2026-09-02T10:00:00Z' }),
    pledge({ id: 'food', amount_cents: 10000, pledged_at: '2026-10-03T10:00:00Z', created_at: '2026-10-03T10:00:00Z' }),
  ];
  it('credits the oldest pledge first, and the last one only in part (the owner example)', () => {
    const r = previewProofAllocation(family, 25000);
    expect(r.lines).toEqual([
      { pledgeId: 'supper', takeCents: 16000, leftCents: 0, becomes: 'soft_credit' },
      { pledgeId: 'building', takeCents: 9000, leftCents: 21000, becomes: 'open' },
    ]);
    expect(r.creditedCents).toBe(25000);
    expect(r.excessCents).toBe(0);
  });
  it('an amount smaller than the oldest pledge leaves it Open with a soft credit chip', () => {
    const r = previewProofAllocation(family, 5000);
    expect(r.lines).toEqual([{ pledgeId: 'supper', takeCents: 5000, leftCents: 11000, becomes: 'open' }]);
  });
  it('the total still to pay covers every pledge and leaves no excess', () => {
    const r = previewProofAllocation(family, 56000);
    expect(r.lines.map((l) => l.becomes)).toEqual(['soft_credit', 'soft_credit', 'soft_credit']);
    expect(r.excessCents).toBe(0);
  });
  it('more than the open pledges need leaves the rest as excess, never credited', () => {
    const r = previewProofAllocation(family, 60000);
    expect(r.creditedCents).toBe(56000);
    expect(r.excessCents).toBe(4000);
  });
  it('only the chosen pledges, oldest first among them; none chosen means all', () => {
    expect(previewProofAllocation(family, 12000, ['food', 'building']).lines.map((l) => [l.pledgeId, l.takeCents])).toEqual([['building', 12000]]);
    expect(previewProofAllocation(family, 12000, []).lines.map((l) => l.pledgeId)).toEqual(['supper']);
    expect(previewProofAllocation(family, 12000, null).lines.map((l) => l.pledgeId)).toEqual(['supper']);
  });
  it('takes what is left after paid money and soft credit already on a pledge, and skips pledges with nothing left', () => {
    const list = [
      pledge({ id: 'a', amount_cents: 10000, paid_cents: 4000, soft_credit_cents: 3000, status: 'partially_paid', pledged_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }),
      pledge({ id: 'done', status: 'soft_credit', soft_credit_cents: 10000, pledged_at: '2026-01-02T00:00:00Z', created_at: '2026-01-02T00:00:00Z' }),
      pledge({ id: 'paid', status: 'paid', paid_cents: 10000, pledged_at: '2026-01-03T00:00:00Z', created_at: '2026-01-03T00:00:00Z' }),
      pledge({ id: 'b', amount_cents: 2000, pledged_at: '2026-01-04T00:00:00Z', created_at: '2026-01-04T00:00:00Z' }),
    ];
    const r = previewProofAllocation(list, 4000);
    expect(r.lines).toEqual([
      { pledgeId: 'a', takeCents: 3000, leftCents: 0, becomes: 'soft_credit' },
      { pledgeId: 'b', takeCents: 1000, leftCents: 1000, becomes: 'open' },
    ]);
  });
  it('breaks a tie on the pledge date by created_at, then by id, as the database orders them', () => {
    const same = '2026-09-02T10:00:00Z';
    const list = [
      pledge({ id: 'c', pledged_at: same, created_at: '2026-09-02T10:00:03Z' }),
      pledge({ id: 'b', pledged_at: same, created_at: '2026-09-02T10:00:01Z' }),
      pledge({ id: 'a', pledged_at: same, created_at: '2026-09-02T10:00:01Z' }),
    ];
    expect(previewProofAllocation(list, 30000).lines.map((l) => l.pledgeId)).toEqual(['a', 'b', 'c']);
  });
  it('compares times, not text, so the same moment in two spellings does not reorder', () => {
    const list = [pledge({ id: 'nine-central', pledged_at: '2026-09-02T09:00:00-05:00' }), pledge({ id: 'noon-utc', pledged_at: '2026-09-02T12:00:00+00:00' })];
    expect(previewProofAllocation(list, 10000).lines.map((l) => l.pledgeId)).toEqual(['noon-utc']);
  });
  it('credits nothing for a zero or negative amount and does not change what it was given', () => {
    const before = JSON.stringify(family);
    expect(previewProofAllocation(family, 0).lines).toEqual([]);
    expect(previewProofAllocation(family, -5).lines).toEqual([]);
    expect(JSON.stringify(family)).toBe(before);
  });
});
