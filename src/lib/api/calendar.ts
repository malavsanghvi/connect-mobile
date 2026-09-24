import type { Tables } from '../database.types';
import { must } from '../errors';
import { addDays, toISODate, zonedParts } from '../format';
import { supabase } from '../supabase';

import type { Center } from './member';

export type CalendarLayer = Tables<'calendar_layers'>;
export type CalendarItem = { date: string; layerId: string; title: string; sub: string | null };
export type CalendarMonth = {
  layers: CalendarLayer[];
  items: CalendarItem[];
  tithis: Record<string, Tables<'tithi_days'>>;
};

function monthBounds(year: number, month: number): { first: string; last: string } {
  const first = toISODate(year, month, 1);
  const next = month === 12 ? toISODate(year + 1, 1, 1) : toISODate(year, month + 1, 1);
  return { first, last: addDays(next, -1) };
}

/** Layers, entries, tithis and events for one month (layers readable by guests too). */
export async function loadCalendarMonth(center: Center, year: number, month: number): Promise<CalendarMonth> {
  const { first, last } = monthBounds(year, month);
  return loadCalendarRange(center, first, last);
}

/** Same as a month, for any date range ("Add these calendars to my phone" exports 12 months). */
export async function loadCalendarRange(center: Center, first: string, last: string): Promise<CalendarMonth> {
  const [layersRes, entriesRes, tithiRes, eventsRes] = await Promise.all([
    supabase.from('calendar_layers').select('*').or(`center_id.eq.${center.id},center_id.is.null`).order('name'),
    // Multi-day entries (e.g. Paryushan) start before the month; overlap is checked below.
    supabase.from('calendar_entries').select('*').gte('starts_on', addDays(first, -60)).lte('starts_on', last).or(`center_id.eq.${center.id},center_id.is.null`).limit(5000),
    supabase.from('tithi_days').select('*').gte('gregorian', first).lte('gregorian', last).or(`center_id.eq.${center.id},center_id.is.null`),
    supabase.from('events').select('id, name, starts_at, venue').eq('center_id', center.id).in('status', ['published', 'rsvp_closed', 'live', 'completed']).gte('starts_at', `${addDays(first, -1)}T00:00:00Z`).lte('starts_at', `${addDays(last, 1)}T23:59:59Z`),
  ]);
  const layers = must(layersRes, 'load calendars');
  const entries = must(entriesRes, 'load calendar dates');
  const tithiRows = must(tithiRes, 'load tithis');
  const events = must(eventsRes, 'load events for the calendar');

  const tithis: Record<string, Tables<'tithi_days'>> = {};
  for (const r of tithiRows) {
    const existing = tithis[r.gregorian];
    if (!existing || (r.center_id && !existing.center_id) || (!existing.center_id && r.tradition === center.tradition)) tithis[r.gregorian] = r;
  }

  const items: CalendarItem[] = [];
  for (const e of entries) {
    if (e.event_id) continue; // events come from the events table below
    if ((e.ends_on ?? e.starts_on) < first) continue;
    const end = e.ends_on ?? e.starts_on;
    for (let d = e.starts_on < first ? first : e.starts_on; d <= end && d <= last; d = addDays(d, 1)) {
      items.push({ date: d, layerId: e.layer_id, title: e.title, sub: typeof (e.metadata as Record<string, unknown> | null)?.sub === 'string' ? ((e.metadata as Record<string, unknown>).sub as string) : null });
    }
  }
  const eventsLayer = layers.find((l) => l.kind === 'events');
  if (eventsLayer) {
    for (const ev of events) {
      if (!ev.starts_at) continue;
      const date = zonedParts(new Date(ev.starts_at), center.time_zone).iso;
      if (date >= first && date <= last) items.push({ date, layerId: eventsLayer.id, title: ev.name, sub: ev.venue });
    }
  }
  return { layers, items, tithis };
}
