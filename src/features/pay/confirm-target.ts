import type { ProofEntry } from '@/lib/api/proofs';

/** The checkouts that have a pledge and then ask for the payment confirmation: an RSVP, a store order, an opportunity, a labh, a Pathshala fee. */
export type ConfirmKind = Exclude<ProofEntry, 'open_pledges'>;

/**
 * What the payment confirmation form is opened for once the pledge(s) exist: which place it was opened from, what that place calls
 * the checkout (the opportunity's, the special day's or the registration's id), the pledges it covers, and what to call them.
 */
export type ConfirmationTarget = { entry: ProofEntry; entryRef: string | null; pledgeIds: string[]; title: string };

/**
 * The database ties a checkout confirmation to exactly ONE pledge and locks the amount to it. When a checkout saved several (several
 * pujans, several labh, several learners) the confirmation goes the way of Open pledges instead, with exactly those pledges chosen and
 * the amount the member's to enter, so the same form works either way and the member never has to pick the pledges again.
 */
export function confirmationTarget(args: { kind: ConfirmKind; refId: string | null; pledgeIds: string[]; title: string }): ConfirmationTarget {
  const ids = [...new Set(args.pledgeIds)];
  if (ids.length === 1) return { entry: args.kind, entryRef: args.refId, pledgeIds: ids, title: args.title };
  return { entry: 'open_pledges', entryRef: null, pledgeIds: ids, title: args.title };
}

/** True when the form is bound to one pledge (the amount is locked), false when the member chooses the amount. */
export function isLockedTarget(target: ConfirmationTarget): boolean {
  return target.entry !== 'open_pledges';
}
