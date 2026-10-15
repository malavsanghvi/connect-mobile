/**
 * The page behind the link in the confirmation email of an RSVP made without signing in (connect-crm docs/RSVP_WITHOUT_LOGIN.md):
 * https://<member app>/rsvp/<token>. The token is a secret: whoever has the link can see the tickets and cancel the RSVP.
 */

/** Is this route the page behind such a link? */
export function isRsvpLinkPath(pathname: string | null | undefined): boolean {
  return /^\/rsvp(\/|$)/.test(pathname ?? '');
}

/**
 * The screen name that goes into the audit trail (the x-client-screen header of every request): the route, never the token in it.
 * Every other path is returned as it is.
 */
export function auditScreenName(pathname: string): string {
  return isRsvpLinkPath(pathname) ? '/rsvp/[token]' : pathname;
}

/** A token as the database makes them: 32 characters of letters, digits, - and _ (anything else cannot be one, so no call is made). */
export function isRsvpToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32}$/.test(token);
}
