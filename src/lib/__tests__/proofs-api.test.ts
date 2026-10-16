import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AppError } from '../errors';
import {
  answerProofQuestion,
  loadProofPolicy,
  myPaymentProofs,
  newProofAttempt,
  pledgeEvidence,
  proofFileUrls,
  proofReceipts,
  ProofFileRefused,
  removeProofUpload,
  submitPaymentProof,
  uploadProofFile,
  withdrawPaymentProof,
  type PickedProofFile,
  type SubmitProofArgs,
} from '../api/proofs';
import { DEFAULT_POLICY } from '../proofs';

type Result = { data: unknown; error: unknown };
const mockRpc = jest.fn<(name: string, args: Record<string, unknown>) => Promise<Result>>();
const mockUpload = jest.fn<(path: string, body: ArrayBuffer, opts: unknown) => Promise<{ error: { message: string; statusCode?: string } | null }>>();
const mockRemove = jest.fn<(paths: string[]) => Promise<{ error: { message: string } | null }>>();
const mockSigned = jest.fn<(keys: string[], seconds: number) => Promise<{ data: { path: string; signedUrl: string; error: string | null }[] | null; error: { message: string } | null }>>();
const mockBucket = jest.fn<(bucket: string) => void>();
const mockIn = jest.fn<(col: string, ids: string[]) => Promise<Result>>();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
    from: () => ({ select: () => ({ in: (col: string, ids: string[]) => mockIn(col, ids) }) }),
    storage: {
      from: (bucket: string) => {
        mockBucket(bucket);
        return {
          upload: (path: string, body: ArrayBuffer, opts: unknown) => mockUpload(path, body, opts),
          remove: (paths: string[]) => mockRemove(paths),
          createSignedUrls: (keys: string[], seconds: number) => mockSigned(keys, seconds),
        };
      },
    },
  },
}));

const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const H = 'hhhhhhhh-hhhh-4hhh-8hhh-hhhhhhhhhhhh'.replace(/h/g, 'a');
const PL = '11111111-1111-4111-8111-111111111111';

const proofRow = (over: Record<string, unknown> = {}) => ({
  id: 'pr1',
  household_id: H,
  status: 'submitted',
  entry: 'open_pledges',
  method: 'check',
  amount_cents: 25000,
  paid_on: '2026-10-12',
  reference: '1048',
  created_at: '2026-10-12T14:14:00Z',
  covered: [{ pledge_id: PL, pledge_number: 'P-0587', title: 'Harvest supper', amount_cents: 16000, pledge_amount_cents: 16000, state: 'active' }],
  files: [],
  events: [],
  ...over,
});

const file = (id: string, over: Partial<PickedProofFile> = {}): PickedProofFile => ({ id, uri: `file:///photos/${id}.jpg`, fileName: `${id}.jpg`, mimeType: 'image/jpeg', bytes: 1400000, ...over });

const baseArgs = (over: Partial<SubmitProofArgs> = {}): SubmitProofArgs => ({
  attempt: newProofAttempt(),
  centerId: C,
  householdId: H,
  method: 'check',
  amountCents: 25000,
  paidOn: '2026-10-12',
  reference: '1048',
  pledgeIds: null,
  entry: 'open_pledges',
  files: [file('a')],
  ...over,
});

const body = (n: number, type = 'image/jpeg') => ({ arrayBuffer: async () => new ArrayBuffer(n), headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? type : null) } }) as unknown as Response;

let fetchSpy: jest.SpiedFunction<typeof fetch>;
let logSpy: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  mockRpc.mockReset();
  mockUpload.mockReset();
  mockRemove.mockReset();
  mockSigned.mockReset();
  mockBucket.mockReset();
  mockIn.mockReset();
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => body(2048));
  logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  fetchSpy.mockRestore();
  logSpy.mockRestore();
});

