/**
 * The words of a category's terms, laid over text the app wrote in Jain Center's own words.
 *
 * The English dictionary (src/i18n/en.ts) is Jain Center's own wording, so a Jain community reads exactly what it has always
 * read. Four of its words are a category's TERMS (connect-crm 0594 `organization_categories.terms`): the greeting, the school,
 * the learning path and the place of worship. Another kind of organization says its own ("Welcome", "Religious school",
 * "Learning path", "place of worship"), and it says them everywhere, not only in the tab labels `termWords` fills. That is
 * what this file does, as data and in one place:
 *
 *   retargetText         a text with Jain Center's four words, said with the category's terms ("Your Pathshala will add the
 *                        steps" → "Your religious school will add the steps")
 *   resolveTermTokens    a text a category's words wrote with tokens ("{School} office", "the {place}"), said with its terms
 *   retargetDictionary   every dictionary entry that has one of the four words, retargeted: the base of a category's words
 *   setActiveWording     the words of the community the app is showing, for the sentences written outside the dictionary
 *                        (the "load Pathshala terms" of an error message, which no screen translates)
 *
 * With a category's terms the very ones of Jain Center, nothing here changes anything: the same text comes out.
 *
 * Pure (no React, no Supabase), so every rule is unit-tested.
 */

/** Jain Center's own four words: the English dictionary's, and `JAIN_TERMS`' (src/lib/categories.ts). */
export const JAIN_WORDS = {
  greeting: 'Jai Jinendra',
  school: 'Pathshala',
  learning: 'Gyan Path',
  place: 'derasar',
} as const;

/** The terms this file reads (a `CategoryTerms` has them all; `null`: the category has no such thing). */
export type TermWords = {
  greeting: string;
  practice_tab: string | null;
  school: string | null;
  learning: string | null;
  place: string;
};

/** What the app says for a thing a category has no term for, where a text still has to name it (the text is then not on any screen). */
export const TERM_FALLBACK = { school: 'school', learning: 'learning path', practice: 'Learn' } as const;

type Word = keyof typeof JAIN_WORDS;

const PATTERNS: readonly { word: Word; re: RegExp }[] = [
  { word: 'greeting', re: /Jai Jinendra/g },
  { word: 'school', re: /pathshala/gi },
  { word: 'learning', re: /gyan path/gi },
  { word: 'place', re: /derasar/gi },
];

function termOf(word: Word, terms: TermWords): string {
  switch (word) {
    case 'greeting':
      return terms.greeting;
    case 'school':
      return terms.school ?? TERM_FALLBACK.school;
    case 'learning':
      return terms.learning ?? TERM_FALLBACK.learning;
    case 'place':
      return terms.place;
  }
}

const capFirst = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Does a sentence (or a heading, a list item, a part after a middle dot) start where `before` ends? */
function startsHere(before: string): boolean {
  return /(^|[.!?:·—–›\n]\s*)$/.test(before);
}

/**
 * The term as it reads where it is put: as the category writes it in the middle of a sentence ("Punjabi school" is a name, and
 * the app never guesses which words of a term are), with a capital letter if it starts the sentence ("place of worship").
 */
function fit(term: string, atStart: boolean): string {
  return atStart ? capFirst(term) : term;
}

/** Is a term the very word Jain Center uses? Then nothing is retargeted for it. */
function isJain(word: Word, terms: TermWords): boolean {
  return termOf(word, terms) === JAIN_WORDS[word];
}

/** True when any of the four terms differs from Jain Center's (so a retargeted dictionary is not empty). */
export function hasOwnTerms(terms: TermWords): boolean {
  return PATTERNS.some((p) => !isJain(p.word, terms));
}

