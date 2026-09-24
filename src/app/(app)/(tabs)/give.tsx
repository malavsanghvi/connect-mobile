import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Button, Card, ProgressBar, Row, SectionTitle, Stat, Txt, VStack } from '@/components/ui';
import { isBoliOpen, listBolis } from '@/lib/api/bolis';
import { listOpportunities, loadGiveSummary, type GiveSummary, type OpportunityWithCampaign } from '@/lib/api/giving';
import { formatCents } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

/** Give (prototype §2.8). Adults only — children see "Ask a parent". */
export default function GiveScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center, setGuest } = useApp();
  const { invalidate } = useDataVersion();
  const year = Number((member?.today ?? '2026').slice(0, 4));
  const state = useLoad(
    async () => {
      if (!member?.household || !center) return null;
      const [summary, opps, bolis] = await Promise.all([loadGiveSummary(member.household.id, year), listOpportunities(center.id), listBolis(center.id)]);
      const now = new Date();
      return {
        summary,
        opps,
        openDigital: bolis.filter((b) => b.kind === 'digital' && isBoliOpen(b, b.summary, now)).length,
        inPerson: bolis.filter((b) => b.kind === 'in_person' && (b.status === 'open' || b.status === 'paused')).length,
      };
    },
    [member?.household?.id, center?.id, year],
    'load giving',
  );

  if (!member) {
    return (
      <Screen title={t('tab.give')} root>
        <Card tone="panel">
          <Txt variant="small">{t('give.signIn')}</Txt>
          <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
        </Card>
      </Screen>
    );
  }
  if (!member.isAdult) {
    return (
      <Screen title={t('tab.give')} root>
        <LockedState onBack={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen title={t('tab.give')} root onRefresh={async () => invalidate()}>
      <Loaded state={state}>
        {(data) => (data ? <GiveBody {...data} /> : <EmptyState icon="people-outline" title={t('give.noHousehold')} />)}
      </Loaded>
    </Screen>
  );
}

function GiveBody({ summary, opps, openDigital, inPerson }: { summary: GiveSummary; opps: OpportunityWithCampaign[]; openDigital: number; inPerson: number }) {
  const t = useT();
  const router = useRouter();
  const { payNotice } = useFeedback();
  return (
    <VStack gap={space.lg}>
      <Card tone="navy">
        <Txt variant="small" color="onNavy">
          {t('give.heroTitle', { year: summary.year })}
        </Txt>
        <Txt variant="hero" color="white" accessibilityRole="header">
          {formatCents(summary.givenThisYearCents)}
        </Txt>
        <Txt variant="meta" color="onNavy">
          {t('give.heroSub')}
        </Txt>
      </Card>

      <Card tone="amber" onPress={() => router.push('/bolis')} accessibilityLabel={t('give.bolis')}>
        <Row gap={space.md}>
          <Icon name="ribbon-outline" size={26} color={colors.brown} />
          <View style={{ flex: 1 }}>
            <Txt variant="cardTitle" color="brownDark">
              {t('give.bolis')}
            </Txt>
            <Txt variant="meta" color="brownText">
              {t('give.bolisSub', { open: openDigital, inPerson })}
            </Txt>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.brown} />
        </Row>
      </Card>

      <SectionTitle>{t('give.opportunities')}</SectionTitle>
      {opps.length === 0 ? <EmptyState icon="gift-outline" title={t('give.noOpportunities')} /> : null}
      {opps.map((o) => {
        const from = o.amount_cents ?? o.min_amount_cents;
        const pct = o.quantity_available ? o.quantity_taken / o.quantity_available : null;
        return (
          <Card key={o.id} onPress={() => router.push({ pathname: '/opportunity/[id]', params: { id: o.id } })} accessibilityLabel={o.name}>
            <Row style={{ justifyContent: 'space-between' }} align="flex-start">
              <Txt variant="cardTitle" style={{ flex: 1 }}>
                {o.name}
              </Txt>
              <Txt variant="smallStrong" color="brown">
                {from ? t('give.from', { amount: formatCents(from) }) : t('give.anyAmount')}
              </Txt>
            </Row>
            {o.campaign?.name ? (
              <Txt variant="meta" color="muted">
                {o.campaign.name}
              </Txt>
            ) : null}
            {pct !== null ? (
              <>
                <ProgressBar value={pct} color={colors.saffron} label={t('give.taken', { taken: o.quantity_taken, total: o.quantity_available ?? 0 })} />
                <Txt variant="caption" color="muted">
                  {t('give.taken', { taken: o.quantity_taken, total: o.quantity_available ?? 0 })}
                </Txt>
              </>
            ) : null}
          </Card>
        );
      })}

      <Card onPress={() => router.push('/recurring')} accessibilityLabel={t('give.recurring')}>
        <Row gap={space.md}>
          <Icon name="repeat" size={24} color={colors.green} />
          <View style={{ flex: 1 }}>
            <Txt variant="cardTitle">{t('give.recurring')}</Txt>
            <Txt variant="meta" color="muted">
              {t('give.recurringSub', { n: summary.recurringActive, amount: formatCents(summary.recurringYearlyCents) })}
            </Txt>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.faint} />
        </Row>
      </Card>

      <Card>
        <Txt variant="cardTitle">{t('give.familyPledges')}</Txt>
        <Row gap={space.md}>
          <Stat label={t('give.openBalance', { n: summary.openCount })} value={formatCents(summary.openCents)} color="brown" />
          <Stat label={t('give.paidIn', { year: summary.year })} value={formatCents(summary.paidThisYearCents)} color="green" />
        </Row>
        <Button label={t('give.seeAllPledges')} tone="secondary" size="md" onPress={() => router.push('/pledges')} />
      </Card>

      {summary.openCents > 0 ? <Button label={t('give.payOpen', { amount: formatCents(summary.openCents) })} tone="brown" onPress={() => payNotice({ amountLabel: formatCents(summary.openCents) })} /> : null}
    </VStack>
  );
}
