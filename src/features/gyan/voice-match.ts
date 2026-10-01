/**
 * Forgiving comparison of what the phone heard with a verse (Navkar Mantra
 * and other sutras). Pure, tested in __tests__/voice-match.test.ts.
 *
 * How it works
 * 1. Everything becomes the same rough sound spelling ("key"): Devanagari (and
 *    Gujarati, which has the same layout) is transliterated to plain Roman
 *    letters; Roman text loses its diacritics (ā → a, ṇ → n, ś → s); a digit
 *    is read as its Hindi word (5 → panch).
 * 2. Keys drop the differences that recognisers and spellings disagree on:
 *    long vowels (aa → a, ee → i), doubled consonants (vv → v), aspiration
 *    (dh → d, bh → b), w/v and b/v (सब and Savva), ai/e and au/o (ऐसो and
 *    Eso), a y between vowels after i, e, o or u (लोये and Loe), and a nasal
 *    before a consonant or at the end (anusvara: arihantanam, अरिहंताणं and
 *    arihantanan all agree).
 * 3. Each expected word is looked for, in order, inside what was heard with
 *    the spaces removed (so "namo arihantanam" heard as one word, or split in
 *    two, still counts), allowing a few letter edits (Levenshtein distance)
 *    for its length. A short word (3 letters or fewer) must appear exactly,
 *    or be a whole heard word one letter away (ऐसे for Eso, सर्व for Savva),
 *    so one edit can't match any two letters inside a longer word. Words not
 *    found are the ones to practise.
 * 4. The verse passes when the share of words found reaches pass_ratio.
 *    Saying it all also needs at least half of every line, so leaving out
 *    whole lines is never a pass.
 *
 * The recogniser is given the expected words as hints (contextualStrings),
 * which helps a child's unclear but correct reading come back right; the
 * price is that it also nudges a mispronounced word towards the right
 * spelling, so this check is about remembering the words, not accent.
 */

// ---------------------------------------------------------------------------
// Devanagari → Roman
// ---------------------------------------------------------------------------

const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n',
  च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', ळ: 'l', व: 'v',
  श: 'sh', ष: 'sh', स: 's', ह: 'h',
};

const VOWELS: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ii', उ: 'u', ऊ: 'uu', ऋ: 'ri', ॠ: 'rii', ऌ: 'li',
  ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऍ: 'e', ऑ: 'o', ॐ: 'om',
};

const MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ii', 'ु': 'u', 'ू': 'uu', 'ृ': 'ri', 'ॄ': 'rii',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'e', 'ॉ': 'o',
};

const VIRAMA = '्';
const NUKTA = '़';
const ANUSVARA = 'ं';
const CHANDRABINDU = 'ँ';
const VISARGA = 'ः';

/** Gujarati letters sit 0x180 above their Devanagari twins. */
function toDevanagari(ch: string): string {
  const c = ch.charCodeAt(0);
  return c >= 0x0a81 && c <= 0x0aef ? String.fromCharCode(c - 0x180) : ch;
}

function isIndic(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 0x0900 && c <= 0x097f) || (c >= 0x0a80 && c <= 0x0aff);
}

