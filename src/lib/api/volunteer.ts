import { AppError, must, report } from '../errors';
import { supabase } from '../supabase';

export type VolunteerEvent = { id: string; name: string; starts_at: string | null; venue: string | null };

const SCANNER_ROLES = ['checkin_volunteer', 'event_lead'];

/**
 * Live events this login may check people in for: a checkin_volunteer or
 * event_lead grant, center-wide or scoped to the event, currently in force.
 */
export async function myVolunteerEvents(centerId: string): Promise<VolunteerEvent[]> {
  const grants = must(
    await supabase
      .from('role_grants')
      .select('role_key, scope_kind, scope_id, starts_at, ends_at')
      .eq('center_id', centerId)
      .in('role_key', SCANNER_ROLES),
    'check your volunteer roles',
  );
  const now = Date.now();
  const active = grants.filter((g) => new Date(g.starts_at).getTime() <= now && (!g.ends_at || new Date(g.ends_at).getTime() > now));
  if (active.length === 0) return [];
  const centerWide = active.some((g) => g.scope_kind === 'center' || g.scope_kind === 'platform');
  const scopedIds = active.filter((g) => g.scope_kind === 'event' && g.scope_id).map((g) => g.scope_id as string);
  let query = supabase.from('events').select('id, name, starts_at, venue').eq('center_id', centerId).eq('status', 'live').order('starts_at');
  if (!centerWide) {
    if (scopedIds.length === 0) return [];
    query = query.in('id', scopedIds);
  }
  return must(await query, 'load live events');
}

export type Station = 'entry' | 'food' | 'gifts';

export type CheckInAttendee = {
  id: string;
  name: string;
  checked_in: boolean;
  senior: boolean;
  child_under_12: boolean;
  assistance: boolean;
  lunch: string | null;
  /** From the attendees row (event staff can read it): food served / gift given already. */
  served: boolean;
  gifted: boolean;
  assistanceNote: string | null;
};

export type CheckInResult = {
  result: 'ok' | 'duplicate' | 'invalid' | 'revoked' | 'wrong_event' | 'no_rsvp' | 'ambiguous' | string;
  rsvpId: string | null;
  householdId: string | null;
  householdName: string | null;
  attendees: CheckInAttendee[];
};

type RpcAttendee = { id: string; name: string; checked_in: boolean; senior: boolean; child_under_12: boolean; assistance: boolean; lunch: string | null };

async function callCheckIn(args: { eventId: string; token: string; station: Station | 'lookup'; attendeeIds?: string[]; deviceId: string | null }, action: string): Promise<CheckInResult> {
  const rows = must(
    await supabase.rpc('check_in', {
      p_event: args.eventId,
      p_token: args.token,
      p_station: args.station,
      ...(args.attendeeIds ? { p_attendee_ids: args.attendeeIds } : {}),
      ...(args.deviceId ? { p_device: args.deviceId } : {}),
    }),
    action,
  );
  const row = rows[0];
  const raw = Array.isArray(row?.attendees) ? (row.attendees as RpcAttendee[]) : [];
  return {
    result: row?.result ?? 'invalid',
    rsvpId: row?.rsvp_id ?? null,
    householdId: row?.household_id ?? null,
    householdName: row?.household_name ?? null,
    attendees: raw.map((a) => ({ ...a, served: false, gifted: false, assistanceNote: null })),
  };
}

/**
 * Step 1 of a scan: station 'lookup' only reads (connect-crm 0017) so the
 * volunteer confirms who is actually here before anything is recorded.
 * Food / gift state and assistance notes come from the attendee rows.
 */
export async function lookupTicket(eventId: string, token: string, deviceId: string | null): Promise<CheckInResult> {
  const res = await callCheckIn({ eventId, token, station: 'lookup', deviceId }, 'look up this ticket');
  if (res.result !== 'ok' || !res.rsvpId || res.attendees.length === 0) return res;
  const details = must(
    await supabase.from('attendees').select('id, served_food_at, gift_given_at, assistance_note').eq('rsvp_id', res.rsvpId),
    'load who is on this ticket',
  );
  const byId = new Map(details.map((d) => [d.id, d]));
  return {
    ...res,
    attendees: res.attendees.map((a) => {
      const d = byId.get(a.id);
      return { ...a, served: !!d?.served_food_at, gifted: !!d?.gift_given_at, assistanceNote: d?.assistance_note ?? null };
    }),
  };
}

/** Step 2: record the station for exactly the people the volunteer confirmed. */
export async function confirmCheckIn(args: { eventId: string; token: string; station: Station; attendeeIds: string[]; deviceId: string | null }): Promise<CheckInResult> {
  if (args.attendeeIds.length === 0) throw new AppError('Select who is here first.', 'no attendees selected');
  const action = args.station === 'entry' ? 'check these people in' : args.station === 'food' ? 'record food served' : 'record gifts given';
  return callCheckIn(args, action);
}

export type PhoneMatch = { householdId: string; householdLabel: string | null; membersMasked: string | null; rsvpId: string | null; rsvpStatus: string | null };

/** Walk-in by phone (app.checkin_lookup_phone): masked names only, never contact details. */
export async function lookupByPhone(eventId: string, phone: string): Promise<PhoneMatch[]> {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) throw new AppError('Enter the full mobile number, including the area code.', 'short phone');
  const rows = must(await supabase.rpc('checkin_lookup_phone', { p_event: eventId, p_phone: phone }), 'look up this mobile number');
  return rows.map((r) => ({ householdId: r.household_id, householdLabel: r.household_label, membersMasked: r.members_masked, rsvpId: r.rsvp_id, rsvpStatus: r.rsvp_status }));
}

/**
 * A ticket token for an RSVP found by phone, so the same lookup → confirm
 * flow runs as for a scanned ticket. Event staff can read attendee rows
 * (attendees_event_staff).
 */
export async function ticketTokenForRsvp(rsvpId: string): Promise<string> {
  const rows = must(
    await supabase.from('attendees').select('ticket_token').eq('rsvp_id', rsvpId).eq('ticket_revoked', false).not('ticket_token', 'is', null).limit(1),
    "open this family's tickets",
  );
  const token = rows[0]?.ticket_token;
  if (!token) throw new AppError("This family's RSVP has no active tickets. Please send them to the welcome desk.", `no ticket token for rsvp ${rsvpId}`);
  return token;
}

export type EventCounts = { checkedIn: number; expected: number };

/** Header counter: people checked in, of people on an RSVP (not cancelled or waitlisted). */
export async function eventCounts(eventId: string): Promise<EventCounts> {
  const [inRes, allRes] = await Promise.all([
    supabase.from('attendees').select('id', { count: 'exact', head: true }).eq('event_id', eventId).not('checked_in_at', 'is', null),
    supabase.from('attendees').select('id', { count: 'exact', head: true }).eq('event_id', eventId).not('status', 'in', '(cancelled,waitlisted)'),
  ]);
  if (inRes.error) throw report(inRes.error, 'load the check-in count');
  if (allRes.error) throw report(allRes.error, 'load the check-in count');
  return { checkedIn: inRes.count ?? 0, expected: allRes.count ?? 0 };
}
