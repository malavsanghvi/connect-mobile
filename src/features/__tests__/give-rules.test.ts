import { describe, expect, it } from '@jest/globals';

import {
  availabilityFraction,
  endRule,
  fromAmountCents,
  giftsPerYear,
  isYearOpen,
  multiTotalCents,
  opportunityKind,
  ordinal,
  parseOptions,
  parsePresets,
  pickupPill,
  pronounFor,
  recurringState,
  slotsLine,
  soonestOnOrAfter,
  startDateChoices,
  storageRef,
  takenKeys,
  turningAge,
  type Availability,
} from '../give/rules';
import { runSteps, stepStatuses } from '../pay/steps';

const row = (o: Partial<Availability>): Availability => ({ optionKey: null, taken: false, takenCount: 0, slotsTaken: 0, slotsTotal: null, goalPercent: null, ...o });

describe('opportunity options', () => {
  it('parses tier/multi options and drops invalid rows', () => {
    const opts = parseOptions([
      { key: 'plat', label: 'Platinum', amount_cents: 500000, recognition: 'Stage' },
      { key: 'plat', label: 'Duplicate', amount_cents: 1 },
      { key: 'x', label: '', amount_cents: 100 },
      { key: 'y', label: 'Zero', amount_cents: 0 },
      { key: 'dhoop', label: 'Dhoop pujan', amount_cents: 5100, note: 'Fixed boli', fixed: true },
      'junk',
    ]);
    expect(opts.map((o) => o.key)).toEqual(['plat', 'dhoop']);
    expect(opts[0].recognition).toBe('Stage');
    expect(parseOptions(null)).toEqual([]);
  });
  it('parses preset amounts sorted and unique', () => {
    expect(parsePresets([{ amount_cents: 5000000 }, { amount_cents: 1000000 }, 2500000, { amount_cents: 1000000 }, { amount_cents: -1 }])).toEqual([1000000, 2500000, 5000000]);
  });
  it('computes the "From" amount per kind', () => {
    expect(fromAmountCents({ kind: 'tier', options: [{ key: 'a', label: 'A', amount_cents: 250000 }, { key: 'b', label: 'B', amount_cents: 100000 }], amount_cents: null, min_amount_cents: null })).toBe(100000);
    expect(fromAmountCents({ kind: 'amount', options: [{ amount_cents: 1000000 }], amount_cents: null, min_amount_cents: 500 })).toBe(1000000);
    expect(fromAmountCents({ kind: 'fixed', options: [], amount_cents: 10100, min_amount_cents: null })).toBe(10100);
    expect(fromAmountCents({ kind: 'open', options: [], amount_cents: null, min_amount_cents: null })).toBeNull();
    expect(opportunityKind('weird')).toBe('amount');
  });
  it('builds the availability line', () => {
    expect(slotsLine('multi', [row({ optionKey: 'a', slotsTaken: 2, slotsTotal: 8 })], false)).toEqual({ kind: 'multi', taken: 2, total: 8 });
    expect(slotsLine('amount', [row({ goalPercent: 41 })], true)).toEqual({ kind: 'goal', percent: 41 });
    expect(slotsLine('fixed', [row({ slotsTaken: 3, slotsTotal: 10 })], false)).toEqual({ kind: 'slots', taken: 3, total: 10 });
    expect(slotsLine('tier', [row({ slotsTaken: 11 })], false)).toEqual({ kind: 'families', n: 11 });
    expect(availabilityFraction([row({ goalPercent: 55 })])).toBe(0.55);
    expect(availabilityFraction([row({})])).toBeNull();
  });
  it('totals a multi selection without taken items', () => {
    const opts = parseOptions([
      { key: 'a', label: 'A', amount_cents: 25100 },
      { key: 'b', label: 'B', amount_cents: 15100 },
    ]);
    const taken = takenKeys([row({ optionKey: 'b', taken: true }), row({ optionKey: 'a' })]);
    expect([...taken]).toEqual(['b']);
    expect(multiTotalCents(opts, ['a', 'b'], taken)).toBe(25100);
  });
});

describe('pledge year groups', () => {
  it('opens only the current year under All years', () => {
    const years = [2026, 2025, 2024];
    expect(isYearOpen(2026, years, null, 2026, {})).toBe(true);
    expect(isYearOpen(2025, years, null, 2026, {})).toBe(false);
    expect(isYearOpen(2025, years, null, 2026, { 2025: true })).toBe(true);
    expect(isYearOpen(2024, [2024], 2024, 2026, {})).toBe(true);
    expect(isYearOpen(2025, [2025, 2024], null, 2026, {})).toBe(true);
  });
});

