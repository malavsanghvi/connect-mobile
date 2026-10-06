import { AppError, logError, report } from '../errors';
import { HOMEWORK_BUCKET, MAX_FILE_BYTES, parseHomework, parseSubmission, partFile, storagePath, type FileArg, type Homework, type PartKind, type Submission } from '../homework';
import { isMissingRpcError } from '../modules';
import { newRequestId } from '../request-context';
import { supabase } from '../supabase';

import { signedUrl } from './files';
import { isMissingBucket } from './photos';

/**
 * Homework (connect-crm migration 0587): the four functions and the `homework`
 * bucket. The generated types do not know 0587 yet (README › Schema gaps #31),
 * so the calls go through one narrow cast here, and every answer is read
 * defensively in src/lib/homework.ts. Nothing else in the app touches these
 * functions.
 */
type UntypedRpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/** The one place the generated types are stepped around: they do not carry 0587 yet. */
function rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> {
  return (supabase as unknown as UntypedRpc).rpc(fn, args);
}

/** The portal's answer, or `missing`: it does not have homework yet (an older portal), so nothing of it is shown. */
export type HomeworkAnswer = { kind: 'answered'; homework: Homework } | { kind: 'missing' };

let loggedMissing = false;

/** Said when a write reaches a portal that does not have homework yet (the entry points are hidden, so only a stale link gets here). */
export const HOMEWORK_UNAVAILABLE = "Homework isn't available in your community yet. Ask the office to update the portal.";

/**
 * The homework of the signed-in person and, for an adult, of everyone in their household
 * (`app.my_gyan_homework`). Rejects with a plain-English AppError when it cannot be had; a function that is not
 * deployed yet is not a failure: it is `missing`, logged once, and the app shows no homework at all.
 */
export async function loadHomework(centerId: string): Promise<HomeworkAnswer> {
  const res = await rpc('my_gyan_homework', { p_center: centerId });
  if (res.error) {
    if (isMissingRpcError(res.error)) {
      if (!loggedMissing) {
        loggedMissing = true;
        logError('loading homework: app.my_gyan_homework is not deployed yet (connect-crm 0587), so homework is not offered', res.error);
      }
      return { kind: 'missing' };
    }
    throw report(res.error, 'load your homework');
  }
  const homework = parseHomework(res.data);
  if (!homework) {
    const err = new AppError("We couldn't load your homework — the answer was not what we expected. Please try again.", `my_gyan_homework returned an unusable answer: ${JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'}`);
    logError('load your homework', err);
    throw err;
  }
  if (homework.skipped > 0) logError(`loading homework: ${homework.skipped} item(s) could not be read and are not shown (an unknown status or a missing assignment id)`, new Error('unreadable homework items'));
  return { kind: 'answered', homework };
}

/** One write through a homework function: the submission it answers with, or a plain-English refusal (shown as-is, with Try again). */
async function writeSubmission(fn: string, args: Record<string, unknown>, action: string): Promise<Submission> {
  const res = await rpc(fn, args);
  if (res.error) {
    if (isMissingRpcError(res.error)) {
      const err = new AppError(HOMEWORK_UNAVAILABLE, `${fn}: ${String((res.error as { message?: unknown }).message ?? res.error)}`);
      logError(action, err);
      throw err;
    }
    throw report(res.error, action);
  }
  const sub = parseSubmission(res.data);
  if (!sub) {
    const err = new AppError(`We couldn't ${action} — the answer was not what we expected. Please try again.`, `${fn} returned an unusable answer: ${JSON.stringify(res.data)?.slice(0, 300) ?? 'nothing'}`);
    logError(action, err);
    throw err;
  }
  return sub;
}

/**
 * Create or update the draft (`app.save_gyan_submission_draft`). `files` is the whole set of parts (the database
 * replaces the set), each already uploaded with `uploadPart`; a sent-back answer becomes a new draft (attempt + 1)
 * on its first save. Called once with no files to get the submission id before the first upload.
 */
export async function saveDraft(args: { assignmentId: string; personId: string; text: string | null; files: FileArg[] }): Promise<Submission> {
  return writeSubmission('save_gyan_submission_draft', { p_assignment: args.assignmentId, p_person: args.personId, p_text: args.text, p_files: args.files }, 'save your draft');
}

