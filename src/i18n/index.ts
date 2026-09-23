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

/** Look up a string; untranslated keys fall back to English. */
export function translate(lang: Language, key: StringKey, vars?: Vars): string {
  const value = dictionaries[lang]?.[key] ?? en[key] ?? key;
  return interpolate(value, vars);
}

export type Translate = (key: StringKey, vars?: Vars) => string;

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
