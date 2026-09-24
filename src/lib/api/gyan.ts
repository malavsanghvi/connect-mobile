import type { Tables } from '../database.types';
import { AppError, check, must } from '../errors';
import { supabase } from '../supabase';

import { isMissingBucket } from './photos';

import { classSchedule, registrationOpen, type AttendanceMark, type DailyMinutes } from '../learning';

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
export async function completeStep(centerId: string, personId: string, stepId: string, stars: number, existing: GyanProgress[], recordingPath?: string | null): Promise<void> {
  const prev = existing.find((p) => p.person_id === personId && p.step_id === stepId);
  const best = Math.max(prev?.stars ?? 0, Math.max(0, Math.min(3, stars)));
  check(
    await supabase.from('gyan_progress').upsert(
      {
        center_id: centerId,
        person_id: personId,
        step_id: stepId,
        stars: best,
        completed_at: prev?.completed_at ?? new Date().toISOString(),
        // Keep a recording made in this run (uploadRecitation already stored it).
        ...(recordingPath ? { recording_path: recordingPath } : {}),
      },
      { onConflict: 'person_id,step_id' },
    ),
    'save your progress',
  );
}

/** Gyan Path daily goal (people.gyan_daily_minutes: 5, 10 or 15). */
export async function setDailyMinutes(personId: string, minutes: DailyMinutes): Promise<void> {
  check(await supabase.from('people').update({ gyan_daily_minutes: minutes }).eq('id', personId), 'save your daily goal');
}

/**
 * Storage bucket for recitation recordings. connect-crm has not created it yet
 * (README › Schema gaps); until it exists the upload fails with a plain
 * message and the member can still continue.
 */
export const RECITATION_BUCKET = 'gyan-recordings';
/** gyan_progress.recording_path retention (migrations/0007: 90 days). */
export const RECORDING_RETENTION_DAYS = 90;

