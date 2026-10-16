import { useEffect, useRef, useState } from 'react';

import { Banner, Button, Card, Txt, VStack } from '@/components/ui';
import { getPledgeById } from '@/lib/api/events';
import { storeOrderPledge, type PlacedOrder } from '@/lib/api/store';
import { AppError, report } from '@/lib/errors';
import { formatCents } from '@/lib/format';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

import type { ProofSetup } from './proof-setup';
import { ProofSheet, type ProofSheetPledge } from './proof-sheet';

/** A store order that was placed for "I already paid another way", and what the proof sheet needs to open for it. */
export type HeldOrder = { order: PlacedOrder; setup: ProofSetup; centerId: string; householdId: string; today: string };

/**
 * After a store order was placed for "I already paid another way": gets the order's pledge, then opens the proof sheet bound to it with the
 * amount locked to the order total. When the pledge or the sheet cannot be reached the order stays placed, the screen says so in words,
 * and Try again goes on from where it stopped: the same order, the same pledge, never a second order.
 */
export function HeldStoreOrder({ held, onDone }: { held: HeldOrder; onDone: () => void }) {
  const t = useT();
  const { order } = held;
  const [pledge, setPledge] = useState<ProofSheetPledge | null>(null);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = useRef(false);
  const started = useRef(false);
  const pledgeId = useRef<string | null>(null);

  const start = async (): Promise<void> => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!pledge) {
        // Asking again for the same order returns the same pledge.
        pledgeId.current = pledgeId.current ?? (await storeOrderPledge(order.id));
        const row = await getPledgeById(pledgeId.current);
        if (!row) throw new AppError(t('store.pledgeGone'), `pledge ${pledgeId.current} is not visible after order ${order.orderNumber} was placed`);
        setPledge({ ...row, title: t('store.pledgeTitle', { order: order.orderNumber }), number: row.pledge_number });
      }
      setOpen(true);
    } catch (err) {
      setError(report(err, 'open the payment confirmation form').userMessage);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  // The member asked for this on the cart: the sheet opens by itself, once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <VStack gap={space.md}>
      <Card>
        <Txt variant="section" accessibilityRole="header">
          {t('store.heldTitle', { order: order.orderNumber })}
        </Txt>
        <Txt variant="small" color="ink2">
          {sent ? t('store.heldSent') : t('store.heldBody', { amount: formatCents(order.totalCents, { alwaysCents: true }) })}
        </Txt>
      </Card>
      {error ? <Banner tone="error" message={`${t('store.heldNoProof', { order: order.orderNumber })} ${error}`} action={{ label: t('common.retry'), onPress: () => void start() }} /> : null}
      {!sent && !error ? <Button label={t('store.sendProof')} onPress={() => void start()} busy={busy} disabled={busy} /> : null}
      <Button label={sent ? t('common.done') : t('store.sendLater')} tone={sent ? 'primary' : 'secondary'} size="md" onPress={onDone} />
      {pledge ? (
        <ProofSheet
          visible={open}
          onClose={() => setOpen(false)}
          setup={held.setup}
          centerId={held.centerId}
          householdId={held.householdId}
          today={held.today}
          pledges={[pledge]}
          entry="store"
          lockedPledgeId={pledge.id}
          entryRef={order.id}
          forLabel={[pledge.number, pledge.title].filter(Boolean).join(' · ')}
          onSent={() => setSent(true)}
        />
      ) : null}
    </VStack>
  );
}
