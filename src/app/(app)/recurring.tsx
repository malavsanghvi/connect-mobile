import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, LinkText, Row, Txt, VStack } from '@/components/ui';
import { freqLabel, methodLabel } from '@/features/give/labels';
import { recurringState, type RecurringState } from '@/features/give/rules';
import type { Translate } from '@/i18n';
import { listRecurring, setRecurringStatus, type RecurringGift } from '@/lib/api/giving';
import { report } from '@/lib/errors';
import { formatCents, formatLongDate } from '@/lib/format';
import { annualEstimateCents } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

const STATE_LOOK: Record<RecurringState, { key: Parameters<Translate>[0]; color: string }> = {
  active: { key: 'recurring.active', color: colors.green },
  paused: { key: 'recurring.paused', color: colors.brown },
  waiting: { key: 'recurring.waiting', color: colors.brown },
  failed: { key: 'recurring.failed', color: colors.danger },
  stopped: { key: 'recurring.cancelled', color: colors.muted },
};

/** Recurring giving (prototype Main.dc.html L1222–1233). Pause / resume / edit; new gifts via recurring-setup. */
export default function RecurringScreen() {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  const { invalidate } = useDataVersion();
  const { toast } = useFeedback();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useLoad(() => (member?.household ? listRecurring(member.household.id) : Promise.resolve([])), [member?.household?.id], 'load your recurring gifts');

  if (!member?.isAdult) {
    return (
      <Screen title={t('recurring.title')}>
        <LockedState />
      </Screen>
    );
  }

  const toggle = async (g: RecurringGift) => {
    setBusyId(g.id);
    setError(null);
    try {
      await setRecurringStatus(g.id, g.status === 'active' ? 'paused' : 'active');
      invalidate();
      toast(g.status === 'active' ? t('recurring.pausedToast') : t('recurring.resumedToast'));
    } catch (err) {
      setError(report(err, g.status === 'active' ? 'pause this recurring gift' : 'resume this recurring gift').userMessage);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen title={t('recurring.title')} onRefresh={async () => invalidate()}>
      <Loaded state={state}>
        {(gifts) => {
          const active = gifts.filter((g) => g.status === 'active');
          const yearly = active.reduce((s, g) => s + annualEstimateCents(g.amount_cents, g.frequency), 0);
          return (
            <VStack gap={space.md}>
              <View style={{ backgroundColor: colors.greenTint, borderRadius: radii.row, paddingVertical: 14, paddingHorizontal: space.lg }}>
                <Txt variant="caption" color="greenDark2" style={{ fontFamily: fonts.body }}>
                  {t('recurring.heroTitle')}
                </Txt>
                <Txt color="green" style={{ fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 28 }}>
                  {formatCents(yearly)}
                </Txt>
                <Txt variant="caption" color="greenDark2" style={{ fontFamily: fonts.body }}>
                  {t('recurring.activeOf', { a: active.length, n: gifts.length })}
                </Txt>
              </View>
              {error ? <Banner tone="error" message={error} /> : null}
              {gifts.length === 0 ? <EmptyState icon="repeat" title={t('recurring.none')} /> : null}
              {gifts.map((g) => {
                const st = recurringState(g);
                const look = STATE_LOOK[st];
                const since = g.starts_on ?? g.created_at.slice(0, 10);
                const canToggle = st === 'active' || st === 'paused';
                return (
                  <View key={g.id} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: 14, gap: space.sm }}>
                    <Row style={{ justifyContent: 'space-between' }} align="flex-start" gap={space.sm}>
                      <View style={{ flex: 1 }}>
                        <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
                          {g.purpose}
                        </Txt>
                        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                          {[freqLabel(t, g.frequency), t(st === 'waiting' ? 'recurring.starts' : 'recurring.since', { date: formatLongDate(since) }), methodLabel(t, g.method)].join(' · ')}
                        </Txt>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Txt variant="section" style={{ fontFamily: fonts.bodyBold }}>
                          {formatCents(g.amount_cents)}
                        </Txt>
                        <Txt variant="fine" style={{ color: look.color, fontFamily: fonts.bodyBold }}>
                          {t(look.key)}
                        </Txt>
                      </View>
                    </Row>
                    {st === 'waiting' ? (
                      <Txt variant="caption" color="brownText" style={{ fontFamily: fonts.body }}>
                        {t('recurring.waitingNote')}
                      </Txt>
                    ) : null}
                    {st !== 'stopped' ? (
                      <Row gap={space.sm}>
                        {canToggle ? (
                          <Button label={st === 'active' ? t('recurring.pause') : t('recurring.resume')} tone="secondary" size="sm" fill={false} style={{ minHeight: 40, borderRadius: radii.xl }} onPress={() => toggle(g)} busy={busyId === g.id} />
                        ) : null}
                        <LinkText label={t('recurring.edit')} onPress={() => router.push({ pathname: '/recurring-setup', params: { id: g.id } })} />
                      </Row>
                    ) : null}
                  </View>
                );
              })}
              <Button label={t('recurring.setUp')} onPress={() => router.push('/recurring-setup')} />
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
