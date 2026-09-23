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
