import { describe, expect, it, jest } from '@jest/globals';

import { chooseOfficePayment, enrollmentHolds, loadRegistrationOptions, pathshalaError, previewRegistration, registerLearners, termAllowsOffice, withoutFeeColumns } from '../api/pathshala';
import { AppError } from '../errors';
import { errorHint, registerRoute, RegistrationRefusal } from '../pathshala-registration';

import { ID, optionsRaw, ownerLines, postgrestError, previewRaw, registerRaw } from './pathshala-fixtures';

type Result = { data: unknown; error: unknown };
const mockRpc = jest.fn<(name: string, args: unknown) => Promise<Result>>();
const mockFrom = jest.fn<(table: string, columns: string, ids: string[]) => Promise<Result>>();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => ({ select: (columns: string) => ({ in: (_column: string, ids: string[]) => mockFrom(table, columns, ids) }) }),
  },
}));

function quiet(): jest.SpiedFunction<typeof console.error> {
  return jest.spyOn(console, 'error').mockImplementation(() => undefined);
}

const learners = [
  { person_id: ID.riya, track_id: ID.jainism, level_id: ID.j5, note: null, assistance_requested: false },
  { person_id: ID.dev, track_id: ID.jainism, level_id: ID.j2, note: null, assistance_requested: false },
];

describe('loading the registration options', () => {
  it('asks app.pathshala_registration_options for the term and household and reads the answer', async () => {
    mockRpc.mockResolvedValueOnce({ data: optionsRaw('pledge'), error: null });
    const res = await loadRegistrationOptions(ID.term, ID.household);
    expect(mockRpc).toHaveBeenLastCalledWith('pathshala_registration_options', { p_term: ID.term, p_household: ID.household });
    expect(res.kind).toBe('answered');
    if (res.kind === 'answered') expect(res.options.learners.map((l) => l.firstName)).toEqual(['Riya', 'Dev', 'Anya', 'Mira', 'Raj']);
  });

  it("names no household when it has none: the database answers for the caller's own (primary) household", async () => {
    mockRpc.mockResolvedValueOnce({ data: optionsRaw('pay_now'), error: null });
    const res = await loadRegistrationOptions(ID.term, null);
    expect(mockRpc).toHaveBeenLastCalledWith('pathshala_registration_options', { p_term: ID.term });
    expect(res.kind === 'answered' && res.options.household.id).toBe(ID.household);
  });

  it('is "missing" against a database without the function (the simple form is used), logged once', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: postgrestError('PGRST202', 'Could not find the function app.pathshala_registration_options(p_household, p_term) in the schema cache') });
    expect(await loadRegistrationOptions(ID.term, ID.household)).toEqual({ kind: 'missing' });
    mockRpc.mockResolvedValueOnce({ data: null, error: postgrestError('42883', 'function app.pathshala_registration_options(uuid, uuid) does not exist') });
    expect(await loadRegistrationOptions(ID.term, ID.household)).toEqual({ kind: 'missing' });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('fails in plain English when the answer cannot be had or is not one', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    let err = await loadRegistrationOptions(ID.term, ID.household).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't load Pathshala registration. Check your internet connection and try again.");
    mockRpc.mockResolvedValueOnce({ data: { term: { id: ID.term, name: 'x', payment_mode: 'barter' }, household: { id: ID.household } }, error: null });
    err = await loadRegistrationOptions(ID.term, ID.household).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't load Pathshala registration — the answer was not what we expected. Please try again.");
    log.mockRestore();
  });

  it("shows the database's own sentences when it refuses (a family it does not know, a term that is not there)", async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: postgrestError('42501', 'Only an adult of the family can register its learners.') });
    let err = await loadRegistrationOptions(ID.term, ID.household).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Only an adult of the family can register its learners.');
    mockRpc.mockResolvedValueOnce({ data: null, error: postgrestError('P0002', 'That term was not found.') });
    err = await loadRegistrationOptions(ID.term, ID.household).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('That term was not found.');
    log.mockRestore();
  });
});