describe('recurring gifts', () => {
  it('offers the next 1st and 15th', () => {
    expect(startDateChoices('2026-09-22')).toEqual(['2026-10-01', '2026-10-15']);
    expect(startDateChoices('2026-09-10')).toEqual(['2026-09-15', '2026-10-01']);
    expect(startDateChoices('2026-12-20')).toEqual(['2027-01-01', '2027-01-15']);
  });
  it('maps end choices to the RPC end rule', () => {
    expect(endRule('until_stopped', '2026-09-22')).toEqual({ kind: 'until_stopped', count: null, on: null });
    expect(endRule('count12', '2026-09-22')).toEqual({ kind: 'count', count: 12, on: null });
    expect(endRule('through_next_year', '2026-09-22')).toEqual({ kind: 'until_date', count: null, on: '2027-12-31' });
  });
  it('counts gifts per year', () => {
    expect(giftsPerYear('monthly', 0)).toBe(12);
    expect(giftsPerYear('special_day', 7)).toBe(7);
    expect(giftsPerYear('special_day', 0)).toBe(1);
  });
  it('reads pending_payment_method as waiting', () => {
    expect(recurringState({ status: 'pending_payment_method' })).toBe('waiting');
    expect(recurringState({ status: 'paused' })).toBe('paused');
    expect(recurringState({ status: 'active' })).toBe('active');
    expect(recurringState({ status: 'cancelled' })).toBe('stopped');
  });
  it('finds the soonest date on or after today', () => {
    expect(soonestOnOrAfter(['2026-12-01', null, '2026-10-06', '2026-01-01'], '2026-09-23')).toBe('2026-10-06');
  });
});

describe('labh helpers', () => {
  it('writes ordinals and ages', () => {
    expect([1, 2, 3, 4, 10, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '10th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st']);
    expect(turningAge('2016-10-06', '2026-10-06')).toBe(10);
    expect(turningAge('2016-10-07', '2026-10-06')).toBe(9);
    expect(turningAge(null, '2026-10-06')).toBeNull();
    expect(pronounFor('Female')).toBe('her');
    expect(pronounFor(null)).toBe('their');
  });
});

describe('store', () => {
  it('builds the pickup pill from the soonest cutoff', () => {
    const tz = 'America/Chicago';
    const windows = [
      { starts_at: '2026-09-26T16:00:00Z', order_cutoff_at: '2026-09-25T02:00:00Z' },
      { starts_at: '2026-09-27T16:00:00Z', order_cutoff_at: '2026-09-25T02:00:00Z' },
      { starts_at: '2026-10-03T16:00:00Z', order_cutoff_at: '2026-10-02T02:00:00Z' },
    ];
    expect(pickupPill(windows, new Date('2026-09-22T12:00:00Z'), tz)).toEqual({ cutoff: 'Thu 9 PM', days: ['Sat', 'Sun'] });
    expect(pickupPill(windows, new Date('2026-10-05T12:00:00Z'), tz)).toBeNull();
  });
  it('resolves storage paths', () => {
    expect(storageRef('store/items/a.jpg', 'store')).toEqual({ bucket: 'store', key: 'items/a.jpg' });
    expect(storageRef('items/a.jpg', 'store')).toEqual({ bucket: 'store', key: 'items/a.jpg' });
    expect(storageRef('https://x.test/a.jpg', 'store')).toEqual({ url: 'https://x.test/a.jpg' });
    expect(storageRef('  ', 'store')).toBeNull();
  });
});

describe('saving steps', () => {
  it('marks statuses', () => {
    expect(stepStatuses(3, 1, false)).toEqual(['done', 'running', 'pending']);
    expect(stepStatuses(3, 1, true)).toEqual(['done', 'failed', 'pending']);
  });
  it('stops at the first failure and resumes from it', async () => {
    const calls: string[] = [];
    let fail = true;
    const steps = [
      { label: 'a', run: async () => void calls.push('a') },
      {
        label: 'b',
        run: async () => {
          calls.push('b');
          if (fail) throw new Error('nope');
        },
      },
      { label: 'c (covered by b)' },
    ];
    const progress: number[] = [];
    const first = await runSteps(steps, 0, (n) => progress.push(n));
    expect(first).toMatchObject({ ok: false, done: 1 });
    fail = false;
    const second = await runSteps(steps, 1, (n) => progress.push(n));
    expect(second).toEqual({ ok: true, done: 3 });
    expect(calls).toEqual(['a', 'b', 'b']);
    expect(progress).toEqual([1, 2, 3]);
  });
});
