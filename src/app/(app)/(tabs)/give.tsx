import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Row, Txt, VStack } from '@/components/ui';
import { AvailabilityBar, Heading, slotsText, TintTile } from '@/features/give/parts';
import { availabilityFraction, fromAmountCents, opportunityKind, slotsLine } from '@/features/give/rules';
import { startPayment } from '@/features/pay';
import { HowToGive } from '@/features/pay/how-to-give';
import { otherMethods, type PaymentMethods } from '@/features/pay/methods';
import { ProofSheet, type ProofSheetPledge } from '@/features/pay/proof-sheet';
import { useProofSetup } from '@/features/pay/proof-setup';
import { ZelleReports } from '@/features/pay/zelle';
import type { PaymentReport } from '@/features/pay/zelle-report';
import { isBoliOpen, listBolis } from '@/lib/api/bolis';
import { listPaymentReports, loadPaymentMethods } from '@/lib/api/payments';
import { listOpenPledges, listOpportunitiesWithAvailability, loadGiveSummary, type GiveSummary, type OpenPledge, type OpportunityListItem } from '@/lib/api/giving';
import { AppError, logError, report } from '@/lib/errors';
import { formatCents, formatCentsCompact } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { isGiveSectionVisible, isModuleOn, type ModuleMap } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { fonts, radii, space } from '@/theme';

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
  const oppsOn = isGiveSectionVisible(map, 'opportunities');
  const state = useLoad(
    async () => {
      if (!member?.household || !center) return null;
      const [summary, opps, bolis, openPledges] = await Promise.all([
        givingOn ? loadGiveSummary(member.household.id, year) : null,
        oppsOn ? listOpportunitiesWithAvailability(center.id) : [],
        bolisOn ? listBolis(center.id) : [],
        givingOn ? listOpenPledges(member.household.id) : [],
      ]);
      // How to give (o-payments): a failure here is shown on its card, not over the whole tab.
      const howToGive: HowToGiveState = !givingOn ? null : await loadHowToGive(center.id, member.household.id);
      const now = new Date();
      return {
        summary,
        opps,
        openPledges,
        openDigital: bolis.filter((b) => b.kind === 'digital' && isBoliOpen(b, b.summary, now)).length,
        inPerson: bolis.filter((b) => b.kind === 'in_person' && (b.status === 'open' || b.status === 'paused')).length,
        howToGive,
      };
    },
    [member?.household?.id, center?.id, year, givingOn, bolisOn, oppsOn],
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
        {(data) => (data ? <GiveBody {...data} map={map} onRetry={invalidate} /> : <EmptyState icon="people-outline" title={t('give.noHousehold')} />)}
      </Loaded>
    </Screen>
  );
}

type ReportsState = { reports: PaymentReport[]; error: string | null };
type HowToGiveState = { methods: PaymentMethods | null; reports: ReportsState; error: string | null } | null;

/**
 * The ways to give, and the family's Zelle reports. Each part fails on its own card with a retry. The reports are asked
 * for only from a portal that has the new list (an older one has no reports to show).
 */
async function loadHowToGive(centerId: string, householdId: string): Promise<NonNullable<HowToGiveState>> {
  const none: ReportsState = { reports: [], error: null };
  const loaded = await loadPaymentMethods(centerId).then(
    (methods) => ({ methods, error: null as string | null }),
    (err: unknown) => {
      logError('load how to give', err);
      return { methods: null, error: err instanceof AppError ? err.userMessage : "We couldn't load how to give." };
    },
  );
  if (!loaded.methods || loaded.methods.source !== 'methods') return { ...loaded, reports: none };
  const reports: ReportsState = await listPaymentReports(centerId, householdId).then(
    (r) => ({ reports: r.reports, error: null }),
    // Already logged where it failed; the card says so with a retry.
    (err: unknown) => ({ reports: [], error: err instanceof AppError ? err.userMessage : "We couldn't load your Zelle reports." }),
  );
  return { ...loaded, reports };
}

type GiveBodyProps = { howToGive: HowToGiveState; summary: GiveSummary | null; opps: OpportunityListItem[]; openDigital: number; inPerson: number; openPledges: OpenPledge[]; map: ModuleMap; onRetry: () => void };

