import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Loaded } from '@/components/states';
import { Banner, Button, Card, Txt, VStack } from '@/components/ui';
import { HowToGive } from '@/features/pay/how-to-give';
import { canReportZelle, otherMethods } from '@/features/pay/methods';
import { loadPaymentMethods } from '@/lib/api/payments';
import {
  countdownText,
  enrollmentStatus,
  holdCountdown,
  lineLevel,
  lineNames,
  linePledges,
  outcomeKey,
  type RegEnrollment,
  type RegistrationOptions,
  type RegistrationResult,
  type RegLine,
  type Selection,
} from '@/lib/pathshala-registration';
import { useLoad } from '@/lib/use-load';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

import { money, useNow, whenText } from './shared';

/** The learner's enrollment for a line as the database has it now (the options are asked for again after every write). */
function liveEnrollment(options: RegistrationOptions, line: RegLine): RegEnrollment | null {
  if (!line.personId) return null;
  const learner = options.learners.find((x) => x.personId === line.personId);
  return learner?.enrollments.find((e) => e.status !== 'withdrawn' && e.trackId === line.trackId) ?? null;
}

/** Still waiting for the fee: requested and held for payment (online or at the office). */
function waitsForPayment(e: RegEnrollment | null): boolean {
  return !!e && e.status === 'requested' && (e.holdReason === 'payment' || e.holdReason === 'office_payment');
}

/**
 * After registering (plan §3.1 steps 5 and 6). Per learner: registered, waitlisted, waiting for membership, for the
 * office, or for the office to add the child; the pledges a pledge-mode registration added, with "Pay now
 * (optional)". In a pay-now term: the seats held, a countdown, Pay (the Pay sheet with context `pathshala`), "Pay at
 * the office instead" when the term allows it (then the office's Zelle, check and cash instructions), and "Fee paid"
 * once the database has placed them. Statuses come from the database again after every write, never assumed.
 */
