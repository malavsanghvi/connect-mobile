import { describe, expect, it } from '@jest/globals';

import { CATEGORY_WORDS, GENERIC_WORDS, wordsFor } from '../../i18n/categories';
import { en } from '../../i18n/en';
import { gu } from '../../i18n/gu';
import { hi } from '../../i18n/hi';
import { applySwaps, hasWords, translate, translateWith, type Language, type StringKey, type WordSet } from '../../i18n';
import { genericProfile, JAIN_PROFILE, parseCategoryProfile } from '../categories';
import { newExperiencePayload } from './categories-fixtures';

const LANGS: Language[] = ['en', 'gu', 'hi'];
const KEYS = Object.keys(en) as StringKey[];

describe('Jain Center’s words are today’s, key for key', () => {
  it('has no words to lay over the dictionary', () => {
    expect(CATEGORY_WORDS.jain_center).toEqual({});
    expect(wordsFor(JAIN_PROFILE)).toBeNull();
    expect(hasWords(null)).toBe(false);
    expect(hasWords({})).toBe(false);
    expect(hasWords({ en: {} })).toBe(false);
  });

  it('looks every key up exactly as translate does, in every language, with and without placeholders', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        const vars = { center: 'JSH', family: 'Shah', n: 3, name: 'Asha', event: 'Garba', time: '8:00 AM' };
        expect(translateWith(lang, key, vars, null)).toBe(translate(lang, key, vars));
        expect(translateWith(lang, key, undefined, wordsFor(JAIN_PROFILE))).toBe(translate(lang, key));
      }
    }
  });

  it('keeps the reviewed Gujarati and Hindi tab labels', () => {
    expect(translateWith('gu', 'tab.give', undefined, null)).toBe(gu['tab.give']);
    expect(translateWith('hi', 'tab.family', undefined, null)).toBe(hi['tab.family']);
  });
});

describe('another kind of organization’s words', () => {
  const words: WordSet = { en: { 'tab.give': 'Pay', 'home.greetingFamily': 'Welcome, {family}' }, gu: { 'tab.give': 'ચુકવણી' } };

  it('puts the kind’s English where the dictionary has Jain wording, in every language', () => {
    expect(translateWith('en', 'tab.give', undefined, words)).toBe('Pay');
    expect(translateWith('hi', 'tab.give', undefined, words)).toBe('Pay');
    expect(translateWith('gu', 'tab.give', undefined, words)).toBe('ચુકવણી');
  });

  it('keeps the placeholders working', () => {
    expect(translateWith('en', 'home.greetingFamily', { family: 'Patel' }, words)).toBe('Welcome, Patel');
  });

  it('leaves every other key to the dictionary', () => {
    expect(translateWith('en', 'tab.events', undefined, words)).toBe(en['tab.events']);
    expect(translateWith('gu', 'tab.events', undefined, words)).toBe(gu['tab.events']);
  });
});

describe('the words the app has for kinds of organization', () => {
  const sets: [string, WordSet][] = [['generic', GENERIC_WORDS], ...Object.entries(CATEGORY_WORDS)];

  it('are all keys of the dictionary, so a typo cannot hide a word', () => {
    for (const [name, set] of sets) {
      for (const lang of LANGS) {
        for (const key of Object.keys(set[lang] ?? {})) expect([name, key, key in en]).toEqual([name, key, true]);
      }
    }
  });

  it('never say "bid": a pledge is a pledge', () => {
    for (const [, set] of sets) {
      for (const lang of LANGS) {
        const offenders = Object.entries(set[lang] ?? {}).filter(([, v]) => /\bbid(s|ding)?\b|\boutbid\b/i.test(v ?? ''));
        expect(offenders).toEqual([]);
      }
    }
  });

  it('keep every placeholder of the word they replace', () => {
    const placeholders = (s: string): string[] => s.match(/\{\w+\}/g) ?? [];
    for (const [name, set] of sets) {
      for (const [key, value] of Object.entries(set.en ?? {})) {
        const base = en[key as StringKey];
        // A kind may use fewer placeholders (it need not mention the center), but never one the screen does not pass.
        const extra = placeholders(value ?? '').filter((p) => !placeholders(base).includes(p));
        expect([name, key, extra]).toEqual([name, key, []]);
      }
    }
  });

  it('layer the database’s terms and words over the app’s own, the database last', () => {
    const profile = parseCategoryProfile(newExperiencePayload());
    if (!profile) throw new Error('profile');
    const set = wordsFor(profile);
    expect(set?.en?.['tab.give']).toBe('Offerings');
    expect(set?.en?.['home.todayAt']).toBe('Today here');
    // a kind the app has no entry for still speaks neutrally: the generic set, then its terms
    const generic = wordsFor(genericProfile('x'));
    expect(generic?.en?.['home.greetingFamily']).toBe('Welcome, {family}');
    expect(applySwaps(en['drawer.store'], generic?.swap ?? [])).toBe('Store');
  });
});
