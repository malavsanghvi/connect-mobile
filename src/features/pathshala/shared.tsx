import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Row, Txt } from '@/components/ui';
import { startPayment, type PaymentOutcome } from '@/features/pay';
import type { Translate } from '@/i18n';
import { formatCents, formatDateTime, formatDay } from '@/lib/format';
import { colors, fonts, space } from '@/theme';

/**
 * Small pieces the Pathshala registration screens share (src/features/pathshala): the clock a countdown ticks on, how
 * a date or a time from the database is said, the label of a fee payment, opening the Pay sheet for fee pledges, and
 * the amount rows of the review.
 */

/** The time now, ticking every `everyMs` while `on` (a hold's countdown). */
export function useNow(everyMs = 30000, on = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!on) return;
    // Right away (the clock may have stood still while it was off), then every `everyMs`.
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [everyMs, on]);
  return now;
}

/** A date from the database ('2026-09-14' → "Mon, Sep 14") or a time ('…T18:00:00-05:00' → "Mon, Sep 14 · 6:00 PM" in the community's zone). */
export function whenText(iso: string | null | undefined, timeZone: string | null | undefined): string {
  if (!iso) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDay(iso) : formatDateTime(iso, timeZone);
}

/** "Pathshala fee 2026-27 · Riya, Dev": what a fee payment is for (the line on the provider's page, plan §2.7). */
export function feeForLabel(t: Translate, termName: string, names: string[]): string {
  const known = names.filter(Boolean);
  return known.length ? t('reg.payFor', { term: termName, names: known.join(', ') }) : t('reg.payForTerm', { term: termName });
}

/** Money as the review shows it: always with cents ("$117.00"). */
export function money(cents: number): string {
  return formatCents(cents, { alwaysCents: true });
}

/**
 * Opens the Pay sheet for Pathshala fee pledges (context `pathshala`: "Fee paid" afterwards, never a donation). With
 * `office`, "Pay at the office instead" sits beside the online payment (only when the term allows it, plan P18).
 */
export function payFees(p: { amountCents: number; pledgeIds: string[]; forLabel: string; householdId?: string | null; office?: { label: string; run: () => void } | null }): Promise<PaymentOutcome> {
  return startPayment({
    amountCents: p.amountCents,
    forLabel: p.forLabel,
    pledgeIds: p.pledgeIds,
    householdId: p.householdId,
    context: 'pathshala',
    alternative: p.office ? { label: p.office.label, run: p.office.run, withOnline: true } : undefined,
  });
}

/** One amount row: the label on the left, the amount on the right ("Sibling discount   −$13.00"). */
export function AmountRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }} gap={space.md} align="flex-start">
      <Txt variant={strong ? 'bodyStrong' : 'small'} color={strong ? 'ink' : 'ink2'} style={{ flex: 1 }}>
        {label}
      </Txt>
      <Txt variant={strong ? 'bodyStrong' : 'small'} style={{ fontFamily: strong ? fonts.bodyBold : fonts.bodyMedium, textAlign: 'right' }}>
        {value}
      </Txt>
    </Row>
  );
}

/** "Step 2 of 5" and the step's title. */
export function StepHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="eyebrow" color="muted">
        {eyebrow}
      </Txt>
      <Txt variant="headline" accessibilityRole="header">
        {title}
      </Txt>
    </View>
  );
}

/** A line of the "Before you start" card: a coloured bullet and the sentence. */
export function FactLine({ text, tone = 'ink' }: { text: string; tone?: 'ink' | 'green' | 'brown' | 'danger' }) {
  const dot = tone === 'green' ? colors.green : tone === 'brown' ? colors.brown : tone === 'danger' ? colors.danger : colors.navy;
  return (
    <Row align="flex-start" gap={space.sm}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot, marginTop: 8 }} />
      <Txt variant="small" color={tone === 'green' ? 'greenDark' : tone === 'brown' ? 'brownDark' : tone === 'danger' ? 'danger' : 'ink2'} style={{ flex: 1 }}>
        {text}
      </Txt>
    </Row>
  );
}
