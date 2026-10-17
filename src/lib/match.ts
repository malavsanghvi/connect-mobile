/**
 * "Does your employer match?" (CatchTheMatch, connect-crm 0759, 0886 to 0888 and 0920 to 0922). Pure: no I/O, no React.
 *
 * Many employers match what their employees give. An adult tells the organization their employer (only with their consent),
 * sees the steps for claiming a match from that employer, says "I have asked my employer", and follows where each request
 * stands. The database answers with ONE card (`app.my_match_card`); this file reads it defensively (a missing or unknown field
 * becomes a safe default, never a crash), and says each state in the member's own words.
 *
 * There is no amount anywhere in this feature: the card carries none and nothing here shows or works one out.
 */
import type { StringKey, Translate } from '../i18n';

import { daysBetween, formatLongDate, parseISODate } from './format';

/** The database allows an employer's name of 1 to 120 characters. */
export const MAX_EMPLOYER_CHARS = 120;

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export const CLAIM_STATES = ['asked', 'requested', 'verified', 'received', 'declined', 'expired', 'withdrawn'] as const;
export type MatchClaimState = (typeof CLAIM_STATES)[number];

export function isClaimState(v: unknown): v is MatchClaimState {
  return typeof v === 'string' && (CLAIM_STATES as readonly string[]).includes(v);
}

export type WhoSubmits = 'member' | 'organization' | 'either';

export function isWhoSubmits(v: unknown): v is WhoSubmits {
  return v === 'member' || v === 'organization' || v === 'either';
}

/** The employer's entry in the shared directory. */
export type MatchProgram = { id: string; companyName: string; portal: string | null; portalUrl: string | null; deadlineNote: string | null };
export type MatchLink = { label: string; url: string };
/** The steps for claiming a match from that employer. `links` are https only. */
export type MatchProcess = {
  summary: string | null;
  whoSubmits: WhoSubmits | null;
  steps: string[];
  documents: string[];
  links: MatchLink[];
  typicalDays: number | null;
  tips: string | null;
};
/** The organization the steps tell the member to name: its registered name and tax ID. */
export type MatchOrg = { name: string; legalName: string | null; ein: string | null };
/** One of the member's OWN gifts that can still be claimed: its day and the last day to ask. Never an amount. */
export type MatchGift = { receivedOn: string; deadlineOn: string | null };
export type MatchClaim = {
  id: string;
  state: MatchClaimState;
  stateAt: string | null;
  companyName: string;
  receivedOn: string | null;
  deadlineOn: string | null;
  reportedByMember: boolean;
  canUndo: boolean;
};

export type MatchCard = {
  /** The employer on file, only if THIS sign-in consented to it. */
  employer: string | null;
  source: 'member' | 'paper_form' | null;
  consentedAt: string | null;
  withdrawnAt: string | null;
  /** The employer on the person's profile, to confirm ("Is X still your employer?"). */
  suggestion: string | null;
  isAdult: boolean;
  /** CatchTheMatch is on for this community. */
  matchingOn: boolean;
  program: MatchProgram | null;
  /** Null when the library has no steps for this employer. */
  process: MatchProcess | null;
  org: MatchOrg | null;
  gifts: MatchGift[];
  claims: MatchClaim[];
  /** Claims in a state this build does not know: left out of `claims`, counted so the caller can log it. */
  skippedClaims: number;
  /** The community's own today ('YYYY-MM-DD'), the day "days left" is counted from. */
  today: string | null;
};

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
}

/** A non-empty trimmed string, else null. */
function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function textList(v: unknown): string[] {
  return list(v).flatMap((x) => {
    const s = text(x);
    return s ? [s] : [];
  });
}

/** A real calendar day: 'YYYY-MM-DD' (a longer timestamp is cut to its day), else null. "2026-13-40" is not a day. */
function day(v: unknown): string | null {
  const s = text(v);
  const m = s ? /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(s) : null;
  const p = m ? parseISODate(m[1]) : null;
  if (!m || !p) return null;
  const check = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return check.getUTCFullYear() === p.y && check.getUTCMonth() === p.m - 1 && check.getUTCDate() === p.d ? m[1] : null;
}

