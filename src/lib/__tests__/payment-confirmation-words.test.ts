import { describe, expect, it } from '@jest/globals';

import { en } from '@/i18n/en';

/**
 * Owner rule (2026-10-16): a member never reads "proof". What they send after paying outside the app is a "payment confirmation"
 * ("Proof feels like we do not trust the person"). Keys and code names keep their old spelling; only the words a member reads change.
 */
describe('payment confirmation words', () => {
  const entries = Object.entries(en) as [string, string][];

  it('never says proof or proofs in anything a member reads', () => {
    const offending = entries.filter(([, value]) => /\bproofs?\b/i.test(value)).map(([key]) => key);
    expect(offending).toEqual([]);
  });

  it('keeps the words the owner named', () => {
    expect(en['proof.stepProof']).toBe('Add your confirmation');
    expect(en['pledges.myProofs']).toBe('My payment confirmations');
    expect(en['pledges.proofAttached']).toBe('Confirmation attached');
    expect(en['pledge.yourProof']).toBe('Your confirmation');
    expect(en['proof.send']).toBe('Send your confirmation');
    expect(en['proof.problem.files_required']).toContain('A confirmation is needed for this way of paying.');
  });

  it('keeps the new words plain: no exclamation marks, never "bid"', () => {
    const keys = Object.keys(en).filter((k) => /^(payconf.|proof.amountLockedPledge)/.test(k)) as (keyof typeof en)[];
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const k of keys) {
      expect(en[k]).not.toContain('!');
      expect(en[k].toLowerCase()).not.toMatch(/bid/);
    }
  });

  it('says the same two words for the way to pay on every screen: "I paid another way"', () => {
    expect(en['pledges.paidAnotherWay']).toBe('I paid another way');
    expect(en['proof.title']).toBe('I paid another way');
  });
});
