import { describe, expect, it } from '@jest/globals';

import { translate } from '../../i18n';
import { en, type StringKey } from '../../i18n/en';
import { AppError } from '../errors';
import { formatCents } from '../format';
import {
  chargedNow,
  chooseTerm,
  countdownText,
  enrollmentStatus,
  errorHint,
  expectedOutcomes,
  feeSummary,
  firstTrack,
  freeTracks,
  holdCountdown,
  holdForViewer,
  holdInfo,
  isAdultClass,
  isAdultLine,
  isChildrensLevel,
  learnerRows,
  learnersArg,
  levelAllowed,
  levelBand,
  levelFits,
  levelGroups,
  levelUnavailable,
  lineLevel,
  lineNames,
  lineParts,
  linePledges,
  membershipState,
  myWaiverHolds,
  newChildAge,
  officeConfirms,
  outcomeKey,
  OUTCOMES,
  parseOfficeChoice,
  parseRegistrationOptions,
  parseRegistrationResult,
  payGroup,
  payNowCents,
  registerRoute,
  RegistrationRefusal,
  selectionsComplete,
  startBlock,
  SUGGESTION_KEY,
  suggestedLevel,
  unbilledSeatLines,
  unsureAllowed,
  waiverHoldNames,
  type FeePledge,
  type RegEnrollment,
  type RegistrationResult,
  type RegLevel,
  type RegTrack,
  type Selection,
} from '../pathshala-registration';

import {
  childOptionsRaw,
  ID,
  OWNER_TOTAL,
  optionsRaw,
  ownerLines,
  postgrestError,
  previewRaw,
  registerRaw,
  termRaw,
  tracksRaw,
  type Mode,
  type PriceLine,
  type Raw,
  type Scenario,
} from './pathshala-fixtures';

// The answers below are built as connect-crm 0590/0591 build them (see pathshala-fixtures.ts), with the owner's prices.

const t = (key: StringKey, vars?: Record<string, string | number>) => translate('en', key, vars);
const dollars = (cents: number) => formatCents(cents, { alwaysCents: true });

function options(mode: Mode = 'pledge', over: Raw = {}) {
  const o = parseRegistrationOptions(optionsRaw(mode, over));
  if (!o) throw new Error('options did not parse');
  return o;
}

function read(raw: Raw): RegistrationResult {
  const r = parseRegistrationResult(raw);
  if (!r) throw new Error('result did not parse');
  return r;
}

const enrollment = (over: Partial<RegEnrollment> = {}): RegEnrollment => ({ enrollmentId: 'e-1', trackId: ID.jainism, levelId: ID.j2, status: 'placed', holdReason: null, holdExpiresAt: null, ...over });

// ---------------------------------------------------------------------------
// The options
// ---------------------------------------------------------------------------

describe('reading the registration options (0590 pathshala_registration_options)', () => {
  it('reads what the database answers an adult of the family', () => {
    const o = options();
    expect(o.term).toMatchObject({
      id: ID.term,
      name: '2026-27',
      paymentMode: 'pledge',
      holdHours: 48,
      seatRule: 'automatic',
      membershipRequired: true,
      ageCutoffOn: '2026-09-06',
      withdrawalCreditUntil: '2026-09-27',
      siblingDiscountPct: 10,
      familyCapCents: 27500,
      firstClassOn: '2026-09-13',
    });
    expect(o.term.window).toEqual({ state: 'open', opensAt: '2026-08-01T08:00:00-05:00', closesAt: '2026-09-01T23:59:00-05:00', lateUntil: null, lateFeeCents: 0 });
    expect(o.term.officePayment).toEqual({ allowed: false, holdDays: 7 });
    expect(o.term.waiver).toEqual({ documentId: ID.waiver, title: 'Pathshala waiver', version: '2026.1' });
    expect(o.household).toEqual({ id: ID.household, name: 'Shah household', number: 'JSH-H-2041', membership: 'active' });
    expect(o.learners.map((l) => l.firstName)).toEqual(['Riya', 'Dev', 'Anya', 'Mira', 'Raj']);
    expect(o.learners.filter((l) => l.isMe).map((l) => l.firstName)).toEqual(['Mira']);
    expect(o.canRegister).toBe(true);
    expect(o.cannotReason).toBeNull();
    expect(o.skipped).toBe(0);
  });

  it("reads each learner's enrollments with their ids, and the suggestion per track", () => {
    const o = options();
    const dev = o.learners.find((l) => l.personId === ID.dev);
    expect(dev?.enrollments).toEqual([{ enrollmentId: 'e-dev-g', trackId: ID.gujarati, levelId: ID.g1, status: 'requested', holdReason: 'payment', holdExpiresAt: '2026-08-20T18:00:00-05:00' }]);
    expect(dev?.suggested).toEqual([{ trackId: ID.jainism, levelId: ID.j2, reason: 'previous' }]);
    expect(o.learners.find((l) => l.personId === ID.riya)?.suggested[0].reason).toBe('teacher');
  });

  it('reads each level with its key and the database\'s band, and the seats', () => {
    const jainism = options().tracks.find((x) => x.key === 'jainism');
    expect(jainism?.levels.map((l) => [l.key, l.band, l.seats])).toEqual([
      ['toddler', 'children', 'open'],
      ['jainism-2', 'children', 'open'],
      ['jainism-5', 'children', 'waitlist'],
      ['family', 'any', 'open'],
      ['moms', 'adult', 'open'],
    ]);
    expect(jainism?.levels[3]).toEqual({ id: ID.family, name: 'Family Jainism', key: 'family', minAge: null, maxAge: null, band: 'any', feeCents: 6000, seats: 'open' });
  });

  it('reads a pay-now term: the hold hours and the office window', () => {
    const o = options('pay_now', { term: termRaw('pay_now', { hold_hours: 72, office_payment: { allowed: true, hold_days: 5 } }) });
    expect(o.term).toMatchObject({ paymentMode: 'pay_now', holdHours: 72, officePayment: { allowed: true, holdDays: 5 } });
  });

  it('reads the registration window: open, late (with its end and fee), closed, not yet', () => {
    const state = (window: Raw) => options('pledge', { term: termRaw('pledge', { window }) }).term.window;
    expect(state({ state: 'late', opens_at: null, closes_at: '2026-09-01T23:59:00-05:00', late_until: '2026-09-14T23:59:00-05:00', late_fee_cents: 2500 })).toEqual({
      state: 'late',
      opensAt: null,
      closesAt: '2026-09-01T23:59:00-05:00',
      lateUntil: '2026-09-14T23:59:00-05:00',
      lateFeeCents: 2500,
    });
    expect(state({ state: 'closed' }).state).toBe('closed');
    // `not_yet` is also what a term that is still a draft, or whose fees are not locked, answers (no opening date then).
    expect(state({ state: 'not_yet', opens_at: null, closes_at: null, late_until: null, late_fee_cents: 0 })).toMatchObject({ state: 'not_yet', opensAt: null });
    expect(state({ state: 'paused' }).state).toBe('closed');
  });

  it('is unusable without a term, a household or a payment mode it knows (money: never guessed)', () => {
    expect(parseRegistrationOptions(null)).toBeNull();
    expect(parseRegistrationOptions({ ...optionsRaw(), term: null })).toBeNull();
    expect(parseRegistrationOptions({ ...optionsRaw(), household: null })).toBeNull();
    expect(parseRegistrationOptions(optionsRaw('pledge', { term: termRaw('pledge', { payment_mode: 'card_only' }) }))).toBeNull();
  });

  it('keeps the plan defaults for settings an answer leaves out', () => {
    const o = options('pay_now', { term: { id: ID.term, name: '2026-27', payment_mode: 'pay_now', window: { state: 'open' } } });
    expect(o.term).toMatchObject({ holdHours: 48, officePayment: { allowed: false, holdDays: 7 }, seatRule: 'automatic', waiver: null, membershipRequired: false, siblingDiscountPct: 0, familyCapCents: null });
  });

  it('leaves out (and counts) the learners, tracks and levels it cannot read', () => {
    const raw = optionsRaw();
    const tracks = tracksRaw() as { levels: Raw[] }[];
    const o = options('pledge', {
      learners: [...(raw.learners as Raw[]), { first_name: 'No id' }, 'nonsense'],
      tracks: [{ ...tracks[1], levels: [...tracks[1].levels, { name: 'No id' }] }, { id: 'x' }],
    });
    expect(o.learners).toHaveLength(5);
    expect(o.tracks).toHaveLength(1);
    expect(o.tracks[0].levels).toHaveLength(5);
    expect(o.skipped).toBe(4);
  });

  it('keeps an enrollment whose status it does not know (it still takes its track) and drops unknown seats and reasons', () => {
    const o = options('pledge', {
      learners: [{ person_id: ID.dev, first_name: 'Dev', enrollments: [{ track_id: ID.jainism, status: 'paused' }], suggested: [{ track_id: ID.jainism, level_id: ID.j2, reason: 'magic' }] }],
      tracks: [{ id: ID.jainism, name: 'Jainism', levels: [{ id: ID.j2, name: 'Jainism 2', seats: 'some' }] }],
    });
    expect(o.learners[0].enrollments[0].status).toBeNull();
    expect(o.learners[0].suggested[0].reason).toBeNull();
    expect(o.tracks[0].levels[0]).toMatchObject({ seats: null, feeCents: null, minAge: null, maxAge: null, band: null });
    expect(freeTracks({ age: 9, countsAsChild: true, enrollments: o.learners[0].enrollments }, o.tracks)).toEqual([]);
  });

  it('lists the households the caller is an adult of, and always the one it answered for', () => {
    const two = options('pledge', {
      households: [
        { id: ID.household, name: 'Shah household', number: 'JSH-H-2041' },
        { id: ID.other, name: 'Mehta household', number: 'JSH-H-9' },
      ],
    });
    expect(two.households.map((h) => h.id)).toEqual([ID.household, ID.other]);
    expect(options('pledge', { households: [] }).households.map((h) => h.id)).toEqual([ID.household]);
  });

  it('reads what a child with their own login gets: no fees, no money rules, and the sentence to say', () => {
    const o = parseRegistrationOptions(childOptionsRaw());
    expect(o).not.toBeNull();
    if (!o) return;
    expect(o.canRegister).toBe(false);
    expect(o.cannotReason).toBe('Ask a parent or guardian in your family to register you.');
    expect(o.term).toMatchObject({ siblingDiscountPct: 0, familyCapCents: null });
    expect(o.term.window.lateFeeCents).toBe(0);
    expect(o.tracks.flatMap((x) => x.levels).every((l) => l.feeCents === null)).toBe(true);
    expect(startBlock(o)).toEqual({ kind: 'cannot', reason: 'Ask a parent or guardian in your family to register you.' });
  });
});

