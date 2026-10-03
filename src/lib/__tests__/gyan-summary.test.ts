import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { learningGoalInputs, learningState } from '@/features/home-rail-items';

import { loadGyan, loadGyanSummary } from '../api/gyan';
import type { Center } from '../api/member';
import { buildGyanSummary, GYAN_SUMMARY_COLUMNS, goalProgress, lastActivityByGoal } from '../gyan-progress';

type Row = Record<string, unknown>;
type Fake = { select: (c: string) => Fake; or: () => Fake; in: (col: string, values: unknown[]) => Fake; eq: (col: string, v: unknown) => Fake; order: (col: string) => Fake; then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise<unknown> };

// The fake database, what was asked of it (table and columns) and how much came back over the "wire" (JSON characters of the rows returned).
const mockDb: Record<string, Row[]> = {};
const mockAsked: { table: string; columns: string }[] = [];
let mockWire = 0;

jest.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      let columns = '*';
      let orderBy: string | null = null;
      const filters: ((r: Row) => boolean)[] = [];
      const q: Fake = {
        select: (c) => {
          columns = c;
          return q;
        },
        // The center-or-shared filter: the fixture holds only this community's goals and shared ones.
        or: () => q,
        in: (col, values) => {
          filters.push((r) => values.includes(r[col]));
          return q;
        },
        eq: (col, v) => {
          filters.push((r) => r[col] === v);
          return q;
        },
        order: (col) => {
          orderBy = col;
          return q;
        },
        then: (resolve, reject) => {
          mockAsked.push({ table, columns });
          let rows = (mockDb[table] ?? []).filter((r) => filters.every((f) => f(r)));
          const by = orderBy;
          if (by) rows = [...rows].sort((a, b) => Number(a[by]) - Number(b[by]));
          // Like PostgREST: only the columns asked for come back.
          const wanted = columns === '*' ? null : columns.split(',').map((c) => c.trim());
          const out = wanted ? rows.map((r) => Object.fromEntries(wanted.map((c) => [c, r[c]]))) : rows;
          mockWire += JSON.stringify(out).length;
          return Promise.resolve({ data: out, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  },
}));

const center = { id: 'c1', tradition: 'svetambar' } as unknown as Center;
const ME = 'p1';
const OTHER = 'p2';

/** A lesson as the database has it: a lot of content next to the two ids Home needs. */
const step = (id: string, levelId: string, n: number): Row => ({
  id,
  level_id: levelId,
  kind: 'quiz',
  title: `Lesson ${id}`,
  content_item_id: null,
  sort_order: n,
  points: 5,
  repeat_points: 1,
  custom: { notes: 'x'.repeat(400) },
  quiz: Array.from({ length: 6 }, (_, i) => ({ type: 'choice', prompt: `Question ${i} of ${id} `.repeat(6), options: ['a', 'b', 'c', 'd'].map((o) => o.repeat(30)), answer: 1 })),
  activity: { mode: 'learn', spots: Array.from({ length: 8 }, (_, i) => ({ key: `s${i}`, x: 0.1 * i, y: 0.2, label: `Spot ${i} `.repeat(5), order: i })) },
});

