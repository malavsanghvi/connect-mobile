import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { payFees } from '@/features/pathshala/shared';

const mockStartPayment = jest.fn<(req: Record<string, unknown>) => Promise<unknown>>();
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));
jest.mock('@/features/pay', () => ({ startPayment: (req: Record<string, unknown>) => mockStartPayment(req) }));

beforeEach(() => {
  mockStartPayment.mockReset();
  mockStartPayment.mockResolvedValue({ status: 'cancelled' });
});

describe('Pathshala fees on the Pay sheet', () => {
  const base = { amountCents: 11700, pledgeIds: ['p1', 'p2'], forLabel: 'Pathshala fee 2026-27 · Riya, Dev', householdId: 'h2' };

  it('hands the Pay sheet the pledges, the household they belong to, and the context "pathshala"', async () => {
    await payFees(base);
    expect(mockStartPayment).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 11700, pledgeIds: ['p1', 'p2'], householdId: 'h2', context: 'pathshala' }));
  });

  it('passes "I paid another way" through, so the same confirmation form opens for the fee pledges', async () => {
    const open = jest.fn();
    await payFees({ ...base, paidAnotherWay: open });
    const req = mockStartPayment.mock.calls[0][0] as { paidAnotherWay?: () => void };
    expect(req.paidAnotherWay).toBe(open);
  });

  it('leaves it off when the screen cannot open the form, and keeps "Pay at the office instead" beside online payment', async () => {
    await payFees({ ...base, office: { label: 'Pay at the office instead', run: () => undefined } });
    const req = mockStartPayment.mock.calls[0][0] as { paidAnotherWay?: unknown; alternative?: { label: string; withOnline?: boolean } };
    expect(req.paidAnotherWay).toBeUndefined();
    expect(req.alternative).toMatchObject({ label: 'Pay at the office instead', withOnline: true });
  });
});
