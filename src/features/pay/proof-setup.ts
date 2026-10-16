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
 * Whether the family can send a payment proof: an adult, the Payment proofs module on (with Giving), the community taking at
 * least one offline method a proof can be sent for, and a portal that has the proof rules. `setup` is null when any is
 * missing, and the button is hidden (not disabled). A failure to find out is `error`, said on the screen with a retry.
 */
export function useProofSetup(): { setup: ProofSetup | null; error: AppError | null; reload: () => void } {
  const { member, center } = useApp();
  const givingOn = useModule('giving');
  const proofsOn = useModule('giving_proofs');
  const adult = !!member?.isAdult;
  const householdId = member?.household?.id ?? null;
  const on = givingOn && proofsOn && adult && !!householdId;
  const state = useLoad<ProofSetup | null>(
    async () => {
      if (!on || !center) return null;
      const [methods, policy] = await Promise.all([loadPaymentMethods(center.id), loadProofPolicy(center.id)]);
      const accepted = acceptedProofMethods(methods);
      return policy && accepted.length > 0 ? { methods: accepted, policy } : null;
    },
    [center?.id, householdId, on],
    'check whether you can send a payment proof',
  );
  return { setup: on ? (state.data ?? null) : null, error: on ? state.error : null, reload: () => void state.reload() };
}
