import { describe, expect, it } from '@jest/globals';

import { parseMemberMethods } from '../../features/pay/methods';
import {
  acceptedProofMethods,
  canWithdraw,
  DEFAULT_POLICY,
  formatFileSize,
  newestProofFirst,
  openableFiles,
  parseEvidence,
  parsePolicy,
  parseProof,
  parseProofs,
  parseSubmitted,
  pledgesWithProofAttached,
  pledgeTimeline,
  proofFileProblem,
  proofFileType,
  proofLook,
  proofNeeded,
  proofStoragePath,
  referenceLabelKey,
  removedFiles,
  validateProofFiles,
  validateProofForm,
  waitingProofs,
  type ProofContext,
} from '../proofs';

const ctx: ProofContext = { today: '2026-10-15', methods: ['check', 'cash', 'ach'], lockedCents: null, coverableCents: 56000 };
const input = { method: 'check', amount: '250', date: '10/12/2026', reference: '1048' };

describe('which ways of paying a proof can be sent for', () => {
  const answer = (methods: unknown[]) => parseMemberMethods({ environment: 'production', methods });
  it('takes the offline methods the community lists, in its order, once each, and never Zelle or card', () => {
    const list = answer([
      { key: 'card', family: 'provider_checkout', provider: 'stripe', mode: 'live', sort: 10 },
      { key: 'zelle', family: 'reported_transfer', instructions: {}, report: { available: true }, sort: 20 },
      { key: 'check', family: 'instructions', method: 'check', instructions: {}, sort: 30 },
      { key: 'cash', family: 'instructions', method: 'cash', instructions: {}, sort: 40 },
      { key: 'check2', family: 'instructions', method: 'check', instructions: {}, sort: 50 },
      { key: 'daf', family: 'instructions', method: 'daf', instructions: {}, sort: 60 },
    ]);
    expect(acceptedProofMethods(list)).toEqual(['check', 'cash', 'daf']);
  });
  it('is empty when the community takes none, or when nothing is known', () => {
    expect(acceptedProofMethods(answer([{ key: 'card', family: 'provider_checkout', provider: 'stripe', mode: 'live', sort: 1 }]))).toEqual([]);
    expect(acceptedProofMethods(null)).toEqual([]);
  });
  it('names the reference field for each way of paying', () => {
    expect(referenceLabelKey('check')).toBe('proof.ref.check');
    expect(referenceLabelKey('stock')).toBe('proof.ref.stock');
    expect(referenceLabelKey('something_new')).toBe('proof.ref.other');
    expect(referenceLabelKey(null)).toBe('proof.ref.other');
  });
});

describe("the community's proof rules (app.proof_policy)", () => {
  it('reads the database default', () => {
    expect(parsePolicy({ required_methods: ['check', 'ach', 'stock', 'daf', 'matching_gift', 'other'], retention_years: 7, legal_hold: false, second_approver_over_cents: 0, reply_wait_days: 14, honour_event_entry: true, release_store_orders: false })).toEqual(DEFAULT_POLICY);
  });
  it('keeps the default for a field the answer lacks, and refuses an answer that is not an object', () => {
    expect(parsePolicy({ reply_wait_days: 30 })).toEqual({ ...DEFAULT_POLICY, replyWaitDays: 30 });
    expect(parsePolicy(null)).toBeNull();
    expect(parsePolicy([])).toBeNull();
  });
  it('needs a photo for the methods in required_methods only', () => {
    expect(proofNeeded(DEFAULT_POLICY, 'check')).toBe(true);
    expect(proofNeeded(DEFAULT_POLICY, 'cash')).toBe(false);
    expect(proofNeeded({ ...DEFAULT_POLICY, requiredMethods: ['cash'] }, 'cash')).toBe(true);
    expect(proofNeeded(DEFAULT_POLICY, null)).toBe(false);
  });
});

