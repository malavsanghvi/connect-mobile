import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { cacheKey, loadCategoryProfile, readCachedProfile, writeCachedProfile } from '../api/category';
import { JAIN_CENTER, layoutFor } from '../categories';
import { jainPayload, newExperiencePayload } from './categories-fixtures';

const mockRpc = jest.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>();
const mockPrefs = new Map<string, unknown>();

jest.mock('../supabase', () => ({
  supabase: { rpc: (name: string, args: unknown) => mockRpc(name, args) },
}));
jest.mock('../storage', () => ({
  readPref: async (key: string, fallback: unknown) => (mockPrefs.has(key) ? mockPrefs.get(key) : fallback),
  writePref: async (key: string, value: unknown) => {
    mockPrefs.set(key, value);
  },
}));

beforeEach(() => {
  mockRpc.mockReset();
  mockPrefs.clear();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('reading the kind of organization (app.category_profile)', () => {
  it('asks the database for the community and reads the answer', async () => {
    mockRpc.mockResolvedValueOnce({ data: jainPayload(), error: null });
    const read = await loadCategoryProfile('center-1');
    expect(mockRpc).toHaveBeenCalledWith('category_profile', { p_center: 'center-1' });
    expect(read.kind).toBe('answered');
    if (read.kind !== 'answered') return;
    expect(read.profile.key).toBe(JAIN_CENTER);
    expect(read.raw).toEqual(jainPayload());
  });

  it('says "missing" when the database does not have the function yet, and logs it once', async () => {
    const missing = { code: 'PGRST202', message: 'Could not find the function app.category_profile(p_center) in the schema cache' };
    mockRpc.mockResolvedValue({ data: null, error: missing });
    expect(await loadCategoryProfile('center-1')).toEqual({ kind: 'missing' });
    expect(await loadCategoryProfile('center-1')).toEqual({ kind: 'missing' });
    const calls = (console.error as jest.Mock).mock.calls.filter((c) => String(c[0]).includes('category_profile is not deployed'));
    expect(calls).toHaveLength(1);
  });

  it('says "failed" (and keeps the last known layout) when the read does not work, without throwing', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'That community was not found.' } });
    expect(await loadCategoryProfile('center-2')).toEqual({ kind: 'failed' });
    mockRpc.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await loadCategoryProfile('center-3')).toEqual({ kind: 'failed' });
  });

  it('says "failed" for an answer that is not a profile', async () => {
    mockRpc.mockResolvedValueOnce({ data: { nothing: true }, error: null });
    expect(await loadCategoryProfile('center-4')).toEqual({ kind: 'failed' });
  });
});

describe('the device remembers the last answer for each community', () => {
  it('reads back what it wrote, for that community only', async () => {
    await writeCachedProfile('swaminarayan', newExperiencePayload());
    const back = await readCachedProfile('swaminarayan');
    expect(back?.key).toBe('swaminarayan_temple');
    expect(layoutFor(back!).practiceTab).toBe(true);
    expect(await readCachedProfile('jsh')).toBeNull();
    expect(cacheKey('jsh')).not.toBe(cacheKey('swaminarayan'));
  });

  it('reads nothing back from an entry it cannot use', async () => {
    mockPrefs.set(cacheKey('a'), { v: 99, raw: jainPayload() });
    mockPrefs.set(cacheKey('b'), { v: 1, raw: 'garbage' });
    mockPrefs.set(cacheKey('c'), 'not an object');
    expect(await readCachedProfile('a')).toBeNull();
    expect(await readCachedProfile('b')).toBeNull();
    expect(await readCachedProfile('c')).toBeNull();
  });
});
