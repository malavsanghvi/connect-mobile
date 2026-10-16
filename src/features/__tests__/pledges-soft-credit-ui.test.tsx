import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import PledgesScreen from '@/app/(app)/pledges';
import type { ProofReason, ProofSetup } from '@/features/pay/proof-setup';
import { AppError } from '@/lib/errors';
import { DEFAULT_POLICY, parseProof, type PaymentProof } from '@/lib/proofs';
import { SettingsProvider } from '@/providers/settings';

const mockListPledges = jest.fn<() => Promise<{ pledges: unknown[]; paymentsByYear: Record<number, number>; statements: unknown[] }>>();
const mockProofs = jest.fn<(centerId: string, householdId: string) => Promise<PaymentProof[]>>();
const mockStartPayment = jest.fn<(req: Record<string, unknown>) => Promise<unknown>>();
const mockPush = jest.fn();
const mockSheet = jest.fn<(props: Record<string, unknown>) => void>();
const mockApp: { member: unknown; center: unknown } = { member: null, center: null };
const mockSetup: { value: ProofSetup | null; reason: ProofReason } = { value: null, reason: 'ok' };
const mockModules: Record<string, boolean> = {};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: async () => undefined }));
jest.mock('@/providers/app', () => ({ useApp: () => mockApp }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => undefined }) }));
jest.mock('@/providers/feedback', () => ({ useFeedback: () => ({ toast: () => undefined, confirm: async () => true }) }));
jest.mock('@/providers/modules', () => ({ useModule: (key: string) => mockModules[key] ?? true }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/lib/api/giving', () => ({ listPledges: () => mockListPledges() }));
jest.mock('@/lib/api/proofs', () => ({ myPaymentProofs: (c: string, h: string) => mockProofs(c, h) }));
jest.mock('@/lib/api/payments', () => ({ listPaymentReports: async () => ({ available: true, reports: [] }) }));
jest.mock('@/lib/api/files', () => ({ BUCKETS: { statements: 'statements' }, signedUrl: async () => 'https://signed' }));
jest.mock('@/features/pay', () => ({ startPayment: (req: Record<string, unknown>) => mockStartPayment(req) }));
jest.mock('@/features/pay/proof-setup', () => ({ useProofSetup: () => ({ setup: mockSetup.value, reason: mockSetup.reason, error: null, reload: () => undefined }) }));
jest.mock('@/features/pay/proof-sheet', () => ({
  ProofSheet: (props: Record<string, unknown>) => {
    mockSheet(props);
    return null;
  },
}));
jest.mock('@/components/screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => createElement(View, null, children) };
});

const NOTE = 'Your community has not set up cash, check or bank transfer yet. Ask the treasurer to turn them on.';
const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const row = (over: Record<string, unknown> & { id: string }) => ({
  center_id: 'c1',
  household_id: 'h1',
  pledge_number: null,
  amount_cents: 10000,
  paid_cents: 0,
  soft_credit_cents: 0,
  reconciled_at: null,
  status: 'open',
  source: 'general',
  pledged_at: '2026-09-01T10:00:00Z',
  created_at: '2026-09-01T10:00:00Z',
  closed_at: null,
  dedication: null,
  pledgedByName: null,
  campaignName: null,
  opportunityName: null,
  optionLabel: null,
  ...over,
});

// The owner's example: a supper fully covered by a proof, a fund partly covered, one untouched, and one paid and confirmed by the bank.
const FAMILY = [
  row({ id: 'supper', pledge_number: 'P-0587', dedication: 'Harvest supper', amount_cents: 16000, status: 'soft_credit', soft_credit_cents: 16000, pledged_at: '2026-09-02T10:00:00Z' }),
  row({ id: 'building', pledge_number: 'P-0601', dedication: 'Building fund', amount_cents: 30000, soft_credit_cents: 9000, pledged_at: '2026-09-20T10:00:00Z' }),
  row({ id: 'food', pledge_number: 'P-0633', dedication: 'Fall food drive', amount_cents: 10000, pledged_at: '2026-10-03T10:00:00Z' }),
  row({ id: 'member', pledge_number: 'P-0412', dedication: 'Membership 2026', amount_cents: 12000, paid_cents: 12000, status: 'paid', closed_at: '2026-01-16T10:00:00Z', reconciled_at: '2026-01-20T10:00:00Z', pledged_at: '2026-01-14T10:00:00Z' }),
  row({ id: 'picnic', pledge_number: 'P-0398', dedication: 'Summer picnic', amount_cents: 6000, paid_cents: 6000, status: 'paid', closed_at: '2026-09-26T10:00:00Z', pledged_at: '2026-06-02T10:00:00Z' }),
];

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
const hasText = (tree: ReactTestRenderer, s: string): boolean => texts(tree).some((t) => t === s);
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

async function open(pledges: unknown[] = FAMILY, adult = true): Promise<ReactTestRenderer> {
  mockListPledges.mockResolvedValue({ pledges, paymentsByYear: { 2026: 18000 }, statements: [] });
  mockApp.member = { isAdult: adult, today: '2026-10-15', household: { id: 'h1' }, members: [] };
  return render(<PledgesScreen />);
}

beforeEach(() => {
  mockListPledges.mockReset();
  mockStartPayment.mockReset();
  mockStartPayment.mockResolvedValue(undefined);
  mockPush.mockReset();
  mockSheet.mockReset();
  mockProofs.mockReset();
  mockProofs.mockResolvedValue([]);
  mockApp.center = { id: 'c1', short_name: 'Riverbend', time_zone: 'America/Chicago' };
  mockSetup.value = { methods: ['check', 'cash'], policy: DEFAULT_POLICY };
  mockSetup.reason = 'ok';
  for (const k of Object.keys(mockModules)) delete mockModules[k];
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Family pledges with soft credit', () => {
  it('shows three tiles: Open balance leaves out soft credit, Soft credit waiting is its own figure, and Paid', async () => {
    const tree = await open();
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining(['Open balance', '$310', '2 open', 'Soft credit', '$250', 'waiting to be checked', 'Paid · all years', '$180', '2 closed overall']));
    expect(all).toContain('Your $250 of soft credit is with the treasury team. Open balance leaves out what it covers.');
  });

  it('marks a fully covered pledge Soft credit, and a partly covered one with a chip and what is left to pay', async () => {
    const tree = await open();
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining(['Waiting for the treasury team', 'Soft credit $90 waiting', '$210 left to pay']));
    // The pledge covered in full is not selectable: nothing is left to pay on it.
    expect(hasButton(tree, 'Select Harvest supper to pay, $0 open')).toBe(false);
    expect(hasButton(tree, 'Select Building fund to pay, $210 open')).toBe(true);
    expect(hasButton(tree, 'Select Fall food drive to pay, $100 open')).toBe(true);
  });

  it('says "Confirmed by the bank" on a paid pledge only when it is reconciled', async () => {
    const tree = await open();
    expect(texts(tree).filter((t) => t === '✓ Confirmed by the bank')).toHaveLength(1);
  });

  it('pays the still-to-pay remainder, not the pledge amount', async () => {
    const tree = await open();
    await press(tree, 'Select Building fund to pay, $210 open');
    await press(tree, 'Select Fall food drive to pay, $100 open');
    expect(hasButton(tree, 'Pay 2 pledges · $310')).toBe(true);
    await press(tree, 'Pay 2 pledges · $310');
    expect(mockStartPayment).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 31000, pledgeIds: ['building', 'food'], context: 'pledges' }));
  });

  it('opens Pledge details from any row, paid ones and old ones included', async () => {
    const tree = await open();
    await press(tree, 'Open details for Membership 2026');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pledge/[id]', params: { id: 'member' } });
  });

  it('shows the Soft credit pledge under Open and the paid ones under Closed', async () => {
    const tree = await open();
    await press(tree, 'Closed');
    const closed = texts(tree);
    expect(closed).toContain('Membership 2026');
    expect(closed).not.toContain('Harvest supper');
    await press(tree, 'Open');
    expect(texts(tree)).toContain('Harvest supper');
    expect(texts(tree)).not.toContain('Membership 2026');
  });
});

