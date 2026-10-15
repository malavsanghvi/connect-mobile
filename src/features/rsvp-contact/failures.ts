import type { StringKey, Translate } from '@/i18n';
import type { ContactFailure } from '@/lib/api/rsvp-contact';

/**
 * What the visitor reads and can do next when the database says no (connect-crm docs/RSVP_WITHOUT_LOGIN.md section 2, "Not
 * signed in: what is read, and the next step"). A refusal is `{ok: false, code}`; every code has its own sentence in every
 * language, and a code this app does not know says the database's own sentence (or a plain "try again").
 *
 * None of the sentences says whether a phone number or an email is on a family record in an event that asks for a code:
 * the database answers the same for every contact until the code is typed, and so does the screen.
 */

export type Stage = 'find' | 'code' | 'choose' | 'saving' | 'done' | 'failed';

/** What a button under the sentence does. */
export type FailureAction = 'signIn' | 'join' | 'startAgain' | 'back' | 'useEmail';

export type FailureSpec = {
  key: StringKey;
  tone: 'warning' | 'info' | 'error';
  actions: FailureAction[];
  /** The stages where the visitor can put it right where they are (a wrong number, a wrong code): the sentence shows there. */
  fixableOn: readonly Stage[];
};

const SPECS: Record<string, FailureSpec> = {
  bad_contact: { key: 'guestRsvp.err.bad_contact', tone: 'warning', actions: [], fixableOn: ['find'] },
  not_found: { key: 'guestRsvp.err.not_found', tone: 'warning', actions: ['signIn', 'join'], fixableOn: ['find'] },
  ambiguous: { key: 'guestRsvp.err.ambiguous', tone: 'warning', actions: ['signIn'], fixableOn: ['find'] },
  already_rsvpd: { key: 'guestRsvp.err.already_rsvpd', tone: 'info', actions: ['signIn'], fixableOn: [] },
  no_email: { key: 'guestRsvp.err.no_email', tone: 'warning', actions: ['signIn'], fixableOn: [] },
  cannot_send: { key: 'guestRsvp.err.cannot_send', tone: 'warning', actions: ['signIn'], fixableOn: [] },
  full: { key: 'guestRsvp.err.full', tone: 'warning', actions: ['back'], fixableOn: [] },
  quota: { key: 'guestRsvp.err.quota', tone: 'warning', actions: ['signIn'], fixableOn: [] },
  closed: { key: 'guestRsvp.err.closed', tone: 'info', actions: ['back'], fixableOn: [] },
  demo: { key: 'guestRsvp.err.demo', tone: 'info', actions: ['back'], fixableOn: [] },
  unavailable: { key: 'guestRsvp.err.unavailable', tone: 'info', actions: ['signIn'], fixableOn: [] },
  rate_limited: { key: 'guestRsvp.err.rate_limited', tone: 'warning', actions: ['signIn'], fixableOn: [] },
  expired: { key: 'guestRsvp.err.expired', tone: 'info', actions: ['startAgain'], fixableOn: [] },
  used: { key: 'guestRsvp.err.used', tone: 'info', actions: ['back'], fixableOn: [] },
  bad_selection: { key: 'guestRsvp.selectOne', tone: 'warning', actions: [], fixableOn: ['choose'] },
  too_late: { key: 'guestRsvp.err.too_late', tone: 'warning', actions: ['back'], fixableOn: [] },
  bad_code: { key: 'guestRsvp.err.bad_code', tone: 'warning', actions: [], fixableOn: ['code'] },
  locked: { key: 'guestRsvp.err.locked', tone: 'warning', actions: ['signIn', 'useEmail'], fixableOn: [] },
  use_email: { key: 'guestRsvp.err.use_email', tone: 'info', actions: ['useEmail'], fixableOn: ['find', 'code'] },
};

/** A code this app has no words for: the database's own sentence when it gave one. */
const UNKNOWN: FailureSpec = { key: 'guestRsvp.err.unknown', tone: 'error', actions: ['startAgain'], fixableOn: [] };

export function specFor(code: string): FailureSpec {
  return SPECS[code] ?? UNKNOWN;
}

/** Where a refusal leaves the visitor: where they are when they can put it right there, back at the start when the page
 *  timed out, otherwise on a screen of its own that says what happened and what to do. */
export function stageAfter(failure: Pick<ContactFailure, 'code'>, from: Stage): Stage {
  if (failure.code === 'expired') return 'find';
  return specFor(failure.code).fixableOn.includes(from) ? from : 'failed';
}

/** The sentence, in the visitor's language. */
export function failureText(t: Translate, failure: ContactFailure, eventName: string): string {
  if (failure.code === 'bad_code' && failure.triesLeft !== null) {
    return failure.triesLeft === 1 ? t('guestRsvp.err.bad_code_one') : t('guestRsvp.err.bad_code_n', { n: failure.triesLeft });
  }
  if (!(failure.code in SPECS) && failure.message) return failure.message;
  return t(specFor(failure.code).key, { event: eventName });
}