/** Hand the draft in (`app.hand_in_gyan_submission`): it comes back awaiting a parent, or with the teacher. */
export async function handIn(submissionId: string): Promise<Submission> {
  return writeSubmission('hand_in_gyan_submission', { p_submission: submissionId }, 'hand in your homework');
}

/** A household adult sends a child's waiting answer on to the teacher, or back to the child with a note (`app.parent_decide_gyan_submission`). */
export async function parentDecide(submissionId: string, decision: 'ok' | 'send_back', note: string | null): Promise<Submission> {
  return writeSubmission('parent_decide_gyan_submission', { p_submission: submissionId, p_decision: decision, p_note: note }, decision === 'ok' ? 'send it to the teacher' : 'send it back');
}

const SIZE_MESSAGE: Record<PartKind, string> = {
  photo: 'This photo is larger than 25 MB. Please choose a smaller one.',
  voice: 'This voice note is larger than 25 MB. Please record a shorter one.',
  file: 'This file is larger than 25 MB. Please choose a smaller one.',
};

const READ_MESSAGE: Record<PartKind, string> = {
  photo: "We couldn't read that photo from your device. Please choose it again.",
  voice: "We couldn't read your voice note from this phone. Please record it again.",
  file: "We couldn't read that file from your device. Please choose it again.",
};

/**
 * Upload one part to the `homework` bucket at `<center>/<person>/<submission>/<id>.<ext>` and describe it for
 * `saveDraft`. The 25 MB limit is checked here, with a plain message, before anything is sent. The caller registers
 * the part with `saveDraft` right after; if that fails it removes the upload again (`removePart`), as photo albums do.
 */
export async function uploadPart(args: { centerId: string; personId: string; submissionId: string; kind: PartKind; uri: string; fileName?: string | null; mimeType?: string | null; durationSeconds?: number | null }): Promise<FileArg> {
  let body: ArrayBuffer;
  try {
    body = await (await fetch(args.uri)).arrayBuffer();
  } catch (err) {
    throw new AppError(READ_MESSAGE[args.kind], `reading ${args.kind} ${args.uri}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (body.byteLength === 0) throw new AppError(args.kind === 'voice' ? 'The voice note was empty. Please record it again.' : 'That file was empty. Please choose another.', `empty ${args.kind}`);
  if (body.byteLength > MAX_FILE_BYTES) throw new AppError(SIZE_MESSAGE[args.kind], `${args.kind} is ${body.byteLength} bytes (limit ${MAX_FILE_BYTES})`);
  const { ext, contentType } = partFile(args.kind, { fileName: args.fileName, mimeType: args.mimeType, uri: args.uri });
  const path = storagePath({ centerId: args.centerId, personId: args.personId, submissionId: args.submissionId, id: newRequestId(), ext });
  const up = await supabase.storage.from(HOMEWORK_BUCKET).upload(path, body, { contentType, upsert: false });
  if (up.error) {
    throw new AppError(
      isMissingBucket(up.error) ? "Homework uploads aren't set up for your community yet, so this part wasn't saved. Ask the office to update the portal." : "We couldn't upload this part. Please check your connection and try again.",
      `storage upload to ${HOMEWORK_BUCKET}/${path}: ${up.error.message}`,
    );
  }
  return { kind: args.kind, storage_path: path, mime_type: contentType, bytes: body.byteLength, duration_seconds: args.durationSeconds ?? null };
}

/** Remove an uploaded part (after its draft row failed, or when the learner took it off the answer). Best effort: a failure is logged, never shown. */
export async function removePart(path: string): Promise<void> {
  const { error } = await supabase.storage.from(HOMEWORK_BUCKET).remove([path]);
  if (error) logError(`removing the homework upload ${path} (office cleanup may be needed)`, error);
}

/** A link to look at or play a stored part, good for an hour (the learner, their household adults and their teachers may read it). */
export async function partUrl(path: string): Promise<string> {
  return signedUrl(path, HOMEWORK_BUCKET, 'load this part of the homework');
}
