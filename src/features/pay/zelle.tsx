import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Pill, Row, Txt, VStack } from '@/components/ui';
import { withdrawZelleReport } from '@/lib/api/payments';
import { copyText } from '@/lib/clipboard';
import { report as reportError } from '@/lib/errors';
import { formatCents, formatLongDate } from '@/lib/format';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

import type { ZelleMethod } from './methods';
import { isWaiting, newestFirst, statusLook, type PaymentReport } from './zelle-report';

type Tone = 'plain' | 'brown';

/**
 * Zelle on the Pay sheet and in "How to give": the community's Zelle address with a copy button, the name to look for
 * in the member's bank app, the memo to write, and "I sent it" to tell us about it afterwards. In a sandbox there is no
 * address (Zelle has no test mode, so nobody can send real money): only "Sandbox: no real money moves" and a way to
 * report a test payment.
 */
export function ZelleBlock({ method, tone = 'plain', onReport }: { method: ZelleMethod; tone?: Tone; onReport?: () => void }) {
  const t = useT();
  const { toast } = useFeedback();
  const [copyError, setCopyError] = useState<string | null>(null);
  // "I sent it" opens a screen: a double tap must not open two.
  const opening = useRef(false);
  const color = tone === 'brown' ? 'brownDark' : 'ink';
  const { recipient, name, memoHint } = method.instructions;

  const openReport = () => {
    if (!onReport || opening.current) return;
    opening.current = true;
    onReport();
    setTimeout(() => {
      opening.current = false;
    }, 1500);
  };

  const copy = () => {
    if (!recipient) return;
    setCopyError(null);
    copyText(recipient).then(
      (result) => {
        if (result === 'copied') toast(t('zelle.copied'), 'success');
      },
      (err: unknown) => setCopyError(reportError(err, 'copy the Zelle address').userMessage),
    );
  };

  return (
    <View style={{ gap: 4, borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: space.sm }}>
      <Txt variant="smallStrong" color={color}>
        {method.label}
      </Txt>
      {method.rehearsal ? (
        <Txt variant="small" color={color}>
          {t('zelle.rehearsal')}
        </Txt>
      ) : null}
      {recipient ? (
        <Row gap={space.sm} style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="meta" color={color}>
              {t('howToGive.field.recipient')}
            </Txt>
            <Txt variant="bodyStrong" color={color} selectable>
              {recipient}
            </Txt>
          </View>
          <Button
            label={Platform.OS === 'web' ? t('zelle.copy') : t('zelle.copyOrShare')}
            accessibilityLabel={t('zelle.copyA11y')}
            tone={tone === 'brown' ? 'outlineBrown' : 'secondary'}
            size="sm"
            fill={false}
            onPress={copy}
          />
        </Row>
      ) : null}
      {copyError ? (
        <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
          {copyError}
        </Txt>
      ) : null}
      {name && !method.rehearsal ? (
        <Txt variant="small" color={color}>
          {t('zelle.nameShown')}: {name}
        </Txt>
      ) : null}
      {memoHint ? (
        <Txt variant="small" color={color}>
          {t('howToGive.field.memo_hint')}: {memoHint}
        </Txt>
      ) : null}
      {onReport && method.reportAvailable ? (
        <VStack gap={space.xs} style={{ paddingTop: space.xs }}>
          <Txt variant="meta" color={color}>
            {t(method.rehearsal ? 'zelle.afterSendingTest' : 'zelle.afterSending')}
          </Txt>
          <Button label={t(method.rehearsal ? 'zelle.reportTest' : 'zelle.iSentIt')} tone={tone === 'brown' ? 'outlineBrown' : 'secondary'} size="md" fill={false} onPress={openReport} />
        </VStack>
      ) : null}
    </View>
  );
}

