import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Row, TextField, Toggle, Txt, VStack } from '@/components/ui';
import { CheckRow } from '@/features/give/parts';
import { ordinal, pronounFor, turningAge } from '@/features/give/rules';
import { runSaving, startPayment } from '@/features/pay';
import { listDisplayName } from '@/features/special-days';
import { nextTithiDates } from '@/lib/api/family';
import { commitLabh, loadLabh, type LabhData } from '@/lib/api/giving';
import { report } from '@/lib/errors';
import { formatCents, formatDay, formatLongDate, fullName, todayAt } from '@/lib/format';
import { nextOccurrence } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/** Birthday labh (prototype Main.dc.html L1196–1220): choose labh options for a family special day. Adults only. */
export default function LabhScreen() {
  const t = useT();
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const { member, center } = useApp();
  const state = useLoad(
    () => {
      if (!center) throw new Error('no center');
      const today = todayAt(center.time_zone);
      return loadLabh(center.id, dayId, async (day) => {
        if (day.calendar_date) return nextOccurrence(day.calendar_date, today);
        if (day.tithi && day.tithi_month) return (await nextTithiDates(center.id, today, [{ id: day.id, tithi: day.tithi, month: day.tithi_month }]))[day.id] ?? null;
        return null;
      });
    },
    [center?.id, dayId],
    'load this labh',
  );
  const kind = state.data?.day.kind;
  const title = kind === 'birthday' || kind === undefined ? t('labh.title') : t('labh.titleOther');
  if (!member?.isAdult) {
    return (
      <Screen title={title}>
        <LockedState />
      </Screen>
    );
  }
  return (
    <Screen title={title}>
      <Loaded state={state}>{(data) => (data.options.length === 0 ? <EmptyState icon="gift-outline" title={t('labh.noOptions')} /> : <LabhBody data={data} />)}</Loaded>
    </Screen>
  );
}

function LabhBody({ data }: { data: LabhData & { next: string | null } }) {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  const { invalidate } = useDataVersion();
  const { day, options, next, tithi } = data;
  const person = day.person_id ? member?.members.find((m) => m.person.id === day.person_id)?.person : undefined;
  const first = person ? person.preferred_name || person.first_name : null;
  const age = day.kind === 'birthday' ? turningAge(person?.date_of_birth, next) : null;
  const heading = day.kind === 'birthday' && first ? (age ? t('labh.birthdayNth', { name: first, nth: ordinal(age) }) : t('labh.birthday', { name: first })) : listDisplayName(t, day, member?.members ?? []);
  const pronoun = pronounFor(person?.gender);
  const eyebrow = [next ? formatDay(next) : t('labh.dateUnknown'), tithi ? `${tithi.month_name} ${tithi.tithi}` : day.tithi ? `${day.tithi_month ?? ''} ${day.tithi}`.trim() : null].filter(Boolean).join(' · ');
  const defaultDedication = person ? (day.kind === 'birthday' && age ? t('labh.dedicationNth', { name: fullName(person), nth: ordinal(age) }) : t('labh.dedicationDay', { name: heading })) : t('labh.dedicationDay', { name: heading });

  const [picked, setPicked] = useState<string[]>([]);
  const [dedication, setDedication] = useState(defaultDedication);
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = options.filter((o) => picked.includes(o.id));
  const total = chosen.reduce((s, o) => s + o.amount_cents, 0);
  const names = chosen.map((o) => o.name).join(', ');

  const commit = () => {
    if (chosen.length === 0) return setError(t('labh.selectOne'));
    setError(null);
    let numbers: string[] = [];
    runSaving({
      title: t('labh.savingTitle'),
      steps: [
        {
          label: t(chosen.length === 1 ? 'labh.stepCreateOne' : 'labh.stepCreate', { amount: formatCents(total), names, n: chosen.length }),
          run: async () => {
            numbers = await commitLabh({ dayId: day.id, optionIds: chosen.map((o) => o.id), dedication, repeatYearly: repeat });
            invalidate();
          },
        },
        // Same call as above: commit_labh adds the yearly gifts in the same transaction.
        ...(repeat ? [{ label: t('labh.stepRepeat') }] : []),
      ],
      result: () =>
        [t(numbers.length === 1 ? 'labh.resultOne' : 'labh.resultMany', { pledge: numbers.join(', '), date: next ? formatLongDate(next) : t('labh.dateUnknown') }), repeat ? t('labh.resultRepeat') : null].filter(Boolean).join(' '),
      cta: { label: t('labh.backToDays'), onPress: () => router.dismissTo('/special-days') },
    }).catch((err: unknown) => setError(report(err, 'save your labh').userMessage));
  };

  const pay = () => {
    if (chosen.length === 0) return setError(t('labh.selectOne'));
    setError(null);
    startPayment({ amountCents: total, forLabel: heading, context: 'labh', alternative: { label: t('pay.pledgeInstead', { amount: formatCents(total) }), run: commit } }).catch((err: unknown) =>
      setError(report(err, 'open the payment sheet').userMessage),
    );
  };

  return (
    <VStack gap={space.md}>
      <View style={{ borderRadius: radii.xxl, backgroundColor: colors.brown, padding: 18, gap: 4 }}>
        <Txt variant="eyebrow" color="onBrown">
          {eyebrow}
        </Txt>
        <Txt color="white" accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 23, lineHeight: 29 }}>
          {heading}
        </Txt>
        <Txt variant="meta" color="onBrown">
          {t('labh.heroSub')}
        </Txt>
      </View>
      <Card style={{ paddingVertical: 4, paddingHorizontal: 14, gap: 0 }}>
        {options.map((o) => (
          <CheckRow key={o.id} minHeight={60} label={o.name} note={o.purpose} amountCents={o.amount_cents} checked={picked.includes(o.id)} onToggle={() => setPicked(picked.includes(o.id) ? picked.filter((x) => x !== o.id) : [...picked, o.id])} />
        ))}
        <Row style={{ justifyContent: 'space-between', paddingTop: space.md, paddingBottom: space.sm }}>
          <Txt variant="section" style={{ fontFamily: fonts.bodyBold }}>
            {chosen.length === 0 ? t('labh.selectOne') : chosen.length === 1 ? t('labh.oneSelected') : t('labh.nSelected', { n: chosen.length })}
          </Txt>
          <Txt variant="section" color="brown" style={{ fontFamily: fonts.bodyBold }}>
            {formatCents(total)}
          </Txt>
        </Row>
      </Card>
      <TextField label={t('labh.dedication')} value={dedication} onChangeText={setDedication} />
      <Card style={{ paddingVertical: 2, paddingHorizontal: 14 }}>
        <Toggle label={t(`labh.repeat.${day.kind === 'birthday' ? pronoun : 'day'}` as 'labh.repeat.day')} sub={t('labh.repeatSub', { when: remindWhen(day.reminder_days_before) })} value={repeat} onChange={setRepeat} />
      </Card>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={t('opp.commit', { amount: formatCents(total) })} tone="brown" onPress={commit} disabled={total === 0} />
      <Button label={t('opp.payNow', { amount: formatCents(total) })} tone="outlineBlack" size="md" onPress={pay} disabled={total === 0} />
    </VStack>
  );
}

function remindWhen(days: number): string {
  if (days > 0 && days % 7 === 0) return days === 7 ? '1 week' : `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}
