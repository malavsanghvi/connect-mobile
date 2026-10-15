/**
 * The words of each kind of organization (docs/ORGANIZATION_CATEGORIES_PLAN.md §3.1.3; the owner calls it an
 * "experience"). The English dictionary (../en.ts) is Jain Center's own wording, so a Jain community reads exactly
 * what it has always read and Jain Center's entry here is empty. Every other kind of organization has one entry:
 * a plain object of the dictionary keys whose words differ, written as DATA, one file per kind. Adding a new kind of
 * organization is adding a file and one line below; no screen changes.
 *
 * The words are laid over the dictionary by `translateWith` (../index.ts), in this order, last wins:
 *
 *   0  the dictionary's Jain Center words that name a term (Pathshala, Gyan Path, derasar, Jai Jinendra), said with the
 *      category's own terms (src/lib/wording.ts); nothing for a category whose terms are Jain Center's
 *   1  this file's entry for the category: its own, else the pack its `wording_pack` names, else FAITH_WORDS for a
 *      faith-based category and GENERIC_WORDS for any other (neutral.ts, faith.ts); the terms written in them as tokens
 *      ({School}, {place}) are said with the category's terms
 *   2  the named words the database gives the category (`terms`: the tab labels, the greeting, the store's name…)
 *   3  `words` in the database's own answer, when it gives some (a new kind of organization can speak without an update)
 *
 * So a category the app has never heard of reads no Jain word, whatever the database says or leaves out. Pre-login strings
 * (Welcome, choosing a community, signing in) are not here: they are written for every community.
 */
import { JAIN_CENTER, termWords, type CategoryProfile, type WordOverlay } from '@/lib/categories';
import { resolveTermTokens, retargetDictionary, type Phrase } from '@/lib/wording';

import { en } from '../en';
import { hasWords, type WordSet } from '..';

import { FAITH_EN } from './faith';
import { NEUTRAL_EN, NEUTRAL_PHRASES } from './neutral';

/** What a category the app has no entry for says: neutral words, never the Jain ones. */
export const GENERIC_WORDS: WordSet = { en: NEUTRAL_EN };

/** What a faith-based category without words of its own says: the neutral words, with a house of worship's few differences. */
export const FAITH_WORDS: WordSet = { en: { ...NEUTRAL_EN, ...FAITH_EN } };

/** Words for each category key the app knows. Jain Center's is empty on purpose: the dictionary is its wording. */
export const CATEGORY_WORDS: Record<string, WordSet> = {
  [JAIN_CENTER]: {},
};

/** The packs a category's `wording_pack` can name (connect-crm 0600); an unknown pack is read as neutral. */
export const WORDING_PACKS: Record<string, WordSet> = {
  jain: {},
  faith: FAITH_WORDS,
  neutral: GENERIC_WORDS,
  chamber: GENERIC_WORDS,
};

type WordsProfile = Pick<CategoryProfile, 'key' | 'terms' | 'words'> & Partial<Pick<CategoryProfile, 'faithBased' | 'wordingPack'>>;

/** The set of words a category starts from: its own, else the pack it names, else by what the profile says it is (faith-based or not). */
export function packFor(profile: Pick<WordsProfile, 'key' | 'faithBased' | 'wordingPack'>): WordSet {
  const own = CATEGORY_WORDS[profile.key];
  if (own) return own;
  const named = profile.wordingPack ? WORDING_PACKS[profile.wordingPack] : undefined;
  if (named) return named;
  return profile.faithBased ? FAITH_WORDS : GENERIC_WORDS;
}

/**
 * The words for the sentences written in code (the action of a failure, a message the data layer writes), which no screen
 * translates: none for a category whose words are the dictionary's (Jain Center), else the neutral ones.
 */
export function phrasesFor(profile: Pick<WordsProfile, 'key' | 'faithBased' | 'wordingPack'>): readonly Phrase[] {
  return hasWords(packFor(profile)) ? NEUTRAL_PHRASES : [];
}

/** The words to lay over the dictionary for this profile, or null when there are none (Jain Center: always null). */
export function wordsFor(profile: WordsProfile): WordSet | null {
  const bundled = packFor(profile);
  const written: WordOverlay = {};
  for (const [key, text] of Object.entries(bundled.en ?? {})) written[key as keyof WordOverlay] = resolveTermTokens(text, profile.terms);
  const derived = retargetDictionary(en, profile.terms, new Set(Object.keys(written)));
  const said: WordOverlay = { ...derived, ...written, ...termWords(profile.terms), ...profile.words };
  const merged: WordSet = { ...bundled, en: said };
  return hasWords(merged) ? merged : null;
}
