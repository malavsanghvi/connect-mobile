import { View } from 'react-native';

import { Chip, ChipGroup, Txt, VStack } from '@/components/ui';
import { formatCents, formatLongDate } from '@/lib/format';
import type { PayMethodChoice } from '@/lib/api/giving';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { freqLabel } from './labels';
import { giftsPerYear, type EndChoice, type Frequency } from './rules';

/** Section heading used by the recurring forms. */
export function Section({ children }: { children: string }) {
  return (
    <Txt variant="body" style={{ fontFamily: fonts.bodySemi }} accessibilityRole="header">
      {children}
    </Txt>
  );
}

/**
 * The terms of a recurring gift, shared by "Make this recurring" on an opportunity and by editing an
 * existing gift: how often, when it starts (new gifts only: pass `starts`), for how long, how to pay.
 */
export function RecurringTerms({
  frequencies,
  frequency,
  onFrequency,
  starts,
  start,
  onStart,
  end,
  onEnd,
  through,
  method,
  onMethod,
}: {
  frequencies: Frequency[];
  frequency: Frequency;
  onFrequency: (f: Frequency) => void;
  starts?: string[];
  start?: string;
  onStart?: (date: string) => void;
  end: EndChoice;
  onEnd: (e: EndChoice) => void;
  through: number;
  method: PayMethodChoice;
  onMethod: (m: PayMethodChoice) => void;
}) {
  const t = useT();
  return (
    <VStack gap={space.md}>
      <Section>{t('rsetup.howOften')}</Section>
      <ChipGroup columns={2}>
        {frequencies.map((f) => (
          <Chip key={f} grid label={f === 'special_day' ? t('rsetup.onSpecialDays') : freqLabel(t, f)} selected={frequency === f} onPress={() => onFrequency(f)} />
        ))}
      </ChipGroup>

      {starts && starts.length > 0 && onStart ? (
        <>
          <Section>{t('rsetup.starting')}</Section>
          <ChipGroup columns={2}>
            {starts.map((d) => (
              <Chip key={d} grid label={formatLongDate(d)} selected={start === d} onPress={() => onStart(d)} />
            ))}
          </ChipGroup>
        </>
      ) : null}

      <Section>{t('rsetup.howLong')}</Section>
      <ChipGroup columns={3}>
        <Chip grid label={t('rsetup.untilStopped')} selected={end === 'until_stopped'} onPress={() => onEnd('until_stopped')} />
        <Chip grid label={t('rsetup.count12')} selected={end === 'count12'} onPress={() => onEnd('count12')} />
        <Chip grid label={t('rsetup.through', { year: through })} selected={end === 'through_next_year'} onPress={() => onEnd('through_next_year')} />
      </ChipGroup>

      <Section>{t('rsetup.payWith')}</Section>
      <ChipGroup columns={2}>
        <Chip grid label={t('recurring.methodCard')} selected={method === 'card'} onPress={() => onMethod('card')} />
        <Chip grid label={t('recurring.methodAch')} selected={method === 'ach'} onPress={() => onMethod('ach')} />
      </ChipGroup>
    </VStack>
  );
}

/** "$21 monthly for Jeevdaya · first gift Oct 15, 2026 · until I stop · about $252 a year", with the honest "nothing is charged yet" note for a new gift. */
export function RecurringSummary({
  amountCents,
  frequency,
  purpose,
  firstGift,
  end,
  through,
  specialDayCount = 0,
  waitingNote = false,
}: {
  amountCents: number;
  frequency: Frequency;
  purpose: string;
  /** ISO date of the first gift; omit when editing an existing gift. */
  firstGift?: string | null;
  end: EndChoice;
  through: number;
  /** Family special days, only used to estimate a "on family special days" gift. */
  specialDayCount?: number;
  waitingNote?: boolean;
}) {
  const t = useT();
  const endText = end === 'until_stopped' ? t('rsetup.untilStopped') : end === 'count12' ? t('rsetup.count12') : t('rsetup.through', { year: through });
  const text = [
    t('rsetup.summaryHead', { amount: formatCents(amountCents), freq: freqLabel(t, frequency).toLowerCase(), purpose }),
    firstGift ? t('rsetup.summaryFirst', { date: formatLongDate(firstGift) }) : null,
    endText.charAt(0).toLowerCase() + endText.slice(1),
    t('rsetup.summaryYear', { amount: formatCents(amountCents * giftsPerYear(frequency, specialDayCount)) }) + (frequency === 'special_day' ? ` ${t('rsetup.summaryDays', { n: specialDayCount })}` : ''),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={{ backgroundColor: colors.panel, borderRadius: radii.card, paddingVertical: space.md, paddingHorizontal: 14, gap: space.xs }}>
      <Txt variant="small" color="ink2" style={{ lineHeight: 21 }}>
        {text}
      </Txt>
      {waitingNote ? (
        <Txt variant="caption" color="brownText" style={{ fontFamily: fonts.body }}>
          {t('rsetup.waitingNote')}
        </Txt>
      ) : null}
    </View>
  );
}
