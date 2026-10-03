import { describe, expect, it } from '@jest/globals';

import { specialDayDismissKey } from '../event-rules';
import { nextOccurrence } from '@/lib/rules';

import { SPECIAL_DAY_LIMIT, SPECIAL_DAY_WINDOW_MONTHS } from '../home-rail-items';
import { homeSpecialDays, upcomingSpecialDays } from '../home-rules';

type Day = { id: string; show_on_home: boolean; reminder_days_before: number };
const day = (id: string, extra: Partial<Day> = {}): Day => ({ id, show_on_home: true, reminder_days_before: 14, ...extra });
const TODAY = '2026-10-02';

describe('special days on Home', () => {
  const rows = [
    { day: day('far'), next: '2027-03-14' },
    { day: day('soon'), next: '2026-10-08' },
    { day: day('later'), next: '2026-11-20' },
    { day: day('unknown'), next: null },
    { day: day('hiddenFromHome', { show_on_home: false }), next: '2026-10-03' },
  ];

  it('keeps the days shown on Home with a known date, soonest first', () => {
    expect(homeSpecialDays(rows, []).map((r) => r.day.id)).toEqual(['soon', 'later', 'far']);
  });
  it('leaves out an occurrence hidden with "Not this year" (a choice made earlier on this device)', () => {
    expect(homeSpecialDays(rows, [specialDayDismissKey('soon', '2026-10-08')]).map((r) => r.day.id)).toEqual(['later', 'far']);
    // Last year's choice does not hide this year's.
    expect(homeSpecialDays(rows, [specialDayDismissKey('soon', '2025-10-08')]).map((r) => r.day.id)).toEqual(['soon', 'later', 'far']);
  });
});

