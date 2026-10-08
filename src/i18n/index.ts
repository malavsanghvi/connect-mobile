import { en, type StringKey } from './en';
import { gu } from './gu';
import { hi } from './hi';

export type { StringKey };
export type Language = 'en' | 'gu' | 'hi';
export type Vars = Record<string, string | number>;

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'gu', label: 'ગુજરાતી' },
  { code: 'hi', label: 'हिन्दी' },
];

const dictionaries: Record<Language, Partial<Record<StringKey, string>>> = { en, gu, hi };

export function isLanguage(v: unknown): v is Language {
  return v === 'en' || v === 'gu' || v === 'hi';
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** The text of a key before placeholders are filled in; untranslated keys fall back to English. */
function rawText(lang: Language, key: StringKey): string {
  return dictionaries[lang]?.[key] ?? en[key] ?? key;
}

/** Look up a string; untranslated keys fall back to English. */
export function translate(lang: Language, key: StringKey, vars?: Vars): string {
  return interpolate(rawText(lang, key), vars);
}

export type Translate = (key: StringKey, vars?: Vars) => string;

/**
 * A word of the dictionary that a kind of organization says differently wherever it appears ("Pathshala" is "Religious
 * school" for a faith community that names it so). `fit` is for a common noun: in the middle of a sentence the replacement
 * starts with a small letter ("your Pathshala classes" → "your religious school classes"), at the start of a sentence or
 * label it keeps its capital.
 */
export type Swap = { from: string; to: string; fit?: boolean };

/**
 * Words that stand in place of the dictionary's for one kind of organization (src/i18n/categories). `en` applies in every
 * language (the reviewed Gujarati and Hindi texts are Jain Center's own words, so another kind of organization shows the
 * English one rather than a translation of a Jain word); a language's own entry wins in that language. `swap` changes a
 * word wherever the dictionary uses it, for the keys no entry names.
 */
export type WordSet = Partial<Record<Language, Partial<Record<StringKey, string>>>> & { swap?: readonly Swap[] };

/** True when the set holds at least one word or swap. */
export function hasWords(words: WordSet | null | undefined): words is WordSet {
  if (!words) return false;
  const some = (w: Partial<Record<StringKey, string>> | undefined) => !!w && Object.keys(w).length > 0;
  return some(words.en) || some(words.gu) || some(words.hi) || (words.swap?.length ?? 0) > 0;
}

function replaceFitting(text: string, from: string, to: string): string {
  const small = /^[A-Z][a-z]/.test(to) ? to.charAt(0).toLowerCase() + to.slice(1) : to;
  let out = '';
  let at = 0;
  for (;;) {
    const found = text.indexOf(from, at);
    if (found < 0) return out + text.slice(at);
    out += text.slice(at, found) + (/[a-z,;] $/.test(text.slice(0, found)) ? small : to);
    at = found + from.length;
  }
}

/** The text with each swap applied, in order. */
export function applySwaps(text: string, swaps: readonly Swap[]): string {
  let out = text;
  for (const { from, to, fit } of swaps) {
    if (out.includes(from)) out = fit ? replaceFitting(out, from, to) : out.split(from).join(to);
  }
  return out;
}

/**
 * `translate`, looking in the organization's words first: an entry for the key, else the dictionary's text with the
 * organization's swaps applied. With no words (Jain Center) it is `translate`, word for word: the same lookup, the same
 * fallback to English, the same placeholders.
 */
export function translateWith(lang: Language, key: StringKey, vars: Vars | undefined, words: WordSet | null | undefined): string {
  const own = words?.[lang]?.[key] ?? words?.en?.[key];
  if (own !== undefined) return interpolate(own, vars);
  if (!words?.swap?.length) return translate(lang, key, vars);
  return interpolate(applySwaps(rawText(lang, key), words.swap), vars);
}

/** Pick a translated title/body from a row's `translations` jsonb ({gu: {title, body_md}}). */
export function pickTranslation<T extends Record<string, unknown>>(
  base: T,
  translations: unknown,
  lang: Language,
): T {
  if (lang === 'en' || !translations || typeof translations !== 'object') return base;
  const tr = (translations as Record<string, unknown>)[lang];
  if (!tr || typeof tr !== 'object') return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(tr as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim() && k in base) out[k] = v;
  }
  return out as T;
}