function whole(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

/**
 * A link the app may open: https only, with a real host, no spaces and no user name or password in front of the host (a
 * link that reads like one site and goes to another). Anything else (http, javascript:, data:, mailto:, a bare word) is null.
 */
export function httpsUrl(v: unknown): string | null {
  const s = text(v);
  if (!s || s.length > 2000 || /\s/.test(s)) return null;
  const m = /^https:\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(s);
  if (!m) return null;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/i.test(m[1]) ? s : null;
}

function readProgram(v: unknown): MatchProgram | null {
  const o = obj(v);
  const id = text(o?.id);
  const companyName = text(o?.company_name);
  if (!o || !id || !companyName) return null;
  return { id, companyName, portal: text(o.portal), portalUrl: httpsUrl(o.portal_url), deadlineNote: text(o.deadline_note) };
}

function readProcess(v: unknown): MatchProcess | null {
  const o = obj(v);
  if (!o) return null;
  const steps = textList(o.steps);
  // The library keeps at least one step for an employer it knows; with none there is nothing to show.
  if (steps.length === 0) return null;
  const links = list(o.links).flatMap((raw): MatchLink[] => {
    const l = obj(raw);
    const url = httpsUrl(l?.url);
    return l && url ? [{ label: text(l.label) ?? url, url }] : [];
  });
  const days = whole(o.typical_days);
  return {
    summary: text(o.summary),
    whoSubmits: isWhoSubmits(o.who_submits) ? o.who_submits : null,
    steps,
    documents: textList(o.documents),
    links,
    typicalDays: days !== null && days > 0 ? days : null,
    tips: text(o.tips),
  };
}

function readOrg(v: unknown): MatchOrg | null {
  const o = obj(v);
  const name = text(o?.name) ?? text(o?.legal_name);
  if (!o || !name) return null;
  return { name, legalName: text(o.legal_name), ein: text(o.ein) };
}

function readGift(v: unknown): MatchGift | null {
  const o = obj(v);
  const receivedOn = day(o?.received_on);
  return o && receivedOn ? { receivedOn, deadlineOn: day(o.deadline_on) } : null;
}

function readClaim(v: unknown): MatchClaim | 'unknown' | null {
  const o = obj(v);
  const id = text(o?.id);
  if (!o || !id) return null;
  if (!isClaimState(o.state)) return 'unknown';
  return {
    id,
    state: o.state,
    stateAt: text(o.state_at),
    companyName: text(o.company_name) ?? '',
    receivedOn: day(o.received_on),
    deadlineOn: day(o.deadline_on),
    reportedByMember: o.reported_by_member === true,
    canUndo: o.can_undo === true,
  };
}

/**
 * Read `app.my_match_card`. Null when the answer is not an object at all. Everything else is safe by default: an unknown
 * adult/on flag means "no" (the card then shows nothing), a missing list is empty, a link that is not https is left out, a
 * claim in a state this build does not know is counted in `skippedClaims` and not shown.
 */
export function parseMatchCard(raw: unknown): MatchCard | null {
  const o = obj(raw);
  if (!o) return null;
  const claims: MatchClaim[] = [];
  let skippedClaims = 0;
  for (const c of list(o.claims)) {
    const read = readClaim(c);
    if (read === null || read === 'unknown') skippedClaims += 1;
    else claims.push(read);
  }
  return {
    employer: text(o.employer),
    source: o.source === 'member' || o.source === 'paper_form' ? o.source : null,
    consentedAt: text(o.consented_at),
    withdrawnAt: text(o.withdrawn_at),
    suggestion: text(o.suggestion),
    isAdult: o.is_adult === true,
    matchingOn: o.matching_on === true,
    program: readProgram(o.program),
    process: readProcess(o.process),
    org: readOrg(o.org),
    gifts: list(o.gifts).flatMap((g) => {
      const read = readGift(g);
      return read ? [read] : [];
    }),
    claims,
    skippedClaims,
    today: day(o.today),
  };
}

/** What `app.set_my_match_employer` answers (the employer part of the card): the employer now on file, or null when it says none. */
export function parseEmployerAnswer(raw: unknown): string | null {
  return text(obj(raw)?.employer);
}

/** What `app.report_my_match_request` answers: how many gifts were marked as asked. Null when it is not a whole number of at least one. */
export function parseReported(raw: unknown): number | null {
  const n = whole(obj(raw)?.requested);
  return n !== null && n >= 1 ? n : null;
}

// ---------------------------------------------------------------------------
// What the screen shows
// ---------------------------------------------------------------------------

/**
 * `ready`: show the feature. `child`: a person under 18 gets "Ask a parent" (adults only, mirrored by the database).
 * `off`: CatchTheMatch is not on for this community, so the card is hidden and the screen says it is not available.
 */
export type MatchAvailability = 'ready' | 'child' | 'off';

export function matchAvailability(card: Pick<MatchCard, 'isAdult' | 'matchingOn'>): MatchAvailability {
  if (!card.isAdult) return 'child';
  return card.matchingOn ? 'ready' : 'off';
}

/** The entry card on Give shows only for an adult in a community where CatchTheMatch is on. */
export function showsMatchEntry(card: Pick<MatchCard, 'isAdult' | 'matchingOn'> | null | undefined): boolean {
  return !!card && matchAvailability(card) === 'ready';
}

/** The steps are there to follow (and so there is something to report). */
export function hasSteps(card: Pick<MatchCard, 'employer' | 'process'>): boolean {
  return card.employer !== null && card.process !== null;
}

/** "I have asked my employer" is offered only with steps on screen and at least one gift that can still be claimed. */
export function canReport(card: Pick<MatchCard, 'employer' | 'process' | 'gifts'>): boolean {
  return hasSteps(card) && card.gifts.length > 0;
}

export type EmployerProblem = 'empty' | 'long';

/** What the member typed, tidied (trimmed, runs of spaces made one), or the plain reason it cannot be added. */
export function cleanEmployer(input: string): { ok: true; employer: string } | { ok: false; problem: EmployerProblem } {
  const employer = input.replace(/\s+/g, ' ').trim();
  if (!employer) return { ok: false, problem: 'empty' };
  if (employer.length > MAX_EMPLOYER_CHARS) return { ok: false, problem: 'long' };
  return { ok: true, employer };
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const STATE_KEY: Record<MatchClaimState, StringKey> = {
  asked: 'matching.state.asked',
  requested: 'matching.state.requested',
  verified: 'matching.state.verified',
  received: 'matching.state.received',
  declined: 'matching.state.declined',
  expired: 'matching.state.expired',
  withdrawn: 'matching.state.withdrawn',
};

/** Where a request stands, in the member's words. */
export function claimStateWords(t: Translate, state: MatchClaimState): string {
  return t(STATE_KEY[state]);
}

export type ClaimTone = 'amber' | 'navy' | 'green' | 'grey' | 'red';

const STATE_TONE: Record<MatchClaimState, ClaimTone> = {
  asked: 'amber',
  requested: 'navy',
  verified: 'navy',
  received: 'green',
  declined: 'red',
  expired: 'grey',
  withdrawn: 'grey',
};

export function claimTone(state: MatchClaimState): ClaimTone {
  return STATE_TONE[state];
}

const WHO_KEY: Record<WhoSubmits, StringKey> = {
  member: 'matching.who.member',
  organization: 'matching.who.organization',
  either: 'matching.who.either',
};

/** Who makes the request with the employer. */
export function whoSubmitsWords(t: Translate, who: WhoSubmits): string {
  return t(WHO_KEY[who]);
}

/** "One gift" / "3 gifts" style choice between two strings. */
export function countWords(t: Translate, n: number, one: StringKey, many: StringKey): string {
  return t(n === 1 ? one : many, { n });
}

/** "Usually takes about 14 days." Null when the library does not say. */
export function typicalDaysLine(t: Translate, days: number | null): string | null {
  return days !== null && days > 0 ? countWords(t, days, 'matching.typicalDays.one', 'matching.typicalDays.many') : null;
}

/** "Your gift of Oct 3, 2026." */
export function giftLine(t: Translate, receivedOn: string | null): string {
  const date = formatLongDate(day(receivedOn));
  return date ? t('matching.giftOf', { date }) : t('matching.giftUnknown');
}

/**
 * The last day to ask, with the days left counted from the community's today:
 * "Last day to ask: Nov 30, 2026 · 12 days left". Null when there is no last day. Without a today the date stands alone, and a
 * day that has passed says so.
 */
export function deadlineLine(t: Translate, deadlineOn: string | null, today: string | null): string | null {
  const due = day(deadlineOn);
  const date = formatLongDate(due);
  if (!due || !date) return null;
  const now = day(today);
  if (!now) return t('matching.deadline.date', { date });
  const left = daysBetween(now, due);
  if (left < 0) return t('matching.deadline.past', { date });
  if (left === 0) return t('matching.deadline.today', { date });
  return t(left === 1 ? 'matching.deadline.one' : 'matching.deadline.many', { date, n: left });
}

/** The toast after "I have asked my employer": how many gifts were marked. */
export function reportedWords(t: Translate, n: number): string {
  return countWords(t, n, 'matching.reported.one', 'matching.reported.many');
}

/** The line under "Does your employer match?" on Give: what the member can do next. */
export function entryLine(t: Translate, card: MatchCard): string {
  if (!card.employer) return t('matching.entry.none');
  if (canReport(card)) return countWords(t, card.gifts.length, 'matching.entry.gifts.one', 'matching.entry.gifts.many');
  if (card.claims.length > 0) return countWords(t, card.claims.length, 'matching.entry.claims.one', 'matching.entry.claims.many');
  return t('matching.entry.set', { employer: card.employer });
}
