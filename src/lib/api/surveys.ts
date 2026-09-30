import type { Json, Tables } from '../database.types';
import { AppError, logError, must } from '../errors';
import { readPref, writePref } from '../storage';
import { supabase } from '../supabase';
import { parseDismissals, recordDismissal, type Dismissals } from '../survey-popup';

export type QuestionType = 'rating' | 'nps' | 'likert' | 'single' | 'multi' | 'text';

/** Default five-point scale for likert questions without options (prototype "Rate each part"). */
export const LIKERT_DEFAULT = ['Poor', 'Fair', 'Good', 'Great', 'Superb'];

export type Question = { id: string; type: QuestionType; label: string; options: string[]; required: boolean; scale: string[] };

/** Normalise surveys.questions jsonb ([{id,type,label,options,required}]) defensively. */
export function parseQuestions(raw: Json): Question[] {
  if (!Array.isArray(raw)) return [];
  const out: Question[] = [];
  raw.forEach((q, i) => {
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    const o = q as Record<string, Json | undefined>;
    const label = typeof o.label === 'string' ? o.label : typeof o.text === 'string' ? o.text : null;
    if (!label) return;
    const t = typeof o.type === 'string' ? o.type.toLowerCase() : 'text';
    const type: QuestionType =
      t === 'rating' || t === 'stars' ? 'rating' : t === 'nps' || t === 'scale_10' ? 'nps' : t === 'likert' || t === 'scale' ? 'likert' : t === 'single' || t === 'choice' || t === 'radio' ? 'single' : t === 'multi' || t === 'checkbox' || t === 'multiple' ? 'multi' : 'text';
    const given = Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : [];
    const options = type === 'likert' && given.length === 0 ? LIKERT_DEFAULT : given;
    out.push({
      id: typeof o.id === 'string' ? o.id : String(o.id ?? `q${i + 1}`),
      type: type === 'single' && options.length === 0 ? 'text' : type,
      label,
      options,
      required: o.required === true,
      scale: Array.isArray(o.scale) ? o.scale.filter((x): x is string => typeof x === 'string') : [],
    });
  });
  return out;
}

export type Answers = Record<string, string | number | string[]>;

export function missingRequired(questions: Question[], answers: Answers): Question | null {
  for (const q of questions) {
    if (!q.required) continue;
    const a = answers[q.id];
    if (a === undefined || a === '' || (Array.isArray(a) && a.length === 0)) return q;
  }
  return null;
}

export async function getSurvey(id: string): Promise<Tables<'surveys'>> {
  return must(await supabase.from('surveys').select('*').eq('id', id).single(), 'load this survey');
}

/**
 * Surveys this person has already answered. `survey_completions` is the source
 * of truth (it is written by app.submit_survey, also for anonymous answers,
 * whose answer row carries no person). Two older records are still honoured so
 * a survey answered before that existed is not offered again: answers that
 * carry the person, and anonymous answers this device remembered.
 */
export async function listCompletedSurveyIds(personId: string): Promise<Set<string>> {
  const [completions, answers, onThisDevice] = await Promise.all([
    supabase.from('survey_completions').select('survey_id').eq('person_id', personId),
    supabase.from('survey_responses').select('survey_id').eq('person_id', personId),
    readPref<string[]>('answeredSurveys', []),
  ]);
  const ids = [...must(completions, 'check which surveys you have answered'), ...must(answers, 'check which surveys you have answered')].map((r) => r.survey_id);
  return new Set([...ids, ...onThisDevice]);
}

export type SubmitResult = { points: number; anonymous: boolean };

/** app.submit_survey returns { points, anonymous }; read it defensively. */
export function parseSubmitResult(raw: Json | null | undefined): SubmitResult {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, Json | undefined>) : {};
  const points = typeof o.points === 'number' && Number.isFinite(o.points) && o.points > 0 ? Math.floor(o.points) : 0;
  return { points, anonymous: o.anonymous === true };
}

/** The server refused because this person already answered (it says so in plain English). */
export function isAlreadyAnswered(err: unknown): boolean {
  return err instanceof AppError && err.code === 'P0001' && /already answered/i.test(err.detail);
}

/**
 * Answer a survey through app.submit_survey: it saves the answer, records that
 * this person answered (so it is not offered again and reminders stop) and
 * awards the survey's points once. `anonymous` only matters for surveys that
 * are not anonymous by themselves (the server ORs the two).
 */
export async function submitSurvey(args: { surveyId: string; answers: Answers; anonymous: boolean }): Promise<SubmitResult> {
  if (Object.keys(args.answers).length === 0) throw new AppError('Please answer at least one question.', 'empty survey');
  const raw = must(await supabase.rpc('submit_survey', { p_survey: args.surveyId, p_answers: args.answers as Json, p_anonymous: args.anonymous }), 'send your answers');
  return parseSubmitResult(raw);
}

// ---------------------------------------------------------------------------
// "How was <event>?" pop-up: which surveys the member already closed, per day
// ---------------------------------------------------------------------------

const POPUP_PREF = 'surveyPopupDismissed';

/** Survey id → the day (center's local date) the member last closed its pop-up. Never throws. */
export async function readPopupDismissals(): Promise<Dismissals> {
  try {
    return parseDismissals(await readPref<unknown>(POPUP_PREF, {}));
  } catch (err) {
    logError('reading which feedback pop-ups were closed on this device (the pop-up may show again today)', err);
    return {};
  }
}

/**
 * Remember on this device that the pop-up for a survey was closed today. A
 * failure is logged and returns false: the caller keeps the pop-up closed for
 * this session instead, so the member is never nagged over a storage problem.
 */
export async function rememberPopupDismissed(surveyId: string, today: string): Promise<boolean> {
  try {
    const current = await readPopupDismissals();
    await writePref(POPUP_PREF, recordDismissal(current, surveyId, today));
    return true;
  } catch (err) {
    logError('remembering that the feedback pop-up was closed on this device (it may show again today)', err);
    return false;
  }
}
