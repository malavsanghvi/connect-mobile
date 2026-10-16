import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import renderer, { act } from 'react-test-renderer';

import { decideProofSetup, useProofSetup } from '@/features/pay/proof-setup';
import { AppError } from '@/lib/errors';
import { DEFAULT_POLICY, type ProofPolicy } from '@/lib/proofs';

const mockMethods = jest.fn<(centerId: string) => Promise<unknown>>();
const mockPolicy = jest.fn<(centerId: string) => Promise<ProofPolicy | null>>();
const mockApp: { member: unknown; center: unknown } = { member: null, center: null };
const mockModules: Record<string, boolean> = {};

jest.mock('@/providers/app', () => ({ useApp: () => mockApp }));
jest.mock('@/providers/data-version', () => ({ useDataVersion: () => ({ version: 0, invalidate: () => undefined }) }));
jest.mock('@/providers/modules', () => ({ useModule: (key: string) => mockModules[key] ?? true }));
jest.mock('@/lib/api/payments', () => ({ loadPaymentMethods: (c: string) => mockMethods(c) }));
jest.mock('@/lib/api/proofs', () => ({ loadProofPolicy: (c: string) => mockPolicy(c) }));

type Seen = ReturnType<typeof useProofSetup>;
const seen: { current: Seen | null } = { current: null };
const record = (value: Seen): void => {
  seen.current = value;
};
function Probe() {
  record(useProofSetup());
  return null;
}
async function mount(): Promise<void> {
  await act(async () => {
    renderer.create(<Probe />);
  });
}

const check = { kind: 'instructions', method: 'check' };
const cardOnly = { kind: 'provider_checkout', provider: 'stripe' };

beforeEach(() => {
  seen.current = null;
  mockMethods.mockReset();
  mockPolicy.mockReset();
  mockMethods.mockResolvedValue({ methods: [check] });
  mockPolicy.mockResolvedValue(DEFAULT_POLICY);
  mockApp.member = { isAdult: true, household: { id: 'h1' } };
  mockApp.center = { id: 'c1' };
  for (const k of Object.keys(mockModules)) delete mockModules[k];
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('decideProofSetup', () => {
  it('is ok with at least one accepted way and the rules', () => {
    expect(decideProofSetup(['check', 'cash'], DEFAULT_POLICY)).toEqual({ setup: { methods: ['check', 'cash'], policy: DEFAULT_POLICY }, reason: 'ok' });
  });
  it('says no_methods when the community accepts no way a proof can be sent for', () => {
    expect(decideProofSetup([], DEFAULT_POLICY)).toEqual({ setup: null, reason: 'no_methods' });
  });
  it('says no_rules when the rules are missing, even with no methods (a treasurer turning one on would not help)', () => {
    expect(decideProofSetup(['check'], null)).toEqual({ setup: null, reason: 'no_rules' });
    expect(decideProofSetup([], null)).toEqual({ setup: null, reason: 'no_rules' });
  });
});

describe('useProofSetup reason', () => {
  it('is loading until the answer arrives, then ok with the setup', async () => {
    let release!: (v: unknown) => void;
    mockMethods.mockReturnValue(new Promise((r) => (release = r)));
    await mount();
    expect(seen.current).toMatchObject({ setup: null, reason: 'loading', error: null });
    await act(async () => release({ methods: [check] }));
    expect(seen.current).toMatchObject({ reason: 'ok', setup: { methods: ['check'] } });
  });

  it('is no_methods when the community takes only the card', async () => {
    mockMethods.mockResolvedValue({ methods: [cardOnly] });
    await mount();
    expect(seen.current).toMatchObject({ setup: null, reason: 'no_methods', error: null });
  });

  it('is no_rules when the portal has no proof rules', async () => {
    mockPolicy.mockResolvedValue(null);
    await mount();
    expect(seen.current).toMatchObject({ setup: null, reason: 'no_rules' });
  });

  it('is no_rules, with the error to show, when the rules could not be read', async () => {
    mockPolicy.mockRejectedValue(new AppError('Could not load the payment proof rules — please try again.', 'boom'));
    await mount();
    expect(seen.current?.setup).toBeNull();
    expect(seen.current?.reason).toBe('no_rules');
    expect(seen.current?.error?.userMessage).toBe('Could not load the payment proof rules — please try again.');
  });

  it('is off, and asks for nothing, when the Payment proofs module is off, the person is a child, or there is no household', async () => {
    mockModules.giving_proofs = false;
    await mount();
    expect(seen.current).toMatchObject({ setup: null, reason: 'off', error: null });
    delete mockModules.giving_proofs;
    mockApp.member = { isAdult: false, household: { id: 'h1' } };
    await mount();
    expect(seen.current?.reason).toBe('off');
    mockApp.member = { isAdult: true, household: null };
    await mount();
    expect(seen.current?.reason).toBe('off');
    expect(mockMethods).not.toHaveBeenCalled();
  });
});
