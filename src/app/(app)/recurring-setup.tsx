import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Chip, ChipGroup, Txt, VStack } from '@/components/ui';
import { freqLabel } from '@/features/give/labels';
import { DollarField } from '@/features/give/parts';
import { RecurringSummary, RecurringTerms, Section } from '@/features/give/recurring-terms';
import { editableFrequencies, endRule, opportunityKind, throughYear, type EndChoice, type Frequency } from '@/features/give/rules';
import { runSaving, type SavingStep } from '@/features/pay';
import { listSpecialDays } from '@/lib/api/family';
import { loadRecurringForEdit, updateRecurringGift, type PayMethodChoice, type RecurringForEdit } from '@/lib/api/giving';
import { report } from '@/lib/errors';
import { formatCents, parseAmountToCents, todayAt } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/** Preset amounts from the prototype (L1885). */
const PRESETS = [1100, 2100, 5100, 10800];

type EditData = RecurringForEdit & { today: string; specialDayCount: number };

/**
 * Edit a recurring gift (?id=). New recurring gifts are not started here: they start from a giving
 * opportunity ("Make this recurring"), so there is no second list of things to give towards. What a gift
 * is towards never changes from this screen; the office decides what an opportunity allows.
 */
export default function RecurringSetupScreen() {
  const t = useT();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { member, center } = useApp();
  const state = useLoad<EditData | null>(
    async () => {
      if (!id) return null;
      if (!member?.household || !center) throw new Error('no household');
      const [loaded, days] = await Promise.all([loadRecurringForEdit(id), listSpecialDays(member.household.id)]);
      return { ...loaded, today: todayAt(center.time_zone), specialDayCount: days.length };
    },
    [member?.household?.id, center?.id, id ?? null],
    'load the recurring gift',
  );
  if (!member?.isAdult) {
    return (
      <Screen title={t('rsetup.editTitle')}>
        <LockedState />
      </Screen>
    );
  }
  if (!id) {
    return (
      <Screen title={t('recurring.title')}>
        <EmptyState icon="repeat" title={t('rsetup.startFromGive')} />
        <Button label={t('rsetup.goToGive')} onPress={() => router.replace('/give')} />
      </Screen>
    );
  }
  return (
    <Screen title={t('rsetup.editTitle')}>
      <Loaded state={state}>{(data) => (data ? <EditForm data={data} /> : null)}</Loaded>
    </Screen>
  );
}

function EditForm({ data }: { data: EditData }) {
  const t = useT();
  const router = useRouter();
  const { invalidate } = useDataVersion();
  const { gift, purpose, opportunity } = data;
  const frequencies = editableFrequencies(gift, opportunity);
  // A gift renewing a fixed or tiered opportunity keeps the amount the office set; an open or "any amount" one can be changed.
  const amountEditable = !gift.opportunity_id || (!!opportunity && ['amount', 'open'].includes(opportunityKind(opportunity.kind)));
  const min = opportunity?.min_amount_cents ?? 0;
  const [preset, setPreset] = useState<number | 'other'>(PRESETS.includes(gift.amount_cents) ? gift.amount_cents : 'other');
  const [other, setOther] = useState(PRESETS.includes(gift.amount_cents) ? '75' : String(gift.amount_cents / 100));
  const [frequency, setFrequency] = useState<Frequency>(frequencies.includes(gift.frequency as Frequency) ? (gift.frequency as Frequency) : (frequencies[0] ?? 'monthly'));
  const [end, setEnd] = useState<EndChoice>(gift.end_kind === 'count' ? 'count12' : gift.end_kind === 'until_date' ? 'through_next_year' : 'until_stopped');
  const [method, setMethod] = useState<PayMethodChoice>(gift.method === 'ach' ? 'ach' : 'card');
  const [error, setError] = useState<string | null>(null);

  const amount = !amountEditable ? gift.amount_cents : preset === 'other' ? (parseAmountToCents(other) ?? 0) : preset;
  const belowMin = amountEditable && min > 0 && amount > 0 && amount < min;

  const save = () => {
    if (amount <= 0) return setError(t('rsetup.amountRequired'));
    if (belowMin) return setError(t('opp.minimum', { amount: formatCents(min) }));
    if (frequency === 'special_day' && data.specialDayCount === 0) return setError(t('rsetup.noSpecialDays'));
    setError(null);
    const rule = endRule(end, data.today);
    const steps: SavingStep[] = [
      {
        label: t('rsetup.stepUpdate', { freq: freqLabel(t, frequency).toLowerCase(), purpose }),
        run: async () => {
          await updateRecurringGift(gift.id, { amountCents: amount, frequency, endKind: rule.kind, endCount: rule.count, endOn: rule.on, method });
          invalidate();
        },
      },
    ];
    runSaving({
      title: t('rsetup.savingEditTitle'),
      steps,
      result: () => t('rsetup.editedResult', { amount: formatCents(amount), freq: freqLabel(t, frequency).toLowerCase(), purpose }),
      cta: { label: t('rsetup.seeRecurring'), onPress: () => router.dismissTo('/recurring') },
    }).catch((err: unknown) => setError(report(err, 'save your recurring gift').userMessage));
  };

  return (
    <VStack gap={space.md}>
      <Section>{t('rsetup.towards')}</Section>
      <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.card, minHeight: 52, paddingVertical: 6, paddingHorizontal: space.md, justifyContent: 'center' }}>
        <Txt variant="smallStrong">{purpose}</Txt>
      </View>

      <Section>{t('rsetup.amountEach')}</Section>
      {amountEditable ? (
        <>
          <ChipGroup columns={3}>
            {[
              ...PRESETS.map((c) => <Chip key={c} grid label={formatCents(c)} selected={preset === c} onPress={() => setPreset(c)} />),
              <Chip key="other" grid label={t('opp.other')} selected={preset === 'other'} onPress={() => setPreset('other')} />,
            ]}
          </ChipGroup>
          {preset === 'other' ? <DollarField value={other} onChangeText={setOther} color={colors.navy} error={belowMin ? t('opp.minimum', { amount: formatCents(min) }) : null} /> : null}
        </>
      ) : (
        <Txt variant="small" color="ink2" style={{ lineHeight: 21 }}>
          {t('rsetup.amountSet', { amount: formatCents(gift.amount_cents) })}
        </Txt>
      )}

      <RecurringTerms frequencies={frequencies} frequency={frequency} onFrequency={setFrequency} end={end} onEnd={setEnd} through={throughYear(data.today)} method={method} onMethod={setMethod} />

      <RecurringSummary amountCents={amount} frequency={frequency} purpose={purpose} end={end} through={throughYear(data.today)} specialDayCount={data.specialDayCount} />
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={t('rsetup.saveChanges')} onPress={save} disabled={amount <= 0} />
      <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
        {t('recurring.footer')}
      </Txt>
    </VStack>
  );
}
