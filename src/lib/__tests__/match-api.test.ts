import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { loadMatchCard, removeMyMatchEmployer, reportMyMatchRequest, setMyMatchEmployer, undoMyMatchRequest } from '../api/match';
import { AppError } from '../errors';

type Result = { data: unknown; error: unknown };
const mockRpc = jest.fn<(name: string, args: Record<string, unknown>) => Promise<Result>>();

jest.mock('../supabase', () => ({ supabase: { rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args) } }));

const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLAIM = '11111111-1111-4111-8111-111111111111';

const rpcError = (message: string, code: string) => ({ data: null, error: { message, code } });
const ok = (data: unknown): Result => ({ data, error: null });

async function failure(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error('it did not fail');
}

beforeEach(() => {
  mockRpc.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('my_match_card', () => {
  it('asks for the card of this community and reads it', async () => {
    mockRpc.mockResolvedValue(ok({ employer: 'Acme Corp', is_adult: true, matching_on: true, gifts: [{ received_on: '2026-10-03', deadline_on: '2026-11-30' }], today: '2026-10-17' }));
    const card = await loadMatchCard(C);
    expect(mockRpc).toHaveBeenCalledWith('my_match_card', { p_center: C });
    expect(card).toMatchObject({ employer: 'Acme Corp', isAdult: true, matchingOn: true, today: '2026-10-17' });
    expect(card.gifts).toEqual([{ receivedOn: '2026-10-03', deadlineOn: '2026-11-30' }]);
  });

  it('shows the database\'s own sentence when the sign-in is not linked to a person here', async () => {
    mockRpc.mockResolvedValue(rpcError('Your sign-in is not linked to a person in this community.', '42501'));
    const err = await failure(loadMatchCard(C));
    expect(err.userMessage).toBe('Could not load your employer match — Your sign-in is not linked to a person in this community.');
  });

  it('says the connection failed in plain words', async () => {
    // supabase-js does not reject on a lost connection: it answers with an error whose message is the fetch failure.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    const err = await failure(loadMatchCard(C));
    expect(err.userMessage).toBe("We couldn't load your employer match. Check your internet connection and try again.");
  });

  it('says so when the database does not have the function yet, and that nothing was changed', async () => {
    mockRpc.mockResolvedValue(rpcError('Could not find the function app.my_match_card(p_center) in the schema cache', 'PGRST202'));
    const err = await failure(loadMatchCard(C));
    expect(err.userMessage).toBe('Could not load your employer match — this is not available yet. Nothing was changed.');
  });

  it('does not accept an answer that is not a card', async () => {
    mockRpc.mockResolvedValue(ok('nothing useful'));
    const err = await failure(loadMatchCard(C));
    expect(err.userMessage).toBe("We couldn't load your employer match — the answer was not what we expected. Please try again.");
  });

  it('logs a request in a state it does not know, and still shows the card', async () => {
    mockRpc.mockResolvedValue(ok({ is_adult: true, matching_on: true, claims: [{ id: 'c1', state: 'something_new' }] }));
    const card = await loadMatchCard(C);
    expect(card.claims).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('set_my_match_employer', () => {
  it('sends the tidied employer and returns the employer now on file', async () => {
    mockRpc.mockResolvedValue(ok({ employer: 'Acme Corp', is_adult: true }));
    await expect(setMyMatchEmployer(C, '  Acme   Corp ')).resolves.toBe('Acme Corp');
    expect(mockRpc).toHaveBeenCalledWith('set_my_match_employer', { p_center: C, p_employer: 'Acme Corp' });
  });

  it('does not ask the database for an empty or too long name, and says why', async () => {
    const empty = await failure(setMyMatchEmployer(C, '   '));
    expect(empty.userMessage).toBe("Type your employer's name first.");
    const long = await failure(setMyMatchEmployer(C, 'x'.repeat(121)));
    expect(long.userMessage).toBe('That name is too long. Please use 120 characters or fewer.');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('shows a refusal in the database\'s words (module off, or an employer from another sign-in)', async () => {
    mockRpc.mockResolvedValue(rpcError('An employer for gift matching is already on file for you, from another sign-in or a paper form. Ask your organization to change or remove it.', '42501'));
    const err = await failure(setMyMatchEmployer(C, 'Acme'));
    expect(err.userMessage).toBe('Could not save your employer — An employer for gift matching is already on file for you, from another sign-in or a paper form. Ask your organization to change or remove it.');
  });

  it('never says it was saved when the answer does not hold the employer', async () => {
    for (const answer of [null, {}, { employer: null }, 'ok']) {
      mockRpc.mockResolvedValueOnce(ok(answer));
      const err = await failure(setMyMatchEmployer(C, 'Acme'));
      expect([answer, err.userMessage]).toEqual([answer, "We couldn't save your employer — the answer was not what we expected. Please try again."]);
    }
  });
});

describe('remove_my_match_employer', () => {
  it('withdraws it and says whether something was on file', async () => {
    mockRpc.mockResolvedValueOnce(ok(true));
    await expect(removeMyMatchEmployer(C)).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('remove_my_match_employer', { p_center: C });
    mockRpc.mockResolvedValueOnce(ok(false));
    await expect(removeMyMatchEmployer(C)).resolves.toBe(false);
  });

  it('fails in words, and does not call an unexpected answer a success', async () => {
    mockRpc.mockResolvedValueOnce(rpcError('Sign in first.', '42501'));
    expect((await failure(removeMyMatchEmployer(C))).userMessage).toBe('Could not remove your employer — Sign in first.');
    mockRpc.mockResolvedValueOnce(ok('yes'));
    expect((await failure(removeMyMatchEmployer(C))).userMessage).toBe("We couldn't remove your employer — the answer was not what we expected. Please try again.");
  });
});

describe('report_my_match_request', () => {
  it('returns how many gifts were marked as asked', async () => {
    mockRpc.mockResolvedValue(ok({ requested: 2 }));
    await expect(reportMyMatchRequest(C)).resolves.toBe(2);
    expect(mockRpc).toHaveBeenCalledWith('report_my_match_request', { p_center: C });
  });

  it('shows the plain sentences the database raises: no gift to claim, no steps yet, no employer', async () => {
    for (const [message, code] of [
      ['You have no gift that can still be claimed. If you already said you asked, it is under your requests.', '22023'],
      ['We do not have the steps for your employer yet, so there is nothing to report. Your organization can add them.', '22023'],
      ['Add your employer first. It is on file only with your consent.', '22023'],
      ['Gift matching is for adults only.', '42501'],
    ] as const) {
      mockRpc.mockResolvedValueOnce(rpcError(message, code));
      const err = await failure(reportMyMatchRequest(C));
      expect(err.userMessage).toBe(`Could not record that you asked your employer — ${message}`);
    }
  });

  it('does not say it worked on an answer that marks no gift', async () => {
    for (const answer of [null, {}, { requested: 0 }, { requested: 'two' }]) {
      mockRpc.mockResolvedValueOnce(ok(answer));
      expect((await failure(reportMyMatchRequest(C))).userMessage).toBe("We couldn't record that you asked your employer — the answer was not what we expected. Please try again.");
    }
  });
});

describe('undo_my_match_request', () => {
  it('takes the request back', async () => {
    mockRpc.mockResolvedValue(ok(true));
    await expect(undoMyMatchRequest(C, CLAIM)).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('undo_my_match_request', { p_center: C, p_claim: CLAIM });
  });

  it('shows why it cannot be taken back, in the database\'s words', async () => {
    mockRpc.mockResolvedValue(rpcError('Your organization has already moved this on, so it cannot be taken back here. Ask them.', '22023'));
    expect((await failure(undoMyMatchRequest(C, CLAIM))).userMessage).toBe('Could not take your request back — Your organization has already moved this on, so it cannot be taken back here. Ask them.');
  });

  it('does not say it was taken back unless the database says so', async () => {
    mockRpc.mockResolvedValue(ok(false));
    expect((await failure(undoMyMatchRequest(C, CLAIM))).userMessage).toBe("We couldn't take your request back — the answer was not what we expected. Please try again.");
  });
});
