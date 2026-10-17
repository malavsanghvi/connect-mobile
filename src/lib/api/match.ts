import { en } from '@/i18n/en';

import { AppError, logError } from '../errors';
import { cleanEmployer, parseEmployerAnswer, parseMatchCard, parseReported, type MatchCard } from '../match';
import { supabase } from '../supabase';

import { actionError } from './payments';

/**
 * Does your employer match? (CatchTheMatch, connect-crm 0759 and 0920 to 0922). All on schema `app`, all for the signed-in
 * person's OWN card in the community `p_center`; every refusal is a plain sentence the member reads next to what they did.
 *   app.my_match_card              the card: the employer (only if THIS sign-in consented), the steps, the organization's name
 *                                  and tax ID, the gifts that can still be claimed (days only) and the member's own requests
 *   app.set_my_match_employer      adds or changes the employer: the person's consent, right now
 *   app.remove_my_match_employer   withdraws it at once
 *   app.report_my_match_request    "I have asked my employer"
 *   app.undo_my_match_request      takes one request back
 * There is no amount in any of it. Nothing here says "done" until the database has answered.
 */

function unusable(what: string, fn: string, data: unknown): AppError {
  const err = new AppError(`We couldn't ${what} — the answer was not what we expected. Please try again.`, `${fn} returned an unusable answer: ${JSON.stringify(data)?.slice(0, 300) ?? 'nothing'}`);
  logError(what, err);
  return err;
}

/** The member's card. A newer database that sends a request in a state this build does not know is logged, and that request is left out. */
export async function loadMatchCard(centerId: string): Promise<MatchCard> {
  const res = await supabase.rpc('my_match_card', { p_center: centerId });
  if (res.error) throw actionError('Could not load your employer match', 'load your employer match', res.error);
  const card = parseMatchCard(res.data);
  if (!card) throw unusable('load your employer match', 'my_match_card', res.data);
  if (card.skippedClaims > 0) logError('load your employer match', new Error(`${card.skippedClaims} request(s) in an unknown shape or state were left out`));
  return card;
}

/** Add or change the employer. This is the person's consent, so it is only ever called from the member pressing the button. */
export async function setMyMatchEmployer(centerId: string, employer: string): Promise<string> {
  const clean = cleanEmployer(employer);
  if (!clean.ok) {
    const err = new AppError(clean.problem === 'empty' ? en['matching.employer.empty'] : en['matching.employer.long'], `employer rejected before sending: ${clean.problem}`);
    logError('add your employer', err);
    throw err;
  }
  const res = await supabase.rpc('set_my_match_employer', { p_center: centerId, p_employer: clean.employer });
  if (res.error) throw actionError('Could not save your employer', 'save your employer', res.error);
  // The answer is the employer now on file: "saved" is said only when the database says it is there.
  const saved = parseEmployerAnswer(res.data);
  if (!saved) throw unusable('save your employer', 'set_my_match_employer', res.data);
  return saved;
}

/** Withdraw the employer at once. False when nothing of this sign-in's was on file any more (it was already removed). */
export async function removeMyMatchEmployer(centerId: string): Promise<boolean> {
  const res = await supabase.rpc('remove_my_match_employer', { p_center: centerId });
  if (res.error) throw actionError('Could not remove your employer', 'remove your employer', res.error);
  // The generated type says boolean; a portal or a proxy in between could still answer something else.
  const answer: unknown = res.data;
  if (typeof answer !== 'boolean') throw unusable('remove your employer', 'remove_my_match_employer', answer);
  return answer;
}

/** "I have asked my employer": how many gifts were marked as asked. The database refuses, in words, when there is nothing to report or no steps yet. */
export async function reportMyMatchRequest(centerId: string): Promise<number> {
  const res = await supabase.rpc('report_my_match_request', { p_center: centerId });
  if (res.error) throw actionError('Could not record that you asked your employer', 'record that you asked your employer', res.error);
  const n = parseReported(res.data);
  if (n === null) throw unusable('record that you asked your employer', 'report_my_match_request', res.data);
  return n;
}

/** Take one request back (only while the database says it can be). */
export async function undoMyMatchRequest(centerId: string, claimId: string): Promise<void> {
  const res = await supabase.rpc('undo_my_match_request', { p_center: centerId, p_claim: claimId });
  if (res.error) throw actionError('Could not take your request back', 'take your request back', res.error);
  if (res.data !== true) throw unusable('take your request back', 'undo_my_match_request', res.data);
}
