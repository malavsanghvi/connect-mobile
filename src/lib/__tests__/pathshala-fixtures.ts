/**
 * Answers of the Pathshala registration functions, built the way connect-crm builds them (migrations 0590 and 0591, as
 * read on the draft pull requests malavsanghvi/connect-crm#95 and #96): the same keys, the same nulls, the same
 * "not sure" and "pending child" lines. Nothing here prices anything: every amount is typed from the owner's worked
 * example (plan §2.4) exactly as `app._pathshala_price` returns it, and the helpers only assemble the answer's shape.
 *
 * Where each shape comes from (0590 = `0590_pathshala_levels_fees_quote.sql`, 0591 = `0591_pathshala_register_hold_place_bill.sql`):
 * - options: `app.pathshala_registration_options` (0590) with `app._pathshala_term_json` and `app.pathshala_registration_window`
 * - a line: `app._pathshala_price` (the amounts) + `app._pathshala_plan` (outcome, first_name, track, level, priced)
 * - a preview: `app.preview_pathshala_registration` (0590); a registration: `app.register_pathshala_children` (0591)
 */

export const ID = {
  term: 'term-2026',
  household: 'hh-shah',
  other: 'hh-mehta',
  jainism: 'track-jainism',
  gujarati: 'track-gujarati',
  toddler: 'lvl-toddler',
  j2: 'lvl-j2',
  j5: 'lvl-j5',
  moms: 'lvl-moms',
  family: 'lvl-family',
  g1: 'lvl-g1',
  riya: 'p-riya',
  dev: 'p-dev',
  anya: 'p-anya',
  mira: 'p-mira',
  raj: 'p-raj',
  waiver: 'doc-waiver-2026-1',
  registration: 'reg-1',
} as const;

export type Mode = 'pledge' | 'pay_now';
export type Raw = Record<string, unknown>;

/** `pathshala_level_band`: adult (minimum age 18 or more), children (maximum under 18), any. */
export function band(min: number | null, max: number | null): 'adult' | 'children' | 'any' {
  if (min !== null && min >= 18) return 'adult';
  if (max !== null && max < 18) return 'children';
  return 'any';
}

const level = (id: string, key: string, name: string, min: number | null, max: number | null, fee: number | null, seats: string): Raw => ({
  id,
  name,
  key,
  min_age: min,
  max_age: max,
  band: band(min, max),
  fee_cents: fee,
  seats,
});

/** The community's tracks and levels as the options list them (offered levels only: a class this term and a fee). */
export function tracksRaw(): Raw[] {
  return [
    {
      id: ID.gujarati,
      key: 'gujarati',
      name: 'Gujarati',
      levels: [level(ID.g1, 'gujarati-1', 'Gujarati 1', 6, 12, 13000, 'open')],
    },
    {
      id: ID.jainism,
      key: 'jainism',
      name: 'Jainism',
      levels: [
        level(ID.toddler, 'toddler', 'Toddler', 3, 5, 4500, 'open'),
        level(ID.j2, 'jainism-2', 'Jainism 2', 8, 10, 13000, 'open'),
        level(ID.j5, 'jainism-5', 'Jainism 5', 11, 13, 13000, 'waitlist'),
        level(ID.family, 'family', 'Family Jainism', null, null, 6000, 'open'),
        level(ID.moms, 'moms', 'Adult class (Moms)', 18, null, 5000, 'open'),
      ],
    },
  ];
}

/**
 * One item of `learners[].enrollments[]` as the options answer an ADULT of the family or the office (0591, final contract):
 * the neutral part (ids, status, when a held seat ends, the offer, the waitlist place) and the family's: the registration, why it
 * waits, why it was released, where it stands in a sentence and the fee line with its one pledge.
 */
export function enrollmentRaw(over: Raw = {}): Raw {
  return {
    enrollment_id: 'e-1',
    track_id: ID.jainism,
    level_id: ID.j2,
    class_id: 'cl-j2',
    status: 'placed',
    hold_expires_at: null,
    offered_at: null,
    waitlist_position: null,
    registration_id: ID.registration,
    hold_reason: null,
    withdrawal_reason: null,
    state: 'registered for Jainism 2 (Sundays 10:00-11:30)',
    fee: {
      status: 'billed',
      total_cents: 11700,
      priced: true,
      assistance_requested: false,
      pledge: { id: 'pl-1', number: 'JSH-PL-20114', amount_cents: 11700, paid_cents: 0, status: 'open', due_on: '2026-09-20' },
    },
    ...over,
  };
}

