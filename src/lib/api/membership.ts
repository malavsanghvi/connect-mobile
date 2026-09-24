import type { Database } from '../database.types';
import { AppError, check, must } from '../errors';
import { withAuditReason } from '../request-context';
import { supabase } from '../supabase';

// Membership applications (connect-crm 0130): the member applies with a named
// reference; the reference approves in their own app; the center (and, for
// Life, a second Executive Committee member) approves in the portal; approval
// creates the membership and records any fee as an open pledge.

type Fn<K extends keyof Database['app']['Functions']> = Database['app']['Functions'][K]['Returns'];

export type ReferenceMatch = Fn<'find_membership_reference'>[number];
export type MyApplication = Fn<'my_membership_application'>[number];
export type ReferenceRequest = Fn<'my_reference_requests'>[number];
export type ReferenceDecision = 'approved' | 'declined' | 'unknown';

/** Exact match on the reference's email, mobile or member number; never a browse. */
export async function findReference(centerId: string, typeId: string, contact: string): Promise<ReferenceMatch[]> {
  const value = contact.trim();
  if (value.length < 4) throw new AppError("Enter your reference's email, mobile number or member number.", 'reference contact too short');
  return must(await supabase.rpc('find_membership_reference', { p_center: centerId, p_type: typeId, p_contact: value }), 'look up your reference');
}

export async function submitApplication(args: { centerId: string; typeId: string; referenceId: string | null; note: string }): Promise<string> {
  const id = must(
    await supabase.rpc('submit_membership_application', {
      p_center: args.centerId,
      p_type: args.typeId,
      // The RPC skips the reference for types that don't need one.
      p_reference: args.referenceId as string,
      p_note: args.note.trim(),
    }),
    'send your application',
  );
  return id;
}

export async function myApplication(centerId: string): Promise<MyApplication | null> {
  const rows = must(await supabase.rpc('my_membership_application', { p_center: centerId }), 'load your membership application');
  return rows[0] ?? null;
}

export async function myReferenceRequests(): Promise<ReferenceRequest[]> {
  return must(await supabase.rpc('my_reference_requests'), 'load the reference requests');
}

/** The reason stays private to the membership team; it also goes on the audit entry. */
export async function decideReference(applicationId: string, decision: ReferenceDecision, reason: string): Promise<void> {
  const text = reason.trim();
  if (decision === 'declined' && !text) throw new AppError('Tell the membership team why (only they see it).', 'decline without reason');
  check(
    await withAuditReason(supabase.rpc('decide_reference', { p_application: applicationId, p_decision: decision, p_reason: text || undefined }), text || `Reference ${decision}`),
    'send your reference decision',
  );
}

/** Open statuses, for "application in progress" copy. */
export const OPEN_APPLICATION = ['draft', 'awaiting_reference', 'reference_declined', 'awaiting_center', 'awaiting_ec'] as const;

export function isOpenApplication(status: string | null | undefined): boolean {
  return !!status && (OPEN_APPLICATION as readonly string[]).includes(status);
}
