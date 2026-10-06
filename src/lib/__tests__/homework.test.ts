import { describe, expect, it } from '@jest/globals';

import {
  answerButtons,
  canDecide,
  canEdit,
  comebackNote,
  countsFor,
  dueLine,
  firstNameOf,
  handInBlock,
  handInNote,
  hasTypeHint,
  homeworkLineParts,
  homeworkState,
  isOverdue,
  itemsForGoal,
  itemsForLevel,
  itemsForPerson,
  keptFiles,
  normalizeMime,
  BUCKET_TYPES,
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  MAX_VOICE_SECONDS,
  needsYourOk,
  parseAssignment,
  parseCelebrated,
  parseHomework,
  parseHomeworkLink,
  parseSubmission,
  partFile,
  partLabel,
  partTypeAllowed,
  recordCelebrated,
  shortDate,
  shouldCelebrate,
  sortByLevel,
  sortItems,
  STATE_LABEL,
  STATE_TONE,
  storagePath,
  storageProblem,
  toDoCount,
  viewerFor,
  type HomeworkItem,
  type Submission,
} from '../homework';

const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';
const P_ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P_KID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const P_OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const S1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const rawAssignment = {
  id: A1,
  level_id: 'lvl-1',
  goal_id: 'goal-1',
  title: 'Record the Navkar Mantra',
  instructions_md: '# Say it\n\nRecord yourself **slowly**.',
  allowed_kinds: ['voice', 'text', 'file', 'video'],
  max_files: 2,
  points: 10,
  required_for_level: true,
  due_on: '2026-10-12',
  parent_check: 'children',
  class_id: null,
};

const rawSubmission = {
  id: S1,
  status: 'draft',
  attempt: 2,
  text_answer: 'My answer',
  submitted_at: null,
  parent_note: 'Say it slower',
  review_note: null,
  decided_at: null,
  points_awarded: 0,
  late: false,
  files: [
    { id: 'f2', kind: 'voice', storage_path: 'c/p/s/f2.m4a', mime_type: 'audio/mp4', bytes: 1200, duration_seconds: 42.4, sort_order: 2, deleted_at: null },
    { id: 'f1', kind: 'photo', storage_path: null, mime_type: 'image/jpeg', bytes: 3000, duration_seconds: null, sort_order: 1, deleted_at: '2026-09-01T00:00:00Z' },
    { id: 'f3', kind: 'hologram', storage_path: 'x', mime_type: null, bytes: null, duration_seconds: null, sort_order: 3, deleted_at: null },
    'junk',
  ],
};

const rawAnswer = {
  people: [
    { person_id: P_ME, name: 'Priya Shah', is_child: false },
    { person_id: P_KID, name: 'Aarav Shah', is_child: true },
    { name: 'no id' },
  ],
  items: [
    { assignment: rawAssignment, person_id: P_ME, submission: null, needs_parent: false, can_parent_decide: false },
    { assignment: rawAssignment, person_id: P_KID, submission: { ...rawSubmission, status: 'awaiting_parent', submitted_at: '2026-10-05T10:00:00Z' }, needs_parent: true, can_parent_decide: true },
    { assignment: { ...rawAssignment, id: A2, title: 'Draw the derasar', allowed_kinds: ['photo'], due_on: null, points: 'lots', max_files: 0 }, person_id: P_KID, submission: rawSubmission, needs_parent: true, can_parent_decide: false },
    { assignment: rawAssignment, person_id: P_KID, submission: { id: 'bad', status: 'teleported' }, needs_parent: false, can_parent_decide: false },
    { assignment: { title: 'no id' }, person_id: P_KID, submission: null },
    null,
  ],
};

