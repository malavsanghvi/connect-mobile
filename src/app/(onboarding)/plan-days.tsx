import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Loaded } from '@/components/states';
import { Button, Card, Txt, VStack } from '@/components/ui';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { listDisplayName } from '@/features/special-days';
import { AddSpecialDayForm, PlanDaysQuestion } from '@/features/special-days-form';
import { listSpecialDays } from '@/lib/api/family';
import { formatDay, todayAt } from '@/lib/format';
import { nextOccurrence } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useCategory } from '@/providers/category';
import { useT } from '@/providers/settings';
import { fonts, space } from '@/theme';

/**
 * Onboarding: the family's special days (birthdays, anniversaries, tithis). It asks first — "Would you like to plan
 * any special days?" — and "Yes" opens the same form as Family › Special days, where a labh can be pledged for the
 * day too; each saved day comes back to the question for the next one. Optional and skippable. Adults only: a child
 * goes straight on, since only an adult adds a day for the family.
 */
export default function PlanDaysStepScreen() {
  const router = useRouter();
  const t = useT();
  const { member, center, onboardingPreview } = useApp();
  const { layout } = useCategory();
  const [adding, setAdding] = useState(false);
  const householdId = member?.household?.id ?? null;
  const state = useLoad(() => (householdId ? listSpecialDays(householdId) : Promise.resolve([])), [householdId], 'load your special days');
  if (!member || !center) return null;
  if (!member.isAdult) return <Redirect href="/contact" />;
  // A kind of organization with no special days (a chamber of commerce) skips this step.
  if (!layout.specialDays) return <Redirect href="/whatsapp-groups" />;
  const days = state.data ?? [];
  const today = todayAt(center.time_zone);
  const next = () => router.push('/whatsapp-groups');

  return (
    <OnboardingFrame step="planDays" title={t('planDays.title')} subtitle={t('planDays.subtitle')} onBack={() => router.back()} onSkip={next}>
      <VStack gap={space.md}>
        <Loaded state={state}>
          {(rows) =>
            rows.length ? (
              <Card style={{ gap: space.sm }}>
                <Txt variant="meta" color="muted">
                  {t('planDays.added')}
                </Txt>
                {rows.map((d) => {
                  const when = d.calendar_date ? formatDay(nextOccurrence(d.calendar_date, today)) : `${d.tithi_month ?? ''} ${d.tithi ?? ''}`.trim();
                  return (
                    <View key={d.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                      <Txt variant="small" style={{ flex: 1, fontFamily: fonts.bodySemi }}>
                        {listDisplayName(t, d, member.members)}
                      </Txt>
                      <Txt variant="small" color="muted">
                        {when}
                      </Txt>
                    </View>
                  );
                })}
              </Card>
            ) : null
          }
        </Loaded>
        {adding ? (
          <>
            <AddSpecialDayForm preview={onboardingPreview} onDone={() => setAdding(false)} />
            <Button label={t('common.continue')} tone="secondary" onPress={next} />
          </>
        ) : (
          <PlanDaysQuestion question={days.length ? t('planDays.askMore') : t('days.ask')} onYes={() => setAdding(true)} onNotNow={next} />
        )}
        <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
          {t('planDays.later')}
        </Txt>
      </VStack>
    </OnboardingFrame>
  );
}
