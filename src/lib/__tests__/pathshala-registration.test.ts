import { describe, expect, it } from '@jest/globals';

import { translate } from '../../i18n';
import { en, type StringKey } from '../../i18n/en';
import { AppError } from '../errors';
import {
  chargedNow,
  chooseTerm,
  countdownText,
  enrollmentStatus,
  expectedOutcomes,
  feeSummary,
  firstTrack,
  freeTracks,
  holdCountdown,
  holdInfo,
  isAdultClass,
  isAdultLine,
  isChildrensLevel,
  learnerRows,
  learnersArg,
  levelAllowed,
  levelFits,
  levelGroups,
  levelUnavailable,
  lineLevel,
  lineNames,
  lineParts,
  linePledges,
  membershipState,
  newChildAge,
  officeConfirms,
  outcomeKey,
  OUTCOMES,
  parseRegistrationOptions,
  parseRegistrationResult,
  payGroup,
  payNowCents,
  registerRoute,
  selectionsComplete,
  startBlock,
  SUGGESTION_KEY,
  suggestedLevel,
  unsureAllowed,
  type FeePledge,
  type RegLevel,
  type RegTrack,
  type Selection,
} from '../pathshala-registration';

// ---------------------------------------------------------------------------
// The contract's own examples (connect-crm docs/PATHSHALA_REGISTRATION_PLAN.md §2.17), with the owner's prices (§2.4)
// ---------------------------------------------------------------------------

const TERM = 'term-2026';
const HH = 'hh-shah';
const JAINISM = 'track-jainism';
const GUJARATI = 'track-gujarati';
const TODDLER = 'lvl-toddler';
const J2 = 'lvl-j2';
const J5 = 'lvl-j5';
const MOMS = 'lvl-moms';
const G1 = 'lvl-g1';
const RIYA = 'p-riya';
const DEV = 'p-dev';
const ANYA = 'p-anya';
const MIRA = 'p-mira';
const RAJ = 'p-raj';

const levels = [
  { id: TODDLER, name: 'Toddler', min_age: 3, max_age: 5, fee_cents: 4500, seats: 'open' },
  { id: J2, name: 'Jainism 2', min_age: 8, max_age: 10, fee_cents: 13000, seats: 'open' },
  { id: J5, name: 'Jainism 5', min_age: 11, max_age: 13, fee_cents: 13000, seats: 'waitlist' },
  { id: MOMS, name: 'Adult class (Moms)', min_age: 18, max_age: null, fee_cents: 5000, seats: 'open' },
];

function optionsRaw(over: Record<string, unknown> = {}) {
  return {
    term: {
      id: TERM,
      name: '2026-27',
      starts_on: '2026-09-06',
      ends_on: '2027-05-30',
      window: { state: 'open', opens_at: null, closes_at: '2026-09-01T23:59:00-05:00', late_until: null, late_fee_cents: 0 },
      payment_mode: 'pledge',
      hold_hours: 48,
      office_payment: { allowed: false, hold_days: 7 },
      seat_rule: 'automatic',
      withdrawal_credit_until: '2026-09-20',
      age_cutoff_on: '2026-09-06',
      membership_required: true,
      waiver: { document_id: 'doc-1', title: 'Pathshala waiver', version: '2026.1' },
    },
    household: { id: HH, name: 'Shah household', number: 'JSH-H-2041', membership: 'active' },
    households: [{ id: HH, name: 'Shah household', number: 'JSH-H-2041' }],
    learners: [
      { person_id: MIRA, first_name: 'Mira', age_on_cutoff: 44, counts_as_child: false, needs_birth_date: false, enrollments: [], suggested: [] },
      { person_id: ANYA, first_name: 'Anya', age_on_cutoff: 4, counts_as_child: true, needs_birth_date: false, enrollments: [], suggested: [{ track_id: JAINISM, level_id: TODDLER, reason: 'age' }] },
      { person_id: RIYA, first_name: 'Riya', age_on_cutoff: 12, counts_as_child: true, needs_birth_date: false, enrollments: [], suggested: [{ track_id: JAINISM, level_id: J5, reason: 'teacher' }] },
      {
        person_id: DEV,
        first_name: 'Dev',
        age_on_cutoff: 9,
        counts_as_child: true,
        needs_birth_date: false,
        enrollments: [{ track_id: GUJARATI, level_id: G1, status: 'requested', hold_reason: 'payment', hold_expires_at: '2026-08-20T18:00:00-05:00' }],
        suggested: [{ track_id: JAINISM, level_id: J2, reason: 'previous' }],
      },
      { person_id: RAJ, first_name: 'Raj', age_on_cutoff: 46, counts_as_child: false, needs_birth_date: false, enrollments: [], suggested: [] },
    ],
    tracks: [
      { id: JAINISM, key: 'jainism', name: 'Jainism', levels },
      { id: GUJARATI, key: 'gujarati', name: 'Gujarati', levels: [{ id: G1, name: 'Gujarati 1', min_age: 6, max_age: 12, fee_cents: 13000, seats: 'open' }] },
    ],
    can_register: true,
    cannot_reason: null,
    ...over,
  };
}

