/**
 * Homework: learning assignments with parent validation (connect-crm migration
 * 0587, docs/LEARNING_ASSIGNMENTS_PLAN.md). A community attaches homework to a
 * Gyan Path level; a learner answers with a photo, a voice note and/or a short
 * text (a file needs the native picker of the next APK), keeps a draft, hands
 * it in, and, when the assignment asks for it and the learner is a child, a
 * household adult checks it before the teacher sees it. The teacher accepts
 * (points paid once) or sends it back with a note.
 *
 * This file is pure (no React, no Supabase): it reads the answers of the
 * homework functions defensively and holds every display rule, so all of it is
 * unit-tested (src/lib/__tests__/homework.test.ts). The calls live in
 * src/lib/api/homework.ts; the screens in src/features/homework and
 * src/app/(app)/gyan/homework.
 */
import type { StringKey } from '../i18n/en';

import { daysBetween, monthName, parseISODate } from './format';

// ---------------------------------------------------------------------------
// The contract (what the database says)
// ---------------------------------------------------------------------------

export const ANSWER_KINDS = ['photo', 'file', 'voice', 'text'] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

/** The kinds a part of an answer can be (a text answer is a column of the submission, not a part). */
export type PartKind = Exclude<AnswerKind, 'text'>;

export const SUBMISSION_STATUSES = ['draft', 'awaiting_parent', 'submitted', 'accepted', 'needs_work'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export type ParentCheck = 'never' | 'children' | 'always';

/** Kinds this release cannot take over the air: "Attach a file" needs the native file picker of the next APK (plan §1.3 F6, H10). */
export const NATIVE_ONLY_KINDS: readonly AnswerKind[] = ['file'];

/** A text answer is at most this long (gyan_submissions.text_answer). */
export const MAX_TEXT_CHARS = 2000;
/** A parent's note when sending an answer back (gyan_submissions.parent_note). */
export const MAX_NOTE_CHARS = 500;
/** One part at most this big (bucket `homework`, 25 MB). Enforced here before the upload, with a plain message. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** A voice note stops by itself after this long. */
export const MAX_VOICE_SECONDS = 10 * 60;
/** The private storage bucket of the parts (RLS: the learner, their household adults and their teachers). */
export const HOMEWORK_BUCKET = 'homework';
/** How long a signed link to a part is good for. */
export const SIGNED_URL_SECONDS = 3600;

export type HomeworkAssignment = {
  id: string;
  levelId: string | null;
  goalId: string | null;
  title: string;
  instructionsMd: string | null;
  allowedKinds: AnswerKind[];
  maxFiles: number;
  points: number;
  requiredForLevel: boolean;
  /** 'YYYY-MM-DD' or null (information only: a late hand-in is marked, never refused). */
  dueOn: string | null;
  parentCheck: ParentCheck;
  classId: string | null;
};

export type SubmissionFile = {
  id: string;
  kind: PartKind;
  /** Null once retention removed the file (the row, note and points stay). */
  storagePath: string | null;
  mimeType: string | null;
  bytes: number | null;
  durationSeconds: number | null;
  sortOrder: number;
  deleted: boolean;
};

export type Submission = {
  id: string;
  status: SubmissionStatus;
  attempt: number;
  textAnswer: string | null;
  submittedAt: string | null;
  parentNote: string | null;
  reviewNote: string | null;
  decidedAt: string | null;
  pointsAwarded: number;
  late: boolean;
  files: SubmissionFile[];
};

export type HomeworkPerson = { personId: string; name: string; isChild: boolean };

export type HomeworkItem = {
  assignment: HomeworkAssignment;
  personId: string;
  submission: Submission | null;
  /** Handing in from the learner's own login waits for a household adult. */
  needsParent: boolean;
  /** The caller is a household adult who may decide this learner's waiting answer. */
  canParentDecide: boolean;
};

export type Homework = {
  people: HomeworkPerson[];
  items: HomeworkItem[];
  /** Items the answer carried that could not be read (an unknown status, no assignment id): logged by the loader, never shown half-read. */
  skipped: number;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
}

function isAnswerKind(v: unknown): v is AnswerKind {
  return typeof v === 'string' && (ANSWER_KINDS as readonly string[]).includes(v);
}

function isPartKind(v: unknown): v is PartKind {
  return v === 'photo' || v === 'file' || v === 'voice';
}

function isStatus(v: unknown): v is SubmissionStatus {
  return typeof v === 'string' && (SUBMISSION_STATUSES as readonly string[]).includes(v);
}

function isoDate(v: unknown): string | null {
  const s = str(v);
  const p = s ? parseISODate(s) : null;
  return s && p && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= 31 ? s.slice(0, 10) : null;
}

export function parseAssignment(raw: unknown): HomeworkAssignment | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const title = str(raw.title);
  if (!id || !title) return null;
  const kinds = Array.isArray(raw.allowed_kinds) ? raw.allowed_kinds.filter(isAnswerKind) : [];
  const maxFiles = num(raw.max_files);
  const points = num(raw.points);
  const parentCheck = raw.parent_check === 'never' || raw.parent_check === 'always' ? raw.parent_check : 'children';
  return {
    id,
    levelId: str(raw.level_id),
    goalId: str(raw.goal_id),
    title,
    instructionsMd: text(raw.instructions_md),
    allowedKinds: [...new Set(kinds)],
    maxFiles: maxFiles !== null && maxFiles >= 1 ? Math.floor(maxFiles) : 3,
    points: points !== null && points > 0 ? Math.floor(points) : 0,
    requiredForLevel: raw.required_for_level === true,
    dueOn: isoDate(raw.due_on),
    parentCheck,
    classId: str(raw.class_id),
  };
}

