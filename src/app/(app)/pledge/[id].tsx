import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, dotted, Ident, Row, Txt, VStack } from '@/components/ui';
import { pledgeTitle } from '@/features/give/pledge-labels';
import { evidenceLine, ProofFiles, proofMethodName, Timeline } from '@/features/pay/proof-parts';
import type { Translate } from '@/i18n';
import type { StringKey } from '@/i18n/en';
import { getPledgeDetail, listPledgePayments, type PledgeWithPeople } from '@/lib/api/giving';
import { pledgeEvidence } from '@/lib/api/proofs';
import { report } from '@/lib/errors';
import { formatCents, formatLongDate, fullName } from '@/lib/format';
import { openableFiles, pledgeTimeline, removedFiles, type EvidenceItem, type PledgePayment } from '@/lib/proofs';
import { isSoftCreditPledge, openBalanceCents, softCreditOf } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useModule } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

type Data = { pledge: PledgeWithPeople | null; payments: PledgePayment[]; evidence: EvidenceItem[]; /** Why the proofs could not be loaded (the pledge still shows), or null. */ evidenceError: string | null };

function statusText(t: Translate, p: PledgeWithPeople): { label: string; tone: 'green' | 'navy' | 'amber' | 'grey' } {
  switch (p.status) {
    case 'paid':
      return { label: p.closed_at ? t('pledges.paidOn', { date: formatLongDate(p.closed_at.slice(0, 10)) }) : t('pledges.paid'), tone: 'green' };
    case 'soft_credit':
      return { label: t('pledges.softCredit'), tone: 'navy' };
    case 'partially_paid':
      return { label: t('pledges.partly', { amount: formatCents(p.paid_cents) }), tone: 'amber' };
    case 'cancelled':
      return { label: t('pledges.cancelled'), tone: 'grey' };
    case 'written_off':
      return { label: t('pledges.writtenOff'), tone: 'grey' };
    default:
      return { label: t('pledges.open'), tone: 'amber' };
  }
}

/** Pledge details (docs/PAYMENT_PROOFS_AND_RECONCILIATION_PLAN.md §4.1): any pledge, any status, any year. Adults only. */
export default function PledgeDetailsScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useApp();
  const proofsOn = useModule('giving_proofs');
  const names = new Map((member?.members ?? []).map((m) => [m.person.id, fullName(m.person)]));
  const state = useLoad<Data | null>(
    async () => {
      if (!member?.household || !member.isAdult) return null;
      const pledge = await getPledgeDetail(member.household.id, id, names);
      if (!pledge) return { pledge: null, payments: [], evidence: [], evidenceError: null };
      // The proofs fail on their own: the pledge and its payments still show, and the proof section says why, with a retry.
      const [payments, proofs] = await Promise.all([
        listPledgePayments(id),
        proofsOn
          ? pledgeEvidence(id).then(
              (items) => ({ items, error: null as string | null }),
              (err: unknown) => ({ items: [] as EvidenceItem[], error: report(err, 'load your proof').userMessage }),
            )
          : Promise.resolve({ items: [] as EvidenceItem[], error: null as string | null }),
      ]);
      return { pledge, payments, evidence: proofs.items, evidenceError: proofs.error };
    },
    [id, member?.household?.id, member?.isAdult ?? false, proofsOn],
    'load this pledge',
  );

  if (!member?.isAdult) {
    return (
      <Screen title={t('pledge.titleNoNumber')}>
        <LockedState />
      </Screen>
    );
  }
  return (
    <Screen title={t('pledge.titleNoNumber')}>
      <Loaded state={state}>{(data) => (data && data.pledge ? <Details data={{ ...data, pledge: data.pledge }} proofsOn={proofsOn} onRetry={() => void state.reload()} /> : <EmptyState icon="receipt-outline" title={t('pledge.notFound')} />)}</Loaded>
    </Screen>
  );
}