/** Devanagari (or Gujarati) → plain Roman letters with the inherent "a". Other characters pass through. */
export function transliterate(text: string): string {
  let decomposed = text;
  try {
    // Precomposed nukta letters (क़ … य़, U+0958–U+095F) become the base letter plus the nukta.
    decomposed = text.normalize('NFD');
  } catch {
    // Without normalize() the precomposed letters are rare enough to read as a pause.
  }
  const chars = Array.from(decomposed).map(toDevanagari);
  let out = '';
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    const cons = CONSONANTS[ch];
    if (cons !== undefined) {
      out += cons;
      let j = i + 1;
      while (j < chars.length && chars[j] === NUKTA) j++;
      const next = chars[j] ?? '';
      if (next === VIRAMA) {
        i = j + 1;
      } else if (MATRAS[next] !== undefined) {
        out += MATRAS[next];
        i = j + 1;
      } else {
        out += 'a';
        i = j;
      }
      continue;
    }
    if (VOWELS[ch] !== undefined) out += VOWELS[ch];
    else if (MATRAS[ch] !== undefined) out += MATRAS[ch];
    else if (ch === ANUSVARA || ch === CHANDRABINDU) out += 'm';
    else if (ch === VISARGA) out += 'h';
    else if (ch === NUKTA || ch === VIRAMA || ch === '‌' || ch === '‍' || ch === 'ऽ') {
      // silent
    } else if (isIndic(ch)) out += ' '; // danda, digits and other signs
    else out += ch;
    i += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Roman → sound key
// ---------------------------------------------------------------------------

const LATIN_MARKS: Record<string, string> = {
  ā: 'a', á: 'a', à: 'a', â: 'a', ä: 'a', ã: 'a', ī: 'i', í: 'i', ì: 'i', î: 'i', ï: 'i', ū: 'u', ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ē: 'e', é: 'e', è: 'e', ê: 'e', ë: 'e', ō: 'o', ó: 'o', ò: 'o', ô: 'o', ö: 'o',
  ṇ: 'n', ñ: 'n', ṅ: 'n', ṃ: 'm', ṁ: 'm', ś: 's', ṣ: 's', ḍ: 'd', ṭ: 't', ḥ: 'h', ṛ: 'r', ṝ: 'r', ḷ: 'l', ç: 'c',
};

function stripMarks(s: string): string {
  let out = '';
  for (const ch of s) out += LATIN_MARKS[ch] ?? ch;
  try {
    out = out.normalize('NFD');
  } catch {
    // Without normalize() the table above has already handled the common letters.
  }
  return out.replace(/[̀-ͯ]/g, '');
}

/** One word → its forgiving sound key ("Siddhanam" and "सिद्धाणं" → "sidanan"). */
export function soundKey(word: string): string {
  let w = stripMarks(transliterate(word).toLowerCase()).replace(/[^a-z]/g, '');
  w = w.replace(/ee/g, 'i').replace(/oo/g, 'u');
  w = w.replace(/w/g, 'v').replace(/z/g, 'j').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/f/g, 'p');
  w = w.replace(/b/g, 'v'); // सब and Savva, सव्व written सब्ब
  // Aspiration (also sh → s, ch → c); twice, so "chh" (छ) becomes "c" as well.
  w = w.replace(/([bcdgjklmnprstvy])h/g, '$1').replace(/([bcdgjklmnprstvy])h/g, '$1');
  w = w.replace(/[mn](?=[bcdgjklpqrstvyz]|$)/g, 'n'); // nasal before a consonant or at the end (anusvara)
  w = w.replace(/(.)\1+/g, '$1'); // long vowels and doubled consonants
  w = w.replace(/ai/g, 'e').replace(/au/g, 'o'); // ऐसो and Eso; हवइ and Havai alike
  w = w.replace(/([eiou])y(?=[aeiou])/g, '$1'); // a y between vowels: लोये and Loe
  w = w.replace(/(.)\1+/g, '$1');
  if (w.length > 2) w = w.replace(/([aeiou])h$/, '$1'); // a final breath (visarga): "namoh" → "namo"
  if (w.length > 3 && w.endsWith('a')) w = w.slice(0, -1); // a final short "a" is often dropped
  return w;
}

/** The words of a line as written (for display), split on spaces. */
export function displayWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Digits as Hindi number words: recognisers often write पंच as "5". */
const DIGIT_WORDS = ['shunya', 'ek', 'do', 'tin', 'char', 'panch', 'chhah', 'saat', 'aath', 'nau'];

/** "एसो 5 नमुक्कारो" → "एसो  panch  नमुक्कारो" (ASCII, Devanagari and Gujarati digits). */
export function spellDigits(text: string): string {
  return text.replace(/[0-9\u0966-\u096F\u0AE6-\u0AEF]/g, (d) => {
    const c = d.charCodeAt(0);
    const n = c <= 0x39 ? c - 0x30 : c <= 0x096f ? c - 0x0966 : c - 0x0ae6;
    return ` ${DIGIT_WORDS[n]} `;
  });
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Plain Levenshtein distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Keys this short are matched exactly inside the stream, or as a whole heard word one letter away. */
export const SHORT_KEY = 3;

/**
 * Letter edits allowed for a key of this length anywhere in the stream: none
 * up to 3 letters (a short word with one edit would match almost any two
 * letters), one for 4–6, then about one in three.
 */
export function allowedEdits(length: number): number {
  return length <= SHORT_KEY ? 0 : length <= 6 ? 1 : Math.floor(length * 0.3);
}

/** Saying it all: every line needs at least this share of its words. */
export const LINE_FLOOR = 0.5;

/**
 * Best approximate occurrence of `pattern` inside text[from, to) (Sellers'
 * algorithm: Levenshtein with a free start and end). Returns the edit
 * distance and where the match ends.
 */
export function findApprox(pattern: string, text: string, from: number, to: number): { distance: number; end: number } {
  const m = pattern.length;
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let best = { distance: prev[m], end: from };
  for (let j = from; j < Math.min(to, text.length); j++) {
    const cur = [0];
    for (let i = 1; i <= m; i++) cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (pattern[i - 1] === text[j] ? 0 : 1));
    if (cur[m] < best.distance) best = { distance: cur[m], end: j + 1 };
    prev = cur;
  }
  return best;
}

