import { Redirect, useRouter } from 'expo-router';

import { OnboardingFrame } from '@/features/onboarding/frame';
import { MoreAboutYou } from '@/features/profile-details/more-about-you';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

/**
 * Onboarding step 5: "A little more about you" — wedding anniversary, dietary needs, volunteering
 * interests and an emergency contact. All optional and skippable, prefilled with whatever the office
 * already holds, and editable later from Profile › More about you. Children never see this step:
 * an adult of the family adds a child's details from the child's profile.
 */
export default function DetailsStepScreen() {
  const router = useRouter();
  const t = useT();
  const { member, center, onboardingPreview } = useApp();
  if (!member || !center) return null;
  if (!member.isAdult) return <Redirect href="/family" />;
  return (
    <OnboardingFrame
      step="details"
      title={t('details.title')}
      subtitle={t('details.subtitle', { center: center.short_name || center.name })}
      onBack={() => router.back()}
      onSkip={() => router.push('/family')}>
      <MoreAboutYou person={member.person} isAdult editable variant="onboarding" preview={onboardingPreview} onSaved={() => router.push('/family')} />
    </OnboardingFrame>
  );
}
