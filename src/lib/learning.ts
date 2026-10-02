/**
 * Pure rules for My Jain Way, Saathi, Gyan Path and Niva (no React Native
 * imports, so they are unit-tested in src/lib/__tests__/learning.test.ts).
 */
import type { StringKey } from '../i18n/en';

import { formatTimeOfDay, zonedParts } from './format';

// ---------------------------------------------------------------------------
// Community name and point rules (centers.short_name, centers.rules.points)
// ---------------------------------------------------------------------------

export function communityName(center: { short_name?: string | null; name?: string | null } | null | undefined): string {
  return (center?.short_name || center?.name || '').trim();
}

export type PointRules = { anumodana: number; support: number; dayBonus: number };

/** centers.rules.points with the server's own defaults (app.send_anumodana / app.log_practice). */
export function pointRules(rules: unknown): PointRules {
  const obj = rules && typeof rules === 'object' && !Array.isArray(rules) ? (rules as Record<string, unknown>) : {};
  const pts = obj.points && typeof obj.points === 'object' && !Array.isArray(obj.points) ? (obj.points as Record<string, unknown>) : {};
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : d);
  return { anumodana: num(pts.anumodana_points, 5), support: num(pts.support_points, 3), dayBonus: num(pts.day_complete_bonus, 20) };
}

// ---------------------------------------------------------------------------
// Practices
// ---------------------------------------------------------------------------

const CATEGORY_KEYS: Record<string, StringKey> = {
  mantra_jaap: 'jw.cat.mantra_jaap',
  tapasya_pachchakhan: 'jw.cat.tapasya_pachchakhan',
  darshan_puja: 'jw.cat.darshan_puja',
  samayik_pratikraman: 'jw.cat.samayik_pratikraman',
  swadhyay_learning: 'jw.cat.swadhyay_learning',
};