describe('one try at sending a proof', () => {
  it('has a proof folder id (a uuid) and a confirmation key of 8 to 120 characters, new each time', () => {
    const a = newProofAttempt();
    const b = newProofAttempt();
    expect(a.proofId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.key.length).toBeGreaterThanOrEqual(8);
    expect(a.key.length).toBeLessThanOrEqual(120);
    expect(a.key).not.toBe(b.key);
    expect(a.proofId).not.toBe(b.proofId);
  });
});

describe('uploading a photo', () => {
  it('puts it in the payment-evidence bucket at <center>/<household>/<proof>/<random>.<ext> and describes it for the database', async () => {
    mockUpload.mockResolvedValueOnce({ error: null });
    const up = await uploadProofFile({ centerId: C, householdId: H, proofId: 'p1', file: file('a') });
    expect(mockBucket).toHaveBeenCalledWith('payment-evidence');
    expect(up.path).toMatch(new RegExp(`^${C}/${H}/p1/[0-9a-f-]{36}\\.jpg$`));
    expect(up).toMatchObject({ content_type: 'image/jpeg', bytes: 2048 });
    expect(mockUpload).toHaveBeenCalledWith(up.path, expect.any(ArrayBuffer), { contentType: 'image/jpeg', upsert: false });
  });
  it('refuses a type the bucket does not take before reading the file, in plain words', async () => {
    const err = await uploadProofFile({ centerId: C, householdId: H, proofId: 'p1', file: file('a', { mimeType: 'image/gif', fileName: 'a.gif' }) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProofFileRefused);
    expect((err as AppError).userMessage).toBe('Choose a JPEG, PNG, WebP or HEIC photo, or a PDF.');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });
  it('refuses a file over 10 MB, known from the picker or found when read', async () => {
    let err = await uploadProofFile({ centerId: C, householdId: H, proofId: 'p1', file: file('a', { bytes: 11 * 1024 * 1024 }) }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('That file is over 10 MB. Please choose a smaller one.');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockResolvedValueOnce(body(10 * 1024 * 1024 + 1));
    err = await uploadProofFile({ centerId: C, householdId: H, proofId: 'p1', file: file('a', { bytes: null }) }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('That file is over 10 MB. Please choose a smaller one.');
    expect(mockUpload).not.toHaveBeenCalled();
  });
  it('says when a file cannot be read, and when it is empty', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ENOENT'));
    let err = await uploadProofFile({ centerId: C, householdId: H, proofId: 'p1', file: file('a') }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe("We couldn't read that file. Please choose it again.");
    fetchSpy.mockResolvedValueOnce(body(0));
    err = await uploadProofFile({ centerId: C, householdId: H, proofId: 'p1', file: file('a', { bytes: null }) }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('That file is empty. Please choose another.');
  });
  it('turns the bucket\'s refusals into plain words: a type it does not take cannot be retried, a dropped connection can', async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: 'mime type image/heic is not supported', statusCode: '415' } });
    let err = await uploadProofFile({ centerId: C, householdId: H, proofId: 'p1', file: file('a') }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProofFileRefused);
    mockUpload.mockResolvedValueOnce({ error: { message: 'Network request failed' } });
    err = await uploadProofFile({ centerId: C, householdId: H, proofId: 'p1', file: file('a') }).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ProofFileRefused);
    expect((err as AppError).userMessage).toBe("We couldn't upload a file. Check your connection and try again.");
    expect(logSpy).toHaveBeenCalled();
  });
  it('takes an upload out again, and only logs when that fails', async () => {
    mockRemove.mockResolvedValueOnce({ error: null });
    await removeProofUpload('c/h/p/a.jpg');
    expect(mockRemove).toHaveBeenCalledWith(['c/h/p/a.jpg']);
    mockRemove.mockResolvedValueOnce({ error: { message: 'denied' } });
    await expect(removeProofUpload('c/h/p/b.jpg')).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
  });
});

