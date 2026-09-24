import type { Tables } from '../database.types';
import { AppError, check, must } from '../errors';
import { supabase } from '../supabase';

import type { Center } from './member';

export type GyanStep = Tables<'gyan_steps'>;
export type GyanLevel = Tables<'gyan_levels'> & { steps: GyanStep[] };
export type GyanGoal = Tables<'gyan_goals'> & { levels: GyanLevel[] };
export type GyanProgress = Tables<'gyan_progress'>;
export type GyanSignoff = Tables<'gyan_signoffs'>;

export type GyanData = { goals: GyanGoal[]; progress: GyanProgress[]; signoffs: GyanSignoff[] };

/** Goals → levels → steps for the center (or its tradition), with progress for the given people. */
export async function loadGyan(center: Center, personIds: string[]): Promise<GyanData> {
  const goals = must(await supabase.from('gyan_goals').select('*').or(`center_id.eq.${center.id},center_id.is.null`).order('sort_order'), 'load Gyan Path goals').filter(
    (g) => !g.tradition || g.tradition === center.tradition,
  );
  const goalIds = goals.map((g) => g.id);
  const levels = goalIds.length ? must(await supabase.from('gyan_levels').select('*').in('goal_id', goalIds).order('sort_order'), 'load Gyan Path levels') : [];
  const levelIds = levels.map((l) => l.id);
  const [stepsRes, progressRes, signoffRes] = await Promise.all([
    levelIds.length ? supabase.from('gyan_steps').select('*').in('level_id', levelIds).order('sort_order') : Promise.resolve({ data: [] as GyanStep[], error: null }),
    personIds.length ? supabase.from('gyan_progress').select('*').in('person_id', personIds) : Promise.resolve({ data: [] as GyanProgress[], error: null }),
    personIds.length ? supabase.from('gyan_signoffs').select('*').in('person_id', personIds) : Promise.resolve({ data: [] as GyanSignoff[], error: null }),
  ]);
  const steps = must(stepsRes, 'load Gyan Path lessons');
  const progress = must(progressRes, 'load your progress');
  const signoffs = must(signoffRes, 'load teacher sign-offs');
  return {
    goals: goals.map((g) => ({
      ...g,
      levels: levels.filter((l) => l.goal_id === g.id).map((l) => ({ ...l, steps: steps.filter((s) => s.level_id === l.id) })),
    })),
    progress,
    signoffs,
  };
}

export type GoalProgress = { levelsDone: number; levelsTotal: number; stepsDone: number; stepsTotal: number; currentLevel: GyanLevel | null; complete: boolean };

export function isStepDone(progress: GyanProgress[], personId: string, stepId: string): boolean {
  return progress.some((p) => p.person_id === personId && p.step_id === stepId && p.completed_at);
}

export function isLevelDone(level: GyanLevel, progress: GyanProgress[], personId: string): boolean {
  return level.steps.length > 0 && level.steps.every((s) => isStepDone(progress, personId, s.id));
}

/** Levels unlock strictly in order; the current level is the first unfinished one. */
export function goalProgress(goal: GyanGoal, progress: GyanProgress[], personId: string): GoalProgress {
  let levelsDone = 0;
  for (const l of goal.levels) {
    if (isLevelDone(l, progress, personId)) levelsDone += 1;
    else break;
  }
  const stepsTotal = goal.levels.reduce((s, l) => s + l.steps.length, 0);
  const stepsDone = goal.levels.reduce((s, l) => s + l.steps.filter((st) => isStepDone(progress, personId, st.id)).length, 0);
  return { levelsDone, levelsTotal: goal.levels.length, stepsDone, stepsTotal, currentLevel: goal.levels[levelsDone] ?? null, complete: goal.levels.length > 0 && levelsDone >= goal.levels.length };
}

/**
 * Mark a step complete for yourself (RLS: gyan_progress_own requires person = me).
 * Stars never go down on a replay.
 */