export function DoneStep({
  options,
  result,
  selections,
  timeZone,
  centerId,
  paid,
  paying,
  payError,
  officeBusy,
  officeError,
  officeChosen,
  onPay,
  onPayPledges,
  onOffice,
  onCheckAgain,
}: {
  options: RegistrationOptions;
  result: RegistrationResult;
  selections: Selection[];
  timeZone: string | null;
  centerId: string;
  /** The fee was paid in this session (the Pay sheet said so). */
  paid: boolean;
  paying: boolean;
  payError: string | null;
  officeBusy: boolean;
  officeError: string | null;
  officeChosen: boolean;
  onPay: () => void;
  onPayPledges: () => void;
  onOffice: () => void;
  onCheckAgain: () => void;
}) {
  const t = useT();
  const mode = options.term.paymentMode;
  const names = lineNames(result, options.learners, selections);
  const seatLines = result.lines.filter((l) => l.outcome === 'seat');
  const pay = result.pay && result.pay.amountCents > 0 ? result.pay : null;
  // Until the options are read again a seat line has no live row: it is still held (the registration said so).
  const held = mode === 'pay_now' && !!pay && seatLines.some((l) => {
    const e = liveEnrollment(options, l);
    return !e ? !paid : waitsForPayment(e);
  });
  const placedNow = seatLines.length > 0 && seatLines.every((l) => {
    const e = liveEnrollment(options, l);
    return e?.status === 'placed' || e?.status === 'active';
  });
  const atOffice = officeChosen || seatLines.some((l) => liveEnrollment(options, l)?.holdReason === 'office_payment');
  const holdUntil =
    seatLines
      .map((l) => liveEnrollment(options, l)?.holdExpiresAt ?? null)
      .filter((x): x is string => !!x)
      .sort()[0] ?? pay?.holdUntil ?? null;
  const now = useNow(30000, held);
  const countdown = held ? holdCountdown(holdUntil, now) : null;
  const pledges = linePledges(result);
  const title = mode === 'pay_now' && pay ? (held ? t('reg.done.titleHeld') : placedNow || paid ? t('reg.done.titlePaid') : t('reg.done.title')) : t('reg.done.title');

  return (
    <VStack gap={space.md}>
      <Card tone={held ? 'amber' : 'green'}>
        <Txt variant="headline" color={held ? 'brownDark' : 'greenDark'} accessibilityRole="header">
          {title}
        </Txt>
        {result.lines.map((line, i) => {
          const { track, level } = lineLevel(line, options.tracks);
          const e = liveEnrollment(options, line);
          const view = e && e.status ? enrollmentStatus(e.status, { holdReason: e.holdReason, holdUntil: e.holdExpiresAt, offered: false, registrationId: null, trackId: e.trackId }) : null;
          const status = view ? t(view.key, { until: whenText(view.until, timeZone) }) : t(outcomeKey(line, mode), { name: names[i] });
          const pledge = line.pledge
            ? line.pledge.number
              ? line.pledge.dueOn
                ? t('reg.done.linePledge', { number: line.pledge.number, amount: money(line.totalCents), date: whenText(line.pledge.dueOn, timeZone) })
                : t('reg.done.linePledgeNoDate', { number: line.pledge.number, amount: money(line.totalCents) })
              : null
            : null;
          return (
            <View key={`${line.personId ?? 'new'}:${line.trackId}:${i}`} style={{ gap: 2, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.dividerLight, paddingTop: i > 0 ? space.xs : 0 }}>
              <Txt variant="bodyStrong">{[names[i], level ?? track].filter(Boolean).join(' · ')}</Txt>
              <Txt variant="small" color="ink2">
                {status}
              </Txt>
              {pledge && mode === 'pledge' ? (
                <Txt variant="meta" color="muted">
                  {pledge}
                </Txt>
              ) : null}
            </View>
          );
        })}
      </Card>

      {mode === 'pledge' && pledges.ids.length > 0 ? (
        <Card>
          <Txt variant="small">
            {pledges.ids.length > 1
              ? pledges.dueOn
                ? t('reg.done.pledges', { n: pledges.ids.length, amount: money(pledges.cents), date: whenText(pledges.dueOn, timeZone) })
                : t('reg.done.pledgesNoDate', { n: pledges.ids.length, amount: money(pledges.cents) })
              : pledges.dueOn
                ? t('reg.done.pledgesOne', { amount: money(pledges.cents), date: whenText(pledges.dueOn, timeZone) })
                : t('reg.done.pledgesOneNoDate', { amount: money(pledges.cents) })}
          </Txt>
          {paid ? (
            <Txt variant="smallStrong" color="greenDark">
              {t('reg.fee.paid')}
            </Txt>
          ) : (
            <Button label={t('reg.done.payOptional')} tone="secondary" size="md" onPress={onPayPledges} busy={paying} />
          )}
          {payError ? <Banner tone="error" message={payError} /> : null}
        </Card>
      ) : null}

      {held && pay ? (
        <Card tone="amber">
          <Txt variant="bodyStrong" color="brownDark">
            {holdUntil ? t('reg.done.heldUntil', { time: whenText(holdUntil, timeZone) }) : t('reg.status.held')}
          </Txt>
          {countdown ? (
            <Txt variant="smallStrong" color={!countdown.ended && countdown.urgent ? 'danger' : 'brownDark'} accessibilityLiveRegion="polite">
              {countdownText(countdown, t)}
            </Txt>
          ) : null}
          {countdown?.ended ? (
            <>
              <Txt variant="small" color="brownDark">
                {t('reg.done.ended')}
              </Txt>
              <Button label={t('reg.done.checkAgain')} tone="secondary" size="md" onPress={onCheckAgain} />
            </>
          ) : atOffice ? (
            <OfficeInstructions centerId={centerId} until={holdUntil} timeZone={timeZone} amountCents={pay.amountCents} pledgeIds={pay.pledgeIds} />
          ) : (
            <>
              <Button label={t('reg.done.pay', { amount: money(pay.amountCents) })} tone="black" onPress={onPay} busy={paying} />
              {pay.officePaymentAllowed && result.registrationId ? <Button label={t('reg.done.officeInstead')} tone="secondary" size="md" onPress={onOffice} busy={officeBusy} /> : null}
              <Txt variant="meta" color="brownDark">
                {t('reg.done.paidAlready')}
              </Txt>
            </>
          )}
          {payError ? <Banner tone="error" message={payError} /> : null}
          {officeError ? <Banner tone="error" message={officeError} action={{ label: t('common.retry'), onPress: onOffice }} /> : null}
        </Card>
      ) : null}
    </VStack>
  );
}

/** "Pay at the office by …": the community's Zelle, check and cash instructions (app.member_payment_methods), with "I sent it" for Zelle. */
function OfficeInstructions({ centerId, until, timeZone, amountCents, pledgeIds }: { centerId: string; until: string | null; timeZone: string | null; amountCents: number; pledgeIds: string[] }) {
  const t = useT();
  const router = useRouter();
  const methods = useLoad(() => loadPaymentMethods(centerId), [centerId], 'load how to pay at the office');
  return (
    <VStack gap={space.sm}>
      <Txt variant="small" color="brownDark">
        {until ? t('reg.done.officeChosen', { date: whenText(until, timeZone) }) : t('reg.done.officeChosenNoDate')}
      </Txt>
      <Loaded state={methods}>
        {(m) => (
          <HowToGive
            methods={otherMethods(m)}
            tone="brown"
            onReport={canReportZelle(m) ? () => router.push({ pathname: '/zelle-report', params: { amount: String(amountCents), pledges: pledgeIds.join(',') } }) : undefined}
          />
        )}
      </Loaded>
    </VStack>
  );
}
