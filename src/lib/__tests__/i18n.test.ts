import { describe, expect, it } from '@jest/globals';

import { pickTranslation, translate } from '../../i18n';
import { en } from '../../i18n/en';
import { gu } from '../../i18n/gu';
import { hi } from '../../i18n/hi';

describe('i18n', () => {
  it('interpolates placeholders', () => {
    expect(translate('en', 'events.rsvpN', { n: 3 })).toBe('RSVP for 3');
  });
  it('falls back to English for untranslated keys', () => {
    expect(translate('gu', 'events.rsvpN', { n: 2 })).toBe('RSVP for 2');
    expect(translate('gu', 'tab.home')).toBe('હોમ');
  });
  it('has every key in Gujarati and Hindi', () => {
    const keys = Object.keys(en).sort();
    expect(Object.keys(gu).sort()).toEqual(keys);
    expect(Object.keys(hi).sort()).toEqual(keys);
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