function seed(opts: { allDone: boolean }) {
  const goal = (id: string, name: string, order: number, over: Row = {}): Row => ({ id, center_id: 'c1', tradition: null, key: id, name, description: `${name} for everyone. `.repeat(10), sort_order: order, recommended: false, tint: '#1B2C5C', mark: null, custom: {}, ...over });
  const level = (id: string, goalId: string, name: string, order: number): Row => ({ id, goal_id: goalId, key: id, name, sort_order: order, points: 20, treasure: null, requires_teacher_signoff: false, chapter: null, custom: {}, treasure_points: 0 });
  mockDb.gyan_goals = [
    goal('g1', 'Navkar Mantra', 1, { recommended: true, mark: 'ન' }),
    goal('g2', 'Pratikraman Sutras', 2),
    goal('g3', 'Nav Tattva', 3),
    goal('g4', 'Digambar only', 4, { tradition: 'digambar' }),
    goal('g5', 'Coming soon (no levels yet)', 5),
  ];
  mockDb.gyan_levels = [level('g1l1', 'g1', 'Listen', 1), level('g1l2', 'g1', 'Say it', 2), level('g1l3', 'g1', 'Know it', 3), level('g2l1', 'g2', 'Ichhami', 1), level('g2l2', 'g2', 'Tassa', 2), level('g3l1', 'g3', 'Jiva', 1), level('g4l1', 'g4', 'Only digambar', 1)];
  mockDb.gyan_steps = mockDb.gyan_levels.flatMap((l) => [1, 2, 3].map((n) => step(`${l.id}s${n}`, String(l.id), n)));
  const done = (stepId: string, daysAgo: number, person = ME): Row => ({ id: `${person}-${stepId}`, center_id: 'c1', person_id: person, step_id: stepId, stars: 3, completed_at: new Date(Date.UTC(2026, 9, 1) - daysAgo * 86400000).toISOString(), recording_path: null, recording_expires_at: null });
  mockDb.gyan_progress = [
    // g1: level 1 done, level 2 begun. g2: untouched. g3: one level, 2 of its 3 steps. Someone else's progress must never count.
    done('g1l1s1', 3), done('g1l1s2', 3), done('g1l1s3', 2), done('g1l2s1', 1),
    done('g3l1s1', 9), done('g3l1s2', 9),
    done('g2l1s1', 1, OTHER),
  ];
  if (opts.allDone) {
    for (const l of mockDb.gyan_levels) for (const n of [1, 2, 3]) if (!mockDb.gyan_progress.some((p) => p.step_id === `${l.id}s${n}` && p.person_id === ME)) mockDb.gyan_progress.push(done(`${l.id}s${n}`, 1));
  }
  mockDb.gyan_signoffs = [];
}

beforeEach(() => {
  mockAsked.length = 0;
  mockWire = 0;
  seed({ allDone: false });
});

describe('loadGyanSummary (what Home reads of Gyan Path)', () => {
  it('asks only for the columns it needs, never a lesson’s quiz, activity or custom content', async () => {
    await loadGyanSummary(center, ME);
    const asked = Object.fromEntries(mockAsked.map((a) => [a.table, a.columns]));
    expect(asked).toEqual({ gyan_goals: GYAN_SUMMARY_COLUMNS.goals, gyan_levels: GYAN_SUMMARY_COLUMNS.levels, gyan_steps: GYAN_SUMMARY_COLUMNS.steps, gyan_progress: GYAN_SUMMARY_COLUMNS.progress });
    for (const { columns } of mockAsked) {
      expect(columns).not.toBe('*');
      expect(columns).not.toMatch(/quiz|activity|custom|description|content_item_id|points/);
    }
    // No sign-offs either: Home does not show them.
    expect(mockAsked.map((a) => a.table)).not.toContain('gyan_signoffs');
  });

  it('brings back a small part of what the full load does (the lessons are most of the data)', async () => {
    await loadGyanSummary(center, ME);
    const summary = mockWire;
    mockWire = 0;
    await loadGyan(center, [ME]);
    const full = mockWire;
    expect(full).toBeGreaterThan(20000);
    expect(summary).toBeLessThan(full / 10);
  });

  it('gives the goals of this community’s tradition with their levels and the ids of their steps, in order', async () => {
    const g = await loadGyanSummary(center, ME);
    expect(g.goals.map((x) => x.id)).toEqual(['g1', 'g2', 'g3', 'g5']);
    expect(g.goals[0]).toEqual({
      id: 'g1',
      name: 'Navkar Mantra',
      tint: '#1B2C5C',
      mark: 'ન',
      recommended: true,
      levels: [
        { id: 'g1l1', name: 'Listen', steps: [{ id: 'g1l1s1' }, { id: 'g1l1s2' }, { id: 'g1l1s3' }] },
        { id: 'g1l2', name: 'Say it', steps: [{ id: 'g1l2s1' }, { id: 'g1l2s2' }, { id: 'g1l2s3' }] },
        { id: 'g1l3', name: 'Know it', steps: [{ id: 'g1l3s1' }, { id: 'g1l3s2' }, { id: 'g1l3s3' }] },
      ],
    });
    expect(g.goals.find((x) => x.id === 'g5')?.levels).toEqual([]);
  });

  it('reads only this person’s progress, and only three columns of it', async () => {
    const g = await loadGyanSummary(center, ME);
    expect(g.progress.every((p) => p.person_id === ME)).toBe(true);
    expect(g.progress).toHaveLength(6);
    expect(Object.keys(g.progress[0]).sort()).toEqual(['completed_at', 'person_id', 'step_id']);
  });

  it('gives Continue learning exactly what the full load gives: the same goals in the same order, the same next level and progress', async () => {
    const fromSummary = learningState(learningGoalInputs(await loadGyanSummary(center, ME), ME));
    const fromFull = learningState(learningGoalInputs(await loadGyan(center, [ME]), ME));
    expect(fromSummary).toEqual(fromFull);
    // g1 is in progress (level 2 next, 4 of 9 steps), then g3 (also begun), then g2 (not begun).
    expect(fromSummary.tiles.map((t) => [t.goalId, t.levelId, t.levelNumber, Math.round(t.progress * 100)])).toEqual([
      ['g1', 'g1l2', 2, 44],
      ['g3', 'g3l1', 1, 67],
      ['g2', 'g2l1', 1, 0],
    ]);
    expect(fromSummary.allDone).toBe(false);
  });

  it('says every goal is done when it is, as the full load does (the tile then opens the goals)', async () => {
    seed({ allDone: true });
    const fromSummary = learningState(learningGoalInputs(await loadGyanSummary(center, ME), ME));
    const fromFull = learningState(learningGoalInputs(await loadGyan(center, [ME]), ME));
    expect(fromSummary).toEqual(fromFull);
    expect(fromSummary).toEqual({ tiles: [], allDone: true });
  });
});