describe('the first step of the sheet', () => {
  it('turns what was typed into whole cents, an ISO date and a trimmed reference', () => {
    expect(validateProofForm(input, ctx)).toEqual({ ok: true, value: { method: 'check', amountCents: 25000, paidOn: '2026-10-12', reference: '1048' } });
    expect(validateProofForm({ ...input, amount: '$1,250.50', reference: '  ' }, ctx)).toMatchObject({ ok: true, value: { amountCents: 125050, reference: null } });
  });
  it('locks the amount to the checkout and ignores what was typed', () => {
    expect(validateProofForm({ ...input, amount: 'nonsense' }, { ...ctx, lockedCents: 16000 })).toMatchObject({ ok: true, value: { amountCents: 16000 } });
  });
  it('reports every problem at once, with the same reasons as the database', () => {
    const r = validateProofForm({ method: null, amount: '', date: '', reference: 'x'.repeat(81) }, ctx);
    expect(r).toEqual({ ok: false, problems: { method: 'method_required', amount: 'amount_required', date: 'date_required', reference: 'reference_long' } });
  });
  it('refuses a method the community does not take', () => {
    expect(validateProofForm({ ...input, method: 'stock' }, ctx)).toMatchObject({ ok: false, problems: { method: 'method_required' } });
  });
  it('refuses a date in the future, one over a year old, and one that is not a date', () => {
    expect(validateProofForm({ ...input, date: '10/16/2026' }, ctx)).toMatchObject({ ok: false, problems: { date: 'date_future' } });
    expect(validateProofForm({ ...input, date: '09/01/2025' }, ctx)).toMatchObject({ ok: false, problems: { date: 'date_old' } });
    expect(validateProofForm({ ...input, date: '02/31/2026' }, ctx)).toMatchObject({ ok: false, problems: { date: 'date_invalid' } });
    expect(validateProofForm({ ...input, date: '10/15/2026' }, ctx).ok).toBe(true);
    expect(validateProofForm({ ...input, date: '09/11/2025' }, ctx).ok).toBe(true);
  });
  it('refuses amounts the database refuses', () => {
    expect(validateProofForm({ ...input, amount: '0' }, ctx)).toMatchObject({ problems: { amount: 'amount_too_small' } });
    expect(validateProofForm({ ...input, amount: '1000000.01' }, ctx)).toMatchObject({ problems: { amount: 'amount_too_large' } });
    expect(validateProofForm({ ...input, amount: '12.345' }, ctx)).toMatchObject({ problems: { amount: 'amount_invalid' } });
  });
  it('says there is nothing for a proof to cover when no pledge has anything left to pay', () => {
    expect(validateProofForm(input, { ...ctx, coverableCents: 0 })).toMatchObject({ ok: false, problems: { pledges: 'no_pledge' } });
  });
});

describe('the second step: files', () => {
  it('needs a file for a method the community requires one for, and at most five files', () => {
    expect(validateProofFiles(0, 'check', DEFAULT_POLICY)).toBe('files_required');
    expect(validateProofFiles(0, 'cash', DEFAULT_POLICY)).toBeNull();
    expect(validateProofFiles(1, 'check', DEFAULT_POLICY)).toBeNull();
    expect(validateProofFiles(5, 'check', DEFAULT_POLICY)).toBeNull();
    expect(validateProofFiles(6, 'check', DEFAULT_POLICY)).toBe('files_too_many');
  });
  it('knows the types the bucket takes, from the picker, the name or the fetched file', () => {
    expect(proofFileType({ mimeType: 'image/jpeg' })).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
    expect(proofFileType({ mimeType: 'image/jpg' })).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
    expect(proofFileType({ fileName: 'IMG_1.HEIC' })).toEqual({ ext: 'heic', contentType: 'image/heic' });
    expect(proofFileType({ uri: 'file:///x/receipt.pdf?x=1' })).toEqual({ ext: 'pdf', contentType: 'application/pdf' });
    expect(proofFileType({ uri: 'file:///x/photo', reported: 'image/png' })).toEqual({ ext: 'png', contentType: 'image/png' });
    expect(proofFileType({ uri: 'file:///x/photo' })).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
  });
  it('turns away a type the bucket does not take, even when the name says otherwise', () => {
    expect(proofFileType({ mimeType: 'image/gif', fileName: 'a.gif' })).toBeNull();
    expect(proofFileType({ mimeType: 'image/gif', fileName: 'a.jpg' })).toBeNull();
    expect(proofFileType({ mimeType: 'video/mp4', fileName: 'a.mp4' })).toBeNull();
    expect(proofFileType({ fileName: 'old.doc', mimeType: 'application/msword' })).toBeNull();
  });
  it('limits a file to 10 MB and refuses an empty one', () => {
    expect(proofFileProblem({ contentType: 'image/jpeg', bytes: 10 * 1024 * 1024 })).toBeNull();
    expect(proofFileProblem({ contentType: 'image/jpeg', bytes: 10 * 1024 * 1024 + 1 })).toBe('size');
    expect(proofFileProblem({ contentType: 'image/jpeg', bytes: 0 })).toBe('empty');
    expect(proofFileProblem({ contentType: 'image/jpeg', bytes: null })).toBeNull();
    expect(proofFileProblem({ contentType: 'image/gif', bytes: 10 })).toBe('type');
  });
  it('puts a file at <center>/<household>/<proof>/<id>.<ext>, where the bucket rules read the household and proof', () => {
    expect(proofStoragePath({ centerId: 'c', householdId: 'h', proofId: 'p', id: 'f', ext: 'jpg' })).toBe('c/h/p/f.jpg');
  });
  it('writes sizes the way a family reads them', () => {
    expect(formatFileSize(1_468_006)).toBe('1.4 MB');
    expect(formatFileSize(820 * 1024)).toBe('820 KB');
    expect(formatFileSize(0)).toBe('');
    expect(formatFileSize(null)).toBe('');
  });
});

