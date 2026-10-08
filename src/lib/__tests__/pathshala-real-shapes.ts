/**
 * The answers of the Pathshala registration functions written out as literal JSON, one key at a time, from the SQL of
 * connect-crm PR 95 (migration 0590) and PR 96 (migration 0591, head 34d45be) and the values their tests assert
 * (supabase/tests/75_pathshala_fees_test.sql, 76_pathshala_registration_test.sql, 77_pathshala_review_fixes_test.sql).
 * Nothing here is computed: no helper adds a price up, every number is typed. They are the shapes `jsonb_build_object`
 * produces, in its key order, with its nulls, so a parser that reads a key the database does not send, or misses one it
 * does, fails a test.
 *
 * Where each answer comes from:
 * - OPTIONS_PLEDGE:        `app.pathshala_registration_options` (0591:2356) for Mira, term 2026-27 (test 76: Shah household h1,
 *                          T1: sibling discount 10%, cap $275.00, Toddler $45, Jainism 2/3/5 and the adult classes, Gujarati 1)
 * - PREVIEW_PLEDGE:        `app.preview_pathshala_registration` (0590:1805) for the owner's four learners (test 76 `pv1`,
 *                          its `seat/13000, seat/11700, seat/2800, seat/5000`, total 32500, `pay` null)
 * - REGISTER_PLEDGE:       `app.register_pathshala_children` (0591:1162), test 76 `reg1`: the same four lines with their enrollment
 *                          and pledge (due 14 days after the seat), `pay` null, `payment_mode` pledge
 * - OPTIONS_PAY_NOW:       the same options for term "Summer 2027" (T2: pay now, 48 h hold, office payment allowed, the published waiver)
 * - PREVIEW_PAY_NOW:       the preview of Ved (Jainism 2, $130.00) and Mina (Toddler, Free) in T2: `pay.pledge_ids` is `[]`
 * - REGISTER_PAY_NOW:      test 76 `reg_ved2`: `pay.amount_cents` 13000, one pledge id, "Pathshala fee Summer 2027 · Ved, Mina",
 *                          office payment allowed, `hold_until` set, Ved's pledge due today, Mina's line a Free level (no pledge)
 * - REGISTER_FREE_ONLY:    test 76 `reg_anya2`: nothing to pay: `pay.amount_cents` 0, `hold_until` null, no pledge
 * - the held / offered / waitlisted / released enrollments: tests 76 (sweep) and 77 (section 11, `opt_mira_held`, `opt_mira_t1`, `opt_riya_held`)
 * - ERRORS:                the exact sentences, codes and hints the tests assert
 *
 * The dates are fixed here (the tests use now()); every date is the database's own format (`pathshala_iso`: local time with
 * its offset; dates as YYYY-MM-DD).
 */

export type Json = Record<string, unknown>;

export const P = {
  riya: '76000000-0000-4000-8000-000000000104',
  dev: '76000000-0000-4000-8000-000000000105',
  anya: '76000000-0000-4000-8000-000000000106',
  mira: '76000000-0000-4000-8000-000000000103',
  rahul: '76000000-0000-4000-8000-000000000107',
  ved: '76000000-0000-4000-8000-00000000010e',
  mina: '76000000-0000-4000-8000-00000000010f',
} as const;

export const T = {
  jainism: '76000000-0000-4000-8000-000000000301',
  gujarati: '76000000-0000-4000-8000-000000000302',
} as const;

export const L = {
  toddler: '76000000-0000-4000-8000-000000000400',
  j2: '76000000-0000-4000-8000-000000000402',
  j3: '76000000-0000-4000-8000-000000000403',
  j5: '76000000-0000-4000-8000-000000000405',
  dads: '76000000-0000-4000-8000-000000000408',
  moms: '76000000-0000-4000-8000-000000000409',
  g1: '76000000-0000-4000-8000-000000000411',
} as const;

