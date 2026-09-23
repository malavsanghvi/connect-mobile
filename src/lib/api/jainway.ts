import type { Tables } from '../database.types';
import { check, maybe, must } from '../errors';
import { addDays, todayAt, zonedParts } from '../format';
import type { StreakRow } from '../rules';
import { supabase } from '../supabase';

import type { Center, Member } from './member';

export type Practice = Tables<'practices'>;

export type JainWayToday = {
  today: string;
  selected: Practice[];
  doneIds: string[];
  pointsTotal: number;
  pointsToday: number;
  streak: StreakRow;
  week: { date: string; complete: boolean; any: boolean }[];
  catalog: Practice[];
};

export async function loadJainWayToday(center: Center, personId: string): Promise<JainWayToday> {
  const today = todayAt(center.time_zone);
  const weekStart = addDays(today, -6);
  const [selRes, catalogRes, logsRes, streakRes, pointsRes] = await Promise.all([
    supabase.from('practice_selections').select('practice_id').eq('person_id', personId),
    supabase.from('practices').select('*').eq('active', true).or(`center_id.eq.${center.id},center_id.is.null`).order('sort_order'),
    supabase.from('practice_logs').select('practice_id, logged_on').eq('person_id', personId).gte('logged_on', weekStart),
    supabase.from('streaks').select('current_days, longest_days, last_logged_on').eq('person_id', personId).eq('center_id', center.id).maybeSingle(),
    supabase.from('points_ledger').select('points, occurred_at').eq('person_id', personId).limit(10000),
  ]);
  const selectedIds = new Set(must(selRes, 'load your practices').map((r) => r.practice_id));
  const catalog = must(catalogRes, 'load the practice catalog').filter((p) => !p.tradition || p.tradition === center.tradition);
  const logs = must(logsRes, 'load your practice log');
  const streak = maybe(streakRes, 'load your streak');
  const points = must(pointsRes, 'load your points');

  const selected = catalog.filter((p) => selectedIds.has(p.id));
  const doneIds = logs.filter((l) => l.logged_on === today && selectedIds.has(l.practice_id)).map((l) => l.practice_id);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const n = logs.filter((l) => l.logged_on === date && selectedIds.has(l.practice_id)).length;
    return { date, any: n > 0, complete: selected.length > 0 && n >= selected.length };
  });
  return {
    today,
    selected,
    doneIds,
    pointsTotal: points.reduce((s, p) => s + p.points, 0),
    pointsToday: points.filter((p) => zonedParts(new Date(p.occurred_at), center.time_zone).iso === today).reduce((s, p) => s + p.points, 0),
    streak: streak ?? null,
    week,
    catalog,
  };
}

export async function logPractice(centerId: string, practiceId: string, onDate: string): Promise<{ pointsAwarded: number; dayComplete: boolean; streakDays: number }> {
  const rows = must(await supabase.rpc('log_practice', { p_center: centerId, p_practice: practiceId, p_on: onDate }), 'log this practice');
  const r = rows[0];
  return { pointsAwarded: r?.points_awarded ?? 0, dayComplete: r?.day_complete ?? false, streakDays: r?.streak_days ?? 0 };
}

export async function addPractice(centerId: string, personId: string, practiceId: string): Promise<void> {
  check(await supabase.from('practice_selections').insert({ center_id: centerId, person_id: personId, practice_id: practiceId }), 'add this practice');
}

export async function removePractice(personId: string, practiceId: string): Promise<void> {
  check(await supabase.from('practice_selections').delete().eq('person_id', personId).eq('practice_id', practiceId), 'remove this practice');
}

// ---------------------------------------------------------------------------
// Saathi
// ---------------------------------------------------------------------------

export type CircleMember = { personId: string; name: string; isMe: boolean; visible: boolean; streakDays: number; doneToday: number; selected: number };
export type AnumodanaRow = Tables<'anumodana'> & { fromName: string; toName: string };

export async function loadSaathi(center: Center, member: Member): Promise<{ circle: CircleMember[]; received: AnumodanaRow[]; sent: AnumodanaRow[] }> {
  const today = todayAt(center.time_zone);
  const ids = member.members.map((m) => m.person.id);
  const [streaksRes, logsRes, selRes, anuRes] = await Promise.all([
    supabase.from('streaks').select('person_id, current_days, last_logged_on').in('person_id', ids),
    supabase.from('practice_logs').select('person_id, practice_id').in('person_id', ids).eq('logged_on', today),
    supabase.from('practice_selections').select('person_id, practice_id').in('person_id', ids),
    supabase.from('anumodana').select('*').or(`from_person_id.eq.${member.person.id},to_person_id.eq.${member.person.id}`).order('created_at', { ascending: false }).limit(40),
  ]);
  const streaks = must(streaksRes, 'load your family circle');
  const logs = must(logsRes, 'load your family circle');
  const sels = must(selRes, 'load your family circle');
  const anu = must(anuRes, 'load anumodana');
  const name = new Map(member.members.map((m) => [m.person.id, m.person.preferred_name || m.person.first_name]));

  const circle = member.members.map((m) => {
    const s = streaks.find((r) => r.person_id === m.person.id);
    const selected = sels.filter((r) => r.person_id === m.person.id).length;
    // RLS shows other members' practice data only to adults of the household.
    const visible = m.person.id === member.person.id || member.isAdult;
    const alive = s?.last_logged_on && (s.last_logged_on === today || s.last_logged_on === addDays(today, -1));
    return {
      personId: m.person.id,
      name: name.get(m.person.id) ?? '',
      isMe: m.person.id === member.person.id,
      visible,
      streakDays: alive ? (s?.current_days ?? 0) : 0,
      doneToday: logs.filter((r) => r.person_id === m.person.id).length,
      selected,
    };
  });
  const withNames = anu.map((a) => ({ ...a, fromName: name.get(a.from_person_id) ?? '', toName: name.get(a.to_person_id) ?? '' }));
  return {
    circle,
    received: withNames.filter((a) => a.to_person_id === member.person.id),
    sent: withNames.filter((a) => a.from_person_id === member.person.id),
  };
}

export async function sendAnumodana(centerId: string, toPersonId: string, kind: 'celebrate' | 'support', message: string | null): Promise<number> {
  const pts = must(await supabase.rpc('send_anumodana', { p_center: centerId, p_to: toPersonId, p_kind: kind, ...(message ? { p_message: message } : {}) }), 'send anumodana');
  return typeof pts === 'number' ? pts : 0;
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export type ContentItem = Tables<'content_items'>;

export async function listContent(centerId: string, kind: 'pachchakhan' | 'audio_lesson' | 'video'): Promise<ContentItem[]> {
  return must(
    await supabase.from('content_items').select('*').eq('kind', kind).eq('status', 'published').or(`center_id.eq.${centerId},center_id.is.null`).order('title'),
    kind === 'pachchakhan' ? 'load the pachchakhan library' : 'load lessons',
  );
}

export async function getContentItem(id: string): Promise<ContentItem> {
  return must(await supabase.from('content_items').select('*').eq('id', id).single(), 'load this item');
}
