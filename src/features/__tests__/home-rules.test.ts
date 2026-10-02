import { describe, expect, it } from '@jest/globals';

import { specialDayDismissKey } from '../event-rules';
import { homeSpecialDays, nextSpecialDay, reminderSpecialDay, upNextItems, type UpNextInput } from '../home-rules';

describe('upNextItems', () => {
  const all = { confirm: true, lunch: true, nextEvent: true, specialDay: true };
  const base: UpNextInput = { confirmEventId: null, lunchEventId: null, nextEventId: null, specialDayId: null, show: all };

  it('is empty when nothing is coming (the card is hidden)', () => {
    expect(upNextItems(base)).toEqual([]);
  });
  it('lists the confirm, lunch, next event and special day, in that order', () => {
    expect(upNextItems({ ...base, confirmEventId: 'e1', lunchEventId: 'e2', nextEventId: 'e3', specialDayId: 'd1' })).toEqual(['confirm', 'lunch', 'nextEvent', 'specialDay']);
    expect(upNextItems({ ...base, nextEventId: 'e3', specialDayId: 'd1' })).toEqual(['nextEvent', 'specialDay']);
    expect(upNextItems({ ...base, specialDayId: 'd1' })).toEqual(['specialDay']);
  });
  it('shows an event once: the next event is left out when it is the one to confirm or with lunch times', () => {
    expect(upNextItems({ ...base, confirmEventId: 'e1', nextEventId: 'e1' })).toEqual(['confirm']);
    expect(upNextItems({ ...base, lunchEventId: 'e1', nextEventId: 'e1' })).toEqual(['lunch']);
    expect(upNextItems({ ...base, confirmEventId: 'e1', nextEventId: 'e2' })).toEqual(['confirm', 'nextEvent']);
  });
  it('follows the community modules and the adults-only rules (show)', () => {
    const items = { ...base, confirmEventId: 'e1', lunchEventId: 'e2', nextEventId: 'e1', specialDayId: 'd1' };
    // A child or a guest: no confirm, lunch or special day, so the next event shows even when it is the one to confirm.
    expect(upNextItems({ ...items, show: { nextEvent: true } })).toEqual(['nextEvent']);
    // Events switched off: only the special day.
    expect(upNextItems({ ...items, show: { specialDay: true } })).toEqual(['specialDay']);
    expect(upNextItems({ ...items, show: {} })).toEqual([]);
  });
});

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
  it('leaves out an occurrence hidden with "Not this year"', () => {
    expect(homeSpecialDays(rows, [specialDayDismissKey('soon', '2026-10-08')]).map((r) => r.day.id)).toEqual(['later', 'far']);
    // Last year's choice does not hide this year's.
    expect(homeSpecialDays(rows, [specialDayDismissKey('soon', '2025-10-08')]).map((r) => r.day.id)).toEqual(['soon', 'later', 'far']);
  });

  it('Up next reminds about the soonest day whose reminder window has started', () => {
    expect(reminderSpecialDay(rows, TODAY, [])?.day.id).toBe('soon');
    expect(reminderSpecialDay([{ day: day('a', { reminder_days_before: 3 }), next: '2026-10-08' }], TODAY, [])).toBeNull();
    expect(reminderSpecialDay([{ day: day('a', { reminder_days_before: 0 }), next: TODAY }], TODAY, [])?.day.id).toBe('a');
    expect(reminderSpecialDay(rows, TODAY, [specialDayDismissKey('soon', '2026-10-08')])).toBeNull();
    expect(reminderSpecialDay([], TODAY, [])).toBeNull();
  });

  it('the Plan card offers the next day however far off', () => {
    expect(nextSpecialDay(rows, [])?.day.id).toBe('soon');
    expect(nextSpecialDay([{ day: day('far'), next: '2027-03-14' }], [])?.next).toBe('2027-03-14');
  });
  it('the Plan card skips the day Up next already shows, and is empty when that was the only one', () => {
    expect(nextSpecialDay(rows, [], 'soon')?.day.id).toBe('later');
    expect(nextSpecialDay([{ day: day('soon'), next: '2026-10-08' }], [], 'soon')).toBeNull();
    expect(nextSpecialDay([], [])).toBeNull();
  });
  it('the Plan card skips a day hidden with "Not this year"', () => {
    expect(nextSpecialDay(rows, [specialDayDismissKey('soon', '2026-10-08')])?.day.id).toBe('later');
  });
});
