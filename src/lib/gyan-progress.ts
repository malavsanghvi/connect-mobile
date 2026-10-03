/**
 * The pure arithmetic of Gyan Path progress (which level is next, how far a goal is) and the light summary Home's
 * Continue learning reads, without the lessons. No Supabase and no React, so it is unit-tested directly
 * (src/lib/__tests__/gyan-progress.test.ts). src/lib/api/gyan.ts loads the data and re-exports these.
 *
 * It takes the smallest shape it needs (a goal with levels, a level with steps that have an id, a progress mark with the
 * person, the step and when it was finished), so the full load (loadGyan: every lesson with its quiz and activity) and the
 * summary (loadGyanSummary: ids and names only) give the same answers.
 */
import type { Tables } from './database.types';

/** A finished (or started) step of a person: the three columns progress is worked out from. */
export type ProgressMark = { person_id: string; step_id: string; completed_at: string | null };

export type StepRef = { id: string };
export type LevelRef = { steps: readonly StepRef[] };

export function isStepDone(progress: readonly ProgressMark[], personId: string, stepId: string): boolean {
  return progress.some((p) => p.person_id === personId && p.step_id === stepId && p.completed_at);
}

export function isLevelDone(level: LevelRef, progress: readonly ProgressMark[], personId: string): boolean {
  return level.steps.length > 0 && level.steps.every((s) => isStepDone(progress, personId, s.id));
}

export type GoalProgress<L extends LevelRef = LevelRef> = { levelsDone: number; levelsTotal: number; stepsDone: number; stepsTotal: number; currentLevel: L | null; complete: boolean };

/** Levels unlock strictly in order; the current level is the first unfinished one. */
export function goalProgress<L extends LevelRef>(goal: { levels: readonly L[] }, progress: readonly ProgressMark[], personId: string): GoalProgress<L> {
  let levelsDone = 0;
  for (const l of goal.levels) {
    if (isLevelDone(l, progress, personId)) levelsDone += 1;
    else break;
  }
  const stepsTotal = goal.levels.reduce((s, l) => s + l.steps.length, 0);
  const stepsDone = goal.levels.reduce((s, l) => s + l.steps.filter((st) => isStepDone(progress, personId, st.id)).length, 0);
  return { levelsDone, levelsTotal: goal.levels.length, stepsDone, stepsTotal, currentLevel: goal.levels[levelsDone] ?? null, complete: goal.levels.length > 0 && levelsDone >= goal.levels.length };
}

/** When the person last completed a step in each goal. */
export function lastActivityByGoal(g: { goals: readonly { id: string; levels: readonly LevelRef[] }[]; progress: readonly ProgressMark[] }, personId: string): Map<string, string> {
  const last = new Map<string, string>();
  for (const goal of g.goals) {
    const stepIds = new Set(goal.levels.flatMap((l) => l.steps.map((s) => s.id)));
    const latest = g.progress
      .filter((pr) => pr.person_id === personId && pr.completed_at && stepIds.has(pr.step_id))
      .map((pr) => pr.completed_at as string)
      .sort()
      .pop();
    if (latest) last.set(goal.id, latest);
  }
  return last;
}

// ---------------------------------------------------------------------------
// The summary Home reads
// ---------------------------------------------------------------------------

/**
 * The columns of each table the summary selects. Not `*`: a lesson carries its quiz, activity and custom JSON, which is most
 * of Gyan Path's data (the content pack alone is about 135 KB), and Home only counts steps. Kept here so a test can say what
 * is never asked for.
 */
export const GYAN_SUMMARY_COLUMNS = {
  goals: 'id, name, tint, mark, recommended, sort_order, tradition',
  levels: 'id, goal_id, name, sort_order',
  steps: 'id, level_id',
  progress: 'person_id, step_id, completed_at',
} as const;

export type GyanGoalRow = Pick<Tables<'gyan_goals'>, 'id' | 'name' | 'tint' | 'mark' | 'recommended' | 'sort_order' | 'tradition'>;
export type GyanLevelRow = Pick<Tables<'gyan_levels'>, 'id' | 'goal_id' | 'name' | 'sort_order'>;
export type GyanStepRow = Pick<Tables<'gyan_steps'>, 'id' | 'level_id'>;

export type GyanLevelSummary = { id: string; name: string; steps: StepRef[] };
export type GyanGoalSummary = { id: string; name: string; tint: string | null; mark: string | null; recommended: boolean; levels: GyanLevelSummary[] };
export type GyanSummary = { goals: GyanGoalSummary[]; progress: ProgressMark[] };

/**
 * Goals → levels → step ids, in the order the rows are given (the loader asks for them by sort order), with the person's
 * progress. The same nesting as the full load, without the lessons.
 */
export function buildGyanSummary(rows: { goals: readonly GyanGoalRow[]; levels: readonly GyanLevelRow[]; steps: readonly GyanStepRow[]; progress: readonly ProgressMark[] }): GyanSummary {
  return {
    goals: rows.goals.map((g) => ({
      id: g.id,
      name: g.name,
      tint: g.tint,
      mark: g.mark,
      recommended: g.recommended,
      levels: rows.levels
        .filter((l) => l.goal_id === g.id)
        .map((l) => ({ id: l.id, name: l.name, steps: rows.steps.filter((s) => s.level_id === l.id).map((s) => ({ id: s.id })) })),
    })),
    progress: rows.progress.map((p) => ({ person_id: p.person_id, step_id: p.step_id, completed_at: p.completed_at })),
  };
}
