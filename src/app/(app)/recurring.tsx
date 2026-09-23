import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Pill, Row, Txt, VStack } from '@/components/ui';
import { listRecurring, setRecurringStatus, type RecurringGift } from '@/lib/api/giving';
import { report } from '@/lib/errors';
import { formatCents, formatLongDate } from '@/lib/format';
import { annualEstimateCents } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import type { Translate } from '@/i18n';
import { space } from '@/theme';

function freqLabel(t: Translate, f: string): string {
  const map: Record<string, Parameters<Translate>[0]> = { weekly: 'recurring.weekly', monthly: 'recurring.monthly', quarterly: 'recurring.quarterly', yearly: 'recurring.yearly', special_day: 'recurring.specialDay' };
  return map[f] ? t(map[f]) : f;
}

/** Recurring gifts (prototype §2.15). Pause / resume; new gifts wait for online payments. */
export default function RecurringScreen() {
  const t = useT();
  const { member } = useApp();
  const { invalidate } = useDataVersion();
  const { toast } = useFeedback();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
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
            <VStack gap={space.lg}>
              <Card tone="green">
                <Txt variant="small" color="greenDark">
                  {t('recurring.heroTitle')}
                </Txt>
                <Txt variant="hero" color="greenDark">
                  {formatCents(yearly)}
                </Txt>
                <Txt variant="meta" color="greenDark">
                  {t('recurring.activeOf', { a: active.length, n: gifts.length })}
                </Txt>
              </Card>
              {error ? <Banner tone="error" message={error} /> : null}
              {gifts.length === 0 ? <EmptyState icon="repeat" title={t('recurring.none')} /> : null}
              {gifts.map((g) => (
                <Card key={g.id}>
                  <Row style={{ justifyContent: 'space-between' }} align="flex-start">
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="cardTitle">{g.purpose}</Txt>
                      <Txt variant="meta" color="muted">
                        {[freqLabel(t, g.frequency), t('recurring.since', { date: formatLongDate(g.created_at.slice(0, 10)) }), g.next_charge_on ? t('recurring.next', { date: formatLongDate(g.next_charge_on) }) : null].filter(Boolean).join(' · ')}
                      </Txt>
                    </View>
                    <VStack gap={4} style={{ alignItems: 'flex-end' }}>
                      <Txt variant="section">{formatCents(g.amount_cents)}</Txt>
                      <Pill label={g.status === 'active' ? t('recurring.active') : g.status === 'paused' ? t('recurring.paused') : g.status === 'failed' ? t('recurring.failed') : t('recurring.cancelled')} tone={g.status === 'active' ? 'green' : g.status === 'failed' ? 'red' : 'grey'} />
                    </VStack>
                  </Row>
                  {g.status === 'active' || g.status === 'paused' ? (
                    <Button label={g.status === 'active' ? t('recurring.pause') : t('recurring.resume')} tone="secondary" size="sm" onPress={() => toggle(g)} busy={busyId === g.id} />
                  ) : null}
                </Card>
              ))}
              {showSetup ? <Banner tone="info" title={t('recurring.setupTitle')} message={t('recurring.setupNotice')} /> : null}
              <Button label={t('recurring.setUp')} tone="green" onPress={() => setShowSetup(true)} icon="add" />
              <Txt variant="meta" color="muted">
                {t('recurring.footer')}
              </Txt>
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
