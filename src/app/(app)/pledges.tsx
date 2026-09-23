import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Icon } from '@/components/icon';
import { Button, Card, Chip, ChipGroup, Pill, Row, Segmented, Stat, Txt, VStack } from '@/components/ui';
import { listPledges, type PledgeWithPeople } from '@/lib/api/giving';
import { formatCents, formatLongDate, fullName } from '@/lib/format';
import { filterPledges, groupPledgesByYear, isOpenPledge, openBalanceCents, type PledgeFilter } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useSettings } from '@/providers/settings';
import type { Translate } from '@/i18n';
import { colors, radii, space } from '@/theme';

function statusPill(t: Translate, p: PledgeWithPeople) {
  switch (p.status) {
    case 'paid':
      return <Pill label={p.closed_at ? t('pledges.paidOn', { date: formatLongDate(p.closed_at.slice(0, 10)) }) : t('pledges.paid')} tone="green" />;
    case 'partially_paid':
      return <Pill label={t('pledges.partly', { amount: formatCents(p.paid_cents) })} tone="amber" />;
    case 'cancelled':
      return <Pill label={t('pledges.cancelled')} tone="grey" />;
    case 'written_off':
      return <Pill label={t('pledges.writtenOff')} tone="grey" />;
    default:
      return <Pill label={t('pledges.open')} tone="amber" />;
  }
}

function sourceLabel(t: Translate, source: string): string {
  const key = `source.${source}` as Parameters<Translate>[0];
  const v = t(key);
  return v === key ? source : v;
}

function PledgeRow({ t, p, selected, onToggle }: { t: Translate; p: PledgeWithPeople; selected: boolean; onToggle: () => void }) {
  const open = isOpenPledge(p);
  const title = p.dedication || p.campaignName || sourceLabel(t, p.source);
  const sub = [p.campaignName && p.campaignName !== title ? p.campaignName : null, sourceLabel(t, p.source)].filter(Boolean).join(' · ');
  const meta = [p.pledgedByName ? t('pledges.by', { name: p.pledgedByName }) : null, formatLongDate(p.pledged_at.slice(0, 10)), p.pledge_number].filter(Boolean).join(' · ');
  const content = (
    <Row gap={space.md} align="flex-start" style={{ paddingVertical: space.sm }}>
      {open ? (
        <View style={{ width: 26, height: 26, marginTop: 2, borderRadius: radii.sm, borderWidth: 2, borderColor: selected ? colors.brown : colors.dashed, backgroundColor: selected ? colors.brown : colors.card, alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <Icon name="checkmark" size={18} color={colors.white} /> : null}
        </View>
      ) : (
        <View style={{ width: 26 }} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {sub ? (
          <Txt variant="meta" color="muted">
            {sub}
          </Txt>
        ) : null}
        <Txt variant="caption" color="muted">
          {meta}
        </Txt>
        {statusPill(t, p)}
      </View>
      <Txt variant="section">{formatCents(p.amount_cents)}</Txt>
    </Row>
  );
  if (!open) return content;
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${title}, ${formatCents(openBalanceCents(p))} ${t('pledges.open').toLowerCase()}`}>
      {content}
    </Pressable>
  );
}

/** Family pledges by year, open/closed filter, pay selected (prototype §2.14). Adults only. */
export default function PledgesScreen() {
  const { t } = useSettings();
  const { member } = useApp();
  const { invalidate } = useDataVersion();
  const { payNotice } = useFeedback();
  const names = new Map((member?.members ?? []).map((m) => [m.person.id, fullName(m.person)]));
  const state = useLoad(
    () => (member?.household ? listPledges(member.household.id, names) : Promise.resolve({ pledges: [], paymentsByYear: {}, statements: [] })),
    [member?.household?.id],
    'load your pledges',
  );
  const [year, setYear] = useState<number | null>(null);
  const [filter, setFilter] = useState<PledgeFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);

  if (!member?.isAdult) {
    return (
      <Screen title={t('pledges.title')}>
        <LockedState />
      </Screen>
    );
  }

  return (
    <Screen title={t('pledges.title')} onRefresh={async () => invalidate()}>
      <Loaded state={state}>
        {({ pledges, paymentsByYear, statements }) => {
          const years = [...new Set(pledges.map((p) => Number(p.pledged_at.slice(0, 4))))].sort((a, b) => b - a);
          const shown = filterPledges(pledges, filter, year);
          const groups = groupPledgesByYear(shown);
          const openAll = pledges.filter(isOpenPledge);
          const openCents = openAll.reduce((s, p) => s + openBalanceCents(p), 0);
          const paidCents = year ? (paymentsByYear[year] ?? 0) : Object.values(paymentsByYear).reduce((s, v) => s + v, 0);
          const sel = pledges.filter((p) => selected.includes(p.id) && isOpenPledge(p));
          const selCents = sel.reduce((s, p) => s + openBalanceCents(p), 0);
          const currentYear = Number(member.today.slice(0, 4));
          return (
            <VStack gap={space.lg}>
              <ChipGroup>
                <Chip label={t('pledges.allYears')} selected={year === null} onPress={() => setYear(null)} />
                {years.map((y) => (
                  <Chip key={y} label={String(y)} selected={year === y} onPress={() => setYear(y)} />
                ))}
              </ChipGroup>
              <Card>
                <Row gap={space.md}>
                  <Stat label={t('give.openBalance', { n: openAll.length })} value={formatCents(openCents)} color="brown" />
                  <Stat label={year ? t('give.paidIn', { year }) : t('pledges.paidAllYears')} value={formatCents(paidCents)} color="green" />
                </Row>
              </Card>
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
              {groups.length === 0 ? <EmptyState icon="receipt-outline" title={pledges.length ? t('pledges.noMatch') : t('pledges.none')} /> : null}
              {groups.map((g) => {
                const statement = statements.find((s) => s.tax_year === g.year && s.kind === 'tax_year');
                return (
                  <VStack key={g.year} gap={space.sm}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <View>
                        <Txt variant="title">{String(g.year)}</Txt>
                        <Txt variant="meta" color="muted">
                          {t('pledges.groupLine', { n: g.pledges.length, pledged: formatCents(g.pledgedCents), paid: formatCents(g.paidCents) })}
                        </Txt>
                      </View>
                      <Txt variant="caption" color="muted" style={{ maxWidth: 140, textAlign: 'right' }}>
                        {statement ? t('pledges.statementReady') : g.year >= currentYear ? t('pledges.statementJan') : t('pledges.statementAsk')}
                      </Txt>
                    </Row>
                    <Card>
                      {g.pledges.map((p) => (
                        <PledgeRow
                          key={p.id}
                          t={t}
                          p={p}
                          selected={selected.includes(p.id)}
                          onToggle={() => setSelected(selected.includes(p.id) ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
                        />
                      ))}
                    </Card>
                  </VStack>
                );
              })}
              <Button
                label={sel.length ? t('pledges.payN', { n: sel.length, amount: formatCents(selCents) }) : t('pledges.selectToPay')}
                tone="brown"
                disabled={sel.length === 0}
                onPress={() => payNotice({ amountLabel: formatCents(selCents) })}
              />
              <Txt variant="meta" color="muted">
                {t('pledges.footer')}
              </Txt>
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
