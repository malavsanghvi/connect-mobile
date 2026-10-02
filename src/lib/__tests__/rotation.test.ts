import { describe, expect, it } from '@jest/globals';

import { isSidewaysDrag, keyStep, nextIndex, prevIndex, ROTATE_MS, shouldAutoAdvance, swipeStep, wrapIndex, type AutoAdvanceInput } from '../rotation';

describe('wrapIndex / nextIndex / prevIndex', () => {
  it('keeps the index inside the list and wraps both ways', () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(2, 3)).toBe(2);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(7, 3)).toBe(1);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(-4, 3)).toBe(2);
  });
  it('moves to the next and previous item, around the ends', () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
    expect(prevIndex(0, 3)).toBe(2);
    expect(prevIndex(2, 3)).toBe(1);
  });
  it('stays on 0 with one item or none, and with junk input', () => {
    expect(nextIndex(0, 1)).toBe(0);
    expect(prevIndex(0, 1)).toBe(0);
    expect(wrapIndex(5, 0)).toBe(0);
    expect(wrapIndex(5, -2)).toBe(0);
    expect(wrapIndex(Number.NaN, 3)).toBe(0);
    expect(wrapIndex(1, Number.NaN)).toBe(0);
  });
  it('lands on an item when the list gets shorter (a refresh)', () => {
    expect(wrapIndex(4, 2)).toBe(0);
    expect(wrapIndex(5, 2)).toBe(1);
  });
});

describe('shouldAutoAdvance', () => {
  const free: AutoAdvanceInput = { count: 3, held: false, screenFocused: true, reduceMotion: false, screenReader: false };
  it('moves on every 6 seconds with two or more items and nobody holding it', () => {
    expect(ROTATE_MS).toBe(6000);
    expect(shouldAutoAdvance(free)).toBe(true);
    expect(shouldAutoAdvance({ ...free, count: 2 })).toBe(true);
  });
  it('does not move with one item or none', () => {
    expect(shouldAutoAdvance({ ...free, count: 1 })).toBe(false);
    expect(shouldAutoAdvance({ ...free, count: 0 })).toBe(false);
  });
  it('pauses while touched, hovered or focused, and while Home is behind another screen', () => {
    expect(shouldAutoAdvance({ ...free, held: true })).toBe(false);
    expect(shouldAutoAdvance({ ...free, screenFocused: false })).toBe(false);
  });
  it('never moves by itself with Reduce Motion or a screen reader on, or before either is known', () => {
    expect(shouldAutoAdvance({ ...free, reduceMotion: true })).toBe(false);
    expect(shouldAutoAdvance({ ...free, reduceMotion: null })).toBe(false);
    expect(shouldAutoAdvance({ ...free, screenReader: true })).toBe(false);
    expect(shouldAutoAdvance({ ...free, screenReader: null })).toBe(false);
  });
});

describe('swipes and keys', () => {
  it('a swipe left shows the next item, a swipe right the previous one', () => {
    expect(swipeStep(-80, 5)).toBe(1);
    expect(swipeStep(80, -5)).toBe(-1);
  });
  it('ignores short drags and mostly up-and-down ones (the page scrolling)', () => {
    expect(swipeStep(-20, 0)).toBe(0);
    expect(swipeStep(-60, 90)).toBe(0);
    expect(swipeStep(60, 60)).toBe(0);
    expect(swipeStep(Number.NaN, 0)).toBe(0);
  });
  it('takes a drag from the page only once it is clearly sideways', () => {
    expect(isSidewaysDrag(30, 5)).toBe(true);
    expect(isSidewaysDrag(-30, 5)).toBe(true);
    expect(isSidewaysDrag(8, 0)).toBe(false);
    expect(isSidewaysDrag(30, 25)).toBe(false);
  });
  it('the arrow keys move it on the web; other keys do nothing', () => {
    expect(keyStep('ArrowRight')).toBe(1);
    expect(keyStep('ArrowLeft')).toBe(-1);
    expect(keyStep('Enter')).toBe(0);
    expect(keyStep('ArrowDown')).toBe(0);
  });
});
