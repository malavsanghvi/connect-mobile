import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Button, Card, Chevron, Row, Txt, VStack } from '@/components/ui';
import { RepeatGlyph } from '@/features/give/icons';
import { AvailabilityBar, Heading, slotsText, TintTile } from '@/features/give/parts';
import { availabilityFraction, fromAmountCents, opportunityKind, slotsLine } from '@/features/give/rules';
import { startPayment } from '@/features/pay';
import { isBoliOpen, listBolis } from '@/lib/api/bolis';
import { listOpenPledges, listOpportunitiesWithAvailability, loadGiveSummary, type GiveSummary, type OpportunityListItem } from '@/lib/api/giving';
import { report } from '@/lib/errors';
import { formatCents, formatCentsCompact } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { isGiveSectionVisible, type ModuleMap } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * Give (prototype §2.8). Adults only — children see "Ask a parent". The bolis
 * card needs the bolis module; everything else is the giving module. The tab
 * itself is hidden when neither is on.
 */
export default function GiveScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center, setGuest } = useApp();
  const { invalidate } = useDataVersion();
  const year = Number((member?.today ?? '2026').slice(0, 4));
  const { map } = useModules();
  const givingOn = isGiveSectionVisible(map, 'summary');
  const bolisOn = isGiveSectionVisible(map, 'bolis');
  const state = useLoad(
    async () => {
      if (!member?.household || !center) return null;
      const [summary, opps, bolis, openPledges] = await Promise.all([
        givingOn ? loadGiveSummary(member.household.id, year) : null,
        givingOn ? listOpportunitiesWithAvailability(center.id) : [],
        bolisOn ? listBolis(center.id) : [],
        givingOn ? listOpenPledges(member.household.id) : [],
      ]);
      const now = new Date();
      return {
        summary,
        opps,
        openPledges,
        openDigital: bolis.filter((b) => b.kind === 'digital' && isBoliOpen(b, b.summary, now)).length,
        inPerson: bolis.filter((b) => b.kind === 'in_person' && (b.status === 'open' || b.status === 'paused')).length,
      };
    },
    [member?.household?.id, center?.id, year, givingOn, bolisOn],
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
        {(data) => (data ? <GiveBody {...data} map={map} /> : <EmptyState icon="people-outline" title={t('give.noHousehold')} />)}
      </Loaded>
    </Screen>
  );
}

type GiveBodyProps = { summary: GiveSummary | null; opps: OpportunityListItem[]; openDigital: number; inPerson: number; openPledges: { id: string; pledge_number: string | null }[]; map: ModuleMap };

