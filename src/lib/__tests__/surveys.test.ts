import { describe, expect, it, jest } from '@jest/globals';

import { isAlreadyAnswered, listCompletedSurveyIds, parseQuestions, parseSubmitResult, readPopupDismissals, rememberPopupDismissed, submitSurvey } from '../api/surveys';
import { AppError, toAppError } from '../errors';

// The fakes are read lazily (inside the factories' closures) so the `mock` prefix rule is all they need.
const mockRpc = jest.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>();
const mockTables: Record<string, { survey_id: string }[]> = {};
const mockPrefs: Record<string, unknown> = {};
let mockWriteFails = false;

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => ({ select: () => ({ eq: async () => ({ data: mockTables[table] ?? [], error: null }) }) }),
  },
}));
jest.mock('../storage', () => ({
  readPref: async (key: string, fallback: unknown) => (key in mockPrefs ? mockPrefs[key] : fallback),
  writePref: async (key: string, value: unknown) => {
    if (mockWriteFails) throw new Error('disk full');
    mockPrefs[key] = value;
  },
}));

describe('survey questions', () => {
  it('reads likert / scale questions as a five-point Poor–Superb scale', () => {
    const qs = parseQuestions([
      { id: 'food', type: 'likert', label: 'Food and bhojanshala' },
      { id: 'venue', type: 'scale', label: 'Venue and parking', options: ['Bad', 'OK', 'Good'] },
      { id: 'overall', type: 'stars', label: 'Overall, how was it?', required: true },
    ]);
    expect(qs[0]).toMatchObject({ type: 'likert', options: ['Poor', 'Fair', 'Good', 'Great', 'Superb'] });
    expect(qs[1]).toMatchObject({ type: 'likert', options: ['Bad', 'OK', 'Good'] });
    expect(qs[2]).toMatchObject({ type: 'rating', required: true });
  });
});


describe('answering a survey', () => {
  it('goes through app.submit_survey with the answers and the anonymous choice', async () => {
    mockRpc.mockResolvedValueOnce({ data: { points: 25, anonymous: true }, error: null });
    const res = await submitSurvey({ surveyId: 's1', answers: { q1: 5, q2: ['a', 'b'] }, anonymous: true });
    expect(mockRpc).toHaveBeenCalledWith('submit_survey', { p_survey: 's1', p_answers: { q1: 5, q2: ['a', 'b'] }, p_anonymous: true });
    expect(res).toEqual({ points: 25, anonymous: true });
  });

  it('refuses an empty answer before calling the server', async () => {
    mockRpc.mockClear();
    await expect(submitSurvey({ surveyId: 's1', answers: {}, anonymous: false })).rejects.toThrow('Please answer at least one question.');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("carries the server's plain-English refusal through, and recognises 'already answered'", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'You already answered this survey. Thank you!', code: 'P0001' } });
    const err = await submitSurvey({ surveyId: 's1', answers: { q1: 1 }, anonymous: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe('You already answered this survey. Thank you!');
    expect(isAlreadyAnswered(err)).toBe(true);

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'This survey is closed.', code: 'P0001' } });
    const closed = await submitSurvey({ surveyId: 's1', answers: { q1: 1 }, anonymous: false }).catch((e: unknown) => e);
    expect((closed as AppError).userMessage).toBe('This survey is closed.');
    expect(isAlreadyAnswered(closed)).toBe(false);
    expect(isAlreadyAnswered(toAppError(new TypeError('Network request failed'), 'send your answers'))).toBe(false);
    expect(isAlreadyAnswered(new Error('You already answered'))).toBe(false);
  });

  it('reads the RPC result defensively', () => {
    expect(parseSubmitResult({ points: 10, anonymous: false })).toEqual({ points: 10, anonymous: false });
    expect(parseSubmitResult({ points: 0, anonymous: true })).toEqual({ points: 0, anonymous: true });
    expect(parseSubmitResult({ points: '10' })).toEqual({ points: 0, anonymous: false });
    expect(parseSubmitResult({ points: -3 })).toEqual({ points: 0, anonymous: false });
    expect(parseSubmitResult(null)).toEqual({ points: 0, anonymous: false });
    expect(parseSubmitResult([1])).toEqual({ points: 0, anonymous: false });
  });
});

describe('which surveys are already answered', () => {
  it('combines survey_completions, older named answers and answers this device remembered', async () => {
    mockTables.survey_completions = [{ survey_id: 'a' }];
    mockTables.survey_responses = [{ survey_id: 'b' }];
    mockPrefs.answeredSurveys = ['c'];
    expect([...(await listCompletedSurveyIds('p1'))].sort()).toEqual(['a', 'b', 'c']);
    delete mockPrefs.answeredSurveys;
    mockTables.survey_completions = [];
    mockTables.survey_responses = [];
    expect((await listCompletedSurveyIds('p1')).size).toBe(0);
  });
});

describe('remembering a closed pop-up on this device', () => {
  it('stores the day per survey and reads it back', async () => {
    delete mockPrefs.surveyPopupDismissed;
    expect(await readPopupDismissals()).toEqual({});
    expect(await rememberPopupDismissed('s1', '2026-09-21')).toBe(true);
    expect(await rememberPopupDismissed('s2', '2026-09-21')).toBe(true);
    expect(await readPopupDismissals()).toEqual({ s1: '2026-09-21', s2: '2026-09-21' });
  });

  it('reports a storage failure instead of throwing, so the caller can keep the pop-up closed for the session', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockWriteFails = true;
    expect(await rememberPopupDismissed('s3', '2026-09-21')).toBe(false);
    expect(log).toHaveBeenCalled();
    mockWriteFails = false;
    log.mockRestore();
  });
});
