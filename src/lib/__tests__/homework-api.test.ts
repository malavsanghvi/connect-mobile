import { describe, expect, it, jest } from '@jest/globals';

import { handIn, isRefusal, loadHomework, parentDecide, saveDraft, uploadPart } from '../api/homework';
import { AppError } from '../errors';

type Result = { data: unknown; error: unknown };
const mockRpc = jest.fn<(name: string, args: unknown) => Promise<Result>>();
const mockUpload = jest.fn<(path: string, body: ArrayBuffer, opts: unknown) => Promise<{ error: { message: string; statusCode?: string } | null }>>();
const mockRemove = jest.fn<(paths: string[]) => Promise<{ error: { message: string } | null }>>();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    storage: { from: () => ({ upload: (path: string, body: ArrayBuffer, opts: unknown) => mockUpload(path, body, opts), remove: (paths: string[]) => mockRemove(paths) }) },
  },
}));

const A1 = '11111111-1111-4111-8111-111111111111';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const submission = { id: S1, status: 'draft', attempt: 1, text_answer: null, submitted_at: null, parent_note: null, review_note: null, decided_at: null, points_awarded: 0, late: false, files: [] };

function quiet(): jest.SpiedFunction<typeof console.error> {
  return jest.spyOn(console, 'error').mockImplementation(() => undefined);
}