/** The owner's worked example (§2.4): Riya $130.00, Dev $117.00, Anya $28.00 (cap), Mira $50.00 (adult) = $325.00. */
function resultRaw(over: Record<string, unknown> = {}) {
  const line = (person: string, level: string, kind: string, rank: number | null, base: number, sibling: number, cap: number, total: number, extra: Record<string, unknown> = {}) => ({
    person_id: person,
    track_id: JAINISM,
    level_id: level,
    learner_kind: kind,
    family_rank: rank,
    outcome: 'seat',
    base_fee_cents: base,
    sibling_discount_cents: sibling,
    cap_reduction_cents: cap,
    late_fee_cents: 0,
    assistance_cents: 0,
    total_cents: total,
    ...extra,
  });
  return {
    registration_id: 'reg-1',
    lines: [
      line(RIYA, J5, 'child', 1, 13000, 0, 0, 13000, { enrollment_id: 'e-riya', pledge: { id: 'pl-1', number: 'JSH-PL-20113', due_on: '2026-09-20' } }),
      line(DEV, J2, 'child', 2, 13000, 1300, 0, 11700, { enrollment_id: 'e-dev', pledge: { id: 'pl-2', number: 'JSH-PL-20114', due_on: '2026-09-20' } }),
      line(ANYA, TODDLER, 'child', 3, 4500, 450, 1250, 2800, { enrollment_id: 'e-anya', pledge: { id: 'pl-3', number: 'JSH-PL-20115', due_on: '2026-09-21' } }),
      line(MIRA, MOMS, 'adult', null, 5000, 0, 0, 5000, { enrollment_id: 'e-mira', pledge: { id: 'pl-4', number: 'JSH-PL-20116', due_on: '2026-09-20' } }),
    ],
    children_total_cents: 27500,
    adults_total_cents: 5000,
    total_cents: 32500,
    pay: null,
    pending: [],
    ...over,
  };
}

function parsedOptions(over: Record<string, unknown> = {}) {
  const o = parseRegistrationOptions(optionsRaw(over));
  if (!o) throw new Error('options did not parse');
  return o;
}

function parsedResult(over: Record<string, unknown> = {}) {
  const r = parseRegistrationResult(resultRaw(over));
  if (!r) throw new Error('result did not parse');
  return r;
}

const t = (key: StringKey, vars?: Record<string, string | number>) => translate('en', key, vars);

describe('reading the registration options', () => {
  it('reads the contract example', () => {
    const o = parsedOptions();
    expect(o.term).toMatchObject({ id: TERM, name: '2026-27', paymentMode: 'pledge', holdHours: 48, seatRule: 'automatic', membershipRequired: true, ageCutoffOn: '2026-09-06', withdrawalCreditUntil: '2026-09-20' });
    expect(o.term.window).toEqual({ state: 'open', opensAt: null, closesAt: '2026-09-01T23:59:00-05:00', lateUntil: null, lateFeeCents: 0 });
    expect(o.term.officePayment).toEqual({ allowed: false, holdDays: 7 });
    expect(o.term.waiver).toEqual({ documentId: 'doc-1', title: 'Pathshala waiver', version: '2026.1' });
    expect(o.household).toEqual({ id: HH, name: 'Shah household', number: 'JSH-H-2041', membership: 'active' });
    expect(o.learners.map((l) => l.firstName)).toEqual(['Mira', 'Anya', 'Riya', 'Dev', 'Raj']);
    expect(o.learners[3].enrollments[0]).toEqual({ trackId: GUJARATI, levelId: G1, status: 'requested', holdReason: 'payment', holdExpiresAt: '2026-08-20T18:00:00-05:00' });
    expect(o.learners[2].suggested).toEqual([{ trackId: JAINISM, levelId: J5, reason: 'teacher' }]);
    expect(o.tracks[0].levels[2]).toEqual({ id: J5, name: 'Jainism 5', minAge: 11, maxAge: 13, feeCents: 13000, seats: 'waitlist' });
    expect(o.canRegister).toBe(true);
    expect(o.skipped).toBe(0);
  });

  it('is unusable without a term, a household or a payment mode it knows (money: never guessed)', () => {
    expect(parseRegistrationOptions(null)).toBeNull();
    expect(parseRegistrationOptions({ ...optionsRaw(), term: null })).toBeNull();
    expect(parseRegistrationOptions({ ...optionsRaw(), household: null })).toBeNull();
    expect(parseRegistrationOptions(optionsRaw({ term: { ...optionsRaw().term, payment_mode: 'card_only' } }))).toBeNull();
  });

  it('treats a window state it does not know as closed, and missing settings with the plan defaults', () => {
    const term = { id: TERM, name: '2026-27', payment_mode: 'pay_now', window: { state: 'paused' } };
    const o = parsedOptions({ term });
    expect(o.term.window.state).toBe('closed');
    expect(o.term).toMatchObject({ holdHours: 48, officePayment: { allowed: false, holdDays: 7 }, seatRule: 'automatic', waiver: null, membershipRequired: false });
  });

  it('leaves out (and counts) the learners, tracks and levels it cannot read', () => {
    const raw = optionsRaw();
    const o = parsedOptions({
      learners: [...raw.learners, { first_name: 'No id' }, 'nonsense'],
      tracks: [{ ...raw.tracks[0], levels: [...levels, { name: 'No id' }] }, { id: 'x' }],
    });
    expect(o.learners).toHaveLength(5);
    expect(o.tracks).toHaveLength(1);
    expect(o.tracks[0].levels).toHaveLength(4);
    expect(o.skipped).toBe(4);
  });

  it('keeps an enrollment whose status it does not know (it still takes its track) and drops unknown seats and reasons', () => {
    const o = parsedOptions({
      learners: [{ person_id: DEV, first_name: 'Dev', enrollments: [{ track_id: JAINISM, status: 'paused' }], suggested: [{ track_id: JAINISM, level_id: J2, reason: 'magic' }] }],
      tracks: [{ id: JAINISM, name: 'Jainism', levels: [{ id: J2, name: 'Jainism 2', seats: 'some' }] }],
    });
    expect(o.learners[0].enrollments[0].status).toBeNull();
    expect(o.learners[0].suggested[0].reason).toBeNull();
    expect(o.tracks[0].levels[0]).toMatchObject({ seats: null, feeCents: null, minAge: null, maxAge: null });
    expect(freeTracks({ age: 9, countsAsChild: true, enrollments: o.learners[0].enrollments }, o.tracks)).toEqual([]);
  });

  it('always lists the household it answered for among the households', () => {
    const o = parsedOptions({ households: [{ id: 'hh-2', name: 'Mehta household', number: 'JSH-H-9' }] });
    expect(o.households.map((h) => h.id)).toEqual([HH, 'hh-2']);
  });
});

