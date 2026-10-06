import { describe, expect, it } from '@jest/globals';

import { versionFor } from '../use-load';

describe('versionFor: a load that can ignore writes made elsewhere', () => {
  it('follows every write when it is not asked to freeze (what every load did before)', () => {
    expect(versionFor(5, 2, undefined)).toEqual({ version: 5, seen: 2 });
    expect(versionFor(0, 0, undefined)).toEqual({ version: 0, seen: 0 });
  });

  it('keeps the version it had seen while frozen, whatever is written meanwhile', () => {
    expect(versionFor(9, 4, true)).toEqual({ version: 4, seen: 4 });
    expect(versionFor(4, 4, true)).toEqual({ version: 4, seen: 4 });
  });

  it('catches up once when the freeze ends, and follows again after that', () => {
    // Frozen at 4 while writes took the live version to 9: the first unfrozen render sees 9 (one reload), then it keeps up.
    expect(versionFor(9, 4, false)).toEqual({ version: 9, seen: 9 });
    expect(versionFor(10, 9, false)).toEqual({ version: 10, seen: 10 });
  });

  it('never moves while it is always frozen (the lesson ignores the writes of its own steps)', () => {
    let seen = 3;
    for (const live of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      const next = versionFor(live, seen, true);
      expect(next.version).toBe(3);
      seen = next.seen;
    }
    expect(seen).toBe(3);
  });
});
