/**
 * A card that rotates through several items (Home › Giving): which item is
 * showing, where a swipe, an arrow key or the timer moves it, and whether it
 * may move on by itself. Pure, unit-tested in src/lib/__tests__/rotation.test.ts.
 */

/** How long one item stays before the next one (ms). */
export const ROTATE_MS = 6000;

/** How far (px) a sideways swipe must travel to move one item. */
export const SWIPE_MIN = 40;

/** How far (px) a drag must go sideways before the card takes it from the page's up-and-down scroll. */
export const DRAG_START = 12;

/** `i` kept inside 0…n-1, wrapping both ways (the item after the last is the first); 0 when there is nothing. */
export function wrapIndex(i: number, n: number): number {
  if (!Number.isFinite(i) || !Number.isFinite(n) || n < 1) return 0;
  const size = Math.floor(n);
  return ((Math.trunc(i) % size) + size) % size;
}

export function nextIndex(i: number, n: number): number {
  return wrapIndex(i + 1, n);
}

export function prevIndex(i: number, n: number): number {
  return wrapIndex(i - 1, n);
}

export type AutoAdvanceInput = {
  /** How many items there are. */
  count: number;
  /** Someone is touching, hovering over or focused inside the card. */
  held: boolean;
  /** The screen is the one in front (not behind another screen or tab). */
  screenFocused: boolean;
  /** The phone's Reduce Motion setting; null while it is not known yet. */
  reduceMotion: boolean | null;
  /** A screen reader is on; null while it is not known yet. */
  screenReader: boolean | null;
};

/**
 * Whether the card may move on by itself: only with two or more items, on the
 * screen in front, while nobody is holding it, and only once Reduce Motion and
 * the screen reader are both known to be off (moving content under a screen
 * reader loses the listener's place). Swiping, the arrows and the screen
 * reader's own gestures still move it by hand.
 */
export function shouldAutoAdvance(s: AutoAdvanceInput): boolean {
  return s.count > 1 && !s.held && s.screenFocused && s.reduceMotion === false && s.screenReader === false;
}

/** Whether a drag in progress is sideways enough to be a swipe (and not the page scrolling). */
export function isSidewaysDrag(dx: number, dy: number, start = DRAG_START): boolean {
  return Math.abs(dx) > start && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/** A finished drag: +1 (swiped left, the next item), -1 (swiped right, the previous one), 0 (too short or mostly up and down). */
export function swipeStep(dx: number, dy: number, min = SWIPE_MIN): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || Math.abs(dx) < min || Math.abs(dx) <= Math.abs(Number.isFinite(dy) ? dy : 0)) return 0;
  return dx < 0 ? 1 : -1;
}

/** A key pressed inside the card on the web: the right arrow moves on, the left arrow back, anything else nothing. */
export function keyStep(key: string): -1 | 0 | 1 {
  if (key === 'ArrowRight') return 1;
  if (key === 'ArrowLeft') return -1;
  return 0;
}
