import { describe, expect, it } from '@jest/globals';

import type { HotspotSpot } from '../activity';
import { freshPractice, hitSpot, MIN_TAP_RADIUS, practiceScore, practiceSuccess, practiceTap, spotBox, spotProgress } from '../hotspot-logic';

const spot = (key: string, x: number, y: number, r = 0.05, puja: number | null = null): HotspotSpot => ({ key, order: 0, puja, label: key, x, y, r, say: null, why: null });

describe('spotProgress', () => {
  it('counts pujas when every spot has one (13 touches, 9 pujas)', () => {
    const navang = [1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8, 9].map((p, i) => spot(`s${i}`, 0.5, 0.5, 0.05, p));
    expect(spotProgress(navang, 0)).toEqual({ kind: 'puja', n: 1, total: 9 });
    expect(spotProgress(navang, 3)).toEqual({ kind: 'puja', n: 2, total: 9 });
    expect(spotProgress(navang, 12)).toEqual({ kind: 'puja', n: 9, total: 9 });
  });
  it('counts touches otherwise', () => {
    expect(spotProgress([spot('a', 0, 0), spot('b', 1, 1)], 1)).toEqual({ kind: 'touch', n: 2, total: 2 });
  });
});
const SPOTS = [spot('toes', 0.3, 0.69), spot('knees', 0.18, 0.72), spot('head', 0.5, 0.16)];

describe('spotBox and hitSpot', () => {
  it('places a spot on the drawn image with at least a 44px target', () => {
    expect(spotBox(SPOTS[0], 300, 400)).toEqual({ cx: 90, cy: 276, radius: MIN_TAP_RADIUS });
    expect(spotBox(spot('big', 0.5, 0.5, 0.2), 300, 400).radius).toBe(60);
  });
  it('finds the nearest spot under a tap, or none', () => {
    expect(hitSpot(SPOTS, 92, 280, 300, 400)?.key).toBe('toes');
    expect(hitSpot(SPOTS, 150, 64, 300, 400)?.key).toBe('head');
    expect(hitSpot(SPOTS, 290, 10, 300, 400)).toBeNull();
  });
});

describe('practice', () => {
  it('moves on with the right spot and finishes after the last one', () => {
    let s = freshPractice();
    let r = practiceTap(s, SPOTS, 'toes');
    expect(r.outcome).toBe('right');
    s = r.state;
    r = practiceTap(s, SPOTS, 'knees');
    s = r.state;
    r = practiceTap(s, SPOTS, 'head');
    expect(r.outcome).toBe('done');
    expect(r.state).toEqual({ next: 3, slips: 0, hint: null, done: true });
    expect(practiceTap(r.state, SPOTS, 'toes').outcome).toBe('ignored');
  });
  it('counts a wrong spot as a slip and hints the right one', () => {
    const r = practiceTap(freshPractice(), SPOTS, 'head');
    expect(r.outcome).toBe('wrong');
    expect(r.state).toEqual({ next: 0, slips: 1, hint: 'toes', done: false });
    const fixed = practiceTap(r.state, SPOTS, 'toes');
    expect(fixed.state.hint).toBeNull();
    expect(fixed.state.slips).toBe(1);
  });
  it('ignores a second tap on a spot already touched', () => {
    const after = practiceTap(freshPractice(), SPOTS, 'toes').state;
    expect(practiceTap(after, SPOTS, 'toes')).toEqual({ state: after, outcome: 'ignored' });
  });
  it('scores and judges a try', () => {
    expect(practiceScore(9, 0)).toBe(100);
    expect(practiceScore(9, 3)).toBe(75);
    expect(practiceScore(0, 0)).toBe(0);
    expect(practiceSuccess({ next: 3, slips: 2, hint: null, done: true }, 2)).toBe(true);
    expect(practiceSuccess({ next: 3, slips: 3, hint: null, done: true }, 2)).toBe(false);
    expect(practiceSuccess({ next: 2, slips: 0, hint: null, done: false }, 2)).toBe(false);
  });
});