describe('sending a proof (app.submit_payment_proof)', () => {
  it('uploads the files first, then makes the claim in one call, with the confirmation key and the folder of the files', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValueOnce({ data: { proof: proofRow(), replayed: false, lookalikes: [] }, error: null });
    const args = baseArgs({ files: [file('a'), file('b')], pledgeIds: [PL], note: '  ' });
    const res = await submitPaymentProof(args);
    expect(mockUpload).toHaveBeenCalledTimes(2);
    const [name, sent] = mockRpc.mock.calls[0];
    expect(name).toBe('submit_payment_proof');
    expect(sent).toMatchObject({
      p_center: C,
      p_household: H,
      p_method: 'check',
      p_amount_cents: 25000,
      p_paid_on: '2026-10-12',
      p_reference: '1048',
      p_pledge_ids: [PL],
      p_entry: 'open_pledges',
      p_key: args.attempt.key,
    });
    const files = sent.p_files as { path: string; content_type: string; bytes: number }[];
    expect(files).toHaveLength(2);
    for (const f of files) expect(f.path.startsWith(`${C}/${H}/${args.attempt.proofId}/`)).toBe(true);
    expect(res.proof.id).toBe('pr1');
    expect(res.replayed).toBe(false);
  });
  it('sends "all of the family\'s open pledges" as no list, never as an empty one, and an RSVP\'s pledge with the entry', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ data: { proof: proofRow({ entry: 'rsvp' }), replayed: false }, error: null });
    await submitPaymentProof(baseArgs({ pledgeIds: null, files: [] }));
    expect(mockRpc.mock.calls[0][1].p_pledge_ids).toBeUndefined();
    await submitPaymentProof(baseArgs({ entry: 'rsvp', entryRef: 'rsvp-1', pledgeIds: [PL], files: [] }));
    expect(mockRpc.mock.calls[1][1]).toMatchObject({ p_entry: 'rsvp', p_entry_ref: 'rsvp-1', p_pledge_ids: [PL], p_files: [] });
    await expect(submitPaymentProof(baseArgs({ pledgeIds: [], files: [] }))).rejects.toBeInstanceOf(AppError);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });
  it('is never "sent" when the database refuses: the reason is in plain words, with the action in front', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'You have no open pledge that this can cover.' } });
    const err = await submitPaymentProof(baseArgs()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe('Could not send your proof — You have no open pledge that this can cover.');
    expect(logSpy).toHaveBeenCalled();
  });
  it('says an adult must send it for a child, a missing function as "not available yet", and a lost connection as such', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Only an adult of the family can send a payment proof. Ask a parent to send it.' } });
    let err = await submitPaymentProof(baseArgs({ files: [] })).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Could not send your proof — Only an adult of the family can send a payment proof. Ask a parent to send it.');
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function app.submit_payment_proof in the schema cache' } });
    err = await submitPaymentProof(baseArgs({ files: [] })).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Could not send your proof — this is not available yet. Nothing was changed.');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    err = await submitPaymentProof(baseArgs({ files: [] })).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't send your proof. Check your internet connection and try again.");
  });
  it('does not say "sent" for an answer that is not a proof', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const err = await submitPaymentProof(baseArgs({ files: [] })).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't confirm that your proof was sent. Look under My payment proofs before you send it again.");
  });
  it('a retry reuses the same folder and key and uploads only the files that did not go up, so it never sends two proofs', async () => {
    mockUpload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'Network request failed' } });
    const args = baseArgs({ files: [file('a'), file('b')] });
    const first = await submitPaymentProof(args).catch((e: unknown) => e);
    expect((first as AppError).userMessage).toBe("We couldn't upload a file. Check your connection and try again.");
    expect(mockRpc).not.toHaveBeenCalled();
    mockUpload.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: { proof: proofRow(), replayed: false }, error: null });
    await submitPaymentProof(args);
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const paths = (mockRpc.mock.calls[0][1].p_files as { path: string }[]).map((f) => f.path);
    expect(new Set(paths).size).toBe(2);
    // The answer was lost and the member taps again: the same key is sent, and the database says it was a replay.
    mockRpc.mockResolvedValueOnce({ data: { proof: proofRow(), replayed: true }, error: null });
    const again = await submitPaymentProof(args);
    expect(again.replayed).toBe(true);
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(mockRpc.mock.calls[1][1].p_key).toBe(mockRpc.mock.calls[0][1].p_key);
  });
  it('refuses a whole-dollar mistake before sending anything: the amount is whole cents, up to five files', async () => {
    await expect(submitPaymentProof(baseArgs({ amountCents: 12.5 }))).rejects.toBeInstanceOf(AppError);
    await expect(submitPaymentProof(baseArgs({ amountCents: 0 }))).rejects.toBeInstanceOf(AppError);
    await expect(submitPaymentProof(baseArgs({ files: ['a', 'b', 'c', 'd', 'e', 'f'].map((i) => file(i)) }))).rejects.toThrow();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('the family\'s proofs', () => {
  it('asks for them by community and household and reads the list', async () => {
    mockRpc.mockResolvedValueOnce({ data: [proofRow(), proofRow({ id: 'pr2', status: 'approved' })], error: null });
    const list = await myPaymentProofs(C, H);
    expect(mockRpc).toHaveBeenCalledWith('my_payment_proofs', { p_center: C, p_household: H });
    expect(list.map((p) => p.id)).toEqual(['pr1', 'pr2']);
  });
  it('leaves out a proof it cannot read, logs it, and fails in plain words for an answer that is not a list', async () => {
    mockRpc.mockResolvedValueOnce({ data: [proofRow(), { junk: 1 }], error: null });
    expect(await myPaymentProofs(C, H)).toHaveLength(1);
    expect(logSpy).toHaveBeenCalled();
    mockRpc.mockResolvedValueOnce({ data: { not: 'a list' }, error: null });
    const err = await myPaymentProofs(C, H).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't load your payment proofs — the answer was not what we expected. Please try again.");
  });
  it('says a child must ask a parent, in the database\'s own words', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Only an adult of the family can see its payment proofs.' } });
    const err = await myPaymentProofs(C, H).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Could not load your payment proofs — Only an adult of the family can see its payment proofs.');
  });
  it('takes a waiting proof back and returns it as the database now has it', async () => {
    mockRpc.mockResolvedValueOnce({ data: proofRow({ status: 'withdrawn' }), error: null });
    const p = await withdrawPaymentProof('pr1');
    expect(mockRpc).toHaveBeenCalledWith('withdraw_payment_proof', { p_proof: 'pr1' });
    expect(p.status).toBe('withdrawn');
  });
  it('says so when it was already checked, so it cannot be taken back', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'This proof was already checked, so it cannot be taken back.' } });
    const err = await withdrawPaymentProof('pr1').catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Could not take your proof back — This proof was already checked, so it cannot be taken back.');
  });
  it('looks up the receipt numbers of the payments proofs became, and shows the proofs without them when that fails', async () => {
    mockIn.mockResolvedValueOnce({ data: [{ id: 'pay1', receipt_number: 'R-2026-0412' }, { id: 'pay2', receipt_number: null }], error: null });
    expect(await proofReceipts(['pay1', 'pay2', 'pay1'])).toEqual(new Map([['pay1', 'R-2026-0412']]));
    expect(mockIn).toHaveBeenCalledWith('id', ['pay1', 'pay2']);
    mockIn.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect((await proofReceipts(['pay1'])).size).toBe(0);
    expect(logSpy).toHaveBeenCalled();
    expect((await proofReceipts([])).size).toBe(0);
    expect(mockIn).toHaveBeenCalledTimes(2);
  });
});