export const TERM = { t1: '76000000-0000-4000-8000-000000000501', t2: '76000000-0000-4000-8000-000000000502' } as const;
export const H = { shah: '76000000-0000-4000-8000-000000000201', desai: '76000000-0000-4000-8000-000000000204' } as const;
export const WAIVER = '76000000-0000-4000-8000-000000000801';
export const REG = { pledge: 'a7600000-0000-4000-8000-0000000000a1', payNow: 'a7600000-0000-4000-8000-0000000000a2', free: 'a7600000-0000-4000-8000-0000000000a3' } as const;

// ---------------------------------------------------------------------------
// Options (0591 `pathshala_registration_options`)
// ---------------------------------------------------------------------------

const level = (id: string, name: string, key: string, min: number | null, max: number | null, band: string, fee: number, seats: string): Json => ({
  id,
  name,
  key,
  min_age: min,
  max_age: max,
  band,
  fee_cents: fee,
  seats,
});

const learner = (person: string, first: string, age: number, child: boolean, suggested: Json[], over: Json = {}): Json => ({
  person_id: person,
  first_name: first,
  is_me: false,
  age_on_cutoff: age,
  counts_as_child: child,
  needs_birth_date: false,
  enrollments: [],
  suggested,
  ...over,
});

const suggestion = (track: string, lvl: string): Json => ({ track_id: track, level_id: lvl, reason: 'age' });

/** `app._pathshala_term_json` for T1 (pledge mode, test 75/76): window open, no waiver yet. */
export const TERM_PLEDGE: Json = {
  id: TERM.t1,
  name: '2026-27',
  starts_on: '2026-09-06',
  ends_on: '2027-05-30',
  status: 'registration',
  window: { state: 'open', opens_at: null, closes_at: '2026-10-08T12:00:00-05:00', late_until: null, late_fee_cents: 0 },
  payment_mode: 'pledge',
  hold_hours: 48,
  office_payment: { allowed: false, hold_days: 7 },
  seat_rule: 'automatic',
  withdrawal_credit_until: '2026-09-20',
  age_cutoff_on: '2026-09-06',
  membership_required: true,
  waiver: null,
  sibling_discount_pct: 10,
  family_cap_cents: 27500,
  first_class_on: '2026-09-06',
  fees_locked_at: '2026-08-01T09:00:00+00:00',
  campaign_id: '76000000-0000-4000-8000-0000000007c1',
  fund_id: '76000000-0000-4000-8000-000000000701',
};

/** The same for T2 "Summer 2027": pay now, office payment allowed, the published waiver (test 76 sets both). */
export const TERM_PAY_NOW: Json = {
  ...TERM_PLEDGE,
  id: TERM.t2,
  name: 'Summer 2027',
  payment_mode: 'pay_now',
  office_payment: { allowed: true, hold_days: 7 },
  waiver: { document_id: WAIVER, title: 'Pathshala waiver', version: '2026.1' },
  sibling_discount_pct: 0,
  family_cap_cents: null,
  window: { state: 'open', opens_at: null, closes_at: null, late_until: null, late_fee_cents: 0 },
};

const TRACKS_T1: Json[] = [
  {
    id: T.gujarati,
    key: 'gujarati',
    name: 'Gujarati',
    levels: [level(L.g1, 'Gujarati 1', '1', null, null, 'any', 13000, 'open')],
  },
  {
    id: T.jainism,
    key: 'jainism',
    name: 'Jainism',
    levels: [
      level(L.toddler, 'Toddler', 'toddler', 3, 5, 'children', 4500, 'open'),
      level(L.j2, 'Jainism 2', '2', 8, 10, 'children', 13000, 'open'),
      level(L.j3, 'Jainism 3', '3', 9, 11, 'children', 13000, 'open'),
      level(L.j5, 'Jainism 5', '5', 11, 13, 'children', 13000, 'open'),
      level(L.dads, 'Adult class (Dads)', 'adult_dads', 18, null, 'adult', 5000, 'open'),
      level(L.moms, 'Adult class (Moms)', 'adult_moms', 18, null, 'adult', 5000, 'open'),
    ],
  },
];