export async function completeStep(centerId: string, personId: string, stepId: string, stars: number, existing: GyanProgress[]): Promise<void> {
  const prev = existing.find((p) => p.person_id === personId && p.step_id === stepId);
  const best = Math.max(prev?.stars ?? 0, Math.max(0, Math.min(3, stars)));
  check(
    await supabase.from('gyan_progress').upsert({ center_id: centerId, person_id: personId, step_id: stepId, stars: best, completed_at: prev?.completed_at ?? new Date().toISOString() }, { onConflict: 'person_id,step_id' }),
    'save your progress',
  );
}

export async function requestSignoff(centerId: string, personId: string, levelId: string): Promise<void> {
  check(await supabase.from('gyan_signoffs').insert({ center_id: centerId, person_id: personId, level_id: levelId, status: 'requested' }), 'request a teacher sign-off');
}

export type Quiz = { question: string; options: string[]; answer: number }[];

/** gyan_steps.quiz jsonb → questions. Accepts {questions:[...]} or a bare array; answer by index or text. */
export function parseQuiz(raw: unknown): Quiz {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { questions?: unknown }).questions) ? (raw as { questions: unknown[] }).questions : [];
  const out: Quiz = [];
  for (const q of list) {
    if (!q || typeof q !== 'object') continue;
    const o = q as Record<string, unknown>;
    const question = [o.question, o.q, o.text, o.label].find((v) => typeof v === 'string') as string | undefined;
    const options = Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : [];
    let answer = typeof o.answer === 'number' ? o.answer : typeof o.answer_index === 'number' ? o.answer_index : typeof o.correct === 'number' ? o.correct : -1;
    if (answer < 0 && typeof o.answer === 'string') answer = options.indexOf(o.answer);
    if (question && options.length >= 2 && answer >= 0 && answer < options.length) out.push({ question, options, answer });
  }
  return out;
}

export type Enrollment = Tables<'pathshala_enrollments'> & { termName: string | null; className: string | null; levelName: string | null; schedule: string | null };

export async function loadPathshala(householdId: string): Promise<Enrollment[]> {
  const rows = must(await supabase.from('pathshala_enrollments').select('*').eq('household_id', householdId).neq('status', 'withdrawn').order('registered_at', { ascending: false }), 'load Pathshala enrollments');
  if (rows.length === 0) return [];
  const termIds = [...new Set(rows.map((r) => r.term_id))];
  const classIds = [...new Set(rows.map((r) => r.class_id).filter((x): x is string => !!x))];
  const levelIds = [...new Set(rows.map((r) => r.requested_level_id).filter((x): x is string => !!x))];
  const [terms, classes, levels] = await Promise.all([
    supabase.from('pathshala_terms').select('id, name').in('id', termIds).then((r) => must(r, 'load Pathshala terms')),
    classIds.length ? supabase.from('pathshala_classes').select('id, name, meets_on, starts_time, level_id').in('id', classIds).then((r) => must(r, 'load Pathshala classes')) : Promise.resolve([]),
    levelIds.length ? supabase.from('pathshala_levels').select('id, name').in('id', levelIds).then((r) => must(r, 'load Pathshala levels')) : Promise.resolve([]),
  ]);
  return rows.map((r) => {
    const cls = classes.find((c) => c.id === r.class_id);
    return {
      ...r,
      termName: terms.find((t) => t.id === r.term_id)?.name ?? null,
      className: cls?.name ?? null,
      levelName: levels.find((l) => l.id === r.requested_level_id)?.name ?? null,
      schedule: cls ? `${cls.meets_on.charAt(0).toUpperCase()}${cls.meets_on.slice(1)}${cls.starts_time ? ` · ${cls.starts_time.slice(0, 5)}` : ''}` : null,
    };
  });
}

/** Mark Pathshala attendance from the class QR (app.redeem_attendance_qr). Pass the child's id when a parent scans. */
export async function redeemAttendance(sessionId: string, token: string, personId: string | null): Promise<'present' | 'late' | string> {
  const status = must(await supabase.rpc('redeem_attendance_qr', { p_session: sessionId, p_token: token, ...(personId ? { p_person: personId } : {}) }), 'mark attendance');
  return status;
}

export function assertCanLearn(personId: string | null): string {
  if (!personId) throw new AppError('Sign in to track your Gyan Path progress.', 'guest');
  return personId;
}
