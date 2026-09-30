/**
 * Pure rules for the "How was <event>?" pop-up (no React Native imports, so
 * they are unit-tested in src/lib/__tests__/survey-popup.test.ts).
 *
 * When an event completes, connect-crm opens its feedback survey for 14 days
 * and sends a push now, on day 1 and on day 2. The pop-up follows the same
 * rhythm: at most once per local day, on the day the survey opens and the two
 * days after, and never once the member has answered or the survey is closed.
 * The Home "Feedback requested" card stays until the survey closes.
 */
import type { Translate } from '../i18n';

import { daysBetween, parseISODate, todayAt } from './format';

/** The pop-up may show on the day the survey opened and on this many days after it (local calendar days). */
export const POPUP_DAYS_AFTER_OPEN = 2;

/** Dismissals older than this are dropped when a new one is saved. */
const KEEP_DISMISSALS_DAYS = 14;

/** The survey columns the decision reads (a subset of `surveys`). */
export type PopupSurvey = {
  id: string;
  kind: string;
  status: string;
  event_id: string | null;
  opens_at: string | null;
  closes_at: string | null;
  completion_started_at: string | null;
  created_at: string;
};

/** Survey id → the local day ('YYYY-MM-DD' at the center) its pop-up was last closed. */
export type Dismissals = Record<string, string>;

export type PopupDecision = 'show' | 'not_event_feedback' | 'not_open' | 'completed' | 'window_over' | 'dismissed_today';

function at(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Open for answers right now: status open, inside its opens_at / closes_at window. */
export function isSurveyOpen(s: Pick<PopupSurvey, 'status' | 'opens_at' | 'closes_at'>, now: Date): boolean {
  if (s.status !== 'open') return false;
  const opens = at(s.opens_at);
  const closes = at(s.closes_at);
  if (opens !== null && opens > now.getTime()) return false;
  if (closes !== null && closes <= now.getTime()) return false;
  return true;
}

/** When the survey opened to members: connect-crm sets opens_at at launch; older rows fall back to their creation. */
export function surveyOpenedAt(s: Pick<PopupSurvey, 'opens_at' | 'completion_started_at' | 'created_at'>): Date | null {
  const ms = at(s.opens_at) ?? at(s.completion_started_at) ?? at(s.created_at);
  return ms === null ? null : new Date(ms);
}

/**
 * Should the pop-up show for this survey right now? Returns the reason it
 * should not, so callers and tests can tell the cases apart.
 */
export function surveyPopupDecision(input: {
  survey: PopupSurvey;
  now: Date;
  /** The center's time zone: "today" and "days after opening" are local calendar days. */
  tz: string | null;
  /** The member already answered (survey_completions). */
  completed?: boolean;
  dismissals: Dismissals;
}): PopupDecision {
  const { survey, now, tz, dismissals } = input;
  if (survey.kind !== 'event_feedback' || !survey.event_id) return 'not_event_feedback';
  if (!isSurveyOpen(survey, now)) return 'not_open';
  if (input.completed) return 'completed';
  const opened = surveyOpenedAt(survey);
  if (!opened) return 'window_over';
  const today = todayAt(tz, now);
  if (daysBetween(todayAt(tz, opened), today) > POPUP_DAYS_AFTER_OPEN) return 'window_over';
  if (dismissals[survey.id] === today) return 'dismissed_today';
  return 'show';
}

/** The first request (they arrive newest first) whose pop-up should show, or null. */
export function pickSurveyForPopup<T extends { survey: PopupSurvey }>(
  requests: readonly T[],
  ctx: { now: Date; tz: string | null; dismissals: Dismissals; completedIds?: ReadonlySet<string> },
): T | null {
  for (const r of requests) {
    const decision = surveyPopupDecision({ survey: r.survey, now: ctx.now, tz: ctx.tz, completed: ctx.completedIds?.has(r.survey.id) ?? false, dismissals: ctx.dismissals });
    if (decision === 'show') return r;
  }
  return null;
}

/** Read the stored dismissals defensively: anything that is not id → 'YYYY-MM-DD' is ignored. */
export function parseDismissals(raw: unknown): Dismissals {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Dismissals = {};
  for (const [id, day] of Object.entries(raw as Record<string, unknown>)) {
    const p = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? parseISODate(day) : null;
    if (typeof day === 'string' && p && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= 31) out[id] = day;
  }
  return out;
}

/** Add today's dismissal and drop the ones old enough to no longer matter. */
export function recordDismissal(dismissals: Dismissals, surveyId: string, today: string): Dismissals {
  const out: Dismissals = {};
  for (const [id, day] of Object.entries(dismissals)) {
    if (daysBetween(day, today) <= KEEP_DISMISSALS_DAYS) out[id] = day;
  }
  out[surveyId] = today;
  return out;
}

/**
 * "Earn 25 JSH points for sharing your feedback" / "You earned 25 JSH points",
 * in the community's own wording (the same "{points} {community} points" the
 * My Jain Way and Gyan Path screens use). Null when the survey gives no points.
 */
export function pointsLine(t: Translate, kind: 'earn' | 'earned', points: number, community: string): string | null {
  if (!(points > 0)) return null;
  const key = kind === 'earn' ? (points === 1 ? 'survey.earnPoint' : 'survey.earnPoints') : points === 1 ? 'survey.earnedPoint' : 'survey.earnedPoints';
  return t(key, { points: points.toLocaleString('en-US'), center: community }).replace(/\s{2,}/g, ' ');
}
