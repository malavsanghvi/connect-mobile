import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement, ReactNode } from 'react';
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import PaymentProofsScreen from '@/app/(app)/payment-proofs';
import { AppError } from '@/lib/errors';
import { parseProof, parseProofs, type PaymentProof } from '@/lib/proofs';
import { SettingsProvider } from '@/providers/settings';

const mockList = jest.fn<() => Promise<PaymentProof[]>>();
const mockWithdraw = jest.fn<(id: string) => Promise<PaymentProof>>();
const mockAnswer = jest.fn<(args: Record<string, unknown>) => Promise<PaymentProof>>();
const mockPick = jest.fn<(opts: unknown) => Promise<{ canceled: boolean; assets: { uri: string; fileName: string | null; mimeType: string | null; fileSize: number | null }[] }>>();
const mockConfirm = jest.fn<(opts: Record<string, unknown>) => Promise<boolean>>();
const mockToast = jest.fn();
const mockInvalidate = jest.fn();
const mockParams: { proof?: string } = {};
const mockApp: { member: unknown; center: unknown } = { member: null, center: null };

jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ push: () => undefined, dismissTo: () => undefined }) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: async () => undefined }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
  launchImageLibraryAsync: (opts: unknown) => mockPick(opts),
}));
jest.mock('@/providers/app', () => ({ useApp: () => mockApp }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => mockInvalidate() }) }));
jest.mock('@/providers/feedback', () => ({ useFeedback: () => ({ toast: (m: string) => mockToast(m), confirm: (o: Record<string, unknown>) => mockConfirm(o) }) }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/lib/api/proofs', () => ({
  myPaymentProofs: () => mockList(),
  loadProofPolicy: async () => ({ requiredMethods: ['check'], honourEventEntry: true, retentionYears: 7, legalHold: false, replyWaitDays: 14 }),
  proofReceipts: async (ids: string[]) => new Map(ids.map((i) => [i, 'R-2026-0412'])),
  withdrawPaymentProof: (id: string) => mockWithdraw(id),
  answerProofQuestion: (args: Record<string, unknown>) => mockAnswer(args),
  newProofAttempt: () => ({ proofId: '11111111-1111-4111-8111-111111111111', key: 'proof-key-1234', uploaded: new Map() }),
  removeProofUpload: async () => undefined,
  proofFileUrls: async (paths: string[]) => new Map(paths.map((p) => [p, `https://signed/${p}`])),
}));
jest.mock('@/components/screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => createElement(View, null, children) };
});

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const row = (over: Record<string, unknown> & { id: string }) => ({
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
  files: [{ id: 'f1', storage_path: 'c1/h1/pr1/a.jpg', content_type: 'image/jpeg', bytes: 1_400_000, removed: false }],
  events: [{ kind: 'submitted', body: 'Sent by Adaeze. Your pledges show Soft credit while the treasury team checks it.', created_at: '2026-10-12T14:14:00Z' }],
  ...over,
});
const proofs = (rows: unknown[]): PaymentProof[] => parseProofs(rows)?.proofs ?? [];
const one = (r: unknown): PaymentProof => {
  const p = parseProof(r);
  if (!p) throw new Error('fixture');
  return p;
};

const WAITING = row({ id: 'pr1' });
const NEEDS = row({ id: 'pr2', status: 'needs_info', amount_cents: 12000, method: 'ach', reference: null, created_at: '2026-10-09T10:00:00Z', question: 'Could you send a clearer photo of the front of the check?', events: [{ kind: 'question', body: 'The treasury team asked a question.', created_at: '2026-10-13T10:00:00Z' }] });
const PAID = row({ id: 'pr3', status: 'approved', amount_cents: 6000, method: 'cash', reference: null, payment_id: 'pay3', created_at: '2026-09-03T10:00:00Z', files: [] });
const REJECTED = row({ id: 'pr4', status: 'rejected', amount_cents: 4000, created_at: '2026-08-02T10:00:00Z', decision_reason: 'The photo does not show an amount.' });

