import { describe, expect, it } from '@jest/globals';

import { wordsFor } from '../../i18n/categories';
import { en } from '../../i18n/en';
import {
  BUILTIN_PROFILES,
  categoryModuleLabels,
  categoryModuleMap,
  chooseProfile,
  fallbackProfile,
  genericProfile,
  interestLabel,
  interestsToOffer,
  isBuiltinCategory,
  isMissingColumnError,
  JAIN_CENTER,
  JAIN_INTERESTS,
  JAIN_LAYOUT,
  JAIN_PROFILE,
  JAIN_TERMS,
  KNOWN_INTERESTS,
  layoutFor,
  mergeModuleMap,
  parseCategoryProfile,
  parseLayoutHints,
  parseWords,
  termWords,
} from '../categories';
import { HOME_SHORTCUT_KEYS } from '../home-shortcuts';
import { ALL_ON, MODULE_KEYS, isModuleOn, isTabVisible, type ModuleMap } from '../modules';
import { barItems, TABS } from '../nav-bar';
import { homeRows, learnListenTiles, lifeTiles } from '../home-rails';
import { INTERESTS_FOR_TESTS, jainPayload, newExperiencePayload } from './categories-fixtures';

describe('Jain Center is today, exactly', () => {
  it('has every module on before my_modules answers (the map is empty, as ALL_ON was)', () => {
    expect(categoryModuleMap(JAIN_PROFILE)).toEqual(ALL_ON);
    for (const key of MODULE_KEYS) expect(isModuleOn(categoryModuleMap(JAIN_PROFILE), key)).toBe(true);
  });

  it('lays out the very constants the app had: five tabs, the full Today card, special days, the six interests and six shortcuts', () => {
    expect(layoutFor(JAIN_PROFILE)).toEqual(JAIN_LAYOUT);
    expect(JAIN_LAYOUT).toEqual({
      practiceTab: true,
      todayCard: 'full',
      specialDays: true,
      tradition: true,
      interests: ['events', 'pathshala', 'volunteering', 'youth', 'seniors', 'giving'],
      shortcuts: ['learn', 'playlist', 'photos', 'recipe', 'podcast', 'guide'],
    });
    expect(JAIN_LAYOUT.shortcuts).toEqual([...HOME_SHORTCUT_KEYS]);
  });

  it('shows the same bar as before: Home, Events, Give, Jain Way, Family, then Niva', () => {
    const layout = layoutFor(JAIN_PROFILE);
    const map = categoryModuleMap(JAIN_PROFILE);
    expect(barItems(map, true, layout.practiceTab)).toEqual(['index', 'events', 'give', 'jain-way', 'family', 'niva']);
    expect(barItems(map, true, layout.practiceTab)).toEqual(barItems(ALL_ON, true));
    expect(TABS.every((tab) => isTabVisible(map, tab))).toBe(true);
  });

  it('adds no words: the English dictionary is Jain Center’s wording, and its terms are those very words', () => {
    expect(termWords(JAIN_TERMS)).toEqual({});
    expect(wordsFor(JAIN_PROFILE)).toBeNull();
    expect(JAIN_TERMS.greeting).toBe(en['welcome.jaiJinendra']);
    expect(en['home.greetingFamily']).toBe(`${JAIN_TERMS.greeting}, {family}`);
    expect(en['home.greetingLead']).toBe(`${JAIN_TERMS.greeting},`);
    expect(JAIN_TERMS.give_tab).toBe(en['tab.give']);
    expect(JAIN_TERMS.family_tab).toBe(en['tab.family']);
    expect(JAIN_TERMS.practice_tab).toBe(en['tab.jainWay']);
    expect(JAIN_TERMS.store).toBe(en['drawer.store']);
    expect(en['drawer.pathshala']).toBe(`${JAIN_TERMS.school} Connect`);
  });

  it('is what the database answers for a Jain Center: the same layout, modules and words, whatever else the answer holds', () => {
    const parsed = parseCategoryProfile(jainPayload());
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.key).toBe(JAIN_CENTER);
    expect(layoutFor(parsed)).toEqual(JAIN_LAYOUT);
    expect(categoryModuleMap(parsed)).toEqual(ALL_ON);
    expect(categoryModuleLabels(parsed)).toEqual({});
    expect(termWords(parsed.terms)).toEqual({});
    expect(wordsFor(parsed)).toBeNull();
    expect(parsed.terms).toEqual(JAIN_TERMS);
  });

  it('offers the six interests in their original order, each with its original label', () => {
    expect(interestsToOffer(JAIN_LAYOUT)).toEqual(JAIN_INTERESTS);
    expect(INTERESTS_FOR_TESTS.map((k) => interestLabel((key) => en[key], k))).toEqual(['Events', 'Pathshala', 'Volunteering', 'Youth programs', 'Seniors', 'Giving opportunities']);
    expect(KNOWN_INTERESTS.slice(0, 6)).toEqual(JAIN_INTERESTS);
  });

  it('leaves Home exactly as it was: every row a member gets, the special days and the six shortcut tiles', () => {
    const member = { isAdult: true, hasHousehold: true };
    const access = { guide: true, learn: true, listen: true, look: true };
    const before = homeRows({ rules: {}, modules: ALL_ON, member, access });
    const after = homeRows({ rules: {}, modules: categoryModuleMap(JAIN_PROFILE), member, access, layout: layoutFor(JAIN_PROFILE) });
    expect(after).toEqual(before);
    expect(after).toEqual(['today', 'specialDays', 'events', 'give', 'life', 'learnListen']);
    const tilesBefore = learnListenTiles({ rules: {}, modules: ALL_ON, signedIn: true, access });
    const tilesAfter = learnListenTiles({ rules: {}, modules: ALL_ON, signedIn: true, access, defaultShortcuts: JAIN_LAYOUT.shortcuts });
    expect(tilesAfter).toEqual(tilesBefore);
    expect(lifeTiles({ modules: ALL_ON, guideAllowed: true, member, specialDays: JAIN_LAYOUT.specialDays })).toEqual(lifeTiles({ modules: ALL_ON, guideAllowed: true, member }));
  });

  it('is the built-in profile for a community whose database has no categories yet', () => {
    expect(fallbackProfile(null)).toBe(JAIN_PROFILE);
    expect(fallbackProfile(undefined)).toBe(JAIN_PROFILE);
    expect(fallbackProfile('')).toBe(JAIN_PROFILE);
    expect(fallbackProfile(JAIN_CENTER)).toBe(JAIN_PROFILE);
    expect(isBuiltinCategory(null)).toBe(true);
    expect(isBuiltinCategory(JAIN_CENTER)).toBe(true);
  });
});

