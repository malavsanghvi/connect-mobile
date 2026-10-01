/**
 * Gyan Path step payloads (connect-crm 0570: gyan_steps.activity jsonb and
 * gyan_steps.quiz jsonb). Parsed defensively: content is authored by people,
 * so anything malformed is dropped rather than crashing the lesson. Pure (no
 * React Native imports) so it is unit-tested in __tests__/activity.test.ts.
 */

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// Images and recordings: "asset:<name>" (bundled with the app), an https URL,
// or a key in the content storage bucket (connect-crm gyan_media_ref_ok).
// ---------------------------------------------------------------------------

export type ImageRef = { kind: 'asset'; name: string } | { kind: 'url'; url: string } | { kind: 'storage'; key: string };
/** A verse recording is named the same three ways. */
export type MediaRef = ImageRef;

export function imageRef(raw: unknown): ImageRef | null {
  const s = str(raw);
  if (!s) return null;
  if (/^asset:/i.test(s)) {
    const name = s.slice(6).trim();
    return name ? { kind: 'asset', name } : null;
  }
  if (/^https?:\/\//i.test(s)) return { kind: 'url', url: s };
  return { kind: 'storage', key: s.replace(/^\/+/, '') };
}

// ---------------------------------------------------------------------------
// Shared extras: every kind may carry review / tip / fun_fact.
// ---------------------------------------------------------------------------

export type ActivityExtras = {
  /** Authored content not yet checked by Pathshala ("needs_pathshala_review"). */
  needsReview: boolean;
  tip: string | null;
  funFact: string | null;
};

export function activityExtras(raw: unknown): ActivityExtras {
  const o = obj(raw);
  return { needsReview: o.review === 'needs_pathshala_review', tip: str(o.tip), funFact: str(o.fun_fact) };
}

// ---------------------------------------------------------------------------
// Read: cards
// ---------------------------------------------------------------------------

export type ReadCard = { title: string | null; body: string; emoji: string | null; image: ImageRef | null };
/** Read and practice steps: cards; a practice step may name its done button ("I sat calmly for 5 minutes"). */
export type ReadActivity = ActivityExtras & { cards: ReadCard[]; confirmLabel: string | null };

/** A card needs a title or a body. */
function parseCard(c: unknown): ReadCard | null {
  const co = obj(c);
  const title = str(co.title);
  const body = str(co.body_md) ?? str(co.body) ?? '';
  return title || body ? { title, body, emoji: str(co.emoji), image: imageRef(co.image) } : null;
}

export function readActivity(raw: unknown): ReadActivity {
  const o = obj(raw);
  const cards = list(o.cards)
    .map(parseCard)
    .filter((c): c is ReadCard => c !== null);
  return { ...activityExtras(raw), cards, confirmLabel: str(o.confirm_label) };
}

// ---------------------------------------------------------------------------
// Hotspot: an image with spots at fractional x / y (and radius r, a fraction of the width)
// ---------------------------------------------------------------------------

/** One touch. `puja` groups touches into the numbered pujas (Navang: 13 touches, 9 pujas — toes, knees, wrists and shoulders right then left). */
export type HotspotSpot = { key: string; order: number; puja: number | null; label: string; x: number; y: number; r: number; say: string | null; why: string | null };
export type HotspotActivity = ActivityExtras & {
  image: ImageRef | null;
  mode: 'learn' | 'practice';
  intro: string | null;
  spots: HotspotSpot[];
  /** Image width / height when the content gives it; otherwise the image's own size is used. */
  aspect: number | null;
  /** Wrong taps allowed in a practice try that still counts as a success. */
  maxSlips: number;
};

export const DEFAULT_SPOT_RADIUS = 0.05;
export const DEFAULT_MAX_SLIPS = 2;

/** A spot needs x, y and a label. */
function spotCore(s: unknown): { so: Obj; x: number; y: number; label: string } | null {
  const so = obj(s);
  const x = num(so.x);
  const y = num(so.y);
  const label = str(so.label);
  return x === null || y === null || !label ? null : { so, x, y, label };
}

export function hotspotActivity(raw: unknown): HotspotActivity {
  const o = obj(raw);
  const spots: HotspotSpot[] = [];
  const seen = new Set<string>();
  list(o.spots).forEach((s, i) => {
    const core = spotCore(s);
    if (!core) return;
    const { so, x, y, label } = core;
    let key = str(so.key) ?? `spot-${i + 1}`;
    if (seen.has(key)) key = `${key}-${i + 1}`;
    seen.add(key);
    const puja = num(so.puja);
    spots.push({
      key,
      order: num(so.order) ?? i + 1,
      puja: puja !== null && puja >= 1 ? Math.floor(puja) : null,
      label,
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
      r: clamp(num(so.r) ?? DEFAULT_SPOT_RADIUS, 0.01, 0.5),
      say: str(so.say),
      why: str(so.why),
    });
  });
  // Stable sort by order, then authored position.
  const ordered = spots.map((s, i) => ({ s, i })).sort((a, b) => a.s.order - b.s.order || a.i - b.i).map((x) => x.s);
  const aspect = num(o.aspect);
  const slips = num(o.max_slips);
  return {
    ...activityExtras(raw),
    image: imageRef(o.image),
    mode: o.mode === 'practice' ? 'practice' : 'learn',
    intro: str(o.intro),
    spots: ordered,
    aspect: aspect && aspect > 0.2 && aspect < 5 ? aspect : null,
    maxSlips: slips !== null && slips >= 0 ? Math.floor(slips) : DEFAULT_MAX_SLIPS,
  };
}

// ---------------------------------------------------------------------------
// Voice: listen → repeat each verse → say it all
// ---------------------------------------------------------------------------

export type VoiceVerse = { text: string; translit: string | null; meaning: string | null; audio: MediaRef | null };
export type VoiceActivity = ActivityExtras & { lang: string; mode: string; passRatio: number; verses: VoiceVerse[] };

export const DEFAULT_PASS_RATIO = 0.7;

/** A line needs its text or its transliteration. */
function parseVerse(v: unknown): VoiceVerse | null {
  const vo = obj(v);
  const text = str(vo.text);
  const translit = str(vo.translit);
  if (!text && !translit) return null;
  return { text: text ?? (translit as string), translit, meaning: str(vo.meaning), audio: imageRef(vo.audio) };
}

export function voiceActivity(raw: unknown): VoiceActivity {
  const o = obj(raw);
  const verses = list(o.verses)
    .map(parseVerse)
    .filter((v): v is VoiceVerse => v !== null);
  const ratio = num(o.pass_ratio);
  return {
    ...activityExtras(raw),
    lang: str(o.lang) ?? 'hi-IN',
    mode: str(o.mode) ?? 'listen_repeat_say',
    passRatio: ratio !== null && ratio > 0 && ratio <= 1 ? ratio : DEFAULT_PASS_RATIO,
    verses,
  };
}

// ---------------------------------------------------------------------------
// Quiz questions (gyan_steps.quiz): choice · truefalse · order · match · fill
// ---------------------------------------------------------------------------

export type ChoiceQuestion = { type: 'choice'; question: string; options: string[]; answer: number; explain: string | null };
export type TrueFalseQuestion = { type: 'truefalse'; statement: string; answer: boolean; explain: string | null };
export type OrderQuestion = { type: 'order'; prompt: string; items: string[]; explain: string | null };
export type MatchQuestion = { type: 'match'; prompt: string; pairs: [string, string][]; explain: string | null };
export type FillQuestion = { type: 'fill'; sentence: string; answer: string; options: string[]; explain: string | null };
export type Question = ChoiceQuestion | TrueFalseQuestion | OrderQuestion | MatchQuestion | FillQuestion;
export type QuestionType = Question['type'];

export const BLANK = '___';

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? String(x) : x)).filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [];
}

