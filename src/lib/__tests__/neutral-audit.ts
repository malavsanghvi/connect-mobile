import { wordsFor } from '../../i18n/categories';
import { en, type StringKey } from '../../i18n/en';
import { translateWith, type Language } from '../../i18n';
import type { CategoryProfile } from '../categories';

/**
 * The audit behind src/lib/__tests__/neutral-words.test.ts: for a category's profile, every string the app can show from its
 * dictionary, resolved the way the app resolves it (the dictionary, the category's words, its terms, the database's words;
 * `translateWith`), and every word in it that belongs to one tradition.
 *
 * The English dictionary is Jain Center's own wording, so a Jain profile is not audited (it must stay exactly as it was:
 * src/lib/__tests__/categories.test.ts). Every other category must read neutrally, in every language the app offers.
 */

export type Banned = {
  /** What the word is, for the report. */
  id: string;
  re: RegExp;
  /**
   * 'jain': a word of the Jain tradition or of its Gujarati community. 'borderline': a word shared by several South Asian
   * traditions or used in only some of them, which a community of another faith (a church, a mosque) still would not use.
   */
  kind: 'jain' | 'borderline';
};

const jain = (id: string, re: RegExp): Banned => ({ id, re, kind: 'jain' });
const shared = (id: string, re: RegExp): Banned => ({ id, re, kind: 'borderline' });

/** Latin-script words (matched without regard to case) and the Gujarati and Hindi scripts' word for "Jain". */
export const BANNED: readonly Banned[] = [
  jain('Jain', /\bjain(s|ism)?\b/i),
  jain('Jai Jinendra', /jinendra/i),
  jain('derasar', /derasar|derawasi|upashray/i),
  jain('puja', /\bpuja|\bpujan|\bpooja/i),
  jain('aarti', /\baarti\b/i),
  jain('tithi', /tithi|panchang|\bparva\b|\bsamvat\b|\bpaksha\b|\bkartak\b/i),
  jain('tapasya', /tapas(ya|vi)/i),
  jain('pachchakhan', /pachchakhan/i),
  jain('Pathshala', /pathshala/i),
  jain('Gyan Path', /\bgyan\b/i),
  jain('boli', /\bbolis?\b/i),
  jain('labh', /\blabhs?\b/i),
  jain('Saathi', /saathi/i),
  jain('3L', /\b3l\b/i),
  jain('anumodana', /anumodana/i),
  jain('stavan', /stavan/i),
  jain('swadhyay', /swadhyay/i),
  jain('paryushan', /paryushan/i),
  jain('samayik, pratikraman', /samayik|pratikraman/i),
  jain('navkarsi, chauvihar', /navkarsi|navkar\b|chauvihar|ayambil|navang/i),
  jain('Mahavir, murti', /mahavir|\bmurti\b/i),
  jain('punyatithi, diksha', /punyatithi|\bdiksha\b/i),
  jain('mithai, namkeen, satvik', /mithai|namkeen|satvik/i),
  jain('bhandar', /bhandar/i),
  jain('jaap', /\bjaap\b/i),
  jain('in Gujarati script: Jain', /જૈન/),
  jain('in Devanagari script: Jain', /जैन/),
  shared('darshan', /darshan/i),
  shared('sutra', /\bsutras?\b/i),
  shared('seva', /\bseva\b/i),
  shared('guruji', /guruji|\bswami\b/i),
  shared('Diwali', /diwali/i),
  shared('Ba (grandmother)', /honor of ba\b/i),
  shared('mantra', /\bmantra\b/i),
  shared('Gujarati, Hindi', /\bgujarati\b|\bhindi\b/i),
];

export type Leak = { profile: string; lang: Language; key: string; word: string; kind: Banned['kind']; text: string };

export const LANGUAGES_AUDITED: readonly Language[] = ['en', 'gu', 'hi'];

/**
 * A category's own words are its own: a category whose term for the school is "Pathshala" (or "Sunday school") may say so.
 * What it brings in `terms` is taken out of the text before the check.
 */
export function ownWords(profile: CategoryProfile): string[] {
  const t = profile.terms;
  const modules = Object.values(profile.modules)
    .map((m) => m?.label ?? null)
    .filter((v): v is string => !!v);
  return [t.greeting, t.practice_tab, t.give_tab, t.family_tab, t.store, t.school, t.learning, t.place, ...modules].filter((v): v is string => !!v).sort((a, b) => b.length - a.length);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One expression for a category's own words (longest first), compiled once for a whole audit. */
function compileOwn(own: readonly string[]): RegExp | null {
  return own.length ? new RegExp(own.map(escapeRegExp).join('|'), 'gi') : null;
}

/** The first banned word in a text, or null. `own` are the category's own words, which are not counted. */
export function bannedIn(text: string, own: readonly string[] | RegExp | null = []): Banned | null {
  // A placeholder is the screen's, not a word of the text ({tithi} is the day's value, whatever the day's calendar).
  let rest = text.replace(/\{\w+\}/g, '{}');
  const ownRe = Array.isArray(own) ? compileOwn(own) : (own as RegExp | null);
  if (ownRe) rest = rest.replace(ownRe, ' ');
  return BANNED.find((b) => b.re.test(rest)) ?? null;
}

/** Every string of the dictionary as this profile's app resolves it, in this language, keyed by dictionary key. */
export function resolved(profile: CategoryProfile, lang: Language): [StringKey, string][] {
  const words = wordsFor(profile);
  return (Object.keys(en) as StringKey[]).map((key) => [key, translateWith(lang, key, undefined, words)]);
}

/** Every leak of one profile, in every language. `except` names keys that are left on purpose (the test says why). */
export function leaksOf(profile: CategoryProfile, except: ReadonlySet<string> = new Set()): Leak[] {
  const own = compileOwn(ownWords(profile));
  const out: Leak[] = [];
  for (const lang of LANGUAGES_AUDITED) {
    for (const [key, text] of resolved(profile, lang)) {
      if (except.has(key)) continue;
      const hit = bannedIn(text, own);
      if (hit) out.push({ profile: profile.key, lang, key, word: hit.id, kind: hit.kind, text });
    }
  }
  return out;
}
