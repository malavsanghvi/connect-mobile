import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Chip, ChipGroup, dotted, Ident, Pill, Row, Segmented, Txt, VStack } from '@/components/ui';
import { ChevronGlyph } from '@/features/give/icons';
import { pledgeSubtitle, pledgeTitle } from '@/features/give/pledge-labels';
import { CheckBox, TintTile } from '@/features/give/parts';
import { isYearOpen } from '@/features/give/rules';
import { startPayment } from '@/features/pay';
import { PaidAnotherWay } from '@/features/pay/paid-another-way';
import { ProofSheet, type ProofSheetPledge } from '@/features/pay/proof-sheet';
import { useProofSetup } from '@/features/pay/proof-setup';
import { pledgesWithWaitingReport } from '@/features/pay/zelle-report';
import type { Translate } from '@/i18n';
import { BUCKETS, signedUrl } from '@/lib/api/files';
import { listPledges, type PledgeWithPeople } from '@/lib/api/giving';
import { listPaymentReports } from '@/lib/api/payments';
import { myPaymentProofs } from '@/lib/api/proofs';
import type { Tables } from '@/lib/database.types';
import { report } from '@/lib/errors';
import { formatCents, formatLongDate, fullName } from '@/lib/format';
import { pledgesWithProofAttached } from '@/lib/proofs';
import { filterPledges, groupPledgesByYear, isPayablePledge, isSoftCreditPledge, openBalanceCents, pledgeTotals, softCreditOf, type PledgeFilter } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useModule } from '@/providers/modules';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

function statusPill(t: Translate, p: PledgeWithPeople): { label: string; fg: string; bg: string } {
  switch (p.status) {
    case 'paid':
      return { label: p.closed_at ? t('pledges.paidOn', { date: formatLongDate(p.closed_at.slice(0, 10)) }) : t('pledges.paid'), fg: colors.greenDark, bg: colors.greenTint };
    case 'soft_credit':
      return { label: t('pledges.softCredit'), fg: colors.navy, bg: colors.navyTint };
    case 'partially_paid':
      return { label: t('pledges.partly', { amount: formatCents(p.paid_cents) }), fg: colors.brown, bg: colors.brownTint };
    case 'cancelled':
      return { label: t('pledges.cancelled'), fg: colors.muted, bg: colors.chip };
    case 'written_off':
      return { label: t('pledges.writtenOff'), fg: colors.muted, bg: colors.chip };
    default:
      return { label: t('pledges.open'), fg: colors.brown, bg: colors.brownTint };
  }
}

