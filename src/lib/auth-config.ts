import type { StringKey } from '../i18n/en';

/**
 * How a member can sign in or create an account: ONE switch (owner, 2026-10-08: "Hide mobile number based login /
 * account creation for now ... Let the login only be based on email").
 *
 * false (shipped): email only. The welcome screen offers "Continue with email", the sign-in screen asks for an email
 * address and sends a one-time code to it, and a link or route that asks for the mobile way (`?mode=phone`) opens the
 * email screen instead.
 * true: the mobile number is back everywhere, exactly as before (a second welcome button, the mobile sign-in screen).
 *
 * Nothing else changes with the switch. The code, the database and every backend function stay as they are, and a
 * mobile number is still collected as a contact detail on the profile and in onboarding (WhatsApp, reminders); only
 * signing in and creating an account with it is hidden. Every screen reads the switch through the helpers below, so
 * there is one place to look (and one test file, auth-config.test.ts, that fails if a new phone entry point appears).
 */
export const PHONE_SIGN_IN_ENABLED = false;

/** The ways to start signing in (what the sign-in screen's `mode` route parameter can ask for). */
export type SignInMode = 'email' | 'phone' | 'password';

/** The sign-in screen's mode from its route parameter; anything unknown is the email code, and so is the mobile way while it is hidden. */
export function signInMode(param: string | string[] | undefined, phoneEnabled: boolean = PHONE_SIGN_IN_ENABLED): SignInMode {
  const p = Array.isArray(param) ? param[0] : param;
  if (p === 'password') return 'password';
  return p === 'phone' && phoneEnabled ? 'phone' : 'email';
}

export type WelcomeChoice = { mode: 'email' | 'phone'; labelKey: 'welcome.email' | 'welcome.mobile'; tone: 'primary' | 'secondary' };

/** The sign-in buttons on the welcome screen, in order: email always, the mobile number only while it is switched on. */
export function welcomeSignInChoices(phoneEnabled: boolean = PHONE_SIGN_IN_ENABLED): WelcomeChoice[] {
  const email: WelcomeChoice = { mode: 'email', labelKey: 'welcome.email', tone: 'primary' };
  return phoneEnabled ? [email, { mode: 'phone', labelKey: 'welcome.mobile', tone: 'secondary' }] : [email];
}

/** One line above the address box when email is the only way in, so the screen says what will happen. Today's screen has none. */
export function signInIntroKey(phoneEnabled: boolean = PHONE_SIGN_IN_ENABLED): StringKey | null {
  return phoneEnabled ? null : 'signin.emailIntro';
}

/**
 * A note under "Send code" for someone who signed up with a mobile number and has no email on the login: that way in is
 * paused, so they are told to contact the office rather than left guessing. Null while the mobile way works.
 */
export function phoneOnlyNoticeKey(phoneEnabled: boolean = PHONE_SIGN_IN_ENABLED): StringKey | null {
  return phoneEnabled ? null : 'signin.phoneOnlyNotice';
}

/** What the app knows about a login (Supabase auth user): its email and its mobile number, either can be missing. */
export type LoginIdentity = { email?: string | null; phone?: string | null } | null | undefined;

/** A login made with a mobile number and nothing else: it has no email to sign in with once the mobile way is hidden. */
export function isPhoneOnlyAccount(user: LoginIdentity): boolean {
  return !!user && !String(user.email ?? '').trim() && !!String(user.phone ?? '').trim();
}

/** The sign-out confirmation: a phone-only login is warned that, with the mobile way paused, it may not get back in. */
export function signOutBodyKey(user: LoginIdentity, phoneEnabled: boolean = PHONE_SIGN_IN_ENABLED): 'settings.signOutBody' | 'settings.signOutBodyPhoneOnly' {
  return !phoneEnabled && isPhoneOnlyAccount(user) ? 'settings.signOutBodyPhoneOnly' : 'settings.signOutBody';
}

/** The Settings row that opens the contact details, described without the mobile number while it is not a way to sign in. */
export function securitySubKey(phoneEnabled: boolean = PHONE_SIGN_IN_ENABLED): 'settings.securitySub' | 'settings.securitySubEmail' {
  return phoneEnabled ? 'settings.securitySub' : 'settings.securitySubEmail';
}
