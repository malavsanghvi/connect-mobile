import { parseAccess, type AccessSnapshot } from '../access';
import { AppError, logError, report } from '../errors';
import { isMissingRpcError } from '../modules';
import { supabase } from '../supabase';

/** The portal's answer, or `missing`: it does not have the function yet (an older portal), so the rules from before apply. */
export type AccessAnswer = { kind: 'answered'; snapshot: AccessSnapshot } | { kind: 'missing' };

let loggedMissing = false;

/**
 * What the signed-in person, or a visitor who is not signed in, may use in this community. It works without
 * a session: the client then asks as the anonymous role, which the function is granted to.
 *
 * Rejects with a plain-English AppError when the answer cannot be had (no connection, a refusal, an answer
 * that is not the expected shape); the caller shows it with a retry. A function that is not deployed yet is
 * not a failure: it is `missing`, logged once.
 */
export async function loadAccess(centerId: string): Promise<AccessAnswer> {
  const res = await supabase.rpc('feature_access_for_me', { p_center: centerId });
  if (res.error) {
    if (isMissingRpcError(res.error)) {
      if (!loggedMissing) {
        loggedMissing = true;
        logError("checking what you can use: app.feature_access_for_me is not deployed yet, so the rules from before apply (members: everything; visitors: the guide and today's timings)", res.error);
      }
      return { kind: 'missing' };
    }
    throw report(res.error, 'check what you can use here');
  }
  const snapshot = parseAccess(res.data);
  if (!snapshot) {
    const err = new AppError("We couldn't check what you can use here — the answer was not what we expected. Please try again.", `feature_access_for_me returned an unusable answer: ${JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'}`);
    logError('check what you can use here', err);
    throw err;
  }
  return { kind: 'answered', snapshot };
}
