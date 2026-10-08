import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import { en } from '../../i18n/en';
import {
  isPhoneOnlyAccount,
  PHONE_SIGN_IN_ENABLED,
  phoneOnlyNoticeKey,
  securitySubKey,
  signInIntroKey,
  signInMode,
  signOutBodyKey,
  welcomeSignInChoices,
} from '../auth-config';

// The words of signing in with a mobile number. A screen that is email-only must use none of them.
const PHONE_WORDS = /mobile|phone|\bsms\b|\btext\b/i;

describe('the mobile-number switch', () => {
  it('ships off: members sign in and create an account with an email only (owner, 2026-10-08)', () => {
    expect(PHONE_SIGN_IN_ENABLED).toBe(false);
  });
});

describe('signInMode', () => {
  it('reads password, and treats anything else as the email code', () => {
    for (const on of [false, true]) {
      expect(signInMode('password', on)).toBe('password');
      expect(signInMode('email', on)).toBe('email');
      expect(signInMode(undefined, on)).toBe('email');
      expect(signInMode('admin', on)).toBe('email');
      expect(signInMode(['password', 'phone'], on)).toBe('password');
    }
  });
  it('opens the email screen for a link that asks for the mobile way while it is hidden', () => {
    expect(signInMode('phone', false)).toBe('email');
    expect(signInMode(['phone'], false)).toBe('email');
    // As shipped (the switch is off) the default is the same.
    expect(signInMode('phone')).toBe('email');
  });
  it('opens the mobile screen again when the switch is on', () => {
    expect(signInMode('phone', true)).toBe('phone');
    expect(signInMode(['phone', 'email'], true)).toBe('phone');
  });
});

describe('the welcome screen buttons', () => {
  it('offers email alone while the mobile number is hidden: one button, nothing to divide', () => {
    expect(welcomeSignInChoices(false)).toEqual([{ mode: 'email', labelKey: 'welcome.email', tone: 'primary' }]);
    expect(welcomeSignInChoices()).toEqual(welcomeSignInChoices(false));
  });
  it('offers email then the mobile number again when the switch is on, as before', () => {
    expect(welcomeSignInChoices(true)).toEqual([
      { mode: 'email', labelKey: 'welcome.email', tone: 'primary' },
      { mode: 'phone', labelKey: 'welcome.mobile', tone: 'secondary' },
    ]);
  });
  it('every route a button opens is one the sign-in screen opens in that mode when the switch allows it', () => {
    for (const on of [false, true]) {
      for (const c of welcomeSignInChoices(on)) expect(signInMode(c.mode, on)).toBe(c.mode);
    }
  });
});

describe('the words on the email-only screens', () => {
  it('say nothing about a mobile number, a phone or texting', () => {
    const seen = [
      ...welcomeSignInChoices(false).map((c) => c.labelKey),
      'signin.title',
      'signin.emailLabel',
      'signin.emailInvalid',
      signInIntroKey(false),
      'signin.sendCode',
      'signin.havePassword',
      'signin.codeLabel',
      'signin.codeInvalid',
      'signin.resendIn',
      'signin.didntGet',
      'signin.resend',
      'signin.verify',
      'signin.useBiometric',
      'signin.passwordTitle',
      'signin.passwordIntro',
      'signin.passwordWrong',
      'signin.passwordUnconfirmed',
      'signin.useCodeInstead',
      'welcome.withoutSigningIn',
      securitySubKey(false),
      signOutBodyKey({ email: 'a@b.co' }, false),
    ];
    for (const key of seen) {
      expect(key).not.toBeNull();
      expect({ key, text: en[key as keyof typeof en] }).toEqual({ key, text: expect.not.stringMatching(PHONE_WORDS) });
    }
  });
  it('says what happens on the sign-in screen: a code is sent to the email address', () => {
    expect(en['signin.emailIntro']).toMatch(/email address/i);
    expect(en['signin.emailIntro']).toMatch(/sign-in code/i);
  });
  it("keeps today's screens unchanged when the switch is on: no extra line, no notice, the old Security words", () => {
    expect(signInIntroKey(true)).toBeNull();
    expect(phoneOnlyNoticeKey(true)).toBeNull();
    expect(securitySubKey(true)).toBe('settings.securitySub');
    expect(en['settings.securitySub']).toBe('Email one-time code, change email or mobile');
    expect(en['welcome.mobile']).toBe('Continue with mobile number');
    expect(en['signin.phoneLabel']).toBe('Mobile number');
  });
});

