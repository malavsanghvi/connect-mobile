import { useRouter } from 'expo-router';

import { ContactPrefsForm } from '@/features/onboarding/contact-prefs-form';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

/** Onboarding step 9 (the last): contact preferences + documents & mail (required). */
export default function ContactStepScreen() {
  const router = useRouter();
  const t = useT();
  const { member, center, onboardingPreview } = useApp();
  if (!member || !center) return null;
  return (
    <OnboardingFrame
      step="contact"
      title={t('prefs.title')}
      onBack={() => router.back()}
      onSkip={() => router.push({ pathname: '/done', params: { skipped: '1' } })}>
      <ContactPrefsForm
        member={member}
        centerId={center.id}
        preview={onboardingPreview}
        onSaved={(summary) =>
          router.push({
            pathname: '/done',
            params: { channels: summary.channels.join(','), paper: summary.physicalMail === null ? '' : summary.physicalMail ? 'mail' : 'digital' },
          })
        }
      />
    </OnboardingFrame>
  );
}
