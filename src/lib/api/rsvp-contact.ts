import { AppError, logError, report } from '../errors';
import { supabase } from '../supabase';

/**
 * RSVP without signing in (connect-crm docs/RSVP_WITHOUT_LOGIN.md, migrations 0822-0824). A visitor who is not signed in
 * types a mobile number or an email address of their family, sees the family with partly hidden names, and RSVPs. The
 * database does all of the work; these are the calls, and what they answer. Everything is `supabase.rpc(name, args)`
 * on the anon client; the answers are `{ok: true, ...}` or `{ok: false, code, message}`.
 *
 * What comes back never holds an id, a real name, a real phone number or a real email address: the people are a number
 * (`slot`) and a label such as "M***v S**h", the contacts are masked, and the `handle` is a one-use key good for 30 minutes.
 * The app sends no other identifier back, keeps none, and logs no contact: only the code of a refusal.
 *
 * A business outcome ("not found", "full", "wrong code") comes back as `{ok: false, code}` and the screen says it in its own
 * words (src/features/rsvp-contact/failures.ts). Only a real fault (the network, the server) is thrown, as an AppError.
 */

export type ContactPerson = { slot: number; label: string; kind: 'adult' | 'child'; under12: boolean };
export type MaskedContacts = { email: string | null; phone: string | null };

export type ContactFailure = {
  ok: false;
  /** What the database said ('not_found', 'full', 'bad_code' ...), or 'unknown' for an answer this app does not know. */
  code: string;
  /** The database's own sentence, kept as the fallback for a code this app has no words for. */
  message: string;
  /** Only for 'bad_code': how many wrong codes are left before the lock. */
  triesLeft: number | null;
};

/** The family, with partly hidden names, and where the confirmation will go. */
export type FamilyChoice = {
  ok: true;
  step: 'choose';
  handle: string;
  expiresIn: number;
  members: ContactPerson[];
  sendTo: MaskedContacts;
};

/** A 6-digit code was sent (for an event that asks for one); nothing about the family is told yet. */
export type CodeStep = { ok: true; step: 'code'; handle: string; expiresIn: number };

export type LookupAnswer = FamilyChoice | CodeStep | ContactFailure;
export type VerifyAnswer = FamilyChoice | ContactFailure;
export type SubmitAnswer = { ok: true; status: 'rsvpd'; count: number; sendTo: MaskedContacts; undoUntil: string | null } | ContactFailure;
export type UndoAnswer = { ok: true; status: 'cancelled' } | ContactFailure;

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function whole(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

function failure(o: Record<string, unknown> | null, why: string): ContactFailure {
  if (!o || o.ok !== false) logError('RSVP without signing in', new Error(`an answer this app does not know: ${why}`));
  return { ok: false, code: text(o?.code) ?? 'unknown', message: text(o?.message) ?? '', triesLeft: whole(o?.tries_left) };
}

function parseMembers(v: unknown): ContactPerson[] {
  if (!Array.isArray(v)) return [];
  const out: ContactPerson[] = [];
  for (const raw of v) {
    const o = asObject(raw);
    const slot = whole(o?.slot);
    const label = text(o?.label);
    if (!o || slot === null || !label) continue;
    out.push({ slot, label, kind: o.kind === 'child' ? 'child' : 'adult', under12: o.under_12 === true });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

function parseContacts(v: unknown): MaskedContacts {
  const o = asObject(v);
  return { email: text(o?.email), phone: text(o?.phone) };
}

function parseChoose(o: Record<string, unknown>): FamilyChoice | ContactFailure {
  const handle = text(o.handle);
  const members = parseMembers(o.members);
  if (!handle || members.length === 0) return failure(null, 'a family answer without a handle or people');
  return { ok: true, step: 'choose', handle, expiresIn: whole(o.expires_in) ?? 1800, members, sendTo: parseContacts(o.send_to) };
}

/** `rsvp_contact_lookup`: the answer to a typed phone number or email, as the app reads it. */
export function parseLookup(data: unknown): LookupAnswer {
  const o = asObject(data);
  if (!o || o.ok !== true) return failure(o, 'lookup');
  if (o.step === 'code') {
    const handle = text(o.handle);
    return handle ? { ok: true, step: 'code', handle, expiresIn: whole(o.expires_in) ?? 600 } : failure(null, 'a code step without a handle');
  }
  return parseChoose(o);
}

/** `rsvp_contact_verify`: the right code gives the family, as the lookup of an event without a code does. */
export function parseVerify(data: unknown): VerifyAnswer {
  const o = asObject(data);
  if (!o || o.ok !== true) return failure(o, 'verify');
  return parseChoose(o);
}

/** `rsvp_contact_submit`. */
export function parseSubmit(data: unknown): SubmitAnswer {
  const o = asObject(data);
  if (!o || o.ok !== true) return failure(o, 'submit');
  const count = whole(o.count);
  if (o.status !== 'rsvpd' || count === null) return failure(null, 'a saved RSVP without a count');
  return { ok: true, status: 'rsvpd', count, sendTo: parseContacts(o.send_to), undoUntil: text(o.undo_until) };
}

/** `rsvp_contact_undo`. */
export function parseUndo(data: unknown): UndoAnswer {
  const o = asObject(data);
  if (!o || o.ok !== true) return failure(o, 'undo');
  return { ok: true, status: 'cancelled' };
}

/** Anything the call itself could not do (no network, a server fault) is thrown for the screen to show with a retry. */
function settled(res: { data: unknown; error: unknown }, action: string): unknown {
  if (res.error) throw report(res.error, action);
  if (res.data === null || res.data === undefined) {
    throw new AppError(`We couldn't ${action}. Please try again.`, `${action}: the server returned nothing`);
  }
  return res.data;
}

/** Step 1: the family behind a phone number (+15551234567) or an email address, for this event. */
export async function lookupFamily(eventId: string, contact: string): Promise<LookupAnswer> {
  return parseLookup(settled(await supabase.rpc('rsvp_contact_lookup', { p_event: eventId, p_contact: contact }), 'look up your family'));
}

/** Step 2, for an event that asks for a code: the 6 digits that were sent. */
export async function verifyContactCode(handle: string, code: string): Promise<VerifyAnswer> {
  return parseVerify(settled(await supabase.rpc('rsvp_contact_verify', { p_handle: handle, p_code: code }), 'check your code'));
}

/** Step 3: the people who are coming (their `slot` numbers) and, of those, who needs help getting around. */
export async function submitContactRsvp(handle: string, slots: number[], assist: number[]): Promise<SubmitAnswer> {
  return parseSubmit(settled(await supabase.rpc('rsvp_contact_submit', { p_handle: handle, p_slots: slots, p_assist: assist }), 'save your RSVP'));
}

/** Within 15 minutes of saving: take the RSVP back. */
export async function undoContactRsvp(handle: string): Promise<UndoAnswer> {
  return parseUndo(settled(await supabase.rpc('rsvp_contact_undo', { p_handle: handle }), 'undo your RSVP'));
}
