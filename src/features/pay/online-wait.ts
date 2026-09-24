/**
 * Waiting for the provider: after the member finishes on the Stripe/PayPal
 * page, the payment exists in Community Connect only once the provider's
 * webhook has been recorded. Poll app.checkout_status until it is paid, or
 * failed/expired, or the wait runs out — then say honestly what we know.
 */

import { AppError } from '@/lib/errors';

export type Poll = () => Promise<{ status: string; paymentId: string | null; error: string | null }>;

export async function waitForCheckout(
  poll: Poll,
  opts: { everyMs?: number; timeoutMs?: number; providerLabel: string; sleep?: (ms: number) => Promise<void>; now?: () => number } = { providerLabel: 'the payment provider' },
): Promise<{ paymentId: string }> {
  const every = opts.everyMs ?? 2000;
  const timeout = opts.timeoutMs ?? 10 * 60 * 1000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const end = now() + timeout;
  let lastErr: unknown = null;
  for (;;) {
    try {
      const s = await poll();
      if (s.status === 'paid' && s.paymentId) return { paymentId: s.paymentId };
      if (s.status === 'failed' || s.status === 'expired' || s.status === 'cancelled') {
        throw new AppError(
          `${opts.providerLabel} did not take the payment${s.error ? ` — ${s.error.replace(/\.$/, '')}` : ''}. Nothing was charged.`,
          `checkout ${s.status}: ${s.error ?? ''}`,
        );
      }
      lastErr = null;
    } catch (err) {
      if (err instanceof AppError && /did not take the payment/.test(err.userMessage)) throw err;
      lastErr = err;
    }
    if (now() >= end) {
      throw new AppError(
        `We haven't heard back from ${opts.providerLabel} yet. If you finished paying, it will appear in your giving history in a few minutes — you will not be charged twice.`,
        `checkout wait timed out${lastErr ? `: ${String(lastErr)}` : ''}`,
      );
    }
    await sleep(every);
  }
}

export function processorLabel(p: string | null | undefined): string {
  return p === 'paypal' ? 'PayPal' : p === 'stripe' ? 'Stripe' : 'the payment provider';
}
