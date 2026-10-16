/**
 * "I paid another way": a payment proof, the Soft credit it reserves, and the evidence a pledge keeps. Pure: no I/O, no React.
 *
 * A family that paid by check, cash, bank transfer, stock, donor-advised fund or matching gift sends a proof (photos, the
 * amount, the date). The database (connect-crm 0866 app.submit_payment_proof) reserves the amount on the oldest pledges as
 * Soft credit; nothing is paid until the treasury team checks it. The rules here mirror the database so a mistake is caught
 * before the request, with the same words; the database checks everything again and is the authority.
 */

import type { PaymentMethods } from '@/features/pay/methods';
import { parseReportAmount, type AmountProblem } from '@/features/pay/zelle-report';
import type { StringKey } from '@/i18n/en';

import { daysBetween, parseDobInput } from './format';
import { normalizeMime } from './homework';

/** The private bucket the proofs live in (connect-crm 0865). */
export const PROOF_BUCKET = 'payment-evidence';
/** Up to 5 files per proof, 10 MB each (the bucket's own limit). */
export const MAX_PROOF_FILES = 5;
export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
/** The database refuses a date more than 400 days ago ("ask the treasurer to record it"). */
export const MAX_PAID_AGE_DAYS = 400;
export const MAX_REFERENCE_CHARS = 80;
export const MAX_NOTE_CHARS = 500;
/** A confirmation key is 8 to 120 characters (the database's own rule). */
export const MIN_KEY_CHARS = 8;
export const MAX_KEY_CHARS = 120;

/**
 * The ways a family can say it paid. Zelle is one when the community takes it: a proof for it credits no money and only
 * shows Soft credit on the pledge until the treasury team matches it at the bank, and the "I sent a Zelle" report stays as it is.
 * 'other' is the database's catch-all; a community that takes it lists it.
 */
export const PROOF_METHOD_KEYS = ['cash', 'check', 'ach', 'zelle', 'stock', 'daf', 'matching_gift', 'other'] as const;
export type ProofMethodKey = (typeof PROOF_METHOD_KEYS)[number];

export function isProofMethod(v: unknown): v is ProofMethodKey {
  return typeof v === 'string' && (PROOF_METHOD_KEYS as readonly string[]).includes(v);
}

