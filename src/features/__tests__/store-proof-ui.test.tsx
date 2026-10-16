import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect, type ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import CartScreen from '@/app/(app)/cart';
import type { ProofSetup } from '@/features/pay/proof-setup';
import { en } from '@/i18n/en';
import type { PlacedOrder } from '@/lib/api/store';
import { AppError } from '@/lib/errors';
import { DEFAULT_POLICY } from '@/lib/proofs';
import { CartProvider, useCart } from '@/providers/cart';
import { SettingsProvider } from '@/providers/settings';

type Job = { title: string; steps: { label: string; run?: () => Promise<void> }[]; result: () => string; cta: { label: string; onPress: () => void } };

const mockWindows = jest.fn<() => Promise<unknown[]>>();
const mockStartOrder = jest.fn<(args: Record<string, unknown>) => Promise<PlacedOrder>>();
const mockSubmitOrder = jest.fn<(order: PlacedOrder) => Promise<void>>();
const mockPledgeFor = jest.fn<(orderId: string) => Promise<string>>();
const mockGetPledge = jest.fn<(id: string) => Promise<Record<string, unknown> | null>>();
const mockStartPayment = jest.fn<(req: Record<string, unknown>) => Promise<unknown>>();
const mockSaved = jest.fn<(job: Job) => void>();
const mockSheet = jest.fn<(props: Record<string, unknown>) => void>();
const mockDismissTo = jest.fn();
const mockApp: { center: unknown; member: unknown } = { center: null, member: null };
const mockSetup: { value: ProofSetup | null } = { value: null };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), dismissTo: (to: string) => mockDismissTo(to) }) }));
jest.mock('@/providers/app', () => ({ useApp: () => ({ ...mockApp, setGuest: () => undefined }) }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => undefined }) }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/lib/api/store', () => ({
  giftPackCents: () => null,
  listPickupWindows: () => mockWindows(),
  startOrder: (args: Record<string, unknown>) => mockStartOrder(args),
  submitOrder: (order: PlacedOrder) => mockSubmitOrder(order),
  storeOrderPledge: (orderId: string) => mockPledgeFor(orderId),
}));
jest.mock('@/lib/api/events', () => ({ getPledgeById: (id: string) => mockGetPledge(id) }));
jest.mock('@/features/pay/proof-setup', () => ({ useProofSetup: () => ({ setup: mockSetup.value, error: null, reload: () => undefined }) }));
jest.mock('@/features/pay/proof-sheet', () => ({
  ProofSheet: (props: Record<string, unknown>) => {
    mockSheet(props);
    return null;
  },
}));
// The Saving screen, as the real one behaves: the steps run in order and the run stops at the first failure (the member then closes the
// screen); after a good run the member taps the final button.
jest.mock('@/features/pay', () => ({
  startPayment: (req: Record<string, unknown>) => mockStartPayment(req),
  runSaving: async (job: Job) => {
    mockSaved(job);
    for (const step of job.steps) {
      try {
        await step.run?.();
      } catch (error) {
        return { ok: false, error };
      }
    }
    job.result();
    return { ok: true };
  },
}));
jest.mock('@/components/screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => createElement(View, null, children) };
});

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const WINDOW = { id: 'w1', center_id: 'c1', starts_at: '2026-10-18T16:00:00Z', ends_at: '2026-10-18T18:00:00Z', status: 'open', capacity: null, orders_count: 0 };
const ORDER: PlacedOrder = { id: 'o1', orderNumber: 'S-0042', totalCents: 4250 };
const PLEDGE_ROW = { id: 'pl1', pledge_number: 'P-0700', amount_cents: 4250, paid_cents: 0, soft_credit_cents: 0, status: 'open', pledged_at: '2026-10-16T10:00:00Z', created_at: '2026-10-16T10:00:00Z', closed_at: null };

// Hands the cart to the test, so it can put two shawls in it.
const cartHandle: { current: ReturnType<typeof useCart> | null } = { current: null };
function Grab() {
  const cart = useCart();
  useEffect(() => {
    cartHandle.current = cart;
  });
  return null;
}

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>
          <CartProvider>
            <Grab />
            <CartScreen />
          </CartProvider>
        </SettingsProvider>
      </SafeAreaProvider>,
    );
  });
  await act(async () => {
    cartHandle.current?.setQty({ id: 'shawl', name: 'Handloom shawl', price_cents: 2125 }, 2);
  });
  return tree;
}

