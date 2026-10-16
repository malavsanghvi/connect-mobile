import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import PledgeDetailsScreen from '@/app/(app)/pledge/[id]';
import type { ProofReason, ProofSetup } from '@/features/pay/proof-setup';
import { DEFAULT_POLICY, parseEvidence } from '@/lib/proofs';
import { SettingsProvider } from '@/providers/settings';

const mockPledge = jest.fn<() => Promise<unknown>>();
const mockPayments = jest.fn<() => Promise<unknown[]>>();
const mockEvidence = jest.fn<() => Promise<unknown>>();
const mockPush = jest.fn();
const mockOpen = jest.fn<(url: string) => Promise<void>>();
const mockSheet = jest.fn<(props: Record<string, unknown>) => void>();
const mockApp: { member: unknown; center: unknown } = { member: null, center: null };
const mockSetup: { value: ProofSetup | null; reason: ProofReason } = { value: null, reason: 'ok' };
const mockModules: Record<string, boolean> = {};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({ id: 'p1' }) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (url: string) => mockOpen(url) }));
jest.mock('@/providers/app', () => ({ useApp: () => mockApp }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => undefined }) }));
jest.mock('@/providers/modules', () => ({ useModule: (key: string) => mockModules[key] ?? true }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/features/pay/proof-setup', () => ({ useProofSetup: () => ({ setup: mockSetup.value, reason: mockSetup.reason, error: null, reload: () => undefined }) }));
jest.mock('@/features/pay/proof-sheet', () => ({
  ProofSheet: (props: Record<string, unknown>) => {
    mockSheet(props);
    return null;
  },
}));
jest.mock('@/lib/api/giving', () => ({ getPledgeDetail: () => mockPledge(), listPledgePayments: () => mockPayments() }));
jest.mock('@/lib/api/proofs', () => ({
  pledgeEvidence: () => mockEvidence(),
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

const pledgeRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  pledge_number: 'P-0587',
  amount_cents: 16000,
  paid_cents: 16000,
  soft_credit_cents: 0,
  status: 'paid',
  source: 'rsvp_commitment',
  pledged_at: '2026-09-02T10:00:00Z',
  closed_at: '2026-10-14T10:00:00Z',
  reconciled_at: '2026-10-20T10:00:00Z',
  dedication: 'Harvest supper',
  campaignName: null,
  opportunityName: null,
  optionLabel: null,
  pledgedByName: null,
  ...over,
});
const payment = { paymentId: 'pay1', method: 'check', receivedOn: '2026-10-12', receiptNumber: 'R-2026-0412', checkNumber: '1048', appliedCents: 16000, totalCents: 25000, reconciledAt: '2026-10-20T10:00:00Z' };
const file = (id: string, over: Record<string, unknown> = {}) => ({ id, storage_path: `c1/h1/pr1/${id}.jpg`, content_type: 'image/jpeg', bytes: 1_400_000, removed: false, ...over });
const proofItem = (over: Record<string, unknown> = {}) => ({ kind: 'payment', proof_id: 'pr1', payment_id: 'pay1', state: 'reconciled', covered_cents: 16000, method: 'check', paid_on: '2026-10-12', sent_on: '2026-10-12T14:14:00Z', receipt_number: 'R-2026-0412', kept_until: '2033-12-31', files: [file('a'), file('b')], ...over });

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
const has = (tree: ReactTestRenderer, s: string): boolean => texts(tree).some((t) => t === s || t.trim() === s);
const isPressable = (n: ReactTestInstance): boolean => typeof n.props.onPress === 'function' && typeof n.props.accessibilityRole === 'string';
const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] => tree.root.findAll((n) => isPressable(n) && n.props.accessibilityLabel === label);
const press = async (tree: ReactTestRenderer, label: string): Promise<void> => {
  const hit = pressables(tree, label)[0];
  if (!hit) throw new Error(`nothing to press called "${label}"`);
  await act(async () => {
    hit.props.onPress();
  });
};

async function open(args: { pledge?: unknown; payments?: unknown[]; evidence?: unknown[]; adult?: boolean } = {}): Promise<ReactTestRenderer> {
  mockPledge.mockResolvedValue('pledge' in args ? args.pledge : pledgeRow());
  mockPayments.mockResolvedValue(args.payments ?? [payment]);
  mockEvidence.mockResolvedValue(parseEvidence(args.evidence ?? [proofItem()])?.items);
  mockApp.member = { isAdult: args.adult ?? true, today: '2026-10-15', household: { id: 'h1' }, members: [] };
  mockApp.center = { id: 'c1' };
  return render(<PledgeDetailsScreen />);
}

beforeEach(() => {
  mockPledge.mockReset();
  mockPayments.mockReset();
  mockEvidence.mockReset();
  mockPush.mockReset();
  mockOpen.mockReset();
  mockOpen.mockResolvedValue(undefined);
  mockSheet.mockReset();
  mockSetup.value = { methods: ['check', 'cash'], policy: DEFAULT_POLICY };
  mockSetup.reason = 'ok';
  for (const k of Object.keys(mockModules)) delete mockModules[k];
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Pledge details of a paid pledge with its confirmation', () => {
  it('shows the amount, the status, the bank tick, the payment with its receipt, and what share of it went to this pledge', async () => {
    const tree = await open();
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining(['Harvest supper', '$160', 'Paid Oct 14, 2026']));
    expect(all).toContain('✓ Confirmed by the bank');
    expect(all).toContain('Check 1048 · $250 on Oct 12, 2026');
    expect(all).toContain('Receipt R-2026-0412. It paid $160 of this pledge and the rest of the $250 went to your other pledges.');
  });

  it('shows the confirmation as photos that open, the share it covered, and until when it can be opened', async () => {
    const tree = await open();
    expect(has(tree, 'Your confirmation')).toBe(true);
    expect(pressables(tree, 'Open photo 1')).toHaveLength(1);
    expect(pressables(tree, 'Open photo 2')).toHaveLength(1);
    expect(has(tree, 'Sent Oct 12, 2026. This confirmation covered $160 of this pledge.')).toBe(true);
    expect(has(tree, 'You can open this until Dec 31, 2033.')).toBe(true);
    await press(tree, 'Open photo 2');
    expect(mockOpen).toHaveBeenCalledWith('https://signed/c1/h1/pr1/b.jpg');
  });

  it('tells what happened, oldest first', async () => {
    const tree = await open();
    const all = texts(tree);
    const at = (s: string) => all.findIndex((t) => t.trim() === s);
    expect(at('Pledged.')).toBeGreaterThan(-1);
    expect(at('Pledged.')).toBeLessThan(at('Paid: Check, $160.'));
    expect(at('Paid: Check, $160.')).toBeLessThan(at('Confirmed by the bank statement.'));
    expect(all[at('Pledged.') + 1].trim()).toBe('Sep 2, 2026');
    expect(all[at('Confirmed by the bank statement.') + 1].trim()).toBe('Oct 20, 2026');
  });

  it('links a confirmation to its place in My payment confirmations', async () => {
    const tree = await open();
    await press(tree, 'See this confirmation');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/payment-proofs', params: { proof: 'pr1' } });
  });
});

describe('Pledge details after the years ran out', () => {
  const old = pledgeRow({ amount_cents: 5000, paid_cents: 5000, pledged_at: '2018-02-20T10:00:00Z', closed_at: '2018-03-03T10:00:00Z', reconciled_at: null, dedication: 'Food drive 2018' });
  const oldPayment = { ...payment, paymentId: 'pay0', method: 'cash', checkNumber: null, receivedOn: '2018-03-03', receiptNumber: 'R-2018-0044', appliedCents: 5000, totalCents: 5000 };
  const gone = proofItem({ proof_id: 'pr9', method: 'cash', paid_on: '2018-03-03', sent_on: '2018-03-01T10:00:00Z', kept_until: '2025-12-31', files: [file('x', { removed: true, removed_on: '2026-01-01T00:00:00Z', removed_reason: 'retention' })] });

  it('says plainly that the photo was removed, when, and that the receipt stays', async () => {
    const tree = await open({ pledge: old, payments: [oldPayment], evidence: [gone] });
    expect(has(tree, 'The photo was removed')).toBe(true);
    expect(texts(tree).some((t) => t.startsWith('It was removed on Jan 1, 2026 under'))).toBe(true);
    expect(texts(tree).some((t) => t.includes('We keep the receipt and the record of this payment.'))).toBe(true);
    expect(pressables(tree, 'Open photo 1')).toHaveLength(0);
    expect(texts(tree).some((t) => t.startsWith('You can open this'))).toBe(false);
    expect(has(tree, 'Receipt R-2018-0044. It paid $50 of this pledge.')).toBe(true);
    expect(has(tree, 'Cash · $50 on Mar 3, 2018')).toBe(true);
  });
});

describe('Pledge details in other states', () => {
  it('shows a confirmation that was not accepted with its reason, and a pledge with nothing paid', async () => {
    const tree = await open({
      pledge: pledgeRow({ status: 'open', paid_cents: 0, closed_at: null, reconciled_at: null }),
      payments: [],
      evidence: [proofItem({ kind: 'proof', payment_id: null, state: 'rejected', reason: 'The photo does not show an amount.', files: [file('a')], kept_until: '2027-11-05' })],
    });
    expect(has(tree, 'Nothing has been paid on this pledge yet.')).toBe(true);
    expect(has(tree, 'Not accepted: The photo does not show an amount.')).toBe(true);
    expect(has(tree, 'You can open this until Nov 5, 2027.')).toBe(true);
  });

  it('shows Soft credit for a pledge a confirmation covers in full, with nothing left to pay', async () => {
    const tree = await open({
      pledge: pledgeRow({ status: 'soft_credit', paid_cents: 0, soft_credit_cents: 16000, closed_at: null, reconciled_at: null }),
      payments: [],
      evidence: [proofItem({ kind: 'proof', payment_id: null, state: 'waiting', files: [file('a')] })],
    });
    expect(has(tree, 'Soft credit')).toBe(true);
    expect(has(tree, 'Soft credit $160 is waiting to be checked.')).toBe(true);
    expect(has(tree, 'Waiting for the treasury team. It covers $160 of this pledge.')).toBe(true);
  });

  it('keeps a file for as long as it stays on file when a hold keeps it (no date)', async () => {
    const tree = await open({ evidence: [proofItem({ kept_until: null })] });
    expect(has(tree, 'You can open this for as long as it stays on file.')).toBe(true);
  });

  it('does not ask for confirmations, or show them, when the Payment confirmations add-on is off', async () => {
    mockModules.giving_proofs = false;
    const tree = await open();
    expect(mockEvidence).not.toHaveBeenCalled();
    expect(has(tree, 'Your confirmation')).toBe(false);
    expect(has(tree, 'Check 1048 · $250 on Oct 12, 2026')).toBe(true);
  });

  it('says it could not find a pledge that is not the family\'s', async () => {
    const tree = await open({ pledge: null });
    expect(has(tree, 'We could not find this pledge. It may have been removed.')).toBe(true);
  });

  it('asks a child to ask a parent, and loads nothing', async () => {
    const tree = await open({ adult: false });
    expect(mockPledge).not.toHaveBeenCalled();
    expect(has(tree, 'Your confirmation')).toBe(false);
  });

  it('says why when the confirmation cannot be loaded, with a retry, and still shows the pledge and its payment', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPledge.mockResolvedValue(pledgeRow());
    mockPayments.mockResolvedValue([payment]);
    mockEvidence.mockRejectedValue(new Error('Network request failed'));
    mockApp.member = { isAdult: true, household: { id: 'h1' }, members: [] };
    const tree = await render(<PledgeDetailsScreen />);
    expect(has(tree, 'Harvest supper')).toBe(true);
    expect(has(tree, 'Check 1048 · $250 on Oct 12, 2026')).toBe(true);
    expect(texts(tree).some((t) => /Check your internet connection/.test(t))).toBe(true);
    expect(pressables(tree, 'Try again')).toHaveLength(1);
    expect(has(tree, 'No confirmation was sent for this pledge.')).toBe(false);
  });
});