describe('loading homework', () => {
  it('asks app.my_gyan_homework for the community and reads the answer', async () => {
    mockRpc.mockResolvedValueOnce({ data: { people: [], items: [{ assignment: { id: A1, title: 'Draw it', allowed_kinds: ['photo'] }, person_id: P1, submission: null, needs_parent: true, can_parent_decide: false }] }, error: null });
    const res = await loadHomework('center-1');
    expect(mockRpc).toHaveBeenCalledWith('my_gyan_homework', { p_center: 'center-1' });
    expect(res.kind).toBe('answered');
    if (res.kind !== 'answered') return;
    expect(res.homework.items[0]).toMatchObject({ personId: P1, needsParent: true });
  });

  it('treats a portal without the function as "not offered", logged once', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function app.my_gyan_homework(p_center) in the schema cache' } });
    expect(await loadHomework('center-1')).toEqual({ kind: 'missing' });
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function app.my_gyan_homework(uuid) does not exist' } });
    expect(await loadHomework('center-1')).toEqual({ kind: 'missing' });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('fails in plain English when it cannot be had or is not an answer', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    let err = await loadHomework('center-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe("We couldn't load your homework. Check your internet connection and try again.");
    mockRpc.mockResolvedValueOnce({ data: 'nonsense', error: null });
    err = await loadHomework('center-1').catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't load your homework — the answer was not what we expected. Please try again.");
    log.mockRestore();
  });
});

describe('writing homework', () => {
  it('saves a draft with the whole set of parts and reads the submission back', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ...submission, text_answer: 'Hi' }, error: null });
    const files = [{ kind: 'photo' as const, storage_path: 'c/p/s/x.jpg', mime_type: 'image/jpeg', bytes: 10, duration_seconds: null }];
    const sub = await saveDraft({ assignmentId: A1, personId: P1, text: 'Hi', files });
    expect(mockRpc).toHaveBeenLastCalledWith('save_gyan_submission_draft', { p_assignment: A1, p_person: P1, p_text: 'Hi', p_files: files });
    expect(sub).toMatchObject({ id: S1, status: 'draft', textAnswer: 'Hi' });
  });

  it('hands in and lets a parent decide, passing the note', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ...submission, status: 'awaiting_parent' }, error: null });
    expect((await handIn(S1)).status).toBe('awaiting_parent');
    expect(mockRpc).toHaveBeenLastCalledWith('hand_in_gyan_submission', { p_submission: S1 });
    mockRpc.mockResolvedValueOnce({ data: { ...submission, status: 'draft', parent_note: 'Slower' }, error: null });
    expect((await parentDecide(S1, 'send_back', 'Slower')).parentNote).toBe('Slower');
    expect(mockRpc).toHaveBeenLastCalledWith('parent_decide_gyan_submission', { p_submission: S1, p_decision: 'send_back', p_note: 'Slower' });
  });

  it('says when homework is not offered, and when the answer is not a submission', async () => {
    const log = quiet();
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function app.hand_in_gyan_submission' } });
    let err = await handIn(S1).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toMatch(/isn't available in your community yet/);
    mockRpc.mockResolvedValueOnce({ data: { id: 'x' }, error: null });
    err = await handIn(S1).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't hand in your homework — the answer was not what we expected. Please try again.");
    log.mockRestore();
  });

  describe("the database's refusals (0587 raises its sentences with 22023, P0002 and 42501)", () => {
    const refuse = async (call: () => Promise<unknown>, error: { code: string; message: string }): Promise<AppError> => {
      mockRpc.mockResolvedValueOnce({ data: null, error });
      return (await call().catch((e: unknown) => e)) as AppError;
    };
    const draft = () => saveDraft({ assignmentId: A1, personId: P1, text: null, files: [] });

    it('shows a rule of the homework as written (22023)', async () => {
      const log = quiet();
      let err = await refuse(() => handIn(S1), { code: '22023', message: 'This homework is already with the teacher.' });
      expect(err).toBeInstanceOf(AppError);
      expect(err.userMessage).toBe('This homework is already with the teacher.');
      expect(err.code).toBe('22023');
      expect(err.detail).toContain('This homework is already with the teacher.');
      err = await refuse(draft, { code: '22023', message: "This homework is waiting for a parent's OK and cannot be changed now." });
      expect(err.userMessage).toBe("This homework is waiting for a parent's OK and cannot be changed now.");
      err = await refuse(() => parentDecide(S1, 'ok', null), { code: '22023', message: "This homework is not waiting for a parent's OK (it is with the teacher)." });
      expect(err.userMessage).toBe("This homework is not waiting for a parent's OK (it is with the teacher).");
      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });

    it('shows "not found" (P0002) and "not allowed" (42501) as written, for loading too', async () => {
      const log = quiet();
      let err = await refuse(() => handIn(S1), { code: 'P0002', message: 'That homework answer was not found.' });
      expect(err.userMessage).toBe('That homework answer was not found.');
      err = await refuse(() => parentDecide(S1, 'ok', null), { code: '42501', message: "Only an adult of Aarav's household can check this homework." });
      expect(err.userMessage).toBe("Only an adult of Aarav's household can check this homework.");
      err = await refuse(() => loadHomework('center-1'), { code: '42501', message: 'Only members of this community can see its homework.' });
      expect(err.userMessage).toBe('Only members of this community can see its homework.');
      log.mockRestore();
    });

    it('gives a sentence without its full stop one', async () => {
      const log = quiet();
      const err = await refuse(draft, { code: '22023', message: 'This homework takes at most 3 files' });
      expect(err.userMessage).toBe('This homework takes at most 3 files.');
      log.mockRestore();
    });

    it("keeps Postgres' own words generic", async () => {
      const log = quiet();
      let err = await refuse(draft, { code: '42501', message: 'permission denied for table gyan_submissions' });
      expect(err.userMessage).toBe("You don't have permission to save your draft. If you think this is a mistake, please contact the office.");
      err = await refuse(draft, { code: '42501', message: 'new row violates row-level security policy for table "objects"' });
      expect(err.userMessage).toBe("You don't have permission to save your draft. If you think this is a mistake, please contact the office.");
      err = await refuse(() => handIn(S1), { code: 'P0002', message: 'query returned no rows' });
      expect(err.userMessage).toBe('Something went wrong while trying to hand in your homework. Please try again.');
      err = await refuse(() => handIn(S1), { code: 'XX000', message: 'Something broke inside the database.' });
      expect(err.userMessage).toBe('Something went wrong while trying to hand in your homework. Please try again.');
      log.mockRestore();
    });

    it('still passes a plain business-rule message (P0001) through the way the rest of the app does', async () => {
      const log = quiet();
      const err = await refuse(() => parentDecide(S1, 'ok', null), { code: 'P0001', message: 'Only a parent in the family can decide this' });
      expect(err.userMessage).toBe('Only a parent in the family can decide this.');
      log.mockRestore();
    });

    it('tells a refusal from a failure it cannot read (an upload is only removed after the first)', async () => {
      const log = quiet();
      expect(isRefusal(await refuse(() => handIn(S1), { code: '22023', message: 'This homework was already accepted.' }))).toBe(true);
      expect(isRefusal(await refuse(() => handIn(S1), { code: 'P0002', message: 'That homework answer was not found.' }))).toBe(true);
      expect(isRefusal(await refuse(() => handIn(S1), { code: '42501', message: 'permission denied for table x' }))).toBe(true);
      mockRpc.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
      expect(isRefusal(await handIn(S1).catch((e: unknown) => e))).toBe(false);
      expect(isRefusal(await refuse(() => handIn(S1), { code: '57014', message: 'canceling statement due to statement timeout' }))).toBe(false);
      expect(isRefusal(new Error('x'))).toBe(false);
      log.mockRestore();
    });
  });
});

