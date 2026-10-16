import { en } from '@/i18n/en';

import { AppError, logError, report } from '../errors';
import { storageProblem } from '../homework';
import { isMissingRpcError } from '../modules';
import {
  MAX_KEY_CHARS,
  MAX_NOTE_CHARS,
  MAX_PROOF_BYTES,
  MAX_PROOF_FILES,
  PROOF_BUCKET,
  parseEvidence,
  parsePolicy,
  parseProof,
  parseProofs,
  parseSubmitted,
  proofFileProblem,
  proofFileType,
  proofStoragePath,
  type EvidenceItem,
  type FileProblem,
  type PaymentProof,
  type ProofPolicy,
  type SubmittedProof,
  type UploadedProofFile,
} from '../proofs';
import { newRequestId } from '../request-context';
import { supabase } from '../supabase';
import { BUCKETS, signedUrls } from './files';
import { actionError } from './payments';

/**
 * Payment proofs (connect-crm 0865 to 0867, docs/PAYMENT_PROOFS_AND_RECONCILIATION_PLAN.md):
 *   storage payment-evidence       the family's photos, at <center>/<household>/<proof>/<random>.<ext>
 *   app.submit_payment_proof       one claim, created AFTER the files are up; credits nobody, it reserves Soft credit
 *   app.withdraw_payment_proof     take a waiting proof back
 *   app.answer_proof_question      answer the treasury team with more photos
 *   app.my_payment_proofs          the family's proofs, with their timeline and files
 *   app.pledge_evidence            every proof and file connected to one pledge, in any status and year
 *   app.proof_policy               the community's rules (which methods need a proof, how long files are kept)
 * The app never records a payment itself. "Sent" is said only after the database has answered with the proof.
 */

/** A photo the family picked and has not sent yet. `id` is local to the sheet; `bytes` is what the picker knew (null when unknown). */
export type PickedProofFile = { id: string; uri: string; fileName: string | null; mimeType: string | null; bytes: number | null };

/**
 * One try at sending a proof. It is made when the sheet opens and kept through retries: the same proof id (the folder the
 * files go in) and the same confirmation key, so a retry after a lost answer is recognised by the database as the same
 * proof and never sends a second one. Files already uploaded are remembered and not uploaded again.
 */
export type ProofAttempt = { proofId: string; key: string; uploaded: Map<string, UploadedProofFile> };

export function newProofAttempt(): ProofAttempt {
  const key = `proof-${newRequestId()}`;
  return { proofId: newRequestId(), key: key.slice(0, MAX_KEY_CHARS), uploaded: new Map() };
}

const PROBLEM_MESSAGE: Record<FileProblem, string> = { type: en['proof.err.type'], size: en['proof.err.size'], empty: en['proof.err.empty'] };

/** Turned away for what the file is: the same file can never go through, so the sheet offers Remove, not Try again. */
export class ProofFileRefused extends AppError {}

/** The words for a failed storage upload: the bucket's own refusals in plain English, else the connection. */
function uploadMessage(error: { message?: string; status?: number | string; statusCode?: number | string; code?: string; error?: string }): string {
  const problem = storageProblem(error);
  if (problem === 'type') return en['proof.err.type'];
  if (problem === 'size') return en['proof.err.size'];
  if (problem === 'locked') return en['proof.err.locked'];
  return en['proof.err.upload'];
}

/**
 * Upload one picked file to the `payment-evidence` bucket and describe it for `submit_payment_proof`. The bucket's rules are
 * checked here first, with plain messages, before anything is sent: the type (JPEG, PNG, WebP, HEIC, PDF) and 10 MB.
 */