/** `text` with Jain Center's four words said with the category's terms. Unchanged for a category whose terms are Jain Center's. */
export function retargetText(text: string, terms: TermWords): string {
  let out = text;
  for (const { word, re } of PATTERNS) {
    if (isJain(word, terms)) continue;
    const term = termOf(word, terms);
    out = out.replace(re, (_match: string, offset: number, whole: string) => (word === 'greeting' ? capFirst(term) : fit(term, startsHere(whole.slice(0, offset)))));
  }
  return out;
}

const TOKEN = /\{(greeting|school|learning|place|practice|Greeting|School|Learning|Place|Practice)\}/g;

/**
 * A category's words write the terms as tokens: `{school}` (as the term reads in a sentence), `{School}` (capitalised: a name
 * or the start of a sentence), likewise `{learning}`, `{place}`, `{greeting}` and `{practice}` (the practice tab's name).
 * Any other `{name}` is a placeholder the screen fills, and is left alone.
 */
export function resolveTermTokens(text: string, terms: TermWords): string {
  if (!text.includes('{')) return text;
  return text.replace(TOKEN, (_m: string, token: string) => {
    const lower = token.toLowerCase();
    const term = lower === 'practice' ? (terms.practice_tab ?? TERM_FALLBACK.practice) : termOf(lower as Word, terms);
    // A greeting and the name of a tab are names: they keep their capital letter wherever they are said.
    return token === lower && lower !== 'greeting' && lower !== 'practice' ? fit(term, false) : capFirst(term);
  });
}

/** Is `{name}` one of the term tokens (so a category's words may use it where the dictionary's text has no such placeholder)? */
export function isTermToken(placeholder: string): boolean {
  return new RegExp(`^${TOKEN.source}$`).test(placeholder);
}

/** The tokens a text uses (to check a category's words against the terms they may name). */
export function termTokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1]);
}

/**
 * Every entry of a dictionary that names one of the four words, retargeted. Empty for a category whose terms are Jain Center's.
 * `skip` names the keys a category's own words already write.
 */
export function retargetDictionary<K extends string>(dictionary: Readonly<Record<K, string>>, terms: TermWords, skip: ReadonlySet<string> = new Set()): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  if (!hasOwnTerms(terms)) return out;
  for (const key of Object.keys(dictionary) as K[]) {
    if (skip.has(key)) continue;
    const text = dictionary[key];
    const said = retargetText(text, terms);
    if (said !== text) out[key] = said;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The words of the community the app is showing, for the sentences written outside the dictionary
// ---------------------------------------------------------------------------

/** A word or phrase a category says in other words, for a sentence written in code (`to` may hold the tokens of resolveTermTokens). */
export type Phrase = { re: RegExp; to: string };

let active: { terms: TermWords; phrases: readonly Phrase[] } | null = null;

/**
 * Set by the category provider (src/providers/category.tsx) from an effect: a failure's action ("load Pathshala terms") and the few
 * sentences the data layer writes (src/lib/api) are phrases in code, said to the member by `toAppError`, and have no screen to
 * translate them. Null: Jain Center's own words.
 */
export function setActiveWording(terms: TermWords | null, phrases: readonly Phrase[] = []): void {
  active = terms ? { terms, phrases: phrases.map((p) => ({ re: p.re, to: resolveTermTokens(p.to, terms) })) } : null;
}

/** `text` said with the words of a category: its four terms, then its phrases (with a capital letter where a sentence starts: "Stavans, videos…" → "Songs, videos…"). */
export function retargetWith(text: string, terms: TermWords, phrases: readonly Phrase[]): string {
  let out = retargetText(text, terms);
  for (const { re, to } of phrases) {
    // (a phrase has no groups, so the callback gets the match, its offset and the whole text)
    out = out.replace(re, (_match: string, offset: number, whole: string) => fit(to, startsHere(whole.slice(0, offset))));
  }
  return out;
}

/** A phrase written in code, said with the active community's words. Unchanged when none is set (Jain Center's own). */
export function retargetActive(text: string): string {
  return active ? retargetWith(text, active.terms, active.phrases) : text;
}