/** Mira (the caller) opens registration for the Shah household: nobody is registered yet. Children first (oldest first), then "me", then the other adult. */
export const OPTIONS_PLEDGE: Json = {
  term: TERM_PLEDGE,
  household: { id: H.shah, name: 'Shah household', number: 'JSH-H-2041', membership: 'active' },
  households: [{ id: H.shah, name: 'Shah household', number: 'JSH-H-2041' }],
  learners: [
    learner(P.riya, 'Riya', 12, true, [suggestion(T.jainism, L.j5)]),
    learner(P.dev, 'Dev', 9, true, [suggestion(T.jainism, L.j2)]),
    learner(P.anya, 'Anya', 4, true, [suggestion(T.jainism, L.toddler)]),
    learner(P.mira, 'Mira', 44, false, [suggestion(T.jainism, L.dads)], { is_me: true }),
    learner(P.rahul, 'Rahul', 46, false, [suggestion(T.jainism, L.dads)]),
  ],
  tracks: TRACKS_T1,
  can_register: true,
  cannot_reason: null,
};

/** T2 for the Desai household (Lata is the caller): Ved 9 and Mina 4; Toddler is Free there. */
export const OPTIONS_PAY_NOW: Json = {
  term: TERM_PAY_NOW,
  household: { id: H.desai, name: 'Desai household', number: 'JSH-H-2044', membership: 'active' },
  households: [{ id: H.desai, name: 'Desai household', number: 'JSH-H-2044' }],
  learners: [
    learner(P.ved, 'Ved', 9, true, [suggestion(T.jainism, L.j2)]),
    learner(P.mina, 'Mina', 4, true, [suggestion(T.jainism, L.toddler)]),
  ],
  tracks: [
    {
      id: T.jainism,
      key: 'jainism',
      name: 'Jainism',
      levels: [
        level(L.toddler, 'Toddler', 'toddler', 3, 5, 'children', 0, 'open'),
        level(L.j2, 'Jainism 2', '2', 8, 10, 'children', 13000, 'open'),
        level(L.j5, 'Jainism 5', '5', 11, 13, 'children', 13000, 'open'),
      ],
    },
  ],
  can_register: true,
  cannot_reason: null,
};

/** A child with their own login (test 75 `opt_kid`): the levels without a fee, no discount, cap or late fee, and the sentence. */
export const OPTIONS_CHILD: Json = {
  ...OPTIONS_PLEDGE,
  term: { ...TERM_PLEDGE, sibling_discount_pct: null, family_cap_cents: null, window: { ...(TERM_PLEDGE.window as Json), late_fee_cents: null } },
  tracks: TRACKS_T1.map((t) => ({ ...t, levels: (t.levels as Json[]).map((l) => ({ ...l, fee_cents: null })) })),
  can_register: false,
  cannot_reason: 'Ask a parent or guardian in your family to register you.',
};

// ---------------------------------------------------------------------------
// Lines, previews and registrations
// ---------------------------------------------------------------------------

const line = (over: Json): Json => ({
  person_id: null,
  track_id: T.jainism,
  level_id: null,
  learner_kind: 'child',
  family_rank: null,
  age_on_cutoff: null,
  base_fee_cents: 0,
  sibling_discount_cents: 0,
  cap_reduction_cents: 0,
  late_fee_cents: 0,
  assistance_cents: 0,
  total_cents: 0,
  outcome: 'seat',
  first_name: '',
  track: 'Jainism',
  level: null,
  priced: true,
  ...over,
});

