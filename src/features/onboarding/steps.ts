/**
 * The first-sign-in steps, in order. Step numbers are what the "Step n of N" bar shows. Address, "A little more
 * about you", special days and WhatsApp groups are for adults only: a child goes from "Your family" straight to
 * contact preferences, so the bar skips those numbers for them (it already did for the address and details steps).
 */
export const ONBOARDING_STEP_NUMBER = {
  about: 3,
  address: 4,
  details: 5,
  family: 6,
  planDays: 7,
  whatsapp: 8,
  contact: 9,
} as const;

export const ONBOARDING_STEPS = ONBOARDING_STEP_NUMBER.contact;

export type OnboardingRoute = '/plan-days' | '/whatsapp-groups' | '/contact';

/** Where "Your family" leads: special days for an adult, contact preferences for a child. */
export function stepAfterFamily(isAdult: boolean): OnboardingRoute {
  return isAdult ? '/plan-days' : '/contact';
}

/**
 * How the onboarding screens are running: 'off' (the app), 'on' (a real run, which saves) or 'preview' (the same
 * screens with every save and request skipped, started by hand from the Family tab in a sandbox community).
 */
export type OnboardingMode = 'off' | 'on' | 'preview';

/**
 * The mode when a login's member record has loaded: a login not yet linked to a person onboards for real, a linked
 * one does not. Never 'preview', so a preview left behind (signing out, switching community) cannot carry over
 * into a real new member's first sign-in.
 */
export function modeAfterMemberLoad(linked: boolean): OnboardingMode {
  return linked ? 'off' : 'on';
}
