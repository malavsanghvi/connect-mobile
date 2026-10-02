/**
 * Password sign-in, for the few accounts that have a password: the demo account
 * that testers and app reviewers use (owner, 2026-10-02). Members sign in with a
 * one-time code and have no password, so this opens nothing for them.
 */

export type SignInMode = 'email' | 'phone' | 'password';

/** The sign-in screen's mode from its route param; anything unknown is the email code. */
export function signInMode(param: string | string[] | undefined): SignInMode {
  const p = Array.isArray(param) ? param[0] : param;
  return p === 'phone' || p === 'password' ? p : 'email';
}

/**
 * What to tell the member when Supabase refuses the password, or null when the
 * error is something else (shown through the normal error path). Supabase answers
 * a wrong email or password with "Invalid login credentials" and an unconfirmed
 * account with "Email not confirmed"; it never says which part was wrong.
 */
export function passwordErrorKey(message: string | null | undefined): 'signin.passwordWrong' | 'signin.passwordUnconfirmed' | null {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'signin.passwordWrong';
  if (m.includes('email not confirmed')) return 'signin.passwordUnconfirmed';
  return null;
}