function PledgeRow({ t, p, selected, onToggle, onOpen, reported, hasProof }: { t: Translate; p: PledgeWithPeople; selected: boolean; onToggle: () => void; onOpen: () => void; reported: boolean; hasProof: boolean }) {
  const payable = isPayablePledge(p);
  const title = pledgeTitle(t, p);
  const sub = pledgeSubtitle(t, p, title);
  const meta = dotted([p.pledgedByName ? t('pledges.by', { name: p.pledgedByName }) : null, formatLongDate(p.pledged_at.slice(0, 10)), p.pledge_number ? <Ident>{p.pledge_number}</Ident> : null]);
  const pill = statusPill(t, p);
  const soft = softCreditOf(p);
  const waitingChip = payable && soft > 0;
  const softCredited = isSoftCreditPledge(p);
  const confirmed = p.status === 'paid' && !!p.reconciled_at;
  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: selected ? colors.navy : colors.border, borderRadius: radii.row, flexDirection: 'row', alignItems: 'center' }}>
      {payable ? (
        <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={t('pledges.selectOne', { name: title, amount: formatCents(openBalanceCents(p)) })} hitSlop={8} style={{ paddingLeft: 14, paddingVertical: space.md }}>
          <CheckBox checked={selected} color={colors.navy} size={28} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={t('pledges.openDetails', { name: title })}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: 14, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
            {title}
          </Txt>
          {sub ? (
            <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
              {sub}
            </Txt>
          ) : null}
          <Txt variant="fine" color="faint">
            {meta}
          </Txt>
          {softCredited ? (
            <Txt variant="fine" color="navy" style={{ fontFamily: fonts.bodySemi }}>
              {t('pledges.waitingForTeam')}
            </Txt>
          ) : null}
          {waitingChip ? (
            <Txt variant="fine" color="brownText" style={{ fontFamily: fonts.bodySemi }}>
              {t('pledges.leftToPay', { amount: formatCents(openBalanceCents(p)) })}
            </Txt>
          ) : null}
          {confirmed ? (
            <Txt variant="fine" color="greenDark" style={{ fontFamily: fonts.bodySemi }}>
              {`✓ ${t('pledges.confirmedByBank')}`}
            </Txt>
          ) : null}
          {/* A closed pledge the family sent a proof for: a small text mark, so it can be told apart without opening each one. */}
          {hasProof && !payable && !softCredited ? (
            <Txt variant="fine" color="navy" style={{ fontFamily: fonts.bodySemi }}>
              {t('pledges.proofAttached')}
            </Txt>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          <Txt variant="section" style={{ fontFamily: fonts.bodyBold }}>
            {formatCents(p.amount_cents)}
          </Txt>
          <View style={{ backgroundColor: pill.bg, borderRadius: radii.sm, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 }}>
            <Txt variant="fine" style={{ color: pill.fg, fontFamily: fonts.bodyBold }}>
              {pill.label}
            </Txt>
          </View>
          {/* Soft credit on a pledge that is still partly to pay: a chip, like the Zelle "Reported" chip. The amounts above do not change. */}
          {waitingChip ? (
            <View style={{ marginTop: 4, alignSelf: 'flex-end' }}>
              <Pill label={t('pledges.softCreditWaiting', { amount: formatCents(soft) })} tone="navy" />
            </View>
          ) : null}
          {/* A Zelle the family reported for this pledge, waiting for the treasurer. It is not payment: the amounts and status above do not change. */}
          {reported ? (
            <View accessible accessibilityLabel={t('zelle.reportedA11y')} style={{ marginTop: 4, alignSelf: 'flex-end' }}>
              <Pill label={t('zelle.status.reported')} tone="amber" />
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

/** Family pledges (prototype Main.dc.html L928–981): years, summary tiles, filter, collapsible year groups, pay. Adults only. */
export default function PledgesScreen() {
  const { t } = useSettings();
  const router = useRouter();
  const { member, center } = useApp();
  const { invalidate } = useDataVersion();
  const { toast } = useFeedback();
  // Giving's add-ons (connect-crm 0741): Zelle reports belong to Bank reconciliation, tax statements to Statements, payment proofs to Payment proofs.
  const bankOn = useModule('giving_bank');
  const statementsOn = useModule('giving_statements');
  const proofsOn = useModule('giving_proofs');
  const proofs = useProofSetup();
  const names = new Map((member?.members ?? []).map((m) => [m.person.id, fullName(m.person)]));
  const state = useLoad(
    () => (member?.household ? listPledges(member.household.id, names) : Promise.resolve({ pledges: [], paymentsByYear: {}, statements: [] })),
    [member?.household?.id],
    'load your pledges',
  );
  // The family's Zelle reports (a "Reported" chip on the pledges they name). They are never added to any amount here.
  // An older portal has none to show; any other failure is said on the screen, with a retry.
  const reports = useLoad(
    async () => (member?.household && center && member.isAdult && bankOn ? (await listPaymentReports(center.id, member.household.id)).reports : []),
    [member?.household?.id, center?.id, member?.isAdult ?? false, bankOn],
    'load your Zelle reports',
  );
  const reportedPledges = pledgesWithWaitingReport(reports.data ?? []);
  // The proofs the family sent, in ONE request for the whole family (never one per row), to mark the closed pledges that have one.
  const sentProofs = useLoad(
    async () => (member?.household && center && member.isAdult && proofsOn ? await myPaymentProofs(center.id, member.household.id) : []),
    [member?.household?.id, center?.id, member?.isAdult ?? false, proofsOn],
    'load your payment proofs',
  );
  const proofPledgeIds = pledgesWithProofAttached(sentProofs.data ?? []);
  const [year, setYear] = useState<number | null>(null);
  const [filter, setFilter] = useState<PledgeFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [openYears, setOpenYears] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);

  if (!member?.isAdult) {
    return (
      <Screen title={t('pledges.title')}>
        <LockedState />
      </Screen>
    );
  }

  const currentYear = Number(member.today.slice(0, 4));

  const openStatement = async (y: number, statement: Tables<'statements'> | undefined) => {
    setError(null);
    if (y >= currentYear) return;
    if (!statement?.storage_path) {
      toast(t('pledges.statementNotStored', { year: y }), 'info');
      return;
    }
    try {
      const url = await signedUrl(statement.storage_path, BUCKETS.statements, `open your ${y} tax statement`);
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      setError(report(err, `open your ${y} tax statement`).userMessage);
    }
  };

  return (
    <Screen title={t('pledges.title')} onRefresh={async () => invalidate()}>
      <Loaded state={state}>
        {({ pledges, paymentsByYear, statements }) => {
          const years = [...new Set(pledges.map((p) => Number(p.pledged_at.slice(0, 4))))].sort((a, b) => b - a);
          const groups = groupPledgesByYear(filterPledges(pledges, 'all', year));
          const groupYears = groups.map((g) => g.year);
          // Owner rule (2026-10-15): Open balance = amount - paid - soft credit over the pledges that are Open or Partly paid. Soft credit is its own figure.
          const totals = pledgeTotals(pledges);
          const payable = pledges.filter(isPayablePledge);
          const paidCents = year ? (paymentsByYear[year] ?? 0) : Object.values(paymentsByYear).reduce((s, v) => s + v, 0);
          const sel = payable.filter((p) => selected.includes(p.id));
          const selCents = sel.reduce((s, p) => s + openBalanceCents(p), 0);
          const proofPledges: ProofSheetPledge[] = payable.map((p) => ({ ...p, title: pledgeTitle(t, p), number: p.pledge_number }));
          const pay = () =>
            startPayment({
              amountCents: selCents,
              forLabel: sel.length === 1 && sel[0].pledge_number ? t('pay.forPledge', { pledge: sel[0].pledge_number }) : t('pay.forPledges', { n: sel.length }),
              pledgeIds: sel.map((p) => p.id),
              context: 'pledges',
              // Shown on the sheet only when nothing can be paid online: the sheet closes, then the proof sheet opens for the ticked pledges.
              alternative: proofs.setup ? { label: t('pledges.paidAnotherWay'), run: () => setProofOpen(true) } : undefined,
            }).catch((err: unknown) => setError(report(err, 'open the payment sheet').userMessage));
          return (
            <VStack gap={space.md}>
              <ChipGroup>
                <Chip label={t('pledges.allYears')} selected={year === null} onPress={() => setYear(null)} />
                {years.map((y) => (
                  <Chip key={y} label={String(y)} selected={year === y} onPress={() => setYear(y)} />
                ))}
              </ChipGroup>
              <Row gap={space.sm} align="stretch">
                <TintTile tone="amber" size={18} label={t('pledges.openBalance')} value={formatCents(totals.openCents)} sub={t('pledges.nOpen', { n: totals.openCount })} />
                <TintTile tone="navy" size={18} label={t('pledges.tileSoftCredit')} value={formatCents(totals.softCreditCents)} sub={totals.softCreditCents > 0 ? t('pledges.tileSoftCreditSub') : t('pledges.tileSoftCreditNone')} />
                <TintTile tone="green" size={18} label={year ? t('give.paidIn', { year }) : t('pledges.paidAllYears')} value={formatCents(paidCents)} sub={t('pledges.closedOverall', { n: totals.closedCount })} />
              </Row>
              {totals.softCreditCents > 0 ? <Banner tone="info" message={t('pledges.proofWithTeam', { amount: formatCents(totals.softCreditCents) })} /> : null}
              <Segmented
                label={t('pledges.filter')}
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: t('pledges.all') },
                  { value: 'open', label: t('pledges.open') },
                  { value: 'closed', label: t('pledges.closed') },
                ]}
              />
              {error ? <Banner tone="error" message={error} /> : null}
              {reports.error ? <Banner tone="error" message={reports.error.userMessage} action={{ label: t('common.retry'), onPress: () => void reports.reload() }} /> : null}
              {sentProofs.error ? <Banner tone="error" message={sentProofs.error.userMessage} action={{ label: t('common.retry'), onPress: () => void sentProofs.reload() }} /> : null}
              {proofs.error ? <Banner tone="error" message={proofs.error.userMessage} action={{ label: t('common.retry'), onPress: proofs.reload }} /> : null}
              {pledges.length === 0 ? <EmptyState icon="receipt-outline" title={t('pledges.none')} /> : null}
              {groups.map((g) => {
                const statement = statements.find((s) => s.tax_year === g.year && s.kind === 'tax_year');
                const isOpen = isYearOpen(g.year, groupYears, year, currentYear, openYears);
                const rows = filterPledges(g.pledges, filter, null);
                return (
                  <VStack key={g.year} gap={space.sm}>
                    <Row align="flex-end" style={{ justifyContent: 'space-between', paddingTop: 6, paddingHorizontal: 2, borderBottomWidth: 2, borderBottomColor: colors.navy }}>
                      <Pressable
                        onPress={() => setOpenYears({ ...openYears, [g.year]: !isOpen })}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                        accessibilityLabel={t('pledges.toggleYear', { year: g.year })}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.min, paddingBottom: 6 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.navyTint, alignItems: 'center', justifyContent: 'center' }}>
                          <ChevronGlyph color={colors.navy} rotate={isOpen ? 90 : 0} />
                        </View>
                        <View>
                          <Txt variant="title" color="navy">
                            {String(g.year)}
                          </Txt>
                          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                            {t(g.pledges.length === 1 ? 'pledges.groupLineOne' : 'pledges.groupLine', { n: g.pledges.length, pledged: formatCents(g.pledgedCents), paid: formatCents(g.paidCents) })}
                          </Txt>
                        </View>
                      </Pressable>
                      {statementsOn ? (
                      <Pressable
                        onPress={() => void openStatement(g.year, statement)}
                        disabled={g.year >= currentYear}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ minHeight: touch.min, paddingBottom: 6, justifyContent: 'flex-end', opacity: pressed ? 0.6 : 1 })}>
                        <Txt variant="caption" color="navy" style={{ fontFamily: fonts.bodyBold }}>
                          {g.year >= currentYear ? t('pledges.statementJan') : t('pledges.taxStatement', { year: g.year })}
                        </Txt>
                      </Pressable>
                      ) : null}
                    </Row>
                    {isOpen ? (
                      <VStack gap={space.sm}>
                        {rows.map((p) => (
                          <PledgeRow
                            key={p.id}
                            t={t}
                            p={p}
                            reported={reportedPledges.has(p.id)}
                            hasProof={proofPledgeIds.has(p.id)}
                            selected={selected.includes(p.id)}
                            onToggle={() => setSelected(selected.includes(p.id) ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
                            onOpen={() => router.push({ pathname: '/pledge/[id]', params: { id: p.id } })}
                          />
                        ))}
                        {rows.length === 0 ? (
                          <Txt variant="meta" color="faint" style={{ paddingVertical: 4, paddingHorizontal: 2 }}>
                            {t('pledges.noMatch')}
                          </Txt>
                        ) : null}
                      </VStack>
                    ) : null}
                  </VStack>
                );
              })}
              {payable.length > 0 ? (
                <Button
                  label={sel.length === 0 ? t('pledges.selectToPay') : sel.length === 1 ? t('pledges.payOne', { amount: formatCents(selCents) }) : t('pledges.payN', { n: sel.length, amount: formatCents(selCents) })}
                  disabled={sel.length === 0}
                  onPress={pay}
                />
              ) : null}
              {/* Hidden when proofs are off or nothing is left to pay; when the community takes no offline method, a note says so instead of a silent gap. */}
              {payable.length > 0 ? <PaidAnotherWay setup={proofs.setup} reason={proofs.reason} onPress={() => setProofOpen(true)} /> : null}
              {proofsOn ? <Button label={t('pledges.myProofs')} tone="ghost" size="md" onPress={() => router.push('/payment-proofs')} /> : null}
              <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
                {t('pledges.footer')}
              </Txt>
              {proofs.setup && center && member.household ? (
                <ProofSheet
                  visible={proofOpen}
                  onClose={() => setProofOpen(false)}
                  setup={proofs.setup}
                  centerId={center.id}
                  householdId={member.household.id}
                  today={member.today}
                  pledges={proofPledges}
                  entry="open_pledges"
                  initialPledgeIds={sel.map((p) => p.id)}
                />
              ) : null}
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