describe('someone who signed up with a mobile number only', () => {
  const phoneOnly = { email: null, phone: '+17135550142' };
  it('is a login with a mobile number and no email', () => {
    expect(isPhoneOnlyAccount(phoneOnly)).toBe(true);
    expect(isPhoneOnlyAccount({ email: '', phone: '+17135550142' })).toBe(true);
    expect(isPhoneOnlyAccount({ phone: '17135550142' })).toBe(true);
  });
  it('is not a login that has an email (with or without a mobile number), or one with neither', () => {
    expect(isPhoneOnlyAccount({ email: 'a@b.co', phone: null })).toBe(false);
    expect(isPhoneOnlyAccount({ email: 'a@b.co', phone: '+17135550142' })).toBe(false);
    expect(isPhoneOnlyAccount({ email: null, phone: null })).toBe(false);
    expect(isPhoneOnlyAccount({ email: ' ', phone: ' ' })).toBe(false);
    expect(isPhoneOnlyAccount(null)).toBe(false);
    expect(isPhoneOnlyAccount(undefined)).toBe(false);
  });
  it('is told on the sign-in screen, while the mobile way is paused, to contact the office', () => {
    expect(phoneOnlyNoticeKey(false)).toBe('signin.phoneOnlyNotice');
    expect(en['signin.phoneOnlyNotice']).toMatch(/paused/i);
    expect(en['signin.phoneOnlyNotice']).toMatch(/contact the office/i);
  });
  it('is warned before signing out that they may not get back in, only while the mobile way is paused', () => {
    expect(signOutBodyKey(phoneOnly, false)).toBe('settings.signOutBodyPhoneOnly');
    expect(en['settings.signOutBodyPhoneOnly']).toMatch(/may not be able to get back in/i);
    expect(en['settings.signOutBodyPhoneOnly']).toMatch(/contact the office/i);
    expect(signOutBodyKey(phoneOnly, true)).toBe('settings.signOutBody');
  });
  it("leaves everyone else's sign-out confirmation as it was", () => {
    expect(signOutBodyKey({ email: 'a@b.co', phone: null }, false)).toBe('settings.signOutBody');
    expect(signOutBodyKey({ email: 'a@b.co', phone: '+17135550142' }, false)).toBe('settings.signOutBody');
    expect(signOutBodyKey(null, false)).toBe('settings.signOutBody');
  });
});

// A guard against a new way in with a mobile number appearing next to the switch: the only code that talks to the
// one-time-code sign-in is the sign-in screen, whose mode comes from signInMode, and the only place that names the
// mobile route is auth-config.ts (which the welcome screen reads through welcomeSignInChoices).
describe('the mobile way in has one door', () => {
  const src = path.join(__dirname, '..', '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
    }
  };
  walk(src);
  const rel = (f: string) => path.relative(src, f).split(path.sep).join('/');
  const read = (r: string) => fs.readFileSync(path.join(src, r), 'utf8');
  const filesWith = (re: RegExp) => files.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map(rel).sort();

  it('sends and checks sign-in codes in the sign-in screen only', () => {
    expect(filesWith(/signInWithOtp|verifyOtp|auth\.signUp|signInWithOAuth/)).toEqual(['app/(auth)/sign-in.tsx']);
  });
  it('names the mobile sign-in route in auth-config.ts only', () => {
    expect(filesWith(/mode: 'phone'|mode=phone|mode: "phone"/)).toEqual(['lib/auth-config.ts']);
  });
  it('lets the sign-in screen read its mode only through signInMode, and the welcome screen its buttons only through the switch', () => {
    const signIn = read('app/(auth)/sign-in.tsx');
    expect(signIn).toContain('signInMode(params.mode)');
    expect(signIn).not.toMatch(/params\.mode\s*===\s*'phone'/);
    const welcome = read('app/(auth)/welcome.tsx');
    expect(welcome).toContain('welcomeSignInChoices()');
    expect(welcome).not.toContain('welcome.mobile');
  });
});
