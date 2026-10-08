import { attemptDetail, parseAttemptResult, type AttemptDetail, type AttemptResult, type LedgerRow } from '@/features/gyan/points';

import type { Tables } from '../database.types';
import { AppError, check, logError, maybe, must, report } from '../errors';
import { supabase } from '../supabase';

import { isMissingBucket } from './photos';

import { classSchedule, continueGoalId, registrationOpen, todayAtMinutes, type AttendanceMark, type DailyMinutes } from '../learning';
import { buildGyanSummary, goalProgress, GYAN_SUMMARY_COLUMNS, isLevelDone, isStepDone, lastActivityByGoal, type GoalProgress as GoalProgressOf, type GyanSummary, type ProgressMark } from '../gyan-progress';
import { NO_HOLD, type FeePledge, type HoldInfo } from '../pathshala-registration';

import type { Center } from './member';
import { loadEnrollmentDetails } from './pathshala';

// The progress arithmetic is pure and lives in src/lib/gyan-progress.ts (with the summary Home reads); it is re-exported here so every screen keeps one place to import from.
export { goalProgress, isLevelDone, isStepDone, lastActivityByGoal };
export type { GyanSummary };

export type GyanStep = Tables<'gyan_steps'>;
export type GyanLevel = Tables<'gyan_levels'> & { steps: GyanStep[] };
export type GyanGoal = Tables<'gyan_goals'> & { levels: GyanLevel[] };
export type GyanProgress = Tables<'gyan_progress'>;
export type GyanSignoff = Tables<'gyan_signoffs'>;

export type GyanData = { goals: GyanGoal[]; progress: GyanProgress[]; signoffs: GyanSignoff[] };

/**
 * Goals → levels → steps for the center (or its tradition), with progress for
 * the given people. `goalKey` loads only the goals with that key (the virtual
 * puja finds the Navang puja lesson by its key, without loading every lesson).
 */
