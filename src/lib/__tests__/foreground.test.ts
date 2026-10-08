import { describe, expect, it } from '@jest/globals';

import { FOREGROUND_REFRESH_MS, PERIODIC_REFRESH_MS, refreshDue } from '../foreground';

describe('when the app re-reads what administrators can change', () => {
  it('reads at once when it never has', () => {
    expect(refreshDue(null, 1_000)).toBe(true);
  });

  it('does not read again just because the app flickered back to the foreground', () => {
    expect(refreshDue(1_000, 1_000 + FOREGROUND_REFRESH_MS - 1)).toBe(false);
  });

  it('reads again once the last read is old enough', () => {
    expect(refreshDue(1_000, 1_000 + FOREGROUND_REFRESH_MS)).toBe(true);
    expect(refreshDue(1_000, 1_000 + 60 * 60_000)).toBe(true);
  });

  it('honours a shorter or longer wait', () => {
    expect(refreshDue(0, 14_999, 15_000)).toBe(false);
    expect(refreshDue(0, 15_000, 15_000)).toBe(true);
  });

  it('reads again when the clock went backwards', () => {
    expect(refreshDue(10_000, 5_000)).toBe(true);
  });

  it('checks a long-open app every few minutes, not every few seconds', () => {
    expect(PERIODIC_REFRESH_MS).toBeGreaterThanOrEqual(60_000);
    expect(FOREGROUND_REFRESH_MS).toBeLessThan(PERIODIC_REFRESH_MS);
  });
});
