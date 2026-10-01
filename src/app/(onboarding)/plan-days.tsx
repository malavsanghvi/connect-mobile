import { Redirect, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Loaded } from '@/components/states';
import { Button, Card, Txt, VStack } from '@/components/ui';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { ONBOARDING_STEP_NUMBER } from '@/features/onboarding/steps';
import { listDisplayName } from '@/features/special-days';
import { AddSpecialDayForm } from '@/features/special-days-form';
import { listSpecialDays } from '@/lib/api/family';
import { formatDay, todayAt } from '@/lib/format';
import { nextOccurrence } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { fonts, space } from '@/theme';

/**
 * Onboarding step 7: the family's special days (birthdays, anniversaries, tithis), saved through the same form as
 * Family › Special days. Optional and skippable. Adults only: a child goes straight on, since only an adult adds a
 * day for the family. A labh for a day is planned later from Special days, once the day comes closer.
 */
export default function PlanDaysStepScreen() {
  const router = useRouter();
  const t = useT();
  const { member, center, onboardingPreview } = useApp();
  const householdId = member?.household?.id ?? null;
  const state = useLoad(() => (householdId ? listSpecialDays(householdId) : Promise.resolve([])), [householdId], 'load your special days');
  if (!member || !center) return null;
  if (!member.isAdult) return <Redirect href="/contact" />;
  const days = state.data ?? [];
  const today = todayAt(center.time_zone);
  const next = () => router.push('/whatsapp-groups');

  return (
    <OnboardingFrame step={ONBOARDING_STEP_NUMBER.planDays} title={t('planDays.title')} subtitle={t('planDays.subtitle')} onBack={() => router.back()} onSkip={next}>
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
        {/* A new key after each save clears the form for the next day. */}
        <AddSpecialDayForm key={days.length} preview={onboardingPreview} onDone={() => undefined} />
        <Button label={t('common.continue')} tone={days.length ? 'primary' : 'secondary'} onPress={next} />
        <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
          {t('planDays.later')}
        </Txt>
      </VStack>
    </OnboardingFrame>
  );
}