describe('a kind of organization the app has no entry for (a new experience, data only)', () => {
  it('gets the generic layout: no fourth tab, the date-only Today card, no special days, neutral interests and shortcuts', () => {
    const profile = genericProfile('swaminarayan_temple', 'Swaminarayan Temple');
    expect(isBuiltinCategory('swaminarayan_temple')).toBe(false);
    expect(BUILTIN_PROFILES.swaminarayan_temple).toBeUndefined();
    const layout = layoutFor(profile);
    expect(layout.practiceTab).toBe(false);
    expect(layout.todayCard).toBe('basic');
    expect(layout.specialDays).toBe(false);
    expect(layout.interests).toEqual(['events', 'volunteering', 'youth', 'seniors', 'giving']);
    expect(layout.shortcuts).toEqual(['photos', 'guide']);
  });

  it('never says a Jain word: generic terms and no Jain-only modules', () => {
    const profile = genericProfile('anything');
    const text = JSON.stringify(profile.terms);
    expect(text).not.toMatch(/jai|jain|tithi|puja|derasar|pathshala|gyan|satvik/i);
    const map = categoryModuleMap(profile);
    for (const m of ['bolis', 'jain_way', 'pathshala', 'gyan_path'] as const) expect(isModuleOn(map, m)).toBe(false);
    expect(isModuleOn(map, 'events')).toBe(true);
    expect(isModuleOn(map, 'giving')).toBe(true);
  });

  it('has the bar Home, Events, Give, Family (and Niva for someone who may use it)', () => {
    const profile = genericProfile('anything');
    const layout = layoutFor(profile);
    expect(barItems(categoryModuleMap(profile), true, layout.practiceTab)).toEqual(['index', 'events', 'give', 'family', 'niva']);
  });

  it('is laid out entirely from what the database says, without an app update: its words, tabs, modules and Home', () => {
    const profile = parseCategoryProfile(newExperiencePayload());
    expect(profile).not.toBeNull();
    if (!profile) return;
    // words: the named terms become dictionary entries wherever they differ from Jain Center's
    expect(termWords(profile.terms)).toEqual({
      'tab.give': 'Offerings',
      'tab.family': 'My household',
      'tab.jainWay': 'Satsang',
      'jw.title': 'Satsang',
      'home.greetingFamily': 'Welcome, {family}',
      'home.greetingLead': 'Welcome,',
    });
    expect(wordsFor(profile)?.en?.['tab.give']).toBe('Offerings');
    expect(wordsFor(profile)?.en?.['home.todayAt']).toBe('Today here');
    // modules: the kind's own names, and what is off before my_modules answers
    expect(categoryModuleLabels(profile)).toEqual({ giving: 'Offerings & dues', store: 'Prasad shop' });
    const defaults = categoryModuleMap(profile);
    expect(isModuleOn(defaults, 'bolis')).toBe(false);
    expect(isModuleOn(defaults, 'store')).toBe(false); // default_off until the organization switches it on
    expect(isModuleOn(defaults, 'events')).toBe(true);
    // layout: not tradition-based, so the date-only Today card; a practice tab (it has a term for one); its own interests and shortcuts
    const layout = layoutFor(profile);
    expect(layout.practiceTab).toBe(true);
    expect(layout.todayCard).toBe('basic');
    expect(layout.specialDays).toBe(false);
    expect(layout.interests).toEqual(['events', 'volunteering']);
    expect(layout.shortcuts).toEqual(['photos']);
    // the bar follows the data
    expect(barItems(defaults, false, layout.practiceTab)).toEqual(['index', 'events', 'give', 'jain-way', 'family']);
  });

  it('follows an administrator switching a module on or off, and the platform changing the kind', () => {
    const chamber = parseCategoryProfile(newExperiencePayload());
    if (!chamber) throw new Error('profile');
    const defaults = categoryModuleMap(chamber);
    // my_modules says the organization switched the store on: that wins over the kind's default
    const withStore = mergeModuleMap(defaults, { store: true });
    expect(isModuleOn(defaults, 'store')).toBe(false);
    expect(isModuleOn(withStore, 'store')).toBe(true);
    // and an organization that switched Events off loses the Events tab, whatever the kind
    const noEvents: ModuleMap = mergeModuleMap(defaults, { events: false, calendar: false, content: false });
    expect(barItems(noEvents, false, true)).not.toContain('events');
    // the kind changes (a new answer for the same community): a different bar, different Home
    const jain = categoryModuleMap(JAIN_PROFILE);
    expect(barItems(jain, false, layoutFor(JAIN_PROFILE).practiceTab)).toContain('jain-way');
    expect(barItems(categoryModuleMap(genericProfile('x')), false, layoutFor(genericProfile('x')).practiceTab)).not.toContain('jain-way');
    const member = { isAdult: true, hasHousehold: true };
    const access = { guide: true, learn: true, listen: true, look: true };
    const jainRows = homeRows({ rules: {}, modules: jain, member, access, layout: layoutFor(JAIN_PROFILE) });
    const otherRows = homeRows({ rules: {}, modules: categoryModuleMap(genericProfile('x')), member, access, layout: layoutFor(genericProfile('x')) });
    expect(jainRows).toContain('specialDays');
    expect(otherRows).not.toContain('specialDays');
    expect(otherRows).toEqual(['today', 'events', 'give', 'life', 'learnListen']);
  });

  it('keeps the community’s own Home shortcuts over the kind’s default', () => {
    const generic = layoutFor(genericProfile('x'));
    const access = { learn: true, listen: true, look: true };
    const modules = categoryModuleMap(genericProfile('x'));
    expect(learnListenTiles({ rules: {}, modules, signedIn: true, access, defaultShortcuts: generic.shortcuts })).toEqual(['photos']);
    expect(learnListenTiles({ rules: { home: { shortcuts: ['playlist'] } }, modules, signedIn: true, access, defaultShortcuts: generic.shortcuts })).toEqual(['playlist']);
    expect(learnListenTiles({ rules: { home: { shortcuts: [] } }, modules, signedIn: true, access, defaultShortcuts: generic.shortcuts })).toEqual([]);
  });
});

