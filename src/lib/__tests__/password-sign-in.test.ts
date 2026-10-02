import { describe, expect, it } from '@jest/globals';

import { passwordErrorKey, signInMode } from '../password-sign-in';

describe('signInMode', () => {
  it('reads phone and password, and treats anything else as the email code', () => {
    expect(signInMode('phone')).toBe('phone');
    expect(signInMode('password')).toBe('password');
    expect(signInMode('email')).toBe('email');
    expect(signInMode(undefined)).toBe('email');
    expect(signInMode('admin')).toBe('email');
    expect(signInMode(['password', 'phone'])).toBe('password');
  });
});

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