async function render(el: ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>{el}</SettingsProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

const flat = (node: ReactTestInstance): string =>
  [node.props.children]
    .flat(Infinity)
    .map((c: unknown) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');
const texts = (tree: ReactTestRenderer): string[] => tree.root.findAllByType(Text).map(flat).filter(Boolean);
const has = (tree: ReactTestRenderer, s: string): boolean => texts(tree).some((t) => t.trim() === s);
const isPressable = (n: ReactTestInstance): boolean => typeof n.props.onPress === 'function' && typeof n.props.accessibilityRole === 'string';
const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll((n) => isPressable(n) && (n.props.accessibilityLabel === label || (n.props.accessibilityLabel === undefined && n.findAllByType(Text).some((x) => flat(x) === label))));
const press = async (tree: ReactTestRenderer, label: string): Promise<void> => {
  const hit = pressables(tree, label)[0];
  if (!hit) throw new Error(`nothing to press called "${label}"`);
  await act(async () => {
    hit.props.onPress();
  });
};
const hasButton = (tree: ReactTestRenderer, label: string): boolean => pressables(tree, label).length > 0;

async function open(rows: unknown[], opts: { adult?: boolean; proof?: string } = {}): Promise<ReactTestRenderer> {
  mockList.mockResolvedValue(proofs(rows));
  mockApp.member = { isAdult: opts.adult ?? true, household: { id: 'h1' }, members: [] };
  mockParams.proof = opts.proof;
  return render(<PaymentProofsScreen />);
}

beforeEach(() => {
  mockList.mockReset();
  mockWithdraw.mockReset();
  mockAnswer.mockReset();
  mockPick.mockReset();
  mockConfirm.mockReset();
  mockToast.mockReset();
  mockInvalidate.mockReset();
  mockApp.center = { id: 'c1', short_name: 'Riverbend' };
  delete mockParams.proof;
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('My payment proofs', () => {
  it('lists every proof newest first, with where it stands in words that never call a waiting proof paid', async () => {
    const tree = await open([PAID, REJECTED, WAITING, NEEDS]);
    const all = texts(tree);
    expect(all.indexOf('$250 · Check 1048')).toBeLessThan(all.indexOf('$120 · Bank transfer'));
    expect(all.indexOf('$120 · Bank transfer')).toBeLessThan(all.indexOf('$60 · Cash'));
    expect(all.indexOf('$60 · Cash')).toBeLessThan(all.indexOf('$40 · Check 1048'));
    expect(all).toEqual(expect.arrayContaining(['Waiting', 'Needs more', 'Paid', 'Not accepted']));
    expect(all).toContain('Your pledges show Soft credit while the treasury team checks it.');
    expect(all).toContain('Your payment is recorded. Receipt R-2026-0412.');
    expect(all).toContain('Answer');
  });

  it('says there is nothing yet, plainly', async () => {
    const tree = await open([]);
    expect(has(tree, 'You have not sent a payment proof yet.')).toBe(true);
  });

  it('opens a proof: the files, the pledges it covers oldest first with their shares, and what has happened', async () => {
    const tree = await open([WAITING]);
    await press(tree, '$250 · Check 1048. Sent Oct 12, 2026');
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining(['Proof, $250', 'Waiting for the treasury team', 'Your pledges show Soft credit. Nothing is paid until it is checked.']));
    expect(all).toContain('Check 1048 · paid Oct 12, 2026');
    expect(all).toContain('Harvest supper · P-0587');
    expect(all).toContain('$160 of $160');
    expect(all).toContain('$90 of $300');
    expect(pressables(tree, 'Open photo 1')).toHaveLength(1);
    expect(all.some((t) => t.includes('Sent by Adaeze.'))).toBe(true);
  });

  it('opens straight to a proof from a pledge', async () => {
    const tree = await open([WAITING, PAID], { proof: 'pr3' });
    expect(has(tree, 'The treasury team checked your proof')).toBe(true);
    expect(has(tree, 'Your payment is recorded and your pledges are updated. Receipt R-2026-0412 is in your giving history.')).toBe(true);
  });

  it('shows why a proof was not accepted', async () => {
    const tree = await open([REJECTED], { proof: 'pr4' });
    expect(has(tree, 'This proof was not accepted')).toBe(true);
    expect(has(tree, 'Reason: The photo does not show an amount. Your pledges are open again. You can send a new proof.')).toBe(true);
    expect(hasButton(tree, 'Take this proof back')).toBe(false);
  });

  it('asks a child to ask a parent and loads nothing', async () => {
    const tree = await open([WAITING], { adult: false });
    expect(mockList).not.toHaveBeenCalled();
    expect(has(tree, 'Waiting')).toBe(false);
  });

  it('says why the list could not be loaded, with a retry', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockList.mockRejectedValue(new AppError('Could not load your payment proofs — Only an adult of the family can see its payment proofs.', 'x', '42501'));
    mockApp.member = { isAdult: true, household: { id: 'h1' }, members: [] };
    const tree = await render(<PaymentProofsScreen />);
    expect(texts(tree).some((t) => t.startsWith('Could not load your payment proofs'))).toBe(true);
    expect(hasButton(tree, 'Try again')).toBe(true);
  });
});

describe('taking a proof back', () => {
  it('asks first, then tells the database, and says so only after it answered', async () => {
    const tree = await open([WAITING], { proof: 'pr1' });
    mockConfirm.mockResolvedValueOnce(true);
    mockWithdraw.mockResolvedValueOnce(one({ ...WAITING, status: 'withdrawn' }));
    await press(tree, 'Take this proof back');
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Take this proof back?', confirmLabel: 'Take it back', tone: 'danger' }));
    expect(mockWithdraw).toHaveBeenCalledWith('pr1');
    expect(mockToast).toHaveBeenCalledWith('Your proof was taken back.');
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('does nothing when the family keeps it', async () => {
    const tree = await open([WAITING], { proof: 'pr1' });
    mockConfirm.mockResolvedValueOnce(false);
    await press(tree, 'Take this proof back');
    expect(mockWithdraw).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows why when it cannot be taken back, and reads the proofs again so the screen shows where it stands', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const tree = await open([WAITING], { proof: 'pr1' });
    mockConfirm.mockResolvedValueOnce(true);
    mockWithdraw.mockRejectedValueOnce(new AppError('Could not take your proof back — This proof was already checked, so it cannot be taken back.', 'x', '22023'));
    await press(tree, 'Take this proof back');
    expect(texts(tree).some((t) => t.startsWith('Could not take your proof back — This proof was already checked'))).toBe(true);
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalled();
  });
});

describe('answering the treasury team', () => {
  it('shows the question and sends a reply with a new photo', async () => {
    const tree = await open([NEEDS], { proof: 'pr2' });
    expect(has(tree, 'The treasury team needs a little more')).toBe(true);
    expect(has(tree, '“Could you send a clearer photo of the front of the check?”')).toBe(true);
    expect(texts(tree).some((t) => t.startsWith('Your pledges stay Soft credit while you answer. If we do not hear back in 14 days'))).toBe(true);
    await act(async () => {
      tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === 'Your reply (optional)')?.props.onChangeText('Here is a new photo, taken in daylight.');
    });
    mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///new.jpg', fileName: 'new.jpg', mimeType: 'image/jpeg', fileSize: 1_600_000 }] });
    await press(tree, 'Choose a photo');
    mockAnswer.mockResolvedValueOnce(one({ ...NEEDS, status: 'submitted' }));
    await press(tree, 'Send to the treasury team');
    expect(mockAnswer).toHaveBeenCalledWith(expect.objectContaining({ centerId: 'c1', message: 'Here is a new photo, taken in daylight.' }));
    const sent = mockAnswer.mock.calls[0][0] as { files: { uri: string }[]; proof: { id: string } };
    expect(sent.proof.id).toBe('pr2');
    expect(sent.files.map((f) => f.uri)).toEqual(['file:///new.jpg']);
    expect(mockToast).toHaveBeenCalledWith('Your reply was sent.');
  });

  it('shows why a reply was not sent and keeps what was written', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const tree = await open([NEEDS], { proof: 'pr2' });
    mockAnswer.mockRejectedValueOnce(new AppError("We couldn't upload a file. Check your connection and try again.", 'x'));
    await act(async () => {
      tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === 'Your reply (optional)')?.props.onChangeText('Hello');
    });
    await press(tree, 'Send to the treasury team');
    expect(has(tree, "We couldn't upload a file. Check your connection and try again.")).toBe(true);
    expect(mockToast).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === 'Your reply (optional)')?.props.value).toBe('Hello');
  });
});
