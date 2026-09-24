/**
 * Shared pay flow entry point.
 *
 * STUB (M-HOME): the pay-sheet stream owns this module and replaces it with the
 * prototype's pay sheet, "Saving" and thank-you screens. Until card payment is
 * connected, starting a payment only tells the member the truth: online
 * payment is being set up and nothing is charged (the existing payNotice).
 * Never report a charge from here.
 */

export type PaymentRequest = {
  /** Amount to pay, integer cents. */
  amountCents: number;
  /** "For" line on the pay sheet, e.g. "Tapasvi Bahuman donation". */
  forLabel: string;
  /** Pledge the payment is recorded against, when one was already saved. */
  pledgeId?: string | null;
  pledgeNumber?: string | null;
  /** Where the payment was started from. */
  context: 'rsvp' | 'rsvp_later' | 'pledges' | 'opportunity' | 'labh' | 'store' | 'other';
};

export type PaymentOutcome = { status: 'not_available' } | { status: 'paid'; paymentId: string } | { status: 'cancelled' };

export type PaymentUi = {
  payNotice: (context?: { amountLabel?: string; saved?: boolean }) => void;
  formatAmount: (cents: number) => string;
};

export async function startPayment(req: PaymentRequest, ui: PaymentUi): Promise<PaymentOutcome> {
  ui.payNotice({ amountLabel: ui.formatAmount(req.amountCents), saved: !!req.pledgeId });
  return { status: 'not_available' };
}
