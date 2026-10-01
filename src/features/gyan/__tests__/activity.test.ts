import { describe, expect, it } from '@jest/globals';

import { activityExtras, hotspotActivity, imageRef, parseQuestions, readActivity, voiceActivity } from '../activity';

describe('imageRef', () => {
  it('reads bundled assets, URLs and storage keys', () => {
    expect(imageRef('asset:mahavir-murti')).toEqual({ kind: 'asset', name: 'mahavir-murti' });
    expect(imageRef('https://x.test/a.jpg')).toEqual({ kind: 'url', url: 'https://x.test/a.jpg' });
    expect(imageRef('/gyan/murti.jpg')).toEqual({ kind: 'storage', key: 'gyan/murti.jpg' });
    expect(imageRef('')).toBeNull();
    expect(imageRef(42)).toBeNull();
    expect(imageRef('asset:')).toBeNull();
  });
});

describe('activityExtras', () => {
  it('reads the review flag, tip and fun fact', () => {
    expect(activityExtras({ review: 'needs_pathshala_review', tip: ' Go slowly ', fun_fact: 'x' })).toEqual({ needsReview: true, tip: 'Go slowly', funFact: 'x' });
    expect(activityExtras(null)).toEqual({ needsReview: false, tip: null, funFact: null });
  });
});

describe('readActivity', () => {
  it('keeps cards with a title or a body', () => {
    const a = readActivity({ cards: [{ title: 'Samayik', body_md: '48 minutes', emoji: '🪔' }, { title: '' }, { body_md: 'Only a body', image: 'asset:x' }, 'junk'] });
    expect(a.cards).toEqual([
      { title: 'Samayik', body: '48 minutes', emoji: '🪔', image: null },
      { title: null, body: 'Only a body', emoji: null, image: { kind: 'asset', name: 'x' } },
    ]);
  });
  it('is empty for anything else', () => {
    expect(readActivity({}).cards).toEqual([]);
    expect(readActivity(null).cards).toEqual([]);
  });
  it('reads the done button label of a practice step', () => {
    expect(readActivity({ cards: [{ title: 'Set up' }], confirm_label: 'I sat calmly for 5 minutes' }).confirmLabel).toBe('I sat calmly for 5 minutes');
    expect(readActivity({ cards: [] }).confirmLabel).toBeNull();
  });
  it('reads puja numbers on hotspot spots', () => {
    const a = hotspotActivity({ spots: [{ key: 'toe_right', order: 1, puja: 1, label: 'Right big toe', x: 0.66, y: 0.86 }] });
    expect(a.spots[0].puja).toBe(1);
  });
});

describe('hotspotActivity', () => {
  it('orders spots, clamps coordinates and fills defaults', () => {
    const a = hotspotActivity({
      image: 'asset:mahavir-murti',
      mode: 'practice',
      intro: 'Touch gently',
      spots: [
        { key: 'knees', order: 2, label: 'Knees', x: 0.2, y: 0.7 },
        { key: 'toes', order: 1, label: 'Toes', x: '0.3', y: 1.4, r: 0.04, say: 'Right toe first', why: 'Humility' },
        { key: 'bad', order: 3, label: 'No coordinates' },
        { order: 4, label: 'Head', x: 0.5, y: 0.15 },
      ],
    });
    expect(a.mode).toBe('practice');
    expect(a.image).toEqual({ kind: 'asset', name: 'mahavir-murti' });
    expect(a.spots.map((s) => s.key)).toEqual(['toes', 'knees', 'spot-4']);
    expect(a.spots[0]).toEqual({ key: 'toes', order: 1, puja: null, label: 'Toes', x: 0.3, y: 1, r: 0.04, say: 'Right toe first', why: 'Humility' });
    expect(a.spots[1].r).toBe(0.05);
    expect(a.maxSlips).toBe(2);
    expect(a.aspect).toBeNull();
  });
  it('defaults to learn mode and accepts an aspect and slip allowance', () => {
    const a = hotspotActivity({ spots: [], aspect: 0.75, max_slips: 0 });
    expect(a.mode).toBe('learn');
    expect(a.aspect).toBe(0.75);
    expect(a.maxSlips).toBe(0);
  });
  it('keeps duplicate keys apart', () => {
    const a = hotspotActivity({ spots: [{ key: 'k', label: 'A', x: 0, y: 0 }, { key: 'k', label: 'B', x: 1, y: 1 }] });
    expect(a.spots.map((s) => s.key)).toEqual(['k', 'k-2']);
  });
});