/** The prototype's five category labels; other keys are shown title-cased ("seva" → "Seva"). */
export function categoryLabel(category: string, t: (k: StringKey) => string): string {
  const key = CATEGORY_KEYS[category];
  if (key) return t(key);
  const words = category.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "06:45:00" → minutes after midnight, or null. */
export function clockMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export type PracticeTiming = { label: string; minutes: number | null; kind: 'at' | 'by' | 'before' | 'anytime' };

/**
 * Time of day for a practice. Navkarsi and Chauvihar follow today's published
 * timings (sunrise/sunset based); others use practices.default_time.
 */
export function practiceTiming(
  p: { key: string; default_time: string | null },
  timings: { navkarsi?: string | null; chauvihar?: string | null } | null,
): PracticeTiming {
  if (p.key === 'navkarsi' && timings?.navkarsi) return { label: formatTimeOfDay(timings.navkarsi), minutes: clockMinutes(timings.navkarsi), kind: 'by' };
  if (p.key === 'chauvihar' && timings?.chauvihar) return { label: formatTimeOfDay(timings.chauvihar), minutes: clockMinutes(timings.chauvihar), kind: 'before' };
  const mins = clockMinutes(p.default_time);
  if (mins === null) return { label: '', minutes: null, kind: 'anytime' };
  return { label: formatTimeOfDay(p.default_time), minutes: mins, kind: 'at' };
}

/** Sort by time of day; practices without a time keep their catalog order at the end. */
export function sortByTime<T extends { sort_order: number }>(items: T[], minutes: (item: T) => number | null): T[] {
  return [...items].sort((a, b) => {
    const ma = minutes(a);
    const mb = minutes(b);
    if (ma !== null && mb !== null && ma !== mb) return ma - mb;
    if (ma === null && mb !== null) return 1;
    if (ma !== null && mb === null) return -1;
    return a.sort_order - b.sort_order;
  });
}

/** Reminder 10 minutes before a practice, wrapped around midnight. */
export function reminderClock(minutes: number, before = 10): { hour: number; minute: number } {
  const m = (((minutes - before) % 1440) + 1440) % 1440;
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

/** "Your standing" bar colour: top 20% or better is green, otherwise saffron. */
export function standingTone(topPercent: number | null): 'green' | 'saffron' | 'none' {
  if (topPercent === null) return 'none';
  return topPercent <= 20 ? 'green' : 'saffron';
}

// ---------------------------------------------------------------------------
// Pachchakhan reminder time
// ---------------------------------------------------------------------------

/**
 * The first clock time in a pachchakhan's "when" text ("today 8:02 AM",
 * "about 1:15 PM today", "by 7:21 PM") or a metadata time ("08:02"), as
 * minutes after midnight.
 */
export function parseClockTime(text: string | null | undefined): number | null {
  if (!text) return null;
  const ampm = /(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?/.exec(text);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = ampm[2] ? Number(ampm[2]) : 0;
    if (h < 1 || h > 12 || min > 59) return null;
    const pm = ampm[3].toLowerCase() === 'p';
    if (h === 12) h = 0;
    return (pm ? h + 12 : h) * 60 + min;
  }
  const h24 = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$/.exec(text);
  if (h24) return clockMinutes(`${h24[1]}:${h24[2]}`);
  return null;
}

/** Local Date for `minutes` today in the given zone's wall clock, as seen from `now` (device clock). */
export function todayAtMinutes(minutes: number, now: Date, timeZone?: string | null): Date {
  const parts = zonedParts(now, timeZone);
  const nowMinutes = parts.hour * 60 + parts.minute;
  return new Date(now.getTime() + (minutes - nowMinutes) * 60000 - now.getSeconds() * 1000 - now.getMilliseconds());
}

// ---------------------------------------------------------------------------
// Saathi
// ---------------------------------------------------------------------------

export type FeedKind = 'goal_completed' | 'daily_goal_met' | 'behind';
export type FeedItem = {
  kind: FeedKind;
  person_id: string;
  person_name: string;
  title: string;
  detail: string;
  occurred_at: string;
  anumodana_count: number;
  i_sent: boolean;
};

/** "No practice logged for 3 days" → 3. */
export function behindDays(detail: string): number | null {
  const m = /(\d+)\s+days?/.exec(detail);
  return m ? Number(m[1]) : null;
}

/**
 * Celebrations to show: newest first, one daily-goal card per person (their
 * latest), every goal completion; capped. "behind" items are support asks.
 */
export function splitFeed(items: FeedItem[], cap = 4): { celebrate: FeedItem[]; behind: FeedItem[] } {
  const sorted = [...items].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const seenDaily = new Set<string>();
  const seenBehind = new Set<string>();
  const celebrate: FeedItem[] = [];
  const behind: FeedItem[] = [];
  for (const it of sorted) {
    if (it.kind === 'behind') {
      if (!seenBehind.has(it.person_id)) behind.push(it);
      seenBehind.add(it.person_id);
    } else if (it.kind === 'daily_goal_met') {
      if (!seenDaily.has(it.person_id) && celebrate.length < cap) celebrate.push(it);
      seenDaily.add(it.person_id);
    } else if (celebrate.length < cap) {
      celebrate.push(it);
    }
  }
  return { celebrate, behind };
}

/** Red dot on the Saathi tab: a celebration nobody here has cheered yet, or an open support ask. */
export function saathiNeedsAttention(items: FeedItem[], canSupport: boolean): boolean {
  const { celebrate, behind } = splitFeed(items);
  return celebrate.some((c) => !c.i_sent) || (canSupport && behind.some((b) => !b.i_sent));
}

/** "JUST NOW" · "2 HOURS AGO" · "THIS MORNING" · "YESTERDAY" · "3 DAYS AGO" (upper-cased by the caller). */
export function relativeWhen(iso: string, now: Date, timeZone?: string | null): { key: StringKey; n?: number } {
  const then = new Date(iso);
  const mins = Math.floor((now.getTime() - then.getTime()) / 60000);
  const a = zonedParts(then, timeZone);
  const b = zonedParts(now, timeZone);
  if (mins < 60) return { key: 'saathi.when.now' };
  if (a.iso === b.iso) {
    if (mins < 180) return { key: 'saathi.when.hours', n: Math.floor(mins / 60) };
    if (a.hour < 12) return { key: 'saathi.when.morning' };
    if (a.hour < 17) return { key: 'saathi.when.afternoon' };
    return { key: 'saathi.when.evening' };
  }
  const dayMs = 86400000;
  const days = Math.round((Date.parse(`${b.iso}T00:00:00Z`) - Date.parse(`${a.iso}T00:00:00Z`)) / dayMs);
  if (days === 1) return { key: 'saathi.when.yesterday' };
  return { key: 'saathi.when.days', n: days };
}

export type CircleStatus = 'met' | 'onTrack' | 'completed' | 'behind' | 'encouraged' | 'private';

export function circleStatus(s: { visible: boolean; doneToday: number; selected: number; behind: FeedItem | null; completedGoal: boolean }): CircleStatus {
  if (!s.visible) return 'private';
  if (s.behind) return s.behind.i_sent ? 'encouraged' : 'behind';
  if (s.selected > 0 && s.doneToday >= s.selected) return 'met';
  if (s.completedGoal) return 'completed';
  return 'onTrack';
}

// ---------------------------------------------------------------------------
// Gyan Path
// ---------------------------------------------------------------------------

/** Map background: the goal tint mixed with white (prototype: #1B2C5C → #E9ECF5). */
export function tintBackground(hex: string | null | undefined, amount = 0.9): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#F6EFE3';
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Goal tile letter: gyan_goals.mark, else the first letter after "Learn ". */
export function goalMark(goal: { mark: string | null; name: string }): string {
  if (goal.mark?.trim()) return goal.mark.trim();
  const name = goal.name.replace(/^learn\s+/i, '').trim();
  return (name.charAt(0) || '?').toUpperCase();
}

export type MapNode = { kind: 'node'; index: number; x: number; y: number; size: number } | { kind: 'chapter'; label: string; y: number; chapterIndex: number };

/**
 * Zigzag map layout (GyanPath.dc.html): x cycles 50% → 72% → 50% → 28% of the
 * width; a chapter pill takes 72px; the current node is 84px (150px row),
 * the boss 76px, others 66px (132px rows). y is the node's top edge.
 */
export function mapLayout(levels: { chapter: string | null }[], current: number, width: number): { items: MapNode[]; height: number } {
  const XS = [0.5, 280 / 390, 0.5, 110 / 390];
  const items: MapNode[] = [];
  let y = 24;
  let prevChapter: string | null = null;
  let chapterIndex = -1;
  levels.forEach((l, i) => {
    const ch = l.chapter?.trim() || null;
    if (ch && ch !== prevChapter) {
      chapterIndex += 1;
      items.push({ kind: 'chapter', label: ch, y, chapterIndex });
      y += 72;
    }
    prevChapter = ch ?? prevChapter;
    const isCur = i === current;
    const isBoss = i === levels.length - 1;
    const size = isCur ? 84 : isBoss ? 76 : 66;
    items.push({ kind: 'node', index: i, x: Math.round(width * XS[i % 4]), y, size });
    y += isCur ? 150 : 132;
  });
  return { items, height: y + 16 };
}

/** The chapter the member is in now ("Sutras of Samayik"), without the "Chapter 2 · " prefix. */
export function currentChapter(levels: { chapter: string | null }[], current: number): string | null {
  const upto = levels.slice(0, Math.min(current, levels.length - 1) + 1);
  const ch = [...upto].reverse().find((l) => l.chapter?.trim())?.chapter?.trim() ?? null;
  return ch ? ch.replace(/^chapter\s+\d+\s*[·:.-]\s*/i, '') : null;
}

/** ★★☆ for a level: the lowest star count across its steps (0 when not done). */
export function levelStars(stepStars: number[]): number {
  if (stepStars.length === 0) return 0;
  return Math.max(0, Math.min(3, Math.min(...stepStars)));
}

/** Quiz accuracy for the celebration: first-try correct answers / questions (100% with no quiz). */
export function accuracyPercent(correct: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((Math.max(0, Math.min(correct, total)) * 100) / total);
}

/**
 * Points actually credited for this run: app.award_step_points adds a step's
 * points once, the first time it is completed. Replays earn stars, not points.
 */
export function pointsEarned(steps: { id: string; points: number }[], alreadyDone: Set<string>): number {
  return steps.filter((s) => !alreadyDone.has(s.id)).reduce((sum, s) => sum + Math.max(0, s.points || 0), 0);
}

/** Which goal the Learn hero continues: most recently active unfinished goal, else the recommended one, else the first. */
export function continueGoalId<G extends { id: string; recommended: boolean }>(goals: G[], lastActivity: Map<string, string>, isComplete: (g: G) => boolean): string | null {
  const open = goals.filter((g) => !isComplete(g));
  const active = open.filter((g) => lastActivity.has(g.id)).sort((a, b) => (lastActivity.get(b.id) ?? '').localeCompare(lastActivity.get(a.id) ?? ''));
  return active[0]?.id ?? open.find((g) => g.recommended)?.id ?? open[0]?.id ?? goals[0]?.id ?? null;
}

export const DAILY_MINUTES = [5, 10, 15] as const;
export type DailyMinutes = (typeof DAILY_MINUTES)[number];

export function isDailyMinutes(v: unknown): v is DailyMinutes {
  return v === 5 || v === 10 || v === 15;
}

// ---------------------------------------------------------------------------
// Niva
// ---------------------------------------------------------------------------

/** One source Niva cited: its title, and the web page it came from when there is one. */
export type NivaSource = { title: string; url?: string };

function firstText(...values: unknown[]): string {
  const v = values.find((x) => typeof x === 'string' && x.trim());
  return typeof v === 'string' ? v.trim() : '';
}

/** Only a plain web address opens: anything else (javascript:, tel:, an app's own scheme, junk) is not a link. */
function webUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const url = raw.trim();
  return /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(url) ? url : undefined;
}

/**
 * niva_conversations.sources jsonb → the sources to show, each once, in the
 * order Niva cited them. The worker stores [{content_item_id, title, url?}]
 * (url only for a source imported from a web page); older rows hold plain
 * strings or {label | name | source}. A copy is a repeat when its title
 * matches and its web address matches or is missing: it keeps the first
 * place, and fills in the address when the first copy had none. Two pages
 * with the same title but different addresses (imported pages often share
 * one, like "Membership") are both kept, so each links to its own page.
 */
export function parseSources(raw: unknown): NivaSource[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: NivaSource[] = [];
  const at = new Map<string, number[]>();
  for (const s of list) {
    let title = '';
    let url: string | undefined;
    if (typeof s === 'string') title = s.trim();
    else if (s && typeof s === 'object') {
      const o = s as Record<string, unknown>;
      title = firstText(o.title, o.label, o.name, o.source);
      url = webUrl(o.url) ?? webUrl(o.source_url);
    }
    if (!title) continue;
    const seen = at.get(title) ?? [];
    if (seen.length && (!url || seen.some((i) => out[i].url === url))) continue;
    const bare = url ? seen.find((i) => !out[i].url) : undefined;
    if (bare !== undefined) {
      out[bare] = { title, url };
      continue;
    }
    at.set(title, [...seen, out.length]);
    out.push(url ? { title, url } : { title });
  }
  return out;
}

/** niva_conversations.sources jsonb → "JSH website · About JSH" (each title once), or null. */
export function formatSources(raw: unknown): string | null {
  const names = [...new Set(parseSources(raw).map((s) => s.title))];
  return names.length ? names.join(' · ') : null;
}

export function normaliseQuestion(q: string): string {
  return q.trim().replace(/\s+/g, ' ');
}

/** How often the Niva screen checks for answers while a question is being looked up. */
export const NIVA_POLL_MS = 3000;
/** How long the app waits for an answer before saying Niva cannot answer. */
export const NIVA_WAIT_MS = 90000;
/** The same question sent again within this time (a double tap) is ignored. */
export const NIVA_REPEAT_MS = 10000;

/**
 * niva_conversations.answer_status values (connect-crm 0572) that mean the
 * worker finished without an answer. 'pending' and 'paused' (waiting out an
 * AI spending limit) keep waiting; so does a row with no status at all, which
 * is what this app reads until the generated types carry the column.
 */
const NIVA_NO_ANSWER_STATUSES = new Set(['no_source', 'unsure', 'refused', 'failed']);

export type NivaRowLike = { id: string; question: string; answer: string | null; created_at: string };

/** What the member sees under a question that has been saved. */
export type NivaPhase = 'looking' | 'answered' | 'no_answer' | 'check_failed';

export type NivaWaitOptions = {
  /** Device time when this device saved the question (askNiva returned). Wins over created_at, so a device clock that is ahead or behind never changes the wait. */
  startedAt?: number | null;
  /** Device time when a row from history was loaded: the wait never runs past this + NIVA_WAIT_MS, even when created_at looks like the future. */
  seenAt?: number | null;
};

function nivaHasAnswer(row: { answer: string | null }): boolean {
  return typeof row.answer === 'string' && row.answer.trim().length > 0;
}

/** answer_status when the row carries it (read defensively: the column is newer than the copied types). */
export function nivaAnswerStatus(row: object): string | null {
  const v = (row as { answer_status?: unknown }).answer_status;
  return typeof v === 'string' && v ? v : null;
}

/** Device time when the app stops waiting for this row's answer. */
export function nivaWaitEnds(row: { created_at: string }, opts: NivaWaitOptions = {}): number {
  if (opts.startedAt != null) return opts.startedAt + NIVA_WAIT_MS;
  const created = Date.parse(row.created_at);
  if (!Number.isFinite(created)) return (opts.seenAt ?? 0) + NIVA_WAIT_MS;
  return (opts.seenAt != null ? Math.min(created, opts.seenAt) : created) + NIVA_WAIT_MS;
}

/**
 * One saved question's state:
 * - an answer always wins (also over unanswered = true, so a regenerated answer stays visible);
 * - a finished-without-answer status (no_source, unsure, refused, failed) is no_answer at once;
 * - otherwise 'looking' until the wait ends, then no_answer — or check_failed when the app's last
 *   check for this row failed, so "unable to answer" is never shown when the app could not check.
 */
export function nivaPhase(row: { answer: string | null; created_at: string }, opts: NivaWaitOptions & { now: number; lastCheckFailed?: boolean }): NivaPhase {
  if (nivaHasAnswer(row)) return 'answered';
  const status = nivaAnswerStatus(row);
  if (status && NIVA_NO_ANSWER_STATUSES.has(status)) return 'no_answer';
  if (opts.now < nivaWaitEnds(row, opts)) return 'looking';
  return opts.lastCheckFailed ? 'check_failed' : 'no_answer';
}

export type NivaLocal<R> = { key: string; question: string; status: 'saving' | 'failed'; error?: string } | { key: string; question: string; row: R; startedAt: number };

export type NivaRowItem<R> = { key: string; question: string; row: R; startedAt: number | null; seenAt: number | null };
export type NivaItem<R> = Extract<NivaLocal<R>, { status: string }> | NivaRowItem<R>;

export function isNivaRowItem<R>(item: NivaItem<R>): item is NivaRowItem<R> {
  return 'row' in item;
}

/** Keep polling while any saved question is still being looked up. */
export function nivaShouldPoll<R extends { answer: string | null; created_at: string }>(items: NivaItem<R>[], now: number): boolean {
  return items.some((i) => isNivaRowItem(i) && nivaPhase(i.row, { now, startedAt: i.startedAt, seenAt: i.seenAt }) === 'looking');
}

/** The newest copy of a row: the last one given, except that a copy with an answer is never replaced by one without. */
function newestCopy<R extends { answer: string | null }>(...copies: (R | undefined)[]): R {
  const present = copies.filter((c): c is R => c !== undefined);
  const answered = present.filter(nivaHasAnswer);
  const pool = answered.length ? answered : present;
  return pool[pool.length - 1];
}

/**
 * The chat as one list, each question once: past questions (oldest first),
 * then the ones asked on this screen in the order they were asked (saved,
 * saving or failed), each with the newest copy of its row — from the history
 * reload or from the answer check (`fresh`). A question asked here that a
 * reload brought back keeps its place, its key and its device-side wait, so a
 * failed question never jumps behind one asked after it.
 */
export function mergeNivaRows<R extends NivaRowLike>(history: R[], locals: NivaLocal<R>[], opts: { fresh?: Record<string, R>; seenAt?: number | null } = {}): NivaItem<R>[] {
  const fresh = opts.fresh ?? {};
  const askedHere = new Set<string>();
  for (const l of locals) if ('row' in l) askedHere.add(l.row.id);
  const stored = new Map<string, R>();
  const out: NivaItem<R>[] = [];
  for (const h of history) {
    if (stored.has(h.id)) continue;
    stored.set(h.id, h);
    if (askedHere.has(h.id)) continue;
    const row = newestCopy(h, fresh[h.id]);
    out.push({ key: h.id, question: row.question, row, startedAt: null, seenAt: opts.seenAt ?? null });
  }
  const seen = new Set<string>();
  for (const l of locals) {
    if (!('row' in l)) {
      out.push(l);
      continue;
    }
    if (seen.has(l.row.id)) continue;
    seen.add(l.row.id);
    const row = newestCopy(l.row, stored.get(l.row.id), fresh[l.row.id]);
    out.push({ key: l.key, question: row.question, row, startedAt: l.startedAt, seenAt: null });
  }
  return out;
}

/** A Markdown answer as plain words for a screen-reader announcement (no #, *, bullet marks or link addresses). */
export function nivaSpoken(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .split('\n')
    .map((l) => l.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*([-*•]|\d+\.)\s+/, '').trim())
    .filter(Boolean)
    .join(' ');
}