export type WordCheck = { word: string; ok: boolean };
export type VerseCheck = { words: WordCheck[]; found: number; total: number; ratio: number; score: number; pass: boolean };

type Expected = { word: string; keys: string[] };

function check(expected: Expected[], heard: string, passRatio: number): VerseCheck {
  const tokens = displayWords(spellDigits(heard)).map(soundKey).filter(Boolean);
  const starts: number[] = [];
  let at = 0;
  for (const k of tokens) {
    starts.push(at);
    at += k.length;
  }
  const stream = tokens.join('');
  let cursor = 0;
  let pending = 0;
  const words: WordCheck[] = [];
  let found = 0;
  let total = 0;
  for (const e of expected) {
    const keys = e.keys.filter(Boolean);
    if (keys.length === 0) {
      words.push({ word: e.word, ok: true }); // punctuation such as ॥
      continue;
    }
    total += 1;
    let hit: { end: number } | null = null;
    for (const key of keys) {
      const windowEnd = cursor + pending + key.length * 2 + 6;
      const r = findApprox(key, stream, cursor, windowEnd);
      if (r.distance <= allowedEdits(key.length) && (!hit || r.end < hit.end)) hit = { end: r.end };
      if (key.length > SHORT_KEY) continue;
      // A short word may be one letter off when it is a whole word the phone heard.
      for (let i = 0; i < tokens.length; i++) {
        const start = starts[i];
        const end = start + tokens[i].length;
        if (start < cursor || start >= windowEnd) continue;
        if (levenshtein(key, tokens[i]) <= 1 && (!hit || end < hit.end)) {
          hit = { end };
          break;
        }
      }
    }
    if (hit) {
      found += 1;
      cursor = hit.end;
      pending = 0;
      words.push({ word: e.word, ok: true });
    } else {
      pending += Math.max(...keys.map((k) => k.length));
      words.push({ word: e.word, ok: false });
    }
  }
  const ratio = total ? found / total : 0;
  return { words, found, total, ratio, score: Math.round(ratio * 100), pass: total > 0 && ratio >= passRatio - 1e-9 };
}

export type VerseText = { text: string; translit: string | null };

/**
 * Words of the line to show, each with every spelling it can be heard as.
 * The transliteration is shown when there is one; when it has the same
 * number of words as the script line, each word also accepts its script form.
 */
export function expectedWords(verse: VerseText): Expected[] {
  const script = displayWords(verse.text);
  const roman = verse.translit ? displayWords(verse.translit) : [];
  const shown = roman.length ? roman : script;
  const aligned = roman.length > 0 && roman.length === script.length;
  return shown.map((word, i) => ({ word, keys: [...new Set([soundKey(word), ...(aligned ? [soundKey(script[i])] : [])])] }));
}

/**
 * Compare what was heard (one or more recogniser alternatives) with a verse.
 * The best alternative wins.
 */
export function matchVerse(verse: VerseText, heard: readonly string[], passRatio: number): VerseCheck {
  const expected = expectedWords(verse);
  let best: VerseCheck | null = null;
  for (const h of heard.length ? heard : ['']) {
    const r = check(expected, h, passRatio);
    if (!best || r.found > best.found) best = r;
  }
  return best as VerseCheck;
}

/**
 * "Say it all": the verses one after another; results come back per verse for
 * highlighting. It passes when the share of all words reaches pass_ratio and
 * every line has at least half its words (LINE_FLOOR), so two lines left out
 * of the Navkar are not "You said it all".
 */
export function matchAll(verses: readonly VerseText[], heard: readonly string[], passRatio: number): { verses: VerseCheck[]; overall: VerseCheck } {
  const perVerse = verses.map(expectedWords);
  const flat = perVerse.flat();
  let best: VerseCheck | null = null;
  for (const h of heard.length ? heard : ['']) {
    const r = check(flat, h, passRatio);
    if (!best || r.found > best.found) best = r;
  }
  const overall = best as VerseCheck;
  let at = 0;
  const split = perVerse.map((ws) => {
    const words = overall.words.slice(at, at + ws.length);
    at += ws.length;
    const countable = ws.map((w, i) => ({ w, r: words[i] })).filter(({ w }) => w.keys.some(Boolean));
    const found = countable.filter(({ r }) => r?.ok).length;
    const total = countable.length;
    const ratio = total ? found / total : 0;
    return { words, found, total, ratio, score: Math.round(ratio * 100), pass: total > 0 && ratio >= passRatio - 1e-9 };
  });
  const everyLine = split.every((v) => v.total === 0 || v.ratio >= LINE_FLOOR - 1e-9);
  return { verses: split, overall: { ...overall, pass: overall.pass && everyLine } };
}