function GiveBody({ howToGive, summary, opps, openDigital, inPerson, openPledges, map, onRetry }: GiveBodyProps) {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  // "I paid another way" (the Pay sheet, and Zelle under How to give): the same payment confirmation form as on Family pledges, for all open pledges.
  const proofs = useProofSetup();
  const [proofOpen, setProofOpen] = useState(false);
  const offerForm = !!proofs.setup && openPledges.length > 0;
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
      paidAnotherWay: offerForm ? () => setProofOpen(true) : undefined,
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

      {/* Opportunities is an add-on of Giving (connect-crm 0741). */}
      {isGiveSectionVisible(map, 'opportunities') ? <Heading>{t('give.opportunities')}</Heading> : null}
      {isGiveSectionVisible(map, 'opportunities') && opps.length === 0 ? <EmptyState icon="gift-outline" title={t('give.noOpportunities')} /> : null}
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

      <Heading>{t('give.familyPledges')}</Heading>
      <Card style={{ gap: 10 }}>
        <Row gap={space.sm} align="stretch">
          <TintTile tone="amber" label={t('give.openBalance', { n: summary.openCount })} value={formatCents(summary.openCents)} />
          <TintTile tone="green" label={t('give.paidIn', { year: summary.year })} value={formatCents(summary.paidThisYearCents)} />
        </Row>
        <Button label={t('give.seeAllPledges')} tone="secondary" size="md" style={{ borderRadius: radii.pill }} onPress={() => router.push('/pledges')} />
        {/* Payment proofs (connect-crm 0865): where the family follows what it sent to the treasury team. */}
        {isModuleOn(map, 'giving_proofs') ? <Button label={t('pledges.myProofs')} tone="secondary" size="md" style={{ borderRadius: radii.pill }} onPress={() => router.push('/payment-proofs')} /> : null}
        {/* Recurring is an option on each opportunity, not a third list. Families that already have a gift keep a way to pause, change or stop it. */}
        {summary.recurringTotal > 0 && isGiveSectionVisible(map, 'recurring') ? (
          <Button
            label={t('give.recurringLink', { n: summary.recurringActive, amount: formatCents(summary.recurringYearlyCents) })}
            tone="secondary"
            size="md"
            style={{ borderRadius: radii.pill }}
            onPress={() => router.push('/recurring')}
          />
        ) : null}
      </Card>

      {proofs.error ? <Banner tone="error" message={proofs.error.userMessage} action={{ label: t('common.retry'), onPress: proofs.reload }} /> : null}
      {summary.openCents > 0 ? <Button label={t('give.payOpen', { amount: formatCents(summary.openCents) })} onPress={payOpen} /> : null}
      {offerForm && proofs.setup && center && member?.household ? (
        <ProofSheet
          visible={proofOpen}
          onClose={() => setProofOpen(false)}
          setup={proofs.setup}
          centerId={center.id}
          householdId={member.household.id}
          today={member.today}
          pledges={openPledges.map((p): ProofSheetPledge => ({ ...p, title: p.pledge_number ? t('pay.forPledge', { pledge: p.pledge_number }) : t('zelle.pledgeNoNumber'), number: p.pledge_number }))}
          entry="open_pledges"
        />
      ) : null}

      {howToGive ? (
        <>
          <Heading>{t('howToGive.title')}</Heading>
          <Card style={{ gap: 10 }}>
            {howToGive.error ? (
              <Banner tone="error" message={howToGive.error} action={{ label: t('common.retry'), onPress: onRetry }} />
            ) : (
              <HowToGive methods={otherMethods(howToGive.methods)} onPaidAnotherWay={offerForm ? () => setProofOpen(true) : undefined} />
            )}
            <Txt variant="meta" color="muted">
              {t('howToGive.intro')}
            </Txt>
          </Card>
          {/* A report is not a gift: nothing in this card is added to any total above. */}
          {howToGive.reports.error || howToGive.reports.reports.length > 0 ? (
            <>
              <Heading>{t('zelle.reportsTitle')}</Heading>
              <Card style={{ gap: 10 }}>
                {howToGive.reports.error ? (
                  <Banner tone="error" message={howToGive.reports.error} action={{ label: t('common.retry'), onPress: onRetry }} />
                ) : (
                  <ZelleReports reports={howToGive.reports.reports} pledgeNumbers={new Map(openPledges.flatMap((p) => (p.pledge_number ? [[p.id, p.pledge_number] as const] : [])))} onChanged={onRetry} />
                )}
                <Txt variant="meta" color="muted">
                  {t('zelle.reportsFootnote')}
                </Txt>
              </Card>
            </>
          ) : null}
        </>
      ) : null}
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