/** The offline methods this community takes, as the sheet offers them: in the community's order, once each, nothing it does not list. */
export function acceptedProofMethods(list: PaymentMethods | null): ProofMethodKey[] {
  const out: ProofMethodKey[] = [];
  for (const m of list?.methods ?? []) {
    // Zelle is its own kind of entry in the community's list (a transfer the family reports), not an office instruction.
    const key = m.kind === 'zelle' ? 'zelle' : m.kind === 'instructions' ? m.method : null;
    if (!isProofMethod(key) || out.includes(key)) continue;
    out.push(key);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The community's rules (app.proof_policy)
// ---------------------------------------------------------------------------

export type ProofPolicy = {
  /** Methods that need a photo or file before a proof can be sent. */
  requiredMethods: string[];
  /** Whether a pledge that only has Soft credit still lets a family into an event. */
  honourEventEntry: boolean;
  retentionYears: number;
  legalHold: boolean;
  /** How long the treasury team waits for a reply before it decides. */
  replyWaitDays: number;
};

/** What the database uses when a community has set nothing (app.proof_policy defaults). */
export const DEFAULT_POLICY: ProofPolicy = {
  requiredMethods: ['check', 'ach', 'stock', 'daf', 'matching_gift', 'other'],
  honourEventEntry: true,
  retentionYears: 7,
  legalHold: false,
  replyWaitDays: 14,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function wholeCents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,12}$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Reads `app.proof_policy`; a field the answer lacks keeps the database's default. Null when the answer is not an object at all. */
export function parsePolicy(raw: unknown): ProofPolicy | null {
  if (!isRecord(raw)) return null;
  const required = Array.isArray(raw.required_methods) ? raw.required_methods.filter((m): m is string => typeof m === 'string') : DEFAULT_POLICY.requiredMethods;
  const years = typeof raw.retention_years === 'number' && Number.isInteger(raw.retention_years) && raw.retention_years > 0 ? raw.retention_years : DEFAULT_POLICY.retentionYears;
  const wait = typeof raw.reply_wait_days === 'number' && Number.isInteger(raw.reply_wait_days) && raw.reply_wait_days > 0 ? raw.reply_wait_days : DEFAULT_POLICY.replyWaitDays;
  return {
    requiredMethods: required,
    honourEventEntry: typeof raw.honour_event_entry === 'boolean' ? raw.honour_event_entry : DEFAULT_POLICY.honourEventEntry,
    retentionYears: years,
    legalHold: raw.legal_hold === true,
    replyWaitDays: wait,
  };
}

/** A photo or file is needed for this way of paying. */
export function proofNeeded(policy: ProofPolicy, method: string | null): boolean {
  return !!method && policy.requiredMethods.includes(method);
}

// ---------------------------------------------------------------------------
// Words for the methods
// ---------------------------------------------------------------------------

/** The dictionary key for a method's name ("Check", "Bank transfer"); a method this build has no name for is named from its key. */
export function methodNameKey(method: string): StringKey {
  return `proof.method.${method}` as StringKey;
}

/** "matching_gift" gives "Matching gift": for a method the dictionary has no name for. */
export function humanizeMethod(method: string): string {
  const s = method.replace(/_/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/** The label of the reference field: a check number, a bank reference, shares and symbol. */
export function referenceLabelKey(method: string | null): StringKey {
  return (method && (PROOF_METHOD_KEYS as readonly string[]).includes(method) ? `proof.ref.${method}` : 'proof.ref.other') as StringKey;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

/** A photo is saved again on the phone as a JPEG no longer than this on its longest side, at this quality (this drops the place it was taken). */
export const PHOTO_MAX_SIDE = 2000;
export const PHOTO_QUALITY = 0.8;

/** The one size to ask for so the longest side is at most `max`; null when the photo is already small enough (or its size is unknown). */
export function fitLongestSide(width: number, height: number, max: number = PHOTO_MAX_SIDE): { width: number } | { height: number } | null {
  if (!(width > 0) || !(height > 0) || Math.max(width, height) <= max) return null;
  return width >= height ? { width: max } : { height: max };
}

/** The content types the bucket takes (connect-crm 0865): JPEG, PNG, WebP, HEIC and PDF. */
export const PROOF_TYPES: readonly string[] = Object.keys(EXT_BY_TYPE);

export function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/');
}

export function isPdfType(contentType: string): boolean {
  return contentType === 'application/pdf';
}

function extensionOf(s: string | null | undefined): string | null {
  return /\.([a-z0-9]{2,5})(\?|$)/i.exec(s ?? '')?.[1]?.toLowerCase() ?? null;
}

/** What the picker, the file name or the fetched file says about a file. */
export type FileHints = { fileName?: string | null; mimeType?: string | null; uri?: string | null; reported?: string | null };

/**
 * The extension and content type a file is uploaded under: the type the picker gave, else the extension of its name or uri,
 * else what the fetched file reported. Null when none of them names a type the bucket takes; with no hint at all it is
 * assumed to be a JPEG photo (the photo pickers only offer photos).
 */
export function proofFileType(hints: FileHints): { ext: string; contentType: string } | null {
  const mime = normalizeMime(hints.mimeType);
  // The picker said what it is and the bucket does not take that: the file's name cannot change its mind.
  if (mime && mime !== 'application/octet-stream' && !PROOF_TYPES.includes(mime)) return null;
  const reported = normalizeMime(hints.reported);
  const ext = [extensionOf(hints.fileName), extensionOf(hints.uri)].find((e): e is string => !!e && !!TYPE_BY_EXT[e]) ?? null;
  const said = [mime, ext ? TYPE_BY_EXT[ext] : '', reported !== 'application/octet-stream' ? reported : ''].filter(Boolean);
  if (said.length === 0) return { ext: 'jpg', contentType: 'image/jpeg' };
  const contentType = said.find((c) => PROOF_TYPES.includes(c));
  return contentType ? { ext: EXT_BY_TYPE[contentType], contentType } : null;
}

export type FileProblem = 'type' | 'size' | 'empty';

/** Why a file cannot be sent, before anything is uploaded; null when it can. */
export function proofFileProblem(file: { contentType: string; bytes: number | null }): FileProblem | null {
  if (!PROOF_TYPES.includes(file.contentType)) return 'type';
  if (file.bytes !== null && file.bytes <= 0) return 'empty';
  if (file.bytes !== null && file.bytes > MAX_PROOF_BYTES) return 'size';
  return null;
}

/** Where a family's file goes: `<center>/<household>/<proof>/<random>.<ext>` (the bucket's rules read the household and proof from the path). */
export function proofStoragePath(args: { centerId: string; householdId: string; proofId: string; id: string; ext: string }): string {
  return `${args.centerId}/${args.householdId}/${args.proofId}/${args.id}.${args.ext}`;
}

/** A file already in the bucket, as `app.submit_payment_proof` takes it. */
export type UploadedProofFile = { path: string; content_type: string; bytes: number };

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export type ProofInput = {
  method: string | null;
  /** As typed. Ignored when the amount is locked. */
  amount: string;
  /** As the date field gives it: "MM/DD/YYYY". */
  date: string;
  reference: string;
};

export type ProofContext = {
  /** The community's date today, 'YYYY-MM-DD'. */
  today: string;
  /** The methods the community accepts for a proof. */
  methods: readonly string[];
  /** A checkout fixes the amount to its pledge's remainder (RSVP). Null on Open pledges. */
  lockedCents: number | null;
  /** What the pledges the proof would cover still need; 0 means there is nothing for a proof to cover. */
  coverableCents: number;
};

export type ProofProblem = AmountProblem | 'method_required' | 'date_required' | 'date_invalid' | 'date_future' | 'date_old' | 'reference_long' | 'no_pledge';

export type ProofField = 'method' | 'amount' | 'date' | 'reference' | 'pledges';

export type ProofValue = {
  method: string;
  amountCents: number;
  /** 'YYYY-MM-DD' */
  paidOn: string;
  reference: string | null;
};

/** Checks the first step. Returns what to send, or every problem at once (one per field) so they are fixed in one go. */
export function validateProofForm(input: ProofInput, ctx: ProofContext): { ok: true; value: ProofValue } | { ok: false; problems: Partial<Record<ProofField, ProofProblem>> } {
  const problems: Partial<Record<ProofField, ProofProblem>> = {};

  if (ctx.coverableCents <= 0) problems.pledges = 'no_pledge';

  const method = input.method && ctx.methods.includes(input.method) ? input.method : null;
  if (!method) problems.method = 'method_required';

  let amountCents: number | null = null;
  if (ctx.lockedCents !== null) {
    amountCents = ctx.lockedCents;
  } else {
    const amount = parseReportAmount(input.amount);
    if (amount.ok) amountCents = amount.cents;
    else problems.amount = amount.problem;
  }

  let paidOn: string | null = null;
  if (input.date.trim() === '') {
    problems.date = 'date_required';
  } else {
    paidOn = parseDobInput(input.date);
    if (!paidOn) {
      problems.date = 'date_invalid';
    } else if (paidOn > ctx.today) {
      problems.date = 'date_future';
      paidOn = null;
    } else if (daysBetween(paidOn, ctx.today) > MAX_PAID_AGE_DAYS) {
      problems.date = 'date_old';
      paidOn = null;
    }
  }

  const reference = input.reference.trim();
  if (reference.length > MAX_REFERENCE_CHARS) problems.reference = 'reference_long';

  if (Object.keys(problems).length > 0 || !method || amountCents === null || !paidOn) return { ok: false, problems };
  return { ok: true, value: { method, amountCents, paidOn, reference: reference === '' ? null : reference } };
}

export type FilesProblem = 'files_required' | 'files_too_many';

/** The second step: how many files, and whether this way of paying needs one. */
export function validateProofFiles(count: number, method: string | null, policy: ProofPolicy): FilesProblem | null {
  if (count > MAX_PROOF_FILES) return 'files_too_many';
  if (count === 0 && proofNeeded(policy, method)) return 'files_required';
  return null;
}

// ---------------------------------------------------------------------------
// A proof, as the database answers (app._proof_json)
// ---------------------------------------------------------------------------

export const PROOF_STATUSES = ['submitted', 'needs_info', 'approved', 'rejected', 'withdrawn', 'merged', 'auto_reconciled'] as const;
export type ProofStatus = (typeof PROOF_STATUSES)[number];

export type ProofFile = { id: string; path: string; contentType: string; bytes: number; removed: boolean; createdAt: string | null };
export type ProofCover = { pledgeId: string; pledgeNumber: string | null; title: string; amountCents: number; pledgeAmountCents: number; state: string };
export type ProofEvent = { kind: string; body: string; createdAt: string };

export type PaymentProof = {
  id: string;
  householdId: string;
  status: ProofStatus;
  entry: string;
  method: string;
  amountCents: number;
  /** 'YYYY-MM-DD' */
  paidOn: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  question: string | null;
  decisionReason: string | null;
  excessCents: number;
  approvedAmountCents: number | null;
  paymentId: string | null;
  isTest: boolean;
  covered: ProofCover[];
  files: ProofFile[];
  events: ProofEvent[];
};

function parseFile(v: unknown): ProofFile | null {
  if (!isRecord(v)) return null;
  const id = str(v.id);
  const path = str(v.storage_path);
  if (!id || !path) return null;
  return { id, path, contentType: str(v.content_type) ?? 'application/octet-stream', bytes: wholeCents(v.bytes) ?? 0, removed: v.removed === true, createdAt: str(v.created_at) };
}

function parseCover(v: unknown): ProofCover | null {
  if (!isRecord(v)) return null;
  const pledgeId = str(v.pledge_id);
  const amountCents = wholeCents(v.amount_cents);
  if (!pledgeId || amountCents === null) return null;
  return { pledgeId, pledgeNumber: str(v.pledge_number), title: str(v.title) ?? '', amountCents, pledgeAmountCents: wholeCents(v.pledge_amount_cents) ?? amountCents, state: str(v.state) ?? 'active' };
}

function parseEvent(v: unknown): ProofEvent | null {
  if (!isRecord(v)) return null;
  const body = str(v.body);
  const createdAt = str(v.created_at);
  if (!body || !createdAt) return null;
  return { kind: str(v.kind) ?? '', body, createdAt };
}

function listOf<T>(raw: unknown, read: (v: unknown) => T | null): T[] {
  return Array.isArray(raw) ? raw.map(read).filter((x): x is T => x !== null) : [];
}

/** One proof, or null when the answer is not one (no id, no whole-cents amount, no date, a status this build does not know). */
export function parseProof(raw: unknown): PaymentProof | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const amountCents = wholeCents(raw.amount_cents);
  const paidOn = str(raw.paid_on);
  const status = PROOF_STATUSES.find((s) => s === raw.status);
  const method = str(raw.method);
  const createdAt = str(raw.created_at);
  if (!id || amountCents === null || !paidOn || !/^\d{4}-\d{2}-\d{2}/.test(paidOn) || !status || !method || !createdAt) return null;
  return {
    id,
    householdId: str(raw.household_id) ?? '',
    status,
    entry: str(raw.entry) ?? 'open_pledges',
    method,
    amountCents,
    paidOn: paidOn.slice(0, 10),
    reference: str(raw.reference),
    note: str(raw.note),
    createdAt,
    question: str(raw.question),
    decisionReason: str(raw.decision_reason),
    excessCents: wholeCents(raw.excess_cents) ?? 0,
    approvedAmountCents: wholeCents(raw.approved_amount_cents),
    paymentId: str(raw.payment_id),
    isTest: raw.is_test === true,
    covered: listOf(raw.covered, parseCover),
    files: listOf(raw.files, parseFile),
    events: listOf(raw.events, parseEvent),
  };
}

/** `app.my_payment_proofs`: newest first. A row that is not a proof is left out and counted, so the caller can log it. */
export function parseProofs(raw: unknown): { proofs: PaymentProof[]; skipped: number } | null {
  if (!Array.isArray(raw)) return null;
  const proofs: PaymentProof[] = [];
  let skipped = 0;
  for (const row of raw) {
    const p = parseProof(row);
    if (p) proofs.push(p);
    else skipped += 1;
  }
  return { proofs, skipped };
}

export type Lookalike = { kind: string; label: string; certain: boolean };

export type SubmittedProof = { proof: PaymentProof; replayed: boolean; lookalikes: Lookalike[] };

/** The answer of `app.submit_payment_proof`: the proof, whether it was a replay of the same tap, and what it looks like on file. */
export function parseSubmitted(raw: unknown): SubmittedProof | null {
  if (!isRecord(raw)) return null;
  const proof = parseProof(raw.proof);
  if (!proof) return null;
  const lookalikes = listOf(raw.lookalikes, (v): Lookalike | null => {
    if (!isRecord(v)) return null;
    const label = str(v.label);
    return label ? { kind: str(v.kind) ?? '', label, certain: v.certain === true } : null;
  });
  return { proof, replayed: raw.replayed === true, lookalikes };
}

/** Still with the treasury team, so the family can take it back. */
export function canWithdraw(status: ProofStatus): boolean {
  return status === 'submitted' || status === 'needs_info';
}

/** Its pledges show Soft credit now. */
export function isWaitingProof(status: ProofStatus): boolean {
  return status === 'submitted' || status === 'needs_info';
}

/**
 * The pledges a proof is attached to once the treasury team accepted it: an approved, merged or bank-reconciled proof that still has a file
 * the family can open. A pledge it was released from (its share given back), or whose files were removed, is left out.
 */
export function pledgesWithProofAttached(proofs: readonly PaymentProof[]): Set<string> {
  const out = new Set<string>();
  for (const proof of proofs) {
    if (proof.status !== 'approved' && proof.status !== 'merged' && proof.status !== 'auto_reconciled') continue;
    if (!proof.files.some((f) => !f.removed)) continue;
    for (const cover of proof.covered) if (cover.state !== 'released') out.add(cover.pledgeId);
  }
  return out;
}

export type ProofTone = 'amber' | 'navy' | 'green' | 'red' | 'grey';

export type ProofLook = { labelKey: StringKey; tone: ProofTone };

/** The chip a proof shows. "Waiting" is deliberately not green: nothing has been paid yet. */
export function proofLook(status: ProofStatus): ProofLook {
  switch (status) {
    case 'submitted':
      return { labelKey: 'proofs.status.submitted', tone: 'navy' };
    case 'needs_info':
      return { labelKey: 'proofs.status.needs_info', tone: 'amber' };
    case 'approved':
    case 'merged':
    case 'auto_reconciled':
      return { labelKey: 'proofs.status.approved', tone: 'green' };
    case 'rejected':
      return { labelKey: 'proofs.status.rejected', tone: 'red' };
    default:
      return { labelKey: 'proofs.status.withdrawn', tone: 'grey' };
  }
}

/** Newest first: by when it was sent, then by the date paid. */
export function newestProofFirst(proofs: readonly PaymentProof[]): PaymentProof[] {
  return [...proofs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.paidOn.localeCompare(a.paidOn));
}

/** Proofs that still reserve Soft credit: the family has at most 5 of them waiting. */
export function waitingProofs(proofs: readonly PaymentProof[]): PaymentProof[] {
  return proofs.filter((p) => isWaitingProof(p.status));
}

// ---------------------------------------------------------------------------
// What a pledge keeps (app.pledge_evidence)
// ---------------------------------------------------------------------------

export type EvidenceFile = { id: string; path: string; contentType: string; bytes: number; removed: boolean; removedOn: string | null; removedReason: string | null };

export type EvidenceItem = {
  /** A proof the family sent, or a payment that credited the pledge with files attached. */
  kind: 'proof' | 'payment';
  proofId: string | null;
  paymentId: string | null;
  /** waiting, needs_info, rejected, withdrawn (a proof) or paid, reconciled (a payment). */
  state: string;
  /** The share of the proof or payment that covered THIS pledge. */
  coveredCents: number;
  method: string | null;
  paidOn: string | null;
  reference: string | null;
  reason: string | null;
  sentOn: string | null;
  receiptNumber: string | null;
  /** The last day the family can open the files, or null when a legal hold keeps them. */
  keptUntil: string | null;
  files: EvidenceFile[];
};

function parseEvidenceFile(v: unknown): EvidenceFile | null {
  if (!isRecord(v)) return null;
  const id = str(v.id);
  const path = str(v.storage_path);
  if (!id || !path) return null;
  return {
    id,
    path,
    contentType: str(v.content_type) ?? 'application/octet-stream',
    bytes: wholeCents(v.bytes) ?? 0,
    removed: v.removed === true,
    removedOn: str(v.removed_on),
    removedReason: str(v.removed_reason),
  };
}

/** `app.pledge_evidence`: oldest first. A row that is not what we expect is left out and counted. */
export function parseEvidence(raw: unknown): { items: EvidenceItem[]; skipped: number } | null {
  if (!Array.isArray(raw)) return null;
  const items: EvidenceItem[] = [];
  let skipped = 0;
  for (const row of raw) {
    if (!isRecord(row) || (row.kind !== 'proof' && row.kind !== 'payment')) {
      skipped += 1;
      continue;
    }
    items.push({
      kind: row.kind,
      proofId: str(row.proof_id),
      paymentId: str(row.payment_id),
      state: str(row.state) ?? (row.kind === 'proof' ? 'waiting' : 'paid'),
      coveredCents: wholeCents(row.covered_cents) ?? 0,
      method: str(row.method),
      paidOn: str(row.paid_on)?.slice(0, 10) ?? null,
      reference: str(row.reference),
      reason: str(row.reason),
      sentOn: str(row.sent_on),
      receiptNumber: str(row.receipt_number),
      keptUntil: str(row.kept_until)?.slice(0, 10) ?? null,
      files: listOf(row.files, parseEvidenceFile),
    });
  }
  return { items, skipped };
}

/** The files the family can still open (not removed after the years ran out). */
export function openableFiles(item: Pick<EvidenceItem, 'files'>): EvidenceFile[] {
  return item.files.filter((f) => !f.removed);
}

/** The files that were removed, with when: the pledge says so plainly. */
export function removedFiles(item: Pick<EvidenceItem, 'files'>): EvidenceFile[] {
  return item.files.filter((f) => f.removed);
}


// ---------------------------------------------------------------------------
// A pledge's story
// ---------------------------------------------------------------------------

/** A payment that credited a pledge (payments with their allocations), as the details screen lists it. */
export type PledgePayment = {
  paymentId: string;
  method: string;
  /** 'YYYY-MM-DD' */
  receivedOn: string;
  receiptNumber: string | null;
  checkNumber: string | null;
  /** What this payment put on THIS pledge. */
  appliedCents: number;
  /** The whole payment, which may have paid several pledges. */
  totalCents: number;
  reconciledAt: string | null;
};

export type TimelineTone = 'navy' | 'green' | 'amber' | 'grey';

export type TimelineEntry = { at: string; key: StringKey; vars?: Record<string, string | number>; tone: TimelineTone };

/**
 * What happened to a pledge, oldest first: pledged, a proof sent, payments recorded, confirmed by the bank, cancelled or
 * written off. Built from what the family can read: the pledge, its evidence and its payments. `money` formats cents.
 */
export function pledgeTimeline(
  pledge: { pledged_at: string; status: string; closed_at: string | null; reconciled_at?: string | null },
  evidence: readonly EvidenceItem[],
  payments: readonly PledgePayment[],
  money: (cents: number) => string,
  methodName: (method: string) => string,
): TimelineEntry[] {
  const out: TimelineEntry[] = [{ at: pledge.pledged_at, key: 'pledge.history.pledged', tone: 'navy' }];
  for (const item of evidence) {
    if (item.kind !== 'proof') continue;
    const at = item.sentOn ?? item.paidOn;
    if (!at) continue;
    if (item.state === 'waiting') out.push({ at, key: 'pledge.history.soft', vars: { amount: money(item.coveredCents) }, tone: 'navy' });
    else if (item.state === 'needs_info') out.push({ at, key: 'pledge.history.needs', tone: 'amber' });
    else if (item.state === 'rejected') out.push({ at, key: 'pledge.history.rejected', tone: 'grey' });
    else if (item.state === 'withdrawn') out.push({ at, key: 'pledge.history.withdrawn', tone: 'grey' });
  }
  for (const p of payments) {
    out.push({ at: p.receivedOn, key: 'pledge.history.paid', vars: { method: methodName(p.method), amount: money(p.appliedCents) }, tone: 'green' });
  }
  if (pledge.status === 'paid' && payments.length === 0 && pledge.closed_at) out.push({ at: pledge.closed_at, key: 'pledge.history.paidFull', tone: 'green' });
  if (pledge.reconciled_at) out.push({ at: pledge.reconciled_at, key: 'pledge.history.bank', tone: 'green' });
  if (pledge.status === 'cancelled') out.push({ at: pledge.closed_at ?? pledge.pledged_at, key: 'pledge.history.cancelled', tone: 'grey' });
  if (pledge.status === 'written_off') out.push({ at: pledge.closed_at ?? pledge.pledged_at, key: 'pledge.history.writtenOff', tone: 'grey' });
  // Oldest first; a stable sort, so entries of one day keep the order above (pledged, proof, paid, bank).
  return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.at.slice(0, 10).localeCompare(b.e.at.slice(0, 10)) || a.i - b.i).map((x) => x.e);
}

/** "1.4 MB", "820 KB": the size of a file as the family reads it. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