// ---------------------------------------------------------------------------
// The owner's example, both payment modes
// ---------------------------------------------------------------------------

describe("the owner's example (plan §2.4): $325.00, in both payment modes", () => {
  const cases: [Scenario, string][] = [
    ['cap', '$325.00'],
    ['noCap', '$337.50'],
    ['late', '$425.00'],
  ];

  it('is $325.00 with the family cap, $337.50 without it, $425.00 with a late fee of $25.00 for each of the four learners', () => {
    for (const [scenario, text] of cases) expect(dollars(OWNER_TOTAL[scenario])).toBe(text);
  });

  for (const mode of ['pledge', 'pay_now'] as const) {
    describe(`a ${mode === 'pledge' ? 'pledge-mode' : 'pay-now'} term`, () => {
      for (const [scenario, text] of cases) {
        it(`the review reads ${text} line by line as the database priced it`, () => {
          const preview = read(previewRaw(mode, ownerLines(scenario)));
          expect(preview.totalCents).toBe(OWNER_TOTAL[scenario]);
          expect(preview.registrationId).toBeNull();
          expect(preview.late).toBe(scenario === 'late');
          expect(preview.childrenTotalCents + preview.adultsTotalCents).toBe(preview.totalCents);
          expect(preview.adultsTotalCents).toBe(scenario === 'late' ? 7500 : 5000);
          // Every line's parts add up to its total, and the app shows exactly the database's parts.
          for (const line of preview.lines) expect(lineParts(line).reduce((s, p) => s + p.cents, 0)).toBe(line.totalCents);
          const late = scenario === 'late' ? 2500 : 0;
          expect(preview.lines.map((l) => l.totalCents)).toEqual([13000 + late, 11700 + late, (scenario === 'noCap' ? 4050 : 2800) + late, 5000 + late]);
          expect(lineParts(preview.lines[2])).toEqual(
            [
              { key: 'levelFee', cents: 4500 },
              { key: 'sibling', cents: -450 },
              ...(scenario === 'noCap' ? [] : [{ key: 'cap' as const, cents: -1250 }]),
              ...(late ? [{ key: 'late' as const, cents: late }] : []),
            ],
          );
          expect(preview.lines.map((l) => isAdultLine(l, []))).toEqual([false, false, false, true]);
          expect(preview.lines.map((l) => l.familyRank)).toEqual([1, 2, 3, null]);
        });

        it(`registering reads ${text}: ${mode === 'pledge' ? 'four pledges made, nothing to pay now' : 'four pledges held for payment, pay it now'}`, () => {
          const r = read(registerRaw(mode, ownerLines(scenario)));
          expect(r.totalCents).toBe(OWNER_TOTAL[scenario]);
          expect(r.paymentMode).toBe(mode);
          expect(r.replayed).toBe(false);
          expect(r.lines.every((l) => l.outcome === 'seat' && !!l.enrollmentId && l.pledge !== null)).toBe(true);
          // The pledges are the lines' totals (0591 `_pathshala_bill`), and what this registration bills is their sum.
          expect(r.lines.map((l) => l.pledge?.amountCents)).toEqual(r.lines.map((l) => l.totalCents));
          expect(r.dueNowCents).toBe(OWNER_TOTAL[scenario]);
          expect(chargedNow(r)).toEqual({ cents: OWNER_TOTAL[scenario], count: 4 });
          expect(linePledges(r).cents).toBe(OWNER_TOTAL[scenario]);
          expect(linePledges(r).ids).toHaveLength(4);
          expect(unbilledSeatLines(r)).toEqual([]);
          if (mode === 'pledge') {
            // `due_now_cents` is what is billed: due on each pledge's own date, never "pay now".
            expect(r.pay).toBeNull();
            expect(payNowCents(r)).toBe(0);
            expect(linePledges(r)).toMatchObject({ dueOn: '2026-09-20', sameDue: false });
          } else {
            expect(r.pay?.amountCents).toBe(OWNER_TOTAL[scenario]);
            expect(payNowCents(r)).toBe(OWNER_TOTAL[scenario]);
            expect(r.pay?.pledgeIds).toEqual(r.lines.map((l) => l.pledge?.id));
            expect(r.pay?.holdUntil).toBe('2026-08-22T18:00:00-05:00');
            expect(r.pay?.officePaymentAllowed).toBe(true);
            expect(r.pay?.forLabel).toBe('Pathshala fee 2026-27 · Riya, Dev, Anya, Mira');
            expect(linePledges(r)).toMatchObject({ dueOn: '2026-08-20', sameDue: true });
          }
        });
      }

      it(mode === 'pledge' ? 'the preview has no pay and bills the same as the registration' : 'the preview carries the amount to pay now, no pledge ids yet, and when the hold would end', () => {
        const preview = read(previewRaw(mode, ownerLines('cap')));
        expect(preview.dueNowCents).toBe(32500);
        expect(chargedNow(preview)).toEqual({ cents: 32500, count: 4 });
        if (mode === 'pledge') {
          expect(preview.pay).toBeNull();
          expect(payNowCents(preview)).toBe(0);
        } else {
          expect(preview.pay).toEqual({
            amountCents: 32500,
            pledgeIds: [],
            forLabel: 'Pathshala fee 2026-27 · Riya, Dev, Anya, Mira',
            holdUntil: '2026-09-03T14:00:00-05:00',
            officePaymentAllowed: true,
          });
          expect(payNowCents(preview)).toBe(32500);
        }
      });
    });
  }

  it('charges the late fee once for each learner: a second track of the same child carries none', () => {
    const lines: PriceLine[] = [
      { person: ID.dev, firstName: 'Dev', trackId: ID.jainism, track: 'Jainism', levelId: ID.j2, level: 'Jainism 2', kind: 'child', rank: 1, age: 9, base: 13000, late: 2500 },
      { person: ID.dev, firstName: 'Dev', trackId: ID.gujarati, track: 'Gujarati', levelId: ID.g1, level: 'Gujarati 1', kind: 'child', rank: 1, age: 9, base: 13000, sibling: 0 },
    ];
    const r = read(previewRaw('pledge', lines));
    expect(r.lines.map((l) => l.lateFeeCents)).toEqual([2500, 0]);
    expect(lineParts(r.lines[1]).some((p) => p.key === 'late')).toBe(false);
    expect(r.totalCents).toBe(28500);
    expect(r.late).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Every outcome and state
// ---------------------------------------------------------------------------

describe('what happens to each line (0590 _pathshala_plan outcomes)', () => {
  const base = { trackId: ID.jainism, track: 'Jainism', kind: 'child' as const };
  const lines: PriceLine[] = [
    { ...base, person: ID.riya, firstName: 'Riya', levelId: ID.j5, level: 'Jainism 5', rank: 1, age: 12, base: 13000, outcome: 'seat' },
    { ...base, person: ID.dev, firstName: 'Dev', levelId: ID.j5, level: 'Jainism 5', rank: 2, age: 9, base: 13000, sibling: 1300, outcome: 'waitlist' },
    { ...base, person: ID.anya, firstName: 'Anya', levelId: ID.toddler, level: 'Toddler', rank: 3, age: 4, base: 4500, sibling: 450, outcome: 'membership_hold' },
    { ...base, person: ID.dev, firstName: 'Dev', trackId: ID.gujarati, track: 'Gujarati', levelId: null, level: null, rank: 2, age: 9, base: 0, outcome: 'office' },
    { ...base, person: ID.raj, firstName: 'Raj', levelId: ID.moms, level: 'Adult class (Moms)', kind: 'adult', rank: null, age: 46, base: 5000, outcome: 'waiver_hold' },
    { ...base, person: null, firstName: 'Kavi', levelId: ID.toddler, level: 'Toddler', rank: 4, age: 5, base: 4500, sibling: 450, cap: 1250, outcome: 'pending_child' },
  ];

  it('reads a preview with every outcome: only the seat is billed, the others cost nothing yet', () => {
    const p = read(previewRaw('pledge', lines));
    expect(p.lines.map((l) => l.outcome)).toEqual(['seat', 'waitlist', 'membership_hold', 'office', 'waiver_hold', 'pending_child']);
    expect(p.dueNowCents).toBe(13000);
    expect(chargedNow(p)).toEqual({ cents: 13000, count: 1 });
    expect(p.pendingCount).toBe(1);
    expect(p.totalCents).toBe(p.lines.reduce((s, l) => s + l.totalCents, 0));
  });

  it('a "not sure" line is not priced: no level, money 0, no parts, "the office decides"', () => {
    const p = read(previewRaw('pledge', lines));
    const notSure = p.lines[3];
    expect(notSure).toMatchObject({ priced: false, levelId: null, level: null, outcome: 'office', baseFeeCents: 0, totalCents: 0 });
    expect(lineParts(notSure)).toEqual([]);
    expect(outcomeKey(notSure, 'pledge')).toBe('reg.outcome.officeChooses');
  });

  it('refuses a "not sure" line that carries money (an unpriced line is $0.00 or nothing is shown)', () => {
    const raw = previewRaw('pledge', lines);
    const bad = (raw.lines as Raw[]).map((l, i) => (i === 3 ? { ...l, base_fee_cents: 13000, total_cents: 13000 } : l));
    expect(parseRegistrationResult({ ...raw, lines: bad, total_cents: (raw.total_cents as number) + 13000 })).toBeNull();
  });

  it('a child being added has no person, no enrollment and no pledge, and a pending registration to wait for', () => {
    const r = read(registerRaw('pledge', lines));
    const kavi = r.lines[5];
    expect(kavi).toMatchObject({ personId: null, firstName: 'Kavi', enrollmentId: null, pledge: null, pendingRegistrationId: 'pr-6', outcome: 'pending_child' });
    expect(r.pendingCount).toBe(1);
    expect(outcomeKey(kavi, 'pledge')).toBe('reg.outcome.pendingChild');
    expect(lineNames(r, options().learners, [])).toEqual(['Riya', 'Dev', 'Anya', 'Dev', 'Raj', 'Kavi']);
  });

  it('only the seat has a pledge when registering; waiting lines have none and are not "unbilled"', () => {
    const r = read(registerRaw('pledge', lines));
    expect(r.lines.map((l) => l.pledge !== null)).toEqual([true, false, false, false, false, false]);
    expect(r.dueNowCents).toBe(13000);
    expect(linePledges(r)).toMatchObject({ cents: 13000, dueOn: '2026-09-20', sameDue: true });
    expect(unbilledSeatLines(r)).toEqual([]);
  });

  it('an adult learner other than the registering adult waits for the waiver in their own app: no seat, no charge', () => {
    const r = read(registerRaw('pledge', lines));
    expect(r.lines[4]).toMatchObject({ outcome: 'waiver_hold', pledge: null, learnerKind: 'adult' });
    expect(outcomeKey(r.lines[4], 'pledge')).toBe('reg.outcome.waiverHold');
    expect(waiverHoldNames(r, lineNames(r, options().learners, []))).toEqual(['Raj']);
    expect(t('reg.outcome.waiverHold', { name: 'Raj' })).toMatch(/Raj .*own app/);
  });

  it('has words for every outcome in both payment modes', () => {
    expect([...OUTCOMES]).toEqual(['seat', 'waitlist', 'membership_hold', 'office', 'pending_child', 'waiver_hold']);
    for (const outcome of OUTCOMES) for (const mode of ['pledge', 'pay_now'] as const) for (const levelId of [null, ID.j2]) expect(en[outcomeKey({ outcome, levelId }, mode)]).toBeTruthy();
    expect(outcomeKey({ outcome: 'seat', levelId: ID.j2 }, 'pledge')).toBe('reg.outcome.seat');
    expect(outcomeKey({ outcome: 'seat', levelId: ID.j2 }, 'pay_now')).toBe('reg.outcome.seatPay');
    expect(outcomeKey({ outcome: 'office', levelId: ID.j5 }, 'pledge')).toBe('reg.outcome.officeConfirms');
  });

  it('in a pay-now term a waitlisted or held line is not part of what is paid now', () => {
    const p = read(previewRaw('pay_now', lines));
    expect(p.pay?.amountCents).toBe(13000);
    expect(p.pay?.forLabel).toBe('Pathshala fee 2026-27 · Riya');
    const r = read(registerRaw('pay_now', lines));
    expect(r.pay).toMatchObject({ amountCents: 13000, pledgeIds: ['pl-1'] });
  });

  it('reads a registration answered again for the same client key (replayed)', () => {
    const r = read(registerRaw('pledge', ownerLines('cap'), { replayed: true }));
    expect(r.replayed).toBe(true);
    expect(r.totalCents).toBe(32500);
    expect(r.registrationId).toBe(ID.registration);
  });

  it('a pay-now registration with nothing to pay: pay is 0, no hold, no pledge, and the seat is placed at once', () => {
    const free: PriceLine[] = [{ ...ownerLines()[2], levelId: ID.toddler, base: 0, sibling: 0, cap: 0, rank: 1 }];
    const r = read(registerRaw('pay_now', free));
    expect(r.totalCents).toBe(0);
    expect(r.pay).toMatchObject({ amountCents: 0, pledgeIds: [], holdUntil: null });
    expect(payNowCents(r)).toBe(0);
    expect(r.lines[0].pledge).toBeNull();
    expect(unbilledSeatLines(r)).toEqual([]);
  });
});

describe('fee assistance (the request is asked on every line; billing waits for the decision)', () => {
  it('prices the lines in full but bills nothing: no pledge, nothing to pay now, the seats are kept', () => {
    const p = read(previewRaw('pledge', ownerLines('cap'), { assistance: true }));
    expect(p.totalCents).toBe(32500);
    expect(p.dueNowCents).toBe(0);
    expect(chargedNow(p)).toEqual({ cents: 0, count: 0 });
    const r = read(registerRaw('pledge', ownerLines('cap'), { assistance: true }));
    expect(r.lines.every((l) => l.pledge === null)).toBe(true);
    expect(r.dueNowCents).toBe(0);
    expect(linePledges(r).ids).toEqual([]);
    expect(unbilledSeatLines(r).map((l) => l.firstName)).toEqual(['Riya', 'Dev', 'Anya', 'Mira']);
  });

  it('in a pay-now term nothing is paid now and there is no hold time while the decision is awaited', () => {
    const p = read(previewRaw('pay_now', ownerLines('cap'), { assistance: true }));
    expect(p.pay?.amountCents).toBe(0);
    expect(payNowCents(p)).toBe(0);
    const r = read(registerRaw('pay_now', ownerLines('cap'), { assistance: true }));
    expect(r.pay).toMatchObject({ amountCents: 0, pledgeIds: [], holdUntil: null });
    expect(unbilledSeatLines(r)).toHaveLength(4);
  });

  it('sends the request as assistance_requested on every entry, and never anywhere a child or a teacher can read', () => {
    const selections: Selection[] = [
      { key: ID.dev, personId: ID.dev, newChild: null, tracks: [{ trackId: ID.jainism, levelId: ID.j2, unsure: false }], note: 'Please place with his cousin' },
      { key: 'new:1', personId: null, newChild: { firstName: 'Kavi', lastName: 'Shah', dateOfBirth: '2021-05-01', relationship: 'Child' }, tracks: [{ trackId: ID.jainism, levelId: ID.toddler, unsure: false }], note: '' },
    ];
    const args = learnersArg(selections, true);
    expect(args.map((a) => a.assistance_requested)).toEqual([true, true]);
    // The only free text sent is the family's own note; there is no field for a reason.
    for (const a of args) expect(Object.keys(a).sort()).toEqual((a.new_child ? ['assistance_requested', 'level_id', 'new_child', 'note', 'track_id'] : ['assistance_requested', 'level_id', 'note', 'person_id', 'track_id']));
    expect(JSON.stringify(args)).not.toMatch(/reason|because|afford|hardship/i);
    expect(args[0].note).toBe('Please place with his cousin');
  });
});

// ---------------------------------------------------------------------------
// Before you start
// ---------------------------------------------------------------------------

describe('before you start', () => {
  const base = options();
  const withWindow = (state: string, extra: Record<string, unknown> = {}) => ({ ...base, term: { ...base.term, window: { ...base.term.window, state: state as 'open', ...extra } } });

  it('goes on while registration is open or late', () => {
    expect(startBlock(base)).toBeNull();
    expect(startBlock(withWindow('late', { lateUntil: '2026-09-14T23:59:00-05:00', lateFeeCents: 2500 }))).toBeNull();
  });

  it('stops when the window is closed or not open yet (a draft term or fees not locked answers not_yet too)', () => {
    expect(startBlock(withWindow('closed'))).toEqual({ kind: 'closed' });
    expect(startBlock(withWindow('not_yet', { opensAt: '2026-08-01T08:00:00-05:00' }))).toEqual({ kind: 'not_yet', opensAt: '2026-08-01T08:00:00-05:00' });
    expect(startBlock(withWindow('not_yet', { opensAt: null }))).toEqual({ kind: 'not_yet', opensAt: null });
  });

  it("stops with the database's own sentence when it says no, as it comes", () => {
    const sentences = [
      'Registration for 2026-27 opens on Aug 1.',
      'Registration for 2026-27 closed on Sep 14. Ask the Pathshala office.',
      'Registration for 2026-27 is not open yet.',
      '2026-27 is closed.',
      'No classes are open for registration in 2026-27 yet.',
      '2026-27 takes the fee when you register, and Pledges & donations is switched off, so registration cannot be completed. Ask the Pathshala office.',
      'Online payment is not available right now, so registration cannot be completed. Try again later or ask the Pathshala office.',
      'Ask a parent or guardian in your family to register you.',
    ];
    for (const reason of sentences) expect(startBlock({ ...base, canRegister: false, cannotReason: reason })).toEqual({ kind: 'cannot', reason });
    expect(startBlock({ ...withWindow('closed'), canRegister: false, cannotReason: null })).toEqual({ kind: 'closed' });
    expect(startBlock({ ...base, canRegister: false, cannotReason: null })).toEqual({ kind: 'cannot', reason: null });
  });

  it('reads the membership: active, an application in progress, or none', () => {
    expect(membershipState('active')).toBe('member');
    expect(membershipState('applying')).toBe('applying');
    expect(membershipState('none')).toBe('none');
    // Anything else is not read as a membership: the database answers only these three.
    expect(membershipState('pending')).toBe('none');
    expect(membershipState('life')).toBe('none');
    expect(membershipState(null)).toBe('none');
    for (const m of ['active', 'applying', 'none'] as const) expect(options('pledge', { household: { id: ID.household, name: 'Shah household', number: 'JSH-H-2041', membership: m } }).household.membership).toBe(m);
  });

  it('opens on the term asked for, else the first open one, else the first', () => {
    const terms = [
      { id: 'a', open: false },
      { id: 'b', open: true },
      { id: 'c', open: true },
    ];
    expect(chooseTerm(terms, 'c', (x) => x.open)?.id).toBe('c');
    expect(chooseTerm(terms, 'gone', (x) => x.open)?.id).toBe('b');
    expect(chooseTerm(terms, null, () => false)?.id).toBe('a');
    expect(chooseTerm([], null, () => true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Who is joining
// ---------------------------------------------------------------------------

describe('who is joining', () => {
  const o = options();

  it('lists children first (oldest first), then the registering adult, then the other adults', () => {
    const rows = learnerRows(o, null);
    expect(rows.map((r) => r.learner.firstName)).toEqual(['Riya', 'Dev', 'Anya', 'Mira', 'Raj']);
    expect(rows.map((r) => r.group)).toEqual(['child', 'child', 'child', 'adult', 'adult']);
    expect(rows.find((r) => r.isMe)?.learner.firstName).toBe('Mira');
  });

  it("knows the signed-in adult from the database's is_me, not from an id the app holds", () => {
    expect(learnerRows(o, ID.raj).find((r) => r.isMe)?.learner.firstName).toBe('Mira');
    const raj = options('pledge', {
      learners: (optionsRaw().learners as Raw[]).map((l) => ({ ...l, is_me: l.person_id === ID.raj })),
    });
    expect(learnerRows(raj, null).map((r) => r.learner.firstName).slice(3)).toEqual(['Raj', 'Mira']);
  });

  it('lets a learner already in one track be chosen for another (P10), with where they stand', () => {
    const dev = learnerRows(o, null).find((r) => r.learner.personId === ID.dev);
    expect(dev?.free.map((x) => x.name)).toEqual(['Jainism']);
    expect(dev?.live).toHaveLength(1);
    expect(dev?.selectable).toBe(true);
  });

  it('takes the whole term with an enrollment from before tracks, never with a withdrawn one', () => {
    expect(freeTracks({ age: 9, countsAsChild: true, enrollments: [enrollment({ trackId: null, levelId: null })] }, o.tracks)).toEqual([]);
    expect(freeTracks({ age: 9, countsAsChild: true, enrollments: [enrollment({ status: 'withdrawn' })] }, o.tracks).map((x) => x.id)).toEqual([ID.gujarati, ID.jainism]);
  });

  it("an adult learner's own registration waiting for their waiver agreement can be registered again by themselves, not by others", () => {
    const waiting = enrollment({ status: 'requested', holdReason: 'waiver', trackId: ID.jainism, levelId: ID.moms });
    expect(freeTracks({ age: 44, countsAsChild: false, enrollments: [waiting], isMe: true }, o.tracks).map((x) => x.id)).toContain(ID.jainism);
    expect(freeTracks({ age: 44, countsAsChild: false, enrollments: [waiting], isMe: false }, o.tracks).map((x) => x.id)).not.toContain(ID.jainism);
    expect(myWaiverHolds({ isMe: true, enrollments: [waiting] })).toEqual([waiting]);
    expect(myWaiverHolds({ isMe: false, enrollments: [waiting] })).toEqual([]);
    expect(myWaiverHolds({ isMe: true, enrollments: [enrollment({ status: 'requested', holdReason: 'membership' })] })).toEqual([]);
  });

  it('cannot choose anyone with nothing left to join', () => {
    const full = options('pledge', {
      learners: [{ person_id: ID.riya, first_name: 'Riya', age_on_cutoff: 12, counts_as_child: true, enrollments: [{ enrollment_id: 'e1', track_id: ID.jainism, status: 'placed' }, { enrollment_id: 'e2', track_id: ID.gujarati, status: 'waitlisted' }] }],
    });
    expect(learnerRows(full, null)[0].selectable).toBe(false);
  });

  it('shows an adult only the tracks that have a level for adults (Gujarati has children\'s levels only)', () => {
    const raj = learnerRows(o, null).find((r) => r.learner.personId === ID.raj);
    expect(raj?.free.map((x) => x.id)).toEqual([ID.jainism]);
  });

  it("works out a new child's age on the cut-off date, for the level order only", () => {
    expect(newChildAge({ dateOfBirth: '2022-03-01' }, '2026-09-06', '2026-08-01')).toEqual({ age: 4, countsAsChild: true });
    expect(newChildAge({ dateOfBirth: '2022-10-01' }, null, '2026-08-01')).toEqual({ age: 3, countsAsChild: true });
    expect(newChildAge({ dateOfBirth: 'nonsense' }, '2026-09-06', '2026-08-01')).toEqual({ age: null, countsAsChild: true });
  });

  it('asks for a missing birth date (the database says needs_birth_date)', () => {
    const raw = options('pledge', { learners: [{ person_id: ID.dev, first_name: 'Dev', age_on_cutoff: null, counts_as_child: true, needs_birth_date: true, enrollments: [], suggested: [] }] });
    expect(raw.learners[0]).toMatchObject({ needsBirthDate: true, ageOnCutoff: null });
  });
});

// ---------------------------------------------------------------------------
// A level for each learner
// ---------------------------------------------------------------------------

describe('a level for each learner', () => {
  const jainism = options().tracks.find((x) => x.key === 'jainism') as RegTrack;
  const level = (min: number | null, max: number | null, over: Partial<RegLevel> = {}): RegLevel => ({ id: 'x', name: 'X', key: null, minAge: min, maxAge: max, band: null, feeCents: 1000, seats: 'open', ...over });

  it("tells adult classes and children's levels apart by the database's band (P24), and by the ages only when it has none", () => {
    expect(levelBand(level(18, null, { band: 'adult' }))).toBe('adult');
    // The band the database sent wins over the ages.
    expect(levelBand(level(18, null, { band: 'any' }))).toBe('any');
    expect(levelBand(level(null, 12, { band: 'children' }))).toBe('children');
    expect(levelBand(level(18, null))).toBe('adult');
    expect(levelBand(level(null, 17))).toBe('children');
    expect(levelBand(level(12, null))).toBe('any');
    expect(isAdultClass(level(null, null, { band: 'adult' }))).toBe(true);
    expect(isChildrensLevel(level(null, null, { band: 'children' }))).toBe(true);
    expect(levelAllowed(level(null, null, { band: 'adult' }), true)).toBe(false);
    expect(levelAllowed(level(null, null, { band: 'children' }), false)).toBe(false);
    expect(levelAllowed(level(null, null, { band: 'any' }), true)).toBe(true);
    expect(levelAllowed(level(null, null, { band: 'any' }), false)).toBe(true);
  });

  it('says whether an age fits a level (unknown when the age is not known)', () => {
    expect(levelFits(level(8, 10), 9)).toBe(true);
    expect(levelFits(level(8, 10), 11)).toBe(false);
    expect(levelFits(level(8, null), 44)).toBe(true);
    expect(levelFits(level(null, null), null)).toBe(true);
    expect(levelFits(level(8, 10), null)).toBeNull();
  });

  it("lists the levels for the learner's age first and the others below; adult classes never for a child, children's levels never for an adult", () => {
    const dev = levelGroups(jainism, { age: 9, countsAsChild: true });
    expect(dev.fit.map((l) => l.name)).toEqual(['Jainism 2', 'Family Jainism']);
    expect(dev.other.map((l) => l.name)).toEqual(['Toddler', 'Jainism 5']);
    const mira = levelGroups(jainism, { age: 44, countsAsChild: false });
    expect(mira.fit.map((l) => l.name)).toEqual(['Family Jainism', 'Adult class (Moms)']);
    expect(mira.other).toEqual([]);
    const unknown = levelGroups(jainism, { age: null, countsAsChild: true });
    expect(unknown.fit.map((l) => l.name)).toEqual(['Toddler', 'Jainism 2', 'Jainism 5', 'Family Jainism']);
    expect(unknown.other).toEqual([]);
  });

  it('says when the office confirms a level outside the ages, and when a level cannot be chosen', () => {
    expect(officeConfirms(level(11, 13, { band: 'children' }), { age: 9, countsAsChild: true })).toBe(true);
    expect(officeConfirms(level(8, 10, { band: 'children' }), { age: 9, countsAsChild: true })).toBe(false);
    expect(officeConfirms(level(8, 10, { band: 'children' }), { age: null, countsAsChild: true })).toBe(false);
    expect(officeConfirms(level(11, 13, { band: 'children' }), { age: 44, countsAsChild: false })).toBe(false);
    expect(levelUnavailable({ seats: 'full', feeCents: 1000 })).toBe('full');
    expect(levelUnavailable({ seats: 'open', feeCents: null })).toBe('no_fee');
    expect(levelUnavailable({ seats: 'waitlist', feeCents: 0 })).toBeNull();
  });

  it('preselects the database\'s suggestion only when it can be chosen', () => {
    const riya = { suggested: [{ trackId: ID.jainism, levelId: ID.j5, reason: 'teacher' as const }], age: 12, countsAsChild: true };
    expect(suggestedLevel(riya, jainism)?.levelId).toBe(ID.j5);
    const full: RegTrack = { ...jainism, levels: jainism.levels.map((l) => (l.id === ID.j5 ? { ...l, seats: 'full' as const } : l)) };
    expect(suggestedLevel(riya, full)).toBeNull();
    expect(suggestedLevel({ ...riya, suggested: [{ trackId: ID.jainism, levelId: ID.moms, reason: 'age' }] }, jainism)).toBeNull();
    expect(suggestedLevel({ ...riya, suggested: [] }, jainism)).toBeNull();
  });

  it('starts with the track the database suggested, else Jainism, else the first', () => {
    const tracks = options().tracks;
    expect(firstTrack({ suggested: [{ trackId: ID.gujarati, levelId: ID.g1, reason: null }] }, tracks)?.id).toBe(ID.gujarati);
    expect(firstTrack({ suggested: [] }, tracks)?.id).toBe(ID.jainism);
    expect(firstTrack({ suggested: [] }, [tracks[0]])?.id).toBe(ID.gujarati);
    expect(firstTrack({ suggested: [] }, [])).toBeNull();
  });

  it('allows "let the office decide" in a pledge-mode term only (P25: a pay-now term needs a level, the database refuses without one)', () => {
    const sel = (levelId: string | null, unsure: boolean): Selection[] => [{ key: ID.dev, personId: ID.dev, newChild: null, tracks: [{ trackId: ID.jainism, levelId, unsure }], note: '' }];
    expect(unsureAllowed('pledge')).toBe(true);
    expect(unsureAllowed('pay_now')).toBe(false);
    expect(selectionsComplete(sel(null, true), 'pledge')).toBe(true);
    expect(selectionsComplete(sel(null, true), 'pay_now')).toBe(false);
    expect(selectionsComplete(sel(ID.j2, false), 'pay_now')).toBe(true);
    expect(selectionsComplete(sel(null, false), 'pledge')).toBe(false);
    expect(selectionsComplete([], 'pledge')).toBe(false);
    expect(selectionsComplete([{ key: ID.dev, personId: ID.dev, newChild: null, tracks: [], note: '' }], 'pledge')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Review and registering
// ---------------------------------------------------------------------------

describe('what is sent (p_learners)', () => {
  const selections: Selection[] = [
    { key: ID.dev, personId: ID.dev, newChild: null, tracks: [{ trackId: ID.jainism, levelId: ID.j2, unsure: false }, { trackId: ID.gujarati, levelId: ID.g1, unsure: true }], note: '  Please place with his cousin ' },
    { key: 'new:1', personId: null, newChild: { firstName: ' Kavi ', lastName: 'Shah', dateOfBirth: '2021-05-01', relationship: 'Child' }, tracks: [{ trackId: ID.jainism, levelId: ID.toddler, unsure: false }, { trackId: ID.gujarati, levelId: ID.g1, unsure: false }], note: '' },
  ];

  it('is one entry per learner and track; "not sure" is a null level; the note is trimmed', () => {
    const args = learnersArg(selections, false);
    expect(args).toHaveLength(4);
    expect(args[0]).toEqual({ person_id: ID.dev, track_id: ID.jainism, level_id: ID.j2, note: 'Please place with his cousin', assistance_requested: false });
    expect(args[1]).toEqual({ person_id: ID.dev, track_id: ID.gujarati, level_id: null, note: 'Please place with his cousin', assistance_requested: false });
  });

  it('sends a child being added with the same name and birth date on each track, so the database counts one child (one request, one rank, one late fee)', () => {
    const args = learnersArg(selections, false);
    expect(args[2]).toEqual({ new_child: { first_name: 'Kavi', last_name: 'Shah', date_of_birth: '2021-05-01', relationship: 'Child' }, track_id: ID.jainism, level_id: ID.toddler, note: null, assistance_requested: false });
    expect(args[3].new_child).toEqual(args[2].new_child);
    expect(args[3].track_id).toBe(ID.gujarati);
  });
});

describe('sending back what the family saw (p_expected_outcomes)', () => {
  const mixed: PriceLine[] = [
    { person: ID.riya, firstName: 'Riya', trackId: ID.jainism, track: 'Jainism', levelId: ID.j5, level: 'Jainism 5', kind: 'child', rank: 1, age: 12, base: 13000, outcome: 'seat' },
    { person: ID.dev, firstName: 'Dev', trackId: ID.jainism, track: 'Jainism', levelId: ID.j2, level: 'Jainism 2', kind: 'child', rank: 2, age: 9, base: 13000, sibling: 1300, outcome: 'seat' },
    { person: ID.dev, firstName: 'Dev', trackId: ID.gujarati, track: 'Gujarati', levelId: ID.g1, level: 'Gujarati 1', kind: 'child', rank: 2, age: 9, base: 13000, sibling: 1300, outcome: 'waitlist' },
    { person: null, firstName: 'Kavi', trackId: ID.jainism, track: 'Jainism', levelId: ID.toddler, level: 'Toddler', kind: 'child', rank: 3, age: 5, base: 4500, sibling: 450, outcome: 'pending_child' },
    { person: null, firstName: 'Kavi', trackId: ID.gujarati, track: 'Gujarati', levelId: ID.g1, level: 'Gujarati 1', kind: 'child', rank: 3, age: 5, base: 13000, sibling: 1300, outcome: 'pending_child' },
  ];

  /** The database's matching (0591 register_pathshala_children): by person_id and track_id when the entry has a person, else by position. */
  function matched(plan: Raw[], expected: Record<string, unknown>[], i: number): Raw | undefined {
    const e = expected[i];
    if (typeof e.person_id === 'string' && e.person_id !== '') return plan.find((x) => x.person_id === e.person_id && (!e.track_id || x.track_id === e.track_id));
    return plan[i];
  }

  it('sends the preview lines in order, so each entry finds its own line: by person and track, a child being added by position', () => {
    const preview = read(previewRaw('pledge', mixed));
    const sent = expectedOutcomes(preview);
    expect(sent).toHaveLength(5);
    expect(sent[2]).toEqual({ person_id: ID.dev, track_id: ID.gujarati, level_id: ID.g1, outcome: 'waitlist' });
    expect(sent[3]).toEqual({ person_id: null, track_id: ID.jainism, level_id: ID.toddler, outcome: 'pending_child' });
    const plan = registerRaw('pledge', mixed).lines as Raw[];
    sent.forEach((e, i) => expect(matched(plan, sent, i)?.outcome).toBe(e.outcome));
    // Each entry resolves to its own line, not to another line of the same person or the same new child.
    sent.forEach((e, i) => expect(matched(plan, sent, i)?.track_id).toBe(e.track_id));
  });

  it('a seat that went meanwhile shows as a different outcome for the same entry', () => {
    const sent = expectedOutcomes(read(previewRaw('pledge', mixed)));
    const changed = (registerRaw('pledge', mixed).lines as Raw[]).map((l) => (l.person_id === ID.dev && l.track_id === ID.jainism ? { ...l, outcome: 'waitlist' } : l));
    expect(matched(changed, sent, 1)?.outcome).not.toBe(sent[1].outcome);
    // Mira's seat in another track is unaffected.
    expect(matched(changed, sent, 0)?.outcome).toBe(sent[0].outcome);
  });
});

describe('when registering fails', () => {
  it('falls back to the simple form when the database cannot register yet', () => {
    expect(registerRoute({ code: 'PGRST202', message: 'Could not find the function app.register_pathshala_children' })).toBe('missing');
    expect(registerRoute(new AppError('not available', 'register_pathshala_children: missing', '42883'))).toBe('missing');
  });

  it('goes back to the review on the HINT review_again, whatever the sentence says', () => {
    const changed = postgrestError('22023', 'The fee changed since you looked; please review the new total ($325.00).', 'review_again');
    expect(registerRoute(changed)).toBe('review');
    expect(registerRoute(postgrestError('22023', 'The last seat in Jainism 5 was just taken. Riya can join the waitlist instead: please review again.', 'review_again'))).toBe('review');
    expect(registerRoute(postgrestError('22023', 'A seat opened in Toddler since you looked: please review again.', 'review_again'))).toBe('review');
    expect(registerRoute(postgrestError('22023', "Riya's registration would now be waiting for the office instead of a seat: please review again.", 'review_again'))).toBe('review');
    expect(registerRoute(new RegistrationRefusal('x.', 'x', '22023', 'review_again'))).toBe('review');
    expect(errorHint(changed)).toBe('review_again');
  });

  it('never decides by the word "review" in the sentence: only the hint sends the family back', () => {
    expect(registerRoute(new AppError('The fee changed since you looked; please review the new total.', 'x', '22023'))).toBe('refused');
    expect(registerRoute(postgrestError('22023', 'Please review the waiver before you register.'))).toBe('refused');
    expect(registerRoute(postgrestError('22023', 'Registration closed.', 'something_else'))).toBe('refused');
  });

  it("shows the database's sentence for any other refusal, and Try again for the connection", () => {
    expect(registerRoute(postgrestError('22023', 'Registration for 2026-27 closed on Sep 14. Ask the Pathshala office.'))).toBe('refused');
    expect(registerRoute(postgrestError('22023', 'Agree to the Pathshala waiver to register.'))).toBe('refused');
    expect(registerRoute(postgrestError('22023', 'The Pathshala waiver was updated: read the new version and agree to it to register.'))).toBe('refused');
    expect(registerRoute(postgrestError('42501', 'Ask a parent or guardian in your family to register you.'))).toBe('refused');
    expect(registerRoute(postgrestError('P0002', 'That family was not found in this community.'))).toBe('refused');
    expect(registerRoute(postgrestError('P0001', 'Please enter their first and last name'))).toBe('refused');
    expect(registerRoute(new AppError("We couldn't register for Pathshala. Check your internet connection and try again.", 'network'))).toBe('retry');
    expect(registerRoute(new TypeError('Network request failed'))).toBe('retry');
  });

  it('reads the office choice (choose_pathshala_office_payment) for the instructions and the Zelle report', () => {
    expect(parseOfficeChoice({ registration_id: ID.registration, hold_until: '2026-08-27T18:00:00-05:00', amount_cents: 32500, pledge_ids: ['pl-1', 'pl-2'], office_hold_days: 7 })).toEqual({
      holdUntil: '2026-08-27T18:00:00-05:00',
      amountCents: 32500,
      pledgeIds: ['pl-1', 'pl-2'],
    });
    expect(parseOfficeChoice(null)).toEqual({ holdUntil: null, amountCents: null, pledgeIds: [] });
  });
});

// ---------------------------------------------------------------------------
// The review's other facts
// ---------------------------------------------------------------------------

describe('the rest of the review', () => {
  const o = options();
  const r = read(registerRaw('pledge', ownerLines('cap')));

  it('names each line: people by the database\'s first name, children being added in the order they were sent', () => {
    const lines = read(
      previewRaw('pledge', [
        { person: null, firstName: 'Anya', trackId: ID.jainism, track: 'Jainism', levelId: ID.toddler, level: 'Toddler', kind: 'child', rank: 1, age: 4, base: 4500, outcome: 'pending_child' },
        { person: ID.dev, firstName: 'Dev', trackId: ID.jainism, track: 'Jainism', levelId: ID.j2, level: 'Jainism 2', kind: 'child', rank: 2, age: 9, base: 13000, sibling: 1300, outcome: 'seat' },
      ]),
    );
    expect(lineNames(lines, o.learners, [])).toEqual(['Anya', 'Dev']);
    // An answer without first_name falls back to who was sent.
    const bare = parseRegistrationResult({ lines: [{ person_id: null, track_id: ID.jainism, outcome: 'pending_child', total_cents: 4500, base_fee_cents: 4500 }, { person_id: ID.dev, track_id: ID.jainism, outcome: 'seat', total_cents: 13000, base_fee_cents: 13000 }], total_cents: 17500 });
    const sel: Selection[] = [{ key: 'new:1', personId: null, newChild: { firstName: 'Kavi', lastName: 'Shah', dateOfBirth: '2021-05-01', relationship: 'Child' }, tracks: [{ trackId: ID.jainism, levelId: ID.toddler, unsure: false }], note: '' }];
    expect(bare && lineNames(bare, o.learners, sel)).toEqual(['Kavi', 'Dev']);
  });

  it('finds the level and track names of a line (the office decides: the track only)', () => {
    expect(lineLevel(r.lines[1], o.tracks)).toEqual({ track: 'Jainism', level: 'Jainism 2' });
    expect(lineLevel({ trackId: ID.jainism, levelId: null }, o.tracks)).toEqual({ track: 'Jainism', level: null });
    expect(lineLevel({ trackId: 'gone', levelId: 'x' }, o.tracks)).toEqual({ track: null, level: null });
  });

  it("marks adult learners' lines (outside the discount and the cap) by the line's own learner_kind", () => {
    expect(r.lines.map((l) => isAdultLine(l, o.learners))).toEqual([false, false, false, true]);
    expect(isAdultLine({ ...r.lines[3], learnerKind: null }, o.learners)).toBe(true);
    expect(isAdultLine({ ...r.lines[0], learnerKind: null }, o.learners)).toBe(false);
  });

  it('is all or nothing: one unreadable line (or total, or pay) makes the whole answer unusable', () => {
    const raw = registerRaw('pay_now', ownerLines('cap'));
    const lines = raw.lines as Raw[];
    expect(parseRegistrationResult({ ...raw, lines: [...lines.slice(0, 3), { ...lines[3], outcome: 'maybe' }] })).toBeNull();
    expect(parseRegistrationResult({ ...raw, lines: [{ ...lines[0], total_cents: 130.5 }] })).toBeNull();
    expect(parseRegistrationResult({ ...raw, lines: [{ ...lines[0], sibling_discount_cents: -5 }] })).toBeNull();
    expect(parseRegistrationResult({ ...raw, lines: [{ ...lines[0], track_id: null }] })).toBeNull();
    // Parts that do not add up to the line's total, and lines that do not add up to the answer's total.
    expect(parseRegistrationResult({ ...raw, lines: [{ ...lines[0], total_cents: 12000 }, ...lines.slice(1)] })).toBeNull();
    expect(parseRegistrationResult({ ...raw, total_cents: 99999 })).toBeNull();
    expect(parseRegistrationResult({ ...raw, total_cents: null })).toBeNull();
    expect(parseRegistrationResult({ ...raw, pay: { amount_cents: 'lots' } })).toBeNull();
    expect(parseRegistrationResult({ ...raw, due_now_cents: 'some' })).toBeNull();
    expect(parseRegistrationResult({ ...raw, lines: 'none' })).toBeNull();
    expect(parseRegistrationResult(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Afterwards
// ---------------------------------------------------------------------------

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
    expect(holdInfo({ hold_reason: 'payment', hold_expires_at: '2026-08-22T23:00:00Z', offered_at: '2026-08-20T23:00:00Z', registration_id: ID.registration, track_id: ID.jainism })).toEqual({
      holdReason: 'payment',
      holdUntil: '2026-08-22T23:00:00Z',
      offered: true,
      registrationId: ID.registration,
      trackId: ID.jainism,
    });
    expect(holdInfo({ status: 'requested' })).toEqual({ holdReason: null, holdUntil: null, offered: false, registrationId: null, trackId: null });
    expect(holdInfo({ hold_reason: 'vacation' }).holdReason).toBeNull();
    for (const reason of ['membership', 'payment', 'office_payment', 'assistance', 'waiver']) expect(holdInfo({ hold_reason: reason }).holdReason).toBe(reason);
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

  it('never tells a child about a fee: payment, office and assistance holds and offers are left out of their view (P30)', () => {
    const held = { holdReason: 'payment' as const, holdUntil: 'T', offered: true, registrationId: null, trackId: null };
    expect(holdForViewer(held, true)).toEqual(held);
    expect(holdForViewer(held, false)).toEqual({ ...held, holdReason: null, holdUntil: null, offered: false });
    expect(holdForViewer({ ...held, holdReason: 'assistance' }, false).holdReason).toBeNull();
    expect(holdForViewer({ ...held, holdReason: 'office_payment' }, false).holdReason).toBeNull();
    expect(holdForViewer({ ...held, holdReason: 'membership' }, false).holdReason).toBe('membership');
    expect(holdForViewer({ ...held, holdReason: 'waiver' }, false).holdReason).toBe('waiver');
    expect(enrollmentStatus('requested', held, { adult: false }).key).toBe('reg.status.requested');
    expect(enrollmentStatus('waitlisted', held, { adult: false }).key).toBe('reg.status.waitlistedChild');
  });

  const pledge = (over: Partial<FeePledge> = {}): FeePledge => ({ id: 'pl', number: 'JSH-PL-1', amountCents: 11700, paidCents: 0, status: 'open', dueOn: '2026-09-20', enrollmentId: 'e-dev', ...over });

  it("sums an enrollment's fee from its pledges (source pathshala_fee, source_ref_id = the enrollment); cancelled and written-off ones do not count", () => {
    expect(feeSummary([])).toEqual({ kind: 'none' });
    expect(feeSummary([pledge({ status: 'cancelled' })])).toEqual({ kind: 'none' });
    expect(feeSummary([pledge({ status: 'paid', paidCents: 11700 })])).toEqual({ kind: 'paid', totalCents: 11700 });
    expect(feeSummary([pledge()])).toEqual({ kind: 'due', totalCents: 11700, openCents: 11700, paidCents: 0, dueOn: '2026-09-20', pledgeIds: ['pl'] });
    // A second pledge on one enrollment (a move to a dearer level, 0592): both count, the earliest open due date first.
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
      { id: 'e-riya', personId: ID.riya, registrationId: 'reg-1', heldForPayment: true, pledges: [pledge({ id: 'p1', amountCents: 13000, enrollmentId: 'e-riya' })] },
      { id: 'e-dev', personId: ID.dev, registrationId: 'reg-1', heldForPayment: true, pledges: [pledge({ id: 'p2', enrollmentId: 'e-dev' })] },
      { id: 'e-anya', personId: ID.anya, registrationId: 'reg-1', heldForPayment: true, pledges: [] },
      { id: 'e-mira', personId: ID.mira, registrationId: 'reg-2', heldForPayment: false, pledges: [pledge({ id: 'p4', amountCents: 5000, enrollmentId: 'e-mira' })] },
      { id: 'e-raj', personId: ID.raj, registrationId: 'reg-2', heldForPayment: false, pledges: [pledge({ id: 'p5', status: 'paid', paidCents: 11700 })] },
    ];
    expect(payGroup(rows, rows[1])).toEqual({ pledgeIds: ['p1', 'p2'], amountCents: 24700, personIds: [ID.riya, ID.dev] });
    expect(payGroup(rows, rows[3])).toEqual({ pledgeIds: ['p4'], amountCents: 5000, personIds: [ID.mira] });
    expect(payGroup(rows, rows[4])).toBeNull();
    expect(payGroup(rows, rows[2])).toEqual({ pledgeIds: ['p1', 'p2'], amountCents: 24700, personIds: [ID.riya, ID.dev] });
  });
});

describe('the words', () => {
  it('has every key the rules name', () => {
    const keys: StringKey[] = [
      ...Object.values(SUGGESTION_KEY),
      ...(['placed', 'active', 'completed', 'withdrawn', 'waitlisted'] as const).map((s) => enrollmentStatus(s, holdInfo({})).key),
      ...(['payment', 'office_payment', 'membership', 'assistance', 'waiver', null] as const).flatMap((r) =>
        [false, true].map((offered) => enrollmentStatus('requested', { ...holdInfo({}), holdReason: r, offered, holdUntil: offered ? null : 'T' }).key),
      ),
    ];
    for (const k of keys) expect(en[k]).toBeTruthy();
  });

  it('never calls a fee a donation or a gift', () => {
    const offenders = Object.entries(en).filter(([k, v]) => k.startsWith('reg.') && /\b(donat|gift|tax)/i.test(v));
    expect(offenders).toEqual([]);
  });
});
