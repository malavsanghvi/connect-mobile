import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { listPaymentReports, isAdultsOnlyRefusal, loadPaymentMethods, reportZelle, startCheckout, withdrawZelleReport } from '../api/payments';
import { AppError } from '../errors';

const mockRpc = jest.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>();
const mockGetSession = jest.fn<() => Promise<{ data: { session: { access_token: string } | null } }>>();

jest.mock('../supabase', () => ({
  supabase: { rpc: (name: string, args: unknown) => mockRpc(name, args), auth: { getSession: () => mockGetSession() } },
}));
jest.mock('../env', () => ({ env: { portalUrl: 'https://portal.example' } }));

const missing = { code: 'PGRST202', message: 'Could not find the function app.member_payment_methods(p_center) in the schema cache' };

const methodsAnswer = {
  environment: 'production',
  currency: 'usd',
  online_unavailable: null,
  methods: [
    { key: 'card', family: 'provider_checkout', label: 'Card', provider: 'stripe', mode: 'live', wallets: ['apple_pay'], also: [], sort: 10 },
    { key: 'paypal', family: 'provider_checkout', label: 'PayPal', provider: 'paypal', mode: 'live', wallets: [], also: [], sort: 20 },
    { key: 'check', family: 'instructions', label: 'Check', method: 'check', instructions: { payee: 'JSH' }, sort: 40 },
  ],
};

const legacyAnswer = {
  online: { processor: 'stripe', mode: 'live', methods: ['card'] },
  online_unavailable: null,
  offline: [{ method: 'check', instructions: { payee: 'JSH' } }],
  environment: 'production',
};

let logSpy: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  mockRpc.mockReset();
  mockGetSession.mockReset();
  logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  logSpy.mockRestore();
});

describe('loading the ways to give', () => {
  it('asks for the new list and reads it', async () => {
    mockRpc.mockResolvedValueOnce({ data: methodsAnswer, error: null });
    const res = await loadPaymentMethods('center-1');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('member_payment_methods', { p_center: 'center-1' });
    expect(res.source).toBe('methods');
    expect(res.methods.map((m) => m.key)).toEqual(['card', 'paypal', 'check']);
  });

  it('falls back to the older question on a portal without the new function, and behaves as before', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: missing }).mockResolvedValueOnce({ data: legacyAnswer, error: null });
    const res = await loadPaymentMethods('center-1');
    expect(mockRpc.mock.calls.map((c) => c[0])).toEqual(['member_payment_methods', 'member_payment_options']);
    expect(mockRpc).toHaveBeenLastCalledWith('member_payment_options', { p_center: 'center-1' });
    expect(res.source).toBe('options');
    expect(res.methods.map((m) => [m.kind, m.key])).toEqual([['online', 'card'], ['instructions', 'check']]);
    expect(res.methods[0]).toMatchObject({ legacy: true, processor: 'stripe' });
    expect(logSpy).toHaveBeenCalled();
  });

  it('treats "function does not exist" the same way', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function app.member_payment_methods(uuid) does not exist' } })
      .mockResolvedValueOnce({ data: legacyAnswer, error: null });
    expect((await loadPaymentMethods('center-1')).source).toBe('options');
  });

  it('does not mistake a network failure for a missing function: it says so, and asks nothing else', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    const err = await loadPaymentMethods('center-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe("We couldn't load how to give. Check your internet connection and try again.");
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('shows the refusal for a child as the sentence the database wrote', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Only an adult of the family can pay for it.' } });
    const err = await loadPaymentMethods('center-1').catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Only an adult of the family can pay for it.');
    expect(isAdultsOnlyRefusal(err)).toBe(true);
  });

  it('fails in plain English when the older question fails too', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: missing }).mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    const err = await loadPaymentMethods('center-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toMatch(/internet connection/);
  });

  it('says so when the answer is not what it expected', async () => {
    for (const data of [null, 'nonsense', { methods: 'x' }]) {
      mockRpc.mockResolvedValueOnce({ data, error: null });
      const err = await loadPaymentMethods('center-1').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).userMessage).toBe("We couldn't load how to give — the answer was not what we expected. Please try again.");
    }
  });

  it('is fine with a community that takes nothing online and lists nothing', async () => {
    mockRpc.mockResolvedValueOnce({ data: { environment: 'production', online_unavailable: 'not_connected', methods: [] }, error: null });
    const res = await loadPaymentMethods('center-1');
    expect(res.methods).toEqual([]);
    expect(res.onlineUnavailable).toBe('not_connected');
  });
});

