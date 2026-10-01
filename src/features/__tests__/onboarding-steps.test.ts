import { describe, expect, it } from '@jest/globals';

import { modeAfterMemberLoad, ONBOARDING_STEP_NUMBER, ONBOARDING_STEPS, stepAfterFamily } from '../onboarding/steps';

describe('onboarding steps', () => {
  it('sends an adult from "Your family" to special days, and a child straight to contact preferences', () => {
    expect(stepAfterFamily(true)).toBe('/plan-days');
    expect(stepAfterFamily(false)).toBe('/contact');
  });

  it('numbers the steps in order, with special days then WhatsApp groups before the last step', () => {
    const order = [ONBOARDING_STEP_NUMBER.about, ONBOARDING_STEP_NUMBER.address, ONBOARDING_STEP_NUMBER.details, ONBOARDING_STEP_NUMBER.family, ONBOARDING_STEP_NUMBER.planDays, ONBOARDING_STEP_NUMBER.whatsapp, ONBOARDING_STEP_NUMBER.contact];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
    expect(ONBOARDING_STEP_NUMBER.planDays).toBe(ONBOARDING_STEP_NUMBER.family + 1);
    expect(ONBOARDING_STEP_NUMBER.whatsapp).toBe(ONBOARDING_STEP_NUMBER.planDays + 1);
  });

  it('shows the last step as "n of n"', () => {
    expect(ONBOARDING_STEPS).toBe(ONBOARDING_STEP_NUMBER.contact);
  });

  it('starts a real onboarding only for a login not yet linked to a person, and never carries a preview over', () => {
    expect(modeAfterMemberLoad(false)).toBe('on');
    expect(modeAfterMemberLoad(true)).toBe('off');
  });
});
