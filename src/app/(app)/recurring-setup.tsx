import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Chip, ChipGroup, Txt, VStack } from '@/components/ui';
import { freqLabel } from '@/features/give/labels';
import { DollarField } from '@/features/give/parts';
import { endRule, giftsPerYear, soonestOnOrAfter, startDateChoices, throughYear, tomorrow, type EndChoice, type Frequency } from '@/features/give/rules';
import { runSaving, type SavingStep } from '@/features/pay';
import { listSpecialDays, nextTithiDates } from '@/lib/api/family';
import { createRecurringGift, getRecurringGift, listGivingPurposes, setRecurringMethod, updateRecurringGift, type GivingPurpose, type PayMethodChoice } from '@/lib/api/giving';
import type { Tables } from '@/lib/database.types';
import { report } from '@/lib/errors';
import { formatCents, formatLongDate, parseAmountToCents, todayAt } from '@/lib/format';
import { nextOccurrence } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/** Preset amounts from the prototype (L1885). */
const PRESETS = [1100, 2100, 5100, 10800];
const FREQUENCIES: Frequency[] = ['monthly', 'quarterly', 'yearly', 'special_day'];

type SetupData = { purposes: GivingPurpose[]; today: string; specialDayCount: number; nextSpecialDay: string | null; gift: Tables<'recurring_gifts'> | null };

/** New recurring gift (prototype Main.dc.html L1235–1259), also used to edit one (?id=). */
export default function RecurringSetupScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { member, center } = useApp();
  const state = useLoad<SetupData>(
    async () => {
      if (!member?.household || !center) throw new Error('no household');
      const today = todayAt(center.time_zone);
      const [purposes, days, gift] = await Promise.all([listGivingPurposes(center.id), listSpecialDays(member.household.id), id ? getRecurringGift(id) : Promise.resolve(null)]);
      const tithi = await nextTithiDates(center.id, today, days.filter((d) => !d.calendar_date && d.tithi && d.tithi_month).map((d) => ({ id: d.id, tithi: d.tithi as string, month: d.tithi_month as string })));
      const nexts = days.map((d) => (d.calendar_date ? nextOccurrence(d.calendar_date, today) : (tithi[d.id] ?? null)));
      return { purposes, today, specialDayCount: days.length, nextSpecialDay: soonestOnOrAfter(nexts, tomorrow(today)), gift };
    },
    [member?.household?.id, center?.id, id ?? null],
    'load the recurring gift form',
  );
  const title = id ? t('rsetup.editTitle') : t('rsetup.title');
  if (!member?.isAdult) {
    return (
      <Screen title={title}>
        <LockedState />
      </Screen>
    );
  }
  return (
    <Screen title={title}>
      <Loaded state={state}>{(data) => (data.purposes.length === 0 ? <EmptyState icon="repeat" title={t('rsetup.noPurposes')} /> : <SetupForm data={data} />)}</Loaded>
    </Screen>
  );
}

function Section({ children }: { children: string }) {
  return (
    <Txt variant="body" style={{ fontFamily: fonts.bodySemi }} accessibilityRole="header">
      {children}
    </Txt>
  );
}

