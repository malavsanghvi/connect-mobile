import { describe, expect, it } from '@jest/globals';

import { phrasesFor, wordsFor } from '../../i18n/categories';
import { en, type StringKey } from '../../i18n/en';
import { translate, translateWith } from '../../i18n';
import { categoryModuleMap, genericProfile, JAIN_PROFILE, layoutFor, parseCategoryProfile, type CategoryProfile } from '../categories';
import { isModuleOn } from '../modules';
import { retargetWith } from '../wording';
import { bannedIn, BANNED, LANGUAGES_AUDITED, leaksOf, ownWords, resolved, type Leak } from './neutral-audit';
import { chamberPayload, communityPayload, faithDemoPayload, faithOtherPayload, gurdwaraPayload } from './neutral-fixtures';

/**
 * "Make everything in the demo app neutral" (owner, 2026-10-15). The English dictionary is Jain Center's own wording; every other
 * kind of organization must read none of it. This audits EVERY string of the dictionary (src/i18n/en.ts, all 2,700 and more) as the
 * app resolves it for each category, in English, Gujarati and Hindi, and fails with the key, the word and the text when a Jain word
 * (or a word of any one tradition) is left. A new string cannot bring one back without this test saying which.
 *
 * The sentences written in code outside the dictionary (the action of a failure, a placeholder) are audited the same way in
 * neutral-code.test.ts.
 */

function profileOf(payload: unknown): CategoryProfile {
  const p = parseCategoryProfile(payload);
  if (!p) throw new Error('the fixture is not a category profile');
  return p;
}

/** What the audit is run for: the database's answer for each category that is not a Jain Center, and what the app has before or without it. */
const AUDITED: [string, CategoryProfile][] = [
  ['Faith community (faith_other), as the database answers', profileOf(faithOtherPayload())],
  ['Faith community in the demo (school, learning path, store and Niva on)', profileOf(faithDemoPayload())],
  ['Community organization (nonprofit_secular)', profileOf(communityPayload())],
  ['Chamber of commerce', profileOf(chamberPayload())],
  ['A gurdwara: a new faith that brings its own terms as data', profileOf(gurdwaraPayload())],
  ['A kind the app has never heard of, before the database answers', genericProfile('book_club', 'Book club')],
  ['Faith community, with no answer from the database yet', { ...genericProfile('faith_other', 'Faith community'), faithBased: true }],
  ['A kind that names its wording pack', { ...genericProfile('mosque', 'Mosque'), wordingPack: 'faith' }],
];

/** Dictionary keys left on purpose. None: a word is replaced, not excused. Add one only with the reason, and the screen that shows it. */
const LEFT_ON_PURPOSE = new Map<string, string>();

function describeLeaks(leaks: Leak[]): string[] {
  return leaks.slice(0, 40).map((l) => `${l.lang} ${l.key} [${l.word}${l.kind === 'borderline' ? ', borderline' : ''}] ${l.text}`);
}

describe('no Jain word in the dictionary of any other kind of organization', () => {
  for (const [name, profile] of AUDITED) {
    it(`${name}: not one string of the dictionary has a word of one tradition, in English, Gujarati or Hindi`, () => {
      expect(describeLeaks(leaksOf(profile, new Set(LEFT_ON_PURPOSE.keys())))).toEqual([]);
    });
  }

  it('leaves nothing on purpose', () => {
    expect([...LEFT_ON_PURPOSE.entries()]).toEqual([]);
  });

  it('audits what it should: the Jain dictionary itself is full of them (the audit can see a Jain word, in every script it checks)', () => {
    const jain = Object.entries(en).filter(([, text]) => bannedIn(text));
    expect(jain.length).toBeGreaterThan(200);
    for (const word of ['Jain', 'Jai Jinendra', 'derasar', 'puja', 'aarti', 'tithi', 'tapasya', 'pachchakhan', 'Pathshala', 'Gyan Path', 'boli', 'labh', '3L', 'anumodana', 'stavan']) {
      const found = BANNED.find((b) => b.id === word);
      expect([word, !!found && Object.values(en).some((text) => found.re.test(text))]).toEqual([word, true]);
    }
    expect(bannedIn('જૈન માર્ગ')?.id).toBe('in Gujarati script: Jain');
    expect(bannedIn('जैन मार्ग')?.id).toBe('in Devanagari script: Jain');
    expect(bannedIn('Welcome to the place of worship')).toBeNull();
    expect(BANNED.length).toBeGreaterThan(30);
    expect(LANGUAGES_AUDITED).toEqual(['en', 'gu', 'hi']);
  });

  it('does not excuse a word a category brings itself: its own terms are its own', () => {
    const gurdwara = profileOf(gurdwaraPayload());
    expect(ownWords(gurdwara)).toEqual(expect.arrayContaining(['Seva', 'Sat Sri Akal', 'Gurbani path', 'Punjabi school']));
    expect(bannedIn('Seva', [])?.id).toBe('seva');
    expect(bannedIn('Seva', ownWords(gurdwara))).toBeNull();
  });
});

