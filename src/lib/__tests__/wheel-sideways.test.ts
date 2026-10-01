import { describe, expect, it } from '@jest/globals';

import { sidewaysScroll } from '../wheel-sideways';

const wheel = (deltaY: number, extra: Partial<{ deltaX: number; deltaMode: number; ctrlKey: boolean }> = {}) => ({
  deltaX: 0,
  deltaMode: 0,
  ctrlKey: false,
  deltaY,
  ...extra,
});

describe('sidewaysScroll', () => {
  it('turns a vertical wheel into sideways scrolling, kept inside the strip', () => {
    expect(sidewaysScroll(wheel(100), 0, 300)).toBe(100);
    expect(sidewaysScroll(wheel(-100), 250, 300)).toBe(150);
    expect(sidewaysScroll(wheel(500), 100, 300)).toBe(300);
    expect(sidewaysScroll(wheel(-500), 100, 300)).toBe(0);
  });

  it('leaves the page scrolling at either end of the strip', () => {
    expect(sidewaysScroll(wheel(-100), 0, 300)).toBeNull();
    expect(sidewaysScroll(wheel(100), 300, 300)).toBeNull();
  });

  it('does nothing when everything fits, for trackpad sideways swipes, or for ctrl+wheel zoom', () => {
    expect(sidewaysScroll(wheel(100), 0, 0)).toBeNull();
    expect(sidewaysScroll(wheel(10, { deltaX: 40 }), 0, 300)).toBeNull();
    expect(sidewaysScroll(wheel(100, { ctrlKey: true }), 0, 300)).toBeNull();
  });

  it('reads wheels that report lines (Firefox) as 16 px a line', () => {
    expect(sidewaysScroll(wheel(3, { deltaMode: 1 }), 0, 300)).toBe(48);
  });
});
