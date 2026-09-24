import type { Tables, TablesInsert } from '../database.types';
import { AppError, check, logError, maybe, must } from '../errors';
import { readPref } from '../storage';
import { supabase } from '../supabase';

import { createPledge } from './giving';
import type { Member } from './member';

export type EventRow = Tables<'events'>;
export type Rsvp = Tables<'rsvps'>;
export type Attendee = Tables<'attendees'>;
export type LunchSlot = Tables<'lunch_slots'>;

const VISIBLE_STATUSES = ['published', 'rsvp_closed', 'live', 'completed'];

/** Upcoming and in-progress events the caller can see (RLS narrows guests to public events). */
export async function listUpcomingEvents(centerId: string): Promise<EventRow[]> {
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  return must(
    await supabase
      .from('events')
      .select('*')
      .eq('center_id', centerId)
      .in('status', VISIBLE_STATUSES)
      .or(`starts_at.gte.${since},ends_at.gte.${new Date().toISOString()}`)
      .order('starts_at', { ascending: true })
      .limit(60),
    'load upcoming events',
  );
}

/** Recent past events (for "Share feedback on a recent event"). */
export async function listRecentEvents(centerId: string, days = 30): Promise<EventRow[]> {
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  return must(
    await supabase.from('events').select('*').eq('center_id', centerId).in('status', VISIBLE_STATUSES).gte('starts_at', since).lt('starts_at', new Date().toISOString()).order('starts_at', { ascending: false }).limit(20),
    'load recent events',
  );
}

export async function getEvent(id: string): Promise<EventRow> {
  return must(await supabase.from('events').select('*').eq('id', id).single(), 'load this event');
}

/** Most relevant RSVP of the household per event (an active one beats a cancelled one). */
export async function listHouseholdRsvps(householdId: string, eventIds: string[]): Promise<Map<string, Rsvp>> {
  const out = new Map<string, Rsvp>();
  if (eventIds.length === 0) return out;
  const rows = must(await supabase.from('rsvps').select('*').eq('household_id', householdId).in('event_id', eventIds).order('created_at', { ascending: false }), 'load your RSVPs');
  for (const r of rows) {
    const prev = out.get(r.event_id);
    if (!prev || (prev.status === 'cancelled' && r.status !== 'cancelled')) out.set(r.event_id, r);
  }
  return out;
}

export async function getHouseholdRsvp(eventId: string, householdId: string): Promise<Rsvp | null> {
  const map = await listHouseholdRsvps(householdId, [eventId]);
  return map.get(eventId) ?? null;
}

export async function listAttendees(rsvpId: string): Promise<Attendee[]> {
  return must(await supabase.from('attendees').select('*').eq('rsvp_id', rsvpId).order('created_at'), 'load your tickets');
}

export async function listLunchSlots(eventId: string): Promise<LunchSlot[]> {
  return must(await supabase.from('lunch_slots').select('*').eq('event_id', eventId).order('starts_at'), 'load lunch times');
}

export type RsvpState = 'none' | 'rsvpd' | 'confirmed' | 'cancelled' | 'attended' | 'other';

export function rsvpState(r: Rsvp | null | undefined): RsvpState {
  if (!r) return 'none';
  if (r.status === 'rsvpd' || r.status === 'invited' || r.status === 'waitlisted') return 'rsvpd';
  if (r.status === 'confirmed') return 'confirmed';
  if (r.status === 'cancelled') return 'cancelled';
  if (r.status === 'attended') return 'attended';
  return 'other';
}

/** Why an RSVP can't be made right now, or null when it can. */
export function rsvpBlockReason(e: EventRow, now: Date): 'not_open_yet' | 'closed' | 'past' | null {
  if (e.status === 'rsvp_closed' || e.status === 'completed' || e.status === 'cancelled') return 'closed';
  if (e.ends_at && new Date(e.ends_at) < now) return 'past';
  if (!e.ends_at && e.starts_at && new Date(e.starts_at).getTime() + 6 * 3600 * 1000 < now.getTime()) return 'past';
  if (e.rsvp_opens_at && new Date(e.rsvp_opens_at) > now) return 'not_open_yet';
  if (e.rsvp_closes_at && new Date(e.rsvp_closes_at) < now) return 'closed';
  return null;
}

