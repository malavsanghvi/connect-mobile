import { describe, expect, it, jest } from '@jest/globals';

import { loadAccess } from '../api/access';
import { AppError } from '../errors';

const mockRpc = jest.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>();

jest.mock('../supabase', () => ({
  supabase: { rpc: (name: string, args: unknown) => mockRpc(name, args) },
}));

const answer = {
  level: { key: 'community', label: 'Community member', rank: 10 },
  signed_in: true,
  features: {
    darshan: { allowed: true, reason: null, min_level: { key: 'public', label: 'Public', rank: 0 } },
    niva: { allowed: false, reason: 'level', min_level: { key: 'member', label: 'Member', rank: 20 } },
  },
};

describe('asking what the person may use', () => {
  it('calls app.feature_access_for_me for the community and reads the answer', async () => {
    mockRpc.mockResolvedValueOnce({ data: answer, error: null });
    const res = await loadAccess('center-1');
    expect(mockRpc).toHaveBeenCalledWith('feature_access_for_me', { p_center: 'center-1' });
    expect(res.kind).toBe('answered');
    if (res.kind !== 'answered') return;
    expect(res.snapshot.source).toBe('database');
    expect(res.snapshot.features.darshan?.allowed).toBe(true);
    expect(res.snapshot.features.niva).toEqual({ allowed: false, reason: 'level', minLevel: { key: 'member', label: 'Member', rank: 20 } });
  });

  it('says so, once in the log, when the portal does not have the function yet', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const missing = { code: 'PGRST202', message: 'Could not find the function app.feature_access_for_me(p_center) in the schema cache' };
    mockRpc.mockResolvedValueOnce({ data: null, error: missing });
    expect(await loadAccess('center-1')).toEqual({ kind: 'missing' });
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function app.feature_access_for_me(uuid) does not exist' } });
    expect(await loadAccess('center-1')).toEqual({ kind: 'missing' });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('fails in plain English, with the detail logged, when it cannot be had', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRpc.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    const err = await loadAccess('center-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe("We couldn't check what you can use here. Check your internet connection and try again.");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('does not mistake a refusal for a missing function', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied for function feature_access_for_me' } });
    const err = await loadAccess('center-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toMatch(/permission/i);
    log.mockRestore();
  });

  it('fails in plain English when the answer is not the expected shape', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const data of [null, 'nonsense', { level: {} }]) {
      mockRpc.mockResolvedValueOnce({ data, error: null });
      const err = await loadAccess('center-1').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).userMessage).toBe("We couldn't check what you can use here — the answer was not what we expected. Please try again.");
    }
    log.mockRestore();
  });
});
