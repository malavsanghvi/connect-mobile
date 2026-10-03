import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { listHouseholdRsvps, listUpcomingEvents } from '../api/events';
import { listNewestRecipes, RECIPE_PAGE } from '../api/media';

type Row = Record<string, unknown>;
type Fake = { select: () => Fake; eq: () => Fake; in: () => Fake; or: () => Fake; order: () => Fake; limit: () => Fake; then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise<unknown> };

// What the fake database holds and every request made of it, in order.
const mockTables: Record<string, Row[]> = { events: [], rsvps: [] };
const mockRequests: string[] = [];
const mockRpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let mockRecipes: Row[] = [];

jest.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Fake = {
        select: () => q,
        eq: () => q,
        in: () => q,
        or: () => q,
        order: () => q,
        limit: () => q,
        // A little later than the call, as a network answer is, so that two asks can overlap.
        then: (resolve, reject) => {
          mockRequests.push(table);
          return new Promise((done) => setTimeout(done, 5)).then(() => ({ data: mockTables[table] ?? [], error: null })).then(resolve, reject);
        },
      };
      return q;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      mockRpcCalls.push({ name, args });
      return Promise.resolve({ data: mockRecipes.slice(0, Number(args.p_limit)), error: null });
    },
  },
}));

// api/events reaches the device storage through api/surveys: not needed here.
jest.mock('../storage', () => ({ readPref: async (_key: string, fallback: unknown) => fallback, writePref: async () => {} }));

beforeEach(() => {
  mockRequests.length = 0;
  mockRpcCalls.length = 0;
  mockTables.events = [{ id: 'e1', name: 'Navpad Puja' }, { id: 'e2', name: 'Garba' }];
  mockTables.rsvps = [{ id: 'r1', event_id: 'e1', household_id: 'h1', status: 'rsvpd', created_at: '2026-10-01T10:00:00Z' }];
});

describe('Home asking for the events and the RSVPs from two places at once', () => {
  it('makes one request for the upcoming events while another is on its way', async () => {
    const [a, b] = await Promise.all([listUpcomingEvents('c1'), listUpcomingEvents('c1')]);
    expect(mockRequests).toEqual(['events']);
    expect(a.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(b.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
  it('gives each asker its own list (one sorting its copy does not reorder the other’s)', async () => {
    const [a, b] = await Promise.all([listUpcomingEvents('c1'), listUpcomingEvents('c1')]);
    a.reverse();
    expect(b.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
  it('makes one request for the family’s RSVPs to the same events, and gives each asker its own map', async () => {
    const [a, b] = await Promise.all([listHouseholdRsvps('h1', ['e1', 'e2']), listHouseholdRsvps('h1', ['e1', 'e2'])]);
    expect(mockRequests).toEqual(['rsvps']);
    expect(a.get('e1')?.status).toBe('rsvpd');
    a.delete('e1');
    expect(b.get('e1')?.status).toBe('rsvpd');
  });
  it('asks again for other events, other families and a later time (nothing is kept after the answer)', async () => {
    await Promise.all([listHouseholdRsvps('h1', ['e1']), listHouseholdRsvps('h1', ['e1', 'e2']), listHouseholdRsvps('h2', ['e1'])]);
    expect(mockRequests).toEqual(['rsvps', 'rsvps', 'rsvps']);
    mockRequests.length = 0;
    await listUpcomingEvents('c1');
    await listUpcomingEvents('c1');
    expect(mockRequests).toEqual(['events', 'events']);
  });
});

describe('listNewestRecipes (the Fully Jain recipes tile asks for a small page, not 100 rows)', () => {
  const recipe = (n: number, fullyJain: boolean): Row => ({ id: `r${n}`, kind: 'recipe', title: `Recipe ${n}`, metadata: { fully_jain: fullyJain }, like_count: 0 });
  const many = (n: number, fullyJainFrom: number) => Array.from({ length: n }, (_, i) => recipe(i, i >= fullyJainFrom));

  it('asks for a small page first and stops there when it has a fully Jain recipe', async () => {
    mockRecipes = many(30, 2);
    const items = await listNewestRecipes('c1');
    expect(mockRpcCalls.map((c) => [c.name, c.args.p_limit, c.args.p_sort])).toEqual([['media_library', RECIPE_PAGE, 'recent']]);
    expect(items).toHaveLength(RECIPE_PAGE);
    expect(items.find((i) => i.meta.fullyJain)?.id).toBe('r2');
  });
  it('asks for the whole list only when a full page has no fully Jain recipe, so the tile is never lost to a short page', async () => {
    mockRecipes = many(40, 25);
    const items = await listNewestRecipes('c1');
    expect(mockRpcCalls.map((c) => c.args.p_limit)).toEqual([RECIPE_PAGE, 100]);
    expect(items.find((i) => i.meta.fullyJain)?.id).toBe('r25');
  });
  it('does not ask again when the page was not full (there is nothing more to find)', async () => {
    mockRecipes = many(5, 99);
    const items = await listNewestRecipes('c1');
    expect(mockRpcCalls).toHaveLength(1);
    expect(items).toHaveLength(5);
  });
});
