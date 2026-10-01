import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, IconButton, Txt, VStack } from '@/components/ui';
import { canPlanLabh, listDisplayName, occasionOf, reminderSpan, whenText, yearsOn, type Occasion } from '@/features/special-days';
import { AddSpecialDayForm, PlanDaysQuestion } from '@/features/special-days-form';
import { deleteSpecialDay, listSpecialDays, nextTithiDates } from '@/lib/api/family';
import { report } from '@/lib/errors';
import { formatDay, monthShortUpper, parseISODate, todayAt } from '@/lib/format';
import { isWithinReminder, nextOccurrence } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useModule } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

const TINT: Record<Occasion | 'diksha', { bg: string; fg: string }> = {
  birthday: { bg: colors.brownTint, fg: colors.brown },
  anniversary: { bg: colors.dangerTint, fg: colors.anniversary },
  birth_tithi: { bg: colors.navyTint, fg: colors.navy },
  punyatithi: { bg: colors.frame, fg: colors.muted },
  other: { bg: colors.greenTint, fg: colors.green },
  diksha: { bg: colors.navyTint, fg: colors.navy },
};

/**
 * Special days (Main.dc.html isDays): date tile, title, "Turns 10 · Tue, Oct 6",
 * reminder line in weeks, "Plan labh" on every eligible day (opens the labh
 * screen, whatever the date — the reminder window only times the reminder),
 * dashed "+ Add a special day" that toggles to "Close". While the family has no
 * days yet, an adult is asked first — "Would you like to plan any special
 * days?" — and "Yes" opens the form (where a labh can be pledged for the day).
 */
export default function SpecialDaysScreen() {
  const t = useT();
  const givingOn = useModule('giving');
  const router = useRouter();
  const { member, center } = useApp();
  const { invalidate } = useDataVersion();
  const { toast, confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [notNow, setNotNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useLoad(
    async () => {
      if (!member?.household || !center) return [];
      const today = todayAt(center.time_zone);
      const days = await listSpecialDays(member.household.id);
      const tithi = await nextTithiDates(center.id, today, days.filter((d) => !d.calendar_date && d.tithi && d.tithi_month).map((d) => ({ id: d.id, tithi: d.tithi as string, month: d.tithi_month as string })));
      return days
        .map((d) => ({ day: d, next: d.calendar_date ? nextOccurrence(d.calendar_date, today) : (tithi[d.id] ?? null), today }))
        .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999'));
    },
    [member?.household?.id, center?.id],
    'load special days',
  );
  if (!member) return null;
  // No days yet: an adult is asked before the form (a failed or pending load shows the list state instead).
  const askFirst = member.isAdult && !adding && !notNow && state.data?.length === 0;

  const remove =async (id: string, name: string) => {
    const ok = await confirm({ title: t('days.removeTitle'), body: t('days.removeBody', { name }), confirmLabel: t('common.delete'), tone: 'danger' });
    if (!ok) return;
    setError(null);
    try {
      await deleteSpecialDay(id);
      invalidate();
      toast(t('days.removed'));
    } catch (err) {
      setError(report(err, 'remove this special day').userMessage);
    }
  };

  return (
    <Screen title={t('days.title')} onRefresh={async () => invalidate()}>
      <Txt variant="small" color="ink2" style={{ lineHeight: 21 }}>
        {t('days.intro')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Loaded state={state}>
        {(rows) => (
          <VStack gap={space.md}>
            {rows.length === 0 && !askFirst ? <EmptyState icon="gift-outline" title={t('days.none')} /> : null}
            {rows.map(({ day, next, today }) => {
              const occ = occasionOf(day);
              const tint = TINT[occ];
              const name = listDisplayName(t, day, member.members);
              const who = day.person_id ? member.members.find((m) => m.person.id === day.person_id) : null;
              const years = day.calendar_date ? yearsOn(day.calendar_date, next) : null;
              const yearsText = years != null ? (occ === 'birthday' ? t('days.turns', { n: years }) : occ === 'anniversary' ? t('days.years', { n: years }) : null) : null;
              const sub = [
                yearsText,
                day.tithi ? `${day.tithi_month ?? ''} ${day.tithi}`.trim() : null,
                next ? formatDay(next) : t('days.tithiUnknown'),
              ]
                .filter(Boolean)
                .join(' · ');
              const soon = isWithinReminder(next, today, day.reminder_days_before);
              const span = reminderSpan(t, day.reminder_days_before);
              const remind = soon ? t('days.reminderSent', { span }) : t('days.reminderBefore', { span, when: whenText(t, today, next) });
              const canPlan = canPlanLabh({ givingOn, isAdult: member.isAdult, occasion: occ, labhPromptEnabled: day.labh_prompt_enabled });
              return (
                <View key={day.id} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={{ width: 48, height: 52, borderRadius: radii.lg, backgroundColor: tint.bg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
                    <Txt variant="badge" style={{ color: tint.fg }}>
                      {next ? monthShortUpper(next) : '—'}
                    </Txt>
                    <Txt variant="subhead" style={{ color: tint.fg, fontFamily: fonts.bodyBold }}>
                      {next ? String(parseISODate(next)?.d ?? '') : '?'}
                    </Txt>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong">{name}</Txt>
                    <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                      {who && occ === 'punyatithi' && !day.label ? `${who.person.first_name} · ${sub}` : sub}
                    </Txt>
                    <Txt variant="fine" color="faint">
                      {remind}
                    </Txt>
                    {canPlan ? (
                      <Pressable
                        onPress={() => router.push(`/labh/${day.id}` as Href)}
                        accessibilityRole="button"
                        accessibilityLabel={t('days.planLabhLabel', { name })}
                        style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: space.sm, minHeight: 44, paddingHorizontal: space.lg, borderRadius: 22, backgroundColor: colors.brown, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                        <Txt variant="caption" color="white" style={{ fontFamily: fonts.bodySemi }}>
                          {t('days.planLabh')}
                        </Txt>
                      </Pressable>
                    ) : null}
                  </View>
                  {member.isAdult ? <IconButton icon="trash-outline" label={t('days.removeLabel', { name })} color={colors.faint} iconSize={20} onPress={() => remove(day.id, name)} /> : null}
                </View>
              );
            })}
          </VStack>
        )}
      </Loaded>
      {askFirst ? (
        <PlanDaysQuestion question={t('days.ask')} onYes={() => setAdding(true)} onNotNow={() => setNotNow(true)} />
      ) : member.isAdult ? (
        <>
          <Pressable
            onPress={() => setAdding(!adding)}
            accessibilityRole="button"
            accessibilityState={{ expanded: adding }}
            style={({ pressed }) => ({ minHeight: 52, borderRadius: radii.row, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Txt variant="bodyStrong" color="navy">
              {adding ? t('days.close') : t('days.add')}
            </Txt>
          </Pressable>
          {adding ? <AddSpecialDayForm onDone={() => setAdding(false)} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
