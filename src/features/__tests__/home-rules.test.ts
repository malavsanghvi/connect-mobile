import { describe, expect, it } from '@jest/globals';

import { specialDayDismissKey } from '../event-rules';
import { SPECIAL_DAY_LIMIT, SPECIAL_DAY_WINDOW_DAYS } from '../home-rail-items';
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
  it('shows the days of the next two months, soonest first, and nothing further off', () => {
    expect(SPECIAL_DAY_WINDOW_DAYS).toBe(60);
    const rows = [
      { day: day('december'), next: '2026-12-15' },
      { day: day('soon'), next: '2026-10-08' },
      { day: day('november'), next: '2026-11-20' },
      { day: day('edge'), next: '2026-12-01' },
      { day: day('just-over'), next: '2026-12-02' },
    ];
    expect(upcomingSpecialDays(rows, [], TODAY).map((r) => [r.day.id, r.inDays])).toEqual([
      ['soon', 6],
      ['november', 49],
      ['edge', 60],
    ]);
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
    expect(upcomingSpecialDays(rows, [], TODAY, 60, 3)).toHaveLength(3);
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