describe('preview and registration', () => {
  it('previews with p_term, p_household and p_learners', async () => {
    mockRpc.mockResolvedValueOnce({ data: previewRaw('pledge', ownerLines('cap')), error: null });
    const r = await previewRegistration({ termId: ID.term, householdId: ID.household, learners });
    expect(mockRpc).toHaveBeenLastCalledWith('preview_pathshala_registration', { p_term: ID.term, p_household: ID.household, p_learners: learners });
    expect(r.totalCents).toBe(32500);
    expect(r.registrationId).toBeNull();
  });

  it('registers with every argument of 0591 and reads the pledges it made', async () => {
    mockRpc.mockResolvedValueOnce({ data: registerRaw('pledge', ownerLines('cap')), error: null });
    const outcomes = [
      { person_id: ID.riya, track_id: ID.jainism, level_id: ID.j5, outcome: 'seat' },
      { person_id: ID.dev, track_id: ID.jainism, level_id: ID.j2, outcome: 'seat' },
    ];
    const r = await registerLearners({ termId: ID.term, householdId: ID.household, learners, expectedTotalCents: 32500, expectedOutcomes: outcomes, waiverDocumentId: ID.waiver, clientKey: 'b3a5c6e0-1c1f-4a7e-9a52-3f8f7a2d9c11' });
    expect(mockRpc).toHaveBeenLastCalledWith('register_pathshala_children', {
      p_term: ID.term,
      p_household: ID.household,
      p_learners: learners,
      p_expected_total_cents: 32500,
      p_expected_outcomes: outcomes,
      p_waiver_document: ID.waiver,
      p_client_key: 'b3a5c6e0-1c1f-4a7e-9a52-3f8f7a2d9c11',
    });
    expect(r.lines[0].pledge).toEqual({ id: 'pl-1', number: 'JSH-PL-20113', dueOn: '2026-09-20', amountCents: 13000 });
    expect(r.paymentMode).toBe('pledge');
  });

  it('sends no waiver when none is published (null), and the same key again returns the first answer (replayed)', async () => {
    mockRpc.mockResolvedValueOnce({ data: registerRaw('pledge', ownerLines('cap'), { replayed: true }), error: null });
    const r = await registerLearners({ termId: ID.term, householdId: ID.household, learners, expectedTotalCents: 32500, expectedOutcomes: [], waiverDocumentId: null, clientKey: 'b3a5c6e0-1c1f-4a7e-9a52-3f8f7a2d9c11' });
    expect(mockRpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_waiver_document: null });
    expect(r.replayed).toBe(true);
  });

  it('routes a changed fee or seat back to the review by the hint, keeping the database\'s sentence', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: postgrestError('22023', 'The fee changed since you looked; please review the new total ($337.50).', 'review_again') });
    const err = await registerLearners({ termId: ID.term, householdId: ID.household, learners, expectedTotalCents: 32500, expectedOutcomes: [], waiverDocumentId: null, clientKey: 'k-12345678' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RegistrationRefusal);
    expect((err as AppError).userMessage).toBe('The fee changed since you looked; please review the new total ($337.50).');
    expect((err as AppError).code).toBe('22023');
    expect(errorHint(err)).toBe('review_again');
    expect(registerRoute(err)).toBe('review');
    log.mockRestore();
  });

  it('shows any other refusal where the family pressed Register, never routed by its words', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: postgrestError('22023', 'Please review the waiver before you register.') });
    const err = await registerLearners({ termId: ID.term, householdId: ID.household, learners, expectedTotalCents: 1, expectedOutcomes: [], waiverDocumentId: null, clientKey: 'k-12345678' }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Please review the waiver before you register.');
    expect(registerRoute(err)).toBe('refused');
    log.mockRestore();
  });

  it('says plainly when the database cannot register yet, keeping the code that sends the family to the simple form', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: postgrestError('PGRST202', 'Could not find the function app.register_pathshala_children') });
    const err = await registerLearners({ termId: ID.term, householdId: ID.household, learners, expectedTotalCents: 1, expectedOutcomes: [], waiverDocumentId: null, clientKey: 'k-12345678' }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("Registering in the app isn't available in your community yet. You can send a request to the Pathshala office instead.");
    expect(registerRoute(err)).toBe('missing');
    log.mockRestore();
  });

  it('never claims a registration it cannot read: says where to look before registering again', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: { lines: [{ outcome: 'seat' }] }, error: null });
    const err = await registerLearners({ termId: ID.term, householdId: ID.household, learners, expectedTotalCents: 1, expectedOutcomes: [], waiverDocumentId: null, clientKey: 'k-12345678' }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't confirm your registration. Look under Jain Way › 3L › Learn before you register again.");
    log.mockRestore();
  });

  it('moves the payment to the office for a registration and reads what the database answers', async () => {
    mockRpc.mockResolvedValueOnce({ data: { registration_id: ID.registration, hold_until: '2026-08-27T18:00:00-05:00', amount_cents: 32500, pledge_ids: ['pl-1', 'pl-2'], office_hold_days: 7 }, error: null });
    const choice = await chooseOfficePayment(ID.registration);
    expect(mockRpc).toHaveBeenLastCalledWith('choose_pathshala_office_payment', { p_registration: ID.registration });
    expect(choice).toEqual({ holdUntil: '2026-08-27T18:00:00-05:00', amountCents: 32500, pledgeIds: ['pl-1', 'pl-2'] });
  });

  it("shows the database's refusal when the term takes the fee online only", async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: postgrestError('22023', '2026-27 takes the fee online only. Ask the Pathshala office if you cannot pay online.') });
    const err = await chooseOfficePayment(ID.registration).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('2026-27 takes the fee online only. Ask the Pathshala office if you cannot pay online.');
    log.mockRestore();
  });
});

