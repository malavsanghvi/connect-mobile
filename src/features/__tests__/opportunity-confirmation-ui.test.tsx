import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import OpportunityScreen from '@/app/(app)/opportunity/[id]';
import { runSteps as mockRunSteps } from '@/features/pay/steps';
import type { ProofSetup } from '@/features/pay/proof-setup';
import { en } from '@/i18n/en';
import { AppError } from '@/lib/errors';
import { formatCents } from '@/lib/format';
import { DEFAULT_POLICY } from '@/lib/proofs';
import { SettingsProvider } from '@/providers/settings';

type Job = { title: string; steps: { label: string; run?: () => Promise<void> }[]; result: () => string; cta: { label: string; onPress: () => void } };
type Request = { amountCents: number; forLabel: string; context: string; alternative?: { label: string; run: () => void }; paidAnotherWay?: () => void };

const mockGetOpportunity = jest.fn<(id: string) => Promise<Record<string, unknown>>>();
const mockAvailability = jest.fn<(id: string) => Promise<unknown[]>>();
const mockCreatePledge = jest.fn<(args: Record<string, unknown>) => Promise<{ id: string; pledge_number: string | null }>>();
const mockPledgesByIds = jest.fn<(ids: readonly string[]) => Promise<Record<string, unknown>[]>>();
const mockStartPayment = jest.fn<(req: Request) => Promise<unknown>>();
const mockSaved = jest.fn<(job: Job) => void>();
const mockSheet = jest.fn<(props: Record<string, unknown>) => void>();
const mockReplace = jest.fn();
const mockApp: { center: unknown; member: unknown } = { center: null, member: null };
const mockSetup: { value: ProofSetup | null } = { value: null };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: (to: string) => mockReplace(to), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'opp1' }),
}));
jest.mock('@/providers/app', () => ({ useApp: () => ({ ...mockApp, setGuest: () => undefined }) }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => undefined }) }));
jest.mock('@/providers/modules', () => ({ useModule: () => false }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/lib/api/giving', () => ({
  getOpportunity: (id: string) => mockGetOpportunity(id),
  opportunityAvailability: (id: string) => mockAvailability(id),
  createPledge: (args: Record<string, unknown>) => mockCreatePledge(args),
  createRecurringGift: jest.fn(),
  setRecurringMethod: jest.fn(),
  pledgeSourceFor: () => 'campaign',
  listPledgesByIds: (ids: readonly string[]) => mockPledgesByIds(ids),
}));
jest.mock('@/features/pay/proof-setup', () => ({ useProofSetup: () => ({ setup: mockSetup.value, reason: 'ok', error: null, reload: () => undefined }) }));
jest.mock('@/features/pay/proof-sheet', () => ({
  ProofSheet: (props: Record<string, unknown>) => {
    mockSheet(props);
    return null;
  },
}));
// The Saving screen as the real one behaves: the steps run in order, and Try again goes on from the step that failed (never from the start).
jest.mock('@/features/pay', () => ({
  startPayment: (req: Request) => mockStartPayment(req),
  runSaving: async (job: Job) => {
    mockSaved(job);
    let from = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await mockRunSteps(job.steps, from, () => undefined, 0);
      if (res.ok) {
        job.result();
        return { ok: true };
      }
      from = res.done;
    }
    return { ok: false, error: new Error('still failing') };
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
const OPP = {
  id: 'opp1',
  name: 'Diwali sponsorship',
  kind: 'fixed',
  status: 'open',
  amount_cents: 10100,
  options: null,
  campaign_id: null,
  campaign: null,
  description: null,
  allow_anonymous: true,
  allow_recurring: false,
  recurring_frequencies: null,
  quantity_available: null,
  quantity_taken: 0,
  min_amount_cents: null,
};
const PLEDGE_ROW = { id: 'pl1', pledge_number: 'P-0801', amount_cents: 10100, paid_cents: 0, soft_credit_cents: 0, status: 'open', pledged_at: '2026-10-16T10:00:00Z', created_at: '2026-10-16T10:00:00Z', closed_at: null };

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>
          <OpportunityScreen />
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
const press = async (tree: ReactTestRenderer, label: string): Promise<void> => {
  const hit = pressables(tree, label)[0];
  if (!hit) throw new Error(`nothing to press called "${label}"`);
  await act(async () => {
    hit.props.onPress();
  });
};
const lastSheet = (): Record<string, unknown> => mockSheet.mock.calls[mockSheet.mock.calls.length - 1][0];
const PAY_NOW = en['opp.payNow'].replace('{amount}', formatCents(10100));

/** Taps Pay and hands back what the Pay sheet was asked to show. */
async function payRequest(tree: ReactTestRenderer): Promise<Request> {
  await press(tree, PAY_NOW);
  return mockStartPayment.mock.calls[0][0];
}

beforeEach(() => {
  for (const m of [mockGetOpportunity, mockAvailability, mockCreatePledge, mockPledgesByIds, mockStartPayment, mockSaved, mockSheet, mockReplace]) m.mockReset();
  mockGetOpportunity.mockResolvedValue(OPP);
  mockAvailability.mockResolvedValue([]);
  mockCreatePledge.mockResolvedValue({ id: 'pl1', pledge_number: 'P-0801' });
  mockPledgesByIds.mockResolvedValue([PLEDGE_ROW]);
  mockStartPayment.mockResolvedValue({ status: 'alternative' });
  mockApp.center = { id: 'c1', name: 'Riverbend Center', short_name: 'Riverbend', time_zone: 'America/Chicago' };
  mockApp.member = { isAdult: true, userId: 'u1', today: '2026-10-16', household: { id: 'h1', display_name: 'Shah family' }, person: { id: 'p1' }, members: [] };
  mockSetup.value = { methods: ['zelle', 'check', 'cash'], policy: DEFAULT_POLICY };
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Giving > opportunity > Pay > "I paid another way"', () => {
  it('is offered on the Pay sheet next to "Commit as a pledge instead" when a confirmation can be sent', async () => {
    const req = await payRequest(await open());
    expect(req.alternative?.label).toBe(`Commit ${formatCents(10100)} as a pledge instead`);
    expect(typeof req.paidAnotherWay).toBe('function');
  });

  it('is left off the Pay sheet when no confirmation can be sent (module off, no ways accepted, a child)', async () => {
    mockSetup.value = null;
    const req = await payRequest(await open());
    expect(req.paidAnotherWay).toBeUndefined();
    expect(req.alternative).toBeDefined();
  });

  it('saves the pledge once, then opens the same confirmation form bound to that pledge with the amount locked', async () => {
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.paidAnotherWay?.();
    });
    expect(mockCreatePledge).toHaveBeenCalledTimes(1);
    expect(mockCreatePledge).toHaveBeenCalledWith(expect.objectContaining({ centerId: 'c1', householdId: 'h1', amountCents: 10100, opportunityId: 'opp1' }));
    // The Saving screen says the pledge is saved and what comes next; it never says "paid".
    const job = mockSaved.mock.calls[0][0];
    expect(job.cta.label).toBe('Add my confirmation');
    expect(job.result()).toBe('Pledge P-0801 for $101 is saved. Next you add your payment confirmation.');
    expect(texts(tree)).toContain('Your pledge is saved');
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'opportunity', entryRef: 'opp1', lockedPledgeId: 'pl1', centerId: 'c1', householdId: 'h1', today: '2026-10-16' });
    expect(lastSheet().initialPledgeIds).toBeUndefined();
    expect((lastSheet().pledges as { id: string; title: string; number: string }[]).map((p) => [p.id, p.number, p.title])).toEqual([['pl1', 'P-0801', 'Diwali sponsorship']]);
  });

  it('is told apart from "Commit as a pledge instead": that one never opens the confirmation form', async () => {
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.alternative?.run();
    });
    expect(mockCreatePledge).toHaveBeenCalledTimes(1);
    expect(mockSaved.mock.calls[0][0].cta.label).toBe('See family pledges');
    expect(mockSheet).not.toHaveBeenCalled();
  });

  it('keeps the saved pledge when the form cannot be opened, says so in words, and Try again asks for the same pledge', async () => {
    mockPledgesByIds.mockRejectedValueOnce(new AppError('We could not load your pledge — please try again.', 'boom'));
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.paidAnotherWay?.();
    });
    expect(mockSheet).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('We could not load your pledge — please try again.');
    expect(texts(tree).some((t) => t.startsWith('If you leave now, pledge P-0801 stays in Family pledges'))).toBe(true);
    await press(tree, 'Try again');
    expect(mockCreatePledge).toHaveBeenCalledTimes(1);
    expect(mockPledgesByIds).toHaveBeenLastCalledWith(['pl1']);
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'opportunity', lockedPledgeId: 'pl1' });
  });

  it('says so when the pledge is no longer there, and makes no second pledge', async () => {
    mockPledgesByIds.mockResolvedValueOnce([]);
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.paidAnotherWay?.();
    });
    expect(texts(tree).some((t) => t.startsWith("We couldn't find the pledge you just saved."))).toBe(true);
    await press(tree, 'Try again');
    expect(mockCreatePledge).toHaveBeenCalledTimes(1);
    expect(lastSheet()).toMatchObject({ visible: true, lockedPledgeId: 'pl1' });
  });

  it('lets the form be closed and opened again, and a send that fails or is closed never makes a second pledge', async () => {
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.paidAnotherWay?.();
    });
    await act(async () => {
      (lastSheet().onClose as () => void)();
    });
    expect(lastSheet().visible).toBe(false);
    await press(tree, 'Add my confirmation');
    expect(lastSheet().visible).toBe(true);
    expect(mockCreatePledge).toHaveBeenCalledTimes(1);
    expect(mockPledgesByIds).toHaveBeenCalledTimes(1);
  });

  it('says the confirmation is with the treasury team once it is sent, and Done goes to Family pledges', async () => {
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.paidAnotherWay?.();
    });
    await act(async () => {
      (lastSheet().onSent as () => void)();
    });
    expect(texts(tree)).toContain('Your confirmation is with the treasury team. Your pledge shows Soft credit until they have checked it.');
    await press(tree, 'Done');
    expect(mockReplace).toHaveBeenCalledWith('/pledges');
  });

  it('leaves for later on Family pledges, where the saved pledge has "I paid another way" too', async () => {
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.paidAnotherWay?.();
    });
    await press(tree, 'Add it later');
    expect(mockReplace).toHaveBeenCalledWith('/pledges');
  });

  it('goes the way of Open pledges, with exactly the new pledges chosen, when several pledges were saved (one pledge per pujan)', async () => {
    mockGetOpportunity.mockResolvedValue({
      ...OPP,
      kind: 'multi',
      amount_cents: null,
      options: [
        { key: 'a', label: 'Puja A', amount_cents: 5100 },
        { key: 'b', label: 'Puja B', amount_cents: 2100 },
      ],
    });
    mockCreatePledge.mockResolvedValueOnce({ id: 'pl1', pledge_number: 'P-0801' }).mockResolvedValueOnce({ id: 'pl2', pledge_number: 'P-0802' });
    mockPledgesByIds.mockResolvedValue([PLEDGE_ROW, { ...PLEDGE_ROW, id: 'pl2', pledge_number: 'P-0802', amount_cents: 2100 }]);
    const tree = await open();
    await press(tree, `Puja A. ${en['opp.fixedBoli']}. ${formatCents(5100)}`);
    await press(tree, `Puja B. ${en['opp.fixedBoli']}. ${formatCents(2100)}`);
    await press(tree, en['opp.payNow'].replace('{amount}', formatCents(7200)));
    const req = mockStartPayment.mock.calls[0][0];
    await act(async () => {
      req.paidAnotherWay?.();
    });
    expect(mockCreatePledge).toHaveBeenCalledTimes(2);
    expect(mockPledgesByIds).toHaveBeenCalledWith(['pl1', 'pl2']);
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'open_pledges', initialPledgeIds: ['pl1', 'pl2'] });
    expect(lastSheet().lockedPledgeId).toBeUndefined();
    expect(lastSheet().entryRef).toBeUndefined();
    expect(texts(tree).some((t) => t.includes('saved as pledge P-0801, P-0802'))).toBe(true);
  });

  it('saves nothing when the pledge itself could not be saved: the form never opens and the opportunity stays', async () => {
    mockCreatePledge.mockRejectedValue(new AppError('Could not save your pledge — please try again.', 'boom'));
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.paidAnotherWay?.();
    });
    expect(mockSheet).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain('Your pledge is saved');
    expect(pressables(tree, PAY_NOW).length).toBe(1);
  });
});
