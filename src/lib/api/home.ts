import type { Tables } from '../database.types';
import { pickDarshan, type Darshan } from '../darshan';
import { logError, maybe, must } from '../errors';
import { todayAt } from '../format';
import { lunchCard, type LunchCard } from '../rules';
import { supabase } from '../supabase';
import { isSurveyOpen, pickSurveyForPopup } from '../survey-popup';

import { listAttendees, listHouseholdRsvps, listLunchSlots, listUpcomingEvents, rsvpState, type EventRow, type Rsvp } from './events';
import type { Center, Member } from './member';
import { listCompletedSurveyIds, readPopupDismissals } from './surveys';

export type TodayInfo = {
  today: string;
  tithi: Tables<'tithi_days'> | null;
  timings: Tables<'daily_timings'> | null;
  darshan: Darshan | null;
};

/** Today at the center: tithi (center row beats the shared tradition row), timings, live darshan link. */
export async function loadToday(center: Center): Promise<TodayInfo> {
  const today = todayAt(center.time_zone);
  const [tithiRes, timingsRes, darshanRes] = await Promise.all([
    supabase.from('tithi_days').select('*').eq('gregorian', today).or(`center_id.eq.${center.id},center_id.is.null`),
    supabase.from('daily_timings').select('*').eq('center_id', center.id).eq('on_date', today).maybeSingle(),
    supabase.from('content_items').select('title, media_url, center_id, metadata').eq('kind', 'darshan_stream').eq('status', 'published').or(`center_id.eq.${center.id},center_id.is.null`).limit(20),
  ]);
  const tithis = must(tithiRes, "load today's tithi");
  const tithi =
    tithis.find((r) => r.center_id === center.id) ??
    tithis.find((r) => r.center_id === null && r.tradition === center.tradition) ??
    tithis.find((r) => r.center_id === null) ??
    null;
  // Whether this reader may see the stream is the database's call (the Live darshan area of the organization's access
  // levels: open to the public unless the organization asks for a level), so a visitor who is not signed in may get none;
  // a missing darshan link is not an error.
  const darshanRows = darshanRes.error ? [] : (darshanRes.data ?? []);
  if (darshanRes.error) logError('reading the live darshan stream (hidden for this reader)', darshanRes.error);
  return { today, tithi, timings: maybe(timingsRes, "load today's timings"), darshan: pickDarshan(darshanRows, center.id) };
}

export type Alert = Tables<'alerts'>;

/** Active alerts (RLS returns only those currently in their window). */
export async function listAlerts(centerId: string): Promise<Alert[]> {
  const rows = must(await supabase.from('alerts').select('*').eq('center_id', centerId).order('starts_at', { ascending: false }).limit(10), 'load alerts');
  const rank = { urgent: 0, important: 1, info: 2 } as Record<string, number>;
  return [...rows].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
}

export type Survey = Tables<'surveys'>;

/**
 * Open surveys the person hasn't answered. "Answered" comes from
 * survey_completions (written by app.submit_survey, anonymous answers included).
 */
export async function listOpenSurveys(centerId: string, personId: string): Promise<Survey[]> {
  const [surveysRes, completed] = await Promise.all([
    supabase.from('surveys').select('*').eq('center_id', centerId).eq('status', 'open').order('created_at', { ascending: false }),
    listCompletedSurveyIds(personId),
  ]);
  const surveys = must(surveysRes, 'load surveys');
  const now = new Date();
  return surveys.filter((s) => !completed.has(s.id) && isSurveyOpen(s, now));
}

export type FeedbackRequest = { survey: Survey; eventName: string | null };

/** Home "Feedback requested" card: open surveys with the event they are about (surveys.event_id). */
export async function listFeedbackRequests(centerId: string, personId: string): Promise<FeedbackRequest[]> {
  const surveys = await listOpenSurveys(centerId, personId);
  const eventIds = [...new Set(surveys.map((s) => s.event_id).filter((x): x is string => !!x))];
  const events = eventIds.length ? must(await supabase.from('events').select('id, name').in('id', eventIds), 'load the events these surveys are about') : [];
  const names = new Map(events.map((e) => [e.id, e.name]));
  return surveys.map((survey) => ({ survey, eventName: survey.event_id ? (names.get(survey.event_id) ?? null) : null }));
}