/** Upload a recitation and point the step's progress row at it. Returns the storage path. */
export async function uploadRecitation(opts: { centerId: string; personId: string; stepId: string; uri: string; existing: GyanProgress[] }): Promise<string> {
  const ext = /\.(m4a|mp4|aac|caf|wav|webm|ogg|3gp)(\?|$)/i.exec(opts.uri)?.[1]?.toLowerCase() ?? 'm4a';
  const contentType = ext === 'webm' ? 'audio/webm' : ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' : ext === '3gp' ? 'audio/3gpp' : ext === 'caf' ? 'audio/x-caf' : 'audio/mp4';
  let body: ArrayBuffer;
  try {
    body = await (await fetch(opts.uri)).arrayBuffer();
  } catch (err) {
    throw new AppError("We couldn't read your recording from this phone.", `reading recording ${opts.uri}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (body.byteLength === 0) throw new AppError('The recording was empty. Please record again.', 'empty recording');
  const path = `${opts.centerId}/${opts.personId}/${opts.stepId}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from(RECITATION_BUCKET).upload(path, body, { contentType, upsert: false });
  if (up.error) {
    throw new AppError(
      isMissingBucket(up.error) ? "Recitation recordings aren't set up for your community yet, so this one wasn't saved." : "We couldn't upload your recitation. Please check your connection and try again.",
      `storage upload to ${RECITATION_BUCKET}: ${up.error.message}`,
    );
  }
  const prev = opts.existing.find((p) => p.person_id === opts.personId && p.step_id === opts.stepId);
  const expires = new Date(Date.now() + RECORDING_RETENTION_DAYS * 86400000).toISOString();
  check(
    await supabase.from('gyan_progress').upsert(
      { center_id: opts.centerId, person_id: opts.personId, step_id: opts.stepId, stars: prev?.stars ?? 0, completed_at: prev?.completed_at ?? null, recording_path: path, recording_expires_at: expires },
      { onConflict: 'person_id,step_id' },
    ),
    'save your recitation',
  );
  return path;
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

export type ProgressReport = Pick<
  Tables<'pathshala_progress_reports'>,
  'id' | 'enrollment_id' | 'period' | 'attendance_present' | 'attendance_late' | 'attendance_total' | 'teacher_comments' | 'published_at'
>;
export type Enrollment = Tables<'pathshala_enrollments'> & {
  termName: string | null;
  className: string | null;
  levelName: string | null;
  schedule: string | null;
  /** Class days marked for this student (parents read them through RLS attendance_household). */
  attendance: AttendanceMark[];
  /** Published progress reports, newest first. */
  reports: ProgressReport[];
};

export async function loadPathshala(householdId: string): Promise<Enrollment[]> {
  const rows = must(await supabase.from('pathshala_enrollments').select('*').eq('household_id', householdId).neq('status', 'withdrawn').order('registered_at', { ascending: false }), 'load Pathshala enrollments');
  if (rows.length === 0) return [];
  const termIds = [...new Set(rows.map((r) => r.term_id))];
  const classIds = [...new Set(rows.map((r) => r.class_id).filter((x): x is string => !!x))];
  const levelIds = [...new Set(rows.map((r) => r.requested_level_id).filter((x): x is string => !!x))];
  const enrollmentIds = rows.map((r) => r.id);
  const [terms, classes, levels, marks, reports] = await Promise.all([
    supabase.from('pathshala_terms').select('id, name').in('id', termIds).then((r) => must(r, 'load Pathshala terms')),
    classIds.length ? supabase.from('pathshala_classes').select('id, name, meets_on, starts_time, level_id').in('id', classIds).then((r) => must(r, 'load Pathshala classes')) : Promise.resolve([]),
    levelIds.length ? supabase.from('pathshala_levels').select('id, name').in('id', levelIds).then((r) => must(r, 'load Pathshala levels')) : Promise.resolve([]),
    supabase.from('pathshala_attendance').select('enrollment_id, status, marked_at').in('enrollment_id', enrollmentIds).then((r) => must(r, 'load Pathshala attendance')),
    supabase
      .from('pathshala_progress_reports')
      .select('id, enrollment_id, period, attendance_present, attendance_late, attendance_total, teacher_comments, published_at')
      .in('enrollment_id', enrollmentIds)
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .then((r) => must(r, 'load Pathshala progress reports')),
  ]);
  return rows.map((r) => {
    const cls = classes.find((c) => c.id === r.class_id);
    return {
      ...r,
      termName: terms.find((t) => t.id === r.term_id)?.name ?? null,
      className: cls?.name ?? null,
      levelName: levels.find((l) => l.id === r.requested_level_id)?.name ?? null,
      schedule: cls ? classSchedule(cls.meets_on, cls.starts_time) : null,
      // Parents can't read pathshala_sessions, so the class day is when it was marked.
      attendance: marks.filter((m) => m.enrollment_id === r.id).map((m) => ({ status: m.status, held_on: m.marked_at.slice(0, 10) })),
      reports: reports.filter((p) => p.enrollment_id === r.id),
    };
  });
}

export type EnrollOptions = {
  terms: (Pick<Tables<'pathshala_terms'>, 'id' | 'name' | 'status' | 'starts_on' | 'ends_on' | 'registration_opens_at' | 'registration_closes_at' | 'membership_required' | 'fee_per_child_cents'>)[];
  levels: Pick<Tables<'pathshala_levels'>, 'id' | 'name' | 'sort_order' | 'track_id'>[];
  /** term id → student person ids that already have an enrollment that term. */
  taken: Record<string, string[]>;
};

/** Terms that take requests now, the levels to ask for, and who is already enrolled. */
export async function loadEnrollOptions(centerId: string, householdId: string): Promise<EnrollOptions> {
  const [terms, levels, tracks, mine] = await Promise.all([
    supabase
      .from('pathshala_terms')
      .select('id, name, status, starts_on, ends_on, registration_opens_at, registration_closes_at, membership_required, fee_per_child_cents')
      .eq('center_id', centerId)
      .in('status', ['registration', 'active'])
      .order('starts_on')
      .then((r) => must(r, 'load Pathshala terms')),
    supabase.from('pathshala_levels').select('id, name, sort_order, track_id').eq('center_id', centerId).order('sort_order').then((r) => must(r, 'load Pathshala levels')),
    supabase.from('pathshala_tracks').select('id, name').eq('center_id', centerId).then((r) => must(r, 'load Pathshala tracks')),
    supabase.from('pathshala_enrollments').select('term_id, student_person_id').eq('household_id', householdId).then((r) => must(r, 'load your enrollments')),
  ]);
  const taken: Record<string, string[]> = {};
  for (const e of mine) (taken[e.term_id] ??= []).push(e.student_person_id);
  // Group the levels by track (Gujarati, Hindi, Jainism…), in level order within each.
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  const sorted = [...levels].sort((a, b) => (trackName.get(a.track_id) ?? '').localeCompare(trackName.get(b.track_id) ?? '') || a.sort_order - b.sort_order);
  return { terms: terms.filter((t) => registrationOpen(t, new Date())), levels: sorted, taken };
}

/** Ask for a place (RLS enrollments_household_insert: an adult of the household, status requested, no class). */
export async function requestEnrollment(args: { centerId: string; termId: string; householdId: string; personId: string; levelId: string | null; note: string | null; userId: string }): Promise<void> {
  const res = await supabase.from('pathshala_enrollments').insert({
    center_id: args.centerId,
    term_id: args.termId,
    household_id: args.householdId,
    student_person_id: args.personId,
    requested_level_id: args.levelId,
    status: 'requested',
    registered_by: args.userId,
    notes: args.note,
  });
  if (res.error?.code === '23505') throw new AppError('This child already has an enrollment for that term.', res.error.message);
  check(res, 'send the enrollment request');
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