/** The owner's four learners, test 76 `reg1` (seat/13000, seat/11700, seat/2800, seat/5000): $325.00 with the $275.00 cap on the children. */
const OWNER_LINES: Json[] = [
  line({ person_id: P.riya, level_id: L.j5, family_rank: 1, age_on_cutoff: 12, base_fee_cents: 13000, total_cents: 13000, first_name: 'Riya', level: 'Jainism 5' }),
  line({ person_id: P.dev, level_id: L.j2, family_rank: 2, age_on_cutoff: 9, base_fee_cents: 13000, sibling_discount_cents: 1300, total_cents: 11700, first_name: 'Dev', level: 'Jainism 2' }),
  line({ person_id: P.anya, level_id: L.toddler, family_rank: 3, age_on_cutoff: 4, base_fee_cents: 4500, sibling_discount_cents: 450, cap_reduction_cents: 1250, total_cents: 2800, first_name: 'Anya', level: 'Toddler' }),
  line({ person_id: P.mira, level_id: L.moms, learner_kind: 'adult', family_rank: null, age_on_cutoff: 44, base_fee_cents: 5000, total_cents: 5000, first_name: 'Mira', level: 'Adult class (Moms)' }),
];

export const PREVIEW_PLEDGE: Json = {
  registration_id: null,
  lines: OWNER_LINES,
  children_total_cents: 27500,
  adults_total_cents: 5000,
  total_cents: 32500,
  due_now_cents: 32500,
  pay: null,
  pending: [],
  late: false,
};

/** Each line gains `enrollment_id` and `pledge {id, number, due_on, amount_cents}`; today in the test is 2026-09-08, so the pledges are due 14 days later. */
export const REGISTER_PLEDGE: Json = {
  registration_id: REG.pledge,
  lines: OWNER_LINES.map((l, i) => ({
    ...l,
    enrollment_id: `b7600000-0000-4000-8000-00000000000${i + 1}`,
    pledge: { id: `c7600000-0000-4000-8000-00000000000${i + 1}`, number: `JSH-PL-2011${i + 3}`, due_on: '2026-09-22', amount_cents: l.total_cents },
  })),
  children_total_cents: 27500,
  adults_total_cents: 5000,
  total_cents: 32500,
  due_now_cents: 32500,
  pay: null,
  pending: [],
  late: false,
  payment_mode: 'pledge',
};

const VED = line({ person_id: P.ved, level_id: L.j2, family_rank: 1, age_on_cutoff: 9, base_fee_cents: 13000, total_cents: 13000, first_name: 'Ved', level: 'Jainism 2' });
const MINA = line({ person_id: P.mina, level_id: L.toddler, family_rank: 2, age_on_cutoff: 4, base_fee_cents: 0, total_cents: 0, first_name: 'Mina', level: 'Toddler' });

export const PREVIEW_PAY_NOW: Json = {
  registration_id: null,
  lines: [VED, MINA],
  children_total_cents: 13000,
  adults_total_cents: 0,
  total_cents: 13000,
  due_now_cents: 13000,
  pay: { amount_cents: 13000, pledge_ids: [], for_label: 'Pathshala fee Summer 2027 · Ved, Mina', hold_until: '2026-09-10T12:00:00-05:00', office_payment_allowed: true },
  pending: [],
  late: false,
};

export const PAY_NOW_PLEDGE_ID = 'c7600000-0000-4000-8000-0000000000e1';

export const REGISTER_PAY_NOW: Json = {
  registration_id: REG.payNow,
  lines: [
    { ...VED, enrollment_id: 'b7600000-0000-4000-8000-0000000000e1', pledge: { id: PAY_NOW_PLEDGE_ID, number: 'JSH-PL-20131', due_on: '2026-09-08', amount_cents: 13000 } },
    { ...MINA, enrollment_id: 'b7600000-0000-4000-8000-0000000000e2', pledge: null },
  ],
  children_total_cents: 13000,
  adults_total_cents: 0,
  total_cents: 13000,
  due_now_cents: 13000,
  pay: { amount_cents: 13000, pledge_ids: [PAY_NOW_PLEDGE_ID], for_label: 'Pathshala fee Summer 2027 · Ved, Mina', hold_until: '2026-09-10T12:00:00-05:00', office_payment_allowed: true },
  pending: [],
  late: false,
  payment_mode: 'pay_now',
};

