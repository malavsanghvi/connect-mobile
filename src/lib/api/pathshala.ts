import { en } from '../../i18n/en';
import type { Tables } from '../database.types';
import { AppError, logError, maybe, must, report } from '../errors';
import { isMissingRpcError } from '../modules';
import {
  enrollmentStatus,
  errorHint,
  holdForViewer,
  holdInfo,
  parseOfficeChoice,
  parseRegistrationOptions,
  parseRegistrationResult,
  REFUSAL_CODES,
  RegistrationRefusal,
  type FeePledge,
  type HoldInfo,
  type OfficeChoice,
  type RegistrationOptions,
  type RegistrationResult,
  type StatusView,
} from '../pathshala-registration';
import { supabase } from '../supabase';

import { updatePerson } from './family';

/**
 * Pathshala registration (connect-crm migrations 0590 and 0591; the contract is §2.17 of
 * docs/PATHSHALA_REGISTRATION_PLAN.md there, with the deviations those migrations made): the options for the flow, the
 * preview, the registration and "pay at the office instead". The generated types do not know these functions yet
 * (README › Schema gaps #32), so the calls go through one narrow cast here and every answer is read defensively in
 * src/lib/pathshala-registration.ts. Nothing else in the app calls them. `withdraw_pathshala_enrollment` (0592) and
 * `my_pathshala_overview` (0593) are not built yet, and nothing here calls them.
 *
 * A database without the functions (an older portal) answers `missing`: the app then keeps today's simple request
 * form (src/features/pathshala/legacy-enroll.tsx), and the reason is logged once.
 */
type UntypedRpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/** The one place the generated types are stepped around: they do not carry 0590 and 0591 yet. */
function rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> {
  return (supabase as unknown as UntypedRpc).rpc(fn, args);
}

/** The database's answer, or `missing`: it cannot register through the new functions yet, so the simple form is used. */
export type OptionsAnswer = { kind: 'answered'; options: RegistrationOptions } | { kind: 'missing' };

let loggedMissing = false;

/**
 * A failed call as the AppError the screen shows: the database's own sentence when it wrote one for people ("The fee
 * changed since you looked; please review the new total ($130.00)."), with a final period, its code and its HINT (a
 * RegistrationRefusal: the screen routes on `review_again`, see registerRoute); else the generic words for `action`.
 * Postgres' own permission and row-level-security messages stay generic. The technical detail is kept and logged.
 */