/** commitment_options: {"per_person":[300,500,700],"lump_sum":[1000,2500,5000],"open":true} (cents). */
export function commitmentOptions(e: EventRow): { perPerson: number[]; lumpSum: number[]; open: boolean } {
  const raw = e.commitment_options;
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const nums = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && n > 0) : []);
  return { perPerson: nums(o.per_person), lumpSum: nums(o.lump_sum), open: o.open === true };
}

export type GoingPerson = {
  personId: string | null;
  name: string;
  childUnder12: boolean;
  senior: boolean;
  assistance: boolean;
  assistanceNote: string;
};

export type Commitment = { mode: 'none' | 'per_person' | 'lump_sum'; totalCents: number };

/**
 * Create or update the household's RSVP. There is no single RPC for this
 * (see README "Schema gaps"), so it is done in steps with a best-effort
 * rollback: if attendees fail after the RSVP row was created, the RSVP is
 * marked cancelled so no half-made RSVP holds seats.
 */
export async function submitRsvp(args: {
  event: EventRow;
  member: Member;
  existing: Rsvp | null;
  going: GoingPerson[];
  commitment: Commitment;
  /** Progress for the "Saving" screen: called after the tickets and after the pledge are saved. */
  onStep?: (step: 'registered' | 'pledged') => void;
}): Promise<{ rsvpId: string; pledgeId: string | null; pledgeNumber: string | null }> {
  const { event, member, existing, going, commitment } = args;
  const household = member.household;
  if (!household) throw new AppError('Your account is not linked to a family yet, so we cannot RSVP. Please finish onboarding or contact the office.', 'no household');
  if (!member.isAdult) throw new AppError('RSVPs are managed by adult family members.', 'child rsvp');
  if (going.length === 0) throw new AppError('Select at least one person who is coming.', 'empty rsvp');

  let rsvpId: string;
  let created = false;
  if (existing) {
    rsvpId = existing.id;
    check(
      await supabase
        .from('rsvps')
        .update({ status: existing.status === 'cancelled' ? 'rsvpd' : existing.status, cancelled_at: null, commitment_mode: existing.commitment_pledge_id ? existing.commitment_mode : commitment.mode })
        .eq('id', rsvpId),
      'update your RSVP',
    );
  } else {
    const row = must(
      await supabase
        .from('rsvps')
        .insert({ center_id: event.center_id, event_id: event.id, household_id: household.id, submitted_by_person_id: member.person.id, commitment_mode: commitment.mode, status: 'rsvpd', source: 'app' })
        .select('id')
        .single(),
      'save your RSVP',
    );
    rsvpId = row.id;
    created = true;
  }

  try {
    const current = existing ? await listAttendees(rsvpId) : [];
    const keepPersonIds = new Set(going.filter((g) => g.personId).map((g) => g.personId as string));
    const keepGuestNames = new Set(going.filter((g) => !g.personId).map((g) => g.name.trim().toLowerCase()));

    // Remove people no longer coming (never someone already checked in).
    const drop = current.filter((a) => !a.checked_in_at && (a.person_id ? !keepPersonIds.has(a.person_id) : !keepGuestNames.has(a.display_name.trim().toLowerCase())));
    if (drop.length) check(await supabase.from('attendees').delete().in('id', drop.map((a) => a.id)), 'update who is coming');

    const inserts: TablesInsert<'attendees'>[] = [];
    for (const g of going) {
      const match = current.find((a) => (g.personId ? a.person_id === g.personId : !a.person_id && a.display_name.trim().toLowerCase() === g.name.trim().toLowerCase()));
      const flags = { is_child_under_12: g.childUnder12, is_senior: g.senior, needs_assistance: g.assistance, assistance_note: g.assistance && g.assistanceNote.trim() ? g.assistanceNote.trim() : null };
      if (match) {
        if (!match.checked_in_at) {
          check(await supabase.from('attendees').update({ ...flags, status: 'rsvpd', ticket_revoked: false }).eq('id', match.id), 'update who is coming');
        }
      } else {
        inserts.push({ center_id: event.center_id, event_id: event.id, rsvp_id: rsvpId, person_id: g.personId, display_name: g.name.trim(), status: 'rsvpd', ...flags });
      }
    }
    if (inserts.length) check(await supabase.from('attendees').insert(inserts), 'add tickets for everyone coming');
  } catch (err) {
    if (created) {
      const { error } = await supabase.from('rsvps').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', rsvpId);
      if (error) logError('rolling back a half-saved RSVP (it may need office cleanup)', error);
    }
    throw err;
  }
  args.onStep?.('registered');

  let pledgeNumber: string | null = null;
  let pledgeId: string | null = null;
  const hasPledge = !!existing?.commitment_pledge_id;
  if (commitment.mode !== 'none' && commitment.totalCents > 0 && !hasPledge) {
    const pledge = await createPledge({
      centerId: event.center_id,
      householdId: household.id,
      personId: member.person.id,
      userId: member.userId,
      amountCents: commitment.totalCents,
      source: 'rsvp_commitment',
      sourceRefId: rsvpId,
      dedication: event.name,
    });
    pledgeNumber = pledge.pledge_number;
    pledgeId = pledge.id;
    check(await supabase.from('rsvps').update({ commitment_pledge_id: pledge.id, commitment_mode: commitment.mode }).eq('id', rsvpId), 'link your donation commitment to the RSVP');
    args.onStep?.('pledged');
  }
  return { rsvpId, pledgeId, pledgeNumber };
}

