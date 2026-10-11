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
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const missing = { code: 'PGRST202', message: 'Could not find the function app.category_profile(p_center) in the schema cache' };
    mockRpc.mockResolvedValue({ data: null, error: missing });
    expect(await loadCategoryProfile('center-1')).toEqual({ kind: 'missing' });
    expect(await loadCategoryProfile('center-1')).toEqual({ kind: 'missing' });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('says "failed" (and keeps the last known layout) when the read does not work, without throwing', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'That community was not found.' } });
    expect(await loadCategoryProfile('center-2')).toEqual({ kind: 'failed' });
    mockRpc.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await loadCategoryProfile('center-3')).toEqual({ kind: 'failed' });
    log.mockRestore();
  });

  it('says "failed" for an answer that is not a profile', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRpc.mockResolvedValueOnce({ data: { nothing: true }, error: null });
    expect(await loadCategoryProfile('center-4')).toEqual({ kind: 'failed' });
    log.mockRestore();
  });
});

describe('the member-app template that comes with the profile', () => {
  const withTemplate = (template: unknown) => ({ ...(jainPayload() as object), template });

  it('arrives with the profile, and the raw answer keeps it for the device', async () => {
    const template = { version: 1, home: { rows: ['events', 'today'] }, tabs: [{ key: 'give', label: 'Donate', icon: null, hidden: false }] };
    mockRpc.mockResolvedValueOnce({ data: withTemplate(template), error: null });
    const read = await loadCategoryProfile('center-t1');
    expect(read.kind).toBe('answered');
    if (read.kind !== 'answered') return;
    expect(read.profile.template?.rows).toEqual(['events', 'today']);
    expect(read.profile.template?.tabs?.[0].label).toBe('Donate');
    await writeCachedProfile('tmpl', read.raw);
    expect((await readCachedProfile('tmpl'))?.template).toEqual(read.profile.template);
  });

  it('answers with the built-in layout, and logs once, when part of the template cannot be used', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = withTemplate({ version: 1, home: { rows: 'events' }, tabs: [{ key: 'give' }] });
    mockRpc.mockResolvedValue({ data: broken, error: null });
    const first = await loadCategoryProfile('center-t2');
    const second = await loadCategoryProfile('center-t2');
    for (const read of [first, second]) {
      expect(read.kind).toBe('answered');
      if (read.kind === 'answered') {
        expect(read.profile.template?.rows).toBeNull(); // the rows part is dropped, the tabs part is kept
        expect(read.profile.template?.tabs).toHaveLength(1);
      }
    }
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('is silent for a profile with no template, and for one a newer database wrote with ids this build does not know', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRpc.mockResolvedValueOnce({ data: jainPayload(), error: null });
    mockRpc.mockResolvedValueOnce({ data: withTemplate({ version: 1, home: { rows: ['today', 'panchang_v9'] }, tabs: [{ key: 'prayer' }, { key: 'give' }] }), error: null });
    expect((await loadCategoryProfile('center-t3')).kind).toBe('answered');
    expect((await loadCategoryProfile('center-t4')).kind).toBe('answered');
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
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
