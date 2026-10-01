import { describe, expect, it } from '@jest/globals';

import { hashSeed, isPair, orderMistakes, quizStars, sameWord, seededRandom, shuffled, splitBlank, triesAllowed } from '../quiz-logic';

describe('seeded shuffles', () => {
  it('are stable for a seed and keep every item', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(shuffled(items, 'step-1:0')).toEqual(shuffled(items, 'step-1:0'));
    expect([...shuffled(items, 'x')].sort()).toEqual(items);
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    const r = seededRandom(1);
    const v = r();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
  it('never start an arrange question already solved', () => {
    for (let i = 0; i < 50; i++) expect(shuffled(['a', 'b'], `seed-${i}`, true)).toEqual(['b', 'a']);
    for (let i = 0; i < 50; i++) expect(shuffled(['a', 'b', 'c'], i, true)).not.toEqual(['a', 'b', 'c']);
  });
});

describe('answers', () => {
  it('finds the positions of an arrangement that are out of place', () => {
    expect(orderMistakes(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([]);
    expect(orderMistakes(['a', 'b', 'c'], ['b', 'a', 'c'])).toEqual([0, 1]);
    expect(orderMistakes(['a', 'b', 'c'], ['a'])).toEqual([1, 2]);
  });
  it('checks pairs and words', () => {
    const pairs: [string, string][] = [['Arihant', 'Conqueror'], ['Siddha', 'Liberated']];
    expect(isPair(pairs, 'Siddha', 'Liberated')).toBe(true);
    expect(isPair(pairs, 'Siddha', 'Conqueror')).toBe(false);
    expect(sameWord(' Arihantanam', 'arihantanam ')).toBe(true);
    expect(sameWord('Siddhanam', 'Arihantanam')).toBe(false);
  });
  it('splits a fill sentence around its blank', () => {
    expect(splitBlank('Namo ___')).toEqual(['Namo ', '']);
    expect(splitBlank('___ Arihantanam')).toEqual(['', ' Arihantanam']);
    expect(splitBlank('No blank')).toEqual(['No blank ', '']);
  });
});

describe('stars and tries', () => {
  it('gives 3 stars when every question was right first time, never below 1', () => {
    expect(quizStars(0)).toBe(3);
    expect(quizStars(1)).toBe(2);
    expect(quizStars(5)).toBe(1);
  });
  it('gives choice, order and fill one retry; true/false none; match until done', () => {
    expect(triesAllowed('choice')).toBe(2);
    expect(triesAllowed('order')).toBe(2);
    expect(triesAllowed('fill')).toBe(2);
    expect(triesAllowed('truefalse')).toBe(1);
    expect(triesAllowed('match')).toBe(Infinity);
  });
});