describe('voiceActivity', () => {
  it('reads verses, language and pass ratio', () => {
    const a = voiceActivity({ lang: 'hi-IN', pass_ratio: 0.8, verses: [{ text: 'णमो अरिहंताणं', translit: 'Namo Arihantanam', meaning: 'I bow', audio: 'https://x.test/1.mp3' }, { translit: 'Namo Siddhanam' }, {}] });
    expect(a.lang).toBe('hi-IN');
    expect(a.passRatio).toBe(0.8);
    expect(a.verses).toEqual([
      { text: 'णमो अरिहंताणं', translit: 'Namo Arihantanam', meaning: 'I bow', audio: { kind: 'url', url: 'https://x.test/1.mp3' } },
      { text: 'Namo Siddhanam', translit: 'Namo Siddhanam', meaning: null, audio: null },
    ]);
  });
  it('reads verse recordings as a bundled asset, a URL or a content-bucket key', () => {
    const a = voiceActivity({ verses: [{ text: 'a', audio: 'asset:navkar-1' }, { text: 'b', audio: 'gyan/navkar/2.m4a' }, { text: 'c', audio: '  ' }] });
    expect(a.verses.map((v) => v.audio)).toEqual([{ kind: 'asset', name: 'navkar-1' }, { kind: 'storage', key: 'gyan/navkar/2.m4a' }, null]);
  });
  it('falls back to Hindi and 0.7', () => {
    const a = voiceActivity({ pass_ratio: 7 });
    expect(a.lang).toBe('hi-IN');
    expect(a.passRatio).toBe(0.7);
    expect(a.verses).toEqual([]);
  });
});

describe('parseQuestions', () => {
  it('reads every question type', () => {
    const qs = parseQuestions({
      questions: [
        { question: 'Q?', options: ['a', 'b', 'c'], answer: 1, explain: 'Because' },
        { type: 'truefalse', statement: 'Samayik lasts 48 minutes', answer: true },
        { type: 'order', prompt: 'Put in order', items: ['one', 'two', 'three'] },
        { type: 'match', prompt: 'Match', pairs: [['Arihant', 'Conqueror'], { left: 'Siddha', right: 'Liberated' }] },
        { type: 'fill', sentence: 'Namo ___', answer: 'Arihantanam', options: ['Siddhanam'] },
      ],
    });
    expect(qs.map((q) => q.type)).toEqual(['choice', 'truefalse', 'order', 'match', 'fill']);
    expect(qs[0]).toEqual({ type: 'choice', question: 'Q?', options: ['a', 'b', 'c'], answer: 1, explain: 'Because' });
    expect(qs[3]).toMatchObject({ pairs: [['Arihant', 'Conqueror'], ['Siddha', 'Liberated']] });
    expect(qs[4]).toMatchObject({ options: ['Siddhanam', 'Arihantanam'], sentence: 'Namo ___' });
  });
  it('keeps the original quiz shape working (bare array, answer by text)', () => {
    expect(parseQuestions([{ q: 'Who?', options: ['x', 'y'], answer: 'y' }])).toEqual([{ type: 'choice', question: 'Who?', options: ['x', 'y'], answer: 1, explain: null }]);
  });
  it('drops broken questions', () => {
    const qs = parseQuestions({
      questions: [
        { question: 'No options', options: ['a'], answer: 0 },
        { type: 'truefalse', statement: 'x', answer: 'maybe' },
        { type: 'order', items: ['same', 'same'] },
        { type: 'match', pairs: [['a', 'b']] },
        { type: 'fill', sentence: 'x ___', answer: 'y', options: [] },
        { type: 'choice', question: 'Out of range', options: ['a', 'b'], answer: 5 },
      ],
    });
    expect(qs).toEqual([]);
  });
  it('adds a blank to a fill sentence that has none', () => {
    const [q] = parseQuestions([{ type: 'fill', sentence: 'Namo', answer: 'Siddhanam', options: ['Loe'] }]);
    expect(q).toMatchObject({ sentence: 'Namo ___' });
  });
});