const proofRow = (over: Record<string, unknown> = {}) => ({
  id: 'pr1',
  household_id: 'h1',
  status: 'submitted',
  entry: 'open_pledges',
  method: 'check',
  amount_cents: 25000,
  paid_on: '2026-10-12',
  reference: '1048',
  created_at: '2026-10-12T14:14:00Z',
  excess_cents: 0,
  is_test: false,
  covered: [
    { pledge_id: 'pl1', pledge_number: 'P-0587', title: 'Harvest supper', amount_cents: 16000, pledge_amount_cents: 16000, state: 'active' },
    { pledge_id: 'pl2', pledge_number: 'P-0601', title: 'Building fund', amount_cents: 9000, pledge_amount_cents: 30000, state: 'active' },
  ],
  files: [{ id: 'f1', storage_path: 'c/h1/pr1/a.jpg', content_type: 'image/jpeg', bytes: 1400000, removed: false, created_at: '2026-10-12T14:14:00Z' }],
  events: [{ kind: 'submitted', body: 'Sent by Adaeze.', created_at: '2026-10-12T14:14:00Z' }],
  ...over,
});

describe('reading a proof (app._proof_json)', () => {
  it('reads every field, with whole cents and the pledges it covers in order', () => {
    const p = parseProof(proofRow());
    expect(p).toMatchObject({ id: 'pr1', status: 'submitted', method: 'check', amountCents: 25000, paidOn: '2026-10-12', reference: '1048', excessCents: 0, isTest: false });
    expect(p?.covered.map((c) => [c.pledgeNumber, c.amountCents, c.pledgeAmountCents])).toEqual([['P-0587', 16000, 16000], ['P-0601', 9000, 30000]]);
    expect(p?.files).toEqual([{ id: 'f1', path: 'c/h1/pr1/a.jpg', contentType: 'image/jpeg', bytes: 1400000, removed: false, createdAt: '2026-10-12T14:14:00Z' }]);
    expect(p?.events[0]).toEqual({ kind: 'submitted', body: 'Sent by Adaeze.', createdAt: '2026-10-12T14:14:00Z' });
  });
  it('refuses a row with no id, a fractional or missing amount, no date, or a status this build does not know', () => {
    expect(parseProof(proofRow({ id: null }))).toBeNull();
    expect(parseProof(proofRow({ amount_cents: 12.5 }))).toBeNull();
    expect(parseProof(proofRow({ amount_cents: undefined }))).toBeNull();
    expect(parseProof(proofRow({ paid_on: 'soon' }))).toBeNull();
    expect(parseProof(proofRow({ status: 'teleported' }))).toBeNull();
    expect(parseProof('x')).toBeNull();
  });
  it('lists proofs and counts the ones it could not read', () => {
    expect(parseProofs([proofRow(), { nope: true }, proofRow({ id: 'pr2', status: 'approved' })])).toEqual({ proofs: [expect.objectContaining({ id: 'pr1' }), expect.objectContaining({ id: 'pr2' })], skipped: 1 });
    expect(parseProofs({})).toBeNull();
  });
  it('reads the answer to a send: the proof, whether it was a replay, and what it looks like on file', () => {
    const r = parseSubmitted({ proof: proofRow(), replayed: true, lookalikes: [{ kind: 'payment', id: 'x', label: 'Receipt R-1, check, Oct 12', certain: true }, { bad: 1 }] });
    expect(r?.replayed).toBe(true);
    expect(r?.lookalikes).toEqual([{ kind: 'payment', label: 'Receipt R-1, check, Oct 12', certain: true }]);
    expect(parseSubmitted({ proof: { id: 'x' } })).toBeNull();
    expect(parseSubmitted(null)).toBeNull();
  });
  it('a proof can be taken back only while it waits; Waiting is not green, Paid is', () => {
    expect(canWithdraw('submitted')).toBe(true);
    expect(canWithdraw('needs_info')).toBe(true);
    for (const s of ['approved', 'rejected', 'withdrawn', 'merged', 'auto_reconciled'] as const) expect(canWithdraw(s)).toBe(false);
    expect(proofLook('submitted').tone).toBe('navy');
    expect(proofLook('needs_info').tone).toBe('amber');
    expect(proofLook('approved')).toEqual({ labelKey: 'proofs.status.approved', tone: 'green' });
    expect(proofLook('merged').tone).toBe('green');
    expect(proofLook('rejected').tone).toBe('red');
    expect(proofLook('withdrawn').tone).toBe('grey');
  });
  it('lists the newest first and picks out the ones still waiting', () => {
    const a = parseProof(proofRow({ id: 'a', created_at: '2026-10-01T00:00:00Z' }));
    const b = parseProof(proofRow({ id: 'b', created_at: '2026-10-12T00:00:00Z', status: 'approved' }));
    const c = parseProof(proofRow({ id: 'c', created_at: '2026-10-09T00:00:00Z', status: 'needs_info' }));
    if (!a || !b || !c) throw new Error('fixture');
    expect(newestProofFirst([a, b, c]).map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(waitingProofs([a, b, c]).map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('which pledges have a proof attached', () => {
  const made = (over: Record<string, unknown>) => {
    const p = parseProof(proofRow(over));
    if (!p) throw new Error('fixture');
    return p;
  };
  it('lists the pledges an accepted proof with an openable file covers', () => {
    const ids = pledgesWithProofAttached([made({ status: 'approved', covered: [{ pledge_id: 'a', amount_cents: 100, state: 'converted' }, { pledge_id: 'b', amount_cents: 100, state: 'converted' }] }), made({ id: 'pr2', status: 'merged', covered: [{ pledge_id: 'c', amount_cents: 100, state: 'converted' }] })]);
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
  });
  it('leaves out a proof still waiting, rejected or taken back, a share that was released, and a proof with no file left to open', () => {
    const cover = [{ pledge_id: 'a', amount_cents: 100, state: 'converted' }];
    expect(pledgesWithProofAttached([made({ status: 'submitted', covered: cover }), made({ status: 'rejected', covered: cover }), made({ status: 'withdrawn', covered: cover })]).size).toBe(0);
    expect(pledgesWithProofAttached([made({ status: 'approved', covered: [{ pledge_id: 'a', amount_cents: 100, state: 'released' }] })]).size).toBe(0);
    expect(pledgesWithProofAttached([made({ status: 'approved', covered: cover, files: [{ id: 'f1', storage_path: 'x', content_type: 'image/jpeg', bytes: 1, removed: true, created_at: null }] }), made({ status: 'approved', covered: cover, files: [] })]).size).toBe(0);
  });
});

describe('what a pledge keeps (app.pledge_evidence)', () => {
  const rows = [
    { kind: 'proof', proof_id: 'pr1', payment_id: null, state: 'waiting', covered_cents: 16000, method: 'check', paid_on: '2026-10-12', reference: '1048', reason: null, sent_on: '2026-10-12T14:14:00Z', kept_until: '2033-12-31', files: [{ id: 'f1', storage_path: 'c/h/pr1/a.jpg', content_type: 'image/jpeg', bytes: 10, removed: false }] },
    { kind: 'payment', proof_id: 'pr9', payment_id: 'pay1', state: 'reconciled', covered_cents: 5000, method: 'cash', paid_on: '2018-03-03', receipt_number: 'R-2018-0044', kept_until: '2025-12-31', files: [{ id: 'f2', storage_path: 'c/h/pr9/b.jpg', content_type: 'image/jpeg', bytes: 10, removed: true, removed_on: '2026-01-01T00:00:00Z', removed_reason: 'retention' }] },
  ];
  it('reads a proof and a payment with the share each covered, the kept-until date and the removed files', () => {
    const r = parseEvidence(rows);
    expect(r?.skipped).toBe(0);
    const [proof, payment] = r?.items ?? [];
    expect(proof).toMatchObject({ kind: 'proof', state: 'waiting', coveredCents: 16000, keptUntil: '2033-12-31', proofId: 'pr1' });
    expect(openableFiles(proof)).toHaveLength(1);
    expect(payment).toMatchObject({ kind: 'payment', state: 'reconciled', receiptNumber: 'R-2018-0044' });
    expect(openableFiles(payment)).toEqual([]);
    expect(removedFiles(payment)).toEqual([expect.objectContaining({ id: 'f2', removedOn: '2026-01-01T00:00:00Z', removedReason: 'retention' })]);
  });
  it('keeps a null kept-until (a legal hold) and leaves out a row that is neither a proof nor a payment', () => {
    const r = parseEvidence([{ ...rows[0], kept_until: null }, { kind: 'mystery' }, 7]);
    expect(r?.items[0].keptUntil).toBeNull();
    expect(r?.skipped).toBe(2);
    expect(parseEvidence({})).toBeNull();
  });
});

describe("a pledge's story", () => {
  const money = (c: number) => `$${c / 100}`;
  const name = (m: string) => m;
  it('lists the pledge, the proof, the payment and the bank, oldest first', () => {
    const evidence = parseEvidence([{ kind: 'proof', proof_id: 'pr1', state: 'waiting', covered_cents: 16000, sent_on: '2026-10-12T14:14:00Z', files: [] }])?.items ?? [];
    const payments = [{ paymentId: 'p1', method: 'check', receivedOn: '2026-10-14', receiptNumber: 'R-1', checkNumber: '1048', appliedCents: 16000, totalCents: 25000, reconciledAt: '2026-10-20T00:00:00Z' }];
    const t = pledgeTimeline({ pledged_at: '2026-09-02T10:00:00Z', status: 'paid', closed_at: '2026-10-14T00:00:00Z', reconciled_at: '2026-10-20T00:00:00Z' }, evidence, payments, money, name);
    expect(t.map((e) => e.key)).toEqual(['pledge.history.pledged', 'pledge.history.soft', 'pledge.history.paid', 'pledge.history.bank']);
    expect(t[2].vars).toEqual({ method: 'check', amount: '$160' });
  });
  it('says Paid when the pledge is paid and nothing else tells how, and the end of a cancelled or written-off pledge', () => {
    expect(pledgeTimeline({ pledged_at: '2018-02-20T00:00:00Z', status: 'paid', closed_at: '2018-03-03T00:00:00Z' }, [], [], money, name).map((e) => e.key)).toEqual(['pledge.history.pledged', 'pledge.history.paidFull']);
    expect(pledgeTimeline({ pledged_at: '2026-01-01T00:00:00Z', status: 'cancelled', closed_at: '2026-02-01T00:00:00Z' }, [], [], money, name).map((e) => e.key)).toEqual(['pledge.history.pledged', 'pledge.history.cancelled']);
    expect(pledgeTimeline({ pledged_at: '2026-01-01T00:00:00Z', status: 'written_off', closed_at: null }, [], [], money, name).map((e) => e.key)).toEqual(['pledge.history.pledged', 'pledge.history.writtenOff']);
  });
  it('shows a proof that was not accepted or taken back', () => {
    const evidence = parseEvidence([
      { kind: 'proof', proof_id: 'a', state: 'rejected', covered_cents: 100, sent_on: '2026-08-02T00:00:00Z', files: [] },
      { kind: 'proof', proof_id: 'b', state: 'withdrawn', covered_cents: 100, sent_on: '2026-08-03T00:00:00Z', files: [] },
      { kind: 'proof', proof_id: 'c', state: 'needs_info', covered_cents: 100, sent_on: '2026-08-04T00:00:00Z', files: [] },
    ])?.items ?? [];
    expect(pledgeTimeline({ pledged_at: '2026-07-01T00:00:00Z', status: 'open', closed_at: null }, evidence, [], money, name).map((e) => e.key)).toEqual(['pledge.history.pledged', 'pledge.history.rejected', 'pledge.history.withdrawn', 'pledge.history.needs']);
  });
});