describe('answering the treasury team (app.answer_proof_question)', () => {
  it('puts the new photos in the proof\'s own folder and sends them with the message', async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValueOnce({ data: proofRow({ status: 'submitted' }), error: null });
    const attempt = newProofAttempt();
    const proof = await answerProofQuestion({ proof: { id: 'pr1', householdId: H }, centerId: C, message: '  Here is a clearer photo.  ', files: [file('a')], attempt });
    const [name, sent] = mockRpc.mock.calls[0];
    expect(name).toBe('answer_proof_question');
    expect(sent.p_proof).toBe('pr1');
    expect(sent.p_message).toBe('Here is a clearer photo.');
    const files = sent.p_files as { path: string }[];
    expect(files[0].path.startsWith(`${C}/${H}/pr1/`)).toBe(true);
    expect(proof.status).toBe('submitted');
  });
  it('is not "sent" when the database refuses', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'The treasury team is not waiting for an answer on this proof.' } });
    const err = await answerProofQuestion({ proof: { id: 'pr1', householdId: H }, centerId: C, message: 'x', files: [], attempt: newProofAttempt() }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Could not send your reply — The treasury team is not waiting for an answer on this proof.');
  });
});

describe('what a pledge keeps (app.pledge_evidence)', () => {
  const row = { kind: 'proof', proof_id: 'pr1', state: 'waiting', covered_cents: 16000, sent_on: '2026-10-12T14:14:00Z', kept_until: '2033-12-31', files: [] };
  it('asks for one pledge and reads what it keeps', async () => {
    mockRpc.mockResolvedValueOnce({ data: [row], error: null });
    const items = await pledgeEvidence(PL);
    expect(mockRpc).toHaveBeenCalledWith('pledge_evidence', { p_pledge: PL });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'proof', coveredCents: 16000, keptUntil: '2033-12-31' });
  });
  it('has nothing to show on a portal without the function, logged and not an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function app.pledge_evidence(p_pledge) in the schema cache' } });
    expect(await pledgeEvidence(PL)).toEqual([]);
  });
  it('says "You don\'t have access to this area" in the database\'s words for someone who may not see it', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: "You don't have access to this area." } });
    const err = await pledgeEvidence(PL).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("Could not load your proof — You don't have access to this area.");
  });
});

