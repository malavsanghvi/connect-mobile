import { env } from '../env';
import { AppError, must } from '../errors';
import { supabase } from '../supabase';

/**
 * Online payment and "how to give" (connect-crm 0211):
 *   app.member_payment_options  what this community takes: the online processor (when members may
 *                               pay online) and the offline methods with their instructions
 *   /api/payments/intent        the portal's server route: creates the checkout at Stripe/PayPal
 *   app.checkout_status         polled until the provider's webhook says it was paid
 * The app never records a payment itself: only the provider's webhook does.
 */

export type OfflineMethod = { method: string; instructions: Record<string, string> };
export type PaymentOptions = {
  online: { processor: 'stripe' | 'paypal'; mode: 'test' | 'live'; methods: string[] } | null;
  /** Why online payment is off: not_connected | test_mode | offline_only. */
  onlineUnavailable: string | null;
  offline: OfflineMethod[];
  sandbox: boolean;
};

export async function loadPaymentOptions(centerId: string): Promise<PaymentOptions> {
  const raw = must(await supabase.rpc('member_payment_options', { p_center: centerId }), 'load how to give') as Record<string, unknown> | null;
  const online = (raw?.online ?? null) as PaymentOptions['online'];
  return {
    online: online && (online.processor === 'stripe' || online.processor === 'paypal') ? { ...online, mode: online.mode === 'live' ? 'live' : 'test', methods: online.methods ?? [] } : null,
    onlineUnavailable: typeof raw?.online_unavailable === 'string' ? raw.online_unavailable : null,
    offline: Array.isArray(raw?.offline) ? (raw.offline as OfflineMethod[]) : [],
    sandbox: raw?.environment === 'sandbox',
  };
}

export type CheckoutStart = { checkoutId: string; url: string; mode: string; processor: string };

export async function startCheckout(body: {
  centerId: string;
  householdId: string;
  amountCents: number;
  pledgeIds: string[];
  context: string;
  forLabel: string;
}): Promise<CheckoutStart> {
  if (!env.portalUrl) throw new AppError('Online payment is not set up in this app yet. Nothing was charged.', 'EXPO_PUBLIC_PORTAL_URL is not set');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError('Your sign-in has expired. Please sign in again.', 'no session for checkout');
  let res: Response;
  try {
    res = await fetch(`${env.portalUrl}/api/payments/intent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        center_id: body.centerId,
        household_id: body.householdId,
        amount_cents: body.amountCents,
        pledge_ids: body.pledgeIds,
        context: body.context,
        for_label: body.forLabel,
      }),
    });
  } catch (err) {
    throw new AppError("We couldn't start the payment. Check your internet connection and try again. Nothing was charged.", String(err));
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.url !== 'string' || typeof json.checkout_id !== 'string') {
    const why = typeof json.error === 'string' ? json.error : `the payment service answered ${res.status}`;
    throw new AppError(`We couldn't start the payment — ${why.replace(/\.$/, '')}. Nothing was charged.`, `intent ${res.status}: ${why}`);
  }
  return { checkoutId: json.checkout_id, url: json.url, mode: String(json.mode ?? ''), processor: String(json.processor ?? '') };
}

export type CheckoutState = { status: string; paymentId: string | null; receiptNumber: string | null; error: string | null };

export async function checkoutStatus(checkoutId: string): Promise<CheckoutState> {
  const raw = must(await supabase.rpc('checkout_status', { p_checkout: checkoutId }), 'check the payment') as Record<string, unknown> | null;
  if (!raw) throw new AppError('That payment was not found.', `checkout ${checkoutId} not visible`);
  return {
    status: String(raw.status ?? ''),
    paymentId: typeof raw.payment_id === 'string' ? raw.payment_id : null,
    receiptNumber: typeof raw.receipt_number === 'string' ? raw.receipt_number : null,
    error: typeof raw.error === 'string' ? raw.error : null,
  };
}