const proof = (over: Record<string, unknown>): PaymentProof => {
  const parsed = parseProof({
    id: 'pr1',
    household_id: 'h1',
    status: 'approved',
    entry: 'open_pledges',
    method: 'check',
    amount_cents: 12000,
    paid_on: '2026-01-14',
    created_at: '2026-01-14T10:00:00Z',
    covered: [{ pledge_id: 'member', pledge_number: 'P-0412', title: 'Membership 2026', amount_cents: 12000, pledge_amount_cents: 12000, state: 'converted' }],
    files: [{ id: 'f1', storage_path: 'c1/h1/pr1/a.jpg', content_type: 'image/jpeg', bytes: 1000, removed: false, created_at: '2026-01-14T10:00:00Z' }],
    ...over,
  });
  if (!parsed) throw new Error('fixture');
  return parsed;
};

describe('The confirmation mark on closed pledges', () => {
  it('marks the closed pledge that has an accepted confirmation, with one request for the whole family', async () => {
    mockProofs.mockResolvedValue([proof({})]);
    const tree = await open();
    await press(tree, 'Closed');
    expect(texts(tree).filter((t) => t === 'Confirmation attached')).toHaveLength(1);
    expect(mockProofs).toHaveBeenCalledTimes(1);
    expect(mockProofs).toHaveBeenCalledWith('c1', 'h1');
  });

  it('leaves out a confirmation that was rejected, one whose files were removed, and a closed pledge with none', async () => {
    mockProofs.mockResolvedValue([
      proof({ id: 'pr2', status: 'rejected' }),
      proof({ id: 'pr3', covered: [{ pledge_id: 'picnic', pledge_number: 'P-0398', title: 'Summer picnic', amount_cents: 6000, pledge_amount_cents: 6000, state: 'converted' }], files: [{ id: 'f2', storage_path: 'c1/h1/pr3/a.jpg', content_type: 'image/jpeg', bytes: 1000, removed: true, created_at: null }] }),
    ]);
    const tree = await open();
    await press(tree, 'Closed');
    expect(texts(tree)).not.toContain('Confirmation attached');
  });

  it('is not asked for when Payment confirmations is off', async () => {
    mockModules.giving_proofs = false;
    const tree = await open();
    await press(tree, 'Closed');
    expect(mockProofs).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain('Confirmation attached');
  });

  it('says so, with a retry, when the confirmations cannot be loaded; the pledges still show', async () => {
    mockProofs.mockRejectedValueOnce(new AppError('Could not load your payment confirmations — try again.', 'boom'));
    const tree = await open();
    expect(texts(tree)).toContain('Could not load your payment confirmations — try again.');
    expect(hasButton(tree, 'Try again')).toBe(true);
    mockProofs.mockResolvedValue([proof({})]);
    await press(tree, 'Try again');
    await press(tree, 'Closed');
    expect(texts(tree)).toContain('Confirmation attached');
    expect(texts(tree)).toContain('Membership 2026');
  });
});

