/**
 * Online payment for the Pay sheet (o-payments): when the community takes
 * member payments online (app.member_payment_options), a card charger is
 * registered. It asks the portal for a checkout at the organization's own
 * Stripe or PayPal account, opens the provider's page, and waits for the
 * provider's webhook to be recorded (app.checkout_status). A sandbox always
 * runs in the provider's test mode. Nothing is ever marked paid here.
 */

import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { checkoutStatus, loadPaymentOptions, startCheckout, type PaymentOptions } from '@/lib/api/payments';
import { env } from '@/lib/env';
import { AppError, logError } from '@/lib/errors';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';

import { registerCardCharger, type CardCharger } from './controller';
import { processorLabel, waitForCheckout } from './online-wait';

async function openProviderPage(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    // A new tab, so this app keeps waiting for the provider's confirmation.
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}

/** Loads what this community takes and registers the charger while online payment is available. */
export function usePaymentOptions(): { options: PaymentOptions | null; error: string | null } {
  const { center, member, session } = useApp();
  const { version } = useDataVersion();
  const [state, setState] = useState<{ key: string; options: PaymentOptions | null; error: string | null }>({ key: '', options: null, error: null });
  const key = center && member && session ? `${center.id}:${member.household?.id ?? ''}:${version}` : '';

  useEffect(() => {
    if (!key || !center) return;
    let alive = true;
    loadPaymentOptions(center.id)
      .then((options) => alive && setState({ key, options, error: null }))
      .catch((err: unknown) => {
        logError('load how to give', err);
        if (alive) setState({ key, options: null, error: err instanceof AppError ? err.userMessage : "We couldn't load how to give." });
      });
    return () => {
      alive = false;
    };
  }, [key, center]);

  const options = state.key === key ? state.options : null;
  const householdId = member?.household?.id ?? null;
  const online = options?.online ?? null;

  useEffect(() => {
    if (!online || !center || !householdId || !env.portalUrl) return;
    const label = processorLabel(online.processor);
    const charge: CardCharger = async (req) => {
      const start = await startCheckout({
        centerId: center.id,
        householdId,
        amountCents: req.amountCents,
        pledgeIds: req.pledgeIds ?? (req.pledgeId ? [req.pledgeId] : []),
        context: req.context,
        forLabel: req.forLabel,
      });
      await openProviderPage(start.url);
      const done = await waitForCheckout(() => checkoutStatus(start.checkoutId), { providerLabel: label });
      return { paymentId: done.paymentId, methodLabel: label };
    };
    return registerCardCharger(charge);
  }, [online, center, householdId]);

  return { options, error: state.key === key ? state.error : null };
}