/** Test 76 `reg_anya2`: a Free level in a pay-now term is placed at once; nothing to pay, no hold time, no pledge. */
export const REGISTER_FREE_ONLY: Json = {
  registration_id: REG.free,
  lines: [{ ...line({ person_id: P.anya, level_id: L.toddler, family_rank: 1, age_on_cutoff: 4, base_fee_cents: 0, total_cents: 0, first_name: 'Anya', level: 'Toddler' }), enrollment_id: 'b7600000-0000-4000-8000-0000000000f1', pledge: null }],
  children_total_cents: 0,
  adults_total_cents: 0,
  total_cents: 0,
  due_now_cents: 0,
  pay: { amount_cents: 0, pledge_ids: [], for_label: 'Pathshala fee Summer 2027 · Anya', hold_until: null, office_payment_allowed: true },
  pending: [],
  late: false,
  payment_mode: 'pay_now',
};

/**
 * Test 75 `pv2` (outcomes office, pending_child, office; the first line not priced; one pending entry named Tara). Amounts are typed
 * the way `_pathshala_price` rules them (children ranked by their highest level fee: Anya $130.00 first, Tara second with 10% off,
 * Dev, with no level yet, last and not priced); the test itself asserts only the outcomes, `priced` and `pending`.
 */
export const PREVIEW_OFFICE_AND_PENDING: Json = {
  registration_id: null,
  lines: [
    line({ person_id: P.dev, track_id: T.gujarati, level_id: null, family_rank: 3, age_on_cutoff: 9, outcome: 'office', first_name: 'Dev', track: 'Gujarati', level: null, priced: false }),
    line({ person_id: null, level_id: L.toddler, family_rank: 2, age_on_cutoff: 6, base_fee_cents: 4500, sibling_discount_cents: 450, total_cents: 4050, outcome: 'pending_child', first_name: 'Tara', level: 'Toddler' }),
    line({ person_id: P.anya, level_id: L.j2, family_rank: 1, age_on_cutoff: 4, base_fee_cents: 13000, total_cents: 13000, outcome: 'office', first_name: 'Anya', level: 'Jainism 2' }),
  ],
  children_total_cents: 17050,
  adults_total_cents: 0,
  total_cents: 17050,
  due_now_cents: 0,
  pay: null,
  pending: [{ first_name: 'Tara', last_name: 'Shah', track_id: T.jainism, level_id: L.toddler }],
  late: false,
};

// ---------------------------------------------------------------------------
// Where a seat stands: the options' learners[].enrollments[] (0591:2356; test 77 section 11)
// ---------------------------------------------------------------------------

const feeLine = (status: string, total: number, pledge: Json | null, over: Json = {}): Json => ({ status, total_cents: total, priced: true, assistance_requested: false, pledge, ...over });

/** Test 77 `opt_mira_held`: Riya's Gujarati seat is held for payment ($45.00), as an adult of the family sees it. */
export const ENROLLMENT_HELD_ADULT: Json = {
  enrollment_id: 'b7600000-0000-4000-8000-0000000000c1',
  track_id: T.gujarati,
  level_id: L.g1,
  class_id: null,
  status: 'requested',
  hold_expires_at: '2026-09-10T18:00:00-05:00',
  offered_at: null,
  waitlist_position: null,
  registration_id: REG.payNow,
  hold_reason: 'payment',
  withdrawal_reason: null,
  state: 'seat in Gujarati 1 held until Thu Sep 10, 6:00 pm for the fee of $45.00',
  fee: feeLine('billed', 4500, { id: 'c7600000-0000-4000-8000-0000000000c1', number: 'JSH-PL-20140', amount_cents: 4500, paid_cents: 0, status: 'open', due_on: '2026-09-08' }),
};

/** Test 77 `opt_riya_held`: the same seat for Riya herself: only that it ends at a time. No reason, registration, sentence or fee. */
export const ENROLLMENT_HELD_CHILD: Json = {
  ...ENROLLMENT_HELD_ADULT,
  registration_id: null,
  hold_reason: null,
  withdrawal_reason: null,
  state: null,
  fee: null,
};

