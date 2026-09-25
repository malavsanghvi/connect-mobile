import { fromRows, type LegalStepDoc } from '@/features/legal-step';

import { check, logError, must, report } from '../errors';
import { supabase } from '../supabase';

/**
 * The signed-in member's legal step (app.member_legal_steps, connect-crm 0422). Returns null only
 * when this community's database does not have the step yet (an older schema): logged, and the
 * app carries on without it. Any other failure throws so the member sees it with a retry.
 */
export async function loadLegalSteps(centerId: string): Promise<LegalStepDoc[] | null> {
  const res = await supabase.rpc('member_legal_steps', { p_center: centerId });
  if (res.error) {
    const code = (res.error as { code?: string }).code;
    if (code === 'PGRST202' || code === '42883') {
      logError('the legal step is not in this database yet (app.member_legal_steps missing); continuing without it', res.error);
      return null;
    }
    throw report(res.error, "load your community's documents");
  }
  return fromRows(must(res, "load your community's documents"));
}

/** Records every answer with the exact version (app.record_member_legal_answers). */
export async function recordLegalAnswers(centerId: string, answers: { document_id: string; granted: boolean }[]): Promise<void> {
  check(await supabase.rpc('record_member_legal_answers', { p_center: centerId, p_answers: answers }), 'record your answers');
}
