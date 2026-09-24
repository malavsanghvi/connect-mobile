import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Chip, ChipGroup, Row, Segmented, Txt, VStack } from '@/components/ui';
import { ChevronGlyph } from '@/features/give/icons';
import { CheckBox, TintTile } from '@/features/give/parts';
import { isYearOpen } from '@/features/give/rules';
import { startPayment } from '@/features/pay';
import type { Translate } from '@/i18n';
import { BUCKETS, signedUrl } from '@/lib/api/files';
import { listPledges, type PledgeWithPeople } from '@/lib/api/giving';
import type { Tables } from '@/lib/database.types';
import { report } from '@/lib/errors';
import { formatCents, formatLongDate, fullName } from '@/lib/format';
import { filterPledges, groupPledgesByYear, isOpenPledge, openBalanceCents, type PledgeFilter } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

function statusPill(t: Translate, p: PledgeWithPeople): { label: string; fg: string; bg: string } {
  switch (p.status) {
    case 'paid':
      return { label: p.closed_at ? t('pledges.paidOn', { date: formatLongDate(p.closed_at.slice(0, 10)) }) : t('pledges.paid'), fg: colors.greenDark, bg: colors.greenTint };
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

function sourceLabel(t: Translate, source: string): string {
  const key = `source.${source}` as Parameters<Translate>[0];
  const v = t(key);
  return v === key ? source : v;
}

function PledgeRow({ t, p, selected, onToggle }: { t: Translate; p: PledgeWithPeople; selected: boolean; onToggle: () => void }) {
  const open = isOpenPledge(p);
  const title = p.opportunityName ? [p.opportunityName, p.optionLabel].filter(Boolean).join(' · ') : p.dedication || p.campaignName || sourceLabel(t, p.source);
  const sub = [p.campaignName && p.campaignName !== title ? p.campaignName : null, p.opportunityName && p.dedication ? p.dedication : null].filter(Boolean).join(' · ') || sourceLabel(t, p.source);
  const meta = [p.pledgedByName ? t('pledges.by', { name: p.pledgedByName }) : null, formatLongDate(p.pledged_at.slice(0, 10)), p.pledge_number].filter(Boolean).join(' · ');
  const pill = statusPill(t, p);
  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: selected ? colors.navy : colors.border, borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      {open ? (
        <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={t('pledges.selectOne', { name: title, amount: formatCents(openBalanceCents(p)) })} hitSlop={8}>
          <CheckBox checked={selected} color={colors.navy} size={28} />
        </Pressable>
      ) : null}
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
      </View>
    </View>
  );
}

/** Family pledges (prototype Main.dc.html L928–981): years, summary tiles, filter, collapsible year groups, pay. Adults only. */
export default function PledgesScreen() {
  const { t } = useSettings();
  const { member } = useApp();
  const { invalidate } = useDataVersion();
  const { toast } = useFeedback();
  const names = new Map((member?.members ?? []).map((m) => [m.person.id, fullName(m.person)]));
  const state = useLoad(
    () => (member?.household ? listPledges(member.household.id, names) : Promise.resolve({ pledges: [], paymentsByYear: {}, statements: [] })),
    [member?.household?.id],
    'load your pledges',
  );
  const [year, setYear] = useState<number | null>(null);
  const [filter, setFilter] = useState<PledgeFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [openYears, setOpenYears] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

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
          const openAll = pledges.filter(isOpenPledge);
          const openCents = openAll.reduce((s, p) => s + openBalanceCents(p), 0);
          const closedAll = pledges.length - openAll.length;
          const paidCents = year ? (paymentsByYear[year] ?? 0) : Object.values(paymentsByYear).reduce((s, v) => s + v, 0);
          const sel = pledges.filter((p) => selected.includes(p.id) && isOpenPledge(p));
          const selCents = sel.reduce((s, p) => s + openBalanceCents(p), 0);
          const pay = () =>
            startPayment({
              amountCents: selCents,
              forLabel: sel.length === 1 && sel[0].pledge_number ? t('pay.forPledge', { pledge: sel[0].pledge_number }) : t('pay.forPledges', { n: sel.length }),
              pledgeIds: sel.map((p) => p.id),
              context: 'pledges',
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
                <TintTile tone="amber" size={22} label={t('pledges.openBalance')} value={formatCents(openCents)} sub={t('pledges.nOpen', { n: openAll.length })} />
                <TintTile tone="green" size={22} label={year ? t('give.paidIn', { year }) : t('pledges.paidAllYears')} value={formatCents(paidCents)} sub={t('pledges.closedOverall', { n: closedAll })} />
              </Row>
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
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingBottom: 6 }}>
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
                      <Pressable
                        onPress={() => void openStatement(g.year, statement)}
                        disabled={g.year >= currentYear}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ minHeight: 40, paddingBottom: 6, justifyContent: 'flex-end', opacity: pressed ? 0.6 : 1 })}>
                        <Txt variant="caption" color="navy" style={{ fontFamily: fonts.bodyBold }}>
                          {g.year >= currentYear ? t('pledges.statementJan') : t('pledges.taxStatement', { year: g.year })}
                        </Txt>
                      </Pressable>
                    </Row>
                    {isOpen ? (
                      <VStack gap={space.sm}>
                        {rows.map((p) => (
                          <PledgeRow key={p.id} t={t} p={p} selected={selected.includes(p.id)} onToggle={() => setSelected(selected.includes(p.id) ? selected.filter((x) => x !== p.id) : [...selected, p.id])} />
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
              {openAll.length > 0 ? (
                <Button
                  label={sel.length === 0 ? t('pledges.selectToPay') : sel.length === 1 ? t('pledges.payOne', { amount: formatCents(selCents) }) : t('pledges.payN', { n: sel.length, amount: formatCents(selCents) })}
                  disabled={sel.length === 0}
                  onPress={pay}
                />
              ) : null}
              <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
                {t('pledges.footer')}
              </Txt>
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