export function parseSubmissionFile(raw: unknown, index: number): SubmissionFile | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  if (!id || !isPartKind(raw.kind)) return null;
  const sort = num(raw.sort_order);
  return {
    id,
    kind: raw.kind,
    storagePath: str(raw.storage_path),
    mimeType: str(raw.mime_type),
    bytes: num(raw.bytes),
    durationSeconds: num(raw.duration_seconds),
    sortOrder: sort ?? index,
    deleted: !!str(raw.deleted_at),
  };
}

/** The submission JSON every homework function answers with (also inside my_gyan_homework's items). Null when it is not one. */
export function parseSubmission(raw: unknown): Submission | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  if (!id || !isStatus(raw.status)) return null;
  const files = (Array.isArray(raw.files) ? raw.files : []).map(parseSubmissionFile).filter((f): f is SubmissionFile => f !== null);
  files.sort((a, b) => a.sortOrder - b.sortOrder);
  const attempt = num(raw.attempt);
  const points = num(raw.points_awarded);
  return {
    id,
    status: raw.status,
    attempt: attempt !== null && attempt >= 1 ? Math.floor(attempt) : 1,
    textAnswer: text(raw.text_answer),
    submittedAt: str(raw.submitted_at),
    parentNote: text(raw.parent_note),
    reviewNote: text(raw.review_note),
    decidedAt: str(raw.decided_at),
    pointsAwarded: points !== null && points > 0 ? Math.floor(points) : 0,
    late: raw.late === true,
    files,
  };
}

function parseItem(raw: unknown): HomeworkItem | null {
  if (!isObject(raw)) return null;
  const assignment = parseAssignment(raw.assignment);
  const personId = str(raw.person_id);
  if (!assignment || !personId) return null;
  // A submission that is there but unreadable (an unknown status from a newer database) cannot be shown half-read.
  const submission = raw.submission == null ? null : parseSubmission(raw.submission);
  if (raw.submission != null && !submission) return null;
  return { assignment, personId, submission, needsParent: raw.needs_parent === true, canParentDecide: raw.can_parent_decide === true };
}

