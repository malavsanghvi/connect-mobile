import type { Tables, TablesUpdate } from '../database.types';
import { check, must } from '../errors';
import { withAuditReason } from '../request-context';
import { supabase } from '../supabase';

export type DataRequestKind = 'export' | 'deletion' | 'deactivation' | 'reactivation';

/** Privacy requests are handled by the center's privacy officer (due in 30 days). */
/** Why the account changed (audit log `reason`): the member's own request in Settings. */
const REQUEST_REASON: Record<DataRequestKind, string> = {
  export: 'Member asked for a copy of their data in Settings',
  deletion: 'Member asked to delete their account in Settings',
  deactivation: 'Member deactivated their account in Settings',
  reactivation: 'Member reactivated their account',
};

export async function createDataRequest(centerId: string, personId: string, userId: string, kind: DataRequestKind): Promise<void> {
  check(
    await withAuditReason(supabase.from('data_requests').insert({ center_id: centerId, person_id: personId, requested_by: userId, kind, status: 'open' }), REQUEST_REASON[kind]),
    kind === 'export' ? 'request your data' : 'send your request',
  );
}

/** `reason` is recorded in the audit log when the member gave one (deactivate, delete, reactivate). */
export async function updateAccount(userId: string, patch: TablesUpdate<'accounts'>, reason?: string): Promise<void> {
  check(await withAuditReason(supabase.from('accounts').update(patch).eq('user_id', userId), reason), 'update your account');
}

export async function deactivateAccount(centerId: string, personId: string, userId: string): Promise<void> {
  await createDataRequest(centerId, personId, userId, 'deactivation');
  await updateAccount(userId, { status: 'deactivated' }, REQUEST_REASON.deactivation);
}

export async function reactivateAccount(centerId: string, personId: string, userId: string): Promise<void> {
  await updateAccount(userId, { status: 'active' }, REQUEST_REASON.reactivation);
  await createDataRequest(centerId, personId, userId, 'reactivation');
}

export async function requestDeletion(centerId: string, personId: string, userId: string): Promise<void> {
  await createDataRequest(centerId, personId, userId, 'deletion');
  await updateAccount(userId, { status: 'deletion_pending', deletion_requested_at: new Date().toISOString() }, REQUEST_REASON.deletion);
}

export async function listMyDataRequests(personId: string): Promise<Tables<'data_requests'>[]> {
  return must(await supabase.from('data_requests').select('*').eq('person_id', personId).order('created_at', { ascending: false }).limit(10), 'load your requests');
}

/** Directory listing is a household setting plus a consent record. */
export async function setDirectoryOptIn(args: { centerId: string; householdId: string; personId: string; userId: string; on: boolean }): Promise<void> {
  check(await supabase.from('households').update({ directory_opt_in: args.on }).eq('id', args.householdId), 'update your directory listing');
  check(
    await supabase.from('consents').insert({ center_id: args.centerId, person_id: args.personId, given_by_user: args.userId, kind: 'directory', granted: args.on, source: 'app' }),
    'record your directory choice',
  );
}

/** Quiet hours 9 PM – 7 AM. int4range can't wrap midnight, so the end is stored as minutes past the start day (see README). */
export const QUIET_HOURS_RANGE = '[1260,1860)';

export async function getLegalDocument(centerId: string, kind: 'privacy' | 'terms'): Promise<Tables<'legal_documents'> | null> {
  const rows = must(
    await supabase.from('legal_documents').select('*').eq('kind', kind).not('published_at', 'is', null).or(`center_id.eq.${centerId},center_id.is.null`).order('published_at', { ascending: false }).limit(5),
    'load this document',
  );
  return rows.find((r) => r.center_id === centerId) ?? rows[0] ?? null;
}
