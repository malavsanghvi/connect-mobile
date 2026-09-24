import type { Tables } from '../database.types';
import { AppError, check, maybe, must } from '../errors';
import { supabase } from '../supabase';

import { sendToInbox } from './family';

export type GuideSection = Tables<'guide_sections'>;
export type Zone = Tables<'zones'>;

export async function listGuideSections(centerId: string): Promise<GuideSection[]> {
  return must(await supabase.from('guide_sections').select('*').eq('center_id', centerId).order('sort_order'), 'load the guide');
}

export async function getGuideSection(centerId: string, slug: string): Promise<GuideSection | null> {
  return maybe(await supabase.from('guide_sections').select('*').eq('center_id', centerId).eq('slug', slug).maybeSingle(), 'load this guide page');
}

export async function listZones(centerId: string): Promise<Zone[]> {
  return must(await supabase.from('zones').select('*').eq('center_id', centerId).order('name'), 'load zones');
}

/** Zone for a 5-digit ZIP from zones.zip_codes; null when no zone lists it (no silent fallback). */
export async function findZoneByZip(centerId: string, zip: string): Promise<Zone | null> {
  const z = zip.trim();
  if (!/^\d{5}$/.test(z)) throw new AppError('Enter a 5-digit ZIP code.', 'invalid zip');
  const rows = must(await supabase.from('zones').select('*').eq('center_id', centerId).contains('zip_codes', [z]).limit(1), 'find your zone');
  return rows[0] ?? null;
}

/** Zone lead inbox (inboxes.zone_id) — messages go to the role, never a personal number. */
export async function zoneInbox(centerId: string, zoneId: string): Promise<Tables<'inboxes'> | null> {
  const rows = must(await supabase.from('inboxes').select('*').eq('center_id', centerId).eq('zone_id', zoneId).limit(1), 'find the zone lead');
  return rows[0] ?? null;
}

export type WhatsAppGroup = Tables<'whatsapp_groups'> & { request: Tables<'whatsapp_join_requests'> | null };

export async function listWhatsAppGroups(centerId: string, personId: string): Promise<WhatsAppGroup[]> {
  const [groupsRes, reqRes] = await Promise.all([
    supabase.from('whatsapp_groups').select('*').eq('center_id', centerId).eq('active', true).order('name'),
    supabase.from('whatsapp_join_requests').select('*').eq('person_id', personId).order('created_at', { ascending: false }),
  ]);
  const groups = must(groupsRes, 'load WhatsApp groups');
  const reqs = must(reqRes, 'load your WhatsApp requests');
  return groups.map((g) => ({ ...g, request: reqs.find((r) => r.group_id === g.id) ?? null }));
}

export async function requestWhatsAppJoin(centerId: string, groupId: string, personId: string, phone: string | null): Promise<void> {
  if (!phone) throw new AppError('Add a mobile number to your profile first — the admin adds that number to the group.', 'no phone');
  check(await supabase.from('whatsapp_join_requests').insert({ center_id: centerId, group_id: groupId, person_id: personId, phone_e164: phone, status: 'pending' }), 'send your request to join');
}

/** Team inboxes a member can ask (not zone inboxes). */
export async function listTeamInboxes(centerId: string): Promise<Tables<'inboxes'>[]> {
  return must(await supabase.from('inboxes').select('*').eq('center_id', centerId).is('zone_id', null).order('name'), 'load the list of teams');
}

export type MyThread = Tables<'threads'> & { lastMessage: string | null; inboxName: string | null };

export async function listMyThreads(personId: string): Promise<MyThread[]> {
  const threads = must(await supabase.from('threads').select('*').eq('from_person_id', personId).order('updated_at', { ascending: false }).limit(20), 'load your questions');
  if (threads.length === 0) return [];
  const [msgs, inboxes] = await Promise.all([
    supabase.from('thread_messages').select('thread_id, body, created_at').in('thread_id', threads.map((t) => t.id)).order('created_at', { ascending: false }).then((r) => must(r, 'load your questions')),
    supabase.from('inboxes').select('id, name').in('id', [...new Set(threads.map((t) => t.inbox_id))]).then((r) => must(r, 'load your questions')),
  ]);
  return threads.map((t) => ({ ...t, lastMessage: msgs.find((m) => m.thread_id === t.id)?.body ?? null, inboxName: inboxes.find((i) => i.id === t.inbox_id)?.name ?? null }));
}

export { sendToInbox };

// ---------------------------------------------------------------------------
// First steps (hub checklist)
// ---------------------------------------------------------------------------

/** What the database knows about the member's first steps (the rest are remembered on the device). */
export async function loadFirstStepFacts(personId: string): Promise<{ whatsapp: boolean; volunteer: boolean; ask: boolean }> {
  const [wa, vol, asked] = await Promise.all([
    supabase.from('whatsapp_join_requests').select('id', { count: 'exact', head: true }).eq('person_id', personId),
    supabase.from('volunteer_interests').select('id', { count: 'exact', head: true }).eq('person_id', personId).neq('status', 'inactive'),
    supabase.from('threads').select('id', { count: 'exact', head: true }).eq('from_person_id', personId),
  ]);
  check(wa, 'load your first steps');
  check(vol, 'load your first steps');
  check(asked, 'load your first steps');
  return { whatsapp: (wa.count ?? 0) > 0, volunteer: (vol.count ?? 0) > 0, ask: (asked.count ?? 0) > 0 };
}