function Details({ data, proofsOn, onRetry }: { data: Data & { pledge: PledgeWithPeople }; proofsOn: boolean; onRetry: () => void }) {
  const t = useT();
  const router = useRouter();
  const { pledge, payments, evidence, evidenceError } = data;
  const title = pledgeTitle(t, pledge);
  const status = statusText(t, pledge);
  const soft = softCreditOf(pledge);
  const left = openBalanceCents(pledge);
  const confirmed = pledge.status === 'paid' && !!pledge.reconciled_at;
  const timeline = pledgeTimeline(pledge, evidence, payments, formatCents, (m) => proofMethodName(t, m)).map((e) => ({ at: e.at, tone: e.tone, text: t(e.key, e.vars) }));
  const statusColor = status.tone === 'green' ? colors.greenDark : status.tone === 'navy' ? colors.navy : status.tone === 'amber' ? colors.brown : colors.muted;
  const statusBg = status.tone === 'green' ? colors.greenTint : status.tone === 'navy' ? colors.navyTint : status.tone === 'amber' ? colors.brownTint : colors.chip;
  return (
    <VStack gap={space.lg}>
      <Card style={{ gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }} align="flex-start" gap={space.md}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="section" accessibilityRole="header">
              {title}
            </Txt>
            <Txt variant="meta" color="muted">
              {dotted([t('pledge.pledgedOn', { date: formatLongDate(pledge.pledged_at.slice(0, 10)) }), pledge.pledge_number ? <Ident>{pledge.pledge_number}</Ident> : null])}
            </Txt>
            {confirmed ? (
              <Txt variant="meta" color="greenDark" style={{ fontFamily: fonts.bodySemi }}>
                {`✓ ${t('pledges.confirmedByBank')}`}
              </Txt>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Txt variant="title">{formatCents(pledge.amount_cents)}</Txt>
            <View style={{ backgroundColor: statusBg, borderRadius: radii.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Txt variant="fine" style={{ color: statusColor, fontFamily: fonts.bodyBold }}>
                {status.label}
              </Txt>
            </View>
          </View>
        </Row>
        {soft > 0 || isSoftCreditPledge(pledge) ? (
          <Txt variant="small" color="navy">
            {[t('pledge.softLine', { amount: formatCents(soft) }), left > 0 ? t('pledges.leftToPay', { amount: formatCents(left) }) : null].filter(Boolean).join(' ')}
          </Txt>
        ) : null}
      </Card>

      <VStack gap={space.sm}>
        <Txt variant="eyebrow" color="muted" accessibilityRole="header">
          {t('pledge.paymentTitle')}
        </Txt>
        {payments.length === 0 ? (
          <Txt variant="small" color="muted">
            {t('pledge.noPayment')}
          </Txt>
        ) : (
          payments.map((p) => (
            <Card key={p.paymentId} style={{ gap: 2 }}>
              <Txt variant="bodyStrong">{t('pledge.paymentLine', { method: proofMethodName(t, p.method), reference: p.checkNumber ? ` ${p.checkNumber}` : '', amount: formatCents(p.totalCents), date: formatLongDate(p.receivedOn) })}</Txt>
              <Txt variant="meta" color="muted">
                {p.receiptNumber
                  ? p.appliedCents < p.totalCents
                    ? t('pledge.paymentCoveredMore', { receipt: p.receiptNumber, applied: formatCents(p.appliedCents), total: formatCents(p.totalCents) })
                    : t('pledge.paymentCovered', { receipt: p.receiptNumber, applied: formatCents(p.appliedCents) })
                  : t('pledge.paymentCoveredNoReceipt', { applied: formatCents(p.appliedCents) })}
              </Txt>
            </Card>
          ))
        )}
      </VStack>

      {proofsOn ? (
        <VStack gap={space.sm}>
          <Txt variant="eyebrow" color="muted" accessibilityRole="header">
            {t('pledge.yourProof')}
          </Txt>
          {evidenceError ? <Banner tone="error" message={evidenceError} action={{ label: t('common.retry'), onPress: onRetry }} /> : null}
          {evidence.length === 0 && !evidenceError ? (
            <Txt variant="small" color="muted">
              {t('pledge.noProof')}
            </Txt>
          ) : (
            evidence.map((item, i) => <EvidenceCard key={`${item.proofId ?? item.paymentId ?? 'x'}-${i}`} item={item} t={t} onOpenProof={item.proofId ? () => router.push({ pathname: '/payment-proofs', params: { proof: item.proofId ?? '' } }) : undefined} />)
          )}
        </VStack>
      ) : null}

      <VStack gap={space.sm}>
        <Txt variant="eyebrow" color="muted" accessibilityRole="header">
          {t('pledge.history')}
        </Txt>
        <Timeline entries={timeline} />
      </VStack>
    </VStack>
  );
}

function EvidenceCard({ item, t, onOpenProof }: { item: EvidenceItem; t: Translate; onOpenProof?: () => void }) {
  const open = openableFiles(item);
  const gone = removedFiles(item);
  const removedOn = gone.map((f) => f.removedOn).find((d): d is string => !!d) ?? null;
  const keptKey: StringKey = item.keptUntil ? 'pledge.keptUntil' : 'pledge.keptWhileOnFile';
  return (
    <Card style={{ gap: space.sm }}>
      {open.length > 0 ? <ProofFiles files={open} /> : null}
      {gone.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Txt variant="smallStrong">{t('pledge.fileRemovedTitle')}</Txt>
          <Txt variant="meta" color="muted">
            {removedOn ? t('pledge.fileRemovedBody', { date: formatLongDate(removedOn.slice(0, 10)) }) : t('pledge.fileRemovedNoDate')}
          </Txt>
        </View>
      ) : null}
      <Txt variant="small" color="ink2">
        {evidenceLine(t, item)}
      </Txt>
      {open.length > 0 ? (
        <Txt variant="meta" color="muted">
          {t(keptKey, { date: item.keptUntil ? formatLongDate(item.keptUntil) : '' })}
        </Txt>
      ) : null}
      {onOpenProof ? <Button label={t('pledge.proofOpen')} tone="ghost" size="md" fill={false} onPress={onOpenProof} /> : null}
    </Card>
  );
}

