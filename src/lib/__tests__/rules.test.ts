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
  isSenior,
  isUnder12,
  isWithinReminder,
  lastSevenDays,
  lunchCard,
  lunchLines,
  nextOccurrence,
  orgIdDisplay,
  stepPledge,
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
