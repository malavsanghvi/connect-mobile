/**
 * Shared pay flow (prototype Main.dc.html): the Pay sheet (L1559–1572), the
 * "Saving" screen (L901–926) and "Thank you / Anumodana!" (L443–450). Every
 * Pay button in the app goes through startPayment(); every multi-step save
 * (pledges, recurring gifts, labh, store orders) through runSaving().
 *
 * Online payment (o-payments): features/pay/online.ts registers a card charger
 * only while the community takes member payments online (its own Stripe or
 * PayPal account; a sandbox always in test mode). Without one, the Pay sheet
 * shows the honest "online payment is being set up" notice and the
 * community's offline instructions instead — never a fake success. The
 * Thank-you screen is only reached after the provider confirmed the payment.
 *
 * The UI lives in <PayHost/> (mounted once in the root layout); this module is
 * a small controller so any screen or helper can start a flow.
 */

import { useSyncExternalStore } from 'react';

import { errorCodeOf, track } from '@/lib/activity';

import type { OnlineMethod } from './methods';
import type { SavingStep } from './steps';

export type { SavingStep } from './steps';

export type PaymentRequest = {
  /** Amount to pay, integer cents. */
  amountCents: number;
  /** "For" line on the pay sheet, e.g. "Tapasvi Bahuman donation" or "2 pledges". */
  forLabel: string;
  /** Pledge the payment is recorded against, when one was already saved. */
  pledgeId?: string | null;
  pledgeNumber?: string | null;
  /** Several saved pledges (Family pledges → Pay N pledges). */
  pledgeIds?: string[];
  /**
   * The household the pledges belong to, when it is not the member's own: a Pathshala registration made under another
   * household the member is an adult of ("Register under"). The checkout is asked for that family's pledges.
   */
  householdId?: string | null;
  /**
   * Where the payment was started from. `pathshala` is a Pathshala fee (connect-crm 0591 adds it to the checkout
   * contexts): the success screen says "Fee paid", never the donation thank-you or a tax receipt.
   */
  context: 'rsvp' | 'rsvp_later' | 'pledges' | 'opportunity' | 'labh' | 'store' | 'pathshala' | 'other';
  /**
   * An explicit, labelled alternative shown on the sheet while card payment is
   * not connected (e.g. "Save as a pledge instead", "Place order · pay at
   * pickup"). It runs only when the member taps it — nothing is saved silently.
   * `withOnline` shows it beside the online payment too ("Pay at the office
   * instead" for a Pathshala seat held for payment).
   */
  alternative?: { label: string; run: () => void; withOnline?: boolean };
};

export type PaymentOutcome = { status: 'not_available' } | { status: 'paid'; paymentId: string } | { status: 'cancelled' } | { status: 'alternative' };

/** Fallback UI when no PayHost is mounted (kept for callers written against the M-HOME stub). */
export type PaymentUi = {
  payNotice: (context?: { amountLabel?: string; saved?: boolean }) => void;
  formatAmount: (cents: number) => string;
};

/**
 * Takes the member to the provider's page and waits until the provider's webhook has recorded the payment against the
 * request. `method` is the online way the member chose on the Pay sheet (Card or PayPal); without one the first online
 * method is used. Registered by features/pay/online.ts while the community takes payments online.
 */
export type CardCharger = (req: PaymentRequest, method?: OnlineMethod) => Promise<{ paymentId: string; methodLabel: string }>;

export type SavingJob = {
  /** "Saving your pledge". */
  title: string;
  steps: SavingStep[];
  /** Text in the green "Saved to your {center} account" box, built after the steps ran. */
  result: () => string;
  /** Final button, e.g. "See family pledges". */
  cta: { label: string; onPress: () => void };
};

export type SavingOutcome = { ok: true } | { ok: false; error: unknown };

type Host = {
  pay: (req: PaymentRequest) => Promise<PaymentOutcome>;
  save: (job: SavingJob) => Promise<SavingOutcome>;
};

let host: Host | null = null;
let charger: CardCharger | null = null;

/** Called by PayHost on mount; returns the unregister function. */
export function registerPayHost(h: Host): () => void {
  host = h;
  return () => {
    if (host === h) host = null;
  };
}

/** For the future payment integration. Returns the unregister function. */
const chargerListeners = new Set<() => void>();
const notifyCharger = () => chargerListeners.forEach((l) => l());

export function registerCardCharger(c: CardCharger): () => void {
  charger = c;
  notifyCharger();
  return () => {
    if (charger === c) {
      charger = null;
      notifyCharger();
    }
  };
}

export function cardCharger(): CardCharger | null {
  return charger;
}

/** The registered charger as React state, so screens re-render when online payment becomes available. */
export function useCardCharger(): CardCharger | null {
  return useSyncExternalStore(
    (l) => {
      chargerListeners.add(l);
      return () => chargerListeners.delete(l);
    },
    () => charger,
    () => charger,
  );
}

/**
 * Open the Pay sheet. Resolves when the member closes it. The usage logger counts the steps (payment_started, then
 * payment_completed, or payment_failed with "cancelled" when the sheet was closed); never the amount or what it was for.
 */
export async function startPayment(req: PaymentRequest, ui?: PaymentUi): Promise<PaymentOutcome> {
  track('payment_started', { entityKind: req.context });
  try {
    const outcome = await openPayment(req, ui);
    trackPaymentOutcome(req.context, outcome);
    return outcome;
  } catch (err) {
    track('payment_failed', { entityKind: req.context, outcome: 'error', errorCode: errorCodeOf(err) });
    throw err;
  }
}

function trackPaymentOutcome(context: PaymentRequest['context'], outcome: PaymentOutcome): void {
  if (outcome.status === 'paid') track('payment_completed', { entityKind: context });
  else if (outcome.status === 'cancelled') track('payment_failed', { entityKind: context, outcome: 'cancelled' });
  else if (outcome.status === 'alternative') track('payment_failed', { entityKind: context, outcome: 'cancelled', errorCode: 'alternative' });
  else track('payment_failed', { entityKind: context, outcome: 'error', errorCode: 'not_available' });
}

async function openPayment(req: PaymentRequest, ui?: PaymentUi): Promise<PaymentOutcome> {
  if (host) return host.pay(req);
  if (ui) {
    ui.payNotice({ amountLabel: ui.formatAmount(req.amountCents), saved: !!(req.pledgeId || req.pledgeIds?.length) });
    return { status: 'not_available' };
  }
  throw new Error('startPayment called before <PayHost/> was mounted');
}

/**
 * Show the "Saving" screen and run the steps. Resolves when the steps have
 * finished (ok) or the member closed the screen after a failure.
 */
export async function runSaving(job: SavingJob): Promise<SavingOutcome> {
  if (!host) throw new Error('runSaving called before <PayHost/> was mounted');
  return host.save(job);
}
