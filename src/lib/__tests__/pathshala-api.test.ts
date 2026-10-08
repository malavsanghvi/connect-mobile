import { describe, expect, it, jest } from '@jest/globals';

import { chooseOfficePayment, loadEnrollmentDetails, loadHeldSeats, loadRegistrationOptions, pathshalaError, previewRegistration, registerLearners } from '../api/pathshala';
import { AppError } from '../errors';
import { errorHint, registerRoute, RegistrationRefusal } from '../pathshala-registration';

import { childEnrollmentRaw, enrollmentRaw, ID, optionsRaw, ownerLines, postgrestError, previewRaw, registerRaw } from './pathshala-fixtures';

type Result = { data: unknown; error: unknown };
const mockRpc = jest.fn<(name: string, args: unknown) => Promise<Result>>();
const mockFrom = jest.fn<(table: string) => Promise<Result>>();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in']) chain[m] = () => chain;
      chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => mockFrom(table).then(resolve, reject);
      return chain;
    },
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

describe('where a seat stands comes from the options (one call for each term), never from the tables', () => {
  const NOW = new Date('2026-08-20T12:00:00Z');
  const learner = (id: string, name: string, enrollments: Record<string, unknown>[], over: Record<string, unknown> = {}) => ({ person_id: id, first_name: name, age_on_cutoff: 9, counts_as_child: true, enrollments, suggested: [], ...over });
  const held = (id: string, over: Record<string, unknown> = {}) =>
    enrollmentRaw({
      enrollment_id: id,
      status: 'requested',
      hold_reason: 'payment',
      hold_expires_at: '2026-08-22T18:00:00-05:00',
      fee: { status: 'billed', total_cents: 13000, priced: true, assistance_requested: false, pledge: { id: `pl-${id}`, number: `N-${id}`, amount_cents: 13000, paid_cents: 3000, status: 'partially_paid', due_on: '2026-08-20' } },
      ...over,
    });
  const optionsFor = (learners: Record<string, unknown>[]) => optionsRaw('pay_now', { learners });
  const tables = (data: Record<string, unknown[]>) => mockFrom.mockImplementation((table) => Promise.resolve({ data: data[table] ?? [], error: null }));

  it('lists every enrollment of the household with its hold, fee pledge and sentence, from one options call for each term', async () => {
    mockRpc.mockResolvedValueOnce({
      data: optionsFor([
        learner(ID.riya, 'Riya', [held('e1')]),
        learner(ID.dev, 'Dev', [enrollmentRaw({ enrollment_id: 'e2', status: 'waitlisted', waitlist_position: 2, fee: null, registration_id: null, state: 'on the waitlist for Jainism 5 (number 2), no charge unless a seat opens' })]),
      ]),
      error: null,
    });
    const details = await loadEnrollmentDetails(ID.household, [{ id: ID.term, name: '2026-27' }]);
    expect(mockRpc).toHaveBeenLastCalledWith('pathshala_registration_options', { p_term: ID.term, p_household: ID.household });
    expect([...details.keys()]).toEqual(['e1', 'e2']);
    expect(details.get('e1')).toMatchObject({
      personId: ID.riya,
      termId: ID.term,
      termName: '2026-27',
      status: 'requested',
      hold: { holdReason: 'payment', holdUntil: '2026-08-22T18:00:00-05:00', offered: false, registrationId: ID.registration, waitlistPosition: null },
      officeAllowed: true,
    });
    // What is left to pay is the pledge's amount less what was paid.
    expect(details.get('e1')?.pledges).toEqual([{ id: 'pl-e1', number: 'N-e1', amountCents: 13000, paidCents: 3000, status: 'partially_paid', dueOn: '2026-08-20', enrollmentId: 'e1' }]);
    expect(details.get('e2')).toMatchObject({ status: 'waitlisted', hold: { waitlistPosition: 2 }, pledges: [], fee: null });
  });

  it('asks the options once for each term and reads no hold or fee column from any table', async () => {
    mockRpc.mockReset();
    mockFrom.mockClear();
    mockRpc.mockImplementation((_name, args) => Promise.resolve({ data: optionsRaw('pledge', { term: { ...(optionsRaw('pledge').term as object), id: (args as { p_term: string }).p_term } }), error: null }));
    await loadEnrollmentDetails(ID.household, [
      { id: 't-a', name: 'A' },
      { id: 't-b', name: 'B' },
    ]);
    expect(mockRpc.mock.calls.map((c) => [c[0], (c[1] as { p_term: string }).p_term])).toEqual([
      ['pathshala_registration_options', 't-a'],
      ['pathshala_registration_options', 't-b'],
    ]);
    expect(mockFrom).not.toHaveBeenCalled();
    mockRpc.mockReset();
  });

  it("a child's answer carries none of it: no reason, no sentence, no fee, no pledge", async () => {
    mockRpc.mockResolvedValueOnce({ data: optionsFor([learner(ID.dev, 'Dev', [childEnrollmentRaw({ enrollment_id: 'c1', status: 'requested', hold_expires_at: '2026-08-22T18:00:00-05:00' })])]), error: null });
    const details = await loadEnrollmentDetails(ID.household, [{ id: ID.term, name: '2026-27' }]);
    expect(details.get('c1')).toMatchObject({ hold: { holdReason: null, registrationId: null }, withdrawalReason: null, state: null, fee: null, pledges: [] });
  });

  it('has nothing to say about a database without the options, or a term the caller may not see', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: postgrestError('PGRST202', 'Could not find the function app.pathshala_registration_options') });
    mockRpc.mockResolvedValueOnce({ data: null, error: postgrestError('P0002', 'That term was not found.') });
    const details = await loadEnrollmentDetails(ID.household, [
      { id: 't-a', name: 'A' },
      { id: 't-b', name: 'B' },
    ]);
    expect(details.size).toBe(0);
    log.mockRestore();
  });

  it('fails in plain English for any other failure (never a silent empty list)', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    const err = await loadEnrollmentDetails(ID.household, [{ id: ID.term, name: '2026-27' }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    log.mockRestore();
  });

  it("keeps a released seat's sentence for the adults (withdrawal_reason)", async () => {
    mockRpc.mockResolvedValueOnce({
      data: optionsFor([learner(ID.riya, 'Riya', [enrollmentRaw({ enrollment_id: 'w1', status: 'withdrawn', withdrawal_reason: 'The fee was not paid by Thu Oct 8, 6:00 pm, so the seat was released.', hold_reason: null, fee: null })])]),
      error: null,
    });
    const details = await loadEnrollmentDetails(ID.household, [{ id: ID.term, name: '2026-27' }]);
    expect(details.get('w1')?.withdrawalReason).toBe('The fee was not paid by Thu Oct 8, 6:00 pm, so the seat was released.');
  });

  it('Home: only the seats held for payment that are still live, with their pledges, from the terms that have a seat waiting', async () => {
    tables({
      pathshala_enrollments: [
        { id: 'e1', term_id: ID.term },
        { id: 'e2', term_id: ID.term },
      ],
      pathshala_terms: [{ id: ID.term, name: '2026-27' }],
    });
    mockRpc.mockResolvedValueOnce({
      data: optionsFor([
        learner(ID.riya, 'Riya', [held('e1')]),
        learner(ID.dev, 'Dev', [held('e2', { hold_reason: 'office_payment', hold_expires_at: '2026-08-27T18:00:00-05:00', offered_at: '2026-08-20T08:00:00-05:00' })]),
        learner(ID.anya, 'Anya', [held('e3', { hold_reason: 'assistance', hold_expires_at: null })]),
        learner(ID.raj, 'Raj', [held('e4', { hold_expires_at: '2026-08-19T18:00:00-05:00' })]),
        learner(ID.mira, 'Mira', [held('e5', { status: 'placed', hold_reason: null, hold_expires_at: null })]),
      ]),
      error: null,
    });
    mockFrom.mockClear();
    const seats = await loadHeldSeats(ID.household, NOW);
    expect(seats.map((s) => [s.enrollmentId, s.personId, s.hold.holdReason])).toEqual([
      ['e1', ID.riya, 'payment'],
      ['e2', ID.dev, 'office_payment'],
    ]);
    expect(seats[0]).toMatchObject({ termName: '2026-27', officeAllowed: true, view: { key: 'reg.status.heldUntil', heldForPayment: true } });
    expect(seats[1]).toMatchObject({ hold: { offered: true }, view: { heldForPayment: true } });
    expect(seats[0].pledges.map((p) => [p.id, p.amountCents - p.paidCents])).toEqual([['pl-e1', 10000]]);
    // The only table reads are the ids and terms of the seats that wait, and the terms' names.
    expect(mockFrom.mock.calls.map((c) => c[0])).toEqual(['pathshala_enrollments', 'pathshala_terms']);
  });

  it('Home: no seat waiting means no call at all', async () => {
    mockRpc.mockClear();
    tables({ pathshala_enrollments: [] });
    expect(await loadHeldSeats(ID.household, NOW)).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