/**
 * Read the `app.my_gyan_homework(p_center)` answer: `{ people: [{person_id, name, is_child}], items: [{assignment, person_id,
 * submission, needs_parent, can_parent_decide}] }`. Null when it is not an answer at all (no `items` list); an item that cannot
 * be read is counted in `skipped` and left out.
 */
export function parseHomework(raw: unknown): Homework | null {
  if (!isObject(raw) || !Array.isArray(raw.items)) return null;
  const people: HomeworkPerson[] = [];
  for (const p of Array.isArray(raw.people) ? raw.people : []) {
    if (!isObject(p)) continue;
    const personId = str(p.person_id);
    if (!personId) continue;
    people.push({ personId, name: str(p.name) ?? '', isChild: p.is_child === true });
  }
  const items: HomeworkItem[] = [];
  let skipped = 0;
  for (const it of raw.items) {
    const item = parseItem(it);
    if (item) items.push(item);
    else skipped += 1;
  }
  return { people, items, skipped };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type HomeworkState = 'not_started' | SubmissionStatus;

export function homeworkState(sub: Submission | null): HomeworkState {
  return sub?.status ?? 'not_started';
}

/** The words of each status: Not started / Draft / Needs a parent's OK / With the teacher / Accepted / Sent back. */
export const STATE_LABEL: Record<HomeworkState, StringKey> = {
  not_started: 'hw.status.notStarted',
  draft: 'hw.status.draft',
  awaiting_parent: 'hw.status.awaitingParent',
  submitted: 'hw.status.submitted',
  accepted: 'hw.status.accepted',
  needs_work: 'hw.status.needsWork',
};

/** The chip colour of each status (the Pill tones of src/components/ui.tsx). */
export type ChipTone = 'grey' | 'navy' | 'amber' | 'purple' | 'green' | 'red';

export const STATE_TONE: Record<HomeworkState, ChipTone> = {
  not_started: 'grey',
  draft: 'navy',
  awaiting_parent: 'amber',
  submitted: 'purple',
  accepted: 'green',
  needs_work: 'red',
};

/** The answer has left the learner's hands (a parent or the teacher has it, or it is done). */
export function isHandedIn(state: HomeworkState): boolean {
  return state === 'awaiting_parent' || state === 'submitted' || state === 'accepted';
}

/** `a` is before `b` (ISO timestamps; both come from the same database in the same form, so the text decides when one cannot be parsed). */
function isBefore(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) ? ta < tb : a < b;
}

export type ComebackNote = { from: 'teacher' | 'parent'; note: string };

/**
 * The note that came with the answer when it was sent back, while that is where it stands: the teacher's when it is
 * sent back, and still while it is edited again (a draft once more) until it is handed in; a parent's when they sent
 * it back to the child (a draft again). A note from an earlier round is not repeated: the database keeps the last
 * parent note through later hand-ins, so once the teacher has decided after a hand-in the parent's words are old news.
 */
export function comebackNote(sub: Submission | null): ComebackNote | null {
  if (!sub) return null;
  if (sub.status === 'needs_work') return sub.reviewNote ? { from: 'teacher', note: sub.reviewNote } : null;
  if (sub.status !== 'draft' || !sub.submittedAt) return null;
  const teacherDecidedLast = sub.decidedAt !== null && !isBefore(sub.decidedAt, sub.submittedAt);
  if (teacherDecidedLast) return sub.reviewNote ? { from: 'teacher', note: sub.reviewNote } : null;
  return sub.parentNote ? { from: 'parent', note: sub.parentNote } : null;
}

// ---------------------------------------------------------------------------
// Due dates (information only, never a gate: plan H5)
// ---------------------------------------------------------------------------

/** '2026-10-12' → "Oct 12". */
export function shortDate(iso: string): string {
  const p = parseISODate(iso);
  return p ? `${monthName(p.m)} ${p.d}` : iso;
}

