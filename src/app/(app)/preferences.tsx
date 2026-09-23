import { useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { ContactPrefsForm } from '@/features/onboarding/contact-prefs-form';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';

/** Contact channels, language, topics and documents & mail — the onboarding step 5 form. */
export default function PreferencesScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const { toast } = useFeedback();
  if (!member || !center) return null;
  return (
    <Screen title={t('prefs.title')}>
      <ContactPrefsForm
        member={member}
        centerId={center.id}
        mode="settings"
        onSaved={() => {
          toast(t('prefs.saved'));
          router.back();
        }}
      />
    </Screen>
  );
}
