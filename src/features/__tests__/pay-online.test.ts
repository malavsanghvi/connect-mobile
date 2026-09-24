import { describe, expect, it } from '@jest/globals';

import { instructionLines } from '../pay/offline';
import { processorLabel, waitForCheckout } from '../pay/online-wait';

const clock = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
};

describe('waiting for the provider', () => {
  it('returns once the webhook recorded the payment', async () => {
    const answers = [{ status: 'pending', paymentId: null, error: null }, { status: 'paid', paymentId: 'p1', error: null }];
    const c = clock();
    await expect(waitForCheckout(async () => answers.shift()!, { providerLabel: 'Stripe', ...c })).resolves.toEqual({ paymentId: 'p1' });
  });
  it('says plainly when the provider did not take it', async () => {
    const c = clock();
    await expect(waitForCheckout(async () => ({ status: 'failed', paymentId: null, error: 'Card declined.' }), { providerLabel: 'PayPal', ...c })).rejects.toMatchObject({
      userMessage: 'PayPal did not take the payment — Card declined. Nothing was charged.',
    });
  });
  it('never claims success when nothing came back in time', async () => {
    const c = clock();
    await expect(
      waitForCheckout(async () => ({ status: 'pending', paymentId: null, error: null }), { providerLabel: 'Stripe', timeoutMs: 10000, everyMs: 2000, ...c }),
    ).rejects.toMatchObject({ userMessage: expect.stringContaining("haven't heard back from Stripe") });
  });
  it('keeps waiting through a network blip', async () => {
    const c = clock();
    let n = 0;
    const poll = async () => {
      n += 1;
      if (n === 1) throw new Error('Network request failed');
      return { status: 'paid', paymentId: 'p2', error: null };
    };
    await expect(waitForCheckout(poll, { providerLabel: 'Stripe', ...c })).resolves.toEqual({ paymentId: 'p2' });
  });
  it('names the provider', () => {
    expect(processorLabel('paypal')).toBe('PayPal');
    expect(processorLabel(null)).toBe('the payment provider');
  });
});

describe('how to give', () => {
  it('shows the known instruction fields in a stable order and skips empty ones', () => {
    expect(instructionLines({ method: 'check', instructions: { memo_hint: 'Member number', address: '3905 Arbor St', payee: 'JSH', junk: 'x', note: ' ' } })).toEqual([
      { field: 'payee', value: 'JSH' },
      { field: 'address', value: '3905 Arbor St' },
      { field: 'memo_hint', value: 'Member number' },
    ]);
  });
});