describe('what the database says is read carefully', () => {
  it('returns null for an answer that is not a profile', () => {
    expect(parseCategoryProfile(null)).toBeNull();
    expect(parseCategoryProfile('x')).toBeNull();
    expect(parseCategoryProfile({})).toBeNull();
    expect(parseCategoryProfile({ category: {} })).toBeNull();
    expect(parseCategoryProfile({ category: { key: '  ' } })).toBeNull();
  });

  it('ignores modules this build does not know and availabilities it does not understand', () => {
    const p = parseCategoryProfile({
      category: { key: 'k', label: 'K', faith_based: false, uses_tradition: false, terms: {} },
      modules: { events: { availability: 'default_on', label: null }, quantum: { availability: 'not_available' }, store: { availability: 'sometimes' }, bolis: { availability: 'not_available', label: ' ' } },
    });
    expect(p?.modules).toEqual({ events: { availability: 'default_on', label: null }, bolis: { availability: 'not_available', label: null } });
  });

  it('fills a missing term with the neutral word and keeps null as "this kind has no such thing"', () => {
    const p = parseCategoryProfile({ category: { key: 'k', terms: { give_tab: 'Pay', practice_tab: null } } });
    expect(p?.terms.give_tab).toBe('Pay');
    expect(p?.terms.practice_tab).toBeNull();
    expect(p?.terms.greeting).toBe('Welcome');
    expect(p?.terms.school).toBeNull();
  });

  it('never lets a core module be off, however the kind marks it', () => {
    const map = categoryModuleMap({ modules: { people: { availability: 'not_available', label: null }, store: { availability: 'default_off', label: null } } });
    expect(map).toEqual({ store: false });
  });

  it('keeps only words and layout hints this build understands', () => {
    expect(parseWords({ 'tab.give': 'Pay', 'no.such.key': 'x', 'tab.family': '  ', 'tab.events': 3 })).toEqual({ 'tab.give': 'Pay' });
    expect(parseWords(null)).toBeNull();
    expect(parseWords({ 'no.such.key': 'x' })).toBeNull();
    expect(parseLayoutHints({ today_card: 'basic', special_days: false, practice_tab: true, interests: ['events', 'nonsense'], shortcuts: ['photos', 'nonsense'], extra: 1 })).toEqual({
      todayCard: 'basic',
      specialDays: false,
      practiceTab: true,
      interests: ['events'],
      shortcuts: ['photos'],
    });
    expect(parseLayoutHints({ today_card: 'huge' })).toBeNull();
  });

  it('lets the database’s own layout win over what the facts and the app say', () => {
    const p = parseCategoryProfile({ category: { key: 'k', uses_tradition: true, faith_based: true, terms: { practice_tab: 'Path' } }, layout: { today_card: 'basic', special_days: false } });
    if (!p) throw new Error('profile');
    const layout = layoutFor(p);
    expect(layout.todayCard).toBe('basic');
    expect(layout.specialDays).toBe(false);
    expect(layout.practiceTab).toBe(true);
  });

  it('recognises a database from before the column existed', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column centers.category_key does not exist' })).toBe(true);
    expect(isMissingColumnError({ message: 'column "category_key" does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });

  it('knows no interests it has no label for', () => {
    for (const k of KNOWN_INTERESTS) expect(interestLabel((key) => en[key], k)).toBeTruthy();
    expect(interestsToOffer({ interests: ['events', 'unheard_of'] })).toEqual(['events']);
  });
});

describe('which profile the app is laid out with (no flash of the wrong layout)', () => {
  const other = parseCategoryProfile(newExperiencePayload());
  const jain = parseCategoryProfile(jainPayload());
  if (!other || !jain) throw new Error('fixtures');

  it('lays a Jain Center out on the very first frame, with nothing read yet', () => {
    const c = chooseProfile({ hint: JAIN_CENTER, live: null, cached: null, settled: false });
    expect(c).toEqual({ profile: JAIN_PROFILE, source: 'builtin', ready: true });
  });

  it('lays out a community whose database has no categories yet (no hint) as a Jain Center, at once', () => {
    expect(chooseProfile({ hint: null, live: null, cached: null, settled: false })).toEqual({ profile: JAIN_PROFILE, source: 'builtin', ready: true });
  });

  it('waits, showing a neutral loading screen, for a kind of organization it has no built-in for and has never read', () => {
    const c = chooseProfile({ hint: 'swaminarayan_temple', live: null, cached: null, settled: false });
    expect(c.ready).toBe(false);
    expect(c.profile.key).toBe('swaminarayan_temple');
    expect(layoutFor(c.profile).practiceTab).toBe(false); // never the Jain layout, even while waiting
  });

  it('uses what this device read last time at once, before the network answers', () => {
    const c = chooseProfile({ hint: 'swaminarayan_temple', live: null, cached: other, settled: false });
    expect(c).toEqual({ profile: other, source: 'cache', ready: true });
  });

  it('prefers the database’s answer to the device’s', () => {
    const newer = { ...other, terms: { ...other.terms, give_tab: 'Seva' } };
    expect(chooseProfile({ hint: 'swaminarayan_temple', live: newer, cached: other, settled: true }).profile).toBe(newer);
    expect(chooseProfile({ hint: 'swaminarayan_temple', live: newer, cached: other, settled: true }).source).toBe('live');
  });

  it('stops waiting, with the neutral layout, when the first read fails', () => {
    const c = chooseProfile({ hint: 'swaminarayan_temple', live: null, cached: null, settled: true });
    expect(c.ready).toBe(true);
    expect(c.source).toBe('builtin');
    expect(c.profile.terms.greeting).toBe('Welcome');
  });

  it('ignores an answer for another kind than the community now is (the platform changed it)', () => {
    // the device last read this community as a Jain Center, but the community row now says it is something else
    const c = chooseProfile({ hint: 'swaminarayan_temple', live: jain, cached: jain, settled: true });
    expect(c.profile.key).toBe('swaminarayan_temple');
    expect(c.profile.terms.greeting).not.toBe('Jai Jinendra');
    // and the other way round: a Jain Center whose device remembers another kind
    expect(chooseProfile({ hint: JAIN_CENTER, live: null, cached: other, settled: false }).profile).toBe(JAIN_PROFILE);
  });

  it('is the same Jain layout whether it came from the app, the device or the database', () => {
    const fromApp = chooseProfile({ hint: JAIN_CENTER, live: null, cached: null, settled: false }).profile;
    const fromDevice = chooseProfile({ hint: JAIN_CENTER, live: null, cached: jain, settled: false }).profile;
    const fromDatabase = chooseProfile({ hint: JAIN_CENTER, live: jain, cached: null, settled: true }).profile;
    for (const p of [fromApp, fromDevice, fromDatabase]) {
      expect(layoutFor(p)).toEqual(JAIN_LAYOUT);
      expect(categoryModuleMap(p)).toEqual(ALL_ON);
      expect(wordsFor(p)).toBeNull();
      expect(p.terms).toEqual(JAIN_TERMS);
    }
  });
});