describe('reading a preview or a registration', () => {
  it('reads the owner example line by line, exactly as the database priced it', () => {
    const r = parsedResult();
    expect(r.registrationId).toBe('reg-1');
    expect(r.lines.map((l) => l.totalCents)).toEqual([13000, 11700, 2800, 5000]);
    expect(r.lines[2]).toMatchObject({ personId: ANYA, baseFeeCents: 4500, siblingDiscountCents: 450, capReductionCents: 1250, totalCents: 2800, learnerKind: 'child', familyRank: 3, outcome: 'seat' });
    expect(r.lines[0].pledge).toEqual({ id: 'pl-1', number: 'JSH-PL-20113', dueOn: '2026-09-20' });
    expect(r).toMatchObject({ childrenTotalCents: 27500, adultsTotalCents: 5000, totalCents: 32500, pay: null, pendingCount: 0 });
  });

  it('reads a preview: no enrollment, no pledge, missing parts are none', () => {
    const r = parseRegistrationResult({ lines: [{ person_id: DEV, track_id: JAINISM, level_id: J2, outcome: 'waitlist', base_fee_cents: 13000, total_cents: 13000 }], total_cents: 13000 });
    expect(r?.lines[0]).toMatchObject({ siblingDiscountCents: 0, capReductionCents: 0, lateFeeCents: 0, assistanceCents: 0, enrollmentId: null, pledge: null, learnerKind: null });
    expect(r?.registrationId).toBeNull();
  });

  it('is all or nothing: one unreadable line (or total, or pay) makes the whole answer unusable', () => {
    const raw = resultRaw();
    expect(parseRegistrationResult({ ...raw, lines: [...raw.lines.slice(0, 3), { ...raw.lines[3], outcome: 'maybe' }] })).toBeNull();
    expect(parseRegistrationResult({ ...raw, lines: [{ ...raw.lines[0], total_cents: 130.5 }] })).toBeNull();
    expect(parseRegistrationResult({ ...raw, lines: [{ ...raw.lines[0], sibling_discount_cents: -5 }] })).toBeNull();
    expect(parseRegistrationResult({ ...raw, lines: [{ ...raw.lines[0], track_id: null }] })).toBeNull();
    expect(parseRegistrationResult({ ...raw, total_cents: null })).toBeNull();
    expect(parseRegistrationResult({ ...raw, pay: { amount_cents: 'lots' } })).toBeNull();
    expect(parseRegistrationResult({ ...raw, lines: 'none' })).toBeNull();
    expect(parseRegistrationResult(null)).toBeNull();
  });

  it('reads what to pay now in a pay-now term', () => {
    const r = parsedResult({ pay: { amount_cents: 32500, pledge_ids: ['pl-1', 'pl-2', '', 7], for_label: 'Pathshala fee 2026-27 · Riya, Dev, Anya, Mira', hold_until: '2026-08-22T18:00:00-05:00', office_payment_allowed: true } });
    expect(r.pay).toEqual({ amountCents: 32500, pledgeIds: ['pl-1', 'pl-2'], forLabel: 'Pathshala fee 2026-27 · Riya, Dev, Anya, Mira', holdUntil: '2026-08-22T18:00:00-05:00', officePaymentAllowed: true });
    expect(payNowCents(r)).toBe(32500);
  });
});

