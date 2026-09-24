/**
 * Pure display rules for the Home and Events tabs (M-HOME). No React, no
 * Supabase: everything here is unit tested in __tests__/event-rules.test.ts.
 */
import { addDays, daysBetween, parseISODate, zonedParts } from '@/lib/format';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 10:00 → "10 AM", 10:30 → "10:30 AM" (the prototype's compact time). */
export function compactClock(hour: number, minute: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${h12} ${suffix}` : `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** Timestamp → "10 AM" at the center. */
export function compactTime(ts: string | null | undefined, tz?: string | null): string {
  if (!ts) return '';
  const p = zonedParts(new Date(ts), tz);
  return compactClock(p.hour, p.minute);
}

/** Timestamp → "Sun 10 AM" at the center (Home next-event row, confirm card). */
export function shortWhen(ts: string | null | undefined, tz?: string | null): string {
  if (!ts) return '';
  const p = zonedParts(new Date(ts), tz);
  return `${WEEKDAYS[p.weekday] ?? ''} ${compactClock(p.hour, p.minute)}`.trim();
}

/** 'today' | 'tomorrow' | null for an event date relative to the center's today. */
export function relativeDay(eventIso: string | null, todayIso: string): 'today' | 'tomorrow' | null {
  if (!eventIso) return null;
  const n = daysBetween(todayIso, eventIso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return null;
}

/**
 * The 24-hour confirmation schedule the prototype describes: the reminder is
 * sent `hoursBefore` the start ("Sent Sat 10 AM · 24 hrs before"), replies are
 * asked for by 9 PM the evening before, and one more nudge goes at 6 PM that
 * evening. Returned as display strings at the center.
 */
export function confirmSchedule(startsAt: string, tz: string | null | undefined, hoursBefore: number): { sentAt: string; replyBy: string; nudgeAt: string } {
  const start = new Date(startsAt);
  const sent = new Date(start.getTime() - Math.max(1, hoursBefore) * 3600 * 1000);
  const startIso = zonedParts(start, tz).iso;
  const eve = addDays(startIso, -1);
  return {
    sentAt: shortWhen(sent.toISOString(), tz),
    replyBy: `${WEEKDAYS[weekdayOfIso(eve)]} ${compactClock(21, 0)}`,
    nudgeAt: compactClock(18, 0),
  };
}

function weekdayOfIso(iso: string): number {
  const p = parseISODate(iso);
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : 0;
}

/** "SEP 8–16", "SEP 28 – OCT 2", "SEP 12" for the feedback hero eyebrow. */
export function dateRangeShort(start: string | null | undefined, end: string | null | undefined, tz?: string | null): string {
  if (!start) return '';
  const a = parseISODate(zonedParts(new Date(start), tz).iso);
  const b = end ? parseISODate(zonedParts(new Date(end), tz).iso) : null;
  if (!a) return '';
  const ma = MONTHS[a.m - 1].toUpperCase();
  if (!b || (b.y === a.y && b.m === a.m && b.d === a.d)) return `${ma} ${a.d}`;
  if (b.y === a.y && b.m === a.m) return `${ma} ${a.d}\u2013${b.d}`;
  return `${ma} ${a.d} \u2013 ${MONTHS[b.m - 1].toUpperCase()} ${b.d}`;
}

// ---------------------------------------------------------------------------
// Special days (Home card)
// ---------------------------------------------------------------------------

/** Eyebrow lead: TODAY / TOMORROW / IN 1 WEEK / IN 2 WEEKS / IN n DAYS. */
export function specialDayLead(inDays: number): { kind: 'today' | 'tomorrow' | 'weeks' | 'days'; n: number } {
  if (inDays <= 0) return { kind: 'today', n: 0 };
  if (inDays === 1) return { kind: 'tomorrow', n: 1 };
  if (inDays % 7 === 0) return { kind: 'weeks', n: inDays / 7 };
  return { kind: 'days', n: inDays };
}

/** Age someone turns on `onIso`, or null if the date of birth is unknown. */
export function turnsAge(dob: string | null | undefined, onIso: string): number | null {
  const b = parseISODate(dob);
  const o = parseISODate(onIso);
  if (!b || !o) return null;
  const age = o.y - b.y - (o.m < b.m || (o.m === b.m && o.d < b.d) ? 1 : 0);
  return age >= 0 ? age : null;
}

export type Pronoun = 'her' | 'his' | 'their';

export function pronounFor(gender: string | null | undefined): Pronoun {
  const g = (gender ?? '').toLowerCase();
  if (g === 'female') return 'her';
  if (g === 'male') return 'his';
  return 'their';
}

/** Storage key for "Not this year": one dismissal per day per occurrence year. */
export function specialDayDismissKey(dayId: string, nextIso: string): string {
  return `${dayId}:${nextIso.slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// Lunch groups (tickets)
// ---------------------------------------------------------------------------

export type LunchWhyInput = {
  isFirstSlot: boolean;
  members: { name: string; childUnder12: boolean; senior: boolean }[];
  checkedInTime: string | null;
  movedByYou: boolean;
};

export type LunchWhy = { tag: 'starts' | 'assigned' | 'moved'; why: { kind: 'child' | 'seniors' | 'arrival' | 'moved' | 'none'; names: string[]; time: string | null } };

/**
 * The "why" line under a lunch group (prototype L338–343): a family with a
 * child under 12 eats together at the first slot, seniors eat first, others are
 * seated by arrival then RSVP order; a move by the member says so.
 */
export function lunchWhy(g: LunchWhyInput): LunchWhy {
  if (g.movedByYou) return { tag: 'moved', why: { kind: 'moved', names: [], time: null } };
  if (g.isFirstSlot) {
    if (g.members.some((m) => m.childUnder12)) return { tag: 'starts', why: { kind: 'child', names: [], time: null } };
    const seniors = g.members.filter((m) => m.senior).map((m) => m.name);
    if (seniors.length) return { tag: 'starts', why: { kind: 'seniors', names: seniors, time: null } };
    return { tag: 'starts', why: g.checkedInTime ? { kind: 'arrival', names: [], time: g.checkedInTime } : { kind: 'none', names: [], time: null } };
  }
  return { tag: 'assigned', why: g.checkedInTime ? { kind: 'arrival', names: [], time: g.checkedInTime } : { kind: 'none', names: [], time: null } };
}

// ---------------------------------------------------------------------------
// Giving card
// ---------------------------------------------------------------------------

/** "Platinum $5,000 · Gold $2,500 · Silver $1,000" when a campaign has fixed-amount levels. */
export function tierLadder(levels: { name: string; amount_cents: number | null }[], format: (cents: number) => string): string | null {
  const fixed = levels.filter((l): l is { name: string; amount_cents: number } => typeof l.amount_cents === 'number' && l.amount_cents > 0);
  if (fixed.length < 2) return null;
  return [...fixed]
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .map((l) => `${l.name} ${format(l.amount_cents)}`)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const NEW_YEAR_MONTHS = ['kartak', 'kartik', 'magshar', 'maagshar', 'margshirsh', 'posh', 'paush', 'pauh'];

/**
 * Vir (Nirvana) Samvat year. The year turns the day after Diwali (Kartak sud
 * 1), so Sep 2026 is 2552 and late Nov 2026 is 2553. With the day's tithi
 * month we know which side of Diwali a late-year date falls on; without it we
 * assume the turn has not happened before November 15.
 */
export function virSamvat(iso: string, tithiMonth?: string | null): number | null {
  const p = parseISODate(iso);
  if (!p) return null;
  const base = p.y + 526;
  if (p.m < 10) return base;
  const month = (tithiMonth ?? '').trim().toLowerCase();
  if (month) return NEW_YEAR_MONTHS.some((m) => month.startsWith(m)) ? base + 1 : base;
  return p.m > 11 || (p.m === 11 && p.d >= 15) ? base + 1 : base;
}

/** Prototype chip order: Jain tithi, festivals, Pathshala, events, custom; school districts are their own group. */
export function orderLayers<T extends { kind: string; name: string }>(layers: T[]): { main: T[]; schools: T[] } {
  const rank: Record<string, number> = { tithi: 0, festival: 1, pathshala: 2, events: 3, custom: 4 };
  const main = layers.filter((l) => l.kind !== 'school_district').sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || a.name.localeCompare(b.name));
  const schools = layers.filter((l) => l.kind === 'school_district').sort((a, b) => a.name.localeCompare(b.name));
  return { main, schools };
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1); ASCII-safe approximation by characters. */
function icsFold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 73) parts.push((i === 0 ? '' : ' ') + line.slice(i, i + 73));
  return parts.join('\r\n');
}

export type IcsItem = { uid: string; date: string; title: string; description?: string | null; calendar: string };

/** All-day VEVENTs for the chosen calendars (RFC 5545), for "Add these calendars to my phone". */
export function buildIcs(calName: string, items: IcsItem[], stamp: Date): string {
  const dt = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Community Connect//Member app//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(calName)}`];
  for (const it of items) {
    const start = it.date.replace(/-/g, '');
    const end = addDays(it.date, 1).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.uid}`,
      `DTSTAMP:${dt}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape(it.title)}`,
      `CATEGORIES:${icsEscape(it.calendar)}`,
      ...(it.description ? [`DESCRIPTION:${icsEscape(it.description)}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

/** webcal:// form of an ICS feed URL, so phones offer "Subscribe". */
export function toWebcal(url: string): string {
  return url.replace(/^https?:\/\//i, 'webcal://');
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationRoute =
  | { kind: 'confirm_popup'; eventId: string }
  | { kind: 'confirm_yes'; eventId: string }
  | { kind: 'confirm_screen'; eventId: string }
  | { kind: 'tickets'; eventId: string }
  | { kind: 'survey'; surveyId: string }
  | { kind: 'event_feedback'; eventId: string }
  | { kind: 'labh'; dayId: string }
  | { kind: 'special_days' }
  | { kind: 'event'; eventId: string }
  | { kind: 'url'; path: string }
  | null;

export const ACTION_CONFIRM_YES = 'confirm_yes';
export const ACTION_CONFIRM_CHANGE = 'confirm_change';
export const CATEGORY_RSVP_CONFIRM = 'rsvp_confirm';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Where a notification tap (or one of its action buttons) goes. Payload
 * `data` from the server: { type, event_id, survey_id, special_day_id, url }.
 * Unknown payloads return null (the app just opens).
 */
export function routeForNotification(data: unknown, actionId: string | null): NotificationRoute {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const type = (str(d.type) ?? '').toLowerCase();
  const eventId = str(d.event_id) ?? str(d.eventId);
  if (type === 'rsvp_confirm' || type === 'rsvp_reminder' || type === 'confirm') {
    if (!eventId) return null;
    if (actionId === ACTION_CONFIRM_YES) return { kind: 'confirm_yes', eventId };
    if (actionId === ACTION_CONFIRM_CHANGE) return { kind: 'confirm_screen', eventId };
    return { kind: 'confirm_popup', eventId };
  }
  if (type === 'lunch' || type === 'lunch_reminder' || type === 'tickets' || type === 'check_in') return eventId ? { kind: 'tickets', eventId } : null;
  if (type === 'feedback' || type === 'survey' || type === 'event_feedback') {
    const surveyId = str(d.survey_id) ?? str(d.surveyId);
    if (surveyId) return { kind: 'survey', surveyId };
    return eventId ? { kind: 'event_feedback', eventId } : null;
  }
  if (type === 'special_day' || type === 'labh') {
    const dayId = str(d.special_day_id) ?? str(d.dayId) ?? str(d.day_id);
    return dayId ? { kind: 'labh', dayId } : { kind: 'special_days' };
  }
  if (type === 'event' && eventId) return { kind: 'event', eventId };
  const url = str(d.url);
  if (url && url.startsWith('/') && !url.startsWith('//')) return { kind: 'url', path: url };
  return null;
}

/** Snooze for "Remind me later" on the in-app confirm pop-up. */
export const CONFIRM_POPUP_SNOOZE_MS = 3 * 3600 * 1000;

export function popupDue(snoozedUntil: number | null | undefined, now: number): boolean {
  return !snoozedUntil || snoozedUntil <= now;
}


// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/** Album date: "Sep 12, 2026", "Sep 8–16, 2026", "Sep 28 – Oct 2, 2026", or "Dec 2025" from when it was made. */
export function albumDate(eventStart: string | null | undefined, eventEnd: string | null | undefined, createdAt: string, tz?: string | null): string {
  if (eventStart) {
    const a = parseISODate(zonedParts(new Date(eventStart), tz).iso);
    const b = eventEnd ? parseISODate(zonedParts(new Date(eventEnd), tz).iso) : null;
    if (a) {
      if (!b || (b.y === a.y && b.m === a.m && b.d === a.d)) return `${MONTHS[a.m - 1]} ${a.d}, ${a.y}`;
      if (b.y === a.y && b.m === a.m) return `${MONTHS[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
      if (b.y === a.y) return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}, ${a.y}`;
      return `${MONTHS[a.m - 1]} ${a.d}, ${a.y} – ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`;
    }
  }
  const c = parseISODate(zonedParts(new Date(createdAt), tz).iso);
  return c ? `${MONTHS[c.m - 1]} ${c.y}` : '';
}

/** Stable palette index for an album id. */
export function paletteIndex(id: string, count: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return count > 0 ? h % count : 0;
}

/** Placeholder tile colour order from the prototype (L1003): (i*3 + floor(i/3)) % 4. */
export function tileColorIndex(i: number): number {
  return (i * 3 + Math.floor(i / 3)) % 4;
}

/** Wrap-around-free prev/next inside an album. */
export function stepIndex(i: number, delta: -1 | 1, total: number): number {
  return Math.max(0, Math.min(total - 1, i + delta));
}