export type DueLine = { key: StringKey; vars?: Record<string, string | number> };

/** "Due today" / "Due tomorrow" / "Due Oct 12" / "Was due Oct 1", or null without a due date. */
export function dueLine(dueOn: string | null, today: string): DueLine | null {
  if (!dueOn) return null;
  const days = daysBetween(today, dueOn);
  if (days === 0) return { key: 'hw.dueToday' };
  if (days === 1) return { key: 'hw.dueTomorrow' };
  if (days > 1) return { key: 'hw.dueOn', vars: { date: shortDate(dueOn) } };
  return { key: 'hw.wasDue', vars: { date: shortDate(dueOn) } };
}

/** Not handed in and past its due date (a handed-in answer carries the server's own `late` mark instead). */
export function isOverdue(item: { assignment: { dueOn: string | null }; submission: Submission | null }, today: string): boolean {
  if (!item.assignment.dueOn || isHandedIn(homeworkState(item.submission))) return false;
  return daysBetween(today, item.assignment.dueOn) < 0;
}

// ---------------------------------------------------------------------------
// Who is looking, and what they may do
// ---------------------------------------------------------------------------

/** The learner themselves, a household adult looking at a child's homework, or someone with no business here. */
export type Viewer = 'learner' | 'parent' | 'none';

/**
 * Who this reader is for the homework of `personId`. `people` is the `people` list of `app.my_gyan_homework`: the caller
 * and, for a household adult, everyone in EVERY household they belong to (the function returns only people the caller
 * may act for). A child in a second household is therefore a child like any other; the app's own family roster
 * (`member.members`, the primary household only) is for names, never for deciding who may do what.
 */
export function viewerFor(personId: string, me: { personId: string; isAdult: boolean }, people: readonly { personId: string }[]): Viewer {
  if (personId === me.personId) return 'learner';
  return me.isAdult && people.some((p) => p.personId === personId) ? 'parent' : 'none';
}

/** The answer can be worked on: by the learner or a household adult, while it is not started, a draft, or sent back. */
export function canEdit(state: HomeworkState, viewer: Viewer): boolean {
  if (viewer === 'none') return false;
  return state === 'not_started' || state === 'draft' || state === 'needs_work';
}

/** A household adult may send this waiting answer on to the teacher or back to the child. */
export function canDecide(item: { canParentDecide: boolean; submission: Submission | null }, viewer: Viewer): boolean {
  return viewer === 'parent' && item.canParentDecide && homeworkState(item.submission) === 'awaiting_parent';
}

/**
 * What handing in means here: a child's own hand-in waits for a parent ("A parent will check this before the
 * teacher sees it"), a parent handing in for a child is already the parent (no parent step; the database records
 * them as the parent), otherwise it goes straight to the teacher.
 */
export type HandInNote = 'parent_checks_first' | 'parent_hands_in' | 'straight_to_teacher';

export function handInNote(item: { needsParent: boolean }, viewer: Viewer): HandInNote {
  if (viewer === 'parent') return 'parent_hands_in';
  return item.needsParent ? 'parent_checks_first' : 'straight_to_teacher';
}

// ---------------------------------------------------------------------------
// The ways to answer
// ---------------------------------------------------------------------------

export type AnswerButton = { kind: AnswerKind; available: boolean };

const ANSWER_ORDER: readonly AnswerKind[] = ['photo', 'voice', 'file', 'text'];

/**
 * The answer buttons to show, in order: Choose a photo, Record a voice note, Attach a file, Write. A kind this release
 * cannot take over the air (`file`) is still shown, disabled, so the learner knows it arrives with the next app update.
 */
export function answerButtons(allowed: readonly AnswerKind[]): AnswerButton[] {
  return ANSWER_ORDER.filter((k) => allowed.includes(k)).map((kind) => ({ kind, available: !NATIVE_ONLY_KINDS.includes(kind) }));
}