/** A question cut to `max` characters for a button's accessibility label, so a screen reader soon reaches the button's name. */
export function nivaShortQuestion(question: string, max = 80): string {
  const q = normaliseQuestion(question);
  return q.length > max ? `${q.slice(0, max).trimEnd()}…` : q;
}

/** True when the same question was sent less than NIVA_REPEAT_MS ago (a double tap): ignore it. */
export function nivaIsRepeat(last: { question: string; at: number } | null, question: string, now: number): boolean {
  if (!last) return false;
  return last.question.toLowerCase() === normaliseQuestion(question).toLowerCase() && now - last.at < NIVA_REPEAT_MS;
}

// ---------------------------------------------------------------------------
// Pathshala (enrollment, schedule, attendance)
// ---------------------------------------------------------------------------

export type TermLike = { status: string; registration_opens_at: string | null; registration_closes_at: string | null; ends_on: string };

/**
 * A family may ask for a place when the office has opened registration
 * (status "registration"), or while an active term's registration window is
 * open. Closed and draft terms never take requests.
 */
export function registrationOpen(term: TermLike, now: Date): boolean {
  if (term.status === 'registration') {
    if (term.registration_closes_at && new Date(term.registration_closes_at) < now) return false;
    return true;
  }
  if (term.status !== 'active') return false;
  if (!term.registration_opens_at && !term.registration_closes_at) return false;
  if (term.registration_opens_at && new Date(term.registration_opens_at) > now) return false;
  if (term.registration_closes_at && new Date(term.registration_closes_at) < now) return false;
  return true;
}

