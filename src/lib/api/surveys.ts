import type { Json, Tables } from '../database.types';
import { AppError, check, logError, must } from '../errors';
import { readPref, writePref } from '../storage';
import { supabase } from '../supabase';

export type QuestionType = 'rating' | 'nps' | 'single' | 'multi' | 'text';

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
      t === 'rating' || t === 'stars' ? 'rating' : t === 'nps' || t === 'scale_10' ? 'nps' : t === 'single' || t === 'choice' || t === 'radio' || t === 'likert' || t === 'scale' ? 'single' : t === 'multi' || t === 'checkbox' || t === 'multiple' ? 'multi' : 'text';
    const options = Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === 'string') : [];
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

export async function submitSurvey(args: { centerId: string; surveyId: string; personId: string | null; answers: Answers }): Promise<void> {
  if (Object.keys(args.answers).length === 0) throw new AppError('Please answer at least one question.', 'empty survey');
  check(
    await supabase.from('survey_responses').insert({ center_id: args.centerId, survey_id: args.surveyId, person_id: args.personId, answers: args.answers as Json }),
    'send your answers',
  );
  if (args.personId === null) {
    try {
      const done = await readPref<string[]>('answeredSurveys', []);
      await writePref('answeredSurveys', [...new Set([...done, args.surveyId])]);
    } catch (err) {
      logError('remembering an anonymous survey answer on this device (it may be shown again)', err);
    }
  }
}
