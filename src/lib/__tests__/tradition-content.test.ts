import { describe, expect, it } from '@jest/globals';

import { occasionsFor, OCCASIONS } from '../../features/special-days';
import type { CalendarLayer, CalendarMonth } from '../api/calendar';
import { ownCalendarsOnly } from '../calendar-tradition';
import { genericProfile, JAIN_LAYOUT, JAIN_PROFILE, layoutFor, parseCategoryProfile, parseLayoutHints } from '../categories';
import { faithOtherPayload } from './neutral-fixtures';

/**
 * The tradition's own calendar and texts (lunar days, the panchang and festival pack of the calendar, the library of daily
 * readings) belong to a category that uses a tradition (connect-crm 0594: the shared library applies to it). Every other kind of
 * organization has its own dates, events and calendars, and never the Jain ones.
 */

const CENTER = 'c1';
const layer = (id: string, kind: string, center: string | null): CalendarLayer => ({ id, kind, center_id: center, name: id }) as unknown as CalendarLayer;

const MONTH: CalendarMonth = {
  layers: [layer('tithi', 'tithi', null), layer('fest', 'festival', null), layer('ownfest', 'festival', CENTER), layer('school', 'school_district', null), layer('events', 'events', CENTER), layer('pathshala', 'pathshala', null)],
  items: [
    { date: '2026-10-01', layerId: 'fest', title: 'Shared festival', sub: null },
    { date: '2026-10-02', layerId: 'ownfest', title: 'Our festival', sub: null },
    { date: '2026-10-03', layerId: 'school', title: 'No school', sub: null },
    { date: '2026-10-04', layerId: 'events', title: 'Annual dinner', sub: 'Hall' },
  ],
  tithis: { '2026-10-01': { id: 't', gregorian: '2026-10-01', tithi: 'Sud 11', month_name: 'Aso', paksha: 'sud', is_parva: true, center_id: null, tradition: null, notes: null } },
};

describe('the calendar of a kind of organization without a tradition', () => {
  it('has its own calendars and the shared ones that are not a panchang or a festival pack, and no tithi on any day', () => {
    const own = ownCalendarsOnly(MONTH, CENTER);
    expect(own.layers.map((l) => l.id)).toEqual(['ownfest', 'school', 'events', 'pathshala']);
    expect(own.items.map((i) => i.title)).toEqual(['Our festival', 'No school', 'Annual dinner']);
    expect(own.tithis).toEqual({});
  });

  it('keeps its own festival layer only when it is the community’s own, and never lets a shared one through when the community is not known', () => {
    expect(ownCalendarsOnly(MONTH, null).layers.map((l) => l.id)).toEqual(['school', 'events', 'pathshala']);
  });
});

describe('what a category’s profile says of the tradition', () => {
  it('is on for Jain Center, which has the shared Jain library', () => {
    expect(layoutFor(JAIN_PROFILE).traditionContent).toBe(true);
    expect(JAIN_LAYOUT.traditionContent).toBe(true);
  });

  it('is off for the faith community, which has the faith but not a tradition, and for any kind the app has not heard of', () => {
    const faith = parseCategoryProfile(faithOtherPayload());
    expect(faith?.faithBased).toBe(true);
    expect(faith && layoutFor(faith).traditionContent).toBe(false);
    expect(layoutFor(genericProfile('book_club')).traditionContent).toBe(false);
  });

  it('can be set by the database’s layout, whatever the profile’s facts say', () => {
    expect(parseLayoutHints({ tradition_content: true })).toEqual({ traditionContent: true });
    expect(parseLayoutHints({ tradition_content: 'yes' })).toBeNull();
    const faith = parseCategoryProfile({ ...(faithOtherPayload() as object), layout: { tradition_content: true } });
    expect(faith && layoutFor(faith).traditionContent).toBe(true);
  });
});

describe('the occasions of a special day', () => {
  it('are all five for a category with a tradition', () => {
    expect(occasionsFor(true)).toEqual(OCCASIONS);
    expect(occasionsFor(true)).toContain('birth_tithi');
  });

  it('are a birthday, an anniversary, a remembrance day and another day for any other: no day by its lunar date', () => {
    expect(occasionsFor(false)).toEqual(['birthday', 'anniversary', 'punyatithi', 'other']);
  });
});
