/**
 * The words of each kind of organization (docs/ORGANIZATION_CATEGORIES_PLAN.md §3.1.3; the owner calls it an
 * "experience"). The English dictionary (../en.ts) is Jain Center's own wording, so a Jain community reads exactly
 * what it has always read and Jain Center's entry here is empty. Every other kind of organization has one entry:
 * a plain object of the dictionary keys whose words differ, written as DATA, one file per kind. Adding a new kind of
 * organization is adding a file and one line below; no screen changes.
 *
 * The words are laid over the dictionary by `translateWith` (../index.ts), in this order, last wins:
 *
 *   1  this file's entry for the category (or GENERIC_WORDS for a category the app has no entry for)
 *   2  the named words the database gives the category (`terms`: the tab labels, the greeting, the store's name…)
 *   3  `words` in the database's own answer, when it gives some (a new kind of organization can speak without an update)
 *
 * Pre-login strings (Welcome, choosing a community, signing in) are not here: they are written for every community.
 */
import { JAIN_CENTER, termWords, type CategoryProfile, type WordOverlay } from '@/lib/categories';

import { hasWords, type WordSet } from '..';

/** Words for each category key the app knows. Jain Center's is empty on purpose: the dictionary is its wording. */
export const CATEGORY_WORDS: Record<string, WordSet> = {
  [JAIN_CENTER]: {},
};

/** What a category the app has no entry for says: neutral words, never the Jain ones. */
export const GENERIC_WORDS: WordSet = {};

/** The words to lay over the dictionary for this profile, or null when there are none (Jain Center: always null). */
export function wordsFor(profile: Pick<CategoryProfile, 'key' | 'terms' | 'words'>): WordSet | null {
  const bundled = CATEGORY_WORDS[profile.key] ?? GENERIC_WORDS;
  const en: WordOverlay = { ...bundled.en, ...termWords(profile.terms), ...profile.words };
  const merged: WordSet = { ...bundled, en };
  return hasWords(merged) ? merged : null;
}
