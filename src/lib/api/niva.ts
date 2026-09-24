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
 * There is no answering service yet (it needs approved-content retrieval and
 * a model behind an edge function). The question is saved as unanswered so
 * staff see it under "Unanswered questions" in the portal.
 */
export async function askNiva(centerId: string, userId: string, question: string): Promise<NivaConversation> {
  const q = normaliseQuestion(question).slice(0, 1000);
  return must(
    await supabase.from('niva_conversations').insert({ center_id: centerId, user_id: userId, question: q, unanswered: true }).select('*').single(),
    'save your question for Niva',
  );
}