function item(over: Partial<HomeworkItem> & { status?: Submission['status'] | null; dueOn?: string | null; title?: string; submittedAt?: string | null }): HomeworkItem {
  const assignment = parseAssignment({ ...rawAssignment, due_on: over.dueOn === undefined ? rawAssignment.due_on : over.dueOn, title: over.title ?? rawAssignment.title })!;
  const submission = over.status === null ? null : over.status ? parseSubmission({ ...rawSubmission, status: over.status, submitted_at: over.submittedAt ?? null }) : null;
  return { assignment, personId: P_ME, submission, needsParent: false, canParentDecide: false, ...over };
}

describe('reading the my_gyan_homework answer', () => {
  it('reads an assignment, keeping only the kinds it knows and sensible numbers', () => {
    const a = parseAssignment(rawAssignment)!;
    expect(a).toMatchObject({ id: A1, levelId: 'lvl-1', goalId: 'goal-1', title: 'Record the Navkar Mantra', allowedKinds: ['voice', 'text', 'file'], maxFiles: 2, points: 10, requiredForLevel: true, dueOn: '2026-10-12', parentCheck: 'children', classId: null });
    expect(a.instructionsMd).toContain('Record yourself');
    expect(parseAssignment({ ...rawAssignment, points: 'lots', max_files: 0, parent_check: 'maybe', due_on: 'soon', allowed_kinds: 'photo' })).toMatchObject({ points: 0, maxFiles: 3, parentCheck: 'children', dueOn: null, allowedKinds: [] });
    expect(parseAssignment({ ...rawAssignment, points: 7.9, max_files: '4', parent_check: 'always', due_on: '2026-11-01T00:00:00' })).toMatchObject({ points: 7, maxFiles: 4, parentCheck: 'always', dueOn: '2026-11-01' });
    expect(parseAssignment({ ...rawAssignment, id: '' })).toBeNull();
    expect(parseAssignment({ ...rawAssignment, title: '  ' })).toBeNull();
    expect(parseAssignment('nope')).toBeNull();
  });

  it('reads a submission and its parts in order, dropping parts it cannot read', () => {
    const s = parseSubmission(rawSubmission)!;
    expect(s).toMatchObject({ id: S1, status: 'draft', attempt: 2, textAnswer: 'My answer', parentNote: 'Say it slower', reviewNote: null, pointsAwarded: 0, late: false });
    expect(s.files.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(s.files[0]).toMatchObject({ kind: 'photo', storagePath: null, deleted: true, sortOrder: 1 });
    expect(s.files[1]).toMatchObject({ kind: 'voice', storagePath: 'c/p/s/f2.m4a', mimeType: 'audio/mp4', bytes: 1200, durationSeconds: 42.4, deleted: false });
    expect(parseSubmission({ ...rawSubmission, status: 'teleported' })).toBeNull();
    expect(parseSubmission({ ...rawSubmission, id: null })).toBeNull();
    expect(parseSubmission({ ...rawSubmission, attempt: 0, points_awarded: '12', late: 'yes', files: 'none' })).toMatchObject({ attempt: 1, pointsAwarded: 12, late: false, files: [] });
    expect(parseSubmission(null)).toBeNull();
  });

  it('reads the whole answer, counting what it had to leave out', () => {
    const hw = parseHomework(rawAnswer)!;
    expect(hw.people).toEqual([
      { personId: P_ME, name: 'Priya Shah', isChild: false },
      { personId: P_KID, name: 'Aarav Shah', isChild: true },
    ]);
    expect(hw.items).toHaveLength(3);
    expect(hw.skipped).toBe(3);
    expect(hw.items[0]).toMatchObject({ personId: P_ME, submission: null, needsParent: false, canParentDecide: false });
    expect(hw.items[1]).toMatchObject({ personId: P_KID, needsParent: true, canParentDecide: true });
    expect(hw.items[1].submission?.status).toBe('awaiting_parent');
    expect(hw.items[2].assignment).toMatchObject({ id: A2, allowedKinds: ['photo'], dueOn: null, points: 0, maxFiles: 3 });
  });

  it('is null for anything that is not an answer', () => {
    expect(parseHomework(null)).toBeNull();
    expect(parseHomework({ people: [] })).toBeNull();
    expect(parseHomework('[]')).toBeNull();
    expect(parseHomework({ items: [] })).toEqual({ people: [], items: [], skipped: 0 });
  });
});

describe('status', () => {
  it('names every state with a chip colour', () => {
    expect(homeworkState(null)).toBe('not_started');
    expect(homeworkState(parseSubmission(rawSubmission))).toBe('draft');
    for (const state of ['not_started', 'draft', 'awaiting_parent', 'submitted', 'accepted', 'needs_work'] as const) {
      expect(STATE_LABEL[state]).toMatch(/^hw\.status\./);
      expect(STATE_TONE[state]).toBeTruthy();
    }
    expect(STATE_TONE.accepted).toBe('green');
    expect(STATE_TONE.needs_work).toBe('red');
  });

  it('says when it is due, and when it is overdue (never a gate)', () => {
    expect(shortDate('2026-10-12')).toBe('Oct 12');
    expect(dueLine(null, '2026-10-05')).toBeNull();
    expect(dueLine('2026-10-05', '2026-10-05')).toEqual({ key: 'hw.dueToday' });
    expect(dueLine('2026-10-06', '2026-10-05')).toEqual({ key: 'hw.dueTomorrow' });
    expect(dueLine('2026-10-12', '2026-10-05')).toEqual({ key: 'hw.dueOn', vars: { date: 'Oct 12' } });
    expect(dueLine('2026-10-01', '2026-10-05')).toEqual({ key: 'hw.wasDue', vars: { date: 'Oct 1' } });
    expect(isOverdue(item({ status: null, dueOn: '2026-10-01' }), '2026-10-05')).toBe(true);
    expect(isOverdue(item({ status: 'draft', dueOn: '2026-10-01' }), '2026-10-05')).toBe(true);
    expect(isOverdue(item({ status: 'needs_work', dueOn: '2026-10-05' }), '2026-10-05')).toBe(false);
    expect(isOverdue(item({ status: 'submitted', dueOn: '2026-10-01' }), '2026-10-05')).toBe(false);
    expect(isOverdue(item({ status: 'awaiting_parent', dueOn: '2026-10-01' }), '2026-10-05')).toBe(false);
    expect(isOverdue(item({ status: null, dueOn: null }), '2026-10-05')).toBe(false);
  });

  it('explains how the answer came back, and only for the latest round', () => {
    const base = { ...rawSubmission, submitted_at: '2026-10-05T10:00:00+00:00', parent_note: null, review_note: null, decided_at: null };
    expect(comebackNote(null)).toBeNull();
    expect(comebackNote(parseSubmission({ ...base, status: 'needs_work', review_note: 'Slower, please' }))).toEqual({ from: 'teacher', note: 'Slower, please' });
    expect(comebackNote(parseSubmission({ ...base, status: 'needs_work' }))).toBeNull();
    // A parent sent it back: a draft again, with no teacher decision since the hand-in.
    expect(comebackNote(parseSubmission({ ...base, status: 'draft', parent_note: 'Say it slower' }))).toEqual({ from: 'parent', note: 'Say it slower' });
    expect(comebackNote(parseSubmission({ ...base, status: 'draft', parent_note: 'Say it slower', review_note: 'Old', decided_at: '2026-10-01T10:00:00+00:00' }))).toEqual({ from: 'parent', note: 'Say it slower' });
    // The teacher sent it back and the learner is editing: the teacher's note, not the parent's older words.
    expect(comebackNote(parseSubmission({ ...base, status: 'draft', parent_note: 'Good job', review_note: 'Add the last line', decided_at: '2026-10-06T10:00:00+00:00' }))).toEqual({ from: 'teacher', note: 'Add the last line' });
    expect(comebackNote(parseSubmission({ ...base, status: 'draft', parent_note: 'Good job', decided_at: '2026-10-06T10:00:00+00:00' }))).toBeNull();
    // Never handed in, or elsewhere: nothing to explain here.
    expect(comebackNote(parseSubmission({ ...base, status: 'draft', submitted_at: null, parent_note: 'x' }))).toBeNull();
    expect(comebackNote(parseSubmission({ ...base, status: 'awaiting_parent', parent_note: 'x' }))).toBeNull();
    expect(comebackNote(parseSubmission({ ...base, status: 'accepted', review_note: 'Lovely' }))).toBeNull();
  });
});

describe('who is looking', () => {
  const me = { personId: P_ME, isAdult: true };
  // The people my_gyan_homework answers with: the caller and the household members the caller may act for.
  const people = [{ personId: P_ME }, { personId: P_KID }];
  it('is the learner, a household adult, or nobody', () => {
    expect(viewerFor(P_ME, me, people)).toBe('learner');
    expect(viewerFor(P_KID, me, people)).toBe('parent');
    expect(viewerFor(P_OTHER, me, people)).toBe('none');
    expect(viewerFor(P_KID, { ...me, isAdult: false }, people)).toBe('none');
    expect(viewerFor(P_ME, { ...me, isAdult: false }, [{ personId: P_ME }])).toBe('learner');
  });
  it("takes a child of a second household as a child (the function's people list, not the primary household roster)", () => {
    // P_OTHER lives in another household the caller belongs to: the answer's people carry them, the roster would not.
    expect(viewerFor(P_OTHER, me, [...people, { personId: P_OTHER }])).toBe('parent');
    expect(viewerFor(P_OTHER, me, people)).toBe('none');
    // A reader the database gave no one but themself (a child's own login) is nobody's parent.
    expect(viewerFor(P_OTHER, { personId: P_KID, isAdult: false }, [{ personId: P_KID }])).toBe('none');
  });
  it('lets the learner or a parent work on an answer that is not started, a draft or sent back', () => {
    expect(canEdit('not_started', 'learner')).toBe(true);
    expect(canEdit('draft', 'parent')).toBe(true);
    expect(canEdit('needs_work', 'learner')).toBe(true);
    expect(canEdit('awaiting_parent', 'learner')).toBe(false);
    expect(canEdit('submitted', 'parent')).toBe(false);
    expect(canEdit('accepted', 'learner')).toBe(false);
    expect(canEdit('draft', 'none')).toBe(false);
  });
  it('lets only a household adult the database named decide a waiting answer', () => {
    expect(canDecide(item({ status: 'awaiting_parent', canParentDecide: true }), 'parent')).toBe(true);
    expect(canDecide(item({ status: 'awaiting_parent', canParentDecide: false }), 'parent')).toBe(false);
    expect(canDecide(item({ status: 'awaiting_parent', canParentDecide: true }), 'learner')).toBe(false);
    expect(canDecide(item({ status: 'submitted', canParentDecide: true }), 'parent')).toBe(false);
  });
  it('explains what handing in means for this reader', () => {
    expect(handInNote({ needsParent: true }, 'learner')).toBe('parent_checks_first');
    expect(handInNote({ needsParent: false }, 'learner')).toBe('straight_to_teacher');
    // A parent handing in for a child is already the parent: no parent step.
    expect(handInNote({ needsParent: true }, 'parent')).toBe('parent_hands_in');
  });
});

describe('the ways to answer', () => {
  it('shows the allowed buttons in order, with Attach a file disabled until the next app update', () => {
    expect(answerButtons(['text', 'file', 'photo', 'voice'])).toEqual([
      { kind: 'photo', available: true },
      { kind: 'voice', available: true },
      { kind: 'file', available: false },
      { kind: 'text', available: true },
    ]);
    expect(answerButtons(['photo'])).toEqual([{ kind: 'photo', available: true }]);
    expect(answerButtons([])).toEqual([]);
  });

  it('refuses to hand in while a part is uploading or not uploaded, with too many parts, too much text, or nothing at all', () => {
    const uploaded = { state: 'uploaded' as const };
    expect(handInBlock({ parts: [uploaded, { state: 'uploading' }], text: '', maxFiles: 3, textAllowed: true })).toBe('uploading');
    expect(handInBlock({ parts: [uploaded, { state: 'failed' }], text: 'x', maxFiles: 3, textAllowed: true })).toBe('not_uploaded');
    expect(handInBlock({ parts: [uploaded, uploaded, uploaded, uploaded], text: '', maxFiles: 3, textAllowed: true })).toBe('too_many');
    expect(handInBlock({ parts: [], text: 'a'.repeat(MAX_TEXT_CHARS + 1), maxFiles: 3, textAllowed: true })).toBe('text_too_long');
    expect(handInBlock({ parts: [], text: '   ', maxFiles: 3, textAllowed: true })).toBe('empty');
    // Text the assignment does not allow does not count as an answer.
    expect(handInBlock({ parts: [], text: 'hello', maxFiles: 3, textAllowed: false })).toBe('empty');
    expect(handInBlock({ parts: [], text: 'hello', maxFiles: 3, textAllowed: true })).toBeNull();
    expect(handInBlock({ parts: [uploaded], text: '', maxFiles: 1, textAllowed: false })).toBeNull();
  });

  it('keeps only the parts that are still stored when an answer is edited again', () => {
    const s = parseSubmission(rawSubmission);
    expect(keptFiles(s).map((f) => f.id)).toEqual(['f2']);
    expect(keptFiles(null)).toEqual([]);
  });

  it('names the file and content type of a part from what the picker or recorder said', () => {
    expect(partFile('photo', { fileName: 'IMG_0001.HEIC', mimeType: 'image/heic' })).toEqual({ ext: 'heic', contentType: 'image/heic' });
    expect(partFile('photo', { fileName: null, mimeType: 'image/png', uri: 'file:///tmp/abc' })).toEqual({ ext: 'png', contentType: 'image/png' });
    expect(partFile('photo', { uri: 'file:///tmp/pic.jpeg' })).toEqual({ ext: 'jpeg', contentType: 'image/jpeg' });
    expect(partFile('photo', {})).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
    expect(partFile('voice', { uri: 'file:///rec/abc.m4a' })).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
    expect(partFile('voice', { uri: 'blob:http://x/abc', mimeType: 'audio/webm;codecs=opus' })).toEqual({ ext: 'webm', contentType: 'audio/webm' });
    expect(partFile('voice', {})).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
    expect(partFile('file', { fileName: 'notes.pdf', mimeType: 'application/pdf' })).toEqual({ ext: 'pdf', contentType: 'application/pdf' });
    expect(partFile('file', {})).toEqual({ ext: 'bin', contentType: 'application/octet-stream' });
  });

  it("spells types the way the bucket does (image/jpg is image/jpeg, audio/m4a is audio/mp4) and drops ';codecs=…'", () => {
    expect(normalizeMime('IMAGE/JPG')).toBe('image/jpeg');
    expect(normalizeMime('audio/m4a')).toBe('audio/mp4');
    expect(normalizeMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeMime(' audio/mp3 ')).toBe('audio/mpeg');
    expect(normalizeMime(null)).toBe('');
    expect(partFile('photo', { fileName: 'x.jpg', mimeType: 'image/jpg' })).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
    expect(partFile('voice', { mimeType: 'audio/m4a' })).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
  });

  it('knows which types the bucket takes for which kind of part (0587)', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']) expect(partTypeAllowed('photo', t)).toBe(true);
    for (const t of ['image/gif', 'image/avif', 'image/bmp', 'image/svg+xml', 'image/tiff', 'application/pdf', 'audio/mp4', '']) expect(partTypeAllowed('photo', t)).toBe(false);
    for (const t of ['audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/aac', 'audio/webm', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/3gpp', 'audio/x-caf']) expect(partTypeAllowed('voice', t)).toBe(true);
    for (const t of ['audio/flac', 'audio/x-aiff', 'audio/m4a', 'video/mp4', 'image/png', 'application/pdf']) expect(partTypeAllowed('voice', t)).toBe(false);
    expect(partTypeAllowed('file', 'application/pdf')).toBe(true);
    expect(partTypeAllowed('file', 'text/plain')).toBe(true);
    expect(partTypeAllowed('file', 'application/zip')).toBe(false);
    expect(partTypeAllowed('file', 'application/octet-stream')).toBe(false);
    expect(BUCKET_TYPES).toHaveLength(23);
  });

  it('refuses what the picker says is a GIF or an AVIF, by its type or by its name', () => {
    expect(partTypeAllowed('photo', partFile('photo', { mimeType: 'image/gif', fileName: 'party.gif' }).contentType)).toBe(false);
    expect(partTypeAllowed('photo', partFile('photo', { mimeType: 'image/avif' }).contentType)).toBe(false);
    expect(partTypeAllowed('photo', partFile('photo', { mimeType: 'image/jpg' }).contentType)).toBe(true);
    expect(hasTypeHint('photo', { mimeType: 'image/gif' })).toBe(true);
  });

  it('takes the type of a part from the file itself only when nothing else says (a recording made in a browser)', () => {
    expect(hasTypeHint('voice', { uri: 'blob:http://localhost:8099/6f1c' })).toBe(false);
    expect(partFile('voice', { uri: 'blob:http://localhost:8099/6f1c' })).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
    expect(hasTypeHint('voice', { uri: 'blob:http://localhost:8099/6f1c', reported: 'audio/webm;codecs=opus' })).toBe(true);
    expect(partFile('voice', { uri: 'blob:http://localhost:8099/6f1c', reported: 'audio/webm;codecs=opus' })).toEqual({ ext: 'webm', contentType: 'audio/webm' });
    expect(partFile('voice', { uri: 'blob:x', reported: 'audio/mp4' })).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
    // What the picker or the recorder said wins over what the fetch reported, and a report of the wrong family or a bare octet-stream says nothing.
    expect(partFile('voice', { uri: 'file:///rec/a.m4a', reported: 'audio/webm' })).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
    expect(hasTypeHint('voice', { uri: 'blob:x', reported: 'application/octet-stream' })).toBe(false);
    expect(hasTypeHint('photo', { uri: 'blob:x', reported: 'audio/webm' })).toBe(false);
    expect(partFile('photo', { uri: 'blob:x', reported: 'image/png' })).toEqual({ ext: 'png', contentType: 'image/png' });
  });

  it('reads what a failed storage upload was: a type (415), a size (413) or a locked answer (403)', () => {
    expect(storageProblem({ message: 'mime type image/gif is not supported', statusCode: '415' })).toBe('type');
    expect(storageProblem({ message: 'invalid_mime_type', status: 400, statusCode: '415' })).toBe('type');
    expect(storageProblem({ message: 'x', code: 'InvalidMimeType' })).toBe('type');
    expect(storageProblem({ message: 'The object exceeded the maximum allowed size', statusCode: '413' })).toBe('size');
    expect(storageProblem({ message: 'Payload too large', status: 413 })).toBe('size');
    expect(storageProblem({ message: 'new row violates row-level security policy', status: 400, statusCode: '403' })).toBe('locked');
    expect(storageProblem({ message: 'Unauthorized', code: 'AccessDenied' })).toBe('locked');
    expect(storageProblem({ message: 'Bucket not found', statusCode: '404' })).toBeNull();
    expect(storageProblem({ message: 'fetch failed' })).toBeNull();
    expect(storageProblem(null)).toBeNull();
  });

  it('puts a part under the center, the person and the submission', () => {
    expect(storagePath({ centerId: 'c1', personId: 'p1', submissionId: 's1', id: 'u1', ext: 'jpg' })).toBe('c1/p1/s1/u1.jpg');
  });

  it('labels a part', () => {
    expect(partLabel({ kind: 'photo', durationSeconds: null })).toEqual({ key: 'hw.part.photo' });
    expect(partLabel({ kind: 'file', durationSeconds: null })).toEqual({ key: 'hw.part.file' });
    expect(partLabel({ kind: 'voice', durationSeconds: null })).toEqual({ key: 'hw.part.voice' });
    expect(partLabel({ kind: 'voice', durationSeconds: 65.7 })).toEqual({ key: 'hw.part.voiceLength', vars: { time: '1:05' } });
  });

  it('has the limits of the plan', () => {
    expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_TEXT_CHARS).toBe(2000);
    expect(MAX_VOICE_SECONDS).toBe(600);
  });
});

describe('lists', () => {
  const items: HomeworkItem[] = [
    item({ status: 'accepted', title: 'A accepted' }),
    item({ status: 'submitted', title: 'B teacher' }),
    item({ status: null, title: 'C not started', dueOn: '2026-10-20' }),
    item({ status: null, title: 'D not started soon', dueOn: '2026-10-07' }),
    item({ status: 'draft', title: 'E draft', dueOn: null }),
    item({ status: 'needs_work', title: 'F sent back' }),
    item({ status: 'awaiting_parent', title: 'G waiting', personId: P_KID, canParentDecide: true, submittedAt: '2026-10-05T12:00:00Z' }),
    item({ status: 'awaiting_parent', title: 'H waiting first', personId: P_KID, canParentDecide: true, submittedAt: '2026-10-04T12:00:00Z' }),
    item({ status: 'awaiting_parent', title: 'I waiting (child view)', personId: P_ME, canParentDecide: false }),
    (() => {
      const j = item({ status: null, title: 'J other level' });
      return { ...j, assignment: { ...j.assignment, id: A2, levelId: 'lvl-2', goalId: 'goal-2' } };
    })(),
  ];

  it('puts what needs the reader first, then what is to do by due date, then what waits, then what is done', () => {
    // J keeps the fixture's due date (Oct 12), so it comes between D (Oct 7) and C (Oct 20).
    expect(sortItems(items).map((i) => i.assignment.title)).toEqual(['G waiting', 'H waiting first', 'F sent back', 'E draft', 'D not started soon', 'J other level', 'C not started', 'I waiting (child view)', 'B teacher', 'A accepted']);
  });

  it('picks a person, a level or a goal', () => {
    expect(itemsForPerson(items, P_KID).map((i) => i.assignment.title)).toEqual(['G waiting', 'H waiting first']);
    expect(itemsForLevel(items, 'lvl-2', P_ME).map((i) => i.assignment.title)).toEqual(['J other level']);
    expect(itemsForLevel(items, 'lvl-2', P_KID)).toEqual([]);
    expect(itemsForGoal(items, 'goal-1', P_ME)).toHaveLength(7);
    expect(toDoCount(itemsForGoal(items, 'goal-1', P_ME))).toBe(4);
  });

  it("lists a goal's homework level by level, keeping the order within a level", () => {
    const at = (id: string, levelId: string | null) => item({ title: id, status: null, assignment: { ...parseAssignment({ ...rawAssignment, id, title: id, level_id: levelId })!, } });
    const a = at('a', 'lvl-2');
    const b = at('b', 'lvl-1');
    const c = at('c', 'lvl-2');
    const d = at('d', null);
    const e = at('e', 'lvl-gone');
    expect(sortByLevel([a, b, c, d, e], ['lvl-1', 'lvl-2', 'lvl-3']).map((i) => i.assignment.title)).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(sortByLevel([], ['lvl-1'])).toEqual([]);
    expect(sortByLevel([a], [])).toEqual([a]);
  });

  it('counts a person\'s homework and words the Family tab line', () => {
    expect(countsFor(items, P_ME)).toEqual({ toDo: 5, needsOk: 0, waitingParent: 1, withTeacher: 1, accepted: 1, total: 8 });
    expect(countsFor(items, P_KID)).toEqual({ toDo: 0, needsOk: 2, waitingParent: 0, withTeacher: 0, accepted: 0, total: 2 });
    expect(countsFor(items, P_OTHER)).toEqual({ toDo: 0, needsOk: 0, waitingParent: 0, withTeacher: 0, accepted: 0, total: 0 });
    expect(homeworkLineParts(countsFor(items, P_ME))).toEqual([
      { key: 'hw.line.toDo', vars: { n: 5 } },
      { key: 'hw.line.waitingParent', vars: { n: 1 } },
      { key: 'hw.line.withTeacher', vars: { n: 1 } },
      { key: 'hw.line.accepted', vars: { n: 1 } },
    ]);
    expect(homeworkLineParts(countsFor(items, P_KID))).toEqual([{ key: 'hw.line.needsOkMany', vars: { n: 2 } }]);
    expect(homeworkLineParts({ toDo: 0, needsOk: 1, waitingParent: 0, withTeacher: 2, accepted: 0, total: 3 })).toEqual([
      { key: 'hw.line.needsOk', vars: { n: 1 } },
      { key: 'hw.line.withTeacher', vars: { n: 2 } },
    ]);
    expect(homeworkLineParts(countsFor(items, P_OTHER))).toEqual([]);
  });

  it('lists the children\'s answers waiting for this adult, oldest hand-in first, never the adult\'s own', () => {
    expect(needsYourOk(items, P_ME).map((i) => i.assignment.title)).toEqual(['H waiting first', 'G waiting']);
    expect(needsYourOk(items, P_KID)).toEqual([]);
  });

  it('takes a first name', () => {
    expect(firstNameOf('Aarav Shah')).toBe('Aarav');
    expect(firstNameOf('  Priya ')).toBe('Priya');
    expect(firstNameOf('')).toBe('');
  });
});

describe('the accept celebration, once per device', () => {
  it('celebrates an accepted answer this device has not seen', () => {
    const accepted = parseSubmission({ ...rawSubmission, status: 'accepted', points_awarded: 10 });
    expect(shouldCelebrate([], accepted)).toBe(true);
    expect(shouldCelebrate([S1], accepted)).toBe(false);
    expect(shouldCelebrate([], parseSubmission(rawSubmission))).toBe(false);
    expect(shouldCelebrate([], null)).toBe(false);
  });
  it('remembers the newest ones and reads the list defensively', () => {
    expect(recordCelebrated(['a', 'b'], 'c', 2)).toEqual(['b', 'c']);
    expect(recordCelebrated(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(parseCelebrated(['a', 1, null, 'b', ''])).toEqual(['a', 'b']);
    expect(parseCelebrated('nope')).toEqual([]);
  });
});

describe('deep links', () => {
  it('reads /gyan/homework/<assignment>?person=<person>', () => {
    expect(parseHomeworkLink(`/gyan/homework/${A1}?person=${P_KID}`)).toEqual({ assignmentId: A1, personId: P_KID });
    expect(parseHomeworkLink(`gyan/homework/${A1}`)).toEqual({ assignmentId: A1, personId: null });
    expect(parseHomeworkLink(`homework/${A1}/?person=${P_KID}&x=1`)).toEqual({ assignmentId: A1, personId: P_KID });
    expect(parseHomeworkLink(`/gyan/homework/${A1}?person=not-an-id`)).toEqual({ assignmentId: A1, personId: null });
  });
  it('ignores anything else', () => {
    expect(parseHomeworkLink(`/gyan/homework/not-an-id`)).toBeNull();
    expect(parseHomeworkLink(`/survey/${A1}`)).toBeNull();
    expect(parseHomeworkLink(`/gyan/homework/${A1}/../x`)).toBeNull();
    expect(parseHomeworkLink(`/gyan/homework/${A1}?person=%E0%A4`)).toBeNull();
    expect(parseHomeworkLink('')).toBeNull();
    expect(parseHomeworkLink(null)).toBeNull();
  });
});