describe('refusal sentences', () => {
  it("shows the database's own sentence, with a final period, never Postgres' own words", () => {
    const log = quiet();
    expect(pathshalaError(postgrestError('22023', 'Registration closed on Sep 14'), 'register').userMessage).toBe('Registration closed on Sep 14.');
    expect(pathshalaError(postgrestError('42501', 'permission denied for function register_pathshala_children'), 'register for Pathshala').userMessage).toBe(
      "You don't have permission to register for Pathshala. If you think this is a mistake, please contact the office.",
    );
    expect(pathshalaError(postgrestError('22023', 'new row for relation "pledges" violates check constraint'), 'register for Pathshala').code).toBe('22023');
    log.mockRestore();
  });

  it("passes on the database's plain sentences as they come (0590 and 0591)", () => {
    const log = quiet();
    const sentences = [
      'Agree to the Pathshala waiver to register.',
      'The Pathshala waiver was updated: read the new version and agree to it to register.',
      'Dev still has a Pathshala fee for Jainism in 2026-27 from an earlier registration. Ask the Pathshala office.',
      'Dev is already registered for Jainism in 2026-27 (seat held for payment).',
      'Riya is already registered for Jainism in 2026-27 (waiting for membership).',
      'Jainism 5 is full and has no waitlist. Ask the Pathshala office.',
      'Adult class (Moms) is for adults, and Anya is 4.',
      "Give the new child's first and last name.",
      'Choose a level for Dev: in 2026-27 the fee is paid when you register. Not sure? Keep the suggested level: the teacher can move Dev in the first weeks.',
      'Register at most 12 learners at a time.',
    ];
    for (const message of sentences) {
      const err = pathshalaError(postgrestError('22023', message), 'register for Pathshala');
      expect(err.userMessage).toBe(message);
      expect(registerRoute(err)).toBe('refused');
    }
    log.mockRestore();
  });
});

