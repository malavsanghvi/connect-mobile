import { useState } from 'react';

import { Banner, Button, Card, Txt, VStack } from '@/components/ui';
import { listPledgesByIds } from '@/lib/api/giving';
import { AppError } from '@/lib/errors';
import { formatCents } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

import { isLockedTarget, type ConfirmationTarget } from './confirm-target';
import type { ProofSetup } from './proof-setup';
import { ProofSheet, type ProofSheetPledge } from './proof-sheet';

/**
 * The payment confirmation form for pledges that already exist (an opportunity, a labh or a Pathshala fee that was just saved): finds
 * the pledges, then opens the SAME form every other place uses. When the pledges cannot be read it says so in words, with Try again,
 * and a retry asks for the same pledges: it never makes a new pledge. Render it inside the screen's column so the message sits where
 * the member is looking.
 */
export function PledgeConfirmation({
  setup,
  target,
  householdId,
  open,
  onClose,
  onSent,
}: {
  setup: ProofSetup;
  target: ConfirmationTarget;
  /** The family the pledges belong to, when it is not the member's own (a Pathshala registration made under another household). */
  householdId?: string;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const t = useT();
  const { member, center } = useApp();
  const key = target.pledgeIds.join(',');
  // Asked for as soon as the form is wanted. A failure is said in words with Try again, and a retry asks for the same pledges.
  const state = useLoad(
    async (): Promise<ProofSheetPledge[]> => {
      const found = await listPledgesByIds(target.pledgeIds);
      const byId = new Map(found.map((p) => [p.id, p]));
      const single = target.pledgeIds.length === 1;
      const out: ProofSheetPledge[] = [];
      for (const id of target.pledgeIds) {
        const row = byId.get(id);
        if (!row) throw new AppError(t('payconf.pledgeGone'), `pledge ${id} is not visible after it was saved`);
        const title = single ? target.title : row.pledge_number ? t('pay.forPledge', { pledge: row.pledge_number }) : target.title;
        out.push({ ...row, title, number: row.pledge_number });
      }
      return out;
    },
    [key],
    'open the payment confirmation form',
  );
  const rows = state.data ?? null;

  const locked = isLockedTarget(target);
  const forHousehold = householdId ?? member?.household?.id ?? null;
  const only = rows && rows.length === 1 ? rows[0] : null;
  return (
    <>
      {state.error && !rows && open ? <Banner tone="error" message={state.error.userMessage} action={{ label: t('common.retry'), onPress: () => void state.reload() }} /> : null}
      {rows && center && member && forHousehold ? (
        <ProofSheet
          visible={open}
          onClose={onClose}
          setup={setup}
          centerId={center.id}
          householdId={forHousehold}
          today={member.today}
          pledges={rows}
          entry={target.entry}
          initialPledgeIds={locked ? undefined : target.pledgeIds}
          lockedPledgeId={locked ? target.pledgeIds[0] : undefined}
          entryRef={target.entryRef ?? undefined}
          forLabel={locked && only ? [only.number, only.title].filter(Boolean).join(' · ') : undefined}
          onSent={onSent}
        />
      ) : null}
    </>
  );
}

/** A pledge a checkout saved, kept on screen while the confirmation is added. */
export type HeldPledges = { target: ConfirmationTarget; setup: ProofSetup; numbers: string[]; amountCents: number };

/**
 * After "I paid another way" on an opportunity or a labh: the pledge is saved, and this screen holds it while the member adds the payment
 * confirmation. The form opens by itself. If the member closes it, or sending fails, the pledge stays: the screen says so in words and
 * "Add my confirmation" opens the form for the same pledge again. A second pledge is never made.
 */
export function HeldPledgeConfirmation({ held, onDone }: { held: HeldPledges; onDone: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [sent, setSent] = useState(false);
  const numbers = held.numbers.filter(Boolean).join(', ');
  return (
    <VStack gap={space.md}>
      <Card>
        <Txt variant="section" accessibilityRole="header">
          {t('payconf.heldTitle')}
        </Txt>
        <Txt variant="small" color="ink2">
          {sent ? t('payconf.heldSent') : t('payconf.heldBody', { what: held.target.title, amount: formatCents(held.amountCents, { alwaysCents: true }), numbers })}
        </Txt>
      </Card>
      {!sent ? <Banner tone="info" message={t('payconf.heldNote', { numbers })} /> : null}
      <PledgeConfirmation setup={held.setup} target={held.target} open={open} onClose={() => setOpen(false)} onSent={() => setSent(true)} />
      {!sent ? <Button label={t('payconf.send')} onPress={() => setOpen(true)} disabled={open} /> : null}
      <Button label={sent ? t('common.done') : t('payconf.later')} tone={sent ? 'primary' : 'secondary'} size="md" onPress={onDone} />
    </VStack>
  );
}
