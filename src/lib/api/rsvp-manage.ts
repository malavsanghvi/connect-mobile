import { AppError, logError, report } from '../errors';
import { supabase } from '../supabase';

/**
 * The page behind the link in the confirmation email of an RSVP made without signing in (connect-crm docs/RSVP_WITHOUT_LOGIN.md,
 * migration 0822): see the event, the people (names partly hidden by the database) and their tickets, and cancel. The token in the link
 * is the key; no session is needed. Opening the page with the emailed token marks the RSVP verified (the database does that).
 *
 * `{ok: false, code}` is an answer (an expired link, too many tries, an event that is over); only a real fault is thrown, as an AppError.
 * The token is never logged.
 */

export type TicketPerson = {
  slot: number;
  /** Partly hidden by the database, for example "M***v S**h" or "Child 1". */
  label: string;
  kind: 'adult' | 'child';
  /** The attendee's own status: 'rsvpd', 'confirmed', 'cancelled', 'attended'... */
  status: string;
  checkedIn: boolean;
  /** The code behind the QR; null once the ticket is cancelled. */
  ticket: string | null;
};

export type RsvpPage = {
  ok: true;
  event: { name: string; startsAt: string | null; endsAt: string | null; venue: string | null };
  /** The RSVP's own status: 'rsvpd', 'confirmed', 'cancelled', 'attended'... */
  status: string;
  /** The event is still ahead, nobody has arrived and the RSVP is not cancelled. */
  canCancel: boolean;
  people: TicketPerson[];
};

export type LinkFailure = { ok: false; code: string; message: string };
export type ViewAnswer = RsvpPage | LinkFailure;
export type CancelAnswer = { ok: true; status: 'cancelled' } | LinkFailure;

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function failure(o: Record<string, unknown> | null, why: string): LinkFailure {
  if (!o || o.ok !== false) logError('the RSVP link', new Error(`an answer this app does not know: ${why}`));
  return { ok: false, code: text(o?.code) ?? 'unknown', message: text(o?.message) ?? '' };
}

function parsePeople(v: unknown): TicketPerson[] {
  if (!Array.isArray(v)) return [];
  const out: TicketPerson[] = [];
  for (const raw of v) {
    const o = asObject(raw);
    const label = text(o?.label);
    if (!o || typeof o.slot !== 'number' || !Number.isInteger(o.slot) || !label) continue;
    out.push({ slot: o.slot, label, kind: o.kind === 'child' ? 'child' : 'adult', status: text(o.status) ?? 'rsvpd', checkedIn: o.checked_in === true, ticket: text(o.ticket) });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

/** `rsvp_contact_view`. */
export function parseView(data: unknown): ViewAnswer {
  const o = asObject(data);
  if (!o || o.ok !== true) return failure(o, 'view');
  const event = asObject(o.event);
  const name = text(event?.name);
  const status = text(o.status);
  if (!event || !name || !status) return failure(null, 'an RSVP page without an event or a status');
  return {
    ok: true,
    event: { name, startsAt: text(event.starts_at), endsAt: text(event.ends_at), venue: text(event.venue) },
    status,
    canCancel: o.can_cancel === true,
    people: parsePeople(o.people),
  };
}

/** `rsvp_contact_cancel`. */
export function parseCancel(data: unknown): CancelAnswer {
  const o = asObject(data);
  if (!o || o.ok !== true) return failure(o, 'cancel');
  return { ok: true, status: 'cancelled' };
}

function settled(res: { data: unknown; error: unknown }, action: string): unknown {
  if (res.error) throw report(res.error, action);
  if (res.data === null || res.data === undefined) throw new AppError(`We couldn't ${action}. Please try again.`, `${action}: the server returned nothing`);
  return res.data;
}

/** The RSVP behind the emailed token: the event, the people with their tickets, and whether it can still be cancelled. */
export async function viewContactRsvp(token: string): Promise<ViewAnswer> {
  return parseView(settled(await supabase.rpc('rsvp_contact_view', { p_token: token }), 'load your RSVP'));
}

/** Cancel the RSVP: the places are let go and the tickets stop working. Needs the emailed token. */
export async function cancelContactRsvp(token: string): Promise<CancelAnswer> {
  return parseCancel(settled(await supabase.rpc('rsvp_contact_cancel', { p_token: token }), 'cancel your RSVP'));
}
