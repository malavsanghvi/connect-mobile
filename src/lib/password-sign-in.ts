/**
 * Password sign-in, for the few accounts that have a password: the demo account
 * that testers and app reviewers use (owner, 2026-10-02). Members sign in with a
 * one-time code and have no password, so this opens nothing for them.
 * (Which mode the sign-in screen opens in, `signInMode`, lives in auth-config.ts with the mobile-number switch.)
 */

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