describe('before you start', () => {
  const base = parsedOptions();
  const withWindow = (state: string, extra: Record<string, unknown> = {}) => ({ ...base, term: { ...base.term, window: { ...base.term.window, state: state as 'open', ...extra } } });

  it('goes on while registration is open or late', () => {
    expect(startBlock(base)).toBeNull();
    expect(startBlock(withWindow('late', { lateUntil: '2026-09-14', lateFeeCents: 2500 }))).toBeNull();
  });

  it('stops when the window is closed or not open yet', () => {
    expect(startBlock(withWindow('closed'))).toEqual({ kind: 'closed' });
    expect(startBlock(withWindow('not_yet', { opensAt: '2026-08-01T08:00:00-05:00' }))).toEqual({ kind: 'not_yet', opensAt: '2026-08-01T08:00:00-05:00' });
  });

  it("stops with the database's own reason when it says no", () => {
    expect(startBlock({ ...base, canRegister: false, cannotReason: 'Pay at registration waits for fee receipts (P13).' })).toEqual({ kind: 'cannot', reason: 'Pay at registration waits for fee receipts (P13).' });
    expect(startBlock({ ...withWindow('closed'), canRegister: false, cannotReason: null })).toEqual({ kind: 'closed' });
    expect(startBlock({ ...base, canRegister: false, cannotReason: null })).toEqual({ kind: 'cannot', reason: null });
  });

  it('reads the membership: active, an application on its way, or none', () => {
    expect(membershipState('active')).toBe('member');
    expect(membershipState('pending')).toBe('applying');
    expect(membershipState('in_progress')).toBe('applying');
    expect(membershipState('lapsed')).toBe('none');
    expect(membershipState(null)).toBe('none');
  });

  it('opens on the term asked for, else the first open one, else the first', () => {
    const terms = [{ id: 'a', open: false }, { id: 'b', open: true }, { id: 'c', open: true }];
    expect(chooseTerm(terms, 'c', (x) => x.open)?.id).toBe('c');
    expect(chooseTerm(terms, 'gone', (x) => x.open)?.id).toBe('b');
    expect(chooseTerm(terms, null, () => false)?.id).toBe('a');
    expect(chooseTerm([], null, () => true)).toBeNull();
  });
});

describe('who is joining', () => {
  const o = parsedOptions();

  it('lists children first (oldest first), then the registering adult, then the other adults', () => {
    const rows = learnerRows(o, MIRA);
    expect(rows.map((r) => r.learner.firstName)).toEqual(['Riya', 'Dev', 'Anya', 'Mira', 'Raj']);
    expect(rows.map((r) => r.group)).toEqual(['child', 'child', 'child', 'adult', 'adult']);
    expect(rows.find((r) => r.isMe)?.learner.firstName).toBe('Mira');
    // Raj registering: he comes first among the adults.
    expect(learnerRows(o, RAJ).map((r) => r.learner.firstName).slice(3)).toEqual(['Raj', 'Mira']);
  });

  it('lets a learner already in one track be chosen for another (P10), with where they stand', () => {
    const dev = learnerRows(o, MIRA).find((r) => r.learner.personId === DEV);
    expect(dev?.free.map((x) => x.name)).toEqual(['Jainism']);
    expect(dev?.live).toHaveLength(1);
    expect(dev?.selectable).toBe(true);
  });

  it('takes the whole term with an enrollment from before tracks (0591), never with a withdrawn one', () => {
    const tracks = o.tracks;
    expect(freeTracks({ age: 9, countsAsChild: true, enrollments: [{ trackId: null, levelId: null, status: 'placed', holdReason: null, holdExpiresAt: null }] }, tracks)).toEqual([]);
    expect(freeTracks({ age: 9, countsAsChild: true, enrollments: [{ trackId: JAINISM, levelId: J2, status: 'withdrawn', holdReason: null, holdExpiresAt: null }] }, tracks).map((x) => x.id)).toEqual([JAINISM, GUJARATI]);
  });

  it('cannot choose an adult for a track with children’s levels only, or anyone with nothing left', () => {
    const raj = learnerRows(o, MIRA).find((r) => r.learner.personId === RAJ);
    expect(raj?.free.map((x) => x.id)).toEqual([JAINISM]);
    const full = parsedOptions({ learners: [{ person_id: RIYA, first_name: 'Riya', age_on_cutoff: 12, counts_as_child: true, enrollments: [{ track_id: JAINISM, status: 'placed' }, { track_id: GUJARATI, status: 'waitlisted' }] }] });
    expect(learnerRows(full, MIRA)[0].selectable).toBe(false);
  });

  it('works out a new child’s age on the cut-off date, for the level order only', () => {
    expect(newChildAge({ dateOfBirth: '2022-03-01' }, '2026-09-06', '2026-08-01')).toEqual({ age: 4, countsAsChild: true });
    expect(newChildAge({ dateOfBirth: '2022-10-01' }, null, '2026-08-01')).toEqual({ age: 3, countsAsChild: true });
    expect(newChildAge({ dateOfBirth: 'nonsense' }, '2026-09-06', '2026-08-01')).toEqual({ age: null, countsAsChild: true });
  });
});

