import { describe, expect, it } from '@jest/globals';

import { AppError, toAppError } from '../errors';

describe('plain-English errors', () => {
  it('explains network failures', () => {
    const e = toAppError(new TypeError('Network request failed'), 'load your events');
    expect(e.userMessage).toBe("We couldn't load your events. Check your internet connection and try again.");
  });
  it('explains permission errors from RLS', () => {
    const e = toAppError({ message: 'new row violates row-level security policy for table "pledges"', code: '42501' }, 'save your pledge');
    expect(e.userMessage).toContain("You don't have permission to save your pledge");
    expect(e.detail).toContain('row-level security');
  });
  it('turns RPC business rules into sentences, with cents as dollars', () => {
    const e = toAppError({ message: 'pledge must be at least 77200', code: 'P0001' }, 'place your pledge');
    expect(e.userMessage).toBe('Pledge must be at least $772.');
    expect(toAppError({ message: 'this boli is not open for pledges', code: 'P0001' }, 'x').userMessage).toBe('This boli is not open for pledges.');
  });
  it('explains a wrong or expired sign-in code', () => {
    expect(toAppError({ message: 'Token has expired or is invalid', status: 403 }, 'check your code').userMessage).toMatch(/wrong or has expired/);
  });
  it('never leaks raw technical text as the member message', () => {
    const e = toAppError({ message: 'relation "app.foo" does not exist', code: '42P01' }, 'load your family');
    expect(e.userMessage).toBe('Something went wrong while trying to load your family. Please try again.');
  });
  it('passes AppErrors through untouched', () => {
    const original = new AppError('Please choose an amount.', 'validation');
    expect(toAppError(original, 'anything')).toBe(original);
  });
});