function GiveBody({ summary, opps, openDigital, inPerson, openPledges, map }: GiveBodyProps) {
  const t = useT();
  const router = useRouter();
  const bolisCard = isGiveSectionVisible(map, 'bolis') ? <BolisCard openDigital={openDigital} inPerson={inPerson} /> : null;
  // Giving switched off (bolis only): just the bolis card.
  if (!summary || !isGiveSectionVisible(map, 'summary')) return <VStack gap={14}>{bolisCard}</VStack>;
  const payOpen = () => {
    const ids = openPledges.map((p) => p.id);
    startPayment({
      amountCents: summary.openCents,
      forLabel: ids.length === 1 && openPledges[0].pledge_number ? t('pay.forPledge', { pledge: openPledges[0].pledge_number }) : t('pay.forPledges', { n: ids.length }),
      pledgeIds: ids,
      context: 'pledges',
    }).catch((err: unknown) => report(err, 'open the payment sheet'));
  };
  return (
    <VStack gap={14}>
      <Card tone="navy" hero style={{ paddingVertical: 18, paddingHorizontal: space.gutter, gap: 4 }}>
        <Txt variant="meta" color="onNavy">
          {t('give.heroTitle', { year: summary.year })}
        </Txt>
        <Txt variant="hero" color="white" style={{ fontFamily: fonts.display }} accessibilityRole="header">
          {formatCents(summary.givenThisYearCents)}
        </Txt>
        <Txt variant="meta" color="onNavy">
          {t('give.heroSub')}
        </Txt>
      </Card>

      {bolisCard}

      <Heading>{t('give.opportunities')}</Heading>
      {opps.length === 0 ? <EmptyState icon="gift-outline" title={t('give.noOpportunities')} /> : null}
      {opps.map((o) => {
        const from = fromAmountCents(o);
        const fraction = availabilityFraction(o.availability);
        const kind = opportunityKind(o.kind);
        const sub = o.subtitle?.trim() || o.campaign?.name || null;
        return (
          <Card key={o.id} onPress={() => router.push({ pathname: '/opportunity/[id]', params: { id: o.id } })} accessibilityLabel={[o.name, sub].filter(Boolean).join('. ')}>
            <Row style={{ justifyContent: 'space-between' }} align="flex-start" gap={space.sm}>
              <Txt variant="body" style={{ flex: 1, fontFamily: fonts.bodySemi }}>
                {o.name}
              </Txt>
              <Txt variant="body" color="brown" style={{ fontFamily: fonts.bodySemi }}>
                {from ? t('give.from', { amount: kind === 'amount' ? formatCentsCompact(from) : formatCents(from) }) : t('give.anyAmount')}
              </Txt>
            </Row>
            {sub ? (
              <Txt variant="meta" color="muted">
                {sub}
              </Txt>
            ) : null}
            {fraction !== null ? <AvailabilityBar fraction={fraction} label={slotsText(t, slotsLine(kind, o.availability, (o.campaign?.goal_cents ?? 0) > 0))} /> : null}
          </Card>
        );
      })}

      <Card onPress={() => router.push('/recurring')} accessibilityLabel={`${t('give.recurring')}. ${t('give.recurringSub', { n: summary.recurringActive, amount: formatCents(summary.recurringYearlyCents) })}`}>
        <Row gap={space.md}>
          <View style={{ width: 44, height: 44, borderRadius: radii.lg, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' }}>
            <RepeatGlyph color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
              {t('give.recurring')}
            </Txt>
            <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
              {t('give.recurringSub', { n: summary.recurringActive, amount: formatCents(summary.recurringYearlyCents) })}
            </Txt>
          </View>
          <Chevron />
        </Row>
      </Card>

      <Heading>{t('give.familyPledges')}</Heading>
      <Card style={{ gap: 10 }}>
        <Row gap={space.sm} align="stretch">
          <TintTile tone="amber" label={t('give.openBalance', { n: summary.openCount })} value={formatCents(summary.openCents)} />
          <TintTile tone="green" label={t('give.paidIn', { year: summary.year })} value={formatCents(summary.paidThisYearCents)} />
        </Row>
        <Button label={t('give.seeAllPledges')} tone="secondary" size="md" style={{ borderRadius: radii.pill }} onPress={() => router.push('/pledges')} />
      </Card>

      {summary.openCents > 0 ? <Button label={t('give.payOpen', { amount: formatCents(summary.openCents) })} onPress={payOpen} /> : null}
    </VStack>
  );
}

/** Amber "Bolis" card: open digital bolis and in-person bolis at the Jain Center. */
function BolisCard({ openDigital, inPerson }: { openDigital: number; inPerson: number }) {
  const t = useT();
  const router = useRouter();
  return (
    <Card tone="amber" onPress={() => router.push('/bolis')} accessibilityLabel={`${t('give.bolis')}. ${t('give.bolisSub', { open: openDigital, inPerson })}`}>
      <Row gap={space.md}>
        <View style={{ flex: 1 }}>
          <Txt variant="section" color="brownDark">
            {t('give.bolis')}
          </Txt>
          <Txt variant="meta" color="brownDark">
            {t('give.bolisSub', { open: openDigital, inPerson })}
          </Txt>
        </View>
        <Txt color="brownDark" style={{ fontSize: 22, lineHeight: 26 }}>
          {'\u203A'}
        </Txt>
      </Row>
    </Card>
  );
}
