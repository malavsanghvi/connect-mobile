import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { startPayment, type PaymentOutcome, type PaymentRequest } from '@/features/pay/controller';
import { PayHost } from '@/features/pay/host';
import { parseMemberMethods, type PaymentMethods } from '@/features/pay/methods';
import { SettingsProvider } from '@/providers/settings';

const mockPush = jest.fn();
const mockMethods: { value: PaymentMethods | null } = { value: null };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: (to: unknown) => mockPush(to), navigate: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/providers/app', () => ({ useApp: () => ({ center: { id: 'c1', name: 'Riverbend Center', short_name: 'Riverbend' }, member: { isAdult: true, today: '2026-10-16' } }) }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => undefined }) }));
jest.mock('@/providers/feedback', () => ({ useFeedback: () => ({ toast: jest.fn(), confirm: jest.fn() }) }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/lib/activity', () => ({ track: jest.fn(), errorCodeOf: () => 'x' }));
jest.mock('@/features/pay/online', () => ({ usePaymentMethods: () => ({ methods: mockMethods.value, error: null, loading: false }) }));

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/** Offline only (the community takes no card yet): Zelle and a check, in its order. */
function offlineMethods(): PaymentMethods {
  const parsed = parseMemberMethods({
    environment: 'production',
    online_unavailable: 'offline_only',
    methods: [
      { key: 'zelle', family: 'reported_transfer', label: 'Zelle', instructions: { recipient: 'treasurer@example.org', name: 'Riverbend Center' }, report: { available: true, window_days: 10 } },
      { key: 'check', family: 'instructions', method: 'check', instructions: { payee: 'Riverbend Center' } },
    ],
  });
  if (!parsed) throw new Error('fixture is not a payment methods answer');
  return parsed;
}

async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>
          <PayHost />
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

const REQUEST: PaymentRequest = { amountCents: 10100, forLabel: 'Diwali sponsorship', context: 'opportunity' };

let pending: Promise<PaymentOutcome> | null = null;
async function openSheet(tree: ReactTestRenderer, req: PaymentRequest): Promise<void> {
  await act(async () => {
    pending = startPayment(req);
  });
  expect(tree.root.findAllByType(Text).length).toBeGreaterThan(0);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockReset();
  mockMethods.value = offlineMethods();
  pending = null;
});
afterEach(() => {
  jest.useRealTimers();
});

describe('The Pay sheet and "I paid another way"', () => {
  it('shows one "I paid another way" and Zelle\'s own button is the same words: there is no "I sent it" that skips the confirmation', async () => {
    const tree = await mount();
    await openSheet(tree, { ...REQUEST, paidAnotherWay: () => undefined });
    // The sheet's button and the one under Zelle: the same label, the same road.
    expect(pressables(tree, 'I paid another way')).toHaveLength(2);
    expect(texts(tree).some((t) => /I sent it|Report a test payment|I sent a Zelle/.test(t))).toBe(false);
    expect(texts(tree).some((t) => /add your payment confirmation here/.test(t))).toBe(true);
  });

  it('closes the sheet and opens the confirmation form for what is being paid, once, even when tapped twice', async () => {
    const run = jest.fn();
    const tree = await mount();
    await openSheet(tree, { ...REQUEST, paidAnotherWay: run });
    const buttons = pressables(tree, 'I paid another way');
    await act(async () => {
      buttons[0].props.onPress();
      buttons[0].props.onPress();
    });
    await expect(pending).resolves.toEqual({ status: 'alternative' });
    expect(run).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(run).toHaveBeenCalledTimes(1);
    // Never the old report screen.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does the same from the button under Zelle', async () => {
    const run = jest.fn();
    const tree = await mount();
    await openSheet(tree, { ...REQUEST, paidAnotherWay: run });
    await act(async () => {
      pressables(tree, 'I paid another way')[1].props.onPress();
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('offers no such button, and no report road under Zelle, when the screen cannot open the form', async () => {
    const tree = await mount();
    await openSheet(tree, REQUEST);
    expect(pressables(tree, 'I paid another way')).toHaveLength(0);
    expect(texts(tree).some((t) => /I sent it|Report a test payment/.test(t))).toBe(false);
    // The instructions still show, so the member knows where to send it.
    expect(texts(tree)).toContain('treasurer@example.org');
  });

  it('keeps the office\'s alternative beside it ("Commit as a pledge instead")', async () => {
    const alternative = jest.fn();
    const tree = await mount();
    await openSheet(tree, { ...REQUEST, alternative: { label: 'Commit $101 as a pledge instead', run: alternative }, paidAnotherWay: () => undefined });
    expect(pressables(tree, 'Commit $101 as a pledge instead')).toHaveLength(1);
    expect(pressables(tree, 'I paid another way').length).toBeGreaterThan(0);
  });
});
