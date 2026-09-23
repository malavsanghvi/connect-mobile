import { useRouter } from 'expo-router';

import { Button } from '@/components/ui';
import { FamilyReview } from '@/features/onboarding/family-review';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

/** Onboarding step 4: Your family (review / edit members; adults vs children). */
export default function FamilyStepScreen() {
  const router = useRouter();
  const t = useT();
  const { member } = useApp();
  if (!member) return null;
  return (
    <OnboardingFrame
      step={4}
      title={t('familyStep.title')}
      subtitle={t('familyStep.subtitle')}
      onBack={() => router.back()}
      onSkip={() => router.push({ pathname: '/done', params: { skipped: '1' } })}
      footer={<Button label={t('familyStep.looksRight')} onPress={() => router.push('/contact')} />}>
      <FamilyReview />
    </OnboardingFrame>
  );
}