export function pathshalaError(err: unknown, action: string): AppError {
  const e = err && typeof err === 'object' ? (err as { code?: unknown; message?: unknown }) : {};
  const code = typeof e.code === 'string' ? e.code : null;
  const message = typeof e.message === 'string' ? e.message.trim() : '';
  if (code && REFUSAL_CODES.has(code) && /^["A-Z$]/.test(message) && !/permission denied|row-level security|violates|does not exist|syntax error/i.test(message)) {
    const hint = errorHint(err);
    const out = new RegistrationRefusal(/[.!?]$/.test(message) ? message : `${message}.`, `${action}: ${message} | code=${code}${hint ? ` | hint=${hint}` : ''}`, code, hint);
    logError(action, out);
    return out;
  }
  return report(err, action);
}

/** Said when a write reaches a database without the registration functions. Keeps the missing code so the screen can offer the simple form. */
function unavailable(fn: string, error: unknown, action: string): AppError {
  const e = error as { code?: unknown; message?: unknown };
  const err = new AppError(en['reg.err.unavailable'], `${fn}: ${String(e?.message ?? error)}`, typeof e?.code === 'string' ? e.code : 'PGRST202');
  logError(action, err);
  return err;
}

export type RegistrationTerm = Pick<Tables<'pathshala_terms'>, 'id' | 'name' | 'status' | 'starts_on' | 'ends_on' | 'registration_opens_at' | 'registration_closes_at'>;

/** The community's terms a family may register for or look at: open for registration or running, and not over. */
export async function loadRegistrationTerms(centerId: string, today: string): Promise<RegistrationTerm[]> {
  return must(
    await supabase
      .from('pathshala_terms')
      .select('id, name, status, starts_on, ends_on, registration_opens_at, registration_closes_at')
      .eq('center_id', centerId)
      .in('status', ['registration', 'active'])
      .gte('ends_on', today)
      .order('starts_on'),
    'load the Pathshala terms',
  );
}

/**
 * Everything the flow needs for one term and household (`app.pathshala_registration_options`). Rejects with a
 * plain-English AppError when it cannot be had; a function that is not deployed yet is `missing`, logged once.
 */
export async function loadRegistrationOptions(termId: string, householdId: string): Promise<OptionsAnswer> {
  const res = await rpc('pathshala_registration_options', { p_term: termId, p_household: householdId });
  if (res.error) {
    if (isMissingRpcError(res.error)) {
      if (!loggedMissing) {
        loggedMissing = true;
        logError('Pathshala registration: app.pathshala_registration_options is not deployed yet (connect-crm 0590), so the simple request form is used', res.error);
      }
      return { kind: 'missing' };
    }
    throw pathshalaError(res.error, 'load Pathshala registration');
  }
  const options = parseRegistrationOptions(res.data);
  if (!options) {
    const err = new AppError(en['reg.err.unreadableLoad'], `pathshala_registration_options returned an unusable answer: ${JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'}`);
    logError('load Pathshala registration', err);
    throw err;
  }
  if (options.skipped > 0) logError(`Pathshala registration: ${options.skipped} learner(s), track(s) or level(s) could not be read and are not shown`, new Error('unreadable registration options'));
  return { kind: 'answered', options };
}

/** The fee line by line and what happens to each learner, without saving anything (`app.preview_pathshala_registration`). */
export async function previewRegistration(args: { termId: string; householdId: string; learners: Record<string, unknown>[] }): Promise<RegistrationResult> {
  const action = 'work out the fee';
  const res = await rpc('preview_pathshala_registration', { p_term: args.termId, p_household: args.householdId, p_learners: args.learners });
  if (res.error) throw isMissingRpcError(res.error) ? unavailable('preview_pathshala_registration', res.error, action) : pathshalaError(res.error, action);
  const result = parseRegistrationResult(res.data);
  if (!result) {
    const err = new AppError(en['reg.err.unreadableFee'], `preview_pathshala_registration returned an unusable answer: ${JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'}`);
    logError(action, err);
    throw err;
  }
  return result;
}

/**
 * Register (`app.register_pathshala_children`). The database prices it again and refuses when the total or an
 * outcome changed since the review; `clientKey` is made once per review and sent again when the same registration is
 * retried after a lost answer, so a family is never registered (or billed) twice.
 */
export async function registerLearners(args: {
  termId: string;
  householdId: string;
  learners: Record<string, unknown>[];
  expectedTotalCents: number;
  expectedOutcomes: Record<string, unknown>[];
  waiverDocumentId: string | null;
  clientKey: string;
}): Promise<RegistrationResult> {
  const action = 'register for Pathshala';
  const res = await rpc('register_pathshala_children', {
    p_term: args.termId,
    p_household: args.householdId,
    p_learners: args.learners,
    p_expected_total_cents: args.expectedTotalCents,
    p_expected_outcomes: args.expectedOutcomes,
    p_waiver_document: args.waiverDocumentId,
    p_client_key: args.clientKey,
  });
  if (res.error) throw isMissingRpcError(res.error) ? unavailable('register_pathshala_children', res.error, action) : pathshalaError(res.error, action);
  const result = parseRegistrationResult(res.data);
  if (!result) {
    // The registration may well have been saved: say where to look before registering again.
    const err = new AppError(en['reg.err.unreadableRegister'], `register_pathshala_children returned an unusable answer: ${JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'}`);
    logError(action, err);
    throw err;
  }
  return result;
}

/**
 * "Pay at the office instead" (`app.choose_pathshala_office_payment(p_registration)`): the registration's seats held for
 * an online payment are held for the office window instead. Answers until when, what is still to pay and for which
 * pledges (for the Zelle "I sent it" report).
 */
export async function chooseOfficePayment(registrationId: string): Promise<OfficeChoice> {
  const action = 'keep the seats for payment at the office';
  const res = await rpc('choose_pathshala_office_payment', { p_registration: registrationId });
  if (res.error) throw isMissingRpcError(res.error) ? unavailable('choose_pathshala_office_payment', res.error, action) : pathshalaError(res.error, action);
  return parseOfficeChoice(res.data);
}

export type Waiver = Pick<Tables<'legal_documents'>, 'id' | 'title' | 'version' | 'body_md' | 'published_at'>;

/** The published waiver's text (legal_documents: published documents are readable by anyone). Null when it is not there any more. */
export async function loadWaiver(documentId: string): Promise<Waiver | null> {
  return maybe(await supabase.from('legal_documents').select('id, title, version, body_md, published_at').eq('id', documentId).not('published_at', 'is', null).maybeSingle(), 'load the Pathshala waiver');
}

/**
 * A learner's missing birth date, asked when the price depends on it (RLS people_self_or_guardian_update: yourself,
 * or, as an adult, anyone in your household). `iso` is 'YYYY-MM-DD'.
 */
export async function saveBirthDate(personId: string, iso: string): Promise<void> {
  await updatePerson(personId, { date_of_birth: iso });
}

type PledgeRow = Pick<Tables<'pledges'>, 'id' | 'pledge_number' | 'amount_cents' | 'paid_cents' | 'status' | 'due_on' | 'source_ref_id'>;

function feePledge(p: PledgeRow): FeePledge {
  return { id: p.id, number: p.pledge_number, amountCents: p.amount_cents, paidCents: p.paid_cents, status: p.status, dueOn: p.due_on, enrollmentId: p.source_ref_id };
}

/**
 * The fee pledges of these enrollments (source `pathshala_fee`, `source_ref_id` = the enrollment; RLS pledges_household:
 * the household's adults only, so never call it for a child).
 */
export async function loadFeePledges(householdId: string, enrollmentIds: string[]): Promise<FeePledge[]> {
  if (enrollmentIds.length === 0) return [];
  const rows = must(
    await supabase.from('pledges').select('id, pledge_number, amount_cents, paid_cents, status, due_on, source_ref_id').eq('household_id', householdId).eq('source', 'pathshala_fee').in('source_ref_id', enrollmentIds),
    'load the Pathshala fees',
  );
  return rows.map(feePledge);
}

/** Whether a term lets a family pay at the office instead (0590 `office_payment_allowed`, read from `select('*')`: absent before 0590). */
export function termAllowsOffice(row: Record<string, unknown>): boolean {
  return row.office_payment_allowed === true;
}

/** Who is looking at an enrollment: an adult of the household, or a child (P30: a child never sees fees). */
export type HoldViewer = { adult: boolean };

/**
 * THE one place the app reads where an enrollment's seat stands beyond its status: whether it is held and why (0591
 * `hold_reason`), until when (`hold_expires_at`), an offer from the waitlist (`offered_at`) and the registration it
 * belongs to (`registration_id`). Today these are columns of the `pathshala_enrollments` row the caller already read
 * (`select('*')`: they are not in the generated types yet). The reasons about the fee (payment, office_payment,
 * assistance) are moving off that row into rows a child cannot read (P30), and the household's adults will get them
 * from `app.pathshala_registration_options`; until then a child's view leaves them out here. When the database moves
 * them, only this adapter changes: the screens read `HoldInfo` and nothing else reads those columns (nor
 * `withdrawal_reason`, which the app never reads).
 */
export async function enrollmentHolds(rows: readonly Pick<Tables<'pathshala_enrollments'>, 'id'>[], viewer: HoldViewer): Promise<Map<string, HoldInfo>> {
  return new Map(rows.map((r) => [r.id, holdForViewer(holdInfo(r as unknown as Record<string, unknown>), viewer.adult)]));
}

export type HeldSeat = {
  enrollmentId: string;
  personId: string;
  termId: string;
  termName: string;
  hold: HoldInfo;
  view: StatusView;
  officeAllowed: boolean;
  pledges: FeePledge[];
};

/**
 * Seats the family holds for payment, and seats offered from the waitlist (Home's strip, a household adult only):
 * `requested` enrollments held for payment online or at the office whose hold has not ended, as `enrollmentHolds` says.
 * Before 0591 there are no holds, and nothing is shown.
 */
export async function loadHeldSeats(householdId: string, now: Date = new Date()): Promise<HeldSeat[]> {
  const rows = must(await supabase.from('pathshala_enrollments').select('*').eq('household_id', householdId).eq('status', 'requested'), 'load your Pathshala seats');
  const holds = await enrollmentHolds(rows, { adult: true });
  const held = rows
    .map((r) => ({ row: r, hold: holds.get(r.id) as HoldInfo }))
    .filter(({ hold }) => (hold.holdReason === 'payment' || hold.holdReason === 'office_payment') && (!hold.holdUntil || new Date(hold.holdUntil).getTime() > now.getTime()));
  if (held.length === 0) return [];
  const termIds = [...new Set(held.map((h) => h.row.term_id))];
  const [terms, pledges] = await Promise.all([
    supabase.from('pathshala_terms').select('*').in('id', termIds).then((r) => must(r, 'load the Pathshala terms')),
    loadFeePledges(householdId, held.map((h) => h.row.id)),
  ]);
  return held.map(({ row, hold }) => {
    const term = terms.find((t) => t.id === row.term_id);
    return {
      enrollmentId: row.id,
      personId: row.student_person_id,
      termId: row.term_id,
      termName: term?.name ?? '',
      hold,
      view: enrollmentStatus(row.status, hold),
      officeAllowed: term ? termAllowsOffice(term as unknown as Record<string, unknown>) : false,
      pledges: pledges.filter((p) => p.enrollmentId === row.id),
    };
  });
}
