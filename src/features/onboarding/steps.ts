/**
 * The first-sign-in steps, in order. Address, "A little more about you", special days and WhatsApp groups are for
 * adults only: a child goes from "Your family" straight to contact preferences. WhatsApp groups are also passed over
 * when the Communications module is off. The header shows only a progress bar (no "Step n of N"), so the bar fills
 * in even steps along the path the person actually walks.
 */
export const ONBOARDING_ORDER = ['signIn', 'match', 'about', 'address', 'details', 'family', 'planDays', 'whatsapp', 'contact'] as const;

export type OnboardingStep = (typeof ONBOARDING_ORDER)[number];

const ADULT_ONLY: readonly OnboardingStep[] = ['address', 'details', 'planDays', 'whatsapp'];

/** Sign-in and "Is this your family?" are walked before the app knows who is signing up (adult or child). */
const BEFORE_KNOWN = ONBOARDING_ORDER.indexOf('about');

/** Who is walking the steps. `isAdult` is null until the login is linked to a person (sign-in, family match). */
export type OnboardingWalker = {
  isAdult: boolean | null;
  commsOn: boolean;
  /** The kind of organization has special days, so "Plan special days" is a step (default: yes, as in a Jain Center). */
  specialDays?: boolean;
};

/** The steps this person walks, in order. Until their age is known, the adult path (the longest). */
export function onboardingPath(who: OnboardingWalker): OnboardingStep[] {
  return ONBOARDING_ORDER.filter(
    (s) => !(who.isAdult === false && ADULT_ONLY.includes(s)) && !(s === 'whatsapp' && !who.commsOn) && !(s === 'planDays' && who.specialDays === false),
  );
}

/**
 * How full the progress bar is on `step` (0–1; the last step is 1). Sign-in and family match always take their share
 * of the longest path, since nobody knows yet whether a child is signing up; the steps after them share the rest
 * evenly, so a child's shorter path fills the bar in even steps too and never moves it backwards. A step the person
 * does not walk (a screen that sends them straight on) shows where the previous step left the bar.
 */
export function onboardingProgress(step: OnboardingStep, who: OnboardingWalker): number {
  const longest = onboardingPath({ isAdult: true, commsOn: who.commsOn });
  const path = onboardingPath(who);
  const at = path.indexOf(step);
  if (at < 0) {
    const before = path.filter((s) => ONBOARDING_ORDER.indexOf(s) < ONBOARDING_ORDER.indexOf(step));
    return before.length ? onboardingProgress(before[before.length - 1], who) : 0;
  }
  if (at < BEFORE_KNOWN) return (at + 1) / longest.length;
  // B/L for the first steps, then the remaining (L-B)/L in (P-B) equal parts — as one fraction, so the last step is exactly 1.
  const [b, l, rest] = [BEFORE_KNOWN, longest.length, path.length - BEFORE_KNOWN];
  return (b * rest + (l - b) * (at + 1 - b)) / (l * rest);
}

export type OnboardingRoute = '/plan-days' | '/whatsapp-groups' | '/contact';

/**
 * Where "Your family" leads: special days for an adult (when the kind of organization has them, else the WhatsApp groups step,
 * which passes itself over when there is nothing to ask), contact preferences for a child.
 */
export function stepAfterFamily(isAdult: boolean, specialDays: boolean = true): OnboardingRoute {
  if (!isAdult) return '/contact';
  return specialDays ? '/plan-days' : '/whatsapp-groups';
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