/** Test 76 (sweep): a seat offered to Om from the waitlist (pay now), held 48 hours, the pledge due today. */
export const ENROLLMENT_OFFERED_ADULT: Json = {
  ...ENROLLMENT_HELD_ADULT,
  enrollment_id: 'b7600000-0000-4000-8000-0000000000c2',
  track_id: T.jainism,
  level_id: L.j2,
  offered_at: '2026-09-08T10:00:00-05:00',
  hold_expires_at: '2026-09-10T10:00:00-05:00',
  state: 'seat in Jainism 2 held until Thu Sep 10, 10:00 am for the fee of $130.00',
  fee: feeLine('billed', 13000, { id: 'c7600000-0000-4000-8000-0000000000c2', number: 'JSH-PL-20141', amount_cents: 13000, paid_cents: 0, status: 'open', due_on: '2026-09-08' }),
};

/** Test 76 (waitlist): Neel is number 2 on the Jainism 2 waitlist; a pledge-mode line has a quote and no pledge. */
export const ENROLLMENT_WAITLISTED_ADULT: Json = {
  enrollment_id: 'b7600000-0000-4000-8000-0000000000c3',
  track_id: T.jainism,
  level_id: L.j2,
  class_id: null,
  status: 'waitlisted',
  hold_expires_at: null,
  offered_at: null,
  waitlist_position: 2,
  registration_id: REG.pledge,
  hold_reason: null,
  withdrawal_reason: null,
  state: 'on the waitlist for Jainism 2 (number 2), no charge unless a seat opens',
  fee: feeLine('quoted', 11700, null),
};

/** Test 77 `opt_mira_t1`: Riya's unpaid summer seat was released; the fee line is cancelled and says why. */
export const ENROLLMENT_RELEASED_ADULT: Json = {
  enrollment_id: 'b7600000-0000-4000-8000-0000000000c4',
  track_id: T.jainism,
  level_id: L.j5,
  class_id: null,
  status: 'withdrawn',
  hold_expires_at: null,
  offered_at: null,
  waitlist_position: null,
  registration_id: REG.payNow,
  hold_reason: null,
  withdrawal_reason: 'The fee was not paid by Thu Sep 10, 6:00 pm, so the seat was released.',
  state: 'withdrawn',
  fee: feeLine('cancelled', 13000, { id: 'c7600000-0000-4000-8000-0000000000c4', number: 'JSH-PL-20142', amount_cents: 13000, paid_cents: 0, status: 'cancelled', due_on: '2026-09-08' }),
};

/** Test 76 (self-healing, 'registered' after the fee is paid): placed in a class, the pledge paid. */
export const ENROLLMENT_PLACED_PAID_ADULT: Json = {
  enrollment_id: 'b7600000-0000-4000-8000-0000000000c5',
  track_id: T.jainism,
  level_id: L.j5,
  class_id: '76000000-0000-4000-8000-000000000625',
  status: 'placed',
  hold_expires_at: null,
  offered_at: null,
  waitlist_position: null,
  registration_id: REG.payNow,
  hold_reason: null,
  withdrawal_reason: null,
  state: 'registered for Jainism 5 (Sundays 10:00–11:30 · Room C)',
  fee: feeLine('paid', 13000, { id: 'c7600000-0000-4000-8000-0000000000c5', number: 'JSH-PL-20143', amount_cents: 13000, paid_cents: 13000, status: 'paid', due_on: '2026-09-08' }),
};

/** Test 76 (waiver): another adult learner (Rahul) waits for his own agreement; his own options show it with hold_reason 'waiver'. */
export const ENROLLMENT_WAIVER_HOLD_ADULT: Json = {
  enrollment_id: 'b7600000-0000-4000-8000-0000000000c6',
  track_id: T.jainism,
  level_id: L.dads,
  class_id: null,
  status: 'requested',
  hold_expires_at: null,
  offered_at: null,
  waitlist_position: null,
  registration_id: REG.pledge,
  hold_reason: 'waiver',
  withdrawal_reason: null,
  state: 'waiting for Rahul to agree to the waiver in their own app',
  fee: feeLine('quoted', 5000, null),
};

