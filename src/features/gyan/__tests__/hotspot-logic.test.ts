import { describe, expect, it } from '@jest/globals';

import { translate } from '../../../i18n';
import type { HotspotSpot } from '../activity';
import { freshPractice, hitSpot, learnLook, MIN_TAP_RADIUS, practiceLook, practiceNote, practiceScore, practiceSuccess, practiceTap, spatialOrder, spotBox, spotProgress, tapPoint, tapTargets } from '../hotspot-logic';

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

/**
 * The Navang spots on the derasar photo of the murti (assets/gyan/mahavir-murti.webp,
 * 1200 x 1600), as connect-crm 0571_gyan_content_pack.sql gives them, in tap order.
 */
const NAVANG = (
  [
    ['toe_right', 0.706, 0.807, 0.03],
    ['toe_left', 0.274, 0.805, 0.03],
    ['knee_right', 0.171, 0.795, 0.045],
    ['knee_left', 0.821, 0.79, 0.045],
    ['wrist_right', 0.383, 0.705, 0.035],
    ['wrist_left', 0.616, 0.702, 0.035],
    ['shoulder_right', 0.329, 0.51, 0.04],
    ['shoulder_left', 0.667, 0.505, 0.04],
    ['shikha', 0.496, 0.288, 0.04],
    ['forehead', 0.495, 0.348, 0.035],
    ['throat', 0.497, 0.479, 0.035],
    ['heart', 0.498, 0.572, 0.04],
    ['navel', 0.497, 0.705, 0.045],
  ] as const
).map(([key, x, y, r]) => spot(key, x, y, r));
const at = (key: string) => NAVANG.findIndex((s) => s.key === key);
const box = (key: string, w: number, h: number) => spotBox(NAVANG[at(key)], w, h);

describe('hitSpot where tap circles overlap (the 0571 Navang spots)', () => {
  const nearest = (s: HotspotSpot[], px: number, py: number, w: number, h: number) =>
    s
      .map((x) => ({ x, d: Math.hypot(px - spotBox(x, w, h).cx, py - spotBox(x, w, h).cy), r: spotBox(x, w, h).radius }))
      .filter((c) => c.d <= c.r)
      .sort((a, b) => a.d - b.d)[0]?.x.key ?? null;
  for (const width of [320, 350]) {
    const height = (width * 4) / 3; // the photo is 3:4
    it(`picks the nearer of shikha and forehead at ${width}px`, () => {
      const shikha = box('shikha', width, height);
      const forehead = box('forehead', width, height);
      // The two 44px circles overlap (25.6px apart at 320px): the nearer centre wins on each side.
      expect(forehead.cy - shikha.cy).toBeLessThan(shikha.radius + forehead.radius);
      const mid = (shikha.cy + forehead.cy) / 2;
      expect(hitSpot(NAVANG, forehead.cx, mid - 1, width, height)?.key).toBe('shikha');
      expect(hitSpot(NAVANG, forehead.cx, mid + 1, width, height)?.key).toBe('forehead');
      expect(hitSpot(NAVANG, shikha.cx, shikha.cy + 10, width, height)?.key).toBe('shikha');
      expect(hitSpot(NAVANG, forehead.cx, forehead.cy - 10, width, height)?.key).toBe('forehead');
      // Every point on the line between them goes to the nearer centre, never the one drawn later.
      for (let y = shikha.cy; y <= forehead.cy; y += 1) expect(hitSpot(NAVANG, forehead.cx, y, width, height)?.key ?? null).toBe(nearest(NAVANG, forehead.cx, y, width, height));
    });
    it(`keeps throat and heart apart at ${width}px`, () => {
      const throat = box('throat', width, height);
      const heart = box('heart', width, height);
      expect(hitSpot(NAVANG, throat.cx, throat.cy + 15, width, height)?.key).toBe('throat');
      expect(hitSpot(NAVANG, heart.cx, heart.cy - 15, width, height)?.key).toBe('heart');
      for (let y = throat.cy; y <= heart.cy; y += 1) expect(hitSpot(NAVANG, throat.cx, y, width, height)?.key ?? null).toBe(nearest(NAVANG, throat.cx, y, width, height));
      // Beside them, out of every circle, a tap is no spot at all (not a wrong touch).
      expect(hitSpot(NAVANG, throat.cx + 25, (throat.cy + heart.cy) / 2, width, height)).toBeNull();
    });
  }
});