function parseOne(q: unknown): Question | null {
  const o = obj(q);
  const type = typeof o.type === 'string' ? o.type.toLowerCase().replace(/[^a-z]/g, '') : 'choice';
  const explain = str(o.explain) ?? str(o.explanation);
  if (type === 'truefalse' || type === 'tf') {
    const statement = str(o.statement) ?? str(o.question) ?? str(o.text);
    const a = o.answer;
    const answer = a === true || a === 'true' || a === 'True' ? true : a === false || a === 'false' || a === 'False' ? false : null;
    return statement && answer !== null ? { type: 'truefalse', statement, answer, explain } : null;
  }
  if (type === 'order') {
    const prompt = str(o.prompt) ?? str(o.question) ?? '';
    const items = strings(o.items);
    return items.length >= 2 && new Set(items).size === items.length ? { type: 'order', prompt, items, explain } : null;
  }
  if (type === 'match') {
    const prompt = str(o.prompt) ?? str(o.question) ?? '';
    const pairs: [string, string][] = [];
    for (const p of Array.isArray(o.pairs) ? o.pairs : []) {
      const pair = Array.isArray(p) ? strings(p) : (() => {
        const po = obj(p);
        return [str(po.left), str(po.right)].filter((x): x is string => !!x);
      })();
      if (pair.length >= 2) pairs.push([pair[0], pair[1]]);
    }
    const lefts = new Set(pairs.map((p) => p[0]));
    const rights = new Set(pairs.map((p) => p[1]));
    return pairs.length >= 2 && lefts.size === pairs.length && rights.size === pairs.length ? { type: 'match', prompt, pairs, explain } : null;
  }
  if (type === 'fill') {
    const sentence = str(o.sentence) ?? str(o.question);
    const answer = str(o.answer);
    if (!sentence || !answer) return null;
    const options = strings(o.options);
    if (!options.includes(answer)) options.push(answer);
    const unique = [...new Set(options)];
    return unique.length >= 2 ? { type: 'fill', sentence: sentence.includes(BLANK) ? sentence : `${sentence} ${BLANK}`, answer, options: unique, explain } : null;
  }
  // choice (the default, and the original quiz shape)
  const question = [o.question, o.q, o.text, o.label].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  const options = strings(o.options);
  let answer = typeof o.answer === 'number' ? o.answer : typeof o.answer_index === 'number' ? o.answer_index : typeof o.correct === 'number' ? o.correct : -1;
  if (answer < 0 && typeof o.answer === 'string') answer = options.indexOf(o.answer.trim());
  return question && options.length >= 2 && Number.isInteger(answer) && answer >= 0 && answer < options.length ? { type: 'choice', question: question.trim(), options, answer, explain } : null;
}

