import { describe, expect, it } from '@jest/globals';

import { specialDayDismissKey } from '../event-rules';
import { givingSlides, homeSpecialDays, nextSpecialDay, reminderSpecialDay, upNextItems, type GivingOpportunity, type UpNextInput } from '../home-rules';

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

describe('givingSlides', () => {
  const opp = (id: string, extra: Partial<GivingOpportunity> = {}): GivingOpportunity => ({ id, name: `Opp ${id}`, kind: 'open', options: [], amount_cents: null, min_amount_cents: null, campaign: { name: 'Paryushan' }, ...extra });

  it('makes one slide per open opportunity, in the portal order', () => {
    const slides = givingSlides([opp('a', { min_amount_cents: 2500 }), opp('b', { campaign: { name: 'Pathshala' } })]);
    expect(slides.map((s) => s.opportunityId)).toEqual(['a', 'b']);
    expect(slides[0]).toEqual({ key: 'opportunity:a', opportunityId: 'a', title: 'Opp a', campaignName: 'Paryushan', fromCents: 2500 });
    expect(slides[1]).toMatchObject({ campaignName: 'Pathshala', fromCents: null }); // any amount
  });
  it('gives every level of a campaign its own slide, each opening that level, next to an any-amount one', () => {
    const slides = givingSlides([
      opp('general'),
      opp('gold', { name: 'Gold', kind: 'fixed', amount_cents: 500100 }),
      opp('silver', { name: 'Silver', kind: 'fixed', amount_cents: 250100 }),
    ]);
    expect(slides.map((s) => [s.opportunityId, s.title, s.fromCents])).toEqual([
      ['general', 'Opp general', null],
      ['gold', 'Gold', 500100],
      ['silver', 'Silver', 250100],
    ]);
  });
  it('shows the same "From" amount as the Give list (the smallest level of a tier opportunity)', () => {
    const tier = opp('t', { kind: 'tier', options: [{ key: 'p', label: 'Platinum', amount_cents: 500000 }, { key: 's', label: 'Silver', amount_cents: 100000 }] });
    expect(givingSlides([tier])[0].fromCents).toBe(100000);
  });
  it('has no campaign line when the opportunity has no campaign', () => {
    expect(givingSlides([opp('a', { campaign: null, amount_cents: 10100, kind: 'fixed' })])).toEqual([{ key: 'opportunity:a', opportunityId: 'a', title: 'Opp a', campaignName: null, fromCents: 10100 }]);
  });
  it('is empty when nothing is open', () => {
    expect(givingSlides([])).toEqual([]);
  });
});
