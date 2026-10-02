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
 * The current copy of the given questions (RLS niva_own), in one request: the
 * Niva screen calls this every few seconds while a question is being looked
 * up, to show the answer as soon as the worker stores it. `select('*')` also
 * brings answer_status (connect-crm 0572) once the database has it; the app
 * reads that column defensively (learning.ts nivaAnswerStatus) because the
 * copied types may not carry it yet.
 */
export async function getNivaConversations(ids: string[]): Promise<NivaConversation[]> {
  if (ids.length === 0) return [];
  return must(await supabase.from('niva_conversations').select('*').in('id', ids), "check for Niva's answer");
}

/**
 * Saves the question and hands it to the background worker (app.niva_ask →
 * job kind niva.answer, worker/src/handlers/niva.answer.ts), which retrieves
 * from this center's published niva_source content and answers with an
 * Anthropic call made by connect-crm's worker — never from this app, so no
 * key ever reaches the client. The row comes back unanswered (answer null);
 * the Niva screen keeps it, shows "Looking that up for you…" and polls
 * getNivaConversations until `answer` and `sources` fill in. When the worker
 * finds no matching source or the model isn't confident, the row stays
 * unanswered (answer_status says why once the database has it): after the
 * wait (learning.ts NIVA_WAIT_MS) the screen says it cannot answer and offers
 * Send to the team — never a fabricated answer.
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
