/**
 * Pure rules for the Gyan Path question types (tested in __tests__/quiz-logic.test.ts).
 * Shuffles are seeded (step id + question + try) so a render never calls
 * Math.random, and a retry shows a fresh order.
 */

/** FNV-1a: a small, stable number from a string. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a deterministic generator in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates with a seed. With `notIdentity`, a list of two or more never
 * comes back in its original order (an "arrange these" question must not
 * start solved).
 */
export function shuffled<T>(items: readonly T[], seed: string | number, notIdentity = false): T[] {
  const rnd = seededRandom(typeof seed === 'number' ? seed : hashSeed(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (notIdentity && out.length >= 2 && out.every((x, i) => x === items[i])) out.push(out.shift() as T);
  return out;
}

/** Positions (0-based) where an arrangement differs from the correct order; empty = right. */
export function orderMistakes(correct: readonly string[], arranged: readonly string[]): number[] {
  const wrong: number[] = [];
  for (let i = 0; i < correct.length; i++) if (arranged[i] !== correct[i]) wrong.push(i);
  return wrong;
}

export function isPair(pairs: readonly (readonly [string, string])[], left: string, right: string): boolean {
  return pairs.some(([l, r]) => l === left && r === right);
}

/** Trimmed, case-insensitive comparison for "pick the word" answers. */
export function sameWord(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** The fill sentence split around its blank: ["Namo ", ""]. */
export function splitBlank(sentence: string, blank = '___'): [string, string] {
  const at = sentence.indexOf(blank);
  if (at < 0) return [`${sentence} `, ''];
  return [sentence.slice(0, at), sentence.slice(at + blank.length)];
}

/**
 * Stars for a quiz step (prototype finish()): every question right the first
 * time is 3 stars; each question that needed a retry or was missed takes one
 * away, never below 1.
 */
export function quizStars(questionsMissedFirstTime: number): number {
  return Math.max(1, 3 - Math.max(0, questionsMissedFirstTime));
}

/** How many tries a question type gets before the answer is shown (choice, order and fill get one retry). */
export function triesAllowed(type: 'choice' | 'truefalse' | 'order' | 'match' | 'fill'): number {
  return type === 'truefalse' ? 1 : type === 'match' ? Infinity : 2;
}
