import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { centerChanged, loadCenter, type Center } from '../api/member';
import { JAIN_CENTER } from '../categories';

type Answer = { data: unknown; error: unknown };

const mockSelects: string[] = [];
let mockAnswers: Answer[] = [];
const mockRpcs: { fn: string; args: unknown }[] = [];
let mockRpcAnswers: Answer[] = [];

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      mockRpcs.push({ fn, args });
      return Promise.resolve(mockRpcAnswers.shift() ?? { data: [], error: null });
    },
    from: () => ({
      select: (columns: string) => {
        mockSelects.push(columns);
        return { eq: () => ({ maybeSingle: () => Promise.resolve(mockAnswers.shift() ?? { data: null, error: null }) }) };
      },
    }),
  },
}));

const row = { id: 'c1', slug: 'jsh', name: 'Jain Society of Houston', short_name: 'JSH', state_region: 'TX', time_zone: 'America/Chicago', tradition: 'shvetambar_murtipujak', branding: {}, feature_flags: {}, rules: {}, environment: 'production' };

// A database from before connect-crm 0614: the function is not there (PostgREST's "not in the schema cache").
const noFunction: Answer = { data: null, error: { code: 'PGRST202', message: 'Could not find the function app.community_public(p_slug) in the schema cache' } };

beforeEach(() => {
  mockSelects.length = 0;
  mockAnswers = [];
  mockRpcs.length = 0;
  mockRpcAnswers = [];
});

describe('opening the community through app.community_public (connect-crm 0614)', () => {
  const publicRow = {
    ...row,
    category_key: 'jain_center',
    status: 'active',
    linked: false,
    rules: { store: { gift_pack_cents: 250 } },
    branding: { colors: { primary: '#112233' } },
  };

  it('reads the community through the function, never the table', async () => {
    mockRpcAnswers = [{ data: [publicRow], error: null }];
    const center = await loadCenter('jsh');
    expect(mockRpcs).toEqual([{ fn: 'community_public', args: { p_slug: 'jsh' } }]);
    expect(mockSelects).toHaveLength(0);
    expect(center).toEqual({
      id: 'c1', slug: 'jsh', name: 'Jain Society of Houston', short_name: 'JSH', state_region: 'TX', time_zone: 'America/Chicago',
      tradition: 'shvetambar_murtipujak', branding: { colors: { primary: '#112233' } }, feature_flags: {},
      rules: { store: { gift_pack_cents: 250 } }, environment: 'production', category_key: 'jain_center',
    });
  });

  it('says so, in plain English, when the function finds no community', async () => {
    mockRpcAnswers = [{ data: [], error: null }];
    await expect(loadCenter('nowhere')).rejects.toThrow(/couldn't find the community "nowhere"/);
    expect(mockSelects).toHaveLength(0);
  });

  it('shows a real failure of the function, not the table fallback', async () => {
    mockRpcAnswers = [{ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }];
    await expect(loadCenter('jsh')).rejects.toThrow(/Something went wrong while trying to open your center/);
    expect(mockSelects).toHaveLength(0);
  });

  it('reads the table the old way when the database has no such function yet', async () => {
    mockRpcAnswers = [noFunction];
    mockAnswers = [{ data: { ...row, category_key: 'jain_center' }, error: null }];
    const center = await loadCenter('jsh');
    expect(center.name).toBe('Jain Society of Houston');
    expect(mockSelects).toHaveLength(1);
  });
});

describe('opening the community from the table (a database from before 0614)', () => {
  beforeEach(() => {
    mockRpcAnswers = [noFunction, noFunction];
  });

  it('reads the kind of organization with the community', async () => {
    mockAnswers = [{ data: { ...row, category_key: 'chamber_of_commerce' }, error: null }];
    const center = await loadCenter('jsh');
    expect(center.category_key).toBe('chamber_of_commerce');
    expect(mockSelects).toHaveLength(1);
    expect(mockSelects[0]).toContain('category_key');
  });

  it('treats a community as a Jain Center when the database has no category column yet, reading it the old way', async () => {
    mockAnswers = [
      { data: null, error: { code: '42703', message: 'column centers.category_key does not exist' } },
      { data: row, error: null },
    ];
    const center = await loadCenter('jsh');
    expect(center.category_key).toBe(JAIN_CENTER);
    expect(center.name).toBe('Jain Society of Houston');
    expect(mockSelects).toHaveLength(2);
    expect(mockSelects[0]).toContain('category_key');
    expect(mockSelects[1]).not.toContain('category_key');
  });

  it('says so, in plain English, when the community cannot be found (either way)', async () => {
    mockAnswers = [{ data: null, error: null }];
    await expect(loadCenter('nowhere')).rejects.toThrow(/couldn't find the community "nowhere"/);
    mockAnswers = [
      { data: null, error: { code: '42703', message: 'column centers.category_key does not exist' } },
      { data: null, error: null },
    ];
    await expect(loadCenter('nowhere')).rejects.toThrow(/couldn't find the community "nowhere"/);
  });

  it('shows a real failure, not the fallback', async () => {
    mockAnswers = [{ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }];
    await expect(loadCenter('jsh')).rejects.toThrow(/Something went wrong while trying to open your center/);
    expect(mockSelects).toHaveLength(1);
  });
});

describe('noticing that the community changed', () => {
  const a = { ...row, category_key: 'jain_center' } as unknown as Center;

  it('sees nothing changed in an identical row', () => {
    expect(centerChanged(a, { ...a })).toBe(false);
  });

  it('sees a new kind of organization, new Home shortcuts and new colours', () => {
    expect(centerChanged(a, { ...a, category_key: 'chamber_of_commerce' })).toBe(true);
    expect(centerChanged(a, { ...a, rules: { home: { shortcuts: ['photos'] } } })).toBe(true);
    expect(centerChanged(a, { ...a, branding: { primary: '#123456' } })).toBe(true);
  });
});
