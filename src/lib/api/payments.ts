import { fromLegacyOptions, parseMemberMethods, type OnlineProcessor, type PaymentMethods } from '@/features/pay/methods';
import { parseReports, type PaymentReport, type ReportValue } from '@/features/pay/zelle-report';

import { env } from '../env';
import { AppError, logError, must, report } from '../errors';
import { isMissingRpcError } from '../modules';
import { supabase } from '../supabase';


/**
 * Online payment, "how to give" and Zelle reports:
 *   app.member_payment_methods  (connect-crm 0581) the ways to give, one entry each, in the community's order: Card and
 *                               PayPal (a member can choose), Zelle, and the offline methods with their instructions
 *   app.member_payment_options  (0211) the older answer, used when the portal does not have the new function yet
 *   /api/payments/intent        the portal's server route: creates the checkout at Stripe/PayPal (`processor` = the choice)
 *   app.checkout_status         polled until the provider's webhook says it was paid
 *   app.report_payment, app.withdraw_payment_report, app.my_payment_reports  (0582) "I sent a Zelle"
 * The app never records a payment itself: only the provider's webhook does, and a Zelle only counts once a treasurer has
 * matched it to the bank. A report is not a payment.
 */

export type OfflineMethod = { method: string; instructions: Record<string, string> };

/** The generated types mark every text argument of these functions non-null; they accept null (a missing value). */
const NO_TEXT = null as unknown as string;

let loggedMissingMethods = false;

/**
 * What this community takes. Asks for the new list; against a portal that does not have it yet (the app can ship before
 * the database change) it asks the older question and converts the answer, so the sheet behaves exactly as before. Any
 * other failure is a plain-English error; the caller shows it with a retry.
 */
export async function loadPaymentMethods(centerId: string): Promise<PaymentMethods> {
  const res = await supabase.rpc('member_payment_methods', { p_center: centerId });
  if (res.error) {
    if (!isMissingRpcError(res.error)) throw report(res.error, 'load how to give');
    if (!loggedMissingMethods) {
      loggedMissingMethods = true;
      logError('load how to give: app.member_payment_methods is not deployed yet, so the older list is used (one online provider, no Zelle report)', res.error);
    }
    return fromLegacyOptions(must(await supabase.rpc('member_payment_options', { p_center: centerId }), 'load how to give'));
  }
  const parsed = parseMemberMethods(res.data);
  if (!parsed) {
    const err = new AppError("We couldn't load how to give — the answer was not what we expected. Please try again.", `member_payment_methods returned an unusable answer: ${JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'}`);
    logError('load how to give', err);
    throw err;
  }
  return parsed;
}

export type CheckoutStart = { checkoutId: string; url: string; mode: string; processor: string };

export async function startCheckout(body: {
  centerId: string;
  householdId: string;
  amountCents: number;
  pledgeIds: string[];
  context: string;
  forLabel: string;
  /** The provider the member chose. Left out for the older list, where the community's default is used. */
  processor?: OnlineProcessor;
}): Promise<CheckoutStart> {
  if (!env.portalUrl) throw new AppError('Online payment is not set up in this app yet. Nothing was charged.', 'EXPO_PUBLIC_PORTAL_URL is not set');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError('Your sign-in has expired. Please sign in again.', 'no session for checkout');
  let res: Response;
  try {
    res = await fetch(`${env.portalUrl}/api/payments/intent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        center_id: body.centerId,
        household_id: body.householdId,
        amount_cents: body.amountCents,
        pledge_ids: body.pledgeIds,
        ...(body.processor ? { processor: body.processor } : {}),
        context: body.context,
        for_label: body.forLabel,
      }),
    });
  } catch (err) {
    throw new AppError("We couldn't start the payment. Check your internet connection and try again. Nothing was charged.", String(err));
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.url !== 'string' || typeof json.checkout_id !== 'string') {
    const why = typeof json.error === 'string' ? json.error : `the payment service answered ${res.status}`;
    throw new AppError(`We couldn't start the payment — ${why.replace(/\.$/, '')}. Nothing was charged.`, `intent ${res.status}: ${why}`);
  }
  return { checkoutId: json.checkout_id, url: json.url, mode: String(json.mode ?? ''), processor: String(json.processor ?? '') };
}

export type CheckoutState = { status: string; paymentId: string | null; receiptNumber: string | null; error: string | null };

export async function checkoutStatus(checkoutId: string): Promise<CheckoutState> {
  const raw = must(await supabase.rpc('checkout_status', { p_checkout: checkoutId }), 'check the payment') as Record<string, unknown> | null;
  if (!raw) throw new AppError('That payment was not found.', `checkout ${checkoutId} not visible`);
  return {
    status: String(raw.status ?? ''),
    paymentId: typeof raw.payment_id === 'string' ? raw.payment_id : null,
    receiptNumber: typeof raw.receipt_number === 'string' ? raw.receipt_number : null,
    error: typeof raw.error === 'string' ? raw.error : null,
  };
}

// ---------------------------------------------------------------------------
// Zelle: "I sent it"
// ---------------------------------------------------------------------------

/**
 * A refusal raised by one of our own functions is already a sentence for people ("Only an adult of the family can report
 * a payment.", "The date you sent the Zelle cannot be after today."). Anything else (Postgres' own wording) is not shown.
 */
function sentenceFrom(error: unknown): { sentence: string; code: string } | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message.trim() : '';
  if (!['22023', '42501', 'P0001'].includes(code) || !message) return null;
  if (!/^[A-Z$]/.test(message) || /row-level security|permission denied|violates|does not exist|syntax error/i.test(message)) return null;
  return { sentence: message.replace(/[.!?]+$/, ''), code };
}

