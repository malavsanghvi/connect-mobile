import { describe, expect, it } from '@jest/globals';

import { confettiPieces } from '../celebrate';

describe('confettiPieces', () => {
  it('is the same for a seed and stays in range', () => {
    const a = confettiPieces(7, 20);
    expect(a).toEqual(confettiPieces(7, 20));
    expect(a).toHaveLength(20);
    for (const p of a) {
      expect(p.rise).toBeLessThanOrEqual(0);
      expect(p.fall).toBeGreaterThan(0);
      expect(p.color).toBeLessThan(5);
      expect(p.delay).toBeLessThanOrEqual(0.2);
    }
  });
  it('differs between seeds', () => {
    expect(confettiPieces(1)).not.toEqual(confettiPieces(2));
  });
});
