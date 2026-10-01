/**
 * Pure rules for the hotspot activity (Navang puja): hit-testing taps on the
 * image and the "tap the spots in order" practice. Tested in
 * __tests__/hotspot-logic.test.ts.
 */
import type { HotspotSpot } from './activity';
import type { Line } from './points';

/** Smallest tap circle on screen (radius, px): 44px targets. */
export const MIN_TAP_RADIUS = 22;

/** On-screen centre and tap radius of a spot for an image drawn at width × height. */
export function spotBox(spot: Pick<HotspotSpot, 'x' | 'y' | 'r'>, width: number, height: number): { cx: number; cy: number; radius: number } {
  return { cx: spot.x * width, cy: spot.y * height, radius: Math.max(MIN_TAP_RADIUS, spot.r * width) };
}

/**
 * Where a tap landed inside the touch layer over the picture: `locationX/Y`
 * on a phone, `offsetX/Y` of the click on the web (the layer has no children,
 * so both are measured from its own corner). Null when the event has neither.
 */
export function tapPoint(nativeEvent: unknown): { x: number; y: number } | null {
  const e = nativeEvent && typeof nativeEvent === 'object' ? (nativeEvent as Record<string, unknown>) : {};
  const pick = (a: unknown, b: unknown) => (typeof a === 'number' && Number.isFinite(a) ? a : typeof b === 'number' && Number.isFinite(b) ? b : null);
  const x = pick(e.locationX, e.offsetX);
  const y = pick(e.locationY, e.offsetY);
  return x === null || y === null ? null : { x, y };
}

/** Spots whose heights differ by at most this (a fraction of the picture's height) are read as one row. */
export const ROW_TOLERANCE = 0.02;

/**
 * Spots in reading order on the picture (top to bottom, then left to right),
 * for screen readers and the list in practice: the tap order is the answer,
 * so it must not be the order they are read out in. A row starts at its
 * highest spot and takes every spot within ROW_TOLERANCE below it (the two
 * shoulders, 0.505 and 0.51, are one row, read left then right).
 */
export function spatialOrder<T extends { s: Pick<HotspotSpot, 'x' | 'y'> }>(entries: readonly T[]): T[] {
  const byY = entries.map((e, i) => ({ e, i })).sort((a, b) => a.e.s.y - b.e.s.y || a.i - b.i);
  const rows: { e: T; i: number }[][] = [];
  for (const x of byY) {
    const row = rows[rows.length - 1];
    if (row && x.e.s.y - row[0].e.s.y <= ROW_TOLERANCE) row.push(x);
    else rows.push([x]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.e.s.x - b.e.s.x || a.i - b.i).map((x) => x.e));
}

/** How a spot is drawn: glowing (touch this one), touched already, waiting, or not shown yet. */
export type SpotLook = 'glow' | 'done' | 'plain' | 'hidden';

/** Learn: the spots before `at` are done, `at` glows, the rest are not shown yet. */
export const learnLook =
  (at: number) =>
  (_s: HotspotSpot, i: number): SpotLook =>
    i < at ? 'done' : i === at ? 'glow' : 'hidden';

/** Practice: the spots touched in this try are done; after a wrong touch the right one glows. */
export const practiceLook =
  (p: PracticeState) =>
  (s: HotspotSpot, i: number): SpotLook =>
    i < p.next ? 'done' : p.hint === s.key ? 'glow' : 'plain';

/**
 * The spots a finger can still touch: shown and not touched yet. A touched
 * spot never responds again, so it must not take a tap meant for its
 * neighbour (on a narrow phone the forehead's tap circle overlaps the
 * shikha's). In learn that is the glowing spot alone.
 */
export function tapTargets(spots: readonly HotspotSpot[], look: (s: HotspotSpot, i: number) => SpotLook): HotspotSpot[] {
  return spots.filter((s, i) => {
    const l = look(s, i);
    return l === 'glow' || l === 'plain';
  });
}

/** The spot under a tap (px within the drawn image), nearest centre first; null when the tap hit no spot. */
export function hitSpot(spots: readonly HotspotSpot[], px: number, py: number, width: number, height: number): HotspotSpot | null {
  let best: { spot: HotspotSpot; d: number } | null = null;
  for (const s of spots) {
    const { cx, cy, radius } = spotBox(s, width, height);
    const d = Math.hypot(px - cx, py - cy);
    if (d <= radius && (!best || d < best.d)) best = { spot: s, d };
  }
  return best?.spot ?? null;
}

/**
 * "Puja 3 of 9" when the spots carry puja numbers (13 touches, 9 pujas), else
 * "Touch 5 of 13". `index` is the spot's position in tap order.
 */
export function spotProgress(spots: readonly HotspotSpot[], index: number): { kind: 'puja' | 'touch'; n: number; total: number } {
  const spot = spots[Math.max(0, Math.min(index, spots.length - 1))];
  const pujas = spots.map((s) => s.puja).filter((p): p is number => p !== null);
  if (spot?.puja != null && pujas.length === spots.length) return { kind: 'puja', n: spot.puja, total: Math.max(...pujas) };
  return { kind: 'touch', n: Math.min(index + 1, spots.length), total: spots.length };
}

export type PracticeState = {
  /** Index (in order) of the spot to touch next. */
  next: number;
  /** Wrong taps in this try. */
  slips: number;
  /** The spot to hint after a wrong tap, until the right one is touched. */
  hint: string | null;
  done: boolean;
};

export const freshPractice = (): PracticeState => ({ next: 0, slips: 0, hint: null, done: false });

export type TapOutcome = 'right' | 'wrong' | 'done' | 'ignored';

/** One tap in a practice try. Tapping the right spot moves on; any other spot is a slip and hints the right one. */
export function practiceTap(state: PracticeState, spots: readonly HotspotSpot[], key: string): { state: PracticeState; outcome: TapOutcome } {
  if (state.done || spots.length === 0) return { state, outcome: 'ignored' };
  const want = spots[state.next];
  if (key === want.key) {
    const next = state.next + 1;
    const done = next >= spots.length;
    return { state: { next, slips: state.slips, hint: null, done }, outcome: done ? 'done' : 'right' };
  }
  // A spot already touched in this try is not a slip (a double tap), just ignored.
  if (spots.slice(0, state.next).some((s) => s.key === key)) return { state, outcome: 'ignored' };
  return { state: { ...state, slips: state.slips + 1, hint: want.key }, outcome: 'wrong' };
}

/** 0–100: every spot right first time is 100; each slip lowers it. */
export function practiceScore(spotCount: number, slips: number): number {
  if (spotCount <= 0) return 0;
  return Math.round((spotCount * 100) / (spotCount + Math.max(0, slips)));
}

/** A finished try counts (completes the step, and earns practice points) with at most `maxSlips` wrong taps. */
export function practiceSuccess(state: PracticeState, maxSlips: number): boolean {
  return state.done && state.slips <= maxSlips;
}

/** What to say when a try is finished: every touch in order, "1 wrong touch", or too many to go on. */
export function practiceNote(slips: number, maxSlips: number): Line {
  if (slips <= 0) return { key: 'gyan.tryClean' };
  if (slips <= maxSlips) return slips === 1 ? { key: 'gyan.trySlip' } : { key: 'gyan.trySlips', vars: { n: slips } };
  if (maxSlips <= 0) return slips === 1 ? { key: 'gyan.tryTooManyOne' } : { key: 'gyan.tryTooManyNone', vars: { n: slips } };
  return { key: 'gyan.tryTooMany', vars: { n: slips, max: maxSlips } };
}