/** The same item for a child with their own login: only the neutral part, everything about the registration and the fee is null (P30). */
export function childEnrollmentRaw(over: Raw = {}): Raw {
  return enrollmentRaw({ registration_id: null, hold_reason: null, withdrawal_reason: null, state: null, fee: null, ...over });
}

const learner = (id: string, firstName: string, age: number | null, child: boolean, over: Raw = {}): Raw => ({
  person_id: id,
  first_name: firstName,
  is_me: false,
  age_on_cutoff: age,
  counts_as_child: child,
  needs_birth_date: age === null,
  enrollments: [] as Raw[],
  suggested: [],
  ...over,
});

/** A term as `app._pathshala_term_json` builds it. */
export function termRaw(mode: Mode = 'pledge', over: Raw = {}): Raw {
  return {
    id: ID.term,
    name: '2026-27',
    starts_on: '2026-09-06',
    ends_on: '2027-05-30',
    status: 'registration',
    window: { state: 'open', opens_at: '2026-08-01T08:00:00-05:00', closes_at: '2026-09-01T23:59:00-05:00', late_until: null, late_fee_cents: 0 },
    payment_mode: mode,
    hold_hours: 48,
    office_payment: { allowed: mode === 'pay_now', hold_days: 7 },
    seat_rule: 'automatic',
    withdrawal_credit_until: '2026-09-27',
    age_cutoff_on: '2026-09-06',
    membership_required: true,
    waiver: { document_id: ID.waiver, title: 'Pathshala waiver', version: '2026.1' },
    sibling_discount_pct: 10,
    family_cap_cents: 27500,
    first_class_on: '2026-09-13',
    fees_locked_at: '2026-07-15T17:00:00+00:00',
    campaign_id: 'camp-pathshala-2026',
    fund_id: 'fund-pathshala',
    ...over,
  };
}

/** What `app.pathshala_registration_options` answers an adult of the Shah household (Mira is the caller). */
export function optionsRaw(mode: Mode = 'pledge', over: Raw = {}): Raw {
  return {
    term: termRaw(mode),
    household: { id: ID.household, name: 'Shah household', number: 'JSH-H-2041', membership: 'active' },
    households: [{ id: ID.household, name: 'Shah household', number: 'JSH-H-2041' }],
    learners: [
      learner(ID.riya, 'Riya', 12, true, { suggested: [{ track_id: ID.jainism, level_id: ID.j5, reason: 'teacher' }] }),
      learner(ID.dev, 'Dev', 9, true, {
        suggested: [{ track_id: ID.jainism, level_id: ID.j2, reason: 'previous' }],
        enrollments: [
          enrollmentRaw({
            enrollment_id: 'e-dev-g',
            track_id: ID.gujarati,
            level_id: ID.g1,
            class_id: null,
            status: 'requested',
            hold_reason: 'payment',
            hold_expires_at: '2026-08-20T18:00:00-05:00',
            state: 'seat in Gujarati 1 held until Thu Aug 20, 6:00 pm for the fee of $130.00',
            fee: { status: 'billed', total_cents: 13000, priced: true, assistance_requested: false, pledge: { id: 'pl-dev-g', number: 'JSH-PL-20110', amount_cents: 13000, paid_cents: 0, status: 'open', due_on: '2026-08-18' } },
          }),
        ],
      }),
      learner(ID.anya, 'Anya', 4, true, { suggested: [{ track_id: ID.jainism, level_id: ID.toddler, reason: 'age' }] }),
      learner(ID.mira, 'Mira', 44, false, { is_me: true, suggested: [{ track_id: ID.jainism, level_id: ID.moms, reason: 'age' }] }),
      learner(ID.raj, 'Raj', 46, false),
    ],
    tracks: tracksRaw(),
    can_register: true,
    cannot_reason: null,
    ...over,
  };
}

