import { loadPaymentMethods } from '@/lib/api/payments';
import { loadProofPolicy } from '@/lib/api/proofs';
import type { AppError } from '@/lib/errors';
import { acceptedProofMethods, type ProofMethodKey, type ProofPolicy } from '@/lib/proofs';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useModule } from '@/providers/modules';

/** What "I paid another way" needs to open: the ways this community takes that a proof can be sent for, and its rules. */
export type ProofSetup = { methods: ProofMethodKey[]; policy: ProofPolicy };

/**
 * Why "I paid another way" is, or is not, available:
 * - `ok`: it can open.
 * - `off`: the Payment proofs module is off, the person is a child, or there is no household.
 * - `no_methods`: the community accepts no offline way (cash, check, bank transfer, Zelle) a proof can be sent for. A treasurer can fix this.
 * - `no_rules`: the proof rules could not be read (an older portal, or the read failed).
 * - `loading`: still finding out.
 */
export type ProofReason = 'ok' | 'off' | 'no_methods' | 'no_rules' | 'loading';

/** The decision from what the community takes and its rules. Rules missing wins: a treasurer turning on a method would not help. */
export function decideProofSetup(accepted: ProofMethodKey[], policy: ProofPolicy | null): { setup: ProofSetup | null; reason: ProofReason } {
  if (!policy) return { setup: null, reason: 'no_rules' };
  if (accepted.length === 0) return { setup: null, reason: 'no_methods' };
  return { setup: { methods: accepted, policy }, reason: 'ok' };
}

/**
 * Whether the family can send a payment proof: an adult, the Payment proofs module on (with Giving), the community taking at
 * least one offline method a proof can be sent for, and a portal that has the proof rules. `setup` is null when any is
 * missing; `reason` says which, so a screen can tell the person instead of hiding the button without a word.
 * A failure to find out is `error`, said on the screen with a retry.
 */
export function useProofSetup(): { setup: ProofSetup | null; reason: ProofReason; error: AppError | null; reload: () => void } {
  const { member, center } = useApp();
  const givingOn = useModule('giving');
  const proofsOn = useModule('giving_proofs');
  const adult = !!member?.isAdult;
  const householdId = member?.household?.id ?? null;
  const on = givingOn && proofsOn && adult && !!householdId;
  const state = useLoad<{ setup: ProofSetup | null; reason: ProofReason }>(
    async () => {
      if (!on || !center) return { setup: null, reason: 'off' };
      const [methods, policy] = await Promise.all([loadPaymentMethods(center.id), loadProofPolicy(center.id)]);
      return decideProofSetup(acceptedProofMethods(methods), policy);
    },
    [center?.id, householdId, on],
    'check whether you can send a payment confirmation',
  );
  const reason: ProofReason = !on ? 'off' : (state.data?.reason ?? (state.error ? 'no_rules' : 'loading'));
  return { setup: on ? (state.data?.setup ?? null) : null, reason, error: on ? state.error : null, reload: () => void state.reload() };
}