/**
 * "Could not send your report — The date you sent the Zelle cannot be after today." for a refusal in plain words; the
 * usual plain-English message (network, expired sign-in …) for anything else. Logged either way.
 */
function actionError(prefix: string, action: string, error: unknown): AppError {
  if (isMissingRpcError(error)) {
    const err = new AppError(`${prefix} — this is not available yet. Nothing was changed.`, `payments function missing: ${JSON.stringify(error)?.slice(0, 200)}`);
    logError(action, err);
    return err;
  }
  const s = sentenceFrom(error);
  if (s) {
    const err = new AppError(`${prefix} — ${s.sentence}.`, s.sentence, s.code);
    logError(action, err);
    return err;
  }
  return report(error, action);
}

/** The database refused because the person is a child: the screen shows "Ask a parent" instead of an error. */
export function isAdultsOnlyRefusal(err: unknown): boolean {
  return err instanceof AppError && err.code === '42501' && /only an adult/i.test(err.userMessage);
}

export type ReportReceipt = { reportId: string; dueOn: string | null; isTest: boolean };

/**
 * An adult of the family says they sent a Zelle. Records a REPORT only: no payment, no pledge is closed, nothing is
 * counted, until a treasurer matches it to the bank. Money is integer cents.
 */
export async function reportZelle(args: { centerId: string; householdId: string; value: ReportValue }): Promise<ReportReceipt> {
  const v = args.value;
  if (!Number.isInteger(v.amountCents) || v.amountCents < 1) throw new AppError('Please enter the amount you sent.', `report amount is not whole cents: ${v.amountCents}`);
  const res = await supabase.rpc('report_payment', {
    p_center: args.centerId,
    p_household: args.householdId,
    p_method: 'zelle',
    p_amount_cents: v.amountCents,
    p_sent_on: v.sentOn,
    p_confirmation: v.confirmation ?? NO_TEXT,
    p_sender_name: v.senderName ?? NO_TEXT,
    p_pledge_ids: v.pledgeIds,
    p_note: NO_TEXT,
  });
  if (res.error) throw actionError('Could not send your report', 'send your report', res.error);
  const d = res.data;
  if (!d || typeof d !== 'object' || typeof (d as Record<string, unknown>).report_id !== 'string') {
    const err = new AppError(
      "We couldn't confirm that your report was saved. Look under Your Zelle reports on the Give tab before you send it again.",
      `report_payment returned an unusable answer: ${JSON.stringify(d)?.slice(0, 300) ?? 'nothing'}`,
    );
    logError('send your report', err);
    throw err;
  }
  const r = d as Record<string, unknown>;
  return { reportId: r.report_id as string, dueOn: typeof r.due_on === 'string' ? r.due_on : null, isTest: r.is_test === true };
}

/** Withdraw a report that is still waiting for the treasurer. */
export async function withdrawZelleReport(reportId: string): Promise<void> {
  const res = await supabase.rpc('withdraw_payment_report', { p_report: reportId, p_reason: NO_TEXT });
  if (res.error) throw actionError('Could not withdraw your report', 'withdraw your report', res.error);
}

export type ReportsAnswer = { available: boolean; reports: PaymentReport[] };

let loggedMissingReports = false;

/**
 * The family's Zelle reports of the last 180 days, newest first. A portal without the function (an older one) has none:
 * `available: false`, logged once, never an error. Any other failure is a plain-English error with a retry.
 */
export async function listPaymentReports(centerId: string, householdId: string): Promise<ReportsAnswer> {
  const res = await supabase.rpc('my_payment_reports', { p_center: centerId, p_household: householdId });
  if (res.error) {
    if (isMissingRpcError(res.error)) {
      if (!loggedMissingReports) {
        loggedMissingReports = true;
        logError('load your Zelle reports: app.my_payment_reports is not deployed yet, so there are none to show', res.error);
      }
      return { available: false, reports: [] };
    }
    throw actionError('Could not load your Zelle reports', 'load your Zelle reports', res.error);
  }
  const parsed = parseReports(res.data);
  if (!parsed) {
    const err = new AppError("We couldn't load your Zelle reports — the answer was not what we expected. Please try again.", `my_payment_reports returned an unusable answer: ${JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'}`);
    logError('load your Zelle reports', err);
    throw err;
  }
  if (parsed.skipped > 0) logError('load your Zelle reports', new Error(`${parsed.skipped} report(s) in an unknown shape or status were left out`));
  return { available: true, reports: parsed.reports };
}
