import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AppError } from '../errors';
import { storeOrderPledge } from '../api/store';

type Result = { data: unknown; error: unknown };
const mockRpc = jest.fn<(name: string, args: Record<string, unknown>) => Promise<Result>>();

jest.mock('../supabase', () => ({ supabase: { rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args) } }));

const ORDER = '11111111-1111-4111-8111-111111111111';
const PLEDGE = '22222222-2222-4222-8222-222222222222';

let logSpy: jest.SpiedFunction<typeof console.error>;
beforeEach(() => {
  mockRpc.mockReset();
  logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  logSpy.mockRestore();
});

describe('the pledge of a store order (app.store_order_pledge)', () => {
  it('asks for the order\'s pledge and returns its id', async () => {
    mockRpc.mockResolvedValue({ data: PLEDGE, error: null });
    expect(await storeOrderPledge(ORDER)).toBe(PLEDGE);
    expect(mockRpc).toHaveBeenCalledWith('store_order_pledge', { p_order: ORDER });
  });

  it('asking again for the same order is the same call and the same pledge, so a retry never makes a second one', async () => {
    mockRpc.mockResolvedValue({ data: PLEDGE, error: null });
    expect(await storeOrderPledge(ORDER)).toBe(await storeOrderPledge(ORDER));
    expect(mockRpc.mock.calls.map((c) => c[1])).toEqual([{ p_order: ORDER }, { p_order: ORDER }]);
  });

  it('says the database\'s refusal in plain words, with the action in front, and logs it', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'This order is cancelled and cannot take a payment proof.' } });
    const err = await storeOrderPledge(ORDER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe('Could not set up the payment proof for your order — This order is cancelled and cannot take a payment proof.');
    expect(logSpy).toHaveBeenCalled();
  });

  it('says a missing function as "not available yet", and a lost connection as such', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function app.store_order_pledge in the schema cache' } });
    let err = await storeOrderPledge(ORDER).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Could not set up the payment proof for your order — this is not available yet. Nothing was changed.');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    err = await storeOrderPledge(ORDER).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toContain('Check your internet connection');
  });

  it('does not take an answer that is not a pledge id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const err = await storeOrderPledge(ORDER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toMatch(/the answer was not what we expected/);
  });
});
