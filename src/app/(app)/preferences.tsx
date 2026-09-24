import { useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { DocumentsForm } from '@/features/onboarding/contact-prefs-form';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';

/**
 * Family › Documents and mail: the household's paper-or-digital choice
 * (onboarding step 5 asks it once; this is where it changes later).
 * Channels, language and notification topics are set per person in Profile.
 */
export default function PreferencesScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const { toast } = useFeedback();
  if (!member || !center) return null;
  return (
    <Screen title={t('prefs.documents')}>
      <DocumentsForm
        member={member}
        centerId={center.id}
        onSaved={() => {
          toast(t('prefs.saved'));
          router.back();
        }}
      />
    </Screen>
  );
}
