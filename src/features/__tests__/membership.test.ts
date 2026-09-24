import { describe, expect, it } from '@jest/globals';

import { en } from '@/i18n/en';

import { applicationStatusKey, applyableTypes, tierRank } from '../membership';

const types = [
  { id: 'l', tier: 'life', active: true, fee_cents: 50100 },
  { id: 'c', tier: 'community', active: true, fee_cents: 0 },
  { id: 'y', tier: 'yearly', active: true, fee_cents: 0 },
  { id: 'old', tier: 'yearly', active: false, fee_cents: 0 },
];

describe('membership application helpers', () => {
  it('ranks tiers', () => {
    expect(tierRank('life')).toBeGreaterThan(tierRank('yearly'));
    expect(tierRank(null)).toBe(0);
  });
  it('offers only active types above the tier the family holds', () => {
    expect(applyableTypes(types, null).map((t) => t.id)).toEqual(['c', 'y', 'l']);
    expect(applyableTypes(types, 'community').map((t) => t.id)).toEqual(['y', 'l']);
    expect(applyableTypes(types, 'life')).toEqual([]);
  });
  it('has a plain-English line for every status', () => {
    for (const s of ['draft', 'awaiting_reference', 'reference_declined', 'awaiting_center', 'awaiting_ec', 'approved', 'rejected', 'expired', 'withdrawn', 'unknown']) {
      expect(en[applicationStatusKey(s)]).toBeTruthy();
    }
  });
});
