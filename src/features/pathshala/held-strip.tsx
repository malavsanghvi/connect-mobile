import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorState } from '@/components/states';
import { Banner, Button, Chevron, Row, Txt } from '@/components/ui';
import { loadHeldSeats, type HeldSeat } from '@/lib/api/pathshala';
import { report } from '@/lib/errors';
import { countdownText, holdCountdown, payGroup, type PayableEnrollment } from '@/lib/pathshala-registration';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { feeForLabel, money, payFees, useNow } from './shared';

/** One line of the strip: the seats one registration holds (a family pays for them together), soonest first. */
type Group = { key: string; seats: HeldSeat[]; until: string | null; offered: boolean; atOffice: boolean };

function groups(seats: HeldSeat[]): Group[] {
  const map = new Map<string, HeldSeat[]>();
  for (const s of seats) {
    const key = s.hold.registrationId ?? s.enrollmentId;
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      seats: list,
      until: list.map((s) => s.hold.holdUntil).filter((x): x is string => !!x).sort()[0] ?? null,
      offered: list.some((s) => s.hold.offered),
      atOffice: list.every((s) => s.hold.holdReason === 'office_payment'),
    }))
    .sort((a, b) => (a.until ?? '9').localeCompare(b.until ?? '9'));
}

function payable(s: HeldSeat): PayableEnrollment {
  return { id: s.enrollmentId, personId: s.personId, registrationId: s.hold.registrationId, heldForPayment: true, pledges: s.pledges };
}

/**
 * Home, between the first row and the second, for a household adult: "Pay to keep Riya's seat · 5 h left" for a seat
 * held for payment, "A seat is offered to Dev · 2 days left" for a seat offered from the waitlist, and the office
 * version when the family chose to pay at the office (plan §3.1 step 7). Pay opens the Pay sheet for those seats; the
 * line opens 3L › Learn. Nothing when no seat is held (or the database has no holds yet, before connect-crm 0591); a
 * failed load says so with Try again.
 */
export function HeldSeatStrip() {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  const { invalidate } = useDataVersion();
  const householdId = member?.isAdult ? (member.household?.id ?? null) : null;
  const state = useLoad(() => (householdId ? loadHeldSeats(householdId) : Promise.resolve([])), [householdId], 'load your Pathshala seats');
  const seats = state.data ?? [];
  const now = useNow(30000, seats.length > 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!member?.isAdult) return null;
  const problem = state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  const live = groups(seats).filter((g) => {
    const c = holdCountdown(g.until, now);
    return !c || !c.ended;
  });
  if (live.length === 0) return problem;

  const nameOf = (personId: string) => {
    const p = member.members.find((m) => m.person.id === personId)?.person;
    return p ? p.preferred_name || p.first_name : '';
  };
  const openLearn = () => router.push({ pathname: '/jain-way', params: { tab: 'three_l', section: 'learn' } });
  const pay = (g: Group) => {
    const all = g.seats.map(payable);
    const group = payGroup(all, all[0]);
    if (!group) return;
    setBusy(g.key);
    setError(null);
    payFees({ amountCents: group.amountCents, pledgeIds: group.pledgeIds, forLabel: feeForLabel(t, g.seats[0].termName, group.personIds.map(nameOf)) })
      .then((outcome) => {
        if (outcome.status === 'paid') invalidate();
      })
      .catch((err: unknown) => setError(t('reg.err.pay', { reason: report(err, 'open the payment').userMessage })))
      .finally(() => setBusy(null));
  };

  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 2, borderColor: colors.saffron, borderRadius: radii.xxl, paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.xs }}>
      {problem}
      <Txt variant="eyebrow" color="brown" style={{ fontFamily: fonts.bodySemi, letterSpacing: 0.48 }} accessibilityRole="header">
        {t('reg.strip.eyebrow')}
      </Txt>
      {live.map((g) => {
        const names = [...new Set(g.seats.map((s) => nameOf(s.personId)).filter(Boolean))];
        const c = holdCountdown(g.until, now);
        const left = c ? countdownText(c, t) : '';
        const who = names.join(', ');
        const line = g.atOffice
          ? t('reg.strip.office', { names: who, left })
          : g.offered
            ? t('reg.strip.offered', { names: who, left })
            : t(names.length > 1 ? 'reg.strip.payMany' : 'reg.strip.pay', { names: who, left });
        const canPay = !!payGroup(g.seats.map(payable), payable(g.seats[0]));
        return (
          <Row key={g.key} gap={space.sm}>
            <Pressable onPress={openLearn} accessibilityRole="button" accessibilityLabel={line} accessibilityHint={t('reg.strip.hint')} style={({ pressed }) => ({ flex: 1, minHeight: touch.min, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Row gap={space.xs}>
                <Txt variant="bodyStrong" color={c && !c.ended && c.urgent ? 'danger' : 'ink'} style={{ flex: 1 }} numberOfLines={2}>
                  {line}
                </Txt>
                <Chevron />
              </Row>
            </Pressable>
            {canPay && !g.atOffice ? <Button label={t('reg.fee.pay')} tone="black" size="sm" fill={false} busy={busy === g.key} onPress={() => pay(g)} accessibilityLabel={t('reg.fee.payLabel', { amount: money(payGroup(g.seats.map(payable), payable(g.seats[0]))?.amountCents ?? 0) })} /> : null}
          </Row>
        );
      })}
      {error ? <Banner tone="error" message={error} /> : null}
    </View>
  );
}