/** "Yes, we're coming": confirm the kept attendees; release the others' tickets. */
export async function confirmAttendance(rsvpId: string, keepIds: string[], dropIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  if (keepIds.length === 0) throw new AppError('Select at least one person who is coming, or cancel the RSVP.', 'empty confirm');
  if (dropIds.length) check(await supabase.from('attendees').update({ status: 'cancelled', ticket_revoked: true }).in('id', dropIds).is('checked_in_at', null), 'release seats');
  check(await supabase.from('attendees').update({ status: 'confirmed', ticket_revoked: false }).in('id', keepIds).is('checked_in_at', null), 'confirm your attendance');
  check(await supabase.from('rsvps').update({ status: 'confirmed', confirmed_at: now }).eq('id', rsvpId), 'confirm your attendance');
}

/**
 * Confirm screen: family members ticked who are not on the RSVP yet get a
 * ticket (the prototype lists the whole household there). Returns the new
 * attendee ids so they are confirmed with everyone else.
 */
export async function addHouseholdAttendees(event: EventRow, rsvpId: string, people: Omit<GoingPerson, 'assistance' | 'assistanceNote'>[]): Promise<string[]> {
  if (people.length === 0) return [];
  const rows = must(
    await supabase
      .from('attendees')
      .insert(people.map((p) => ({ center_id: event.center_id, event_id: event.id, rsvp_id: rsvpId, person_id: p.personId, display_name: p.name.trim(), status: 'rsvpd' as const, is_child_under_12: p.childUnder12, is_senior: p.senior })))
      .select('id'),
    'add tickets for the family members you ticked',
  );
  return rows.map((r) => r.id);
}