describe('the one place the hold columns are read (the adapter)', () => {
  const requested = (id: string, over: Record<string, unknown> = {}) => ({ id, status: 'requested', hold_expires_at: null, offered_at: null, registration_id: ID.registration, track_id: ID.jainism, ...over });

  it("asks the fee line why a household's seats wait (0591 keeps hold_reason there, a child never reads it) and reads the rest from the row", async () => {
    mockFrom.mockResolvedValueOnce({
      data: [
        { enrollment_id: 'f1', hold_reason: 'payment' },
        { enrollment_id: 'f2', hold_reason: 'membership' },
        { enrollment_id: 'f3', hold_reason: null },
      ],
      error: null,
    });
    const holds = await enrollmentHolds([requested('f1', { hold_expires_at: '2026-08-22T23:00:00Z', offered_at: '2026-08-20T10:00:00Z' }), requested('f2'), requested('f3'), { id: 'f4', status: 'placed' }], { adult: true });
    expect(mockFrom).toHaveBeenLastCalledWith('pathshala_enrollment_fees', 'enrollment_id, hold_reason', ['f1', 'f2', 'f3']);
    expect(holds.get('f1')).toEqual({ holdReason: 'payment', holdUntil: '2026-08-22T23:00:00Z', offered: true, registrationId: ID.registration, trackId: ID.jainism });
    expect(holds.get('f2')?.holdReason).toBe('membership');
    expect(holds.get('f3')?.holdReason).toBeNull();
    expect(holds.get('f4')?.holdReason).toBeNull();
  });

  it('asks nothing for a child, or when no seat waits, or when the row still has the reason', async () => {
    mockFrom.mockClear();
    await enrollmentHolds([requested('c1')], { adult: false });
    await enrollmentHolds([{ id: 'c2', status: 'placed' }, { id: 'c3', status: 'waitlisted' }], { adult: true });
    await enrollmentHolds([requested('c4', { hold_reason: 'office_payment' })], { adult: true });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('shows no seat as held before the fee line is deployed (logged once), and fails in plain English for any other error', async () => {
    const log = quiet();
    mockFrom.mockResolvedValueOnce({ data: null, error: postgrestError('PGRST205', "Could not find the table 'app.pathshala_enrollment_fees' in the schema cache") });
    expect((await enrollmentHolds([requested('m1')], { adult: true })).get('m1')?.holdReason).toBeNull();
    mockFrom.mockResolvedValueOnce({ data: null, error: postgrestError('42P01', 'relation "app.pathshala_enrollment_fees" does not exist') });
    await enrollmentHolds([requested('m2')], { adult: true });
    expect(log).toHaveBeenCalledTimes(1);
    mockFrom.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    const err = await enrollmentHolds([requested('m3')], { adult: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    log.mockRestore();
  });

  const rows = [
    { id: 'e1', hold_reason: 'payment', hold_expires_at: '2026-08-22T23:00:00Z', offered_at: '2026-08-20T10:00:00Z', registration_id: ID.registration, track_id: ID.jainism },
    { id: 'e2', hold_reason: 'membership', hold_expires_at: null, offered_at: null, registration_id: ID.registration, track_id: ID.gujarati },
    { id: 'e3', hold_reason: 'assistance', hold_expires_at: null, offered_at: null, registration_id: ID.registration, track_id: ID.jainism },
    { id: 'e4', hold_reason: 'office_payment', hold_expires_at: '2026-08-27T23:00:00Z', offered_at: null, registration_id: ID.registration, track_id: ID.jainism },
    { id: 'e5', hold_reason: 'waiver', hold_expires_at: null, offered_at: null, registration_id: null, track_id: ID.jainism },
    { id: 'e6' },
  ];

  it("gives an adult of the household everything: why, until when, an offer from the waitlist, the registration", async () => {
    const holds = await enrollmentHolds(rows, { adult: true });
    expect(holds.get('e1')).toEqual({ holdReason: 'payment', holdUntil: '2026-08-22T23:00:00Z', offered: true, registrationId: ID.registration, trackId: ID.jainism });
    expect(holds.get('e3')?.holdReason).toBe('assistance');
    expect(holds.get('e4')).toMatchObject({ holdReason: 'office_payment', holdUntil: '2026-08-27T23:00:00Z' });
    expect(holds.get('e6')).toEqual({ holdReason: null, holdUntil: null, offered: false, registrationId: null, trackId: null });
  });

  it('never tells a child about a fee: payment, office and assistance holds and offers are dropped; membership and waiver stay (P30)', async () => {
    const holds = await enrollmentHolds(rows, { adult: false });
    expect(holds.get('e1')).toMatchObject({ holdReason: null, holdUntil: null, offered: false });
    expect(holds.get('e3')?.holdReason).toBeNull();
    expect(holds.get('e4')).toMatchObject({ holdReason: null, holdUntil: null });
    expect(holds.get('e2')?.holdReason).toBe('membership');
    expect(holds.get('e5')?.holdReason).toBe('waiver');
  });

  it('keeps the fee columns off the row a screen holds (the hold is read through the adapter, never from the row)', () => {
    const row = { id: 'e1', status: 'requested', hold_reason: 'assistance', withdrawal_reason: 'Moving away', hold_expires_at: '2026-08-22T23:00:00Z', offered_at: null, track_id: ID.jainism };
    expect(withoutFeeColumns(row)).toEqual({ id: 'e1', status: 'requested', hold_expires_at: '2026-08-22T23:00:00Z', offered_at: null, track_id: ID.jainism });
    expect(row.hold_reason).toBe('assistance');
  });

  it('reads whether a term lets a family pay at the office (pathshala_terms.office_payment_allowed)', () => {
    expect(termAllowsOffice({ office_payment_allowed: true })).toBe(true);
    expect(termAllowsOffice({ office_payment_allowed: false })).toBe(false);
    expect(termAllowsOffice({})).toBe(false);
  });
});
