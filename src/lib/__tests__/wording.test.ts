import { afterEach, describe, expect, it } from '@jest/globals';

import { FAITH_WORDS, GENERIC_WORDS, packFor, phrasesFor, wordsFor, WORDING_PACKS } from '../../i18n/categories';
import { en } from '../../i18n/en';
import { genericProfile, JAIN_PROFILE, JAIN_TERMS, parseCategoryProfile, type CategoryTerms } from '../categories';
import { toAppError } from '../errors';
import { hasOwnTerms, isTermToken, JAIN_WORDS, resolveTermTokens, retargetActive, retargetDictionary, retargetText, retargetWith, setActiveWording, termTokensIn } from '../wording';
import { faithOtherPayload, gurdwaraPayload } from './neutral-fixtures';

const FAITH: CategoryTerms = { ...JAIN_TERMS, greeting: 'Welcome', practice_tab: 'Learn', school: 'Religious school', learning: 'Learning path', place: 'place of worship' };
const NO_SCHOOL: CategoryTerms = { ...FAITH, practice_tab: null, school: null, learning: null, place: 'office' };

afterEach(() => setActiveWording(null));

describe('Jain Center’s four words are the terms of its profile', () => {
  it('are the very ones the English dictionary uses', () => {
    expect(JAIN_TERMS.greeting).toBe(JAIN_WORDS.greeting);
    expect(JAIN_TERMS.school).toBe(JAIN_WORDS.school);
    expect(JAIN_TERMS.learning).toBe(JAIN_WORDS.learning);
    expect(JAIN_TERMS.place).toBe(JAIN_WORDS.place);
    expect(en['learn.gyanPath']).toBe(JAIN_WORDS.learning);
    expect(en['learn.pathshala']).toBe(JAIN_WORDS.school);
  });

  it('retarget nothing: the text is the text', () => {
    expect(hasOwnTerms(JAIN_TERMS)).toBe(false);
    expect(retargetText('Your Pathshala will add the steps, at the derasar. Jai Jinendra. Gyan Path.', JAIN_TERMS)).toBe('Your Pathshala will add the steps, at the derasar. Jai Jinendra. Gyan Path.');
    expect(retargetDictionary(en, JAIN_TERMS)).toEqual({});
  });
});

describe('retargetText: the dictionary’s four Jain words, said with a category’s terms', () => {
  it('puts the term where the word is, as the category writes it', () => {
    expect(retargetText('Your Pathshala teacher signs off your final level.', FAITH)).toBe('Your Religious school teacher signs off your final level.');
    expect(retargetText('Sign in to keep up your practices, Gyan Path and your Circle.', FAITH)).toBe('Sign in to keep up your practices, Learning path and your Circle.');
    expect(retargetText('as you would at the derasar', FAITH)).toBe('as you would at the place of worship');
  });

  it('starts a sentence, a heading or a part after a middle dot with a capital letter', () => {
    expect(retargetText('Derasar today', FAITH)).toBe('Place of worship today');
    expect(retargetText('Gyan Path · Jai Jinendra, {name}', FAITH)).toBe('Learning path · Welcome, {name}');
    expect(retargetText('Register now. Derasar hours', FAITH)).toBe('Register now. Place of worship hours');
  });

  it('keeps a name as the category wrote it: it never guesses which words are a name', () => {
    const punjabi: CategoryTerms = { ...FAITH, school: 'Punjabi school' };
    expect(retargetText('Register for Pathshala', punjabi)).toBe('Register for Punjabi school');
    expect(retargetText('Your Pathshala', punjabi)).toBe('Your Punjabi school');
  });

  it('says a plain word where the category has no such thing (a text no screen shows then)', () => {
    expect(retargetText('Your Pathshala and your Gyan Path', NO_SCHOOL)).toBe('Your school and your learning path');
    expect(retargetText('load Pathshala terms', NO_SCHOOL)).toBe('load school terms');
  });

  it('changes only the words that differ: a category with Jain Center’s school keeps Pathshala', () => {
    const own: CategoryTerms = { ...FAITH, school: 'Pathshala' };
    expect(retargetText('Your Pathshala and your Gyan Path', own)).toBe('Your Pathshala and your Learning path');
  });
});

describe('term tokens in a category’s own words', () => {
  it('are said with the terms: lower case is the term, capitalised starts a sentence', () => {
    expect(resolveTermTokens('Pickup at the {place}', FAITH)).toBe('Pickup at the place of worship');
    expect(resolveTermTokens('{Place} hours', FAITH)).toBe('Place of worship hours');
    expect(resolveTermTokens('The {School} office, your {school}', FAITH)).toBe('The Religious school office, your Religious school');
    expect(resolveTermTokens('Opens {School} in {practice}', FAITH)).toBe('Opens Religious school in Learn');
    expect(resolveTermTokens('{Greeting}', FAITH)).toBe('Welcome');
    expect(resolveTermTokens('{Learning} is coming', FAITH)).toBe('Learning path is coming');
  });

  it('say a plain word where the category has none, and keep the placeholders a screen fills', () => {
    expect(resolveTermTokens('{School} for {name} in {term}: {practice}', NO_SCHOOL)).toBe('School for {name} in {term}: Learn');
    expect(resolveTermTokens('no braces', FAITH)).toBe('no braces');
  });

  it('are told apart from placeholders', () => {
    expect(isTermToken('{School}')).toBe(true);
    expect(isTermToken('{practice}')).toBe(true);
    expect(isTermToken('{name}')).toBe(false);
    expect(termTokensIn('{School} office, {name}, the {place}')).toEqual(['School', 'place']);
  });
});