/** "We can't make it": cancel the RSVP and release every ticket. */
export async function cancelRsvp(rsvpId: string): Promise<void> {
  check(await supabase.from('attendees').update({ status: 'cancelled', ticket_revoked: true }).eq('rsvp_id', rsvpId).is('checked_in_at', null), 'release your seats');
  check(await supabase.from('rsvps').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', rsvpId), 'cancel your RSVP');
}

export async function getPledgeById(id: string): Promise<Tables<'pledges'> | null> {
  return maybe(await supabase.from('pledges').select('*').eq('id', id).maybeSingle(), 'load your donation commitment');
}

/** The open feedback survey for an event (surveys.event_id, connect-crm 0016). */
export async function findEventSurvey(eventId: string): Promise<Tables<'surveys'> | null> {
  const rows = must(await supabase.from('surveys').select('*').eq('status', 'open').eq('event_id', eventId).order('created_at', { ascending: false }).limit(1), 'look for an event feedback survey');
  return rows[0] ?? null;
}

/** Move checked-in family members to a later lunch slot with seats (app.move_lunch_slot, adults only). */
export async function moveLunchSlot(attendeeIds: string[], slotId: string): Promise<number> {
  const n = must(await supabase.rpc('move_lunch_slot', { p_attendee_ids: attendeeIds, p_slot: slotId }), 'change your lunch time');
  return typeof n === 'number' ? n : 0;
}

export type EventListItem = { event: EventRow; rsvp: Rsvp | null; count: number };

/** Events tab feedback row: the open survey to answer, or the one just answered ("Feedback sent · thank you"). */
export type FeedbackRow = { survey: Tables<'surveys'>; eventName: string; attended: boolean; sent: boolean };

/** Events tab: upcoming events with the household's RSVP status, plus the event-feedback row. */
export async function loadEventsList(centerId: string, householdId: string | null, personId: string | null): Promise<{ items: EventListItem[]; feedback: FeedbackRow | null }> {
  const events = await listUpcomingEvents(centerId);
  const rsvps = householdId ? await listHouseholdRsvps(householdId, events.map((e) => e.id)) : new Map<string, Rsvp>();
  const active = [...rsvps.values()].filter((r) => r.status !== 'cancelled');
  const attendees = active.length ? must(await supabase.from('attendees').select('rsvp_id, status').in('rsvp_id', active.map((r) => r.id)), 'load your tickets') : [];
  const items = events.map((event) => {
    const rsvp = rsvps.get(event.id) ?? null;
    const count = rsvp ? attendees.filter((a) => a.rsvp_id === rsvp.id && a.status !== 'cancelled').length : 0;
    return { event, rsvp, count };
  });

  let feedback: FeedbackRow | null = null;
  if (personId) {
    const [surveys, answered, recent, anonAnswered] = await Promise.all([
      supabase.from('surveys').select('*').eq('center_id', centerId).in('status', ['open', 'closed']).not('event_id', 'is', null).order('created_at', { ascending: false }).limit(20).then((r) => must(r, 'load event feedback')),
      supabase.from('survey_responses').select('survey_id').eq('person_id', personId).then((r) => must(r, 'load event feedback')),
      listRecentEvents(centerId, 30),
      readPref<string[]>('answeredSurveys', []),
    ]);
    const done = new Set([...answered.map((a) => a.survey_id), ...anonAnswered]);
    const byId = new Map([...events, ...recent].map((e) => [e.id, e]));
    const relevant = surveys.filter((s) => s.event_id && byId.has(s.event_id));
    const now = Date.now();
    const openOnes = relevant.filter((s) => s.status === 'open' && !done.has(s.id) && (!s.closes_at || new Date(s.closes_at).getTime() > now) && (!s.opens_at || new Date(s.opens_at).getTime() <= now));
    const pick = openOnes[0] ?? relevant.find((s) => done.has(s.id)) ?? null;
    if (pick?.event_id) {
      const ev = byId.get(pick.event_id) as EventRow;
      const rsvp = householdId ? ((await listHouseholdRsvps(householdId, [ev.id])).get(ev.id) ?? null) : null;
      feedback = { survey: pick, eventName: ev.name, attended: rsvpState(rsvp) === 'attended', sent: done.has(pick.id) };
    }
  }
  return { items, feedback };
}