/** What a child with their own login gets: no fees, no money rules, and the sentence (0590 lines 1884-1893). */
export function childOptionsRaw(): Raw {
  const raw = optionsRaw('pledge');
  const tracks = (raw.tracks as { levels: Raw[] }[]).map((t) => ({ ...t, levels: t.levels.map((l) => ({ ...l, fee_cents: null })) }));
  const term = raw.term as { window: Raw };
  return {
    ...raw,
    term: { ...term, sibling_discount_pct: null, family_cap_cents: null, window: { ...term.window, late_fee_cents: null } },
    tracks,
    can_register: false,
    cannot_reason: 'Ask a parent or guardian in your family to register you.',
  };
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export type PriceLine = {
  person: string | null;
  firstName: string;
  trackId: string;
  track: string;
  levelId: string | null;
  level: string | null;
  kind: 'child' | 'adult';
  rank: number | null;
  age: number | null;
  base: number;
  sibling?: number;
  cap?: number;
  late?: number;
  priced?: boolean;
  outcome?: string;
  assistance?: boolean;
};

/** One line as `_pathshala_plan` returns it after `_pathshala_price` (the preview strips nothing more of what is here). */
export function lineRaw(l: PriceLine): Raw {
  const sibling = l.sibling ?? 0;
  const cap = l.cap ?? 0;
  const late = l.late ?? 0;
  const priced = l.priced ?? l.levelId !== null;
  return {
    person_id: l.person,
    track_id: l.trackId,
    level_id: l.levelId,
    learner_kind: l.kind,
    family_rank: l.rank,
    age_on_cutoff: l.age,
    base_fee_cents: l.base,
    sibling_discount_cents: sibling,
    cap_reduction_cents: cap,
    late_fee_cents: late,
    assistance_cents: 0,
    total_cents: l.base - sibling - cap + late,
    outcome: l.outcome ?? 'seat',
    first_name: l.firstName,
    track: l.track,
    level: l.level,
    priced,
  };
}

const J = { trackId: ID.jainism, track: 'Jainism' };

/**
 * The owner's worked example (plan §2.4). Riya $130.00, Dev $130.00 less 10% ($13.00), Anya $45.00 less 10% ($4.50)
 * and less $12.50 to reach the family cap of $275.00, Mira (an adult) $50.00: $325.00. Without the cap Anya pays $40.50
 * and the family $337.50. A late fee of $25.00 once for each of the four learners (outside the discount and the cap)
 * makes $425.00.
 */
export type Scenario = 'cap' | 'noCap' | 'late';

export const OWNER_TOTAL = { cap: 32500, noCap: 33750, late: 42500 } as const;

export function ownerLines(s: Scenario = 'cap', over: Partial<Record<'riya' | 'dev' | 'anya' | 'mira', Partial<PriceLine>>> = {}): PriceLine[] {
  const late = s === 'late' ? 2500 : 0;
  return [
    { person: ID.riya, firstName: 'Riya', ...J, levelId: ID.j5, level: 'Jainism 5', kind: 'child', rank: 1, age: 12, base: 13000, late, ...over.riya },
    { person: ID.dev, firstName: 'Dev', ...J, levelId: ID.j2, level: 'Jainism 2', kind: 'child', rank: 2, age: 9, base: 13000, sibling: 1300, late, ...over.dev },
    { person: ID.anya, firstName: 'Anya', ...J, levelId: ID.toddler, level: 'Toddler', kind: 'child', rank: 3, age: 4, base: 4500, sibling: 450, cap: s === 'noCap' ? 0 : 1250, late, ...over.anya },
    { person: ID.mira, firstName: 'Mira', ...J, levelId: ID.moms, level: 'Adult class (Moms)', kind: 'adult', rank: null, age: 44, base: 5000, late, ...over.mira },
  ];
}

// ---------------------------------------------------------------------------
// A preview and a registration
// ---------------------------------------------------------------------------

type Totals = { children: number; adults: number; total: number };

function totals(lines: Raw[]): Totals {
  const sum = (kind: string) => lines.filter((l) => l.learner_kind === kind).reduce((s, l) => s + (l.total_cents as number), 0);
  const children = sum('child');
  const adults = sum('adult');
  return { children, adults, total: children + adults };
}

/** The line total of a seat line that is billed now: not one waiting for a fee assistance decision (`preview_pathshala_registration`'s `v_due`). */
function dueNow(lines: Raw[], assistance: boolean): number {
  return assistance ? 0 : lines.filter((l) => l.outcome === 'seat').reduce((s, l) => s + (l.total_cents as number), 0);
}

export type Built = { assistance?: boolean; late?: boolean; payHoldUntil?: string | null; officeAllowed?: boolean };

/**
 * `app.preview_pathshala_registration`: no registration, no enrollment and no pledge on the lines; `due_now_cents` is the
 * seat lines' fees (none while a fee assistance decision is asked for); in a pay-now term `pay` carries `pledge_ids: []` and
 * `hold_until` = now + hold hours; in a pledge-mode term `pay` is null.
 */
export function previewRaw(mode: Mode, price: PriceLine[], built: Built = {}): Raw {
  const lines = price.map(lineRaw);
  const t = totals(lines);
  const due = dueNow(lines, built.assistance === true);
  return {
    registration_id: null,
    lines,
    children_total_cents: t.children,
    adults_total_cents: t.adults,
    total_cents: t.total,
    due_now_cents: due,
    pay:
      mode === 'pay_now'
        ? {
            amount_cents: due,
            pledge_ids: [],
            for_label: `Pathshala fee 2026-27 · ${[...new Set(price.filter((l) => (l.outcome ?? 'seat') === 'seat').map((l) => l.firstName))].join(', ')}`,
            hold_until: built.payHoldUntil ?? '2026-09-03T14:00:00-05:00',
            office_payment_allowed: built.officeAllowed ?? true,
          }
        : null,
    pending: price
      .filter((l) => l.outcome === 'pending_child')
      .map((l) => ({ first_name: l.firstName, last_name: 'Shah', track_id: l.trackId, level_id: l.levelId })),
    late: built.late ?? price.some((l) => (l.late ?? 0) > 0),
  };
}

const DUE = ['2026-09-20', '2026-09-20', '2026-09-21', '2026-09-20'];

/**
 * `app.register_pathshala_children`: each line gains `enrollment_id` and `pledge {id, number, due_on, amount_cents}` (null
 * for a line that is not a seat, one waiting for a fee assistance decision, a free one, or one not billed because Pledges
 * & donations is off); a child being added has `enrollment_id` null and a `pending_registration_id`; `due_now_cents` is the
 * pledges made (in a pledge-mode term they are due on `pledge.due_on`, not now); `pay` is null in a pledge-mode term, and
 * in a pay-now term `{amount_cents, pledge_ids, for_label, hold_until, office_payment_allowed}` with `hold_until` null
 * when nothing is to be paid; `payment_mode` is the term's.
 */
export function registerRaw(mode: Mode, price: PriceLine[], built: Built & { replayed?: boolean; registrationId?: string } = {}): Raw {
  const assist = built.assistance === true;
  const lines: Raw[] = price.map((l, i) => {
    const line = lineRaw(l);
    if (l.outcome === 'pending_child') return { ...line, enrollment_id: null, pledge: null, pending_registration_id: `pr-${i + 1}` };
    const total = line.total_cents as number;
    const billed = (l.outcome ?? 'seat') === 'seat' && total > 0 && !assist;
    return {
      ...line,
      enrollment_id: `e-${i + 1}`,
      pledge: billed ? { id: `pl-${i + 1}`, number: `JSH-PL-${20113 + i}`, due_on: mode === 'pay_now' ? '2026-08-20' : DUE[i] ?? '2026-09-20', amount_cents: total } : null,
    };
  });
  const t = totals(lines);
  const pledges = lines.filter((l) => l.pledge).map((l) => l.pledge as { id: string; amount_cents: number });
  const due = pledges.reduce((s, p) => s + p.amount_cents, 0);
  const waitingForPayment = lines.some((l) => l.outcome === 'seat' && l.pledge);
  const out: Raw = {
    registration_id: built.registrationId ?? ID.registration,
    lines,
    children_total_cents: t.children,
    adults_total_cents: t.adults,
    total_cents: t.total,
    due_now_cents: due,
    pay:
      mode === 'pay_now'
        ? {
            amount_cents: due,
            pledge_ids: pledges.map((p) => p.id),
            for_label: `Pathshala fee 2026-27 · ${[...new Set(price.filter((l) => (l.outcome ?? 'seat') === 'seat').map((l) => l.firstName))].join(', ')}`,
            hold_until: waitingForPayment ? (built.payHoldUntil ?? '2026-08-22T18:00:00-05:00') : null,
            office_payment_allowed: built.officeAllowed ?? true,
          }
        : null,
    pending: price
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.outcome === 'pending_child')
      // One add-member request for each child (0591: a new child in two tracks is one child), one pending entry for each line.
      .map(({ l, i }) => ({ pending_registration_id: `pr-${i + 1}`, change_request_id: `cr-${l.firstName.toLowerCase()}`, first_name: l.firstName, last_name: 'Shah', track_id: l.trackId, level_id: l.levelId })),
    late: built.late ?? price.some((l) => (l.late ?? 0) > 0),
    payment_mode: mode,
  };
  return built.replayed ? { ...out, replayed: true } : out;
}

/** An answer of PostgREST for a database error: `{code, details, hint, message}`. */
export function postgrestError(code: string, message: string, hint: string | null = null): { code: string; details: null; hint: string | null; message: string } {
  return { code, details: null, hint, message };
}