describe('starting an online payment', () => {
  const fetchMock = jest.fn<(url: string, init: { body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>>();
  const base = { centerId: 'c', householdId: 'h', amountCents: 5100, pledgeIds: ['p1'], context: 'pledges', forLabel: 'Pledge P-1' };
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ checkout_id: 'k1', url: 'https://pay.example/k1', mode: 'test', processor: 'paypal' }) });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  });

  it('sends the provider the member chose', async () => {
    const res = await startCheckout({ ...base, processor: 'paypal' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://portal.example/api/payments/intent');
    expect(JSON.parse(init.body)).toEqual({ center_id: 'c', household_id: 'h', amount_cents: 5100, pledge_ids: ['p1'], processor: 'paypal', context: 'pledges', for_label: 'Pledge P-1' });
    expect(res).toEqual({ checkoutId: 'k1', url: 'https://pay.example/k1', mode: 'test', processor: 'paypal' });
  });

  it('sends no processor when none was chosen (the older list: the community\'s default, as before)', async () => {
    await startCheckout(base);
    expect(Object.keys(JSON.parse(fetchMock.mock.calls[0][1].body))).not.toContain('processor');
  });

  it('says plainly that nothing was charged when the portal refuses', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'PayPal is not connected.' }) });
    const err = await startCheckout({ ...base, processor: 'paypal' }).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't start the payment — PayPal is not connected. Nothing was charged.");
  });

  it('says plainly that nothing was charged when the network fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const err = await startCheckout(base).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't start the payment. Check your internet connection and try again. Nothing was charged.");
  });
});

describe('reporting a Zelle', () => {
  const value = { amountCents: 25000, sentOn: '2026-09-27', confirmation: 'JPM99BXK2Q1V', senderName: 'Rahul Shah', pledgeIds: ['p1', 'p2'] };
  const args = { centerId: 'c', householdId: 'h', value };

  it('sends whole cents, the date and the pledges, and a note of nothing', async () => {
    mockRpc.mockResolvedValueOnce({ data: { report_id: 'r1', status: 'reported', due_on: '2026-10-07', is_test: false, message: 'Thank you.' }, error: null });
    const res = await reportZelle(args);
    expect(mockRpc).toHaveBeenCalledWith('report_payment', {
      p_center: 'c',
      p_household: 'h',
      p_method: 'zelle',
      p_amount_cents: 25000,
      p_sent_on: '2026-09-27',
      p_confirmation: 'JPM99BXK2Q1V',
      p_sender_name: 'Rahul Shah',
      p_pledge_ids: ['p1', 'p2'],
      p_note: null,
    });
    expect(res).toEqual({ reportId: 'r1', dueOn: '2026-10-07', isTest: false });
  });

  it('leaves the confirmation number and name null when the member gave none', async () => {
    mockRpc.mockResolvedValueOnce({ data: { report_id: 'r1', is_test: true }, error: null });
    const res = await reportZelle({ ...args, value: { ...value, confirmation: null, senderName: null, pledgeIds: [] } });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_confirmation: null, p_sender_name: null, p_pledge_ids: [] });
    expect(res).toEqual({ reportId: 'r1', dueOn: null, isTest: true });
  });

  it('never sends an amount that is not whole cents', async () => {
    for (const amountCents of [12.5, 0, -5, Number.NaN]) {
      const err = await reportZelle({ ...args, value: { ...value, amountCents } }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('shows the database\'s own refusal, in plain English, next to what the member did', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'The date you sent the Zelle cannot be after today.' } });
    const err = await reportZelle(args).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Could not send your report — The date you sent the Zelle cannot be after today.');
  });

  it('says so when it was already reported (a double tap, or a retry after the answer was lost)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'You already reported this Zelle; it is waiting for the bank.' } });
    const err = await reportZelle(args).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Could not send your report — You already reported this Zelle; it is waiting for the bank.');
  });

  it('tells a child to ask a parent, and the screen can tell it from any other refusal', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Only an adult of the family can report a payment.' } });
    const err = await reportZelle(args).catch((e: unknown) => e);
    expect(isAdultsOnlyRefusal(err)).toBe(true);
    expect((err as AppError).userMessage).toBe('Could not send your report — Only an adult of the family can report a payment.');
    expect(isAdultsOnlyRefusal(new AppError('Could not send your report — Zelle is not one of the ways JSH takes gifts.', 'x', '22023'))).toBe(false);
    expect(isAdultsOnlyRefusal(new Error('Only an adult'))).toBe(false);
  });

  it('never shows Postgres\' own wording', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'invalid input syntax for type uuid: "x"' } });
    const err = await reportZelle(args).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Something went wrong while trying to send your report. Please try again.');
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied for function report_payment' } });
    const err2 = await reportZelle(args).catch((e: unknown) => e);
    expect((err2 as AppError).userMessage).toMatch(/permission/i);
    expect((err2 as AppError).userMessage).not.toMatch(/for function/);
  });

  it('says so when the network fails, so the member can try again', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    const err = await reportZelle(args).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't send your report. Check your internet connection and try again.");
  });

  it('says so, and nothing was sent, on a portal that cannot take reports yet', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function app.report_payment in the schema cache' } });
    const err = await reportZelle(args).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Could not send your report — this is not available yet. Nothing was changed.');
  });

  it('does not say "sent" when the answer is unclear: it points to the list before trying again', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const err = await reportZelle(args).catch((e: unknown) => e);
    expect((err as AppError).userMessage).toMatch(/couldn't confirm that your report was saved/);
  });
});