describe('tapTargets: a touched spot never takes a tap meant for its neighbour', () => {
  for (const width of [320, 350]) {
    const height = (width * 4) / 3;
    const forehead = box('forehead', width, height);
    // 14px above the forehead's centre: inside both circles, and nearer the shikha's centre at 320px.
    const px = forehead.cx;
    const py = forehead.cy - 14;
    it(`learn at ${width}px: with the shikha done, the glowing forehead takes the whole of its circle`, () => {
      const look = learnLook(at('forehead'));
      expect(look(NAVANG[at('shikha')], at('shikha'))).toBe('done');
      expect(tapTargets(NAVANG, look).map((s) => s.key)).toEqual(['forehead']);
      expect(hitSpot(tapTargets(NAVANG, look), px, py, width, height)?.key).toBe('forehead');
      // The knee and the navel are not lost to the toe and the wrists touched before them either.
      const knee = box('knee_right', width, height);
      expect(hitSpot(tapTargets(NAVANG, learnLook(at('knee_right'))), knee.cx + 21, knee.cy, width, height)?.key).toBe('knee_right');
      const navel = box('navel', width, height);
      expect(hitSpot(tapTargets(NAVANG, learnLook(at('navel'))), navel.cx - 21, navel.cy, width, height)?.key).toBe('navel');
    });
    it(`practice at ${width}px: after the shikha, a tap on the top of the forehead counts`, () => {
      let p = freshPractice();
      for (const s of NAVANG.slice(0, at('forehead'))) p = practiceTap(p, NAVANG, s.key).state;
      const targets = tapTargets(NAVANG, practiceLook(p));
      expect(targets.map((s) => s.key)).toEqual(['forehead', 'throat', 'heart', 'navel']);
      const hit = hitSpot(targets, px, py, width, height);
      expect(hit?.key).toBe('forehead');
      expect(practiceTap(p, NAVANG, hit?.key ?? '').outcome).toBe('right');
    });
  }
  it('at 320px the old rule (every spot shown) gave that tap to the touched shikha', () => {
    const height = (320 * 4) / 3;
    const f = box('forehead', 320, height);
    expect(hitSpot(NAVANG, f.cx, f.cy - 14, 320, height)?.key).toBe('shikha');
  });
  it('keeps the glowing hint and the spots still to touch in practice, never hidden ones', () => {
    const p = { ...freshPractice(), next: 2, slips: 1, hint: 'knee_right' };
    expect(practiceLook(p)(NAVANG[at('knee_right')], at('knee_right'))).toBe('glow');
    expect(tapTargets(NAVANG, practiceLook(p))).toHaveLength(NAVANG.length - 2);
    expect(tapTargets(NAVANG, learnLook(NAVANG.length))).toEqual([]);
  });
});

describe('spatialOrder', () => {
  it('reads the 0571 spots row by row, left to right on the screen, not in tap order', () => {
    const entries = NAVANG.map((s, i) => ({ s, i }));
    expect(spatialOrder(entries).map((e) => e.s.key)).toEqual([
      'shikha',
      'forehead',
      'throat',
      // 0.51 and 0.505 are one row: the screen-left shoulder (Bhagwan's right) is read first.
      'shoulder_right',
      'shoulder_left',
      'heart',
      'wrist_right',
      'navel',
      'wrist_left',
      // The knees and toes are within 2% of the height of each other: one row across the feet.
      'knee_right',
      'toe_left',
      'toe_right',
      'knee_left',
    ]);
  });
  it("starts a new row more than 2% below the row's first spot", () => {
    const entries = [spot('a', 0.9, 0.5), spot('b', 0.1, 0.515), spot('c', 0.5, 0.53), spot('d', 0.2, 0.545)].map((s, i) => ({ s, i }));
    expect(spatialOrder(entries).map((e) => e.s.key)).toEqual(['b', 'a', 'd', 'c']);
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