// ---------------------------------------------------------------------------
// Volunteer (seva) interests — volunteer_groups / volunteer_interests (0004)
// ---------------------------------------------------------------------------

export type VolunteerGroup = Tables<'volunteer_groups'>;

export async function listVolunteerGroups(centerId: string): Promise<VolunteerGroup[]> {
  return must(await supabase.from('volunteer_groups').select('*').eq('center_id', centerId).order('name'), 'load the seva groups');
}

export async function myVolunteerInterests(personId: string): Promise<Tables<'volunteer_interests'>[]> {
  return must(await supabase.from('volunteer_interests').select('*').eq('person_id', personId), 'load your seva interests');
}

/**
 * Save the groups the member ticked: new ones as 'interested', ones they
 * un-ticked become 'inactive' (an 'active' volunteer stays active if still ticked).
 */
export async function saveVolunteerInterests(args: { centerId: string; personId: string; groupIds: string[]; existing: Tables<'volunteer_interests'>[] }): Promise<void> {
  if (args.groupIds.length === 0) throw new AppError('Choose at least one group.', 'no groups selected');
  const byGroup = new Map(args.existing.map((r) => [r.group_id, r]));
  const upserts = args.groupIds
    .filter((g) => byGroup.get(g)?.status !== 'active' && byGroup.get(g)?.status !== 'interested')
    .map((g) => ({ center_id: args.centerId, person_id: args.personId, group_id: g, status: 'interested' }));
  if (upserts.length) check(await supabase.from('volunteer_interests').upsert(upserts, { onConflict: 'person_id,group_id' }), 'send your seva interests');
  const dropped = args.existing.filter((r) => r.status !== 'inactive' && !args.groupIds.includes(r.group_id)).map((r) => r.id);
  if (dropped.length) check(await supabase.from('volunteer_interests').update({ status: 'inactive' }).in('id', dropped), 'update your seva interests');
}

// ---------------------------------------------------------------------------
// Membership types, roster, registrations, timings
// ---------------------------------------------------------------------------

export type MembershipType = Tables<'membership_types'>;

export async function listMembershipTypes(centerId: string): Promise<MembershipType[]> {
  return must(await supabase.from('membership_types').select('*').eq('center_id', centerId).eq('active', true).order('fee_cents'), 'load membership types');
}

export type RosterRow = Tables<'role_roster'> & { name: string | null };

/** Executive Committee, trustees… Names come from the member directory, so only people who listed themselves are named. */
export async function listRoster(centerId: string): Promise<RosterRow[]> {
  const rows = must(await supabase.from('role_roster').select('*').eq('center_id', centerId).order('body').order('sort_order'), 'load the committee list');
  const ids = [...new Set(rows.map((r) => r.person_id).filter((x): x is string => !!x))];
  const names = ids.length ? must(await supabase.from('directory').select('person_id, name').in('person_id', ids), 'load the committee names') : [];
  return rows.map((r) => ({ ...r, name: names.find((n) => n.person_id === r.person_id)?.name ?? null }));
}

export type RegistrationFacts = {
  pathshala: Pick<Tables<'pathshala_terms'>, 'id' | 'name' | 'registration_opens_at' | 'registration_closes_at' | 'membership_required'> | null;
  openEvents: { id: string; name: string }[];
  membershipOpen: boolean;
};

/** Registrations that exist in the database: the next Pathshala term, events taking RSVPs, membership applications. */
export async function loadRegistrations(centerId: string, today: string): Promise<RegistrationFacts> {
  const nowIso = new Date().toISOString();
  const [termsRes, eventsRes, typesRes] = await Promise.all([
    supabase.from('pathshala_terms').select('id, name, registration_opens_at, registration_closes_at, membership_required, ends_on').eq('center_id', centerId).gte('ends_on', today).order('starts_on').limit(1),
    supabase
      .from('events')
      .select('id, name, rsvp_opens_at, rsvp_closes_at, starts_at')
      .eq('center_id', centerId)
      .in('status', ['published', 'live'])
      .gte('starts_at', nowIso)
      .order('starts_at')
      .limit(20),
    supabase.from('membership_types').select('id', { count: 'exact', head: true }).eq('center_id', centerId).eq('active', true).neq('tier', 'community'),
  ]);
  const terms = must(termsRes, 'load Pathshala registration');
  const events = must(eventsRes, 'load open RSVPs');
  check(typesRes, 'load membership types');
  const now = Date.now();
  const openEvents = events.filter((e) => (!e.rsvp_opens_at || new Date(e.rsvp_opens_at).getTime() <= now) && (!e.rsvp_closes_at || new Date(e.rsvp_closes_at).getTime() > now)).map((e) => ({ id: e.id, name: e.name }));
  return { pathshala: terms[0] ?? null, openEvents, membershipOpen: (typesRes.count ?? 0) > 0 };
}

export async function todayTimings(centerId: string, today: string): Promise<Tables<'daily_timings'> | null> {
  return maybe(await supabase.from('daily_timings').select('*').eq('center_id', centerId).eq('on_date', today).maybeSingle(), "load today's timings");
}

export async function getZone(zoneId: string): Promise<Zone | null> {
  return maybe(await supabase.from('zones').select('*').eq('id', zoneId).maybeSingle(), 'load your zone');
}
