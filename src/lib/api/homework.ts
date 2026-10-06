import { en } from '../../i18n/en';
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
export const HOMEWORK_UNAVAILABLE = en['hw.err.unavailable'];

/**
 * The SQLSTATEs connect-crm 0587 raises its plain-English refusals with: 22023 (a rule: "This homework is already with
 * the teacher."), P0002 (not found: "That homework answer was not found.") and 42501 (not allowed: "You can only hand
 * in homework for yourself or for someone in your family."). The sentences are written for people, so they are shown as
 * they are; the one gate is that Postgres' own permission and row-level-security messages stay generic.
 */
const REFUSAL_CODES = new Set(['22023', 'P0002', '42501']);

/** True when the database said no on purpose (a rule, a missing row, not allowed), so the write certainly did not happen. */
export function isRefusal(err: unknown): boolean {
  return err instanceof AppError && err.code !== null && REFUSAL_CODES.has(err.code);
}

/**
 * A failed homework call as the AppError the screen shows: the database's own sentence when it wrote one (with a final
 * period), else the generic words for `action` ("We couldn't hand in your homework. Check your internet connection and
 * try again."). The technical detail and the code are kept on the error and logged.
 */
export function homeworkError(err: unknown, action: string): AppError {
  const e = err && typeof err === 'object' ? (err as { code?: unknown; message?: unknown }) : {};
  const code = typeof e.code === 'string' ? e.code : null;
  const message = typeof e.message === 'string' ? e.message.trim() : '';
  if (code && REFUSAL_CODES.has(code) && /^["A-Z]/.test(message) && !/permission denied|row-level security/i.test(message)) {
    const out = new AppError(/[.!?]$/.test(message) ? message : `${message}.`, `${action}: ${message} | code=${code}`, code);
    logError(action, out);
    return out;
  }
  return report(err, action);
}

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
    throw homeworkError(res.error, 'load your homework');
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
    throw homeworkError(res.error, action);
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

const SIZE_MESSAGE: Record<PartKind, string> = { photo: en['hw.err.sizePhoto'], voice: en['hw.err.sizeVoice'], file: en['hw.err.sizeFile'] };

const READ_MESSAGE: Record<PartKind, string> = { photo: en['hw.err.readPhoto'], voice: en['hw.err.readVoice'], file: en['hw.err.readFile'] };

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
  if (body.byteLength === 0) throw new AppError(args.kind === 'voice' ? en['hw.err.emptyVoice'] : en['hw.err.emptyFile'], `empty ${args.kind}`);
  if (body.byteLength > MAX_FILE_BYTES) throw new AppError(SIZE_MESSAGE[args.kind], `${args.kind} is ${body.byteLength} bytes (limit ${MAX_FILE_BYTES})`);
  const { ext, contentType } = partFile(args.kind, { fileName: args.fileName, mimeType: args.mimeType, uri: args.uri });
  const path = storagePath({ centerId: args.centerId, personId: args.personId, submissionId: args.submissionId, id: newRequestId(), ext });
  const up = await supabase.storage.from(HOMEWORK_BUCKET).upload(path, body, { contentType, upsert: false });
  if (up.error) {
    throw new AppError(isMissingBucket(up.error) ? en['hw.err.noBucket'] : en['hw.err.upload'], `storage upload to ${HOMEWORK_BUCKET}/${path}: ${up.error.message}`);
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