/** A part of the answer on this phone: being uploaded, uploaded (and registered), or not uploaded (with Try again). */
export type PartState = 'uploading' | 'uploaded' | 'failed';

/** Why the answer cannot be handed in (or saved) yet, or null when it can. */
export type HandInBlock = 'uploading' | 'not_uploaded' | 'too_many' | 'text_too_long' | 'empty';

export function handInBlock(args: { parts: readonly { state: PartState }[]; text: string; maxFiles: number; textAllowed: boolean }): HandInBlock | null {
  if (args.parts.some((p) => p.state === 'uploading')) return 'uploading';
  if (args.parts.some((p) => p.state === 'failed')) return 'not_uploaded';
  if (args.parts.length > args.maxFiles) return 'too_many';
  const text = args.textAllowed ? args.text.trim() : '';
  if (text.length > MAX_TEXT_CHARS) return 'text_too_long';
  if (args.parts.length === 0 && text.length === 0) return 'empty';
  return null;
}

/** A part as `app.save_gyan_submission_draft` wants it in `p_files`. */
export type FileArg = { kind: PartKind; storage_path: string; mime_type: string | null; bytes: number | null; duration_seconds: number | null };

/** The files of a submission that are still there: the ones kept when the answer is edited again. */
export function keptFiles(sub: Submission | null): SubmissionFile[] {
  return (sub?.files ?? []).filter((f) => !!f.storagePath && !f.deleted);
}

/**
 * The content types the `homework` bucket takes (connect-crm 0587 `allowed_mime_types`). A photo must be one of the
 * images, a voice note one of the audio types, a file any of them (`app.gyan_homework_mime_ok`); anything else is
 * refused by the bucket with a 415, so the app checks first and says so in plain words.
 */
export const BUCKET_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'audio/mp4',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/aac',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/3gpp',
  'audio/x-caf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
];

/** Names some pickers and browsers give a type that the bucket knows by another name. */
const SAME_TYPE: Record<string, string> = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'audio/m4a': 'audio/mp4', 'audio/mp3': 'audio/mpeg', 'audio/wave': 'audio/wav' };

/** A content type as the bucket spells it: lower case, no `;codecs=…`, and the common other names for it mapped (image/jpg → image/jpeg, audio/m4a → audio/mp4). */
export function normalizeMime(raw: string | null | undefined): string {
  const mime = (raw ?? '').split(';')[0].trim().toLowerCase();
  return SAME_TYPE[mime] ?? mime;
}

/** The bucket takes this content type for this kind of part. */
export function partTypeAllowed(kind: PartKind, contentType: string): boolean {
  if (!BUCKET_TYPES.includes(contentType)) return false;
  return kind === 'photo' ? contentType.startsWith('image/') : kind === 'voice' ? contentType.startsWith('audio/') : true;
}


const IMAGE_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
const AUDIO_EXT: Record<string, string> = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', caf: 'audio/x-caf', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', '3gp': 'audio/3gpp', mp3: 'audio/mpeg' };
const FILE_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
};
const EXT_OF_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/x-caf': 'caf', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/3gpp': '3gp', 'audio/mpeg': 'mp3' };

/** What the picker, the file name or the recorder says about a part; `reported` is the type the fetched file itself reported (a web recording has no other hint). */
export type PartHints = { fileName?: string | null; mimeType?: string | null; uri?: string | null; reported?: string | null };

const DEFAULT_TYPE: Record<PartKind, { ext: string; contentType: string }> = {
  photo: { ext: 'jpg', contentType: 'image/jpeg' },
  voice: { ext: 'm4a', contentType: 'audio/mp4' },
  file: { ext: 'bin', contentType: 'application/octet-stream' },
};

/** The extension of a file name or uri ("IMG_1.HEIC" gives "heic"), when it has one. */
function extensionOf(s: string | null | undefined): string | null {
  return /\.([a-z0-9]{2,5})(\?|$)/i.exec(s ?? '')?.[1]?.toLowerCase() ?? null;
}