describe('retargetDictionary', () => {
  it('retargets exactly the entries that name a term, and no others', () => {
    const faith = retargetDictionary(en, FAITH);
    expect(faith['reg.title']).toBe('Religious school registration');
    expect(faith['tab.give']).toBeUndefined();
    for (const [key, said] of Object.entries(faith)) expect([key, said === en[key as keyof typeof en]]).toEqual([key, false]);
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      if (!(key in faith)) expect([key, /pathshala|gyan path|derasar|jai jinendra/i.test(en[key])]).toEqual([key, false]);
    }
  });

  it('leaves the keys it is told to skip', () => {
    expect(retargetDictionary(en, FAITH, new Set(['reg.title']))['reg.title']).toBeUndefined();
  });
});

describe('the packs', () => {
  it('start every category that is not a Jain Center from words with no Jain word in them', () => {
    expect(packFor({ key: 'faith_other', faithBased: true, wordingPack: null })).toBe(FAITH_WORDS);
    expect(packFor({ key: 'nonprofit_secular', faithBased: false, wordingPack: null })).toBe(GENERIC_WORDS);
    expect(packFor({ key: 'jain_center', faithBased: true, wordingPack: null })).toEqual({});
  });

  it('follow the pack a category names, and read an unknown pack as what the profile’s facts say', () => {
    expect(packFor({ key: 'x', faithBased: false, wordingPack: 'faith' })).toBe(FAITH_WORDS);
    expect(packFor({ key: 'x', faithBased: true, wordingPack: 'neutral' })).toBe(GENERIC_WORDS);
    expect(packFor({ key: 'x', faithBased: true, wordingPack: 'chamber' })).toBe(WORDING_PACKS.chamber);
    expect(packFor({ key: 'x', faithBased: true, wordingPack: 'a_future_pack' })).toBe(FAITH_WORDS);
    expect(packFor({ key: 'x', faithBased: false, wordingPack: 'a_future_pack' })).toBe(GENERIC_WORDS);
  });

  it('read wording_pack from the database’s answer when it gives one, and a category’s own words win over the pack’s', () => {
    const raw = faithOtherPayload() as { category: Record<string, unknown> };
    const withPack = parseCategoryProfile({ ...raw, category: { ...raw.category, wording_pack: 'faith' } });
    expect(withPack?.wordingPack).toBe('faith');
    expect(parseCategoryProfile(raw)?.wordingPack).toBeNull();
    const words = parseCategoryProfile({ ...raw, words: { 'home.myWay': 'My path' } });
    expect(wordsFor(words ?? JAIN_PROFILE)?.en?.['home.myWay']).toBe('My path');
  });

  it('say the database’s terms in the pack’s own sentences', () => {
    const gurdwara = parseCategoryProfile(gurdwaraPayload());
    expect(gurdwara && wordsFor(gurdwara)?.en?.['store.pickup']).toBe('Pickup at the gurdwara');
    const faith = parseCategoryProfile(faithOtherPayload());
    expect(faith && wordsFor(faith)?.en?.['store.pickup']).toBe('Pickup at the place of worship');
  });

  it('give a category with no school a plain word, so nothing names Pathshala even when no screen shows it', () => {
    const generic = genericProfile('book_club');
    expect(wordsFor(generic)?.en?.['reg.title']).toBe('School registration');
    expect(wordsFor(generic)?.en?.['store.pickup']).toBe('Pickup at the office');
  });
});

describe('the sentences written in code, said with the active community’s words', () => {
  const faith = parseCategoryProfile(faithOtherPayload());

  it('are said as written until a community sets its words, and for a Jain Center', () => {
    expect(retargetActive('load Pathshala terms')).toBe('load Pathshala terms');
    setActiveWording(JAIN_PROFILE.terms, phrasesFor(JAIN_PROFILE));
    expect(retargetActive('load Pathshala terms')).toBe('load Pathshala terms');
    expect(toAppError(new TypeError('Failed to fetch'), 'load Pathshala terms').userMessage).toBe("We couldn't load Pathshala terms. Check your internet connection and try again.");
  });

  it('reach the failure a member reads', () => {
    if (!faith) throw new Error('profile');
    setActiveWording(faith.terms, phrasesFor(faith));
    expect(toAppError(new TypeError('Failed to fetch'), 'load Pathshala terms').userMessage).toBe("We couldn't load Religious school terms. Check your internet connection and try again.");
    expect(toAppError({ code: '23505', message: 'x' }, 'save your labh').userMessage).toBe('We couldn\'t save your offering because it already exists.');
    expect(toAppError({ code: '23505', message: 'x' }, 'send anumodana').userMessage).toBe("We couldn't send a cheer because it already exists.");
    expect(toAppError({ message: 'weird' }, 'load stavans and podcasts').userMessage).toBe('Something went wrong while trying to load songs and podcasts. Please try again.');
    expect(toAppError({ message: 'weird' }, 'load My Jain Way').userMessage).toBe('Something went wrong while trying to load this page. Please try again.');
    expect(toAppError({ message: 'weird' }, 'load the pachchakhan library').userMessage).toBe('Something went wrong while trying to load the daily reading library. Please try again.');
  });

  it('keep the capital letter of the word they replace, and leave a word that only contains one alone', () => {
    if (!faith) throw new Error('profile');
    const phrases = phrasesFor(faith);
    expect(retargetWith("Stavans, videos, podcasts and recipes aren't set up", faith.terms, phrases)).toBe("Songs, videos, podcasts and recipes aren't set up");
    expect(retargetWith('Choose at least one labh.', faith.terms, phrases)).toBe('Choose at least one offering.');
    expect(retargetWith('Sign in to track your Gyan Path progress.', faith.terms, phrases)).toBe('Sign in to track your Learning path progress.');
    expect(retargetWith('several things, a bolide, labhs', faith.terms, phrases)).toBe('several things, a bolide, labhs');
  });
});