/**
 * What Home shows for feedback: the open, unanswered surveys (the card stays
 * until a survey closes) and, at most once per day for the first days after a
 * survey opens, the one to ask about in the "How was <event>?" pop-up.
 */
export type FeedbackHome = {
  requests: FeedbackRequest[];
  /** The request whose pop-up should show now (adults only), or null. */
  popup: FeedbackRequest | null;
  /** The center's local date this was worked out for ('YYYY-MM-DD'). */
  today: string;
};

export async function loadFeedbackHome(center: Center, member: Member): Promise<FeedbackHome> {
  const requests = await listFeedbackRequests(center.id, member.person.id);
  const now = new Date();
  const today = todayAt(center.time_zone, now);
  if (!member.isAdult || requests.length === 0) return { requests, popup: null, today };
  const dismissals = await readPopupDismissals();
  return { requests, popup: pickSurveyForPopup(requests, { now, tz: center.time_zone, dismissals }), today };
}

// ---------------------------------------------------------------------------
// Home event actions: the 24-hour confirmation prompt and the event-day lunch card
// ---------------------------------------------------------------------------

/** How many people are on each of these RSVPs (attendees not cancelled), by RSVP id: the "3" of "Going · 3" on an event tile. */
export async function countAttendees(rsvpIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (rsvpIds.length === 0) return out;
  const rows = must(await supabase.from('attendees').select('rsvp_id, status').in('rsvp_id', rsvpIds), 'load your RSVPs');
  for (const r of rows) if (r.status !== 'cancelled') out.set(r.rsvp_id, (out.get(r.rsvp_id) ?? 0) + 1);
  return out;
}

/**
 * What the family has to act on today: the RSVP waiting for "Still coming?" (the pop-up opens by itself, the
 * event's tile carries a Confirm chip) and, on the day of an event, their lunch times. The events themselves,
 * with the family's RSVP status on each, are the Events row's own load (src/features/home-rails.tsx).
 */
export type HomeEvents = {
  confirm: { event: EventRow; rsvp: Rsvp; count: number; names: string[] } | null;
  lunch: { event: EventRow; card: LunchCard; checkedInAt: string | null } | null;
  timeZone: string;
};

export async function loadHomeEvents(center: Center, member: Member | null): Promise<HomeEvents> {
  const now = new Date();
  const today = todayAt(center.time_zone, now);
  const events = await listUpcomingEvents(center.id);
  const householdId = member?.household?.id ?? null;
  const rsvps = householdId ? await listHouseholdRsvps(householdId, events.map((e) => e.id)) : new Map<string, Rsvp>();

  const upcoming = events.filter((e) => e.status === 'live' || !e.starts_at || new Date(e.starts_at) >= now);

  let confirm: HomeEvents['confirm'] = null;
  for (const e of upcoming) {
    const r = rsvps.get(e.id);
    if (!r || rsvpState(r) !== 'rsvpd' || !e.starts_at) continue;
    const hoursLeft = (new Date(e.starts_at).getTime() - now.getTime()) / 3600000;
    if (hoursLeft > 0 && hoursLeft <= e.confirmation_hours_before) {
      const active = (await listAttendees(r.id)).filter((a) => a.status !== 'cancelled');
      confirm = { event: e, rsvp: r, count: active.length, names: active.map((a) => a.display_name) };
      break;
    }
  }

  let lunch: HomeEvents['lunch'] = null;
  for (const e of events) {
    const r = rsvps.get(e.id);
    if (!e.lunch_enabled || !r || rsvpState(r) === 'cancelled' || !e.starts_at) continue;
    if (todayAt(center.time_zone, new Date(e.starts_at)) !== today) continue;
    const [attendees, slots] = await Promise.all([listAttendees(r.id), listLunchSlots(e.id)]);
    const card = lunchCard(
      attendees.filter((a) => a.status !== 'cancelled').map((a) => ({ name: a.display_name, checkedIn: !!a.checked_in_at, slotStartsAt: slots.find((s) => s.id === a.lunch_slot_id)?.starts_at ?? null })),
      slots,
      center.time_zone,
    );
    if (card.state !== 'not_checked_in') {
      const checkedInAt = attendees.map((a) => a.checked_in_at).filter((x): x is string => !!x).sort()[0] ?? null;
      lunch = { event: e, card, checkedInAt };
      break;
    }
  }
  return { confirm, lunch, timeZone: center.time_zone };
}
