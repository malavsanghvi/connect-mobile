import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import GiveScreen from '@/app/(app)/(tabs)/give';
import { en } from '@/i18n/en';
import { formatCents } from '@/lib/format';
import { parseMemberMethods, type PaymentMethods } from '@/features/pay/methods';
import type { ProofSetup } from '@/features/pay/proof-setup';
import { DEFAULT_POLICY } from '@/lib/proofs';
import { SettingsProvider } from '@/providers/settings';

type Request = { amountCents: number; context: string; paidAnotherWay?: () => void };

const mockPush = jest.fn();
const mockStartPayment = jest.fn<(req: Request) => Promise<unknown>>();
const mockSheet = jest.fn<(props: Record<string, unknown>) => void>();
const mockMethods: { value: PaymentMethods | null } = { value: null };
const mockPledges: { value: Record<string, unknown>[] } = { value: [] };
const mockApp: { center: unknown; member: unknown } = { center: null, member: null };
const mockSetup: { value: ProofSetup | null } = { value: null };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: (to: unknown) => mockPush(to), navigate: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/providers/app', () => ({ useApp: () => ({ ...mockApp, setGuest: () => undefined }) }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => undefined }) }));
jest.mock('@/providers/modules', () => ({ useModules: () => ({ map: {} }), useModule: () => true }));
jest.mock('@/providers/feedback', () => ({ useFeedback: () => ({ toast: jest.fn(), confirm: jest.fn() }) }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/lib/api/bolis', () => ({ listBolis: async () => [], isBoliOpen: () => false }));
jest.mock('@/lib/api/payments', () => ({ loadPaymentMethods: async () => mockMethods.value, listPaymentReports: async () => ({ reports: [] }) }));
jest.mock('@/lib/api/giving', () => ({
  listOpportunitiesWithAvailability: async () => [],
  loadGiveSummary: async () => ({ year: 2026, givenThisYearCents: 0, openCount: mockPledges.value.length, openCents: 15000, paidThisYearCents: 0, recurringActive: 0, recurringTotal: 0, recurringYearlyCents: 0 }),
  listOpenPledges: async () => mockPledges.value,
}));
jest.mock('@/features/pay', () => ({ startPayment: (req: Request) => mockStartPayment(req) }));
jest.mock('@/features/pay/proof-setup', () => ({ useProofSetup: () => ({ setup: mockSetup.value, reason: 'ok', error: null, reload: () => undefined }) }));
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

const PAY_OPEN = en['give.payOpen'].replace('{amount}', formatCents(15000));
const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const PLEDGES = [
  { id: 'a', pledge_number: 'P-0100', amount_cents: 10000, paid_cents: 0, soft_credit_cents: 0, status: 'open', pledged_at: '2026-09-01T10:00:00Z', created_at: '2026-09-01T10:00:00Z', closed_at: null },
  { id: 'b', pledge_number: 'P-0200', amount_cents: 5000, paid_cents: 0, soft_credit_cents: 0, status: 'open', pledged_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T10:00:00Z', closed_at: null },
];

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>
          <GiveScreen />
        </SettingsProvider>
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
const isPressable = (n: ReactTestInstance): boolean => typeof n.props.onPress === 'function' && typeof n.props.accessibilityRole === 'string';
const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll((n) => isPressable(n) && (n.props.accessibilityLabel === label || (n.props.accessibilityLabel === undefined && n.findAllByType(Text).some((x) => flat(x) === label))));
const lastSheet = (): Record<string, unknown> => mockSheet.mock.calls[mockSheet.mock.calls.length - 1][0];

beforeEach(() => {
  for (const m of [mockPush, mockStartPayment, mockSheet]) m.mockReset();
  mockStartPayment.mockResolvedValue({ status: 'alternative' });
  mockApp.center = { id: 'c1', name: 'Riverbend Center', short_name: 'Riverbend', time_zone: 'America/Chicago' };
  mockApp.member = { isAdult: true, userId: 'u1', today: '2026-10-16', household: { id: 'h1', display_name: 'Shah family' }, person: { id: 'p1' }, members: [] };
  mockSetup.value = { methods: ['zelle', 'check', 'cash'], policy: DEFAULT_POLICY };
  mockPledges.value = PLEDGES;
  mockMethods.value = parseMemberMethods({
    environment: 'production',
    online_unavailable: 'offline_only',
    methods: [{ key: 'zelle', family: 'reported_transfer', label: 'Zelle', instructions: { recipient: 'treasurer@example.org', name: 'Riverbend Center' }, report: { available: true, window_days: 10 } }],
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Give tab: "I paid another way"', () => {
  it('Pay open balance offers it on the Pay sheet, and it opens the same confirmation form for all open pledges', async () => {
    const tree = await open();
    await act(async () => {
      pressables(tree, PAY_OPEN)[0]?.props.onPress();
    });
    const req = mockStartPayment.mock.calls[0][0];
    expect(typeof req.paidAnotherWay).toBe('function');
    await act(async () => {
      req.paidAnotherWay?.();
    });
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'open_pledges', centerId: 'c1', householdId: 'h1', today: '2026-10-16' });
    expect((lastSheet().pledges as { id: string; number: string }[]).map((p) => [p.id, p.number])).toEqual([
      ['a', 'P-0100'],
      ['b', 'P-0200'],
    ]);
  });

  it('How to give shows the same "I paid another way" under Zelle, and never the old "I sent it" report road', async () => {
    const tree = await open();
    expect(texts(tree).some((t) => /I sent it|Report a test payment|I sent a Zelle/.test(t))).toBe(false);
    const buttons = pressables(tree, 'I paid another way');
    expect(buttons).toHaveLength(1);
    // The button guards a double tap with a timer; a fake one leaves nothing running when the test ends.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    await act(async () => {
      buttons[0].props.onPress();
    });
    jest.useRealTimers();
    expect(mockPush).not.toHaveBeenCalled();
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'open_pledges' });
  });

  it('offers nothing to open when no confirmation can be sent, and the Pay sheet gets no such button', async () => {
    mockSetup.value = null;
    const tree = await open();
    expect(pressables(tree, 'I paid another way')).toHaveLength(0);
    await act(async () => {
      pressables(tree, PAY_OPEN)[0]?.props.onPress();
    });
    expect(mockStartPayment.mock.calls[0][0].paidAnotherWay).toBeUndefined();
    expect(mockSheet).not.toHaveBeenCalled();
  });

  it('has nothing to confirm when no pledge is open', async () => {
    mockPledges.value = [];
    const tree = await open();
    expect(pressables(tree, 'I paid another way')).toHaveLength(0);
  });
});