export async function loadGyan(center: Center, personIds: string[], opts?: { goalKey?: string }): Promise<GyanData> {
  let goalsQuery = supabase.from('gyan_goals').select('*').or(`center_id.eq.${center.id},center_id.is.null`);
  if (opts?.goalKey) goalsQuery = goalsQuery.eq('key', opts.goalKey);
  const goals = must(await goalsQuery.order('sort_order'), 'load Gyan Path goals').filter((g) => !g.tradition || g.tradition === center.tradition);
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

/**
 * What Home's Continue learning needs of Gyan Path: the goals, their levels, the id of every step and the person's
 * progress, and nothing of the lessons (GYAN_SUMMARY_COLUMNS). loadGyan selects every column, quizzes and activities included,
 * which is most of the data (about 135 KB for the content pack) and was fetched on every Home load. The answers
 * (goalProgress, lastActivityByGoal) are the same from either.
 */
export async function loadGyanSummary(center: Center, personId: string): Promise<GyanSummary> {
  const goals = must(await supabase.from('gyan_goals').select(GYAN_SUMMARY_COLUMNS.goals).or(`center_id.eq.${center.id},center_id.is.null`).order('sort_order'), 'load Gyan Path goals').filter((g) => !g.tradition || g.tradition === center.tradition);
  const goalIds = goals.map((g) => g.id);
  const levels = goalIds.length ? must(await supabase.from('gyan_levels').select(GYAN_SUMMARY_COLUMNS.levels).in('goal_id', goalIds).order('sort_order'), 'load Gyan Path levels') : [];
  const levelIds = levels.map((l) => l.id);
  const [stepsRes, progressRes] = await Promise.all([
    levelIds.length ? supabase.from('gyan_steps').select(GYAN_SUMMARY_COLUMNS.steps).in('level_id', levelIds) : Promise.resolve({ data: [] as { id: string; level_id: string }[], error: null }),
    supabase.from('gyan_progress').select(GYAN_SUMMARY_COLUMNS.progress).eq('person_id', personId),
  ]);
  const steps = must(stepsRes, 'load Gyan Path lessons');
  const progress: ProgressMark[] = must(progressRes, 'load your progress');
  return buildGyanSummary({ goals, levels, steps, progress });
}

export type GoalProgress = GoalProgressOf<GyanLevel>;

/**
 * The level "continue" opens (3L › Learn hero, Home › Learn shortcut): the
 * first unfinished level of the goal the person is working on (continueGoalId:
 * most recently active unfinished goal, else the recommended one, else the
 * first). Null when every goal is finished, the goal has no levels yet or
 * there are no goals — the caller opens the goals screen (/gyan) instead.
 */
export function nextGyanLevel(g: Pick<GyanData, 'goals' | 'progress'>, personId: string): { goal: GyanGoal; level: GyanLevel } | null {
  const id = continueGoalId(g.goals, lastActivityByGoal(g, personId), (goal) => goalProgress(goal, g.progress, personId).complete);
  const goal = g.goals.find((x) => x.id === id);
  if (!goal) return null;
  const p = goalProgress(goal, g.progress, personId);
  return p.complete || !p.currentLevel ? null : { goal, level: p.currentLevel };
}

/**
 * Mark a step complete for yourself (RLS: gyan_progress_own requires person = me).
 * The saved row is read first, not the copy taken when the lesson opened: a
 * practice try may have saved the step since (app.record_gyan_attempt), and
 * stars never go down and the first completion time is kept (the server
 * keeps both too). Returns the stars now saved and whether this was the
 * step's first completion, which is when the server pays its points.
 */
export async function completeStep(centerId: string, personId: string, stepId: string, stars: number, recordingPath?: string | null): Promise<{ stars: number; firstTime: boolean }> {
  const prev = maybe(await supabase.from('gyan_progress').select('stars, completed_at').eq('person_id', personId).eq('step_id', stepId).maybeSingle(), 'save your progress');
  const best = Math.max(prev?.stars ?? 0, Math.max(0, Math.min(3, Math.round(stars))));
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
  return { stars: best, firstTime: !prev?.completed_at };
}

/**
 * Points paid for a level's steps, its bonus and its treasure since `since`
 * (an ISO time a little before the lesson started), for the celebration: it
 * shows what the server paid, not what the phone expects (RLS points_own:
 * your own ledger rows).
 */
export async function loadLevelAwards(personId: string, level: Pick<GyanLevel, 'id' | 'steps'>, since: string): Promise<LedgerRow[]> {
  const refIds = [level.id, ...level.steps.map((s) => s.id)];
  return must(
    await supabase.from('points_ledger').select('points, reason, ref_id').eq('person_id', personId).in('reason', ['level', 'gyan_treasure']).in('ref_id', refIds).gte('occurred_at', since).limit(500),
    'load the points from this level',
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
/** Storage area for recitations (0172: the child, their parents and teachers may read; kept 90 days). */
export const RECITATION_BUCKET = 'recordings';
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

/**
 * SQLSTATEs whose messages record_gyan_attempt writes for people: the step or
 * community was not found (P0002: "…reload the lesson"), a bad value (22023),
 * not a member, or another community's lesson (42501).
 */
const ATTEMPT_OWN_MESSAGES = new Set(['P0002', '22023', '42501']);

/**
 * One practice try (Navang puja, voice): app.record_gyan_attempt records it
 * and pays the step's repeat points for a success, up to the community's
 * daily cap. `tryId` is made once per try and sent again when that same try
 * is retried after a lost answer; the server then returns its first answer
 * (`replayed`) and pays nothing twice. Returns what the server awarded.
 */
export async function recordGyanAttempt(args: { centerId: string; stepId: string; tryId: string; success: boolean; score: number | null; detail: AttemptDetail }): Promise<AttemptResult> {
  const res = await supabase.rpc('record_gyan_attempt', {
    p_center: args.centerId,
    p_step: args.stepId,
    p_success: args.success,
    ...(args.score === null ? {} : { p_score: Math.max(0, Math.min(100, Math.round(args.score))) }),
    p_detail: attemptDetail(args.detail, args.tryId),
  });
  const err = res.error;
  if (err?.code && ATTEMPT_OWN_MESSAGES.has(err.code) && err.message && !/permission denied|row-level security/i.test(err.message)) {
    const e = new AppError(/[.!?]$/.test(err.message) ? err.message : `${err.message}.`, `record_gyan_attempt: ${err.message} | code=${err.code}`, err.code);
    logError('save your practice try', e);
    throw e;
  }
  return parseAttemptResult(must(res, 'save your practice try'));
}

/**
 * Successful practice tries of a step since the community's midnight, for the
 * "3 of 10 today" counter (RLS: your own gyan_attempts rows).
 */
export async function loadTriesToday(personId: string, stepId: string, timeZone: string | null): Promise<number> {
  const since = todayAtMinutes(0, new Date(), timeZone).toISOString();
  const res = await supabase.from('gyan_attempts').select('id', { count: 'exact', head: true }).eq('person_id', personId).eq('step_id', stepId).eq('success', true).gte('created_at', since);
  if (res.error) throw report(res.error, 'load your practice tries for today');
  return res.count ?? 0;
}

export async function requestSignoff(centerId: string, personId: string, levelId: string): Promise<void> {
  check(await supabase.from('gyan_signoffs').insert({ center_id: centerId, person_id: personId, level_id: levelId, status: 'requested' }), 'request a teacher sign-off');
}

// gyan_steps.quiz is parsed by parseQuestions (src/features/gyan/activity.ts): choice, truefalse, order, match, fill.

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
  /**
   * A seat held for payment, an offer from the waitlist, the waitlist place, another hold (connect-crm 0591; all null
   * before 0591): from `app.pathshala_registration_options` (`learners[].enrollments[]`), never from the table. A child's
   * answer carries no reason (P30).
   */
  hold: HoldInfo;
  /** Why the seat was released, when it was because of the fee; adults only (the options answer). */
  withdrawalReason: string | null;
  /** The database's sentence of where the registration stands; adults only. */
  state: string | null;
  /** The term lets a family pay at the office instead (0590; false before). */
  officePaymentAllowed: boolean;
  /** The enrollment's fee pledge from the options (`fee.pledge`): adults only; a child never sees fees (plan P30). */
  fees: FeePledge[];
};

/**
 * The household's enrollments for 3L › Learn. `adult`: the viewer is an adult of the household (the fees, the holds and
 * the sentences about them are theirs to see, P30). Where each seat stands beyond its status, the fee and the term's
 * payment rules come from one options call for each term (`loadEnrollmentDetails`); a seat released because the fee was
 * not paid in time stays in the list for an adult, with the database's sentence, until it is registered again.
 */
export async function loadPathshala(householdId: string, opts: { adult?: boolean } = {}): Promise<Enrollment[]> {
  const all = must(await supabase.from('pathshala_enrollments').select('*').eq('household_id', householdId).order('registered_at', { ascending: false }), 'load Pathshala enrollments');
  if (all.length === 0) return [];
  const termIds = [...new Set(all.map((r) => r.term_id))];
  const adult = opts.adult === true;
  const terms = must(await supabase.from('pathshala_terms').select('id, name').in('id', termIds), 'load Pathshala terms');
  const details = await loadEnrollmentDetails(householdId, terms);
  // A withdrawn enrollment is not shown, except a seat released for the fee (the sentence is the adults').
  const rows = all.filter((r) => r.status !== 'withdrawn' || (adult && !!details.get(r.id)?.withdrawalReason));
  if (rows.length === 0) return [];
  const classIds = [...new Set(rows.map((r) => r.class_id).filter((x): x is string => !!x))];
  const levelIds = [...new Set(rows.map((r) => r.requested_level_id).filter((x): x is string => !!x))];
  const enrollmentIds = rows.map((r) => r.id);
  const [classes, levels, marks, reports] = await Promise.all([
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
    const term = terms.find((t) => t.id === r.term_id);
    const detail = details.get(r.id);
    return {
      ...r,
      termName: term?.name ?? null,
      className: cls?.name ?? null,
      levelName: levels.find((l) => l.id === r.requested_level_id)?.name ?? null,
      schedule: cls ? classSchedule(cls.meets_on, cls.starts_time) : null,
      // Parents can't read pathshala_sessions, so the class day is when it was marked.
      attendance: marks.filter((m) => m.enrollment_id === r.id).map((m) => ({ status: m.status, held_on: m.marked_at.slice(0, 10) })),
      reports: reports.filter((p) => p.enrollment_id === r.id),
      hold: detail?.hold ?? NO_HOLD,
      withdrawalReason: adult ? (detail?.withdrawalReason ?? null) : null,
      state: adult ? (detail?.state ?? null) : null,
      officePaymentAllowed: detail?.officeAllowed ?? false,
      fees: adult ? (detail?.pledges ?? []) : [],
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

export type TeacherPosition = Pick<Tables<'teacher_positions'>, 'id' | 'title' | 'description' | 'min_qualifications' | 'term_id' | 'level_id'>;
export type TeacherApplication = Pick<Tables<'teacher_applications'>, 'id' | 'position_id' | 'outcome' | 'submitted_at'>;

/** Open positions (RLS teacher_positions_member_read) and my own applications (teacher_apps_own). */
export async function loadTeaching(centerId: string, personId: string): Promise<{ positions: TeacherPosition[]; mine: TeacherApplication[] }> {
  const [positions, mine] = await Promise.all([
    supabase.from('teacher_positions').select('id, title, description, min_qualifications, term_id, level_id').eq('center_id', centerId).eq('status', 'open').order('created_at', { ascending: false }).then((r) => must(r, 'load teacher positions')),
    supabase.from('teacher_applications').select('id, position_id, outcome, submitted_at').eq('center_id', centerId).eq('person_id', personId).order('submitted_at', { ascending: false }).then((r) => must(r, 'load your applications')),
  ]);
  return { positions, mine };
}

/** Apply to teach (RLS teacher_apps_insert: my own person, outcome pending). */
export async function applyToTeach(args: {
  centerId: string;
  positionId: string;
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  education: string | null;
  qualifications: string | null;
  activities: string | null;
  motivation: string | null;
}): Promise<void> {
  check(
    await supabase.from('teacher_applications').insert({
      center_id: args.centerId,
      position_id: args.positionId,
      person_id: args.personId,
      name: args.name,
      email: args.email,
      phone_e164: args.phone,
      education: args.education,
      qualifications: args.qualifications,
      relevant_activities: args.activities,
      motivation: args.motivation,
      outcome: 'pending',
    }),
    'send your application',
  );
}