describe('a level for each learner', () => {
  const jainism = parsedOptions().tracks[0];
  const level = (min: number | null, max: number | null): RegLevel => ({ id: 'x', name: 'X', minAge: min, maxAge: max, feeCents: 1000, seats: 'open' });

  it('tells adult classes and children’s levels apart by the band (P24)', () => {
    expect(isAdultClass(level(18, null))).toBe(true);
    expect(isAdultClass(level(12, null))).toBe(false);
    expect(isChildrensLevel(level(null, 17))).toBe(true);
    expect(isChildrensLevel(level(null, 18))).toBe(false);
    expect(levelAllowed(level(18, null), true)).toBe(false);
    expect(levelAllowed(level(3, 5), false)).toBe(false);
    expect(levelAllowed(level(null, null), true)).toBe(true);
    expect(levelAllowed(level(null, null), false)).toBe(true);
  });

  it('says whether an age fits a band (unknown when the age is not known)', () => {
    expect(levelFits(level(8, 10), 9)).toBe(true);
    expect(levelFits(level(8, 10), 11)).toBe(false);
    expect(levelFits(level(8, null), 44)).toBe(true);
    expect(levelFits(level(null, null), null)).toBe(true);
    expect(levelFits(level(8, 10), null)).toBeNull();
  });

  it('lists the levels for the learner’s age first and the others below; adult classes never for a child', () => {
    const dev = levelGroups(jainism, { age: 9, countsAsChild: true });
    expect(dev.fit.map((l) => l.name)).toEqual(['Jainism 2']);
    expect(dev.other.map((l) => l.name)).toEqual(['Toddler', 'Jainism 5']);
    const mira = levelGroups(jainism, { age: 44, countsAsChild: false });
    expect(mira.fit.map((l) => l.name)).toEqual(['Adult class (Moms)']);
    expect(mira.other).toEqual([]);
    const unknown = levelGroups(jainism, { age: null, countsAsChild: true });
    expect(unknown.fit.map((l) => l.name)).toEqual(['Toddler', 'Jainism 2', 'Jainism 5']);
    expect(unknown.other).toEqual([]);
  });

  it('says when the office confirms a level outside the band, and when a level cannot be chosen', () => {
    expect(officeConfirms(level(11, 13), { age: 9, countsAsChild: true })).toBe(true);
    expect(officeConfirms(level(8, 10), { age: 9, countsAsChild: true })).toBe(false);
    expect(officeConfirms(level(8, 10), { age: null, countsAsChild: true })).toBe(false);
    expect(levelUnavailable({ seats: 'full', feeCents: 1000 })).toBe('full');
    expect(levelUnavailable({ seats: 'open', feeCents: null })).toBe('no_fee');
    expect(levelUnavailable({ seats: 'waitlist', feeCents: 0 })).toBeNull();
  });

  it('preselects the database’s suggestion only when it can be chosen', () => {
    const riya = { suggested: [{ trackId: JAINISM, levelId: J5, reason: 'teacher' as const }], age: 12, countsAsChild: true };
    expect(suggestedLevel(riya, jainism)?.levelId).toBe(J5);
    const full: RegTrack = { ...jainism, levels: jainism.levels.map((l) => (l.id === J5 ? { ...l, seats: 'full' as const } : l)) };
    expect(suggestedLevel(riya, full)).toBeNull();
    expect(suggestedLevel({ ...riya, suggested: [{ trackId: JAINISM, levelId: MOMS, reason: 'age' }] }, jainism)).toBeNull();
    expect(suggestedLevel({ ...riya, suggested: [] }, jainism)).toBeNull();
  });

  it('starts with the track the database suggested, else Jainism, else the first', () => {
    const tracks = parsedOptions().tracks;
    const gujaratiFirst = [tracks[1], tracks[0]];
    expect(firstTrack({ suggested: [{ trackId: GUJARATI, levelId: G1, reason: null }] }, tracks)?.id).toBe(GUJARATI);
    expect(firstTrack({ suggested: [] }, gujaratiFirst)?.id).toBe(JAINISM);
    expect(firstTrack({ suggested: [] }, [tracks[1]])?.id).toBe(GUJARATI);
    expect(firstTrack({ suggested: [] }, [])).toBeNull();
  });

  it('allows "let the office decide" in a pledge-mode term only (P25)', () => {
    const sel = (levelId: string | null, unsure: boolean): Selection[] => [{ key: DEV, personId: DEV, newChild: null, tracks: [{ trackId: JAINISM, levelId, unsure }], note: '' }];
    expect(unsureAllowed('pledge')).toBe(true);
    expect(unsureAllowed('pay_now')).toBe(false);
    expect(selectionsComplete(sel(null, true), 'pledge')).toBe(true);
    expect(selectionsComplete(sel(null, true), 'pay_now')).toBe(false);
    expect(selectionsComplete(sel(J2, false), 'pay_now')).toBe(true);
    expect(selectionsComplete(sel(null, false), 'pledge')).toBe(false);
    expect(selectionsComplete([], 'pledge')).toBe(false);
    expect(selectionsComplete([{ key: DEV, personId: DEV, newChild: null, tracks: [], note: '' }], 'pledge')).toBe(false);
  });

  it('sends one entry per learner and track in the contract’s shape', () => {
    const selections: Selection[] = [
      { key: DEV, personId: DEV, newChild: null, tracks: [{ trackId: JAINISM, levelId: J2, unsure: false }, { trackId: GUJARATI, levelId: G1, unsure: true }], note: '  Please place with his cousin ' },
      { key: 'new:1', personId: null, newChild: { firstName: ' Anya ', lastName: 'Shah', dateOfBirth: '2022-03-01', relationship: 'Child' }, tracks: [{ trackId: JAINISM, levelId: TODDLER, unsure: false }], note: '' },
    ];
    expect(learnersArg(selections, true)).toEqual([
      { person_id: DEV, track_id: JAINISM, level_id: J2, note: 'Please place with his cousin', assistance_requested: true },
      { person_id: DEV, track_id: GUJARATI, level_id: null, note: 'Please place with his cousin', assistance_requested: true },
      { new_child: { first_name: 'Anya', last_name: 'Shah', date_of_birth: '2022-03-01', relationship: 'Child' }, track_id: JAINISM, level_id: TODDLER, note: null },
    ]);
    expect(learnersArg(selections.slice(0, 1), false)[0].assistance_requested).toBe(false);
  });
});

