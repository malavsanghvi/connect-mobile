/**
 * Online payment for the Pay sheet (o-payments): when the community takes member payments online
 * (app.member_payment_methods, or the older app.member_payment_options), a card charger is registered. It asks the
 * portal for a checkout at the provider the member chose (the organization's own Stripe or PayPal account), opens the
 * provider's page, and waits for the provider's webhook to be recorded (app.checkout_status). A sandbox always runs in
 * the provider's test mode. Nothing is ever marked paid here.
 */

import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { checkoutStatus, loadPaymentMethods, startCheckout } from '@/lib/api/payments';
import { env } from '@/lib/env';
import { AppError, logError } from '@/lib/errors';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useModule } from '@/providers/modules';

import { registerCardCharger, type CardCharger } from './controller';
import { onlineMethods, type PaymentMethods } from './methods';
import { processorLabel, waitForCheckout } from './online-wait';

async function openProviderPage(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    // A new tab, so this app keeps waiting for the provider's confirmation.
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}

/**
 * Loads what this community takes and registers the charger while online payment is available. Nothing is asked of
 * the database for a child (adults only), or while the community has Giving switched off.
 */
export function usePaymentMethods(): { methods: PaymentMethods | null; error: string | null; loading: boolean } {
  const { center, member, session } = useApp();
  const givingOn = useModule('giving');
  const { version } = useDataVersion();
  const [state, setState] = useState<{ key: string; methods: PaymentMethods | null; error: string | null }>({ key: '', methods: null, error: null });
  const adult = !!member?.isAdult;
  const key = center && member && session && adult && givingOn ? `${center.id}:${member.household?.id ?? ''}:${version}` : '';

  useEffect(() => {
    if (!key || !center) return;
    let alive = true;
    loadPaymentMethods(center.id)
      .then((methods) => alive && setState({ key, methods, error: null }))
      .catch((err: unknown) => {
        logError('load how to give', err);
        if (alive) setState({ key, methods: null, error: err instanceof AppError ? err.userMessage : "We couldn't load how to give." });
      });
    return () => {
      alive = false;
    };
  }, [key, center]);

  const methods = state.key === key ? state.methods : null;
  const householdId = member?.household?.id ?? null;

  useEffect(() => {
    const online = onlineMethods(methods);
    if (online.length === 0 || !center || !householdId || !env.portalUrl) return;
    const charge: CardCharger = async (req, chosen) => {
      // The member's choice; the first listed when none was passed.
      const method = chosen ?? online[0];
      const label = processorLabel(method.processor);
      const start = await startCheckout({
        centerId: center.id,
        householdId,
        amountCents: req.amountCents,
        pledgeIds: req.pledgeIds ?? (req.pledgeId ? [req.pledgeId] : []),
        context: req.context,
        forLabel: req.forLabel,
        // The older list never named a provider: the portal then uses the community's default, exactly as before.
        processor: method.legacy ? undefined : method.processor,
      });
      await openProviderPage(start.url);
      const done = await waitForCheckout(() => checkoutStatus(start.checkoutId), { providerLabel: label });
      return { paymentId: done.paymentId, methodLabel: label };
    };
    return registerCardCharger(charge);
  }, [methods, center, householdId]);

  return { methods, error: state.key === key ? state.error : null, loading: key !== '' && state.key !== key };
}
