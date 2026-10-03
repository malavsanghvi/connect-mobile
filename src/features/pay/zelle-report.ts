/**
 * "I sent a Zelle": what a member reports, how the form is checked, and how a report is shown. Pure: no I/O, no React.
 *
 * Zelle goes bank to bank, so the app cannot know it arrived. The member reports it (amount, date, the confirmation
 * number if they have it, the name their bank shows, the pledges it is for); the treasurer matches it to the bank
 * statement. A report is NEVER money received: nothing here is added to any total, and nothing here says "paid".
 *
 * The rules mirror the database (connect-crm 0582 app.report_payment) so a mistake is caught before the request, with
 * the same words; the database still checks everything again and is the authority.
 */

import { daysBetween, parseDobInput } from '@/lib/format';

/** The largest Zelle that can be reported, in cents: $1,000,000.00 (the database's own limit). */
export const MAX_REPORT_CENTS = 100_000_000;
/** How far back a Zelle can be reported, in days. */
export const MAX_REPORT_AGE_DAYS = 60;
/** The most pledges one report can name. */
export const MAX_REPORT_PLEDGES = 20;
const MAX_NAME = 120;
const MAX_CONFIRMATION = 60;

// ---------------------------------------------------------------------------
// Amount
// ---------------------------------------------------------------------------

export type AmountProblem = 'amount_required' | 'amount_invalid' | 'amount_too_small' | 'amount_too_large';

/**
 * What the member typed → integer cents, with no floating point anywhere. "12.5" is 1250, "$1,000.00" is 100000,
 * ".5" is 50. Commas are accepted only as thousands separators ("1,00" is not an amount), at most two decimals
 * ("12.345" is refused rather than rounded), and anything that is not a plain amount is refused.
 */
export function parseReportAmount(input: string): { ok: true; cents: number } | { ok: false; problem: AmountProblem } {
  const s = input.replace(/\s+/g, '').replace(/^\$/, '');
  if (s === '') return { ok: false, problem: 'amount_required' };
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{0,2}))?$/.exec(s);
  if (!m || (m[1] === undefined && !m[2])) return { ok: false, problem: 'amount_invalid' };
  const whole = (m[1] ?? '0').replace(/,/g, '').replace(/^0+(?=\d)/, '');
  // More digits than the limit has: refuse before any number is built from them.
  if (whole.length > 9) return { ok: false, problem: 'amount_too_large' };
  const cents = Number(whole) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (cents < 1) return { ok: false, problem: 'amount_too_small' };
  if (cents > MAX_REPORT_CENTS) return { ok: false, problem: 'amount_too_large' };
  return { ok: true, cents };
}