describe('reviewing the fee', () => {
  const o = parsedOptions();
  const r = parsedResult();

  it('shows each line’s parts as the database priced them; zero parts are left out', () => {
    expect(lineParts(r.lines[0])).toEqual([{ key: 'levelFee', cents: 13000 }]);
    expect(lineParts(r.lines[1])).toEqual([{ key: 'levelFee', cents: 13000 }, { key: 'sibling', cents: -1300 }]);
    expect(lineParts(r.lines[2])).toEqual([{ key: 'levelFee', cents: 4500 }, { key: 'sibling', cents: -450 }, { key: 'cap', cents: -1250 }]);
    expect(lineParts({ ...r.lines[3], lateFeeCents: 2500, assistanceCents: 1000 })).toEqual([{ key: 'levelFee', cents: 5000 }, { key: 'late', cents: 2500 }, { key: 'assistance', cents: -1000 }]);
  });

  it('marks adult learners’ lines (outside the discount and the cap)', () => {
    expect(r.lines.map((l) => isAdultLine(l, o.learners))).toEqual([false, false, false, true]);
    expect(isAdultLine({ ...r.lines[3], learnerKind: null }, o.learners)).toBe(true);
    expect(isAdultLine({ ...r.lines[0], learnerKind: null }, o.learners)).toBe(false);
  });

  it('says what happens to each line, by outcome and payment mode', () => {
    expect(outcomeKey({ outcome: 'seat', levelId: J2 }, 'pledge')).toBe('reg.outcome.seat');
    expect(outcomeKey({ outcome: 'seat', levelId: J2 }, 'pay_now')).toBe('reg.outcome.seatPay');
    expect(outcomeKey({ outcome: 'waitlist', levelId: J2 }, 'pledge')).toBe('reg.outcome.waitlist');
    expect(outcomeKey({ outcome: 'membership_hold', levelId: J2 }, 'pledge')).toBe('reg.outcome.membership');
    expect(outcomeKey({ outcome: 'office', levelId: null }, 'pledge')).toBe('reg.outcome.officeChooses');
    expect(outcomeKey({ outcome: 'office', levelId: J5 }, 'pledge')).toBe('reg.outcome.officeConfirms');
    expect(outcomeKey({ outcome: 'pending_child', levelId: TODDLER }, 'pay_now')).toBe('reg.outcome.pendingChild');
    for (const outcome of OUTCOMES) for (const mode of ['pledge', 'pay_now'] as const) expect(en[outcomeKey({ outcome, levelId: null }, mode)]).toBeTruthy();
  });

  it('bills (or takes now) only the seat lines that cost something', () => {
    expect(chargedNow(r)).toEqual({ cents: 32500, count: 4 });
    const mixed = { ...r, lines: [r.lines[0], { ...r.lines[1], outcome: 'waitlist' as const }, { ...r.lines[2], totalCents: 0 }] };
    expect(chargedNow(mixed)).toEqual({ cents: 13000, count: 1 });
    expect(payNowCents({ ...mixed, pay: null })).toBe(13000);
  });

  it('sends back what the family saw, so a seat taken meanwhile is refused', () => {
    expect(expectedOutcomes(r)[1]).toEqual({ person_id: DEV, track_id: JAINISM, level_id: J2, outcome: 'seat' });
  });

  it('names each line: people by id, children being added in the order they were sent', () => {
    const lines = parseRegistrationResult({
      lines: [
        { person_id: null, track_id: JAINISM, level_id: TODDLER, outcome: 'pending_child', total_cents: 4500 },
        { person_id: DEV, track_id: JAINISM, level_id: J2, outcome: 'seat', total_cents: 13000 },
        { person_id: null, track_id: JAINISM, level_id: TODDLER, outcome: 'pending_child', total_cents: 4050 },
      ],
      total_cents: 21550,
    });
    if (!lines) throw new Error('no parse');
    const selections: Selection[] = [
      { key: DEV, personId: DEV, newChild: null, tracks: [{ trackId: JAINISM, levelId: J2, unsure: false }], note: '' },
      { key: 'new:1', personId: null, newChild: { firstName: 'Anya', lastName: 'Shah', dateOfBirth: '2022-03-01', relationship: 'Child' }, tracks: [{ trackId: JAINISM, levelId: TODDLER, unsure: false }], note: '' },
      { key: 'new:2', personId: null, newChild: { firstName: 'Kavi', lastName: 'Shah', dateOfBirth: '2021-05-01', relationship: 'Child' }, tracks: [{ trackId: JAINISM, levelId: TODDLER, unsure: false }], note: '' },
    ];
    expect(lineNames(lines, o.learners, selections)).toEqual(['Anya', 'Dev', 'Kavi']);
  });

  it('finds the level and track names of a line (the office decides: the track only)', () => {
    expect(lineLevel(r.lines[1], o.tracks)).toEqual({ track: 'Jainism', level: 'Jainism 2' });
    expect(lineLevel({ trackId: JAINISM, levelId: null }, o.tracks)).toEqual({ track: 'Jainism', level: null });
    expect(lineLevel({ trackId: 'gone', levelId: 'x' }, o.tracks)).toEqual({ track: null, level: null });
  });

  it('lists the pledges a pledge-mode registration made, the earliest due date first', () => {
    expect(linePledges(r)).toEqual({ ids: ['pl-1', 'pl-2', 'pl-3', 'pl-4'], cents: 32500, dueOn: '2026-09-20' });
    expect(linePledges({ lines: [] })).toEqual({ ids: [], cents: 0, dueOn: null });
  });
});

