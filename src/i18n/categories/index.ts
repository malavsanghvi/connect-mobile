/**
 * The words of each kind of organization (docs/ORGANIZATION_CATEGORIES_PLAN.md §3.1.3; the owner calls it an
 * "experience"). The English dictionary (../en.ts) is Jain Center's own wording, so a Jain community reads exactly
 * what it has always read and Jain Center's entry here is empty. Every other kind of organization has one entry:
 * a plain object of the dictionary keys whose words differ, written as DATA, one file per kind. Adding a new kind of
 * organization is adding a file and one line below; no screen changes.
 *
 * The words are laid over the dictionary by `translateWith` (../index.ts), in this order, last wins:
 *
 *   1  this file's entry for the category, or the neutral words for a category the app has no entry for (never the Jain ones),
 *      with the entry's swaps (a household is a "business" for a chamber) and the swaps of the category's terms applied to it
 *   2  the named words the database gives the category (`terms`: the tab labels, the greeting)
 *   3  `words` in the database's own answer, when it gives some (a new kind of organization can speak without an update)
 *
 * and, for a key none of them names, the dictionary's text with the same swaps applied (so "Pathshala" reads "Religious
 * school" on every screen of a faith community that names its school so). Pre-login strings (Welcome, choosing a
 * community, signing in) are not here: they are written for every community.
 */
import { applySwaps, hasWords, type Swap, type WordSet } from '..';
import { JAIN_CENTER, termSwaps, termWords, type CategoryProfile, type WordOverlay } from '@/lib/categories';

import { CHAMBER_WORDS } from './chamber-of-commerce';
import { FAITH_OTHER_WORDS } from './faith-other';
import { NEUTRAL_EN } from './neutral';

/** What a community organization (not faith-based) says: the neutral words. */
export const COMMUNITY_WORDS: WordSet = { en: NEUTRAL_EN };

/** Words for each category key the app has. Jain Center's is empty on purpose: the dictionary is its wording. */
export const CATEGORY_WORDS: Record<string, WordSet> = {
  [JAIN_CENTER]: {},
  chamber_of_commerce: CHAMBER_WORDS,
  nonprofit_secular: COMMUNITY_WORDS,
  faith_other: FAITH_OTHER_WORDS,
};

/** What a category the app has no entry for says: the neutral words, never the Jain ones. */
export const GENERIC_WORDS: WordSet = COMMUNITY_WORDS;

function swapped(words: Partial<Record<string, string>> | undefined, swaps: readonly Swap[]): WordOverlay {
  const out: WordOverlay = {};
  for (const [key, value] of Object.entries(words ?? {})) {
    if (value !== undefined) (out as Record<string, string>)[key] = swaps.length ? applySwaps(value, swaps) : value;
  }
  return out;
}

/** The words to lay over the dictionary for this profile, or null when there are none (Jain Center: always null). */
export function wordsFor(profile: Pick<CategoryProfile, 'key' | 'terms' | 'words'>): WordSet | null {
  const bundled = CATEGORY_WORDS[profile.key] ?? GENERIC_WORDS;
  const swaps: Swap[] = [...termSwaps(profile.terms), ...(bundled.swap ?? [])];
  const merged: WordSet = {
    ...bundled,
    en: { ...swapped(bundled.en, swaps), ...termWords(profile.terms), ...profile.words },
    swap: swaps,
  };
  return hasWords(merged) ? merged : null;
}