describe('uploading a part', () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');

  it('reads the file, puts it under the center, person and submission, and describes it for the draft', async () => {
    fetchSpy.mockResolvedValueOnce({ arrayBuffer: async () => new ArrayBuffer(12) } as unknown as Response);
    mockUpload.mockResolvedValueOnce({ error: null });
    const part = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'voice', uri: 'file:///rec/a.m4a', durationSeconds: 42 });
    expect(part).toMatchObject({ kind: 'voice', mime_type: 'audio/mp4', bytes: 12, duration_seconds: 42 });
    expect(part.storage_path).toMatch(new RegExp(`^c1/${P1}/${S1}/[0-9a-f-]{36}\\.m4a$`));
    expect(mockUpload).toHaveBeenCalledWith(part.storage_path, expect.any(ArrayBuffer), { contentType: 'audio/mp4', upsert: false });
  });

  it('refuses a part over 25 MB before sending anything, and says when the file could not be read', async () => {
    fetchSpy.mockResolvedValueOnce({ arrayBuffer: async () => new ArrayBuffer(25 * 1024 * 1024 + 1) } as unknown as Response);
    let err = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'photo', uri: 'file:///big.jpg' }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('This photo is larger than 25 MB. Please choose a smaller one.');
    expect(mockUpload).toHaveBeenCalledTimes(1);
    fetchSpy.mockRejectedValueOnce(new Error('ENOENT'));
    err = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'photo', uri: 'file:///gone.jpg' }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't read that photo from your device. Please choose it again.");
  });

  describe("the bucket's type rule (image/png, jpeg, webp, heic, heif; audio/mp4, x-m4a, mpeg, aac, webm, wav, x-wav, ogg, 3gpp, x-caf)", () => {
    const sized = (n: number, type?: string) => ({ arrayBuffer: async () => new ArrayBuffer(n), headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? (type ?? null) : null) } }) as unknown as Response;

    it('refuses a GIF or an AVIF photo before reading the file, in plain words', async () => {
      const reads = fetchSpy.mock.calls.length;
      const uploads = mockUpload.mock.calls.length;
      let err = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'photo', uri: 'file:///a.gif', mimeType: 'image/gif', fileName: 'a.gif' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).userMessage).toBe('Choose a JPEG, PNG, WebP or HEIC photo.');
      err = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'photo', uri: 'file:///a.avif', mimeType: 'image/avif', fileName: 'a.avif' }).catch((e: unknown) => e);
      expect((err as AppError).userMessage).toBe('Choose a JPEG, PNG, WebP or HEIC photo.');
      expect(fetchSpy.mock.calls.length).toBe(reads);
      expect(mockUpload.mock.calls.length).toBe(uploads);
    });

    it('makes the draft only after the checks that need no network (a refused part leaves no empty draft)', async () => {
      const makeDraft = jest.fn<() => Promise<string>>().mockResolvedValue(S1);
      let err = await uploadPart({ centerId: 'c1', personId: P1, submissionId: makeDraft, kind: 'photo', uri: 'file:///a.gif', mimeType: 'image/gif' }).catch((e: unknown) => e);
      expect((err as AppError).userMessage).toBe('Choose a JPEG, PNG, WebP or HEIC photo.');
      fetchSpy.mockResolvedValueOnce(sized(0));
      err = await uploadPart({ centerId: 'c1', personId: P1, submissionId: makeDraft, kind: 'photo', uri: 'file:///a.jpg' }).catch((e: unknown) => e);
      expect((err as AppError).userMessage).toBe('That file was empty. Please choose another.');
      expect(makeDraft).not.toHaveBeenCalled();
      fetchSpy.mockResolvedValueOnce(sized(4));
      mockUpload.mockResolvedValueOnce({ error: null });
      const part = await uploadPart({ centerId: 'c1', personId: P1, submissionId: makeDraft, kind: 'photo', uri: 'file:///a.jpg' });
      expect(makeDraft).toHaveBeenCalledTimes(1);
      expect(part.storage_path.startsWith(`c1/${P1}/${S1}/`)).toBe(true);
    });

    it('sends image/jpg as image/jpeg and audio/m4a as audio/mp4', async () => {
      fetchSpy.mockResolvedValueOnce(sized(5));
      mockUpload.mockResolvedValueOnce({ error: null });
      const photo = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'photo', uri: 'file:///a', mimeType: 'image/jpg', fileName: 'holiday.JPG' });
      expect(photo.mime_type).toBe('image/jpeg');
      expect(photo.storage_path).toMatch(/\.JPG$|\.jpg$/i);
      fetchSpy.mockResolvedValueOnce(sized(5));
      mockUpload.mockResolvedValueOnce({ error: null });
      const voice = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'voice', uri: 'file:///rec', mimeType: 'audio/m4a' });
      expect(voice.mime_type).toBe('audio/mp4');
      expect(voice.storage_path).toMatch(/\.m4a$/);
      expect(mockUpload).toHaveBeenLastCalledWith(voice.storage_path, expect.any(ArrayBuffer), { contentType: 'audio/mp4', upsert: false });
    });

    it('takes the type of a recording made in a browser from the fetched file (WebM), and names it that way', async () => {
      fetchSpy.mockResolvedValueOnce(sized(9, 'audio/webm;codecs=opus'));
      mockUpload.mockResolvedValueOnce({ error: null });
      const part = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'voice', uri: 'blob:http://localhost:8099/6f1c2d3e-0000-4000-8000-000000000000', durationSeconds: 3 });
      expect(part).toMatchObject({ kind: 'voice', mime_type: 'audio/webm', bytes: 9 });
      expect(part.storage_path).toMatch(new RegExp(`^c1/${P1}/${S1}/[0-9a-f-]{36}\.webm$`));
      expect(mockUpload).toHaveBeenLastCalledWith(part.storage_path, expect.any(ArrayBuffer), { contentType: 'audio/webm', upsert: false });
    });

    it('refuses a recording of a kind the bucket does not take, after the file said what it is', async () => {
      fetchSpy.mockResolvedValueOnce(sized(9, 'audio/flac'));
      const uploads = mockUpload.mock.calls.length;
      const err = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'voice', uri: 'blob:http://localhost:8099/x' }).catch((e: unknown) => e);
      expect((err as AppError).userMessage).toBe("That kind of recording can't be used for homework. Please record it again.");
      expect(mockUpload.mock.calls.length).toBe(uploads);
    });
  });

  describe("the bucket's own refusals", () => {
    const failWith = async (error: { message: string; statusCode?: string; status?: number; code?: string }) => {
      fetchSpy.mockResolvedValueOnce({ arrayBuffer: async () => new ArrayBuffer(3) } as unknown as Response);
      mockUpload.mockResolvedValueOnce({ error });
      return ((await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'photo', uri: 'file:///a.jpg' }).catch((e: unknown) => e)) as AppError).userMessage;
    };

    it('says what a 415 (type), a 413 (size) and a 403 (the answer moved on) mean', async () => {
      expect(await failWith({ message: 'mime type image/gif is not supported', statusCode: '415' })).toBe("That kind of file can't be used for homework.");
      expect(await failWith({ message: 'invalid_mime_type', status: 400, statusCode: '415' })).toBe("That kind of file can't be used for homework.");
      expect(await failWith({ message: 'The object exceeded the maximum allowed size', statusCode: '413' })).toBe('That file is over 25 MB.');
      expect(await failWith({ message: 'Payload too large', status: 413 })).toBe('That file is over 25 MB.');
      expect(await failWith({ message: 'new row violates row-level security policy', status: 400, statusCode: '403' })).toBe("This answer can't be changed any more — reload to see where it is.");
      expect(await failWith({ message: 'Unauthorized', code: 'AccessDenied' })).toBe("This answer can't be changed any more — reload to see where it is.");
    });

    it('still says "not set up" for a missing bucket, and the connection for anything else', async () => {
      expect(await failWith({ message: 'Bucket not found', statusCode: '404' })).toMatch(/aren't set up for your community yet/);
      expect(await failWith({ message: 'fetch failed' })).toBe("We couldn't upload this part. Please check your connection and try again.");
    });
  });

  it('says when the bucket is not set up, or the upload failed', async () => {
    fetchSpy.mockResolvedValueOnce({ arrayBuffer: async () => new ArrayBuffer(3) } as unknown as Response);
    mockUpload.mockResolvedValueOnce({ error: { message: 'Bucket not found', statusCode: '404' } });
    let err = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'photo', uri: 'file:///a.jpg' }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toMatch(/aren't set up for your community yet/);
    fetchSpy.mockResolvedValueOnce({ arrayBuffer: async () => new ArrayBuffer(3) } as unknown as Response);
    mockUpload.mockResolvedValueOnce({ error: { message: 'boom' } });
    err = await uploadPart({ centerId: 'c1', personId: P1, submissionId: S1, kind: 'photo', uri: 'file:///a.jpg' }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't upload this part. Please check your connection and try again.");
  });
});
