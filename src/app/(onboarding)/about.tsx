import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Banner, Button } from '@/components/ui';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { ProfileFields } from '@/features/onboarding/profile-fields';
import { draftFromPerson, profileToUpdate, updatePerson, type ProfileErrors } from '@/lib/api/family';
import { report } from '@/lib/errors';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

/** Onboarding step 3: About you (updates the member's own people row). */
export default function AboutScreen() {
  const router = useRouter();
  const t = useT();
  const { member, refreshMember } = useApp();
  const [draft, setDraft] = useState(() => (member ? draftFromPerson(member.person) : null));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!member || !draft) return null;

  const save = async () => {
    const { update, errors: errs } = profileToUpdate(draft, member.isAdult);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      await updatePerson(member.person.id, update);
      await refreshMember();
      router.push('/family');
    } catch (err) {
      setError(report(err, 'save your details').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingFrame
      step={3}
      title={t('about.title')}
      subtitle={t('about.subtitle')}
      onBack={() => router.back()}
      onSkip={() => router.push({ pathname: '/done', params: { skipped: '1' } })}
      footer={<Button label={t('common.continue')} onPress={save} busy={busy} />}>
      {error ? <Banner tone="error" message={error} /> : null}
      <ProfileFields draft={draft} onChange={setDraft} errors={errors} withContact={member.isAdult} />
    </OnboardingFrame>
  );
}