describe('"I paid another way" on Family pledges', () => {
  it('is there when confirmations are on and the community takes an offline way, and opens the sheet for the ticked pledges', async () => {
    const tree = await open();
    expect(hasButton(tree, 'I paid another way')).toBe(true);
    expect(hasButton(tree, 'My payment confirmations')).toBe(true);
    await press(tree, 'Select Fall food drive to pay, $100 open');
    await press(tree, 'I paid another way');
    const last = mockSheet.mock.calls[mockSheet.mock.calls.length - 1][0];
    expect(last).toMatchObject({ visible: true, entry: 'open_pledges', initialPledgeIds: ['food'], centerId: 'c1', householdId: 'h1' });
    // The sheet is given the pledges that still have something to pay, with their words.
    expect((last.pledges as { id: string; title: string }[]).map((p) => [p.id, p.title])).toEqual([['building', 'Building fund'], ['food', 'Fall food drive']]);
  });

  it('says why it is missing when the community takes no cash, check or bank transfer, in place of the button', async () => {
    mockSetup.value = null;
    mockSetup.reason = 'no_methods';
    const tree = await open();
    expect(hasButton(tree, 'I paid another way')).toBe(false);
    expect(hasText(tree, NOTE)).toBe(true);
  });

  it('is hidden, with no note, when confirmations are off, the rules could not be read, or it is still finding out', async () => {
    for (const reason of ['off', 'no_rules', 'loading'] as const) {
      mockSetup.value = null;
      mockSetup.reason = reason;
      const tree = await open();
      expect(hasButton(tree, 'I paid another way')).toBe(false);
      expect(hasText(tree, NOTE)).toBe(false);
    }
  });

  it('shows no note while the button is there', async () => {
    const tree = await open();
    expect(hasText(tree, NOTE)).toBe(false);
  });

  it('is hidden, and so is the note, when nothing is left to pay', async () => {
    const tree = await open([FAMILY[0], FAMILY[3]]);
    expect(hasButton(tree, 'I paid another way')).toBe(false);
    mockSetup.value = null;
    mockSetup.reason = 'no_methods';
    expect(hasText(await open([FAMILY[0], FAMILY[3]]), NOTE)).toBe(false);
  });

  it('offers "I paid another way" on the Pay sheet, to open the confirmation sheet, when a confirmation can be sent', async () => {
    const tree = await open();
    await press(tree, 'Select Fall food drive to pay, $100 open');
    await press(tree, 'Pay 1 pledge · $100');
    const req = mockStartPayment.mock.calls[0][0] as { alternative?: unknown; paidAnotherWay?: () => void };
    // The one road for "I paid another way" (the Pay sheet button, and "I sent it" under Zelle): not an alternative that only shows offline.
    expect(req.alternative).toBeUndefined();
    expect(typeof req.paidAnotherWay).toBe('function');
    await act(async () => {
      req.paidAnotherWay?.();
    });
    expect(mockSheet.mock.calls[mockSheet.mock.calls.length - 1][0]).toMatchObject({ visible: true, initialPledgeIds: ['food'] });
  });

  it('adds nothing to the Pay sheet when no confirmation can be sent', async () => {
    mockSetup.value = null;
    mockSetup.reason = 'no_methods';
    const tree = await open();
    await press(tree, 'Select Fall food drive to pay, $100 open');
    await press(tree, 'Pay 1 pledge · $100');
    expect((mockStartPayment.mock.calls[0][0] as { paidAnotherWay?: unknown }).paidAnotherWay).toBeUndefined();
  });

  it('links to My payment confirmations only while the Payment confirmations add-on is on', async () => {
    mockModules.giving_proofs = false;
    const tree = await open();
    expect(hasButton(tree, 'My payment confirmations')).toBe(false);
  });

  it('asks a child to ask a parent, with no sheet and no figures', async () => {
    const tree = await open(FAMILY, false);
    expect(hasButton(tree, 'I paid another way')).toBe(false);
    expect(hasText(tree, 'Soft credit')).toBe(false);
  });
});