/** The type the hints give, or null when none of them says (then the kind's default is assumed, or the file's own report is waited for). */
function hintedPartType(kind: PartKind, hints: PartHints): { ext: string; contentType: string } | null {
  const mime = normalizeMime(hints.mimeType);
  const reported = normalizeMime(hints.reported);
  const name = extensionOf(hints.fileName);
  const uri = extensionOf(hints.uri);
  const family = kind === 'photo' ? 'image/' : kind === 'voice' ? 'audio/' : '';
  const byExt = kind === 'photo' ? IMAGE_EXT : kind === 'voice' ? AUDIO_EXT : FILE_EXT;
  // A recording's own uri is the better hint (the recorder wrote it); a photo's name is the picker's.
  const named = (kind === 'voice' ? [uri, name] : [name, uri]).find((e): e is string => !!e && !!byExt[e]) ?? null;
  const fromMime = mime && mime.startsWith(family) ? mime : null;
  const fromReport = reported && reported !== 'application/octet-stream' && reported.startsWith(family) ? reported : null;
  const contentType = fromMime ?? (named ? byExt[named] : null) ?? fromReport;
  if (!contentType) return null;
  return { ext: named ?? EXT_OF_TYPE[contentType] ?? (kind === 'file' ? (name ?? uri ?? 'bin') : DEFAULT_TYPE[kind].ext), contentType };
}


/** Whether anything about the part says what type it is (so it can be checked before the file is read). */
export function hasTypeHint(kind: PartKind, hints: PartHints): boolean {
  return hintedPartType(kind, hints) !== null;
}

/**
 * The file name extension and content type a part is uploaded under, from what the picker or the recorder said about
 * it (an explicit type, then the extension of the name or uri, then what the file reported), spelled the way the bucket
 * spells them. With no hint at all: a JPEG photo, an MP4 voice note, an anonymous file.
 */
export function partFile(kind: PartKind, hints: PartHints): { ext: string; contentType: string } {
  return hintedPartType(kind, hints) ?? DEFAULT_TYPE[kind];
}

/** What a failed storage upload says it was: the type is not one the bucket takes (415), the file is over the size limit (413), or this answer can no longer be changed (403). */
export type StorageProblem = 'type' | 'size' | 'locked';

/** Reads a storage error (the HTTP status, the service's own status code and code, its words) as one of the problems above; null when it is something else. */
export function storageProblem(error: { message?: string; status?: number | string; statusCode?: number | string; code?: string; error?: string } | null | undefined): StorageProblem | null {
  if (!error) return null;
  const codes = [String(error.statusCode ?? ''), String(error.status ?? '')];
  const text = `${error.code ?? ''} ${error.error ?? ''} ${error.message ?? ''}`;
  if (codes.includes('415') || /invalid.?mime|mime type .*not supported|unsupported media/i.test(text)) return 'type';
  if (codes.includes('413') || /too.?large|exceeded the maximum allowed size|maximum allowed size/i.test(text)) return 'size';
  if (codes.includes('403') || /access.?denied|unauthorized|row-level security/i.test(text)) return 'locked';
  return null;
}

/** Where a part goes in the bucket: `<center>/<person>/<submission>/<id>.<ext>` (the bucket's rules read the person from the path). */
export function storagePath(args: { centerId: string; personId: string; submissionId: string; id: string; ext: string }): string {
  return `${args.centerId}/${args.personId}/${args.submissionId}/${args.id}.${args.ext}`;
}

