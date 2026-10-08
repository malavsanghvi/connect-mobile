import { describe, expect, it, jest } from '@jest/globals';

import { chooseOfficePayment, loadEnrollmentDetails, loadRegistrationOptions, pathshalaError, previewRegistration, registerLearners } from '../api/pathshala';
import { AppError } from '../errors';
import {
  chargedNow,
  countdownText,
  enrollmentStatus,
  expectedOutcomes,
  FEE_ASSISTANCE_OFFERED,
  feeSummary,
  holdCountdown,
  holdForViewer,
  holdIsLive,
  holdOf,
  isAdultLine,
  learnerRows,
  learnersArg,
  levelGroups,
  levelUnavailable,
  lineNames,
  linePledges,
  lineParts,
  myWaiverHolds,
  parseOfficeChoice,
  parseRegistrationOptions,
  parseRegistrationResult,
  payGroup,
  payNowCents,
  registerRoute,
  stateDetail,
  startBlock,
  unbilledSeatLines,
  type RegistrationOptions,
  type RegistrationResult,
  type Selection,
} from '../pathshala-registration';

import {
  ENROLLMENT_HELD_ADULT,
  ENROLLMENT_HELD_CHILD,
  ENROLLMENT_OFFERED_ADULT,
  ENROLLMENT_PLACED_PAID_ADULT,
  ENROLLMENT_RELEASED_ADULT,
  ENROLLMENT_WAITLISTED_ADULT,
  ENROLLMENT_WAIVER_HOLD_ADULT,
  ERRORS,
  H,
  L,
  OPTIONS_CHILD,
  OPTIONS_PAY_NOW,
  OPTIONS_PLEDGE,
  optionsWith,
  P,
  PAY_NOW_PLEDGE_ID,
  PREVIEW_OFFICE_AND_PENDING,
  PREVIEW_PAY_NOW,
  PREVIEW_PLEDGE,
  REG,
  REGISTER_FREE_ONLY,
  REGISTER_PAY_NOW,
  REGISTER_PLEDGE,
  T,
  TERM,
  WAIVER,
  type Json,
} from './pathshala-real-shapes';

/**
 * The registration functions' answers as connect-crm 0590/0591 build them (literal JSON in pathshala-real-shapes.ts, with
 * the values the SQL tests 75, 76 and 77 assert), read by the app's parsers and rules, in both payment modes. The app never
 * prices anything: every number below is typed from the SQL tests, none is computed here.
 */

function got<T>(v: T | null): T {
  if (v === null) throw new Error('the answer was not read');
  return v;
}
const options = (raw: Json): RegistrationOptions => got(parseRegistrationOptions(raw));
const result = (raw: Json): RegistrationResult => got(parseRegistrationResult(raw));

type Res = { data: unknown; error: unknown };
const mockRpc = jest.fn<(name: string, args: unknown) => Promise<Res>>();
const mockFrom = jest.fn<(table: string) => Promise<Res>>();
jest.mock('../supabase', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in']) chain[m] = () => chain;
      chain.then = (resolve: (r: Res) => unknown, reject: (e: unknown) => unknown) => mockFrom(table).then(resolve, reject);
      return chain;
    },
  },
}));

function quiet(): jest.SpiedFunction<typeof console.error> {
  return jest.spyOn(console, 'error').mockImplementation(() => undefined);
}

// ---------------------------------------------------------------------------
// The options
// ---------------------------------------------------------------------------

