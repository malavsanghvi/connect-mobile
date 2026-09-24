/**
 * Shared pay flow (prototype Main.dc.html): the Pay sheet (L1559–1572), the
 * "Saving" screen (L901–926) and "Thank you / Anumodana!" (L443–450). Every
 * Pay button in the app goes through startPayment(); every multi-step save
 * (pledges, recurring gifts, labh, store orders) through runSaving().
 *
 * Card payment is NOT connected. Until a card charger is registered, the Pay
 * sheet's confirm step shows the honest "online payment is being set up · pay
 * at the office or by Zelle" notice instead of charging — never a fake
 * success. The Thank-you screen is only reached after a real charge.
 *
 * The UI lives in <PayHost/> (mounted once in the root layout); this module is
 * a small controller so any screen or helper can start a flow.
 */

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
  /** Where the payment was started from. */
  context: 'rsvp' | 'rsvp_later' | 'pledges' | 'opportunity' | 'labh' | 'store' | 'other';
  /**
   * An explicit, labelled alternative shown on the sheet while card payment is
   * not connected (e.g. "Save as a pledge instead", "Place order · pay at
   * pickup"). It runs only when the member taps it — nothing is saved silently.
   */
  alternative?: { label: string; run: () => void };
};

export type PaymentOutcome = { status: 'not_available' } | { status: 'paid'; paymentId: string } | { status: 'cancelled' } | { status: 'alternative' };

/** Fallback UI when no PayHost is mounted (kept for callers written against the M-HOME stub). */
export type PaymentUi = {
  payNotice: (context?: { amountLabel?: string; saved?: boolean }) => void;
  formatAmount: (cents: number) => string;
};

/**
 * Charges a card and records the payment against the request. Registered by
 * the payment integration once it exists; nothing registers one today.
 */
export type CardCharger = (req: PaymentRequest) => Promise<{ paymentId: string; methodLabel: string }>;

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
export function registerCardCharger(c: CardCharger): () => void {
  charger = c;
  return () => {
    if (charger === c) charger = null;
  };
}

export function cardCharger(): CardCharger | null {
  return charger;
}

/** Open the Pay sheet. Resolves when the member closes it. */
export async function startPayment(req: PaymentRequest, ui?: PaymentUi): Promise<PaymentOutcome> {
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
