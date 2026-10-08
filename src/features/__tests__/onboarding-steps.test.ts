import { describe, expect, it } from '@jest/globals';

import { modeAfterMemberLoad, ONBOARDING_ORDER, onboardingPath, onboardingProgress, stepAfterFamily, type OnboardingWalker } from '../onboarding/steps';

const adult: OnboardingWalker = { isAdult: true, commsOn: true };
const child: OnboardingWalker = { isAdult: false, commsOn: true };
const unknown: OnboardingWalker = { isAdult: null, commsOn: true };

const bar = (who: OnboardingWalker) => onboardingPath(who).map((s) => onboardingProgress(s, who));
const pct = (who: OnboardingWalker) => bar(who).map((v) => Math.round(v * 100));

describe('onboarding steps', () => {
  it('sends an adult from "Your family" to special days, and a child straight to contact preferences', () => {
    expect(stepAfterFamily(true)).toBe('/plan-days');
    expect(stepAfterFamily(false)).toBe('/contact');
  });

  it('orders the steps with special days then WhatsApp groups before the last step', () => {
    expect(ONBOARDING_ORDER.indexOf('planDays')).toBe(ONBOARDING_ORDER.indexOf('family') + 1);
    expect(ONBOARDING_ORDER.indexOf('whatsapp')).toBe(ONBOARDING_ORDER.indexOf('planDays') + 1);
    expect(ONBOARDING_ORDER[ONBOARDING_ORDER.length - 1]).toBe('contact');
  });

  it('walks a child past the adult-only steps, and everyone past WhatsApp groups when Communications is off', () => {
    expect(onboardingPath(adult)).toEqual([...ONBOARDING_ORDER]);
    expect(onboardingPath(child)).toEqual(['signIn', 'match', 'about', 'family', 'contact']);
    expect(onboardingPath({ isAdult: true, commsOn: false })).not.toContain('whatsapp');
    // Until the family is matched nobody knows the age: the longest path.
    expect(onboardingPath(unknown)).toEqual(onboardingPath(adult));
  });

  it('fills the bar in even steps for an adult, ending full on the last step', () => {
    expect(pct(adult)).toEqual([11, 22, 33, 44, 56, 67, 78, 89, 100]);
    expect(pct({ isAdult: true, commsOn: false })).toEqual([13, 25, 38, 50, 63, 75, 88, 100]);
  });

  it('fills the bar smoothly for a child: even steps after the family match, never backwards', () => {
    // Sign-in and family match look the same for everyone (the age is not known yet).
    expect(onboardingProgress('signIn', unknown)).toBe(onboardingProgress('signIn', adult));
    expect(onboardingProgress('match', unknown)).toBe(onboardingProgress('match', child));
    expect(pct(child)).toEqual([11, 22, 48, 74, 100]);
    // From the family match on: about → family → contact in equal steps.
    const v = bar(child);
    const gaps = v.slice(2).map((x, i) => x - v[i + 1]);
    expect(gaps).toHaveLength(3);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-9);
  });

  it('only ever moves forward, for every kind of walker', () => {
    for (const who of [adult, child, unknown, { isAdult: true, commsOn: false }, { isAdult: false, commsOn: false }]) {
      const v = bar(who);
      v.slice(1).forEach((x, i) => expect(x).toBeGreaterThan(v[i]));
      expect(v[v.length - 1]).toBe(1);
    }
  });

  it('keeps the bar where the previous step left it on a screen the person passes straight through', () => {
    expect(onboardingProgress('whatsapp', { isAdult: true, commsOn: false })).toBe(onboardingProgress('planDays', { isAdult: true, commsOn: false }));
    expect(onboardingProgress('address', child)).toBe(onboardingProgress('about', child));
  });

  it('starts a real onboarding only for a login not yet linked to a person, and never carries a preview over', () => {
    expect(modeAfterMemberLoad(false)).toBe('on');
    expect(modeAfterMemberLoad(true)).toBe('off');
  });
});

describe('onboarding steps for a kind of organization with no special days', () => {
  it('leaves "Plan special days" out, and keeps everything else', () => {
    const chamber: OnboardingWalker = { isAdult: true, commsOn: true, specialDays: false };
    expect(onboardingPath(chamber)).toEqual(ONBOARDING_ORDER.filter((s) => s !== 'planDays'));
    expect(onboardingPath({ ...chamber, isAdult: false })).toEqual(['signIn', 'match', 'about', 'family', 'contact']);
  });

  it('is the same path as before when the kind has special days (or says nothing)', () => {
    expect(onboardingPath({ isAdult: true, commsOn: true, specialDays: true })).toEqual([...ONBOARDING_ORDER]);
    expect(onboardingPath(adult)).toEqual([...ONBOARDING_ORDER]);
  });

  it('still fills the bar in even steps, ending full on the last step', () => {
    const chamber: OnboardingWalker = { isAdult: true, commsOn: true, specialDays: false };
    const values = onboardingPath(chamber).map((s) => onboardingProgress(s, chamber));
    expect(values[values.length - 1]).toBe(1);
    expect(values.every((v, i) => i === 0 || v > values[i - 1])).toBe(true);
  });

  it('sends an adult from "Your family" past special days to the WhatsApp groups step', () => {
    expect(stepAfterFamily(true, false)).toBe('/whatsapp-groups');
    expect(stepAfterFamily(true, true)).toBe('/plan-days');
    expect(stepAfterFamily(false, false)).toBe('/contact');
  });
});