/** What a member sees under a report: where it stands, in plain words. Never "paid", never "received". */
function reportNote(t: ReturnType<typeof useT>, r: PaymentReport): string {
  switch (r.status) {
    case 'reported':
      return t('zelle.note.reported');
    case 'unmatched':
      return t('zelle.note.unmatched', { date: r.dueOn ? formatLongDate(r.dueOn) : formatLongDate(r.sentOn) });
    case 'matched':
      return r.receiptNumber ? t('zelle.note.matchedReceipt', { receipt: r.receiptNumber }) : t('zelle.note.matched');
    case 'rejected':
      return r.rejectReason ? t('zelle.note.rejectedWhy', { reason: r.rejectReason.replace(/[.!?]+$/, '') }) : t('zelle.note.rejected');
    default:
      return t('zelle.note.withdrawn');
  }
}

/**
 * The family's Zelle reports, newest first, each with its "Reported" chip (or Matched, Not accepted, Not seen at the
 * bank, Withdrawn). A report is not money received: the amounts here are never added up and never counted as given. A
 * report that is still waiting can be withdrawn; a failure is shown on that report, with the button to try again.
 */
export function ZelleReports({ reports, pledgeNumbers, onChanged }: { reports: PaymentReport[]; pledgeNumbers?: ReadonlyMap<string, string>; onChanged: () => void }) {
  const t = useT();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const sorted = newestFirst(reports);
  const shown = showAll ? sorted : sorted.slice(0, 5);

  const withdraw = async (r: PaymentReport) => {
    if (busy) return;
    // Withdrawing frees the confirmation number and cannot be undone: ask first (not again on a retry after a failure).
    if (failed?.id !== r.id) {
      const sure = await confirm({ title: t('zelle.withdrawTitle'), body: t('zelle.withdrawBody', { amount: formatCents(r.amountCents) }), confirmLabel: t('zelle.withdrawYes'), cancelLabel: t('zelle.withdrawKeep'), tone: 'danger' });
      if (!sure) return;
    }
    setBusy(r.id);
    setFailed(null);
    try {
      await withdrawZelleReport(r.id);
      toast(t('zelle.withdrawn'), 'success');
      onChanged();
    } catch (err) {
      setFailed({ id: r.id, message: reportError(err, 'withdraw your report').userMessage });
    } finally {
      setBusy(null);
    }
  };

  return (
    <VStack gap={space.sm}>
      {shown.map((r, i) => {
        const look = statusLook(r.status);
        const numbers = r.pledgeIds.map((id) => pledgeNumbers?.get(id)).filter((n): n is string => !!n);
        return (
          <View key={r.id} style={{ gap: 4, paddingTop: i === 0 ? 0 : space.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.dividerLight }}>
            <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
              <Txt variant="bodyStrong">{formatCents(r.amountCents)}</Txt>
              <Row gap={space.xs}>
                {r.isTest ? <Pill label={t('zelle.test')} tone="grey" /> : null}
                <Pill label={t(look.labelKey)} tone={look.tone} />
              </Row>
            </Row>
            <Txt variant="meta" color="muted">
              {[t('zelle.sentOn', { date: formatLongDate(r.sentOn) }), r.confirmation ? t('zelle.confirmationLine', { number: r.confirmation }) : null, numbers.length ? t('zelle.forPledgesLine', { list: numbers.join(', ') }) : r.pledgeIds.length ? t('zelle.forPledgesCount', { n: r.pledgeIds.length }) : null]
                .filter(Boolean)
                .join(' · ')}
            </Txt>
            <Txt variant="meta" color="ink2">
              {reportNote(t, r)}
            </Txt>
            {failed?.id === r.id ? (
              <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
                {failed.message}
              </Txt>
            ) : null}
            {isWaiting(r) ? (
              <Button
                label={failed?.id === r.id ? t('common.retry') : t('zelle.withdraw')}
                accessibilityLabel={t('zelle.withdrawA11y', { amount: formatCents(r.amountCents), date: formatLongDate(r.sentOn) })}
                tone="outlineDanger"
                size="sm"
                fill={false}
                busy={busy === r.id}
                disabled={!!busy && busy !== r.id}
                onPress={() => void withdraw(r)}
              />
            ) : null}
          </View>
        );
      })}
      {sorted.length > 5 ? <Button label={showAll ? t('zelle.showFewer') : t('zelle.showAll', { n: sorted.length })} tone="ghost" size="sm" fill={false} onPress={() => setShowAll(!showAll)} /> : null}
    </VStack>
  );
}
