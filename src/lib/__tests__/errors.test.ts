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
  it('shows the plain sentence of a check violation raised by one of our own triggers', () => {
    const e = toAppError({ message: 'The wedding anniversary cannot be in the future.', code: '23514' }, 'save these details');
    expect(e.userMessage).toBe('The wedding anniversary cannot be in the future.');
    expect(e.code).toBe('23514');
  });
  it('keeps Postgres\' own check failures generic', () => {
    const e = toAppError({ message: 'new row for relation "person_profile_details" violates check constraint "person_profile_details_ec_pair"', code: '23514' }, 'save these details');
    expect(e.userMessage).toBe("We couldn't save these details — one of the values isn't valid. Please check and try again.");
    expect(e.detail).toContain('violates check constraint');
  });
  it('shows the plain sentence of a refusal raised by one of our own RPCs (42501)', () => {
    const e = toAppError({ message: 'You are not a member of this community.', code: '42501' }, 'save your question for Niva');
    expect(e.userMessage).toBe('You are not a member of this community.');
    expect(e.code).toBe('42501');
    const off = toAppError({ message: 'The Niva module is switched off for this community.', code: '42501', hint: 'An administrator can switch it on in Settings › Modules.' }, 'save your question for Niva');
    expect(off.userMessage).toBe('The Niva module is switched off for this community.');
  });
  it("keeps Postgres' own permission failures generic", () => {
    expect(toAppError({ message: 'permission denied for table niva_conversations', code: '42501' }, 'load your Niva questions').userMessage).toContain("You don't have permission to load your Niva questions");
    expect(toAppError({ message: 'Permission denied for table x.', code: '42501' }, 'load this').userMessage).toContain("You don't have permission to load this");
  });
  it('passes AppErrors through untouched', () => {
    const original = new AppError('Please choose an amount.', 'validation');
    expect(toAppError(original, 'anything')).toBe(original);
  });
});