function SetupForm({ data }: { data: SetupData }) {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  const { invalidate } = useDataVersion();
  const gift = data.gift;
  const initialPurpose = gift ? (data.purposes.find((p) => (gift.campaign_id ? p.campaignId === gift.campaign_id : p.fundId === gift.fund_id && !p.campaignId)) ?? data.purposes[0]) : data.purposes[0];
  const [purposeKey, setPurposeKey] = useState(initialPurpose.key);
  const [preset, setPreset] = useState<number | 'other'>(gift ? (PRESETS.includes(gift.amount_cents) ? gift.amount_cents : 'other') : 2100);
  const [other, setOther] = useState(gift && !PRESETS.includes(gift.amount_cents) ? String(gift.amount_cents / 100) : '75');
  const [frequency, setFrequency] = useState<Frequency>(gift && FREQUENCIES.includes(gift.frequency as Frequency) ? (gift.frequency as Frequency) : 'monthly');
  const starts = startDateChoices(data.today);
  const [start, setStart] = useState<string>(starts[0] ?? tomorrow(data.today));
  const [end, setEnd] = useState<EndChoice>(gift ? (gift.end_kind === 'count' ? 'count12' : gift.end_kind === 'until_date' ? 'through_next_year' : 'until_stopped') : 'until_stopped');
  const [method, setMethod] = useState<PayMethodChoice>(gift?.method === 'ach' ? 'ach' : 'card');
  const [error, setError] = useState<string | null>(null);

  const purpose = data.purposes.find((p) => p.key === purposeKey) ?? data.purposes[0];
  const amount = preset === 'other' ? (parseAmountToCents(other) ?? 0) : preset;
  const firstGift = start === 'special' ? data.nextSpecialDay : start;
  const perYear = giftsPerYear(frequency, data.specialDayCount);
  const through = throughYear(data.today);
  const endText = end === 'until_stopped' ? t('rsetup.untilStopped') : end === 'count12' ? t('rsetup.count12') : t('rsetup.through', { year: through });
  const methodText = method === 'ach' ? t('recurring.methodAch') : t('recurring.methodCard');
  const summary = [
    t('rsetup.summaryHead', { amount: formatCents(amount), freq: freqLabel(t, frequency).toLowerCase(), purpose: purpose.label }),
    gift ? null : t('rsetup.summaryFirst', { date: firstGift ? formatLongDate(firstGift) : t('rsetup.nextSpecialDay') }),
    endText.charAt(0).toLowerCase() + endText.slice(1),
    t('rsetup.summaryYear', { amount: formatCents(amount * perYear) }) + (frequency === 'special_day' ? ` ${t('rsetup.summaryDays', { n: data.specialDayCount })}` : ''),
  ]
    .filter(Boolean)
    .join(' · ');

  const save = () => {
    const household = member?.household;
    if (!household) return;
    if (amount <= 0) return setError(t('rsetup.amountRequired'));
    if (!gift && !firstGift) return setError(t('rsetup.noSpecialDay'));
    if (frequency === 'special_day' && data.specialDayCount === 0) return setError(t('rsetup.noSpecialDays'));
    setError(null);
    const rule = endRule(end, data.today);
    let giftId = gift?.id ?? '';
    const freqWord = freqLabel(t, frequency).toLowerCase();
    const steps: SavingStep[] = gift
      ? [
          {
            label: t('rsetup.stepUpdate', { freq: freqWord, purpose: purpose.label }),
            run: async () => {
              await updateRecurringGift(gift.id, { fundId: purpose.fundId, campaignId: purpose.campaignId, amountCents: amount, frequency, endKind: rule.kind, endCount: rule.count, endOn: rule.on, method });
              invalidate();
            },
          },
        ]
      : [
          {
            label: t('rsetup.stepCreate', { freq: freqWord, amount: formatCents(amount), purpose: purpose.label }),
            run: async () => {
              giftId = await createRecurringGift({
                householdId: household.id,
                fundId: purpose.fundId,
                campaignId: purpose.campaignId,
                amountCents: amount,
                frequency,
                startsOn: firstGift as string,
                endKind: rule.kind,
                endCount: rule.count,
                endOn: rule.on,
              });
              invalidate();
            },
          },
          {
            label: t('rsetup.stepMethod', { method: methodText }),
            run: async () => {
              await setRecurringMethod(giftId, method);
              invalidate();
            },
          },
        ];
    runSaving({
      title: gift ? t('rsetup.savingEditTitle') : t('rsetup.savingTitle'),
      steps,
      result: () =>
        gift
          ? t('rsetup.editedResult', { amount: formatCents(amount), freq: freqWord, purpose: purpose.label })
          : t('rsetup.result', { amount: formatCents(amount), freq: freqWord, purpose: purpose.label, date: formatLongDate(firstGift) }),
      cta: { label: t('rsetup.seeRecurring'), onPress: () => router.dismissTo('/recurring') },
    }).catch((err: unknown) => setError(report(err, 'set up your recurring gift').userMessage));
  };

  return (
    <VStack gap={space.md}>
      <Section>{t('rsetup.towards')}</Section>
      <VStack gap={6}>
        {data.purposes.map((p) => {
          const on = p.key === purposeKey;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPurposeKey(p.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={p.sub ? `${p.label}. ${p.sub}` : p.label}
              style={({ pressed }) => ({ borderWidth: 2, borderColor: on ? colors.navy : colors.border, backgroundColor: on ? colors.navyTint : colors.card, borderRadius: radii.card, minHeight: 52, paddingVertical: 6, paddingHorizontal: space.md, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
              <Txt variant="smallStrong">{p.label}</Txt>
              {p.sub ? (
                <Txt variant="caption" color="muted" numberOfLines={2} style={{ fontFamily: fonts.body }}>
                  {p.sub}
                </Txt>
              ) : null}
            </Pressable>
          );
        })}
      </VStack>

      <Section>{t('rsetup.amountEach')}</Section>
      <ChipGroup columns={3}>
        {[
          ...PRESETS.map((c) => <Chip key={c} grid label={formatCents(c)} selected={preset === c} onPress={() => setPreset(c)} />),
          <Chip key="other" grid label={t('opp.other')} selected={preset === 'other'} onPress={() => setPreset('other')} />,
        ]}
      </ChipGroup>
      {preset === 'other' ? <DollarField value={other} onChangeText={setOther} color={colors.navy} /> : null}

      <Section>{t('rsetup.howOften')}</Section>
      <ChipGroup columns={2}>
        {FREQUENCIES.map((f) => (
          <Chip key={f} grid label={f === 'special_day' ? t('rsetup.onSpecialDays') : freqLabel(t, f)} selected={frequency === f} onPress={() => setFrequency(f)} />
        ))}
      </ChipGroup>

      {gift ? null : (
        <>
          <Section>{t('rsetup.starting')}</Section>
          <ChipGroup columns={3}>
            {[
              ...starts.map((d) => <Chip key={d} grid label={formatLongDate(d)} selected={start === d} onPress={() => setStart(d)} />),
              <Chip key="special" grid label={t('rsetup.nextSpecialDay')} selected={start === 'special'} onPress={() => setStart('special')} disabled={!data.nextSpecialDay} />,
            ]}
          </ChipGroup>
        </>
      )}

      <Section>{t('rsetup.howLong')}</Section>
      <ChipGroup columns={3}>
        <Chip grid label={t('rsetup.untilStopped')} selected={end === 'until_stopped'} onPress={() => setEnd('until_stopped')} />
        <Chip grid label={t('rsetup.count12')} selected={end === 'count12'} onPress={() => setEnd('count12')} />
        <Chip grid label={t('rsetup.through', { year: through })} selected={end === 'through_next_year'} onPress={() => setEnd('through_next_year')} />
      </ChipGroup>

      <Section>{t('rsetup.payWith')}</Section>
      <ChipGroup columns={2}>
        <Chip grid label={t('recurring.methodCard')} selected={method === 'card'} onPress={() => setMethod('card')} />
        <Chip grid label={t('recurring.methodAch')} selected={method === 'ach'} onPress={() => setMethod('ach')} />
      </ChipGroup>

      <View style={{ backgroundColor: colors.panel, borderRadius: radii.card, paddingVertical: space.md, paddingHorizontal: 14, gap: space.xs }}>
        <Txt variant="small" color="ink2" style={{ lineHeight: 21 }}>
          {summary}
        </Txt>
        {gift ? null : (
          <Txt variant="caption" color="brownText" style={{ fontFamily: fonts.body }}>
            {t('rsetup.waitingNote')}
          </Txt>
        )}
      </View>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={gift ? t('rsetup.saveChanges') : t('rsetup.start')} onPress={save} disabled={amount <= 0} />
      <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
        {t('recurring.footer')}
      </Txt>
    </VStack>
  );
}
