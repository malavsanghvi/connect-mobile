import { describe, expect, it } from '@jest/globals';

import { passwordErrorKey } from '../password-sign-in';

// signInMode (which screen a link opens) lives in auth-config.ts with the mobile-number switch; see auth-config.test.ts.

describe('passwordErrorKey', () => {
  it("names a wrong email or password without saying which part was wrong", () => {
    expect(passwordErrorKey('Invalid login credentials')).toBe('signin.passwordWrong');
  });
  it('names an account that was never confirmed', () => {
    expect(passwordErrorKey('Email not confirmed')).toBe('signin.passwordUnconfirmed');
  });
  it('leaves other errors to the normal error path', () => {
    expect(passwordErrorKey('Request rate limit reached')).toBeNull();
    expect(passwordErrorKey(undefined)).toBeNull();
  });
});