describe('the community\'s proof rules (app.proof_policy)', () => {
  it('reads them', async () => {
    mockRpc.mockResolvedValueOnce({ data: { required_methods: ['check'], retention_years: 9, legal_hold: true, reply_wait_days: 21, honour_event_entry: false }, error: null });
    expect(await loadProofPolicy(C)).toEqual({ requiredMethods: ['check'], retentionYears: 9, legalHold: true, replyWaitDays: 21, honourEventEntry: false });
    expect(mockRpc).toHaveBeenCalledWith('proof_policy', { p_center: C });
  });
  it('is null on a portal without the function (proofs are hidden) and an error in plain words for anything else', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function app.proof_policy(uuid) does not exist' } });
    expect(await loadProofPolicy(C)).toBeNull();
    mockRpc.mockResolvedValueOnce({ data: 'nonsense', error: null });
    const err = await loadProofPolicy(C).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't load the payment proof rules — the answer was not what we expected. Please try again.");
    expect(DEFAULT_POLICY.requiredMethods).toContain('check');
  });
});

describe('opening the files (private links)', () => {
  it('signs paths in the payment-evidence bucket', async () => {
    mockSigned.mockResolvedValueOnce({ data: [{ path: 'c/h/p/a.jpg', signedUrl: 'https://signed/a', error: null }], error: null });
    const urls = await proofFileUrls(['c/h/p/a.jpg']);
    expect(mockBucket).toHaveBeenCalledWith('payment-evidence');
    expect(urls.get('c/h/p/a.jpg')).toBe('https://signed/a');
  });
  it('asks for nothing when there are no files, and fails in plain words when signing fails', async () => {
    expect((await proofFileUrls([])).size).toBe(0);
    expect(mockSigned).not.toHaveBeenCalled();
    mockSigned.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } });
    const err = await proofFileUrls(['c/h/p/a.jpg']).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't open your proof. Check your internet connection and try again.");
  });
});
