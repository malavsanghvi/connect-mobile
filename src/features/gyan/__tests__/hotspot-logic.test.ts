import { describe, expect, it } from '@jest/globals';

import { translate } from '../../../i18n';
import type { HotspotSpot } from '../activity';
import { freshPractice, hitSpot, MIN_TAP_RADIUS, practiceNote, practiceScore, practiceSuccess, practiceTap, spatialOrder, spotBox, spotProgress, tapPoint } from '../hotspot-logic';

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

describe('tapPoint', () => {
  it('reads a phone touch and a web click', () => {
    expect(tapPoint({ locationX: 12, locationY: 30, offsetX: 99 })).toEqual({ x: 12, y: 30 });
    expect(tapPoint({ offsetX: 5, offsetY: 6 })).toEqual({ x: 5, y: 6 });
    expect(tapPoint({ pageX: 1 })).toBeNull();
    expect(tapPoint(null)).toBeNull();
  });
});

describe('hitSpot where tap circles overlap (Navang head and chest spots)', () => {
  // The content pack's head and chest spots (0571); the photo's own coordinates come with the content.
  const NAVANG = [spot('shikha', 0.5, 0.062, 0.04), spot('forehead', 0.5, 0.16, 0.04), spot('throat', 0.5, 0.27, 0.04), spot('heart', 0.5, 0.42, 0.05)];
  const nearest = (s: HotspotSpot[], px: number, py: number, w: number, h: number) =>
    s
      .map((x) => ({ x, d: Math.hypot(px - spotBox(x, w, h).cx, py - spotBox(x, w, h).cy), r: spotBox(x, w, h).radius }))
      .filter((c) => c.d <= c.r)
      .sort((a, b) => a.d - b.d)[0]?.x.key ?? null;
  for (const width of [320, 350]) {
    const height = (width * 4) / 3; // the murti picture is 3:4
    it(`picks the nearer of shikha and forehead at ${width}px`, () => {
      const [shikha, forehead] = NAVANG.map((s) => spotBox(s, width, height));
      const mid = (shikha.cy + forehead.cy) / 2;
      // At 320px the two 44px circles overlap around the midpoint: the nearer centre wins on each side.
      if (width === 320) expect(forehead.cy - shikha.cy).toBeLessThan(shikha.radius + forehead.radius);
      expect(hitSpot(NAVANG, width / 2, mid - 1, width, height)?.key).toBe('shikha');
      expect(hitSpot(NAVANG, width / 2, mid + 1, width, height)?.key).toBe('forehead');
      expect(hitSpot(NAVANG, width / 2, shikha.cy + 14, width, height)?.key).toBe('shikha');
      expect(hitSpot(NAVANG, width / 2, forehead.cy - 14, width, height)?.key).toBe('forehead');
      // Every point on the line between them goes to the nearer centre, never the one drawn later.
      for (let y = shikha.cy; y <= forehead.cy; y += 1) expect(hitSpot(NAVANG, width / 2, y, width, height)?.key ?? null).toBe(nearest(NAVANG, width / 2, y, width, height));
    });
    it(`keeps throat and heart apart at ${width}px`, () => {
      const [, , throat, heart] = NAVANG.map((s) => spotBox(s, width, height));
      expect(hitSpot(NAVANG, width / 2, throat.cy + 15, width, height)?.key).toBe('throat');
      expect(hitSpot(NAVANG, width / 2, heart.cy - 15, width, height)?.key).toBe('heart');
      for (let y = throat.cy; y <= heart.cy; y += 1) expect(hitSpot(NAVANG, width / 2, y, width, height)?.key ?? null).toBe(nearest(NAVANG, width / 2, y, width, height));
      // Between them, out of both circles, a tap is no spot at all (not a wrong touch).
      expect(hitSpot(NAVANG, width / 2, (throat.cy + heart.cy) / 2, width, height)).toBeNull();
    });
  }
});

describe('spatialOrder', () => {
  it('reads the spots top to bottom, then left to right, not in tap order', () => {
    const entries = [spot('toe_right', 0.66, 0.86), spot('toe_left', 0.34, 0.86), spot('knee_right', 0.14, 0.89), spot('shikha', 0.5, 0.062), spot('heart', 0.5, 0.42)].map((s, i) => ({ s, i }));
    expect(spatialOrder(entries).map((e) => e.s.key)).toEqual(['shikha', 'heart', 'toe_left', 'toe_right', 'knee_right']);
  });
});

describe('practiceNote', () => {
  const say = (slips: number, max: number) => {
    const l = practiceNote(slips, max);
    return translate('en', l.key, l.vars);
  };
  it('says one wrong touch in the singular', () => {
    expect(say(0, 2)).toBe('Every touch in order!');
    expect(say(1, 2)).toBe('Finished with 1 wrong touch.');
    expect(say(2, 2)).toBe('Finished with 2 wrong touches.');
  });
  it('asks for another try when there were too many', () => {
    expect(say(3, 2)).toBe('Finished with 3 wrong touches. Practise once more: finish with 2 or fewer to go on.');
    expect(say(1, 0)).toBe('Finished with 1 wrong touch. Practise once more: finish with every touch in order to go on.');
    expect(say(4, 0)).toBe('Finished with 4 wrong touches. Practise once more: finish with every touch in order to go on.');
  });
});
