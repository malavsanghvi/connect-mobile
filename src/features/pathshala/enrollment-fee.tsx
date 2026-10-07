import { useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Row, Txt } from '@/components/ui';
import type { Enrollment } from '@/lib/api/gyan';
import { chooseOfficePayment } from '@/lib/api/pathshala';
import { report } from '@/lib/errors';
import { countdownText, enrollmentStatus, feeSummary, holdCountdown, payGroup, type PayableEnrollment } from '@/lib/pathshala-registration';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

import { feeForLabel, money, payFees, whenText } from './shared';

function payable(r: Enrollment): PayableEnrollment {
  return { id: r.id, personId: r.student_person_id, registrationId: r.hold.registrationId, heldForPayment: enrollmentStatus(r.status, r.hold).heldForPayment, pledges: r.fees };
}

/**
 * An enrollment's fee for a household adult, under its line in 3L › Learn (plan §3.1 step 7; a child never sees fees,
 * P30): a seat held for payment or offered from the waitlist with its countdown and Pay (the whole registration's held
 * seats at once) and "Pay at the office instead" when the term allows it; otherwise "Fee $117.00 · due Sep 20 · Pay",
 * or "Fee paid". Nothing when there is no fee pledge (not billed, or a database before 0591).
 */
export function EnrollmentFee({ row, rows, nameOf, now, timeZone }: { row: Enrollment; rows: Enrollment[]; nameOf: (personId: string) => string; now: Date; timeZone: string | null }) {
  const t = useT();
  const { invalidate } = useDataVersion();
  const [busy, setBusy] = useState<'pay' | 'office' | null>(null);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const view = enrollmentStatus(row.status, row.hold);
  const fee = feeSummary(row.fees);
  const all = rows.map(payable);
  const group = payGroup(all, payable(row));
  // Held seats of one registration are paid together: the Pay button sits under the first of them only.
  const firstOfGroup = !view.heldForPayment || !row.hold.registrationId || rows.find((r) => r.hold.registrationId === row.hold.registrationId && enrollmentStatus(r.status, r.hold).heldForPayment)?.id === row.id;

  const office = () => {
    const registrationId = row.hold.registrationId;
    if (!registrationId) return;
    setBusy('office');
    setError(null);
    chooseOfficePayment(registrationId)
      .then(() => invalidate())
      .catch((err: unknown) => setError({ message: t('reg.err.office', { reason: report(err, 'keep the seats for payment at the office').userMessage }), retry: office }))
      .finally(() => setBusy(null));
  };

  const pay = () => {
    if (!group) return;
    setBusy('pay');
    setError(null);
    const offerOffice = row.hold.holdReason === 'payment' && row.officePaymentAllowed && !!row.hold.registrationId;
    payFees({
      amountCents: group.amountCents,
      pledgeIds: group.pledgeIds,
      forLabel: feeForLabel(t, row.termName ?? '', group.personIds.map(nameOf)),
      office: offerOffice ? { label: t('reg.done.officeInstead'), run: office } : null,
    })
      .then((outcome) => {
        if (outcome.status === 'paid') invalidate();
      })
      .catch((err: unknown) => setError({ message: t('reg.err.pay', { reason: report(err, 'open the payment').userMessage }), retry: pay }))
      .finally(() => setBusy((b) => (b === 'pay' ? null : b)));
  };

  if (view.heldForPayment) {
    const countdown = holdCountdown(view.until, now);
    return (
      <View style={{ gap: space.xs }}>
        {countdown ? (
          <Txt variant="meta" color={!countdown.ended && countdown.urgent ? 'danger' : 'brownDark'}>
            {countdownText(countdown, t)}
          </Txt>
        ) : null}
        {firstOfGroup && group && !countdown?.ended ? (
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            <Button label={t('reg.done.pay', { amount: money(group.amountCents) })} tone="black" size="sm" fill={false} busy={busy === 'pay'} onPress={pay} />
            {row.hold.holdReason === 'payment' && row.officePaymentAllowed && row.hold.registrationId ? <Button label={t('reg.done.officeInstead')} tone="secondary" size="sm" fill={false} busy={busy === 'office'} onPress={office} /> : null}
          </Row>
        ) : null}
        {error ? <Banner tone="error" message={error.message} action={{ label: t('common.retry'), onPress: error.retry }} /> : null}
      </View>
    );
  }

  if (fee.kind === 'none') return null;
  if (fee.kind === 'paid') {
    return (
      <Txt variant="meta" color="greenDark">
        {t('reg.fee.paid')}
      </Txt>
    );
  }
  const date = fee.dueOn ? whenText(fee.dueOn, timeZone) : null;
  const text =
    fee.paidCents > 0
      ? date
        ? t('reg.fee.partPaid', { total: money(fee.totalCents), open: money(fee.openCents), date })
        : t('reg.fee.partPaidNoDate', { total: money(fee.totalCents), open: money(fee.openCents) })
      : date
        ? t('reg.fee.due', { amount: money(fee.totalCents), date })
        : t('reg.fee.dueNoDate', { amount: money(fee.totalCents) });
  return (
    <View style={{ gap: space.xs }}>
      <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
        <Txt variant="meta" color="ink2" style={{ flex: 1 }}>
          {text}
        </Txt>
        {group ? <Button label={t('reg.fee.pay')} tone="secondary" size="sm" fill={false} busy={busy === 'pay'} onPress={pay} accessibilityLabel={t('reg.fee.payLabel', { amount: money(group.amountCents) })} /> : null}
      </Row>
      {error ? <Banner tone="error" message={error.message} action={{ label: t('common.retry'), onPress: error.retry }} /> : null}
    </View>
  );
}
