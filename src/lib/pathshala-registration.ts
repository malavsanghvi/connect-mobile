/**
 * Pathshala registration in the member app (connect-crm docs/PATHSHALA_REGISTRATION_PLAN.md version 2: §2.17 is the
 * contract, §3.1 the flow; migrations 0590 and 0591). A household adult registers several learners at once, children
 * and adults (themselves included): who is joining, a level for each, the fee line by line as the database prices it,
 * the waiver, then "added to your pledges" (a pledge-mode term) or the seats held while the family pays (a pay-now
 * term).
 *
 * This file is pure (no React, no Supabase): it reads the answers of the registration functions defensively and holds
 * every display rule of the flow, so all of it is unit-tested (src/lib/__tests__/pathshala-registration.test.ts). The
 * calls live in src/lib/api/pathshala.ts, the screens in src/features/pathshala.
 *
 * The app never prices anything: every amount shown on the review and afterwards is the database's own number
 * (`app.pathshala_quote` is the only place a fee is worked out). Age bands only order the levels and say when the
 * office confirms one; whether a learner gets a seat, waits, or is held is the preview's and the registration's
 * answer.
 */
import type { StringKey } from '../i18n/en';

import { AppError } from './errors';
import { isMissingRpcError } from './modules';
import { ADULT_AGE, ageOn, openBalanceCents } from './rules';

// ---------------------------------------------------------------------------
// The contract (what the database says)
// ---------------------------------------------------------------------------

export const WINDOW_STATES = ['open', 'late', 'closed', 'not_yet'] as const;
export type WindowState = (typeof WINDOW_STATES)[number];