/** The words for a part: "Photo", "Voice note · 0:42", "File". */
export function partLabel(part: { kind: PartKind; durationSeconds: number | null }): { key: StringKey; vars?: Record<string, string | number> } {
  if (part.kind === 'voice') {
    const s = Math.max(0, Math.floor(part.durationSeconds ?? 0));
    return part.durationSeconds !== null ? { key: 'hw.part.voiceLength', vars: { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` } } : { key: 'hw.part.voice' };
  }
  return { key: part.kind === 'photo' ? 'hw.part.photo' : 'hw.part.file' };
}

// ---------------------------------------------------------------------------
// Lists: per person, per level, per goal
// ---------------------------------------------------------------------------

/** Lower comes first: what needs this reader first, then what is still to do, then what is waiting elsewhere, then what is done. */
function priority(item: HomeworkItem): number {
  const state = homeworkState(item.submission);
  if (state === 'awaiting_parent') return item.canParentDecide ? 0 : 4;
  return { needs_work: 1, draft: 2, not_started: 3, submitted: 5, accepted: 6 }[state];
}

/** Needs attention first, then by due date (soonest first, none last), then by title. */
export function sortItems(items: readonly HomeworkItem[]): HomeworkItem[] {
  return [...items].sort((a, b) => {
    const p = priority(a) - priority(b);
    if (p !== 0) return p;
    const da = a.assignment.dueOn;
    const db = b.assignment.dueOn;
    if (da !== db) return da === null ? 1 : db === null ? -1 : da.localeCompare(db);
    return a.assignment.title.localeCompare(b.assignment.title);
  });
}

export function itemsForPerson(items: readonly HomeworkItem[], personId: string): HomeworkItem[] {
  return sortItems(items.filter((i) => i.personId === personId));
}

export function itemsForLevel(items: readonly HomeworkItem[], levelId: string, personId: string): HomeworkItem[] {
  return sortItems(items.filter((i) => i.personId === personId && i.assignment.levelId === levelId));
}

export function itemsForGoal(items: readonly HomeworkItem[], goalId: string, personId: string): HomeworkItem[] {
  return sortItems(items.filter((i) => i.personId === personId && i.assignment.goalId === goalId));
}

/** The items in the order of the goal's levels (level 1 first; homework of no known level last), keeping their order within a level. */
export function sortByLevel(items: readonly HomeworkItem[], levelIds: readonly string[]): HomeworkItem[] {
  const place = (i: HomeworkItem) => {
    const at = i.assignment.levelId ? levelIds.indexOf(i.assignment.levelId) : -1;
    return at < 0 ? levelIds.length : at;
  };
  return items.map((item, n) => ({ item, n })).sort((a, b) => place(a.item) - place(b.item) || a.n - b.n).map((x) => x.item);
}

/**
 * What a level's points wait for. The app counts a level as done when every step is done, but the database (0587
 * gyan_award_level_bonus) pays the level's points and its treasure only once every published required-for-level
 * homework that applies to the learner is accepted. `items` are the person's homework for ONE level. Null when
 * nothing is required or it is all accepted; else the words: the one title, or the first and how many more.
 */
export function levelPointsWait(items: readonly HomeworkItem[]): { key: StringKey; vars: { title: string; n: number } } | null {
  const waiting = items.filter((i) => i.assignment.requiredForLevel && homeworkState(i.submission) !== 'accepted');
  if (waiting.length === 0) return null;
  const title = waiting[0].assignment.title;
  return waiting.length === 1 ? { key: 'hw.levelWaits', vars: { title, n: 0 } } : { key: 'hw.levelWaitsMany', vars: { title, n: waiting.length - 1 } };
}

/** Still to do by this learner: not started, a draft, or sent back. */
export function toDoCount(items: readonly HomeworkItem[]): number {
  return items.filter((i) => canEdit(homeworkState(i.submission), 'learner')).length;
}

export type PersonCounts = {
  /** Not started, a draft, or sent back. */
  toDo: number;
  /** Waiting for a parent, and this reader may decide. */
  needsOk: number;
  /** Waiting for a parent (someone else decides, or the learner is looking). */
  waitingParent: number;
  withTeacher: number;
  accepted: number;
  total: number;
};

export function countsFor(items: readonly HomeworkItem[], personId: string): PersonCounts {
  const counts: PersonCounts = { toDo: 0, needsOk: 0, waitingParent: 0, withTeacher: 0, accepted: 0, total: 0 };
  for (const item of items) {
    if (item.personId !== personId) continue;
    counts.total += 1;
    const state = homeworkState(item.submission);
    if (state === 'awaiting_parent') {
      if (item.canParentDecide) counts.needsOk += 1;
      else counts.waitingParent += 1;
    } else if (state === 'submitted') counts.withTeacher += 1;
    else if (state === 'accepted') counts.accepted += 1;
    else counts.toDo += 1;
  }
  return counts;
}

/** The parts of "Homework: 1 needs your OK · 2 with the teacher", in that order; empty when the person has no homework. */
export function homeworkLineParts(counts: PersonCounts): { key: StringKey; vars: { n: number } }[] {
  const out: { key: StringKey; vars: { n: number } }[] = [];
  if (counts.needsOk) out.push({ key: counts.needsOk === 1 ? 'hw.line.needsOk' : 'hw.line.needsOkMany', vars: { n: counts.needsOk } });
  if (counts.toDo) out.push({ key: 'hw.line.toDo', vars: { n: counts.toDo } });
  if (counts.waitingParent) out.push({ key: 'hw.line.waitingParent', vars: { n: counts.waitingParent } });
  if (counts.withTeacher) out.push({ key: 'hw.line.withTeacher', vars: { n: counts.withTeacher } });
  if (counts.accepted) out.push({ key: 'hw.line.accepted', vars: { n: counts.accepted } });
  return out;
}

/** The waiting answers of the family's children that this adult may decide, oldest hand-in first (Home's "Needs your OK" strip). */
export function needsYourOk(items: readonly HomeworkItem[], myPersonId: string): HomeworkItem[] {
  return items
    .filter((i) => i.personId !== myPersonId && i.canParentDecide && homeworkState(i.submission) === 'awaiting_parent')
    .sort((a, b) => (a.submission?.submittedAt ?? '').localeCompare(b.submission?.submittedAt ?? '') || a.assignment.title.localeCompare(b.assignment.title));
}

/** "Aarav" from "Aarav Shah" (the RPC's people carry full names; the family roster is preferred when it has the person). */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

// ---------------------------------------------------------------------------
// The accept celebration, once per submission on this device
// ---------------------------------------------------------------------------

export const CELEBRATED_PREF = 'homeworkCelebrated';

/** The submission ids already celebrated on this device, read defensively. */
export function parseCelebrated(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

/**
 * An accepted answer this device has not celebrated yet, for the learner only: a parent who opens the child's accepted
 * homework (to read the teacher's note, say) must not use up the child's burst and toast on this device.
 */
export function shouldCelebrate(seen: readonly string[], sub: Submission | null, viewer: Viewer = 'learner'): boolean {
  return viewer === 'learner' && !!sub && sub.status === 'accepted' && !seen.includes(sub.id);
}

/** Add one, keeping only the newest `keep`. */
export function recordCelebrated(seen: readonly string[], id: string, keep = 100): string[] {
  return [...seen.filter((x) => x !== id), id].slice(-keep);
}

// ---------------------------------------------------------------------------
// Deep links (push data: deep_link "/gyan/homework/<assignment id>?person=<person id>")
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseHomeworkLink(link: string | null | undefined): { assignmentId: string; personId: string | null } | null {
  if (!link) return null;
  const m = /^\/?(?:gyan\/)?homework\/([^/?#]+)\/?(?:\?([^#]*))?$/i.exec(link.trim());
  if (!m || !UUID.test(m[1])) return null;
  let personId: string | null = null;
  for (const pair of (m[2] ?? '').split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(pair.slice(0, eq));
      value = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      return null;
    }
    if (key === 'person' && UUID.test(value)) personId = value;
  }
  return { assignmentId: m[1], personId };
}
