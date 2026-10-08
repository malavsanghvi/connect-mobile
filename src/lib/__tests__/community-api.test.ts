import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { communityById, communityBySlug, listCommunities } from '../api/community';

type Answer = { data: unknown; error: unknown };

const mockCalls: string[] = [];
let mockRpcAnswers: Answer[] = [];
let mockTableAnswers: Answer[] = [];

// The table read is a chain (select → eq/order → maybeSingle or await); every link records itself and the last one answers.
function mockChain(): unknown {
  const answer = () => Promise.resolve(mockTableAnswers.shift() ?? { data: null, error: null });
  const chain = {
    select: (columns: string) => { mockCalls.push(`select ${columns}`); return chain; },
    eq: (column: string, value: unknown) => { mockCalls.push(`eq ${column}=${String(value)}`); return chain; },
    order: (column: string) => { mockCalls.push(`order ${column}`); return answer(); },
    maybeSingle: () => answer(),
  };
  return chain;
}

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => {
      mockCalls.push(`rpc ${fn} ${JSON.stringify(args ?? {})}`);
      return Promise.resolve(mockRpcAnswers.shift() ?? { data: [], error: null });
    },
    from: (table: string) => {
      mockCalls.push(`from ${table}`);
      return mockChain();
    },
  },
}));

// A database from before connect-crm 0614: the function is not there.
const noFunction: Answer = { data: null, error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } };
const jsh = { slug: 'jsh', name: 'Jain Society of Houston', short_name: 'JSH', state_region: 'TX', environment: 'sandbox' };
const live = { slug: 'jcnj', name: 'Jain Center of New Jersey', short_name: 'JCNJ', state_region: 'NJ', environment: 'production' };

beforeEach(() => {
  mockCalls.length = 0;
  mockRpcAnswers = [];
  mockTableAnswers = [];
});

describe('the list of organizations', () => {
  it('comes from app.communities_public_list, not the table', async () => {
    mockRpcAnswers = [{ data: [{ id: 'c2', ...live }, { id: 'c1', ...jsh }], error: null }];
    const list = await listCommunities();
    expect(mockCalls).toEqual(['rpc communities_public_list {}']);
    // a sandbox is left out while a live community exists (pickableCommunities, unchanged)
    expect(list).toEqual([{ slug: 'jcnj', name: 'Jain Center of New Jersey', shortName: 'JCNJ', place: 'NJ', sandbox: false }]);
  });

  it('is read from the table, active communities by name, on a database without the function', async () => {
    mockRpcAnswers = [noFunction];
    mockTableAnswers = [{ data: [jsh], error: null }];
    const list = await listCommunities();
    expect(mockCalls).toEqual([
      'rpc communities_public_list {}',
      'from centers',
      'select slug, name, short_name, state_region, environment',
      'eq status=active',
      'order name',
    ]);
    expect(list).toEqual([{ slug: 'jsh', name: 'Jain Society of Houston', shortName: 'JSH', place: 'TX', sandbox: true }]);
  });

  it('shows a real failure, without falling back', async () => {
    mockRpcAnswers = [{ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }];
    await expect(listCommunities()).rejects.toThrow(/load the list of organizations/);
    expect(mockCalls).toEqual(['rpc communities_public_list {}']);
  });
});

describe('one community by web name or id', () => {
  it('finds the web name through app.community_public (trimmed, lower case)', async () => {
    mockRpcAnswers = [{ data: [{ id: 'c1', ...jsh, rules: {}, branding: {}, feature_flags: {}, linked: false }], error: null }];
    expect(await communityBySlug('  JSH ')).toEqual({ slug: 'jsh', name: 'Jain Society of Houston', shortName: 'JSH', place: 'TX', sandbox: true });
    expect(mockCalls).toEqual(['rpc community_public {"p_slug":"jsh"}']);
  });

  it('is null when the function finds nothing', async () => {
    mockRpcAnswers = [{ data: [], error: null }];
    expect(await communityBySlug('nowhere')).toBeNull();
  });

  it('reads the table on a database without the function', async () => {
    mockRpcAnswers = [noFunction];
    mockTableAnswers = [{ data: live, error: null }];
    expect(await communityBySlug('JCNJ')).toEqual({ slug: 'jcnj', name: 'Jain Center of New Jersey', shortName: 'JCNJ', place: 'NJ', sandbox: false });
    expect(mockCalls).toEqual([
      'rpc community_public {"p_slug":"jcnj"}',
      'from centers',
      'select slug, name, short_name, state_region, environment',
      'eq slug=jcnj',
    ]);
  });

  it("finds an event's community by id through app.community_public_by_id, or the table without it", async () => {
    mockRpcAnswers = [{ data: [{ id: 'c2', ...live }], error: null }];
    expect((await communityById('c2'))?.slug).toBe('jcnj');
    expect(mockCalls).toEqual(['rpc community_public_by_id {"p_id":"c2"}']);

    mockCalls.length = 0;
    mockRpcAnswers = [noFunction];
    mockTableAnswers = [{ data: null, error: null }];
    expect(await communityById('c9')).toBeNull();
    expect(mockCalls).toEqual(['rpc community_public_by_id {"p_id":"c9"}', 'from centers', 'select slug, name, short_name, state_region, environment', 'eq id=c9']);
  });

  it('shows a real failure, without falling back', async () => {
    mockRpcAnswers = [{ data: null, error: { code: '57014', message: 'timeout' } }];
    await expect(communityById('c2')).rejects.toThrow(/find the event's community/);
    expect(mockCalls).toEqual(['rpc community_public_by_id {"p_id":"c2"}']);
  });
});
