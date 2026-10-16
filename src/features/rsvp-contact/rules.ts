import type { StringKey } from '@/i18n';
import type { ContactPerson } from '@/lib/api/rsvp-contact';
import type { Tables } from '@/lib/database.types';
import { isValidEmail, toE164 } from '@/lib/format';

/**
 * RSVP without signing in: the rules the screens follow (connect-crm docs/RSVP_WITHOUT_LOGIN.md section 2). No screen here;
 * everything below is plain functions so a test can say what the visitor sees.
 */

type EventFields = Pick<Tables<'events'>, 'contact_rsvp' | 'is_paid' | 'confidential' | 'audience'>;

/**
 * Does the event offer "RSVP without signing in" to this visitor? Only to someone who is not signed in (a member keeps the
 * RSVP form, untouched), on an event whose own switch is "with a code" or "without a code" (the event row is readable by a
 * guest; the community's switch is not, so with it off the database answers "not available" and the screen says so), while the
 * RSVP window is open (`block` is `rsvpBlockReason`), and for a free event open to the public or to members and guests. The
 * database refuses everything else again.
 */
export function guestRsvpAvailable(args: { member: unknown; event: EventFields; block: string | null }): boolean {
  const { member, event, block } = args;
  if (member) return false;
  if (block) return false;
  if (event.contact_rsvp !== 'code' && event.contact_rsvp !== 'open') return false;
  if (event.is_paid || event.confidential) return false;
  return event.audience === 'public' || event.audience === 'members_and_guests';
}

export type ContactTab = 'phone' | 'email';

/** What was typed, as the database wants it: +15551234567 for a phone number, a lower-case address for an email. */
export function readContact(tab: ContactTab, typed: string): { ok: true; contact: string } | { ok: false; error: StringKey } {
  if (tab === 'email') return isValidEmail(typed) ? { ok: true, contact: typed.trim().toLowerCase() } : { ok: false, error: 'signin.emailInvalid' };
  const phone = toE164(typed);
  return phone ? { ok: true, contact: phone } : { ok: false, error: 'signin.phoneInvalid' };
}

/** The 6 digits of a code as typed ("482 917" is "482917"). */
export const CODE_LENGTH = 6;
export function readCode(typed: string): string | null {
  const digits = typed.replace(/\D/g, '');
  return digits.length === CODE_LENGTH ? digits : null;
}

/** "Send a new code" is allowed after 180 seconds (3 minutes), 3 codes at most (the database allows 3 an hour for one phone or email). */
export const RESEND_SECONDS = 180;
export const MAX_CODES = 3;

/** The first time the family is shown, everyone is ticked. */
export function allPicked(members: ContactPerson[]): Record<number, boolean> {
  return Object.fromEntries(members.map((m) => [m.slot, true]));
}

/** The `slot` numbers ticked, in order. */
export function pickedSlots(members: ContactPerson[], picked: Record<number, boolean>): number[] {
  return members.filter((m) => picked[m.slot]).map((m) => m.slot);
}

/** Of the people ticked, those marked as needing help getting around (never a slot that is not coming). */
export function assistSlots(members: ContactPerson[], picked: Record<number, boolean>, assist: Record<number, boolean>): number[] {
  return members.filter((m) => picked[m.slot] && assist[m.slot]).map((m) => m.slot);
}

/** The tag under a person's partly hidden name. */
export function personTagKey(m: ContactPerson): StringKey {
  if (m.kind === 'adult') return 'guestRsvp.adult';
  return m.under12 ? 'guestRsvp.childUnder12' : 'guestRsvp.child';
}

/** Does the event let a person be marked as needing help getting around? (the same flag the signed-in form reads) */
export function allowsAssistance(attendeeFlags: unknown): boolean {
  return Array.isArray(attendeeFlags) && attendeeFlags.includes('assistance');
}

/** Is there still time to undo? (`undoUntil` is the database's own 15 minutes; with none given, there is not.) */
export function canUndo(undoUntil: string | null, nowMs: number): boolean {
  if (!undoUntil) return false;
  const until = Date.parse(undoUntil);
  return Number.isFinite(until) && nowMs < until;
}

/** The tickets page can be opened with the visit's handle for 30 minutes after saving (a minute is left out so it never opens on a timed-out page). */
export const TICKETS_MINUTES = 29;
export function canSeeTickets(savedAtMs: number, nowMs: number): boolean {
  return nowMs >= savedAtMs && nowMs < savedAtMs + TICKETS_MINUTES * 60_000;
}

/** "1:05" for the seconds left before a new code can be asked for. */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