const DAY_PLURAL: Record<string, string> = {
  sunday: 'Sundays',
  monday: 'Mondays',
  tuesday: 'Tuesdays',
  wednesday: 'Wednesdays',
  thursday: 'Thursdays',
  friday: 'Fridays',
  saturday: 'Saturdays',
};

/** "sunday" + "10:00:00" → "Sundays 10:00 AM" (the prototype's schedule line). */
export function classSchedule(meetsOn: string | null | undefined, startsTime: string | null | undefined): string | null {
  const day = meetsOn ? (DAY_PLURAL[meetsOn.toLowerCase()] ?? meetsOn) : null;
  const time = startsTime ? formatTimeOfDay(startsTime) : null;
  return [day, time].filter(Boolean).join(' ') || null;
}

export type AttendanceMark = { status: string; held_on: string };

/** Latest mark plus "present or late" out of all marked class days. */
export function attendanceSummary(marks: AttendanceMark[]): { last: AttendanceMark | null; attended: number; total: number } {
  const sorted = [...marks].sort((a, b) => (a.held_on < b.held_on ? 1 : a.held_on > b.held_on ? -1 : 0));
  const attended = marks.filter((m) => m.status === 'present' || m.status === 'late').length;
  return { last: sorted[0] ?? null, attended, total: marks.length };
}
