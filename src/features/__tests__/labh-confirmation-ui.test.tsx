import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import LabhScreen from '@/app/(app)/labh/[dayId]';
import { runSteps as mockRunSteps } from '@/features/pay/steps';
import type { ProofSetup } from '@/features/pay/proof-setup';
import { en } from '@/i18n/en';
import { AppError } from '@/lib/errors';
import { formatCents } from '@/lib/format';
import { DEFAULT_POLICY } from '@/lib/proofs';
import { SettingsProvider } from '@/providers/settings';

type Job = { title: string; steps: { label: string; run?: () => Promise<void> }[]; result: () => string; cta: { label: string; onPress: () => void } };
type Request = { amountCents: number; forLabel: string; context: string; alternative?: { label: string; run: () => void }; paidAnotherWay?: () => void };

const mockLoadLabh = jest.fn<(centerId: string, dayId: string) => Promise<Record<string, unknown>>>();
const mockCommitLabh = jest.fn<(args: Record<string, unknown>) => Promise<string[]>>();
const mockByNumbers = jest.fn<(householdId: string, numbers: readonly string[]) => Promise<Record<string, unknown>[]>>();
const mockPledgesByIds = jest.fn<(ids: readonly string[]) => Promise<Record<string, unknown>[]>>();
const mockStartPayment = jest.fn<(req: Request) => Promise<unknown>>();
const mockSaved = jest.fn<(job: Job) => void>();
const mockSheet = jest.fn<(props: Record<string, unknown>) => void>();
const mockDismissTo = jest.fn();
const mockApp: { center: unknown; member: unknown } = { center: null, member: null };
const mockSetup: { value: ProofSetup | null } = { value: null };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), dismissTo: (to: string) => mockDismissTo(to) }),
  useLocalSearchParams: () => ({ dayId: 'day1' }),
}));
jest.mock('@/providers/app', () => ({ useApp: () => ({ ...mockApp, setGuest: () => undefined }) }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => undefined }) }));
jest.mock('@/providers/modules', () => ({ useModule: () => false }));
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/lib/api/family', () => ({ nextTithiDates: async () => ({}) }));
jest.mock('@/lib/api/giving', () => ({
  loadLabh: (centerId: string, dayId: string) => mockLoadLabh(centerId, dayId),
  commitLabh: (args: Record<string, unknown>) => mockCommitLabh(args),
  pledgesByNumbers: (householdId: string, numbers: readonly string[]) => mockByNumbers(householdId, numbers),
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
const DAY = { id: 'day1', kind: 'birthday', person_id: 'p2', label: null, calendar_date: '2026-11-03', tithi: null, tithi_month: null, reminder_days_before: 7 };
const OPTIONS = [
  { id: 'o1', name: 'Jeev daya', purpose: null, amount_cents: 5100 },
  { id: 'o2', name: 'Anna daan', purpose: null, amount_cents: 2100 },
];
const ROW = { id: 'pl9', pledge_number: 'P-0900', amount_cents: 5100, paid_cents: 0, soft_credit_cents: 0, status: 'open', pledged_at: '2026-10-16T10:00:00Z', created_at: '2026-10-16T10:00:00Z', closed_at: null };

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>
          <LabhScreen />
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
const payLabel = (cents: number): string => en['opp.payNow'].replace('{amount}', formatCents(cents));

/** Picks the first labh and taps Pay; hands back what the Pay sheet was asked to show. */
async function payRequest(tree: ReactTestRenderer, picks: { label: string; cents: number }[] = [{ label: 'Jeev daya', cents: 5100 }]): Promise<Request> {
  for (const p of picks) await press(tree, `${p.label}. ${formatCents(p.cents)}`);
  await press(tree, payLabel(picks.reduce((s, p) => s + p.cents, 0)));
  return mockStartPayment.mock.calls[0][0];
}

beforeEach(() => {
  for (const m of [mockLoadLabh, mockCommitLabh, mockByNumbers, mockPledgesByIds, mockStartPayment, mockSaved, mockSheet, mockDismissTo]) m.mockReset();
  mockLoadLabh.mockResolvedValue({ day: DAY, options: OPTIONS, next: '2026-11-03', tithi: null });
  mockCommitLabh.mockResolvedValue(['P-0900']);
  mockByNumbers.mockResolvedValue([ROW]);
  mockPledgesByIds.mockResolvedValue([ROW]);
  mockStartPayment.mockResolvedValue({ status: 'alternative' });
  mockApp.center = { id: 'c1', name: 'Riverbend Center', short_name: 'Riverbend', time_zone: 'America/Chicago' };
  mockApp.member = {
    isAdult: true,
    userId: 'u1',
    today: '2026-10-16',
    household: { id: 'h1', display_name: 'Shah family' },
    person: { id: 'p1' },
    members: [{ person: { id: 'p2', first_name: 'Riya', preferred_name: null, last_name: 'Shah', date_of_birth: '2018-11-03', gender: 'female' } }],
  };
  mockSetup.value = { methods: ['zelle', 'check', 'cash'], policy: DEFAULT_POLICY };
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Special days > labh > Pay > "I paid another way"', () => {
  it('is offered on the Pay sheet next to "Commit as a pledge instead" when a confirmation can be sent, and left off when it cannot', async () => {
    const req = await payRequest(await open());
    expect(req.alternative?.label).toBe(`Commit ${formatCents(5100)} as a pledge instead`);
    expect(typeof req.paidAnotherWay).toBe('function');
    mockStartPayment.mockClear();
    mockSetup.value = null;
    const off = await payRequest(await open());
    expect(off.paidAnotherWay).toBeUndefined();
  });

  it('saves the labh once, finds its pledge, and opens the same confirmation form bound to it with the amount locked', async () => {
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.paidAnotherWay?.();
    });
    expect(mockCommitLabh).toHaveBeenCalledTimes(1);
    expect(mockCommitLabh).toHaveBeenCalledWith(expect.objectContaining({ dayId: 'day1', optionIds: ['o1'] }));
    expect(mockByNumbers).toHaveBeenCalledTimes(1);
    expect(mockByNumbers).toHaveBeenCalledWith('h1', ['P-0900']);
    const job = mockSaved.mock.calls[0][0];
    expect(job.cta.label).toBe('Add my confirmation');
    expect(job.steps.map((s) => s.label)).toContain('Getting your pledge ready for your payment confirmation');
    expect(job.result()).toBe('Pledge P-0900 for $51 is saved. Next you add your payment confirmation.');
    expect(texts(tree)).toContain('Your pledge is saved');
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'labh', entryRef: 'day1', lockedPledgeId: 'pl9', centerId: 'c1', householdId: 'h1', today: '2026-10-16' });
    expect(lastSheet().initialPledgeIds).toBeUndefined();
  });

  it('never saves the labh twice: when finding the pledge fails, Try again goes on from that step', async () => {
    mockByNumbers.mockRejectedValueOnce(new AppError('We could not load your pledge — please try again.', 'boom'));
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.paidAnotherWay?.();
    });
    expect(mockCommitLabh).toHaveBeenCalledTimes(1);
    expect(mockByNumbers).toHaveBeenCalledTimes(2);
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'labh', lockedPledgeId: 'pl9' });
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
    expect(texts(tree).some((t) => t.startsWith('If you leave now, pledge P-0900 stays in Family pledges'))).toBe(true);
    await press(tree, 'Try again');
    expect(mockCommitLabh).toHaveBeenCalledTimes(1);
    expect(mockPledgesByIds).toHaveBeenLastCalledWith(['pl9']);
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'labh', lockedPledgeId: 'pl9' });
    await press(tree, 'Add it later');
    expect(mockDismissTo).toHaveBeenCalledWith('/special-days');
  });

  it('goes the way of Open pledges, with exactly the new pledges chosen, when two labh were saved', async () => {
    mockCommitLabh.mockResolvedValue(['P-0900', 'P-0901']);
    const second = { ...ROW, id: 'pl10', pledge_number: 'P-0901', amount_cents: 2100 };
    mockByNumbers.mockResolvedValue([ROW, second]);
    mockPledgesByIds.mockResolvedValue([ROW, second]);
    const tree = await open();
    const req = await payRequest(tree, [
      { label: 'Jeev daya', cents: 5100 },
      { label: 'Anna daan', cents: 2100 },
    ]);
    await act(async () => {
      req.paidAnotherWay?.();
    });
    expect(mockCommitLabh).toHaveBeenCalledTimes(1);
    expect(lastSheet()).toMatchObject({ visible: true, entry: 'open_pledges', initialPledgeIds: ['pl9', 'pl10'] });
    expect(lastSheet().lockedPledgeId).toBeUndefined();
  });

  it('is told apart from "Commit as a pledge instead": that one finds no pledge and never opens the form', async () => {
    const tree = await open();
    const req = await payRequest(tree);
    await act(async () => {
      req.alternative?.run();
    });
    expect(mockCommitLabh).toHaveBeenCalledTimes(1);
    expect(mockByNumbers).not.toHaveBeenCalled();
    expect(mockSaved.mock.calls[0][0].cta.label).toBe('Back to special days');
    expect(mockSheet).not.toHaveBeenCalled();
  });
});
