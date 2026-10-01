import { describe, expect, it } from '@jest/globals';

import { canPlanLabh } from '../special-days';

const base = { givingOn: true, isAdult: true, occasion: 'birthday' as const, labhPromptEnabled: true };

describe('canPlanLabh', () => {
  it('is offered on a birthday, anniversary, birth tithi and other day however far off (no date input at all)', () => {
    for (const occasion of ['birthday', 'anniversary', 'birth_tithi', 'other', 'diksha'] as const) {
      expect(canPlanLabh({ ...base, occasion })).toBe(true);
    }
  });

  it('is not offered for a punyatithi', () => {
    expect(canPlanLabh({ ...base, occasion: 'punyatithi' })).toBe(false);
  });

  it('is not offered when the family switched the prompt off for that day', () => {
    expect(canPlanLabh({ ...base, labhPromptEnabled: false })).toBe(false);
  });

  it('is not offered to children or when the giving module is off', () => {
    expect(canPlanLabh({ ...base, isAdult: false })).toBe(false);
    expect(canPlanLabh({ ...base, givingOn: false })).toBe(false);
  });
});
