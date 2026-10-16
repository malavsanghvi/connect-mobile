import { Button, Txt } from '@/components/ui';
import { useT } from '@/providers/settings';

import type { ProofReason, ProofSetup } from './proof-setup';

/**
 * "I paid another way" on a screen with something left to pay: the button when a proof can be sent, and, when the community
 * accepts no cash, check or bank transfer yet, a muted note that says so (never a silent gap). Hidden otherwise (module off,
 * a child, or the rules not read: those have their own messages elsewhere).
 */
export function PaidAnotherWay({ setup, reason, onPress }: { setup: ProofSetup | null; reason: ProofReason; onPress: () => void }) {
  const t = useT();
  if (setup) return <Button label={t('pledges.paidAnotherWay')} tone="secondary" accessibilityHint={t('pledges.paidAnotherWayHint')} onPress={onPress} />;
  if (reason === 'no_methods') {
    return (
      <Txt variant="small" color="muted" accessibilityLiveRegion="polite">
        {t('pledges.paidAnotherWayNone')}
      </Txt>
    );
  }
  return null;
}