export async function uploadProofFile(args: { centerId: string; householdId: string; proofId: string; file: PickedProofFile }): Promise<UploadedProofFile> {
  const { file } = args;
  const early = proofFileType({ fileName: file.fileName, mimeType: file.mimeType, uri: file.uri });
  if (!early) throw new ProofFileRefused(PROBLEM_MESSAGE.type, `a file of type ${file.mimeType ?? 'unknown'} is not one the ${PROOF_BUCKET} bucket takes`);
  if (file.bytes !== null) {
    const known = proofFileProblem({ contentType: early.contentType, bytes: file.bytes });
    if (known) throw new ProofFileRefused(PROBLEM_MESSAGE[known], `${known}: ${file.bytes} bytes (limit ${MAX_PROOF_BYTES})`);
  }
  let res: Response;
  let body: ArrayBuffer;
  try {
    res = await fetch(file.uri);
    body = await res.arrayBuffer();
  } catch (err) {
    throw new AppError(en['proof.err.read'], `reading ${file.uri}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const type = proofFileType({ fileName: file.fileName, mimeType: file.mimeType, uri: file.uri, reported: res.headers?.get?.('content-type') });
  if (!type) throw new ProofFileRefused(PROBLEM_MESSAGE.type, `the file reported a type the ${PROOF_BUCKET} bucket does not take`);
  const problem = proofFileProblem({ contentType: type.contentType, bytes: body.byteLength });
  if (problem) throw new ProofFileRefused(PROBLEM_MESSAGE[problem], `${problem}: ${body.byteLength} bytes (limit ${MAX_PROOF_BYTES})`);
  const path = proofStoragePath({ centerId: args.centerId, householdId: args.householdId, proofId: args.proofId, id: newRequestId(), ext: type.ext });
  const up = await supabase.storage.from(PROOF_BUCKET).upload(path, body, { contentType: type.contentType, upsert: false });
  if (up.error) {
    const e = up.error as { message: string; status?: number | string; statusCode?: number | string; code?: string };
    const detail = `storage upload to ${PROOF_BUCKET}/${path}: ${e.message} | status=${String(e.status ?? '')} statusCode=${String(e.statusCode ?? '')} code=${String(e.code ?? '')}`;
    // The bucket said no for what the file is (type, size): the same file can never go through. Anything else may work on another try.
    const kind = storageProblem(e);
    const err = kind === 'type' || kind === 'size' ? new ProofFileRefused(uploadMessage(e), detail) : new AppError(uploadMessage(e), detail);
    logError('upload a proof file', err);
    throw err;
  }
  return { path, content_type: type.contentType, bytes: body.byteLength };
}

/** Take an uploaded file out again (the family removed it before sending). Best effort: a failure is logged, never shown; orphans are cleaned after 48 hours. */
export async function removeProofUpload(path: string): Promise<void> {
  const { error } = await supabase.storage.from(PROOF_BUCKET).remove([path]);
  if (error) logError(`removing the proof upload ${path} (the office clean-up will remove it)`, error);
}

/** Uploads what the attempt has not uploaded yet, in order. A failure leaves the ones that went up in the attempt, so a retry only does the rest. */
async function uploadAll(attempt: ProofAttempt, args: { centerId: string; householdId: string; proofId: string }, files: readonly PickedProofFile[]): Promise<UploadedProofFile[]> {
  const out: UploadedProofFile[] = [];
  for (const file of files) {
    let done = attempt.uploaded.get(file.id);
    if (!done) {
      done = await uploadProofFile({ ...args, file });
      attempt.uploaded.set(file.id, done);
    }
    out.push(done);
  }
  return out;
}

/**
 * Where "I paid another way" was opened: the Open pledges screen, or a checkout (an RSVP, a store order, an opportunity, a labh, a Pathshala
 * fee), where the amount is locked to the checkout's one pledge. The database also takes 'membership' and 'other'; no screen sends them yet.
 */
export type ProofEntry = 'open_pledges' | 'rsvp' | 'store' | 'opportunity' | 'labh' | 'pathshala_fee';

export type SubmitProofArgs = {
  attempt: ProofAttempt;
  centerId: string;
  householdId: string;
  method: string;
  amountCents: number;
  /** 'YYYY-MM-DD' */
  paidOn: string;
  reference: string | null;
  note?: string | null;
  /** The pledges the family chose (or the checkout's one). Null = all of the family's open pledges, oldest first. Never an empty list. */
  pledgeIds: string[] | null;
  entry: ProofEntry;
  /** The RSVP's or the store order's id, for the entries that have one. */
  entryRef?: string | null;
  files: readonly PickedProofFile[];
};

/**
 * Send a proof: upload the files, then create the claim in ONE function call. Nothing is credited until the treasury
 * team checks it. Returns only when the database has answered with the proof; any failure is a plain-English AppError
 * ("Could not send your confirmation — ...") and the same attempt can be tried again.
 */
export async function submitPaymentProof(args: SubmitProofArgs): Promise<SubmittedProof> {
  if (!Number.isInteger(args.amountCents) || args.amountCents < 1) throw new AppError('Please enter the amount you paid.', `proof amount is not whole cents: ${args.amountCents}`);
  if (args.files.length > MAX_PROOF_FILES) throw new AppError(en['proof.problem.files_too_many'], `${args.files.length} files`);
  if (args.pledgeIds && args.pledgeIds.length === 0) throw new AppError(en['proof.problem.no_pledge'], 'an empty list of pledges would cover nothing');
  const uploaded = await uploadAll(args.attempt, { centerId: args.centerId, householdId: args.householdId, proofId: args.attempt.proofId }, args.files);
  const res = await supabase.rpc('submit_payment_proof', {
    p_center: args.centerId,
    p_household: args.householdId,
    p_method: args.method,
    p_amount_cents: args.amountCents,
    p_paid_on: args.paidOn,
    p_reference: args.reference ?? undefined,
    p_note: args.note ? args.note.slice(0, MAX_NOTE_CHARS) : undefined,
    p_pledge_ids: args.pledgeIds ?? undefined,
    p_entry: args.entry,
    p_entry_ref: args.entryRef ?? undefined,
    p_files: uploaded.map((f) => ({ path: f.path, content_type: f.content_type, bytes: f.bytes })),
    p_key: args.attempt.key,
  });
  if (res.error) throw actionError('Could not send your confirmation', 'send your confirmation', res.error);
  const parsed = parseSubmitted(res.data);
  if (!parsed) {
    const err = new AppError(en['proof.err.unconfirmed'], `submit_payment_proof returned an unusable answer: ${JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'}`);
    logError('send your confirmation', err);
    throw err;
  }
  return parsed;
}

let loggedMissingProofs = false;

function unusable(what: string, fn: string, data: unknown): AppError {
  const err = new AppError(`We couldn't ${what} — the answer was not what we expected. Please try again.`, `${fn} returned an unusable answer: ${JSON.stringify(data)?.slice(0, 300) ?? 'nothing'}`);
  logError(what, err);
  return err;
}

/** The family's payment proofs, newest first (an adult of the family). */
export async function myPaymentProofs(centerId: string, householdId: string): Promise<PaymentProof[]> {
  const res = await supabase.rpc('my_payment_proofs', { p_center: centerId, p_household: householdId });
  if (res.error) throw actionError('Could not load your payment confirmations', 'load your payment confirmations', res.error);
  const parsed = parseProofs(res.data);
  if (!parsed) throw unusable('load your payment confirmations', 'my_payment_proofs', res.data);
  if (parsed.skipped > 0) logError('load your payment confirmations', new Error(`${parsed.skipped} proof(s) in an unknown shape or status were left out`));
  return parsed.proofs;
}

/** Take a proof back while the treasury team has not decided: its pledges are Open again. */
export async function withdrawPaymentProof(proofId: string): Promise<PaymentProof> {
  const res = await supabase.rpc('withdraw_payment_proof', { p_proof: proofId });
  if (res.error) throw actionError('Could not take your confirmation back', 'take your confirmation back', res.error);
  const proof = parseProof(res.data);
  if (!proof) throw unusable('take your confirmation back', 'withdraw_payment_proof', res.data);
  return proof;
}

/** Answer the treasury team's question, with more photos if they asked for them. The proof goes back to Waiting. */
export async function answerProofQuestion(args: { proof: Pick<PaymentProof, 'id' | 'householdId'>; centerId: string; message: string; files: readonly PickedProofFile[]; attempt: ProofAttempt }): Promise<PaymentProof> {
  if (args.files.length > MAX_PROOF_FILES) throw new AppError(en['proof.problem.files_too_many'], `${args.files.length} files`);
  // The new files go in the proof's own folder (the database checks the path).
  const uploaded = await uploadAll(args.attempt, { centerId: args.centerId, householdId: args.proof.householdId, proofId: args.proof.id }, args.files);
  const res = await supabase.rpc('answer_proof_question', {
    p_proof: args.proof.id,
    p_message: args.message.trim().slice(0, MAX_NOTE_CHARS),
    p_files: uploaded.map((f) => ({ path: f.path, content_type: f.content_type, bytes: f.bytes })),
  });
  if (res.error) throw actionError('Could not send your reply', 'send your reply', res.error);
  const proof = parseProof(res.data);
  if (!proof) {
    const err = new AppError(en['proof.err.replyUnconfirmed'], `answer_proof_question returned an unusable answer: ${JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'}`);
    logError('send your reply', err);
    throw err;
  }
  return proof;
}

/**
 * Every proof and file connected to a pledge, in any status and from any year, oldest first (an adult of the family). A
 * portal without the function (an older one) has none to show: logged once, never an error. Anything else is a plain-English
 * error with a retry.
 */
export async function pledgeEvidence(pledgeId: string): Promise<EvidenceItem[]> {
  const res = await supabase.rpc('pledge_evidence', { p_pledge: pledgeId });
  if (res.error) {
    if (isMissingRpcError(res.error)) {
      if (!loggedMissingProofs) {
        loggedMissingProofs = true;
        logError('load your proof: app.pledge_evidence is not deployed yet, so there is none to show', res.error);
      }
      return [];
    }
    throw actionError('Could not load your confirmation', 'load your confirmation', res.error);
  }
  const parsed = parseEvidence(res.data);
  if (!parsed) throw unusable('load your confirmation', 'pledge_evidence', res.data);
  if (parsed.skipped > 0) logError('load your confirmation', new Error(`${parsed.skipped} item(s) in an unknown shape were left out`));
  return parsed.items;
}

/**
 * The community's rules for proofs. A portal without the function has no proofs at all: `null`, logged once (the sheet's
 * button stays hidden). Anything else is a plain-English error with a retry.
 */
export async function loadProofPolicy(centerId: string): Promise<ProofPolicy | null> {
  const res = await supabase.rpc('proof_policy', { p_center: centerId });
  if (res.error) {
    if (isMissingRpcError(res.error)) {
      if (!loggedMissingProofs) {
        loggedMissingProofs = true;
        logError('load the payment proof rules: app.proof_policy is not deployed yet, so "I paid another way" is hidden', res.error);
      }
      return null;
    }
    throw actionError('Could not load the payment confirmation rules', 'load the payment confirmation rules', res.error);
  }
  const policy = parsePolicy(res.data);
  if (!policy) throw unusable('load the payment confirmation rules', 'proof_policy', res.data);
  return policy;
}

/** Short-lived links to the files of a proof (the family's adults may read them). A file that cannot be signed is left out and logged. */
export async function proofFileUrls(paths: readonly string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  try {
    return await signedUrls([...paths], BUCKETS.paymentEvidence, 'open your confirmation');
  } catch (err) {
    throw report(err, 'open your confirmation');
  }
}

/**
 * The receipt numbers of the payments proofs became (an adult of the family may read their payments). A failure is logged and
 * the proofs show without receipt numbers: the receipt itself is in the giving history either way.
 */
export async function proofReceipts(paymentIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(paymentIds)];
  if (ids.length === 0) return new Map();
  const res = await supabase.from('payments').select('id, receipt_number').in('id', ids);
  if (res.error) {
    logError('load the receipts of your proofs (the proofs show without them)', res.error);
    return new Map();
  }
  return new Map((res.data ?? []).flatMap((r) => (r.receipt_number ? [[r.id, r.receipt_number] as const] : [])));
}