describe('buildGyanSummary and the progress arithmetic', () => {
  it('nests levels and steps under their goal, keeping the order given, and drops everything else', () => {
    const summary = buildGyanSummary({
      goals: [{ id: 'g', name: 'G', tint: null, mark: null, recommended: false, sort_order: 1, tradition: null }],
      levels: [
        { id: 'l2', goal_id: 'g', name: 'Two', sort_order: 2 },
        { id: 'l1', goal_id: 'other', name: 'Not mine', sort_order: 1 },
      ],
      steps: [
        { id: 's1', level_id: 'l2' },
        { id: 's2', level_id: 'l1' },
      ],
      progress: [{ person_id: 'p', step_id: 's1', completed_at: null }],
    });
    expect(summary.goals).toEqual([{ id: 'g', name: 'G', tint: null, mark: null, recommended: false, levels: [{ id: 'l2', name: 'Two', steps: [{ id: 's1' }] }] }]);
    expect(summary.progress).toEqual([{ person_id: 'p', step_id: 's1', completed_at: null }]);
  });
  it('works out progress from the summary as from the full data: the first unfinished level is the current one', () => {
    const summary = buildGyanSummary({
      goals: [{ id: 'g', name: 'G', tint: null, mark: null, recommended: false, sort_order: 1, tradition: null }],
      levels: [
        { id: 'l1', goal_id: 'g', name: 'One', sort_order: 1 },
        { id: 'l2', goal_id: 'g', name: 'Two', sort_order: 2 },
      ],
      steps: [
        { id: 'a', level_id: 'l1' },
        { id: 'b', level_id: 'l2' },
        { id: 'c', level_id: 'l2' },
      ],
      progress: [
        { person_id: 'p', step_id: 'a', completed_at: '2026-10-01T10:00:00Z' },
        { person_id: 'p', step_id: 'b', completed_at: '2026-10-02T10:00:00Z' },
        { person_id: 'q', step_id: 'c', completed_at: '2026-10-02T10:00:00Z' },
      ],
    });
    const p = goalProgress(summary.goals[0], summary.progress, 'p');
    expect(p).toMatchObject({ levelsDone: 1, levelsTotal: 2, stepsDone: 2, stepsTotal: 3, complete: false });
    expect(p.currentLevel?.id).toBe('l2');
    expect(lastActivityByGoal(summary, 'p').get('g')).toBe('2026-10-02T10:00:00Z');
    expect(goalProgress(summary.goals[0], summary.progress, 'q')).toMatchObject({ levelsDone: 0, stepsDone: 1 });
  });
});
