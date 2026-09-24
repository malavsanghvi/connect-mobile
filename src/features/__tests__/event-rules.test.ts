import { describe, expect, it } from '@jest/globals';

import {
  ACTION_CONFIRM_CHANGE,
  albumDate,
  ACTION_CONFIRM_YES,
  buildIcs,
  compactClock,
  compactTime,
  confirmSchedule,
  dateRangeShort,
  lunchWhy,
  orderLayers,
  paletteIndex,
  popupDue,
  pronounFor,
  relativeDay,
  routeForNotification,
  shortWhen,
  specialDayDismissKey,
  specialDayLead,
  stepIndex,
  tierLadder,
  tileColorIndex,
  toWebcal,
  turnsAge,
  virSamvat,
} from '../event-rules';

const TZ = 'America/Chicago';

describe('times', () => {
  it('drops :00 like the prototype', () => {
    expect(compactClock(10, 0)).toBe('10 AM');
    expect(compactClock(12, 15)).toBe('12:15 PM');
    expect(compactClock(0, 0)).toBe('12 AM');
    expect(compactTime('2026-09-27T15:00:00Z', TZ)).toBe('10 AM');
  });
  it('formats "Sun 10 AM"', () => {
    expect(shortWhen('2026-09-27T15:00:00Z', TZ)).toBe('Sun 10 AM');
    expect(shortWhen(null, TZ)).toBe('');
  });
  it('knows today and tomorrow', () => {
    expect(relativeDay('2026-09-27', '2026-09-26')).toBe('tomorrow');
    expect(relativeDay('2026-09-26', '2026-09-26')).toBe('today');
    expect(relativeDay('2026-09-29', '2026-09-26')).toBeNull();
  });
  it('builds the confirmation schedule', () => {
    expect(confirmSchedule('2026-09-27T15:00:00Z', TZ, 24)).toEqual({ sentAt: 'Sat 10 AM', replyBy: 'Sat 9 PM', nudgeAt: '6 PM' });
  });
  it('shortens date ranges', () => {
    expect(dateRangeShort('2026-09-08T14:00:00Z', '2026-09-16T23:00:00Z', TZ)).toBe('SEP 8–16');
    expect(dateRangeShort('2026-09-12T14:00:00Z', null, TZ)).toBe('SEP 12');
    expect(dateRangeShort('2026-09-28T14:00:00Z', '2026-10-02T14:00:00Z', TZ)).toBe('SEP 28 – OCT 2');
  });
});

describe('special days', () => {
  it('says weeks when the gap is whole weeks', () => {
    expect(specialDayLead(14)).toEqual({ kind: 'weeks', n: 2 });
    expect(specialDayLead(1)).toEqual({ kind: 'tomorrow', n: 1 });
    expect(specialDayLead(0)).toEqual({ kind: 'today', n: 0 });
    expect(specialDayLead(10)).toEqual({ kind: 'days', n: 10 });
  });
  it('computes the age turned', () => {
    expect(turnsAge('2016-10-06', '2026-10-06')).toBe(10);
    expect(turnsAge('2016-10-07', '2026-10-06')).toBe(9);
    expect(turnsAge(null, '2026-10-06')).toBeNull();
  });
  it('picks pronouns and dismiss keys', () => {
    expect(pronounFor('female')).toBe('her');
    expect(pronounFor('male')).toBe('his');
    expect(pronounFor(null)).toBe('their');
    expect(specialDayDismissKey('d1', '2026-10-06')).toBe('d1:2026');
  });
});

describe('lunch why line', () => {
  const m = (name: string, childUnder12 = false, senior = false) => ({ name, childUnder12, senior });
  it('families with a child eat together first', () => {
    expect(lunchWhy({ isFirstSlot: true, members: [m('Priya'), m('Anya', true)], checkedInTime: '10:42 AM', movedByYou: false })).toEqual({ tag: 'starts', why: { kind: 'child', names: [], time: null } });
  });
  it('seniors are named', () => {
    expect(lunchWhy({ isFirstSlot: true, members: [m('Kanta', false, true)], checkedInTime: null, movedByYou: false }).why).toEqual({ kind: 'seniors', names: ['Kanta'], time: null });
  });
  it('others go by arrival', () => {
    expect(lunchWhy({ isFirstSlot: false, members: [m('Rahul')], checkedInTime: '10:42 AM', movedByYou: false })).toEqual({ tag: 'assigned', why: { kind: 'arrival', names: [], time: '10:42 AM' } });
  });
  it('a move by the member wins', () => {
    expect(lunchWhy({ isFirstSlot: false, members: [m('Rahul')], checkedInTime: '10:42 AM', movedByYou: true }).tag).toBe('moved');
  });
});

describe('giving tiers', () => {
  const fmt = (c: number) => `$${(c / 100).toLocaleString('en-US')}`;
  it('lists fixed levels high to low', () => {
    expect(
      tierLadder(
        [
          { name: 'Silver', amount_cents: 100000 },
          { name: 'Platinum', amount_cents: 500000 },
          { name: 'Gold', amount_cents: 250000 },
        ],
        fmt,
      ),
    ).toBe('Platinum $5,000 · Gold $2,500 · Silver $1,000');
  });
  it('needs at least two fixed levels', () => {
    expect(tierLadder([{ name: 'Any', amount_cents: null }, { name: 'Gold', amount_cents: 1000 }], fmt)).toBeNull();
  });
});