describe('"I paid another way" on a single pledge', () => {
  const NOTE = 'Your community has not set up cash, check or bank transfer yet. Ask the treasurer to turn them on.';
  const openPledge = pledgeRow({ status: 'open', paid_cents: 0, closed_at: null, reconciled_at: null });
  const partly = pledgeRow({ status: 'partially_paid', paid_cents: 6000, closed_at: null, reconciled_at: null });
  const lastSheet = () => mockSheet.mock.calls[mockSheet.mock.calls.length - 1][0];

  it('is there on an open pledge and opens the confirmation sheet bound to that pledge', async () => {
    const tree = await open({ pledge: openPledge, payments: [], evidence: [] });
    expect(pressables(tree, 'I paid another way')).toHaveLength(1);
    expect(has(tree, NOTE)).toBe(false);
    await press(tree, 'I paid another way');
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'open_pledges', initialPledgeIds: ['p1'], centerId: 'c1', householdId: 'h1', today: '2026-10-15' });
    expect((lastSheet().pledges as { id: string; title: string; number: string }[]).map((p) => [p.id, p.title, p.number])).toEqual([['p1', 'Harvest supper', 'P-0587']]);
  });

  it('is there on a partly paid pledge too', async () => {
    const tree = await open({ pledge: partly, payments: [], evidence: [] });
    expect(pressables(tree, 'I paid another way')).toHaveLength(1);
  });

  it('is not there on a paid, soft credit or cancelled pledge, and says nothing about it', async () => {
    mockSetup.value = null;
    mockSetup.reason = 'no_methods';
    for (const over of [{}, { status: 'soft_credit', paid_cents: 0, soft_credit_cents: 16000 }, { status: 'cancelled', paid_cents: 0 }]) {
      const tree = await open({ pledge: pledgeRow(over), payments: [], evidence: [] });
      expect(pressables(tree, 'I paid another way')).toHaveLength(0);
      expect(has(tree, NOTE)).toBe(false);
    }
  });

  it('says why when the community accepts no cash, check or bank transfer, in place of the button', async () => {
    mockSetup.value = null;
    mockSetup.reason = 'no_methods';
    const tree = await open({ pledge: openPledge, payments: [], evidence: [] });
    expect(pressables(tree, 'I paid another way')).toHaveLength(0);
    expect(has(tree, NOTE)).toBe(true);
  });

  it('is hidden, with no note, when confirmations are off for this person or the rules could not be read', async () => {
    for (const reason of ['off', 'no_rules', 'loading'] as const) {
      mockSetup.value = null;
      mockSetup.reason = reason;
      const tree = await open({ pledge: openPledge, payments: [], evidence: [] });
      expect(pressables(tree, 'I paid another way')).toHaveLength(0);
      expect(has(tree, NOTE)).toBe(false);
    }
    mockModules.giving_proofs = false;
    mockSetup.value = { methods: ['check'], policy: DEFAULT_POLICY };
    mockSetup.reason = 'ok';
    const tree = await open({ pledge: openPledge, payments: [], evidence: [] });
    expect(pressables(tree, 'I paid another way')).toHaveLength(0);
  });
});