describe('withdrawing a report', () => {
  it('withdraws by id', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await withdrawZelleReport('r1');
    expect(mockRpc).toHaveBeenCalledWith('withdraw_payment_report', { p_report: 'r1', p_reason: null });
  });

  it('shows why it could not be withdrawn', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'This report is already matched to the bank, so it cannot be withdrawn.' } });
    const err = await withdrawZelleReport('r1').catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe('Could not withdraw your report — This report is already matched to the bank, so it cannot be withdrawn.');
  });

  it('says so when the network fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    const err = await withdrawZelleReport('r1').catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't withdraw your report. Check your internet connection and try again.");
  });
});

describe('the family\'s reports', () => {
  const row = { id: 'r1', amount_cents: 25000, sent_on: '2026-09-27', due_on: '2026-10-07', status: 'reported', pledge_ids: [], is_test: false, created_at: '2026-09-27T15:00:00Z' };

  it('asks for the family\'s reports and reads them', async () => {
    mockRpc.mockResolvedValueOnce({ data: [row], error: null });
    const res = await listPaymentReports('c', 'h');
    expect(mockRpc).toHaveBeenCalledWith('my_payment_reports', { p_center: 'c', p_household: 'h' });
    expect(res.available).toBe(true);
    expect(res.reports.map((r) => [r.id, r.status, r.amountCents])).toEqual([['r1', 'reported', 25000]]);
  });

  it('has none to show, and no error, on a portal that does not have them yet', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function app.my_payment_reports' } });
    expect(await listPaymentReports('c', 'h')).toEqual({ available: false, reports: [] });
  });

  it('shows a failure with a plain message, so the screen can offer to try again', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new TypeError('Network request failed') });
    const err = await listPaymentReports('c', 'h').catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't load your Zelle reports. Check your internet connection and try again.");
  });

  it('says so when the answer is not a list', async () => {
    mockRpc.mockResolvedValueOnce({ data: { not: 'a list' }, error: null });
    const err = await listPaymentReports('c', 'h').catch((e: unknown) => e);
    expect((err as AppError).userMessage).toBe("We couldn't load your Zelle reports — the answer was not what we expected. Please try again.");
  });

  it('keeps the reports it understands and logs the ones it does not', async () => {
    mockRpc.mockResolvedValueOnce({ data: [row, { ...row, id: 'r2', status: 'refunded' }], error: null });
    const res = await listPaymentReports('c', 'h');
    expect(res.reports.map((r) => r.id)).toEqual(['r1']);
    expect(logSpy).toHaveBeenCalled();
  });
});