describe('when registering fails', () => {
  it('falls back to the simple form when the database cannot register yet', () => {
    expect(registerRoute({ code: 'PGRST202', message: 'Could not find the function app.register_pathshala_children' })).toBe('missing');
    expect(registerRoute(new AppError('not available', 'register_pathshala_children: missing', '42883'))).toBe('missing');
  });

  it('goes back to the review when the fee or a seat changed', () => {
    expect(registerRoute(new AppError('The fee changed since you looked; please review the new total.', 'x', '22023'))).toBe('review');
    expect(registerRoute(new AppError('The last seat in Jainism 3 was just taken. Riya can join the waitlist instead: please review again.', 'x', '22023'))).toBe('review');
  });

  it("shows the database's sentence for any other refusal, and Try again for the connection", () => {
    expect(registerRoute(new AppError('Registration closed on Sep 14.', 'x', '22023'))).toBe('refused');
    expect(registerRoute(new AppError('Only an adult of the family can register.', 'x', '42501'))).toBe('refused');
    expect(registerRoute(new AppError("We couldn't register for Pathshala. Check your internet connection and try again.", 'network'))).toBe('retry');
    expect(registerRoute(new TypeError('Network request failed'))).toBe('retry');
  });
});

describe('afterwards: holds, offers, status and the fee', () => {
  const now = new Date('2026-08-20T12:00:00Z');

  it('counts down a hold in days, hours or minutes; urgent in its last six hours', () => {
    expect(holdCountdown(null, now)).toBeNull();
    expect(holdCountdown('not a time', now)).toBeNull();
    expect(holdCountdown('2026-08-20T11:59:00Z', now)).toEqual({ ended: true });
    expect(holdCountdown('2026-08-23T13:00:00Z', now)).toEqual({ ended: false, unit: 'days', n: 3, urgent: false });
    expect(holdCountdown('2026-08-20T17:30:00Z', now)).toEqual({ ended: false, unit: 'hours', n: 5, urgent: true });
    expect(holdCountdown('2026-08-21T12:00:00Z', now)).toEqual({ ended: false, unit: 'hours', n: 24, urgent: false });
    expect(holdCountdown('2026-08-20T12:12:30Z', now)).toEqual({ ended: false, unit: 'minutes', n: 12, urgent: true });
    expect(holdCountdown('2026-08-20T12:00:20Z', now)).toEqual({ ended: false, unit: 'minutes', n: 1, urgent: true });
  });

  it('says the countdown in words', () => {
    expect(countdownText({ ended: false, unit: 'hours', n: 5, urgent: true }, t)).toBe('5 h left');
    expect(countdownText({ ended: false, unit: 'days', n: 2, urgent: false }, t)).toBe('2 days left');
    expect(countdownText({ ended: false, unit: 'minutes', n: 12, urgent: true }, t)).toBe('12 min left');
    expect(countdownText({ ended: true }, t)).toBe('Time is up');
  });

  it('reads the hold columns of an enrollment row (all null before 0591)', () => {
    expect(holdInfo({ hold_reason: 'payment', hold_expires_at: '2026-08-22T23:00:00Z', offered_at: '2026-08-20T23:00:00Z', registration_id: 'reg-1', track_id: JAINISM })).toEqual({ holdReason: 'payment', holdUntil: '2026-08-22T23:00:00Z', offered: true, registrationId: 'reg-1', trackId: JAINISM });
    expect(holdInfo({ status: 'requested' })).toEqual({ holdReason: null, holdUntil: null, offered: false, registrationId: null, trackId: null });
    expect(holdInfo({ hold_reason: 'vacation' }).holdReason).toBeNull();
  });

  it('says where each enrollment stands: registered, held until, offered, waitlisted, waiting', () => {
    const hold = (over: Partial<ReturnType<typeof holdInfo>> = {}) => ({ holdReason: null, holdUntil: null, offered: false, registrationId: null, trackId: null, ...over });
    expect(enrollmentStatus('placed', hold())).toMatchObject({ key: 'reg.status.placed', tone: 'green', heldForPayment: false });
    expect(enrollmentStatus('active', hold()).key).toBe('reg.status.active');
    expect(enrollmentStatus('waitlisted', hold()).key).toBe('reg.status.waitlisted');
    expect(enrollmentStatus('requested', hold({ holdReason: 'payment', holdUntil: 'T' }))).toMatchObject({ key: 'reg.status.heldUntil', until: 'T', heldForPayment: true });
    expect(enrollmentStatus('requested', hold({ holdReason: 'payment' })).key).toBe('reg.status.held');
    expect(enrollmentStatus('requested', hold({ holdReason: 'payment', holdUntil: 'T', offered: true })).key).toBe('reg.status.offeredUntil');
    expect(enrollmentStatus('requested', hold({ holdReason: 'office_payment', holdUntil: 'T' }))).toMatchObject({ key: 'reg.status.officeUntil', heldForPayment: true });
    expect(enrollmentStatus('requested', hold({ holdReason: 'membership' }))).toMatchObject({ key: 'reg.status.membership', heldForPayment: false });
    expect(enrollmentStatus('requested', hold({ holdReason: 'assistance' })).key).toBe('reg.status.assistance');
    expect(enrollmentStatus('requested', hold({ holdReason: 'waiver' })).key).toBe('reg.status.waiver');
    expect(enrollmentStatus('requested', hold()).key).toBe('reg.status.requested');
  });

  const pledge = (over: Partial<FeePledge> = {}): FeePledge => ({ id: 'pl', number: 'JSH-PL-1', amountCents: 11700, paidCents: 0, status: 'open', dueOn: '2026-09-20', enrollmentId: 'e-dev', ...over });

  it('sums an enrollment’s fee from its pledges; cancelled and written-off ones do not count', () => {
    expect(feeSummary([])).toEqual({ kind: 'none' });
    expect(feeSummary([pledge({ status: 'cancelled' })])).toEqual({ kind: 'none' });
    expect(feeSummary([pledge({ status: 'paid', paidCents: 11700 })])).toEqual({ kind: 'paid', totalCents: 11700 });
    expect(feeSummary([pledge()])).toEqual({ kind: 'due', totalCents: 11700, openCents: 11700, paidCents: 0, dueOn: '2026-09-20', pledgeIds: ['pl'] });
    // A top-up pledge after a move to a dearer level (P26): both count, the earliest open due date first.
    expect(feeSummary([pledge({ status: 'partially_paid', paidCents: 5000 }), pledge({ id: 'top', amountCents: 2000, dueOn: '2026-10-01' }), pledge({ id: 'old', status: 'written_off' })])).toEqual({
      kind: 'due',
      totalCents: 13700,
      openCents: 8700,
      paidCents: 5000,
      dueOn: '2026-09-20',
      pledgeIds: ['pl', 'top'],
    });
  });

  it('pays the held seats of one registration together, anything else on its own', () => {
    const rows = [
      { id: 'e-riya', personId: RIYA, registrationId: 'reg-1', heldForPayment: true, pledges: [pledge({ id: 'p1', amountCents: 13000, enrollmentId: 'e-riya' })] },
      { id: 'e-dev', personId: DEV, registrationId: 'reg-1', heldForPayment: true, pledges: [pledge({ id: 'p2', enrollmentId: 'e-dev' })] },
      { id: 'e-anya', personId: ANYA, registrationId: 'reg-1', heldForPayment: true, pledges: [] },
      { id: 'e-mira', personId: MIRA, registrationId: 'reg-2', heldForPayment: false, pledges: [pledge({ id: 'p4', amountCents: 5000, enrollmentId: 'e-mira' })] },
      { id: 'e-raj', personId: RAJ, registrationId: 'reg-2', heldForPayment: false, pledges: [pledge({ id: 'p5', status: 'paid', paidCents: 11700 })] },
    ];
    expect(payGroup(rows, rows[1])).toEqual({ pledgeIds: ['p1', 'p2'], amountCents: 24700, personIds: [RIYA, DEV] });
    expect(payGroup(rows, rows[3])).toEqual({ pledgeIds: ['p4'], amountCents: 5000, personIds: [MIRA] });
    expect(payGroup(rows, rows[4])).toBeNull();
    expect(payGroup(rows, rows[2])).toEqual({ pledgeIds: ['p1', 'p2'], amountCents: 24700, personIds: [RIYA, DEV] });
  });
});

describe('the words', () => {
  it('has every key the rules name', () => {
    const keys: StringKey[] = [
      ...Object.values(SUGGESTION_KEY),
      ...(['placed', 'active', 'completed', 'withdrawn', 'waitlisted'] as const).map((s) => enrollmentStatus(s, holdInfo({})).key),
      ...(['payment', 'office_payment', 'membership', 'assistance', 'waiver', null] as const).flatMap((r) => [false, true].map((offered) => enrollmentStatus('requested', { ...holdInfo({}), holdReason: r, offered, holdUntil: offered ? null : 'T' }).key)),
    ];
    for (const k of keys) expect(en[k]).toBeTruthy();
  });

  it('never calls a fee a donation or a gift', () => {
    const offenders = Object.entries(en).filter(([k, v]) => k.startsWith('reg.') && /\b(donat|gift|tax)/i.test(v));
    expect(offenders).toEqual([]);
  });
});
