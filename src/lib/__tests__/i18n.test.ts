import { describe, expect, it } from '@jest/globals';

import { pickTranslation, translate } from '../../i18n';
import { en } from '../../i18n/en';
import { gu } from '../../i18n/gu';
import { hi } from '../../i18n/hi';

describe('i18n', () => {
  it('interpolates placeholders', () => {
    expect(translate('en', 'events.rsvpN', { people: '3 people' })).toBe('RSVP 3 people');
  });
  it('falls back to English for untranslated keys', () => {
    expect(translate('gu', 'events.rsvpN', { people: '2 people' })).toBe('RSVP 2 people');
    expect(translate('gu', 'tab.home')).toBe('હોમ');
  });
  it('has every key in Gujarati and Hindi', () => {
    const keys = Object.keys(en).sort();
    expect(Object.keys(gu).sort()).toEqual(keys);
    expect(Object.keys(hi).sort()).toEqual(keys);
  });
  it('names no tradition or organization on the screens before an organization is chosen (Find your community)', () => {
    const offenders = Object.entries(en).filter(([k, v]) => k.startsWith('community.') && /jain|jsh|houston|jinendra|derasar|temple/i.test(v));
    expect(offenders).toEqual([]);
    expect(en['community.subtitle']).toBe('Weaver is used by many organizations. Choose yours to continue.');
  });
  it('never says "bid" — bolis are always pledges', () => {
    const offenders = Object.entries(en).filter(([, v]) => /\bbid(s|ding)?\b|\boutbid\b/i.test(v));
    expect(offenders).toEqual([]);
  });
  it('picks a translated title from a translations column', () => {
    const base = { title: 'Timings', body_md: 'Derasar 7:30 AM' };
    expect(pickTranslation(base, { gu: { title: 'સમય' } }, 'gu')).toEqual({ title: 'સમય', body_md: 'Derasar 7:30 AM' });
    expect(pickTranslation(base, { gu: { title: 'સમય' } }, 'hi')).toEqual(base);
    expect(pickTranslation(base, null, 'gu')).toEqual(base);
  });
});