describe('calendar', () => {
  it('computes Vir Samvat around Diwali', () => {
    expect(virSamvat('2026-09-22', 'Bhadarva')).toBe(2552);
    expect(virSamvat('2026-11-20', 'Kartak')).toBe(2553);
    expect(virSamvat('2026-11-05', 'Aso')).toBe(2552);
    expect(virSamvat('2026-12-10')).toBe(2553);
    expect(virSamvat('2027-01-10')).toBe(2553);
  });
  it('orders layers like the prototype', () => {
    const { main, schools } = orderLayers([
      { kind: 'events', name: 'JSH events' },
      { kind: 'school_district', name: 'Katy ISD' },
      { kind: 'tithi', name: 'Jain tithi' },
      { kind: 'pathshala', name: 'Pathshala' },
      { kind: 'school_district', name: 'Cy-Fair ISD' },
    ]);
    expect(main.map((l) => l.name)).toEqual(['Jain tithi', 'Pathshala', 'JSH events']);
    expect(schools.map((l) => l.name)).toEqual(['Cy-Fair ISD', 'Katy ISD']);
  });
  it('writes valid all-day ICS', () => {
    const ics = buildIcs('JSH calendars', [{ uid: 'a@x', date: '2026-09-27', title: 'Tapasvi Bahuman, Swamivatsalya', description: 'Stafford Center', calendar: 'JSH events' }], new Date('2026-09-22T10:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260927\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20260928\r\n');
    expect(ics).toContain('SUMMARY:Tapasvi Bahuman\\, Swamivatsalya\r\n');
    expect(ics).toContain('DTSTAMP:20260922T100000Z');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
  it('turns feeds into webcal links', () => {
    expect(toWebcal('https://katyisd.org/cal.ics')).toBe('webcal://katyisd.org/cal.ics');
  });
});

describe('notification routing', () => {
  it('routes the RSVP reminder and its actions', () => {
    const data = { type: 'rsvp_confirm', event_id: 'e1' };
    expect(routeForNotification(data, null)).toEqual({ kind: 'confirm_popup', eventId: 'e1' });
    expect(routeForNotification(data, ACTION_CONFIRM_YES)).toEqual({ kind: 'confirm_yes', eventId: 'e1' });
    expect(routeForNotification(data, ACTION_CONFIRM_CHANGE)).toEqual({ kind: 'confirm_screen', eventId: 'e1' });
  });
  it('routes lunch, feedback and special days', () => {
    expect(routeForNotification({ type: 'lunch', event_id: 'e1' }, null)).toEqual({ kind: 'tickets', eventId: 'e1' });
    expect(routeForNotification({ type: 'feedback', survey_id: 's1' }, null)).toEqual({ kind: 'survey', surveyId: 's1' });
    expect(routeForNotification({ type: 'feedback', event_id: 'e1' }, null)).toEqual({ kind: 'event_feedback', eventId: 'e1' });
    expect(routeForNotification({ type: 'special_day', special_day_id: 'd1' }, null)).toEqual({ kind: 'labh', dayId: 'd1' });
    expect(routeForNotification({ type: 'special_day' }, null)).toEqual({ kind: 'special_days' });
  });
  it('ignores unknown or unsafe payloads', () => {
    expect(routeForNotification(null, null)).toBeNull();
    expect(routeForNotification({ type: 'rsvp_confirm' }, null)).toBeNull();
    expect(routeForNotification({ url: 'https://evil.example' }, null)).toBeNull();
    expect(routeForNotification({ url: '//evil.example' }, null)).toBeNull();
    expect(routeForNotification({ url: '/events' }, null)).toEqual({ kind: 'url', path: '/events' });
  });
  it('snoozes the pop-up', () => {
    expect(popupDue(null, 1000)).toBe(true);
    expect(popupDue(2000, 1000)).toBe(false);
    expect(popupDue(1000, 1000)).toBe(true);
  });
});

describe('photos', () => {
  it('dates albums from their event or creation', () => {
    expect(albumDate('2026-09-12T14:00:00Z', null, '2026-09-13T00:00:00Z', TZ)).toBe('Sep 12, 2026');
    expect(albumDate('2026-09-08T14:00:00Z', '2026-09-16T23:00:00Z', '2026-09-17T00:00:00Z', TZ)).toBe('Sep 8–16, 2026');
    expect(albumDate('2026-09-28T14:00:00Z', '2026-10-02T14:00:00Z', '2026-10-03T00:00:00Z', TZ)).toBe('Sep 28 – Oct 2, 2026');
    expect(albumDate(null, null, '2025-12-10T18:00:00Z', TZ)).toBe('Dec 2025');
  });
  it('keeps palettes and tile colours stable', () => {
    expect(paletteIndex('abc', 6)).toBe(paletteIndex('abc', 6));
    expect([0, 1, 2, 3, 4, 5].map(tileColorIndex)).toEqual([0, 3, 2, 2, 1, 0]);
  });
  it('clamps prev and next', () => {
    expect(stepIndex(0, -1, 5)).toBe(0);
    expect(stepIndex(4, 1, 5)).toBe(4);
    expect(stepIndex(2, 1, 5)).toBe(3);
  });
});