/** The options of the Shah household with enrollments on some learners (what the answer looks like after registering). */
export function optionsWith(base: Json, enrollmentsByPerson: Record<string, Json[]>): Json {
  const learners = (base.learners as Json[]).map((l) => ({ ...l, enrollments: enrollmentsByPerson[l.person_id as string] ?? l.enrollments }));
  return { ...base, learners };
}

// ---------------------------------------------------------------------------
// Refusals: PostgREST's `{code, details, hint, message}` with the sentences the SQL tests assert
// ---------------------------------------------------------------------------

export type DbError = { code: string; details: null; hint: string | null; message: string };
const dbError = (code: string, message: string, hint: string | null = null): DbError => ({ code, details: null, hint, message });

export const ERRORS = {
  // 76: the last seat was taken meanwhile (hint review_again)
  lastSeat: dbError('22023', 'The last seat in Jainism 2 was just taken. Jay can join the waitlist instead: please review again.', 'review_again'),
  // 76: the fee changed since the family looked (hint review_again)
  feeChanged: dbError('22023', 'The fee changed since you looked; please review the new total ($130.00).', 'review_again'),
  // 76/77: two registrations at the same moment (hint review_again)
  sameMoment: dbError('22023', 'Another registration was being saved at the same moment. Please try again.', 'review_again'),
  // 76: no waiver agreed / an old one
  waiverMissing: dbError('22023', 'Agree to the Pathshala waiver to register.'),
  waiverOld: dbError('22023', 'The Pathshala waiver was updated: read the new version and agree to it to register.'),
  // 76: a child registering
  childCannot: dbError('42501', 'Ask a parent or guardian in your family to register you.'),
  // 76: another family
  notYourFamily: dbError('42501', 'Only an adult of the family can register its learners.'),
  // 76: a draft term / window closed
  notOpen: dbError('22023', 'Registration for 2027-28 is not open yet.'),
  // 75/76: a level that is full with no waitlist
  full: dbError('22023', 'Jainism 3 is full and has no waitlist. Ask the Pathshala office.'),
  // 76: one enrollment per track
  alreadyRegistered: dbError('22023', 'Dev is already registered for Jainism in 2026-27 (placed).'),
  // 76: the term does not allow paying at the office (starts with the term name)
  onlineOnly: dbError('22023', '2026-27 takes the fee online only. Ask the Pathshala office if you cannot pay online.'),
  // 76: pay now needs a level
  levelNeeded: dbError('22023', 'Choose a level for Mina: in Summer 2027 the fee is paid when you register. Not sure? Keep the suggested level: the teacher can move Mina in the first weeks.'),
  // 76: the same client key with other details
  otherDetails: dbError('22023', 'This registration was already sent with other details. Start again to register.'),
  // 76: Pathshala switched off
  moduleOff: dbError('42501', 'The Pathshala module is switched off for this community.'),
  // 75: a pay-now term while Pledges & donations is off
  givingOff: dbError('22023', 'Summer 2027 takes the fee when you register, and Pledges & donations is switched off, so registration cannot be completed. Ask the Pathshala office.'),
  // 75/76 (database review fix): fee assistance opens with 0592; a preview or registration with any line asking for it is refused
  feeAssistance: dbError('22023', 'Fee assistance opens in the next release. Ask the Pathshala office.'),
  // 0524 request_add_family_member: a bare `raise exception` (SQLSTATE P0001)
  alreadyPending: dbError('P0001', 'There is already a pending request to add Tara -- no need to send it twice'),
  // Postgres' own words are never shown
  rowLevel: dbError('42501', 'new row violates row-level security policy for table "pledges"'),
} as const;
