import { describe, expect, it } from '@jest/globals';

import { confirmationTarget, isLockedTarget } from '@/features/pay/confirm-target';

describe('confirmationTarget', () => {
  it('binds one pledge to the place it came from, with the amount locked', () => {
    const target = confirmationTarget({ kind: 'opportunity', refId: 'opp1', pledgeIds: ['p1'], title: 'Diwali sponsorship' });
    expect(target).toEqual({ entry: 'opportunity', entryRef: 'opp1', pledgeIds: ['p1'], title: 'Diwali sponsorship' });
    expect(isLockedTarget(target)).toBe(true);
  });

  it('does the same for a labh and a Pathshala fee', () => {
    expect(confirmationTarget({ kind: 'labh', refId: 'day1', pledgeIds: ['p1'], title: 'Riya turns 8' })).toMatchObject({ entry: 'labh', entryRef: 'day1' });
    expect(confirmationTarget({ kind: 'pathshala_fee', refId: 'reg1', pledgeIds: ['p1'], title: 'Pathshala fee' })).toMatchObject({ entry: 'pathshala_fee', entryRef: 'reg1' });
  });

  it('goes the way of Open pledges when a checkout saved several pledges: the database takes one pledge per checkout confirmation', () => {
    const target = confirmationTarget({ kind: 'labh', refId: 'day1', pledgeIds: ['p1', 'p2'], title: 'Riya turns 8' });
    expect(target).toEqual({ entry: 'open_pledges', entryRef: null, pledgeIds: ['p1', 'p2'], title: 'Riya turns 8' });
    expect(isLockedTarget(target)).toBe(false);
  });

  it('counts a pledge once however often it is listed', () => {
    expect(confirmationTarget({ kind: 'opportunity', refId: 'opp1', pledgeIds: ['p1', 'p1'], title: 'x' })).toMatchObject({ entry: 'opportunity', pledgeIds: ['p1'] });
  });

  it('keeps a missing reference as null, never as the string "undefined"', () => {
    expect(confirmationTarget({ kind: 'pathshala_fee', refId: null, pledgeIds: ['p1'], title: 'x' }).entryRef).toBeNull();
  });
});
