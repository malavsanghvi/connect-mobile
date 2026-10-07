import { describe, expect, it, jest } from '@jest/globals';

import { chooseOfficePayment, loadRegistrationOptions, pathshalaError, previewRegistration, registerLearners } from '../api/pathshala';
import { AppError } from '../errors';
import { registerRoute } from '../pathshala-registration';

type Result = { data: unknown; error: unknown };
const mockRpc = jest.fn<(name: string, args: unknown) => Promise<Result>>();

jest.mock('../supabase', () => ({
  supabase: { rpc: (name: string, args: unknown) => mockRpc(name, args) },
}));

const options = {
  term: { id: 't1', name: '2026-27', payment_mode: 'pledge', window: { state: 'open' } },
  household: { id: 'h1', name: 'Shah household', number: 'JSH-H-2041', membership: 'active' },
  households: [],
  learners: [{ person_id: 'p1', first_name: 'Dev', age_on_cutoff: 9, counts_as_child: true }],
  tracks: [{ id: 'tr1', key: 'jainism', name: 'Jainism', levels: [{ id: 'l1', name: 'Jainism 2', fee_cents: 13000, seats: 'open' }] }],
  can_register: true,
  cannot_reason: null,
};

const result = {
  registration_id: 'r1',
  lines: [{ person_id: 'p1', track_id: 'tr1', level_id: 'l1', learner_kind: 'child', outcome: 'seat', base_fee_cents: 13000, total_cents: 13000, enrollment_id: 'e1', pledge: { id: 'pl1', number: 'JSH-PL-1', due_on: '2026-09-20' } }],
  children_total_cents: 13000,
  adults_total_cents: 0,
  total_cents: 13000,
  pay: null,
  pending: [],
};

function quiet(): jest.SpiedFunction<typeof console.error> {
  return jest.spyOn(console, 'error').mockImplementation(() => undefined);
}

describe('loading the registration options', () => {
  it('asks app.pathshala_registration_options for the term and household and reads the answer', async () => {
    mockRpc.mockResolvedValueOnce({ data: options, error: null });
    const res = await loadRegistrationOptions('t1', 'h1');
    expect(mockRpc).toHaveBeenLastCalledWith('pathshala_registration_options', { p_term: 't1', p_household: 'h1' });
    expect(res.kind).toBe('answered');
    if (res.kind === 'answered') expect(res.options.learners[0].firstName).toBe('Dev');
  });

  it('is "missing" against a database without the function (the simple form is used), logged once', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function app.pathshala_registration_options(p_household, p_term) in the schema cache' } });
    expect(await loadRegistrationOptions('t1', 'h1')).toEqual({ kind: 'missing' });
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function app.pathshala_registration_options(uuid, uuid) does not exist' } });
    expect(await loadRegistrationOptions('t1', 'h1')).toEqual({ kind: 'missing' });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('fails in plain English when the answer cannot be had or is not one', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    let err = await loadRegistrationOptions('t1', 'h1').catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't load Pathshala registration. Check your internet connection and try again.");
    mockRpc.mockResolvedValueOnce({ data: { term: { id: 't1', name: 'x', payment_mode: 'barter' }, household: { id: 'h1' } }, error: null });
    err = await loadRegistrationOptions('t1', 'h1').catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't load Pathshala registration — the answer was not what we expected. Please try again.");
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Only an adult of the family can register learners.' } });
    err = await loadRegistrationOptions('t1', 'h1').catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Only an adult of the family can register learners.');
    log.mockRestore();
  });
});

describe('preview and registration', () => {
  const learners = [{ person_id: 'p1', track_id: 'tr1', level_id: 'l1', note: null, assistance_requested: false }];

  it('previews with p_term, p_household and p_learners', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ...result, registration_id: null, lines: [{ ...result.lines[0], enrollment_id: undefined, pledge: undefined }] }, error: null });
    const r = await previewRegistration({ termId: 't1', householdId: 'h1', learners });
    expect(mockRpc).toHaveBeenLastCalledWith('preview_pathshala_registration', { p_term: 't1', p_household: 'h1', p_learners: learners });
    expect(r.totalCents).toBe(13000);
  });

  it('registers with every argument of the contract, and reads the pledges it made', async () => {
    mockRpc.mockResolvedValueOnce({ data: result, error: null });
    const r = await registerLearners({ termId: 't1', householdId: 'h1', learners, expectedTotalCents: 13000, expectedOutcomes: [{ person_id: 'p1', track_id: 'tr1', level_id: 'l1', outcome: 'seat' }], waiverDocumentId: 'doc-1', clientKey: 'key-1' });
    expect(mockRpc).toHaveBeenLastCalledWith('register_pathshala_children', {
      p_term: 't1',
      p_household: 'h1',
      p_learners: learners,
      p_expected_total_cents: 13000,
      p_expected_outcomes: [{ person_id: 'p1', track_id: 'tr1', level_id: 'l1', outcome: 'seat' }],
      p_waiver_document: 'doc-1',
      p_client_key: 'key-1',
    });
    expect(r.lines[0].pledge?.number).toBe('JSH-PL-1');
  });

  it("passes the database's refusal on as it is, with its code, so the screen can route it", async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'The fee changed since you looked; please review the new total.' } });
    const err = await registerLearners({ termId: 't1', householdId: 'h1', learners, expectedTotalCents: 1, expectedOutcomes: [], waiverDocumentId: null, clientKey: 'k' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe('The fee changed since you looked; please review the new total.');
    expect(registerRoute(err)).toBe('review');
    log.mockRestore();
  });

  it('says plainly when the database cannot register yet, keeping the code that sends the family to the simple form', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function app.register_pathshala_children' } });
    const err = await registerLearners({ termId: 't1', householdId: 'h1', learners, expectedTotalCents: 1, expectedOutcomes: [], waiverDocumentId: null, clientKey: 'k' }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("Registering in the app isn't available in your community yet. You can send a request to the Pathshala office instead.");
    expect(registerRoute(err)).toBe('missing');
    log.mockRestore();
  });

  it('never claims a registration it cannot read: says where to look before registering again', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: { lines: [{ outcome: 'seat' }] }, error: null });
    const err = await registerLearners({ termId: 't1', householdId: 'h1', learners, expectedTotalCents: 1, expectedOutcomes: [], waiverDocumentId: null, clientKey: 'k' }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't confirm your registration. Look under Jain Way › 3L › Learn before you register again.");
    log.mockRestore();
  });

  it('moves the payment to the office for a registration', async () => {
    mockRpc.mockResolvedValueOnce({ data: { hold_until: '2026-08-27T18:00:00-05:00' }, error: null });
    await chooseOfficePayment('r1');
    expect(mockRpc).toHaveBeenLastCalledWith('choose_pathshala_office_payment', { p_registration: 'r1' });
  });
});

describe('refusal sentences', () => {
  it("shows the database's own sentence, never Postgres' own words", () => {
    const log = quiet();
    expect(pathshalaError({ code: '22023', message: 'Registration closed on Sep 14' }, 'register').userMessage).toBe('Registration closed on Sep 14.');
    expect(pathshalaError({ code: '42501', message: 'permission denied for function register_pathshala_children' }, 'register for Pathshala').userMessage).toBe(
      "You don't have permission to register for Pathshala. If you think this is a mistake, please contact the office.",
    );
    expect(pathshalaError({ code: '22023', message: 'new row for relation "pledges" violates check constraint' }, 'register for Pathshala').code).toBe('22023');
    log.mockRestore();
  });
});