function questionList(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : list(obj(raw).questions);
}

/** gyan_steps.quiz → questions. Accepts {questions:[...]} or a bare array; unknown or broken questions are skipped (skippedEntries names them). */
export function parseQuestions(raw: unknown): Question[] {
  return questionList(raw)
    .map(parseOne)
    .filter((q): q is Question => q !== null);
}

// ---------------------------------------------------------------------------
// What a step has but can't show, for the office's log
// ---------------------------------------------------------------------------

export type SkippedEntries = { what: 'questions' | 'cards' | 'spots' | 'lines'; total: number; skipped: { n: number; raw: unknown }[] };

/**
 * The authored entries of a step that the parsers above skip (a question,
 * card, spot or line missing what it needs), by position (1 = the first) and
 * with each one's JSON, so the log names exactly what to fix. Null for a kind
 * of step without such a list.
 */
export function skippedEntries(step: { kind: string; quiz: unknown; activity: unknown }): SkippedEntries | null {
  const find = (what: SkippedEntries['what'], entries: unknown[], ok: (e: unknown) => boolean): SkippedEntries => ({
    what,
    total: entries.length,
    skipped: entries.map((raw, i) => ({ n: i + 1, raw })).filter((e) => !ok(e.raw)),
  });
  const a = obj(step.activity);
  switch (step.kind) {
    case 'quiz':
      return find('questions', questionList(step.quiz), (q) => parseOne(q) !== null);
    case 'read':
    case 'practice':
      return find('cards', list(a.cards), (c) => parseCard(c) !== null);
    case 'hotspot':
      return find('spots', list(a.spots), (s) => spotCore(s) !== null);
    case 'voice':
      return find('lines', list(a.verses), (v) => parseVerse(v) !== null);
    default:
      return null;
  }
}