describe('options as the database answers them (test 75/76: the Shah household, term 2026-27, pledge mode)', () => {
  const o = options(OPTIONS_PLEDGE);

  it('reads the term: window, mode, hold, office payment, seat rule, deadlines, membership, no waiver yet, the family rules', () => {
    expect(o.term).toMatchObject({
      id: TERM.t1,
      name: '2026-27',
      startsOn: '2026-09-06',
      endsOn: '2027-05-30',
      paymentMode: 'pledge',
      holdHours: 48,
      officePayment: { allowed: false, holdDays: 7 },
      seatRule: 'automatic',
      withdrawalCreditUntil: '2026-09-20',
      ageCutoffOn: '2026-09-06',
      membershipRequired: true,
      waiver: null,
      siblingDiscountPct: 10,
      familyCapCents: 27500,
      firstClassOn: '2026-09-06',
    });
    expect(o.term.window).toEqual({ state: 'open', opensAt: null, closesAt: '2026-10-08T12:00:00-05:00', lateUntil: null, lateFeeCents: 0 });
    expect(o.household).toEqual({ id: H.shah, name: 'Shah household', number: 'JSH-H-2041', membership: 'active' });
    expect(o.households).toEqual([{ id: H.shah, name: 'Shah household', number: 'JSH-H-2041' }]);
    expect(o.canRegister).toBe(true);
    expect(o.cannotReason).toBeNull();
    expect(o.skipped).toBe(0);
    expect(startBlock(o)).toBeNull();
  });

  it('lists everyone with their age on the cut-off: children first (oldest first), then "me", then the other adult', () => {
    const rows = learnerRows(o, P.mira);
    expect(rows.map((r) => [r.learner.firstName, r.learner.ageOnCutoff, r.group, r.isMe])).toEqual([
      ['Riya', 12, 'child', false],
      ['Dev', 9, 'child', false],
      ['Anya', 4, 'child', false],
      ['Mira', 44, 'adult', true],
      ['Rahul', 46, 'adult', false],
    ]);
    expect(rows.every((r) => r.selectable)).toBe(true);
    expect(rows.find((r) => r.learner.firstName === 'Dev')?.learner.suggested).toEqual([{ trackId: T.jainism, levelId: L.j2, reason: 'age' }]);
  });

  it('lists the offered levels per track with their band, fee and seats (test 75: "Toddler:4500:open:children" …)', () => {
    const jainism = o.tracks.find((t) => t.key === 'jainism');
    expect(jainism?.levels.map((l) => `${l.name}:${l.feeCents}:${l.seats}:${l.band}`)).toEqual([
      'Toddler:4500:open:children',
      'Jainism 2:13000:open:children',
      'Jainism 3:13000:open:children',
      'Jainism 5:13000:open:children',
      'Adult class (Dads):5000:open:adult',
      'Adult class (Moms):5000:open:adult',
    ]);
    expect(o.tracks.map((t) => t.name)).toEqual(['Gujarati', 'Jainism']);
  });

  it('shows a child the Jainism children\'s levels (not the adult classes) and an adult only the adult classes, first those that fit', () => {
    const jainism = got(o.tracks.find((t) => t.key === 'jainism') ?? null);
    const dev = got(o.learners.find((l) => l.firstName === 'Dev') ?? null);
    const mira = got(o.learners.find((l) => l.firstName === 'Mira') ?? null);
    const forDev = levelGroups(jainism, { age: dev.ageOnCutoff, countsAsChild: dev.countsAsChild });
    expect(forDev.fit.map((l) => l.name)).toEqual(['Jainism 2', 'Jainism 3']);
    expect(forDev.other.map((l) => l.name)).toEqual(['Toddler', 'Jainism 5']);
    const forMira = levelGroups(jainism, { age: mira.ageOnCutoff, countsAsChild: mira.countsAsChild });
    expect(forMira.fit.map((l) => l.name)).toEqual(['Adult class (Dads)', 'Adult class (Moms)']);
    expect(forMira.other).toEqual([]);
  });

  it('a pay-now term (test 76 T2): the hold, the office window, the published waiver, and a Free level that can be chosen', () => {
    const p = options(OPTIONS_PAY_NOW);
    expect(p.term).toMatchObject({ paymentMode: 'pay_now', holdHours: 48, officePayment: { allowed: true, holdDays: 7 }, siblingDiscountPct: 0, familyCapCents: null });
    expect(p.term.waiver).toEqual({ documentId: WAIVER, title: 'Pathshala waiver', version: '2026.1' });
    const toddler = got(p.tracks[0].levels.find((l) => l.name === 'Toddler') ?? null);
    expect(toddler.feeCents).toBe(0);
    expect(levelUnavailable(toddler)).toBeNull();
  });

  it('a child with their own login (test 75 `opt_kid`): the levels without a fee, no money rules, and the database\'s sentence', () => {
    const c = options(OPTIONS_CHILD);
    expect(c.canRegister).toBe(false);
    expect(c.cannotReason).toBe('Ask a parent or guardian in your family to register you.');
    expect(startBlock(c)).toEqual({ kind: 'cannot', reason: 'Ask a parent or guardian in your family to register you.' });
    expect(c.tracks.flatMap((t) => t.levels).every((l) => l.feeCents === null)).toBe(true);
    expect(c.term.siblingDiscountPct).toBe(0);
    expect(c.term.familyCapCents).toBeNull();
    expect(c.term.window.lateFeeCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The preview and the registration
// ---------------------------------------------------------------------------

describe('pledge mode: the owner\'s four learners, $325.00 (test 75 `pv`, test 76 `reg1`)', () => {
  const o = options(OPTIONS_PLEDGE);

  it('the preview: seat/13000, seat/11700, seat/2800, seat/5000, $325.00, nothing to pay now, no enrollment or pledge yet', () => {
    const pv = result(PREVIEW_PLEDGE);
    expect(pv.lines.map((l) => `${l.outcome}/${l.totalCents}`)).toEqual(['seat/13000', 'seat/11700', 'seat/2800', 'seat/5000']);
    expect(pv).toMatchObject({ registrationId: null, childrenTotalCents: 27500, adultsTotalCents: 5000, totalCents: 32500, dueNowCents: 32500, pay: null, pendingChildren: [], late: false, paymentMode: null, replayed: false });
    expect(payNowCents(pv)).toBe(0);
    expect(chargedNow(pv)).toEqual({ cents: 32500, count: 4 });
    expect(pv.lines.every((l) => l.enrollmentId === null && l.pledge === null)).toBe(true);
  });

  it('the lines carry the parts as the database priced them: Anya $45.00 less $4.50 less $12.50 at the cap; Mira (an adult) outside both', () => {
    const pv = result(PREVIEW_PLEDGE);
    const anya = pv.lines[2];
    expect(lineParts(anya)).toEqual([
      { key: 'levelFee', cents: 4500 },
      { key: 'sibling', cents: -450 },
      { key: 'cap', cents: -1250 },
    ]);
    expect(lineParts(pv.lines[3])).toEqual([{ key: 'levelFee', cents: 5000 }]);
    expect(pv.lines.map((l) => [l.familyRank, l.learnerKind])).toEqual([[1, 'child'], [2, 'child'], [3, 'child'], [null, 'adult']]);
    expect(isAdultLine(pv.lines[3], o.learners)).toBe(true);
    expect(lineNames(pv, o.learners, [])).toEqual(['Riya', 'Dev', 'Anya', 'Mira']);
  });

  it('the registration: four pledges (number, due 14 days after the seat), pay null, the payment mode of the term', () => {
    const r = result(REGISTER_PLEDGE);
    expect(r).toMatchObject({ registrationId: REG.pledge, totalCents: 32500, dueNowCents: 32500, pay: null, paymentMode: 'pledge', replayed: false });
    expect(r.lines.every((l) => !!l.enrollmentId && !!l.pledge?.number)).toBe(true);
    expect(r.lines.map((l) => l.pledge?.amountCents)).toEqual([13000, 11700, 2800, 5000]);
    expect(linePledges(r)).toMatchObject({ cents: 32500, dueOn: '2026-09-22', sameDue: true });
    expect(linePledges(r).ids).toHaveLength(4);
    expect(unbilledSeatLines(r)).toEqual([]);
    expect(payNowCents(r)).toBe(0);
  });

  it('what is sent back: the learners as the database reads them, and the preview\'s lines as the outcomes the family saw', () => {
    const selections: Selection[] = [
      { key: P.riya, personId: P.riya, newChild: null, tracks: [{ trackId: T.jainism, levelId: L.j5, unsure: false }], note: '' },
      { key: P.dev, personId: P.dev, newChild: null, tracks: [{ trackId: T.jainism, levelId: L.j2, unsure: false }], note: 'Please seat him near the front' },
    ];
    expect(learnersArg(selections, false)).toEqual([
      { person_id: P.riya, track_id: T.jainism, level_id: L.j5, note: null, assistance_requested: false },
      { person_id: P.dev, track_id: T.jainism, level_id: L.j2, note: 'Please seat him near the front', assistance_requested: false },
    ]);
    // Test 76 passes the preview's lines themselves; the database reads person_id, track_id and outcome of each.
    expect(expectedOutcomes(result(PREVIEW_PLEDGE)).map((e) => [e.person_id, e.track_id, e.outcome])).toEqual([
      [P.riya, T.jainism, 'seat'],
      [P.dev, T.jainism, 'seat'],
      [P.anya, T.jainism, 'seat'],
      [P.mira, T.jainism, 'seat'],
    ]);
  });

  it('"not sure", a child not yet on the family and a child outside the band wait for the office (test 75 `pv2`)', () => {
    const pv = result(PREVIEW_OFFICE_AND_PENDING);
    expect(pv.lines.map((l) => l.outcome)).toEqual(['office', 'pending_child', 'office']);
    expect(pv.lines[0]).toMatchObject({ priced: false, levelId: null, level: null, totalCents: 0, personId: P.dev });
    expect(lineParts(pv.lines[0])).toEqual([]);
    expect(pv.lines[1]).toMatchObject({ personId: null, enrollmentId: null });
    expect(pv.pendingChildren).toEqual([{ firstName: 'Tara', requestId: null }]);
    expect(pv).toMatchObject({ dueNowCents: 0, pay: null, totalCents: 17050 });
    expect(chargedNow(pv)).toEqual({ cents: 0, count: 0 });
  });
});

describe('pay now: Ved (Jainism 2, $130.00) and Mina (Toddler, Free), Summer 2027 (test 76 `reg_ved2`)', () => {
  it('the preview carries what would be paid now, no pledge ids yet, and when the hold would end', () => {
    const pv = result(PREVIEW_PAY_NOW);
    expect(pv.lines.map((l) => `${l.outcome}/${l.totalCents}`)).toEqual(['seat/13000', 'seat/0']);
    expect(pv.pay).toEqual({ amountCents: 13000, pledgeIds: [], forLabel: 'Pathshala fee Summer 2027 · Ved, Mina', holdUntil: '2026-09-10T12:00:00-05:00', officePaymentAllowed: true });
    expect(payNowCents(pv)).toBe(13000);
    expect(pv.registrationId).toBeNull();
  });

  it('the registration: one pledge due today, the family pays $130.00 once, Mina\'s Free line has no pledge', () => {
    const r = result(REGISTER_PAY_NOW);
    expect(r.paymentMode).toBe('pay_now');
    expect(r.pay).toEqual({ amountCents: 13000, pledgeIds: [PAY_NOW_PLEDGE_ID], forLabel: 'Pathshala fee Summer 2027 · Ved, Mina', holdUntil: '2026-09-10T12:00:00-05:00', officePaymentAllowed: true });
    expect(payNowCents(r)).toBe(13000);
    expect(r.lines[0].pledge).toEqual({ id: PAY_NOW_PLEDGE_ID, number: 'JSH-PL-20131', dueOn: '2026-09-08', amountCents: 13000 });
    expect(r.lines[1]).toMatchObject({ totalCents: 0, pledge: null, level: 'Toddler' });
    expect(unbilledSeatLines(r)).toEqual([]);
    expect(linePledges(r).ids).toEqual([PAY_NOW_PLEDGE_ID]);
    expect(chargedNow(r)).toEqual({ cents: 13000, count: 1 });
  });

  it('a family with nothing to pay (a Free level): pay is $0.00 with no hold time and no pledge; the seat is placed at once', () => {
    const r = result(REGISTER_FREE_ONLY);
    expect(r.pay).toEqual({ amountCents: 0, pledgeIds: [], forLabel: 'Pathshala fee Summer 2027 · Anya', holdUntil: null, officePaymentAllowed: true });
    expect(payNowCents(r)).toBe(0);
    expect(r.lines[0].pledge).toBeNull();
    expect(chargedNow(r)).toEqual({ cents: 0, count: 0 });
  });

  it('an answer whose lines or pledge amounts do not add up is not read at all (money is never half shown)', () => {
    expect(parseRegistrationResult({ ...REGISTER_PAY_NOW, total_cents: 13001 })).toBeNull();
    expect(parseRegistrationResult({ ...REGISTER_PAY_NOW, due_now_cents: undefined })).toBeNull();
    const lines = (REGISTER_PAY_NOW.lines as Json[]).map((l, i) => (i === 0 ? { ...l, pledge: { ...(l.pledge as Json), amount_cents: null } } : l));
    expect(parseRegistrationResult({ ...REGISTER_PAY_NOW, lines })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Where a seat stands afterwards
// ---------------------------------------------------------------------------

describe('where a seat stands, from the options\' enrollments (test 76 sweep and waitlist, test 77 section 11)', () => {
  const enrolled = (e: Json, person: string = P.riya, base: Json = OPTIONS_PLEDGE) => {
    const o = options(optionsWith(base, { [person]: [e] }));
    const learner = got(o.learners.find((l) => l.personId === person) ?? null);
    return { o, e: learner.enrollments[0] };
  };

  it('a seat held for payment: why, until when, the registration, and the fee line with its pledge, for an adult of the family', () => {
    const { e } = enrolled(ENROLLMENT_HELD_ADULT);
    expect(e).toMatchObject({ status: 'requested', holdReason: 'payment', holdExpiresAt: '2026-09-10T18:00:00-05:00', registrationId: REG.payNow, trackId: T.gujarati, levelId: L.g1, classId: null });
    expect(e.fee).toMatchObject({ status: 'billed', totalCents: 4500, priced: true, pledge: { number: 'JSH-PL-20140', amountCents: 4500, paidCents: 0, status: 'open', dueOn: '2026-09-08' } });
    const view = enrollmentStatus('requested', holdOf(e));
    expect(view).toMatchObject({ key: 'reg.status.heldUntil', until: '2026-09-10T18:00:00-05:00', heldForPayment: true });
    expect(holdIsLive('requested', holdOf(e), new Date('2026-09-09T12:00:00-05:00'))).toBe(true);
    expect(holdIsLive('requested', holdOf(e), new Date('2026-09-10T18:30:00-05:00'))).toBe(false);
    // The countdown and its urgency (the reminder goes out 6 hours before).
    const c = holdCountdown(e.holdExpiresAt, new Date('2026-09-10T16:00:00-05:00'));
    expect(c).toEqual({ ended: false, unit: 'hours', n: 2, urgent: true });
    expect(countdownText(got(c), (k, v) => `${k}:${v?.n ?? ''}`)).toBe('reg.left.hours:2');
    expect(stateDetail(view, e.state)).toBeNull();
  });

  it('the same seat for the child with their own login: only that it ends at a time. No reason, registration, sentence or fee (P30)', () => {
    const { e } = enrolled(ENROLLMENT_HELD_CHILD);
    expect(e).toMatchObject({ holdReason: null, holdExpiresAt: '2026-09-10T18:00:00-05:00', registrationId: null, withdrawalReason: null, state: null, fee: null });
    expect(enrollmentStatus('requested', holdForViewer(holdOf(e), false), { adult: false }).key).toBe('reg.status.requested');
    expect(feeSummary(e.fee?.pledge ? [e.fee.pledge] : [])).toEqual({ kind: 'none' });
  });

  it('a seat offered from the waitlist (pay now): held 48 hours, with the pledge due today', () => {
    const { e } = enrolled(ENROLLMENT_OFFERED_ADULT, P.dev);
    expect(enrollmentStatus('requested', holdOf(e))).toMatchObject({ key: 'reg.status.offeredUntil', heldForPayment: true });
    expect(e.offeredAt).toBe('2026-09-08T10:00:00-05:00');
    expect(e.fee?.pledge?.dueOn).toBe('2026-09-08');
  });

  it('the waitlist: number 2, to everyone; "no charge" words for the adults only', () => {
    const { e } = enrolled(ENROLLMENT_WAITLISTED_ADULT, P.dev);
    expect(e.waitlistPosition).toBe(2);
    expect(enrollmentStatus('waitlisted', holdOf(e))).toMatchObject({ key: 'reg.status.waitlistedAt', n: 2 });
    expect(enrollmentStatus('waitlisted', holdOf(e), { adult: false })).toMatchObject({ key: 'reg.status.waitlistedChildAt', n: 2 });
    // The line is quoted, not billed: no pledge, so nothing to pay.
    expect(e.fee).toMatchObject({ status: 'quoted', totalCents: 11700, pledge: null });
  });

  it('a seat released because the fee was not paid: the database\'s sentence, the fee cancelled (nothing to pay)', () => {
    const { e } = enrolled(ENROLLMENT_RELEASED_ADULT);
    expect(e.status).toBe('withdrawn');
    expect(e.withdrawalReason).toBe('The fee was not paid by Thu Sep 10, 6:00 pm, so the seat was released.');
    expect(feeSummary(e.fee?.pledge ? [e.fee.pledge] : [])).toEqual({ kind: 'none' });
  });

  it('registered and paid: placed in a class, "Fee paid"', () => {
    const { e } = enrolled(ENROLLMENT_PLACED_PAID_ADULT);
    expect(enrollmentStatus('placed', holdOf(e)).key).toBe('reg.status.placed');
    expect(e.classId).toBe('76000000-0000-4000-8000-000000000625');
    expect(feeSummary(e.fee?.pledge ? [e.fee.pledge] : [])).toEqual({ kind: 'paid', totalCents: 13000 });
  });

  it('what is still to pay later (Home\'s Pay): the pledge\'s open balance, for the whole registration\'s held seats at once', () => {
    const { e } = enrolled(ENROLLMENT_HELD_ADULT);
    const pledges = e.fee?.pledge ? [e.fee.pledge] : [];
    expect(feeSummary(pledges)).toMatchObject({ kind: 'due', totalCents: 4500, openCents: 4500, paidCents: 0, dueOn: '2026-09-08' });
    const target = { id: 'e1', personId: P.riya, registrationId: REG.payNow, heldForPayment: true, pledges };
    const sibling = { id: 'e2', personId: P.dev, registrationId: REG.payNow, heldForPayment: true, pledges: [{ ...pledges[0], id: 'pl-2', amountCents: 13000, paidCents: 3000 }] };
    expect(payGroup([target, sibling], target)).toEqual({ pledgeIds: [pledges[0].id, 'pl-2'], amountCents: 14500, personIds: [P.riya, P.dev] });
  });

  it('another adult learner waiting for their own agreement to the waiver (test 76): Rahul can register himself, others cannot', () => {
    const { o } = enrolled(ENROLLMENT_WAIVER_HOLD_ADULT, P.rahul);
    const rahul = got(o.learners.find((l) => l.personId === P.rahul) ?? null);
    expect(rahul.enrollments[0]).toMatchObject({ status: 'requested', holdReason: 'waiver', registrationId: REG.pledge });
    expect(myWaiverHolds({ ...rahul, isMe: true })).toHaveLength(1);
    expect(myWaiverHolds({ ...rahul, isMe: false })).toHaveLength(0);
    // Mira (the registering adult) cannot choose him again; Rahul himself can.
    const rows = learnerRows(o, P.rahul);
    expect(rows.find((r) => r.learner.personId === P.rahul)?.selectable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The calls and the refusals
// ---------------------------------------------------------------------------

describe('the calls, with the answers and refusals the SQL tests show', () => {
  const learnerArg = [{ person_id: P.ved, track_id: T.jainism, level_id: L.j2, note: null, assistance_requested: false }];
  const regArgs = { termId: TERM.t2, householdId: H.desai, learners: learnerArg, expectedTotalCents: 13000, expectedOutcomes: [{ person_id: P.ved, track_id: T.jainism, outcome: 'seat' }], waiverDocumentId: WAIVER, clientKey: '8d3c7a1e-5a52-4a43-9b0b-0e6d0f8a1c11' };

  it('asks for the options, previews and registers with the argument names of 0590/0591', async () => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValueOnce({ data: OPTIONS_PAY_NOW, error: null });
    const ans = await loadRegistrationOptions(TERM.t2, H.desai);
    expect(mockRpc).toHaveBeenLastCalledWith('pathshala_registration_options', { p_term: TERM.t2, p_household: H.desai });
    expect(ans.kind === 'answered' && ans.options.term.paymentMode).toBe('pay_now');

    mockRpc.mockResolvedValueOnce({ data: PREVIEW_PAY_NOW, error: null });
    await previewRegistration({ termId: TERM.t2, householdId: H.desai, learners: learnerArg });
    expect(mockRpc).toHaveBeenLastCalledWith('preview_pathshala_registration', { p_term: TERM.t2, p_household: H.desai, p_learners: learnerArg });

    mockRpc.mockResolvedValueOnce({ data: REGISTER_PAY_NOW, error: null });
    const r = await registerLearners(regArgs);
    expect(mockRpc).toHaveBeenLastCalledWith('register_pathshala_children', {
      p_term: TERM.t2,
      p_household: H.desai,
      p_learners: learnerArg,
      p_expected_total_cents: 13000,
      p_expected_outcomes: regArgs.expectedOutcomes,
      p_waiver_document: WAIVER,
      p_client_key: regArgs.clientKey,
    });
    expect(r.pay?.amountCents).toBe(13000);
    // A client key is 8 to 100 characters (0591:63).
    expect(regArgs.clientKey.length).toBeGreaterThanOrEqual(8);
    expect(regArgs.clientKey.length).toBeLessThanOrEqual(100);
  });

  it('the same client key again returns the first answer, marked replayed', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ...REGISTER_PLEDGE, replayed: true }, error: null });
    const r = await registerLearners({ ...regArgs, termId: TERM.t1, householdId: H.shah, expectedTotalCents: 32500, waiverDocumentId: null });
    expect(r).toMatchObject({ replayed: true, registrationId: REG.pledge });
  });

  it('"Pay at the office instead" (0591:362): until when, what is left, which pledges', async () => {
    mockRpc.mockResolvedValueOnce({ data: { registration_id: REG.payNow, hold_until: '2026-09-15T12:00:00-05:00', amount_cents: 13000, pledge_ids: [PAY_NOW_PLEDGE_ID], office_hold_days: 7 }, error: null });
    const choice = await chooseOfficePayment(REG.payNow);
    expect(mockRpc).toHaveBeenLastCalledWith('choose_pathshala_office_payment', { p_registration: REG.payNow });
    expect(choice).toEqual({ holdUntil: '2026-09-15T12:00:00-05:00', amountCents: 13000, pledgeIds: [PAY_NOW_PLEDGE_ID] });
    expect(parseOfficeChoice({ registration_id: REG.payNow, hold_until: null, amount_cents: 0, pledge_ids: [], office_hold_days: 7 })).toEqual({ holdUntil: null, amountCents: 0, pledgeIds: [] });
  });

  // The route the family is sent to (by code and HINT, never by words) and the sentence shown: each case is a refusal a SQL test asserts.
  const cases: [string, keyof typeof ERRORS, 'review' | 'refused'][] = [
    ['the last seat was taken meanwhile', 'lastSeat', 'review'],
    ['the fee changed since they looked', 'feeChanged', 'review'],
    ['two registrations at the same moment', 'sameMoment', 'review'],
    ['no waiver agreed', 'waiverMissing', 'refused'],
    ['an old waiver', 'waiverOld', 'refused'],
    ['a child registering', 'childCannot', 'refused'],
    ['another family\'s learners', 'notYourFamily', 'refused'],
    ['a term that is not open', 'notOpen', 'refused'],
    ['a full level with no waitlist', 'full', 'refused'],
    ['one enrollment per track', 'alreadyRegistered', 'refused'],
    ['a term that takes the fee online only (the sentence starts with the term name)', 'onlineOnly', 'refused'],
    ['pay now needs a level', 'levelNeeded', 'refused'],
    ['the same key with other details', 'otherDetails', 'refused'],
    ['Pathshala switched off', 'moduleOff', 'refused'],
    ['Pledges & donations switched off in a pay-now term', 'givingOff', 'refused'],
    ['fee assistance asked for before the database can decide it (opens with 0592)', 'feeAssistance', 'refused'],
    ['a pending request to add the child exists (the bare raise of request_add_family_member)', 'alreadyPending', 'refused'],
  ];
  it.each(cases)('registering: %s', async (_name, key, route) => {
    const log = quiet();
    const e = ERRORS[key];
    mockRpc.mockResolvedValueOnce({ data: null, error: e });
    const err = await registerLearners(regArgs).catch((x: unknown) => x);
    expect(err).toBeInstanceOf(AppError);
    // The database's own sentence, with a final period added when it has none.
    expect((err as AppError).userMessage).toBe(/[.!?]$/.test(e.message) ? e.message : `${e.message}.`);
    expect((err as AppError).code).toBe(e.code);
    expect(registerRoute(err)).toBe(route);
    log.mockRestore();
  });

  it('does not offer fee assistance while the database refuses it: every line says assistance_requested false, and the preview refusal is shown as it comes', async () => {
    expect(FEE_ASSISTANCE_OFFERED).toBe(false);
    const one: Selection[] = [{ key: P.ved, personId: P.ved, newChild: null, tracks: [{ trackId: T.jainism, levelId: L.j2, unsure: false }], note: '' }];
    expect(learnersArg(one, FEE_ASSISTANCE_OFFERED)).toEqual([{ person_id: P.ved, track_id: T.jainism, level_id: L.j2, note: null, assistance_requested: false }]);
    // If it were ever sent, the preview is refused (test 75), shown in the database's words, and it is not a reason to try again.
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: ERRORS.feeAssistance });
    const err = await previewRegistration({ termId: TERM.t2, householdId: H.desai, learners: learnersArg(one, true) }).catch((x: unknown) => x);
    expect((err as AppError).userMessage).toBe('Fee assistance opens in the next release. Ask the Pathshala office.');
    expect((err as AppError).code).toBe('22023');
    log.mockRestore();
  });

  it('Postgres\' own words are never shown', () => {
    const log = quiet();
    const err = pathshalaError(ERRORS.rowLevel, 'register for Pathshala');
    expect(err.userMessage).not.toMatch(/row-level|violates|policy/i);
    log.mockRestore();
  });

  it('options for the households of a term: every enrollment, with its hold, pledge and sentence (one call for a term)', async () => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValueOnce({ data: optionsWith(OPTIONS_PLEDGE, { [P.riya]: [ENROLLMENT_HELD_ADULT], [P.dev]: [ENROLLMENT_WAITLISTED_ADULT] }), error: null });
    const details = await loadEnrollmentDetails(H.shah, [{ id: TERM.t1, name: '2026-27' }]);
    expect([...details.keys()]).toEqual([ENROLLMENT_HELD_ADULT.enrollment_id, ENROLLMENT_WAITLISTED_ADULT.enrollment_id]);
    expect(details.get(ENROLLMENT_HELD_ADULT.enrollment_id as string)).toMatchObject({
      personId: P.riya,
      termName: '2026-27',
      status: 'requested',
      hold: { holdReason: 'payment', holdUntil: '2026-09-10T18:00:00-05:00', registrationId: REG.payNow },
      officeAllowed: false,
    });
    expect(details.get(ENROLLMENT_HELD_ADULT.enrollment_id as string)?.pledges.map((p) => [p.amountCents, p.paidCents])).toEqual([[4500, 0]]);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