/** 125000 → "1250", 1250 → "12.50": the amount as it is typed in the field, from the Pay sheet's total. */
export function centsToField(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isInteger(cents) || cents < 1) return '';
  const whole = Math.floor(cents / 100);
  const rem = cents % 100;
  return rem === 0 ? String(whole) : `${whole}.${String(rem).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export type ReportInput = {
  /** As typed. */
  amount: string;
  /** As the date field gives it: "MM/DD/YYYY". */
  date: string;
  confirmation: string;
  senderName: string;
  /** The pledges the member ticked. */
  pledgeIds: readonly string[];
};

export type ReportContext = {
  /** The community's date today, 'YYYY-MM-DD' (the database counts "today" in the community's time zone). */
  today: string;
  /** The family's open pledges: only these can be named. */
  openPledgeIds: readonly string[];
};

export type ReportProblem =
  | AmountProblem
  | 'date_required'
  | 'date_invalid'
  | 'date_future'
  | 'date_old'
  | 'confirmation_invalid'
  | 'sender_too_long'
  | 'pledge_gone'
  | 'pledges_too_many';

export type ReportField = 'amount' | 'date' | 'confirmation' | 'senderName' | 'pledges';

export type ReportValue = {
  amountCents: number;
  /** 'YYYY-MM-DD' */
  sentOn: string;
  /** Null when left blank: it is asked for, never required. */
  confirmation: string | null;
  senderName: string | null;
  pledgeIds: string[];
};

/** A confirmation number is letters and digits; spaces and dashes are ignored, as the bank prints them either way. */
export function normalizeConfirmation(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Checks the form. Returns what to send, or every problem at once (one per field) so the member fixes them in one go.
 * The confirmation number is optional: blank is fine; when given it must look like one (6 to 40 letters and digits).
 */
export function validateReport(input: ReportInput, ctx: ReportContext): { ok: true; value: ReportValue } | { ok: false; problems: Partial<Record<ReportField, ReportProblem>> } {
  const problems: Partial<Record<ReportField, ReportProblem>> = {};

  const amount = parseReportAmount(input.amount);
  if (!amount.ok) problems.amount = amount.problem;

  let sentOn: string | null = null;
  if (input.date.trim() === '') {
    problems.date = 'date_required';
  } else {
    sentOn = parseDobInput(input.date);
    if (!sentOn) {
      problems.date = 'date_invalid';
    } else if (sentOn > ctx.today) {
      problems.date = 'date_future';
      sentOn = null;
    } else if (daysBetween(sentOn, ctx.today) > MAX_REPORT_AGE_DAYS) {
      problems.date = 'date_old';
      sentOn = null;
    }
  }

  const confirmation = input.confirmation.trim();
  if (confirmation !== '') {
    const norm = normalizeConfirmation(confirmation);
    if (confirmation.length > MAX_CONFIRMATION || norm.length < 6 || norm.length > 40) problems.confirmation = 'confirmation_invalid';
  }

  const senderName = input.senderName.trim();
  if (senderName.length > MAX_NAME) problems.senderName = 'sender_too_long';

  const open = new Set(ctx.openPledgeIds);
  const pledgeIds = [...new Set(input.pledgeIds)];
  if (pledgeIds.length > MAX_REPORT_PLEDGES) problems.pledges = 'pledges_too_many';
  else if (pledgeIds.some((id) => !open.has(id))) problems.pledges = 'pledge_gone';

  if (Object.keys(problems).length > 0 || !amount.ok || !sentOn) return { ok: false, problems };
  return {
    ok: true,
    value: { amountCents: amount.cents, sentOn, confirmation: confirmation === '' ? null : confirmation, senderName: senderName === '' ? null : senderName, pledgeIds },
  };
}

/**
 * The pledges to tick when the form opens: the ones the Pay sheet was for, but only those the family still has open.
 * `dropped` counts the ones that are no longer open, so the form can say so instead of quietly changing the list.
 */
export function initialPledgeSelection(wanted: readonly string[], openPledgeIds: readonly string[]): { selected: string[]; dropped: number } {
  const open = new Set(openPledgeIds);
  const unique = [...new Set(wanted)];
  const selected = unique.filter((id) => open.has(id));
  return { selected, dropped: unique.length - selected.length };
}

/** Route params are strings: "a,b,c" → ['a','b','c'], and nothing at all → []. */
export function splitIds(param: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(param) ? param.join(',') : (param ?? '');
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A whole number of cents from a route param, or null: never a float, never a negative. */
export function centsParam(param: string | string[] | null | undefined): number | null {
  const raw = Array.isArray(param) ? param[0] : param;
  if (typeof raw !== 'string' || !/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_REPORT_CENTS ? n : null;
}

// ---------------------------------------------------------------------------
// The member's reports
// ---------------------------------------------------------------------------

export type ReportStatus = 'reported' | 'matched' | 'unmatched' | 'rejected' | 'withdrawn';

export type PaymentReport = {
  id: string;
  amountCents: number;
  /** 'YYYY-MM-DD' */
  sentOn: string;
  dueOn: string | null;
  status: ReportStatus;
  confirmation: string | null;
  senderName: string | null;
  pledgeIds: string[];
  /** Made in a sandbox: no real money moved. */
  isTest: boolean;
  /** The receipt, once a treasurer matched it to the bank. */
  receiptNumber: string | null;
  rejectReason: string | null;
  createdAt: string | null;
};

const STATUSES: readonly ReportStatus[] = ['reported', 'matched', 'unmatched', 'rejected', 'withdrawn'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function cents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,12}$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/**
 * Reads `app.my_payment_reports`. A row that is not what we expect (no id, no whole-cents amount, no date, a status this
 * build does not know) is left out and counted in `skipped`, so the caller can log it: the rest still shows.
 */
export function parseReports(raw: unknown): { reports: PaymentReport[]; skipped: number } | null {
  if (!Array.isArray(raw)) return null;
  const reports: PaymentReport[] = [];
  let skipped = 0;
  for (const row of raw) {
    if (!isRecord(row)) {
      skipped += 1;
      continue;
    }
    const id = str(row.id);
    const amountCents = cents(row.amount_cents);
    const sentOn = str(row.sent_on);
    const status = STATUSES.find((s) => s === row.status);
    if (!id || amountCents === null || !sentOn || !/^\d{4}-\d{2}-\d{2}/.test(sentOn) || !status) {
      skipped += 1;
      continue;
    }
    reports.push({
      id,
      amountCents,
      sentOn: sentOn.slice(0, 10),
      dueOn: str(row.due_on)?.slice(0, 10) ?? null,
      status,
      confirmation: str(row.confirmation),
      senderName: str(row.sender_name),
      pledgeIds: Array.isArray(row.pledge_ids) ? row.pledge_ids.filter((x): x is string => typeof x === 'string') : [],
      isTest: row.is_test === true,
      receiptNumber: str(row.receipt_number),
      rejectReason: str(row.reject_reason),
      createdAt: str(row.created_at),
    });
  }
  return { reports, skipped };
}

/** Still waiting for the treasurer: the report shows as "Reported" and can be withdrawn. */
export function isWaiting(r: Pick<PaymentReport, 'status'>): boolean {
  return r.status === 'reported' || r.status === 'unmatched';
}

/** Pledges a waiting report names: they get a "Reported" chip. The pledge's own amounts and status never change. */
export function pledgesWithWaitingReport(reports: readonly PaymentReport[]): Set<string> {
  const ids = new Set<string>();
  for (const r of reports) if (isWaiting(r)) for (const id of r.pledgeIds) ids.add(id);
  return ids;
}

/** Newest first: by when it was reported, then by the date sent. */
export function newestFirst(reports: readonly PaymentReport[]): PaymentReport[] {
  return [...reports].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.sentOn.localeCompare(a.sentOn));
}

export type StatusLook = { labelKey: 'zelle.status.reported' | 'zelle.status.unmatched' | 'zelle.status.matched' | 'zelle.status.rejected' | 'zelle.status.withdrawn'; tone: 'amber' | 'red' | 'green' | 'grey' };

/** The chip a report shows. "Reported" is deliberately not green: nothing has been received yet. */
export function statusLook(status: ReportStatus): StatusLook {
  switch (status) {
    case 'reported':
      return { labelKey: 'zelle.status.reported', tone: 'amber' };
    case 'unmatched':
      return { labelKey: 'zelle.status.unmatched', tone: 'red' };
    case 'matched':
      return { labelKey: 'zelle.status.matched', tone: 'green' };
    case 'rejected':
      return { labelKey: 'zelle.status.rejected', tone: 'red' };
    default:
      return { labelKey: 'zelle.status.withdrawn', tone: 'grey' };
  }
}
