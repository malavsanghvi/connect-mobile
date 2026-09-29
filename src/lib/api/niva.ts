import type { Tables } from '../database.types';
import { must } from '../errors';
import { normaliseQuestion } from '../learning';
import { supabase } from '../supabase';

export type NivaConversation = Tables<'niva_conversations'>;

/** This login's recent questions (RLS niva_own; rows are kept 30 days). Oldest first, as a chat reads. */
export async function listMyNivaQuestions(centerId: string, userId: string): Promise<NivaConversation[]> {
  const rows = must(
    await supabase.from('niva_conversations').select('*').eq('center_id', centerId).eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    'load your Niva questions',
  );
  return rows.reverse();
}

/**
 * Saves the question and hands it to the background worker (app.niva_ask →
 * job kind niva.answer, worker/src/handlers/niva.answer.ts), which retrieves
 * from this center's approved niva_source content and answers with an
 * Anthropic call made by connect-crm's worker — never from this app, so no
 * key ever reaches the client. The row comes back unanswered=true; `answer`
 * and `sources` fill in once the worker finishes (the caller re-fetches via
 * listMyNivaQuestions). No matching source, or the model isn't confident →
 * the row simply stays unanswered and the UI shows the existing honest
 * "still being set up" message (niva.pending) — never a fabricated answer.
 *
 * userId kept in the signature for call-site compatibility; app.niva_ask
 * always uses auth.uid() for the row's user_id, never a caller-supplied id.
 */
export async function askNiva(centerId: string, _userId: string, question: string): Promise<NivaConversation> {
  const q = normaliseQuestion(question).slice(0, 1000);
  // app.niva_ask returns the app.niva_conversations row; the codegen script maps every
  // composite return to `string` (see supabase/scripts/gen-types.mjs, same as every other
  // row-returning RPC in this schema), so the real shape is asserted here.
  const row = must(await supabase.rpc('niva_ask', { p_center: centerId, p_question: q }), 'save your question for Niva');
  return row as unknown as NivaConversation;
}