describe('upcomingSpecialDays (the Plan a special day row)', () => {
  it('shows the days of the next two calendar months, today to the same day two months on, soonest first, and nothing further off', () => {
    expect(SPECIAL_DAY_WINDOW_MONTHS).toBe(2);
    const rows = [
      { day: day('december'), next: '2026-12-15' },
      { day: day('soon'), next: '2026-10-08' },
      { day: day('november'), next: '2026-11-20' },
      { day: day('edge'), next: '2026-12-02' },
      { day: day('just-over'), next: '2026-12-03' },
    ];
    // Oct 2 + 2 months is Dec 2 (61 days): that day is in, the next one is not.
    expect(upcomingSpecialDays(rows, [], TODAY).map((r) => [r.day.id, r.inDays])).toEqual([
      ['soon', 6],
      ['november', 49],
      ['edge', 61],
    ]);
  });
  describe('the two-month window at the turn of the year and in short months', () => {
    const ids = (today: string, nexts: Record<string, string>) =>
      upcomingSpecialDays(
        Object.entries(nexts).map(([id, next]) => ({ day: day(id), next })),
        [],
        today,
      ).map((r) => r.day.id);

    it('runs on into January (and the year after), counting by the calendar, not by 60 days', () => {
      // Dec 15 to Feb 15: 62 days, two more than the old 60.
      const nexts = { jan: '2027-01-10', onTheLastDay: '2027-02-15', dayAfter: '2027-02-16' };
      expect(ids('2026-12-15', nexts)).toEqual(['jan', 'onTheLastDay']);
      // Nov 20 to Jan 20.
      expect(ids('2026-11-20', { dec: '2026-12-25', jan: '2027-01-20', over: '2027-01-21' })).toEqual(['dec', 'jan']);
      expect(upcomingSpecialDays([{ day: day('last'), next: '2027-02-15' }], [], '2026-12-15')[0].inDays).toBe(62);
    });
    it('ends on the last day of a month that is shorter (Dec 31 to Feb 28)', () => {
      expect(ids('2026-12-31', { feb28: '2027-02-28', mar1: '2027-03-01' })).toEqual(['feb28']);
      expect(ids('2026-12-30', { feb28: '2027-02-28', mar1: '2027-03-01' })).toEqual(['feb28']);
      // Aug 31 + 2 months is Oct 31.
      expect(ids('2026-08-31', { oct31: '2026-10-31', nov1: '2026-11-01' })).toEqual(['oct31']);
    });
    it('knows a leap year (Dec 31, 2027 to Feb 29, 2028)', () => {
      expect(ids('2027-12-31', { feb28: '2028-02-28', feb29: '2028-02-29', mar1: '2028-03-01' })).toEqual(['feb28', 'feb29']);
      expect(ids('2028-01-31', { mar31: '2028-03-31', apr1: '2028-04-01' })).toEqual(['mar31']);
    });
    it('shows a birthday on Feb 29 on the day it is kept (Feb 28 in a year without one)', () => {
      const next = nextOccurrence('2000-02-29', '2026-12-31');
      expect(next).toBe('2027-02-28');
      expect(upcomingSpecialDays([{ day: day('leapling'), next }], [], '2026-12-31').map((r) => [r.day.id, r.inDays])).toEqual([['leapling', 59]]);
      const leap = nextOccurrence('2000-02-29', '2027-12-31');
      expect(leap).toBe('2028-02-29');
      expect(upcomingSpecialDays([{ day: day('leapling'), next: leap }], [], '2027-12-31').map((r) => r.inDays)).toEqual([60]);
    });
    it('takes the window from the date it is given: the community’s today, whatever the phone’s clock says', () => {
      expect(ids('2026-10-02', { dec2: '2026-12-02' })).toEqual(['dec2']);
      expect(ids('2026-10-01', { dec2: '2026-12-02' })).toEqual([]);
    });
  });
  it('counts today, and leaves out a day already gone', () => {
    const rows = [
      { day: day('today'), next: TODAY },
      { day: day('yesterday'), next: '2026-10-01' },
    ];
    expect(upcomingSpecialDays(rows, [], TODAY).map((r) => r.day.id)).toEqual(['today']);
  });
  it('is empty when nothing is coming, which hides the whole row', () => {
    expect(upcomingSpecialDays([], [], TODAY)).toEqual([]);
    expect(upcomingSpecialDays([{ day: day('far'), next: '2027-03-14' }], [], TODAY)).toEqual([]);
  });
  it('leaves out a day the family does not show on Home, one whose date is not known yet, and one hidden with "Not this year"', () => {
    const rows = [
      { day: day('off', { show_on_home: false }), next: '2026-10-08' },
      { day: day('tithi'), next: null },
      { day: day('hidden'), next: '2026-10-09' },
      { day: day('shown'), next: '2026-10-10' },
    ];
    expect(upcomingSpecialDays(rows, [specialDayDismissKey('hidden', '2026-10-09')], TODAY).map((r) => r.day.id)).toEqual(['shown']);
  });
  it('shows at most ten, the soonest', () => {
    expect(SPECIAL_DAY_LIMIT).toBe(10);
    const rows = Array.from({ length: 14 }, (_, i) => ({ day: day(`d${String(i).padStart(2, '0')}`), next: `2026-10-${String(i + 3).padStart(2, '0')}` }));
    const shown = upcomingSpecialDays(rows, [], TODAY);
    expect(shown).toHaveLength(10);
    expect(shown[0].day.id).toBe('d00');
    expect(shown[9].day.id).toBe('d09');
    expect(upcomingSpecialDays(rows, [], TODAY, 2, 3)).toHaveLength(3);
  });
  it('lists two days on the same date in a steady order', () => {
    const rows = [
      { day: day('b'), next: '2026-10-08' },
      { day: day('a'), next: '2026-10-08' },
    ];
    expect(upcomingSpecialDays(rows, [], TODAY).map((r) => r.day.id)).toEqual(['a', 'b']);
  });
  it('shows nothing before the community’s date is known', () => {
    expect(upcomingSpecialDays([{ day: day('a'), next: '2026-10-08' }], [], '')).toEqual([]);
  });
});