export const PAYMENT_MODES = ['pledge', 'pay_now'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const SEAT_STATES = ['open', 'waitlist', 'full'] as const;
export type SeatState = (typeof SEAT_STATES)[number];

export const SUGGESTION_REASONS = ['teacher', 'previous', 'age'] as const;
export type SuggestionReason = (typeof SUGGESTION_REASONS)[number];

export const OUTCOMES = ['seat', 'waitlist', 'membership_hold', 'office', 'pending_child'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Why a `requested` enrollment waits (0591 `hold_reason`): the six statuses stay, a held learner is `requested`. */
export const HOLD_REASONS = ['membership', 'payment', 'office_payment', 'assistance', 'waiver'] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export const ENROLLMENT_STATUSES = ['requested', 'waitlisted', 'placed', 'active', 'withdrawn', 'completed'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export type RegWindow = { state: WindowState; opensAt: string | null; closesAt: string | null; lateUntil: string | null; lateFeeCents: number };

export type RegWaiver = { documentId: string; title: string | null; version: string | null };

export type RegTerm = {
  id: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  window: RegWindow;
  paymentMode: PaymentMode;
  /** How long a seat is held while the family pays online (pay-now terms). */
  holdHours: number;
  officePayment: { allowed: boolean; holdDays: number };
  seatRule: 'automatic' | 'office';
  /** Withdrawing up to this date cancels the fee (anything paid becomes credit); after it the fee stays due. */
  withdrawalCreditUntil: string | null;
  ageCutoffOn: string | null;
  membershipRequired: boolean;
  /** The community's published Pathshala waiver, or null when none is published. */
  waiver: RegWaiver | null;
};

export type RegHousehold = { id: string; name: string; number: string | null };

export type RegEnrollment = { trackId: string | null; levelId: string | null; status: EnrollmentStatus | null; holdReason: HoldReason | null; holdExpiresAt: string | null };

export type RegSuggestion = { trackId: string; levelId: string; reason: SuggestionReason | null };

export type RegLearner = {
  personId: string;
  firstName: string;
  ageOnCutoff: number | null;
  countsAsChild: boolean;
  needsBirthDate: boolean;
  /** This term's enrollments (any status). */
  enrollments: RegEnrollment[];
  suggested: RegSuggestion[];
};

export type RegLevel = { id: string; name: string; minAge: number | null; maxAge: number | null; feeCents: number | null; seats: SeatState | null };

export type RegTrack = { id: string; key: string | null; name: string; levels: RegLevel[] };

export type RegistrationOptions = {
  term: RegTerm;
  household: RegHousehold & { membership: string | null };
  /** The households the caller is an adult of (more than one: "Register under …", P32). */
  households: RegHousehold[];
  learners: RegLearner[];
  tracks: RegTrack[];
  canRegister: boolean;
  cannotReason: string | null;
  /** Entries of the answer that could not be read and are left out (logged by the loader). */
  skipped: number;
};

export type RegPledge = { id: string; number: string | null; dueOn: string | null };

export type RegLine = {
  personId: string | null;
  trackId: string;
  levelId: string | null;
  learnerKind: 'child' | 'adult' | null;
  familyRank: number | null;
  outcome: Outcome;
  baseFeeCents: number;
  siblingDiscountCents: number;
  capReductionCents: number;
  lateFeeCents: number;
  assistanceCents: number;
  totalCents: number;
  enrollmentId: string | null;
  pledge: RegPledge | null;
};

export type RegPay = { amountCents: number; pledgeIds: string[]; forLabel: string | null; holdUntil: string | null; officePaymentAllowed: boolean };

export type RegistrationResult = {
  registrationId: string | null;
  lines: RegLine[];
  childrenTotalCents: number;
  adultsTotalCents: number;
  totalCents: number;
  /** Pay-now terms: what to pay now and for which pledges. Null in a pledge-mode term, or when nothing is to be paid now. */
  pay: RegPay | null;
  /** Children the office must add to the family first (pending registrations). */
  pendingCount: number;
};

// ---------------------------------------------------------------------------
// Reading the answers
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** A whole, non-negative number (cents, ages, hours). JSON numbers only; a numeric string of digits is read too. */
function count(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,12}$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function oneOf<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function parseHousehold(v: unknown): RegHousehold | null {
  if (!isObject(v)) return null;
  const id = str(v.id);
  if (!id) return null;
  return { id, name: str(v.name) ?? '', number: str(v.number) };
}

function parseTerm(v: unknown): RegTerm | null {
  if (!isObject(v)) return null;
  const id = str(v.id);
  const name = str(v.name);
  // The money rule of the term: without a mode the app cannot say what registering does, so the answer is unusable.
  const paymentMode = oneOf(v.payment_mode, PAYMENT_MODES);
  if (!id || !name || !paymentMode) return null;
  const w = isObject(v.window) ? v.window : {};
  const office = isObject(v.office_payment) ? v.office_payment : {};
  const waiver = isObject(v.waiver) && str(v.waiver.document_id) ? { documentId: str(v.waiver.document_id) as string, title: str(v.waiver.title), version: str(v.waiver.version) } : null;
  return {
    id,
    name,
    startsOn: str(v.starts_on),
    endsOn: str(v.ends_on),
    window: {
      // A state this build does not know is not open: nothing is offered that the database did not plainly allow.
      state: oneOf(w.state, WINDOW_STATES) ?? 'closed',
      opensAt: str(w.opens_at),
      closesAt: str(w.closes_at),
      lateUntil: str(w.late_until),
      lateFeeCents: count(w.late_fee_cents) ?? 0,
    },
    paymentMode,
    holdHours: count(v.hold_hours) ?? 48,
    officePayment: { allowed: office.allowed === true, holdDays: count(office.hold_days) ?? 7 },
    seatRule: v.seat_rule === 'office' ? 'office' : 'automatic',
    withdrawalCreditUntil: str(v.withdrawal_credit_until),
    ageCutoffOn: str(v.age_cutoff_on),
    membershipRequired: v.membership_required === true,
    waiver,
  };
}

function parseEnrollment(v: unknown): RegEnrollment | null {
  if (!isObject(v)) return null;
  return {
    trackId: str(v.track_id),
    levelId: str(v.level_id),
    // Kept even when the status is one this build does not know: such an enrollment still takes its track.
    status: oneOf(v.status, ENROLLMENT_STATUSES),
    holdReason: oneOf(v.hold_reason, HOLD_REASONS),
    holdExpiresAt: str(v.hold_expires_at),
  };
}

function parseLearner(v: unknown): RegLearner | null {
  if (!isObject(v)) return null;
  const personId = str(v.person_id);
  const firstName = str(v.first_name);
  if (!personId || !firstName) return null;
  return {
    personId,
    firstName,
    ageOnCutoff: count(v.age_on_cutoff),
    countsAsChild: v.counts_as_child === true,
    needsBirthDate: v.needs_birth_date === true,
    enrollments: list(v.enrollments)
      .map(parseEnrollment)
      .filter((e): e is RegEnrollment => e !== null),
    suggested: list(v.suggested).flatMap((s) => {
      if (!isObject(s)) return [];
      const trackId = str(s.track_id);
      const levelId = str(s.level_id);
      return trackId && levelId ? [{ trackId, levelId, reason: oneOf(s.reason, SUGGESTION_REASONS) }] : [];
    }),
  };
}

function parseLevel(v: unknown): RegLevel | null {
  if (!isObject(v)) return null;
  const id = str(v.id);
  const name = str(v.name);
  if (!id || !name) return null;
  return { id, name, minAge: count(v.min_age), maxAge: count(v.max_age), feeCents: count(v.fee_cents), seats: oneOf(v.seats, SEAT_STATES) };
}

function parseTrack(v: unknown): RegTrack | null {
  if (!isObject(v)) return null;
  const id = str(v.id);
  const name = str(v.name);
  if (!id || !name) return null;
  return {
    id,
    key: str(v.key),
    name,
    levels: list(v.levels)
      .map(parseLevel)
      .filter((l): l is RegLevel => l !== null),
  };
}

/**
 * Reads `app.pathshala_registration_options`. Null when the answer is not the expected shape (no term, no household,
 * or a payment mode this build does not know). A learner, track or level that cannot be read is left out and counted in
 * `skipped`; the rest still shows.
 */
export function parseRegistrationOptions(raw: unknown): RegistrationOptions | null {
  if (!isObject(raw)) return null;
  const term = parseTerm(raw.term);
  const household = parseHousehold(raw.household);
  if (!term || !household) return null;
  let skipped = 0;
  const keep = <T>(items: unknown[], parse: (v: unknown) => T | null): T[] =>
    items.flatMap((item) => {
      const parsed = parse(item);
      if (parsed === null) skipped += 1;
      return parsed === null ? [] : [parsed];
    });
  const learners = keep(list(raw.learners), parseLearner);
  const tracks = keep(list(raw.tracks), parseTrack);
  for (const t of list(raw.tracks)) if (isObject(t)) skipped += list(t.levels).filter((l) => parseLevel(l) === null).length;
  const households = list(raw.households)
    .map(parseHousehold)
    .filter((h): h is RegHousehold => h !== null);
  if (!households.some((h) => h.id === household.id)) households.unshift(household);
  return {
    term,
    household: { ...household, membership: isObject(raw.household) ? str(raw.household.membership) : null },
    households,
    learners,
    tracks,
    canRegister: raw.can_register === true,
    cannotReason: str(raw.cannot_reason),
    skipped,
  };
}

function parseLine(v: unknown): RegLine | null {
  if (!isObject(v)) return null;
  const trackId = str(v.track_id);
  const outcome = oneOf(v.outcome, OUTCOMES);
  const totalCents = count(v.total_cents);
  if (!trackId || !outcome || totalCents === null) return null;
  // A part the database left out is none; a part that is there must be whole cents, or the line is not read at all.
  const part = (x: unknown): number | null => (x === undefined || x === null ? 0 : count(x));
  const parts = [part(v.base_fee_cents), part(v.sibling_discount_cents), part(v.cap_reduction_cents), part(v.late_fee_cents), part(v.assistance_cents)];
  if (parts.some((p) => p === null)) return null;
  const [baseFeeCents, siblingDiscountCents, capReductionCents, lateFeeCents, assistanceCents] = parts as number[];
  const pledge = isObject(v.pledge) && str(v.pledge.id) ? { id: str(v.pledge.id) as string, number: str(v.pledge.number), dueOn: str(v.pledge.due_on) } : null;
  return {
    personId: str(v.person_id),
    trackId,
    levelId: str(v.level_id),
    learnerKind: v.learner_kind === 'child' || v.learner_kind === 'adult' ? v.learner_kind : null,
    familyRank: count(v.family_rank),
    outcome,
    baseFeeCents,
    siblingDiscountCents,
    capReductionCents,
    lateFeeCents,
    assistanceCents,
    totalCents,
    enrollmentId: str(v.enrollment_id),
    pledge,
  };
}

function parsePay(v: unknown): RegPay | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isObject(v)) return undefined;
  const amountCents = count(v.amount_cents);
  if (amountCents === null) return undefined;
  return {
    amountCents,
    pledgeIds: list(v.pledge_ids).filter((x): x is string => typeof x === 'string' && x.trim() !== ''),
    forLabel: str(v.for_label),
    holdUntil: str(v.hold_until),
    officePaymentAllowed: v.office_payment_allowed === true,
  };
}

/**
 * Reads the answer of `app.preview_pathshala_registration` and `app.register_pathshala_children`. This is money, so it
 * is all or nothing: one line that cannot be read (an unknown outcome, a total that is not whole cents) makes the whole
 * answer unusable (null), rather than showing lines that do not add up to the total.
 */
export function parseRegistrationResult(raw: unknown): RegistrationResult | null {
  if (!isObject(raw) || !Array.isArray(raw.lines)) return null;
  const lines = raw.lines.map(parseLine);
  if (lines.some((l) => l === null)) return null;
  const totalCents = count(raw.total_cents);
  const pay = parsePay(raw.pay);
  if (totalCents === null || pay === undefined) return null;
  return {
    registrationId: str(raw.registration_id),
    lines: lines as RegLine[],
    childrenTotalCents: count(raw.children_total_cents) ?? 0,
    adultsTotalCents: count(raw.adults_total_cents) ?? 0,
    totalCents,
    pay,
    pendingCount: list(raw.pending).length,
  };
}

// ---------------------------------------------------------------------------
// Step 0: before you start
// ---------------------------------------------------------------------------

/** Why the flow cannot go on from the first step: the window, or the database's own reason. Null when it can. */
export type StartBlock = { kind: 'cannot'; reason: string | null } | { kind: 'closed' } | { kind: 'not_yet'; opensAt: string | null } | null;

export function startBlock(o: Pick<RegistrationOptions, 'term' | 'canRegister' | 'cannotReason'>): StartBlock {
  const state = o.term.window.state;
  if (!o.canRegister) {
    // The database's own sentence says it best; without one, the window says why.
    if (o.cannotReason) return { kind: 'cannot', reason: o.cannotReason };
    if (state === 'not_yet') return { kind: 'not_yet', opensAt: o.term.window.opensAt };
    if (state === 'closed') return { kind: 'closed' };
    return { kind: 'cannot', reason: null };
  }
  if (state === 'not_yet') return { kind: 'not_yet', opensAt: o.term.window.opensAt };
  if (state === 'closed') return { kind: 'closed' };
  return null;
}

/** `household.membership`: an active membership, an application on its way, or none (the seats wait for it, P6). */
export function membershipState(m: string | null): 'member' | 'applying' | 'none' {
  const v = (m ?? '').toLowerCase();
  if (v === 'active' || v === 'life') return 'member';
  if (['pending', 'applied', 'application', 'applying', 'in_progress', 'submitted'].includes(v)) return 'applying';
  return 'none';
}

/** Which of the community's terms the flow opens on: the one asked for, else the first open for registration, else the first. */
export function chooseTerm<T extends { id: string }>(terms: T[], asked: string | null | undefined, isOpen: (t: T) => boolean): T | null {
  return terms.find((t) => t.id === asked) ?? terms.find(isOpen) ?? terms[0] ?? null;
}

// ---------------------------------------------------------------------------
// Step 1: who is joining
// ---------------------------------------------------------------------------

/** An adult class (a minimum age of 18 or more): adults only (P24). */
export function isAdultClass(l: Pick<RegLevel, 'minAge'>): boolean {
  return l.minAge !== null && l.minAge >= ADULT_AGE;
}

/** A children's level (a maximum age under 18): children only (P24). */
export function isChildrensLevel(l: Pick<RegLevel, 'maxAge'>): boolean {
  return l.maxAge !== null && l.maxAge < ADULT_AGE;
}

/** Whether an age is inside a level's band; null when the age is not known (a level with no band fits anyone). */
export function levelFits(l: Pick<RegLevel, 'minAge' | 'maxAge'>, age: number | null): boolean | null {
  if (l.minAge === null && l.maxAge === null) return true;
  if (age === null) return null;
  return (l.minAge === null || age >= l.minAge) && (l.maxAge === null || age <= l.maxAge);
}

/** Who a level is for: adult classes are never offered to a child, children's levels never to an adult learner. */
export function levelAllowed(l: Pick<RegLevel, 'minAge' | 'maxAge'>, countsAsChild: boolean): boolean {
  return countsAsChild ? !isAdultClass(l) : !isChildrensLevel(l);
}

/** The learner as the level rules see them: an age on the cut-off date (or not known) and whether they count as a child. */
export type LearnerAge = { age: number | null; countsAsChild: boolean };

/** A live enrollment takes its track (withdrawn ones do not). Before 0591 an enrollment has no track: it took the whole term. */
function takes(e: RegEnrollment, trackId: string): boolean {
  return e.status !== 'withdrawn' && (e.trackId === null || e.trackId === trackId);
}

/** The tracks a learner can still be registered in this term: not taken by a live enrollment, with a level they may take. */
export function freeTracks(learner: Pick<RegLearner, 'enrollments'> & LearnerAge, tracks: RegTrack[]): RegTrack[] {
  return tracks.filter((t) => !learner.enrollments.some((e) => takes(e, t.id)) && t.levels.some((l) => levelAllowed(l, learner.countsAsChild)));
}

export type LearnerRow = {
  learner: RegLearner;
  isMe: boolean;
  /** Children first (oldest first), then adult learners (the registering adult first). */
  group: 'child' | 'adult';
  /** The tracks they can still join; empty when there is nothing left (then they cannot be chosen). */
  free: RegTrack[];
  /** Their live enrollments this term, to say where each stands. */
  live: RegEnrollment[];
  selectable: boolean;
};

function asAge(l: RegLearner): LearnerAge & Pick<RegLearner, 'enrollments'> {
  return { age: l.ageOnCutoff, countsAsChild: l.countsAsChild, enrollments: l.enrollments };
}

/** Everyone the database listed, in the order the screen shows them, with what each can still join. */
export function learnerRows(o: Pick<RegistrationOptions, 'learners' | 'tracks'>, meId: string | null): LearnerRow[] {
  const rows = o.learners.map((learner, index) => {
    const free = freeTracks(asAge(learner), o.tracks);
    return {
      row: {
        learner,
        isMe: learner.personId === meId,
        group: learner.countsAsChild ? ('child' as const) : ('adult' as const),
        free,
        live: learner.enrollments.filter((e) => e.status !== 'withdrawn'),
        selectable: free.length > 0,
      },
      index,
    };
  });
  const rank = (r: LearnerRow) => (r.group === 'child' ? 0 : r.isMe ? 1 : 2);
  return rows
    .sort((a, b) => {
      const g = rank(a.row) - rank(b.row);
      if (g !== 0) return g;
      if (a.row.group === 'child') {
        // Oldest first; an unknown age after the known ones.
        const x = a.row.learner.ageOnCutoff ?? -1;
        const y = b.row.learner.ageOnCutoff ?? -1;
        if (x !== y) return y - x;
      }
      return a.index - b.index;
    })
    .map((r) => r.row);
}

/** A child the parent adds who is not on the family yet (the office adds them first; `new_child` in the contract). */
export type NewChild = { firstName: string; lastName: string; dateOfBirth: string; relationship: string };

/** Age on the cut-off date of a child being added (display only: the database prices them from the same birth date). */
export function newChildAge(child: Pick<NewChild, 'dateOfBirth'>, cutoff: string | null, today: string): LearnerAge {
  const age = ageOn(child.dateOfBirth, cutoff ?? today);
  return { age, countsAsChild: age === null || age < ADULT_AGE };
}

// ---------------------------------------------------------------------------
// Step 2: a level for each learner
// ---------------------------------------------------------------------------

/** The levels of a track a learner may take, those for their age first (P24); the rest under "Other levels". */
export function levelGroups(track: Pick<RegTrack, 'levels'>, learner: LearnerAge): { fit: RegLevel[]; other: RegLevel[] } {
  const allowed = track.levels.filter((l) => levelAllowed(l, learner.countsAsChild));
  // Without an age nothing can be ordered by it: every level they may take is listed together.
  if (learner.age === null) return { fit: allowed, other: [] };
  return { fit: allowed.filter((l) => levelFits(l, learner.age) !== false), other: allowed.filter((l) => levelFits(l, learner.age) === false) };
}

/** A level outside the learner's age band waits for the office to confirm it (no automatic seat, nothing billed until then). */
export function officeConfirms(level: Pick<RegLevel, 'minAge' | 'maxAge'>, learner: LearnerAge): boolean {
  return levelFits(level, learner.age) === false;
}

/** Why a level cannot be chosen: it is full with no waitlist, or the community has not set its fee yet. Null when it can. */
export function levelUnavailable(l: Pick<RegLevel, 'seats' | 'feeCents'>): 'full' | 'no_fee' | null {
  if (l.seats === 'full') return 'full';
  if (l.feeCents === null) return 'no_fee';
  return null;
}

/** The level to start with: the database's suggestion for that track, when the learner may take it and it can be chosen. */
export function suggestedLevel(learner: Pick<RegLearner, 'suggested'> & LearnerAge, track: RegTrack): RegSuggestion | null {
  const s = learner.suggested.find((x) => x.trackId === track.id);
  const level = s ? track.levels.find((l) => l.id === s.levelId) : undefined;
  if (!s || !level || !levelAllowed(level, learner.countsAsChild) || levelUnavailable(level)) return null;
  return s;
}

/** The track a learner starts with: one the database suggested a level in, else Jainism, else the first they can join. */
export function firstTrack(learner: Pick<RegLearner, 'suggested'>, free: RegTrack[]): RegTrack | null {
  return free.find((t) => learner.suggested.some((s) => s.trackId === t.id)) ?? free.find((t) => t.key === 'jainism') ?? free[0] ?? null;
}

export const SUGGESTION_KEY: Record<SuggestionReason, StringKey> = {
  teacher: 'reg.suggest.teacher',
  previous: 'reg.suggest.previous',
  age: 'reg.suggest.age',
};

/** One learner's choices: a track each with a level, or "let the office decide" (pledge-mode terms only, P25). */
export type TrackChoice = { trackId: string; levelId: string | null; unsure: boolean };

export type Selection = {
  /** The person id, or `new:<n>` for a child being added. */
  key: string;
  personId: string | null;
  newChild: NewChild | null;
  tracks: TrackChoice[];
  /** The family's own note for the office ("Please place with her cousin"). */
  note: string;
};

/** "Not sure" is offered only in a pledge-mode term: in a pay-now term the family pays a known price (P25). */
export function unsureAllowed(mode: PaymentMode): boolean {
  return mode === 'pledge';
}

/** Every chosen learner has a track, and every track a level (or "let the office decide" where that is allowed). */
export function selectionsComplete(selections: Selection[], mode: PaymentMode): boolean {
  return selections.length > 0 && selections.every((s) => s.tracks.length > 0 && s.tracks.every((c) => !!c.levelId || (c.unsure && unsureAllowed(mode))));
}

/** `p_learners` for the preview and the registration, one entry per learner and track, in the contract's shape. */
export function learnersArg(selections: Selection[], assistanceRequested: boolean): Record<string, unknown>[] {
  return selections.flatMap((s) =>
    s.tracks.map((c) => {
      const levelId = c.unsure ? null : c.levelId;
      const note = s.note.trim() || null;
      if (s.newChild) {
        const n = s.newChild;
        return { new_child: { first_name: n.firstName.trim(), last_name: n.lastName.trim(), date_of_birth: n.dateOfBirth, relationship: n.relationship }, track_id: c.trackId, level_id: levelId, note };
      }
      return { person_id: s.personId, track_id: c.trackId, level_id: levelId, note, assistance_requested: assistanceRequested };
    }),
  );
}

// ---------------------------------------------------------------------------
// Step 3: review the fee
// ---------------------------------------------------------------------------

/** `p_expected_outcomes`: what the family was shown, so the registration refuses when a seat went in the meantime. */
export function expectedOutcomes(preview: RegistrationResult): Record<string, unknown>[] {
  return preview.lines.map((l) => ({ person_id: l.personId, track_id: l.trackId, level_id: l.levelId, outcome: l.outcome }));
}

export type ReviewPart = { key: 'levelFee' | 'sibling' | 'cap' | 'late' | 'assistance'; cents: number };

/** A line's parts as the database priced them: the level fee, then each reduction (negative) and the late fee. Zero parts are left out. */
export function lineParts(l: RegLine): ReviewPart[] {
  const parts: ReviewPart[] = [{ key: 'levelFee', cents: l.baseFeeCents }];
  if (l.siblingDiscountCents > 0) parts.push({ key: 'sibling', cents: -l.siblingDiscountCents });
  if (l.capReductionCents > 0) parts.push({ key: 'cap', cents: -l.capReductionCents });
  if (l.lateFeeCents > 0) parts.push({ key: 'late', cents: l.lateFeeCents });
  if (l.assistanceCents > 0) parts.push({ key: 'assistance', cents: -l.assistanceCents });
  return parts;
}

/** Whether a line is an adult learner's (outside the sibling discount and the family cap, P23). */
export function isAdultLine(l: RegLine, learners: Pick<RegLearner, 'personId' | 'countsAsChild'>[]): boolean {
  if (l.learnerKind) return l.learnerKind === 'adult';
  const learner = learners.find((x) => x.personId === l.personId);
  return !!learner && !learner.countsAsChild;
}

/** What happens to a line, in the family's words (§3.1 step 3): the key, and whether anything is charged for it now. */
export function outcomeKey(l: Pick<RegLine, 'outcome' | 'levelId'>, mode: PaymentMode): StringKey {
  switch (l.outcome) {
    case 'seat':
      return mode === 'pay_now' ? 'reg.outcome.seatPay' : 'reg.outcome.seat';
    case 'waitlist':
      return 'reg.outcome.waitlist';
    case 'membership_hold':
      return 'reg.outcome.membership';
    case 'office':
      return l.levelId ? 'reg.outcome.officeConfirms' : 'reg.outcome.officeChooses';
    case 'pending_child':
      return 'reg.outcome.pendingChild';
  }
}

/** The lines that get a seat now and cost something: what registering bills (pledge mode) or what is paid now (pay now). */
export function chargedNow(r: Pick<RegistrationResult, 'lines'>): { cents: number; count: number } {
  const seats = r.lines.filter((l) => l.outcome === 'seat' && l.totalCents > 0);
  return { cents: seats.reduce((sum, l) => sum + l.totalCents, 0), count: seats.length };
}

/** The amount to pay now in a pay-now term: the database's `pay.amount_cents` when it said, else the seat lines' totals. */
export function payNowCents(r: Pick<RegistrationResult, 'lines' | 'pay'>): number {
  return r.pay ? r.pay.amountCents : chargedNow(r).cents;
}

/**
 * The learner's name for each line: lines of people already on the family by their id; lines of children being added
 * (no person id yet) in the order those children were sent, track by track.
 */
export function lineNames(r: Pick<RegistrationResult, 'lines'>, learners: Pick<RegLearner, 'personId' | 'firstName'>[], selections: Pick<Selection, 'newChild' | 'tracks'>[]): string[] {
  const newNames = selections.flatMap((s) => (s.newChild ? s.tracks.map(() => s.newChild?.firstName.trim() ?? '') : []));
  let next = 0;
  return r.lines.map((l) => {
    if (l.personId) return learners.find((x) => x.personId === l.personId)?.firstName ?? '';
    const name = newNames[next] ?? '';
    next += 1;
    return name;
  });
}

/** Level and track names of a line (a line the office decides has a track and no level). */
export function lineLevel(l: Pick<RegLine, 'trackId' | 'levelId'>, tracks: RegTrack[]): { track: string | null; level: string | null } {
  const track = tracks.find((t) => t.id === l.trackId) ?? null;
  return { track: track?.name ?? null, level: track?.levels.find((x) => x.id === l.levelId)?.name ?? null };
}

/** The family's pledges a registration made (pledge mode): one per line with a seat and a fee. */
export function linePledges(r: Pick<RegistrationResult, 'lines'>): { ids: string[]; cents: number; dueOn: string | null } {
  const lines = r.lines.filter((l) => l.pledge);
  const due = lines.map((l) => l.pledge?.dueOn).filter((d): d is string => !!d).sort();
  return { ids: lines.map((l) => (l.pledge as RegPledge).id), cents: lines.reduce((s, l) => s + l.totalCents, 0), dueOn: due[0] ?? null };
}

// ---------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------

/** The SQLSTATEs the Pathshala functions raise their plain-English refusals with (as the payments and homework ones). */
export const REFUSAL_CODES = new Set(['22023', '42501', 'P0002', 'P0001']);

export type RegisterRoute = 'missing' | 'review' | 'refused' | 'retry';

/**
 * Where a failed registration sends the family:
 * - `missing`: this community's database cannot register yet (an older portal): offer the simple request instead;
 * - `review`: the fee or a seat changed since the review ("…please review the new total."): back to the review, with
 *   the new lines and the database's sentence;
 * - `refused`: the database said no for another reason (the window closed, not a member of the family): its sentence,
 *   shown where they pressed Register;
 * - `retry`: it may not have arrived (the connection): Try again sends the same registration (same client key: never twice).
 */
export function registerRoute(err: unknown): RegisterRoute {
  if (isMissingRpcError(err)) return 'missing';
  const code = err instanceof AppError ? err.code : err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : null;
  if (code === 'PGRST202' || code === '42883') return 'missing';
  if (code && REFUSAL_CODES.has(code)) {
    const message = err instanceof AppError ? err.userMessage : String((err as { message?: unknown }).message ?? '');
    return /\breview\b/i.test(message) ? 'review' : 'refused';
  }
  return 'retry';
}

// ---------------------------------------------------------------------------
// Afterwards: held seats, offers, status and the fee (3L › Learn, Home)
// ---------------------------------------------------------------------------

export type Countdown = { ended: true } | { ended: false; unit: 'days' | 'hours' | 'minutes'; n: number; urgent: boolean };

/** Hours before the end at which a hold reads as urgent (the reminder goes 6 hours before, §2.7). */
export const URGENT_HOURS = 6;

/** Time left on a hold: whole days from 48 hours, whole hours from one hour, else minutes (at least 1). Null without a time. */
export function holdCountdown(until: string | null | undefined, now: Date): Countdown | null {
  if (!until) return null;
  const end = new Date(until).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = end - now.getTime();
  if (ms <= 0) return { ended: true };
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const urgent = ms < URGENT_HOURS * 3600000;
  if (hours >= 48) return { ended: false, unit: 'days', n: Math.floor(hours / 24), urgent };
  if (hours >= 1) return { ended: false, unit: 'hours', n: hours, urgent };
  return { ended: false, unit: 'minutes', n: Math.max(1, minutes), urgent };
}

/** "2 days left", "5 h left", "12 min left", "Time is up". */
export function countdownText(c: Countdown, t: (key: StringKey, vars?: Record<string, string | number>) => string): string {
  if (c.ended) return t('reg.left.ended');
  return t(c.unit === 'days' ? 'reg.left.days' : c.unit === 'hours' ? 'reg.left.hours' : 'reg.left.minutes', { n: c.n });
}

/** What an enrollment row (read with `select('*')`) says beyond its status, from the 0591 columns; all null before 0591. */
export type HoldInfo = { holdReason: HoldReason | null; holdUntil: string | null; offered: boolean; registrationId: string | null; trackId: string | null };

export function holdInfo(row: Record<string, unknown>): HoldInfo {
  return {
    holdReason: oneOf(row.hold_reason, HOLD_REASONS),
    holdUntil: str(row.hold_expires_at),
    offered: !!str(row.offered_at),
    registrationId: str(row.registration_id),
    trackId: str(row.track_id),
  };
}

export type StatusView = {
  key: StringKey;
  /** The time the line names ("Seat held until Thu 6:00 PM"), to format in the community's time zone. */
  until: string | null;
  tone: 'green' | 'amber' | 'muted';
  /** A seat held (or offered) until the fee is paid online: Pay keeps it. */
  heldForPayment: boolean;
};

/** One enrollment's status in the family's words (§3.1 step 7): registered, held until, waitlisted, seat offered, placed. */
export function enrollmentStatus(status: string, hold: HoldInfo): StatusView {
  if (status === 'placed') return { key: 'reg.status.placed', until: null, tone: 'green', heldForPayment: false };
  if (status === 'active') return { key: 'reg.status.active', until: null, tone: 'green', heldForPayment: false };
  if (status === 'completed') return { key: 'reg.status.completed', until: null, tone: 'green', heldForPayment: false };
  if (status === 'withdrawn') return { key: 'reg.status.withdrawn', until: null, tone: 'muted', heldForPayment: false };
  if (status === 'waitlisted') return { key: 'reg.status.waitlisted', until: null, tone: 'amber', heldForPayment: false };
  switch (hold.holdReason) {
    case 'payment':
      return { key: hold.offered ? (hold.holdUntil ? 'reg.status.offeredUntil' : 'reg.status.offered') : hold.holdUntil ? 'reg.status.heldUntil' : 'reg.status.held', until: hold.holdUntil, tone: 'amber', heldForPayment: true };
    case 'office_payment':
      return { key: hold.holdUntil ? 'reg.status.officeUntil' : 'reg.status.office', until: hold.holdUntil, tone: 'amber', heldForPayment: true };
    case 'membership':
      return { key: 'reg.status.membership', until: null, tone: 'amber', heldForPayment: false };
    case 'assistance':
      return { key: 'reg.status.assistance', until: null, tone: 'amber', heldForPayment: false };
    case 'waiver':
      return { key: 'reg.status.waiver', until: null, tone: 'amber', heldForPayment: false };
    default:
      return { key: 'reg.status.requested', until: null, tone: 'muted', heldForPayment: false };
  }
}

/** A fee pledge of an enrollment (`pledges` with source `pathshala_fee` and `source_ref_id` = the enrollment). */
export type FeePledge = { id: string; number: string | null; amountCents: number; paidCents: number; status: string; dueOn: string | null; enrollmentId: string | null };

export type FeeSummary = { kind: 'none' } | { kind: 'paid'; totalCents: number } | { kind: 'due'; totalCents: number; openCents: number; paidCents: number; dueOn: string | null; pledgeIds: string[] };

/** An enrollment's fee from its pledges (adults only, P30): what it costs, what is still open and when it is due. Cancelled and written-off pledges do not count. */
export function feeSummary(pledges: FeePledge[]): FeeSummary {
  const live = pledges.filter((p) => p.status === 'open' || p.status === 'partially_paid' || p.status === 'paid');
  if (live.length === 0) return { kind: 'none' };
  const totalCents = live.reduce((s, p) => s + p.amountCents, 0);
  const open = live.filter((p) => openBalanceCents({ amount_cents: p.amountCents, paid_cents: p.paidCents, status: p.status, pledged_at: '', closed_at: null }) > 0);
  if (open.length === 0) return { kind: 'paid', totalCents };
  const openCents = open.reduce((s, p) => s + Math.max(0, p.amountCents - p.paidCents), 0);
  const dueOn = open.map((p) => p.dueOn).filter((d): d is string => !!d).sort()[0] ?? null;
  return { kind: 'due', totalCents, openCents, paidCents: live.reduce((s, p) => s + p.paidCents, 0), dueOn, pledgeIds: open.map((p) => p.id) };
}

export type PayableEnrollment = { id: string; personId: string; registrationId: string | null; heldForPayment: boolean; pledges: FeePledge[] };

/**
 * What Pay pays for an enrollment: a seat held for payment is paid together with the other held seats of the same
 * registration (a family pays once for all of them, §2.7); otherwise only that enrollment's open fee. Null when
 * nothing is open.
 */
export function payGroup(rows: PayableEnrollment[], target: PayableEnrollment): { pledgeIds: string[]; amountCents: number; personIds: string[] } | null {
  const group = target.heldForPayment && target.registrationId ? rows.filter((r) => r.heldForPayment && r.registrationId === target.registrationId) : [target];
  const pledgeIds: string[] = [];
  const personIds: string[] = [];
  let amountCents = 0;
  for (const r of group) {
    const fee = feeSummary(r.pledges);
    if (fee.kind !== 'due') continue;
    pledgeIds.push(...fee.pledgeIds);
    amountCents += fee.openCents;
    if (!personIds.includes(r.personId)) personIds.push(r.personId);
  }
  return pledgeIds.length > 0 && amountCents > 0 ? { pledgeIds, amountCents, personIds } : null;
}