describe('the Gujarati and Hindi screens of another kind of organization', () => {
  it('show the Jain tab label nowhere: the practice tab is the category’s word, in every language', () => {
    const faith = profileOf(faithOtherPayload());
    const words = wordsFor(faith);
    for (const lang of LANGUAGES_AUDITED) expect(translateWith(lang, 'tab.jainWay', undefined, words)).toBe('Learn');
    // and a kind with no practice tab still has no Jain label behind it
    const community = profileOf(communityPayload());
    for (const lang of LANGUAGES_AUDITED) expect(translateWith(lang, 'tab.jainWay', undefined, wordsFor(community))).toBe('Learn');
  });

  it('keep the reviewed labels that are not Jain, as Jain Center has them', () => {
    const faith = profileOf(faithOtherPayload());
    expect(translateWith('gu', 'tab.family', undefined, wordsFor(faith))).toBe(translate('gu', 'tab.family'));
    expect(translateWith('hi', 'tab.give', undefined, wordsFor(faith))).toBe(translate('hi', 'tab.give'));
  });
});

describe('a category’s terms reach every sentence, not only the labels', () => {
  const faith = profileOf(faithOtherPayload());
  const text = (profile: CategoryProfile, key: StringKey): string => translateWith('en', key, undefined, wordsFor(profile));

  it('says the school, the learning path and the place of worship in the faith community’s own terms', () => {
    expect(text(faith, 'reg.title')).toBe('Religious school registration');
    expect(text(faith, 'enrollReq.cta')).toBe('Register for Religious school');
    expect(text(faith, 'learn.noGoals')).toBe('Learning path is coming');
    expect(text(faith, 'learn.goalsGreeting')).toBe('Learning path · Welcome, {name}');
    expect(text(faith, 'guide.derasarToday')).toBe('Place of worship today');
    expect(text(faith, 'store.pickup')).toBe('Pickup at the place of worship');
    expect(text(faith, 'guide.heroEyebrow')).toBe('Welcome');
    expect(text(faith, 'jw.title')).toBe('Learn');
    expect(text(faith, 'reg.strip.hint')).toBe('Opens Religious school in Learn');
  });

  it('says a new faith’s terms the same way, wherever the dictionary says Pathshala, Gyan Path or derasar', () => {
    const gurdwara = profileOf(gurdwaraPayload());
    expect(text(gurdwara, 'reg.title')).toBe('Punjabi school registration');
    expect(text(gurdwara, 'learn.heroEyebrow')).toBe('Gurbani path · Level {level} of {n}');
    expect(text(gurdwara, 'store.pickup')).toBe('Pickup at the gurdwara');
    expect(text(gurdwara, 'home.greetingFamily')).toBe('Sat Sri Akal, {family}');
    expect(text(gurdwara, 'tab.jainWay')).toBe('Seva');
  });

  it('leaves no unfilled term token behind, and no placeholder the screen does not pass', () => {
    const placeholders = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [, profile] of AUDITED) {
      for (const lang of LANGUAGES_AUDITED) {
        for (const [key, said] of resolved(profile, lang)) {
          const extra = placeholders(said).filter((p) => !placeholders(en[key]).includes(p));
          expect([profile.key, key, extra]).toEqual([profile.key, key, []]);
        }
      }
    }
  });

  it('uses the same placeholders for the one screen that fills them as the dictionary does', () => {
    // {place} is filled by the Today card's "When to visit the {place}": a pack's own text must not have taken it away
    expect(text(faith, 'home.serviceTimesLead')).toBe(en['home.serviceTimesLead']);
  });
});

describe('what a Jain community is shown does not change', () => {
  it('has no words at all: the dictionary, key for key', () => {
    expect(wordsFor(JAIN_PROFILE)).toBeNull();
    expect(phrasesFor(JAIN_PROFILE)).toEqual([]);
    for (const lang of LANGUAGES_AUDITED) for (const [key, said] of resolved(JAIN_PROFILE, lang)) expect(said).toBe(translate(lang, key));
  });

  it('says a failure’s action as it is written', () => {
    expect(retargetWith('load Pathshala terms', JAIN_PROFILE.terms, phrasesFor(JAIN_PROFILE))).toBe('load Pathshala terms');
    expect(retargetWith('send anumodana', JAIN_PROFILE.terms, phrasesFor(JAIN_PROFILE))).toBe('send anumodana');
  });
});

describe('the Jain-only parts of the app are not there to be shown to another kind of organization', () => {
  for (const [name, profile] of AUDITED.slice(0, 5)) {
    it(`${name}: no Bolis, no daily practice (My Jain Way), no Labh; the plain Today card; no tradition calendar or readings`, () => {
      const map = categoryModuleMap(profile);
      for (const key of ['bolis', 'jain_way', 'labh'] as const) expect([key, isModuleOn(map, key)]).toEqual([key, false]);
      const layout = layoutFor(profile);
      expect(layout.todayCard).not.toBe('full');
      expect(layout.traditionContent).toBe(false);
    });
  }

  it('a Jain Center has all of it', () => {
    const layout = layoutFor(JAIN_PROFILE);
    expect(layout.todayCard).toBe('full');
    expect(layout.traditionContent).toBe(true);
    expect(isModuleOn(categoryModuleMap(JAIN_PROFILE), 'bolis')).toBe(true);
  });
});
