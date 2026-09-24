import type { Tables } from '../database.types';
import { maybe, must } from '../errors';
import { supabase } from '../supabase';

export type Boli = Tables<'bolis'>;
export type BoliSummary = { topCents: number | null; entries: number; minimumCents: number; closesAt: string | null; mineCents: number | null };
export type BoliWithSummary = Boli & { eventName: string | null; summary: BoliSummary | null };

export async function boliSummary(boliId: string): Promise<BoliSummary> {
  const rows = must(await supabase.rpc('boli_summary', { p_boli: boliId }), 'load the latest pledges');
  const r = rows[0];
  if (!r) return { topCents: null, entries: 0, minimumCents: 0, closesAt: null, mineCents: null };
  return { topCents: r.top_cents ?? null, entries: r.entries ?? 0, minimumCents: r.minimum_cents, closesAt: r.closes_at ?? null, mineCents: r.mine_cents ?? null };
}

/** Bolis visible to members (non-draft), newest cutoff first, with live summaries for digital ones. */
export async function listBolis(centerId: string): Promise<BoliWithSummary[]> {
  const bolis = must(await supabase.from('bolis').select('*').eq('center_id', centerId).in('status', ['open', 'paused', 'closed', 'settled']).order('closes_at', { ascending: true, nullsFirst: false }).limit(50), 'load bolis');
  const eventIds = [...new Set(bolis.map((b) => b.event_id).filter((x): x is string => !!x))];
  const events = eventIds.length ? must(await supabase.from('events').select('id, name').in('id', eventIds), 'load bolis') : [];
  const names = new Map(events.map((e) => [e.id, e.name]));
  const summaries = await Promise.all(bolis.map((b) => (b.kind === 'digital' && b.status !== 'settled' ? boliSummary(b.id) : Promise.resolve(null))));
  return bolis.map((b, i) => ({ ...b, eventName: b.event_id ? (names.get(b.event_id) ?? null) : null, summary: summaries[i] }));
}

export async function getBoli(id: string): Promise<BoliWithSummary> {
  const b = must(await supabase.from('bolis').select('*').eq('id', id).single(), 'load this boli');
  const [summary, event] = await Promise.all([
    b.kind === 'digital' ? boliSummary(b.id) : Promise.resolve(null),
    b.event_id ? supabase.from('events').select('name').eq('id', b.event_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  return { ...b, eventName: maybe(event, 'load the event for this boli')?.name ?? null, summary };
}

export async function placePledge(boliId: string, householdId: string, amountCents: number, anonymous: boolean): Promise<void> {
  must(await supabase.rpc('place_boli_entry', { p_boli: boliId, p_household: householdId, p_amount_cents: amountCents, p_anonymous: anonymous }), 'place your pledge');
}

export function isBoliOpen(b: Boli, summary: BoliSummary | null, now: Date): boolean {
  if (b.status !== 'open') return false;
  if (b.opens_at && new Date(b.opens_at) > now) return false;
  const close = summary?.closesAt ?? b.extended_until ?? b.closes_at;
  return !close || new Date(close) > now;
}