const flat = (node: ReactTestInstance): string =>
  [node.props.children]
    .flat(Infinity)
    .map((c: unknown) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');
const texts = (tree: ReactTestRenderer): string[] => tree.root.findAllByType(Text).map(flat).filter(Boolean);
const mentions = (tree: ReactTestRenderer, re: RegExp): boolean => texts(tree).some((t) => re.test(t));
const isPressable = (n: ReactTestInstance): boolean => typeof n.props.onPress === 'function' && typeof n.props.accessibilityRole === 'string';
const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll((n) => isPressable(n) && (n.props.accessibilityLabel === label || (n.props.accessibilityLabel === undefined && n.findAllByType(Text).some((x) => flat(x) === label))));
const hasButton = (tree: ReactTestRenderer, label: string): boolean => pressables(tree, label).length > 0;
const press = async (tree: ReactTestRenderer, label: string): Promise<void> => {
  const hit = pressables(tree, label)[0];
  if (!hit) throw new Error(`nothing to press called "${label}"`);
  await act(async () => {
    hit.props.onPress();
  });
};
const lastSheet = (): Record<string, unknown> => mockSheet.mock.calls[mockSheet.mock.calls.length - 1][0];

const PAID = 'I already paid another way';
const HELD = 'Your order is held. It is released for pickup once the treasury team has checked your proof.';

beforeEach(() => {
  for (const m of [mockWindows, mockStartOrder, mockSubmitOrder, mockPledgeFor, mockGetPledge, mockStartPayment, mockSaved, mockSheet, mockDismissTo]) m.mockReset();
  mockWindows.mockResolvedValue([WINDOW]);
  mockStartOrder.mockResolvedValue(ORDER);
  mockSubmitOrder.mockResolvedValue(undefined);
  mockPledgeFor.mockResolvedValue('pl1');
  mockStartPayment.mockResolvedValue({ status: 'alternative' });
  mockGetPledge.mockResolvedValue(PLEDGE_ROW);
  mockApp.center = { id: 'c1', name: 'Riverbend Center', short_name: 'Riverbend', time_zone: 'America/Chicago', rules: null };
  mockApp.member = { isAdult: true, today: '2026-10-16', household: { id: 'h1' }, person: { id: 'p1', last_name: 'Shah' }, members: [] };
  mockSetup.value = { methods: ['check', 'cash'], policy: DEFAULT_POLICY };
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('"I already paid another way" at store checkout', () => {
  it('sits next to the pay button, with the held-order words, when proofs are on and an offline way is taken', async () => {
    const tree = await open();
    expect(hasButton(tree, PAID)).toBe(true);
    expect(hasButton(tree, 'Pay $42.50')).toBe(true);
    expect(texts(tree)).toContain(HELD);
  });

  it('is hidden, not disabled, when proofs are off or the community takes no offline way', async () => {
    mockSetup.value = null;
    const tree = await open();
    expect(hasButton(tree, PAID)).toBe(false);
    expect(texts(tree)).not.toContain(HELD);
    expect(hasButton(tree, 'Pay $42.50')).toBe(true);
  });

  it('is not there for a child: the order screen asks them to ask a parent', async () => {
    mockApp.member = { isAdult: false, today: '2026-10-16', household: { id: 'h1' }, person: { id: 'p2', last_name: 'Shah' }, members: [] };
    const tree = await open();
    expect(hasButton(tree, PAID)).toBe(false);
  });

  it('places the order, gets its pledge, and opens the sheet bound to that pledge with the amount locked to the order total', async () => {
    const tree = await open();
    await press(tree, PAID);
    expect(mockStartOrder).toHaveBeenCalledTimes(1);
    expect(mockStartOrder).toHaveBeenCalledWith(expect.objectContaining({ centerId: 'c1', householdId: 'h1', pickupWindowId: 'w1' }));
    expect(mockSubmitOrder).toHaveBeenCalledWith(ORDER);
    expect(mockPledgeFor).toHaveBeenCalledWith('o1');
    // The saving screen says it was placed and held, never "pay at pickup".
    const job = mockSaved.mock.calls[0][0];
    expect(job.cta.label).toBe('Add my proof');
    expect(job.result()).toBe('Order S-0042 is placed and held. Next you send your proof of payment.');
    const sheet = lastSheet();
    expect(sheet).toMatchObject({ visible: true, entry: 'store', entryRef: 'o1', lockedPledgeId: 'pl1', centerId: 'c1', householdId: 'h1', today: '2026-10-16' });
    expect((sheet.pledges as { id: string; amount_cents: number; title: string }[]).map((p) => [p.id, p.amount_cents, p.title])).toEqual([['pl1', 4250, 'Store order S-0042']]);
    expect(texts(tree)).toContain('Order S-0042 is placed');
    expect(mentions(tree, /^Your order is held\. It is released for pickup once the treasury team has checked your proof\. Its pledge of \$42\.50/)).toBe(true);
  });

  it('is told apart from "pay at pickup": that one never asks for a pledge or a proof', async () => {
    const tree = await open();
    await press(tree, 'Pay $42.50');
    const req = mockStartPayment.mock.calls[0][0] as { alternative: { label: string; run: () => void } };
    expect(req.alternative.label).toBe('Place order · pay at pickup');
    await act(async () => {
      req.alternative.run();
    });
    expect(mockStartOrder).toHaveBeenCalledTimes(1);
    expect(mockPledgeFor).not.toHaveBeenCalled();
    expect(mockSheet).not.toHaveBeenCalled();
  });

  it('keeps the placed order when the pledge cannot be set up, says so in words, and Try again does not place a second order', async () => {
    mockPledgeFor.mockRejectedValueOnce(new AppError('Could not set up the payment proof for your order — please try again.', 'boom'));
    const tree = await open();
    await press(tree, PAID);
    expect(mockSheet).not.toHaveBeenCalled();
    expect(mentions(tree, /^Your order S-0042 is placed and held, but its payment proof could not be set up\. No second order was placed\. Could not set up the payment proof for your order — please try again\.$/)).toBe(true);
    await press(tree, 'Try again');
    expect(mockStartOrder).toHaveBeenCalledTimes(1);
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    expect(mockPledgeFor).toHaveBeenCalledTimes(2);
    expect(mockPledgeFor).toHaveBeenLastCalledWith('o1');
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'store', lockedPledgeId: 'pl1' });
    expect(texts(tree).some((t) => t.includes('could not be set up'))).toBe(false);
  });

  it('says so, with Try again, when the pledge was made but cannot be read; the retry asks for the same pledge', async () => {
    mockGetPledge.mockResolvedValueOnce(null);
    const tree = await open();
    await press(tree, PAID);
    expect(mentions(tree, /We couldn't find the pledge for your order/)).toBe(true);
    await press(tree, 'Try again');
    expect(mockStartOrder).toHaveBeenCalledTimes(1);
    expect(mockPledgeFor).toHaveBeenCalledTimes(1);
    expect(lastSheet()).toMatchObject({ visible: true, lockedPledgeId: 'pl1' });
  });

  it('lets the sheet be closed and opened again, leaves for later, and never places a second order', async () => {
    const tree = await open();
    await press(tree, PAID);
    await act(async () => {
      (lastSheet().onClose as () => void)();
    });
    expect(lastSheet().visible).toBe(false);
    await press(tree, 'Send my proof');
    expect(lastSheet().visible).toBe(true);
    expect(mockStartOrder).toHaveBeenCalledTimes(1);
    expect(mockPledgeFor).toHaveBeenCalledTimes(1);
    await press(tree, 'Send it later');
    expect(mockDismissTo).toHaveBeenCalledWith('/');
  });

  it('says the proof is with the treasury team once it is sent', async () => {
    const tree = await open();
    await press(tree, PAID);
    await act(async () => {
      (lastSheet().onSent as () => void)();
    });
    expect(texts(tree)).toContain('Your proof is with the treasury team. Your order is released for pickup once they have checked it.');
    await press(tree, 'Done');
    expect(mockDismissTo).toHaveBeenCalledWith('/');
  });

  it('places nothing and asks for no pledge when the order itself could not be placed; the cart stays', async () => {
    mockStartOrder.mockRejectedValueOnce(new AppError('Could not start your order — please try again.', 'boom'));
    const tree = await open();
    await press(tree, PAID);
    expect(mockPledgeFor).not.toHaveBeenCalled();
    expect(mockSheet).not.toHaveBeenCalled();
    expect(hasButton(tree, PAID)).toBe(true);
    expect(texts(tree)).toContain('Handloom shawl × 2');
  });

  it('needs a pickup time, like every other way of placing the order', async () => {
    mockWindows.mockResolvedValue([]);
    const tree = await open();
    expect(pressables(tree, PAID)[0].props.disabled).toBe(true);
    expect(mockStartOrder).not.toHaveBeenCalled();
  });
});

describe('The new store words', () => {
  it('have no exclamation marks and never say bid', () => {
    const keys = Object.keys(en).filter((k) => /^(store\.(paidOtherWay|proof|held|pledge|send)|proof\.(sendStore|storeNote)|pledges\.proofAttached)/.test(k)) as (keyof typeof en)[];
    expect(keys.length).toBeGreaterThanOrEqual(12);
    for (const k of keys) {
      expect(en[k]).not.toContain('!');
      expect(en[k].toLowerCase()).not.toMatch(/\bbid/);
    }
  });
});
