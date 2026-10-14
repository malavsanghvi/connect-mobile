import { describe, expect, it, jest } from '@jest/globals';

import { ANNOUNCEMENT_LIMIT, loadClassAnnouncements } from '../api/gyan';
import { AppError } from '../errors';

type Result = { data: unknown; error: unknown };
type Call = { table: string; steps: [string, ...unknown[]][] };

const mockCalls: Call[] = [];
const mockAnswers = new Map<string, Result>();

jest.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, steps: [] };
      mockCalls.push(call);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'order', 'limit', 'in']) {
        chain[m] = (...args: unknown[]) => {
          call.steps.push([m, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(mockAnswers.get(table) ?? { data: [], error: null }).then(resolve, reject);
      return chain;
    },
  },
}));

const CENTER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLASS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TERM = '22222222-2222-4222-8222-222222222222';

function reset() {
  mockCalls.length = 0;
  mockAnswers.clear();
}

function quiet(): jest.SpiedFunction<typeof console.error> {
  return jest.spyOn(console, 'error').mockImplementation(() => undefined);
}

describe('loadClassAnnouncements', () => {
  it("asks for the community's published announcements, newest first, and reads no author", async () => {
    reset();
    await loadClassAnnouncements(CENTER);
    const q = mockCalls[0];
    expect(q.table).toBe('class_announcements');
    expect(q.steps).toEqual([
      ['select', 'id, title, body_md, published_at, class_id, term_id'],
      ['eq', 'center_id', CENTER],
      ['not', 'published_at', 'is', null],
      ['order', 'published_at', { ascending: false }],
      ['limit', ANNOUNCEMENT_LIMIT],
    ]);
    expect(String(q.steps[0][1])).not.toMatch(/author/);
  });

  it('has nothing to look up when there are no announcements', async () => {
    reset();
    mockAnswers.set('class_announcements', { data: [], error: null });
    expect(await loadClassAnnouncements(CENTER)).toEqual([]);
    expect(mockCalls.map((c) => c.table)).toEqual(['class_announcements']);
  });

  it("joins the class's name, and the term's name for a whole-term announcement", async () => {
    reset();
    mockAnswers.set('class_announcements', {
      data: [
        { id: 'a1', title: 'Jai Jinendra', body_md: 'Hello class', published_at: '2026-10-05T15:00:00+00:00', class_id: CLASS, term_id: TERM },
        { id: 'a2', title: 'Picture day', body_md: 'Friday', published_at: '2026-10-06T15:00:00+00:00', class_id: null, term_id: TERM },
      ],
      error: null,
    });
    mockAnswers.set('pathshala_classes', { data: [{ id: CLASS, name: 'Jainism 6' }], error: null });
    mockAnswers.set('pathshala_terms', { data: [{ id: TERM, name: 'Fall 2026' }], error: null });
    const out = await loadClassAnnouncements(CENTER);
    expect(out.map((a) => [a.id, a.audience])).toEqual([
      ['a2', { kind: 'term', termName: 'Fall 2026' }],
      ['a1', { kind: 'class', className: 'Jainism 6' }],
    ]);
    const names = Object.fromEntries(mockCalls.filter((c) => c.table !== 'class_announcements').map((c) => [c.table, c.steps.find((s) => s[0] === 'in')]));
    expect(names.pathshala_classes).toEqual(['in', 'id', [CLASS]]);
    expect(names.pathshala_terms).toEqual(['in', 'id', [TERM]]);
  });

  it('fails in plain English, not with an empty list, when the announcements cannot be had', async () => {
    reset();
    const log = quiet();
    mockAnswers.set('class_announcements', { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    const err = await loadClassAnnouncements(CENTER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toMatch(/load class announcements/);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('fails in plain English when a name cannot be looked up', async () => {
    reset();
    const log = quiet();
    mockAnswers.set('class_announcements', { data: [{ id: 'a1', title: 'T', body_md: 'B', published_at: '2026-10-05T15:00:00+00:00', class_id: CLASS, term_id: TERM }], error: null });
    mockAnswers.set('pathshala_classes', { data: null, error: { code: '57014', message: 'timeout' } });
    const err = await loadClassAnnouncements(CENTER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toMatch(/names of your classes/);
    log.mockRestore();
  });
});
