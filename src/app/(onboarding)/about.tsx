import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Loaded } from '@/components/states';
import { Banner, Button, VStack } from '@/components/ui';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { ProfileFields } from '@/features/onboarding/profile-fields';
import { draftFromPerson, listPersonEmails, planEmailChanges, profileToUpdate, saveExtraEmails, updatePerson, type EmailDraft, type ProfileErrors } from '@/lib/api/family';
import type { Member } from '@/lib/api/member';
import type { Tables } from '@/lib/database.types';
import { report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/** Onboarding step 3: About you (Onboarding.dc.html s3) — the member's own people row and email list. */
export default function AboutScreen() {
  const router = useRouter();
  const t = useT();
  const { member } = useApp();
  const emails = useLoad(() => (member ? listPersonEmails(member.person.id) : Promise.resolve([])), [member?.person.id], 'load your email addresses');
  if (!member) return null;
  return (
    <OnboardingFrame step={3} title={t('about.title')} onBack={() => router.back()} onSkip={() => router.push({ pathname: '/done', params: { skipped: '1' } })}>
      <Loaded state={emails}>{(rows) => <AboutForm member={member} existing={rows} />}</Loaded>
    </OnboardingFrame>
  );
}

function AboutForm({ member, existing }: { member: Member; existing: Tables<'person_emails'>[] }) {
  const router = useRouter();
  const t = useT();
  const { center, refreshMember } = useApp();
  const [draft, setDraft] = useState(() => draftFromPerson(member.person));
  const [extras, setExtras] = useState<EmailDraft[]>(() => existing.filter((e) => e.label !== 'primary').map((e) => ({ id: e.id, email: e.email, label: e.label === 'work' ? 'work' : 'other' })));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!center) return;
    const { update, errors: errs } = profileToUpdate(draft, member.isAdult);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      if (member.isAdult) planEmailChanges(existing, extras, update.email ?? null);
      await updatePerson(member.person.id, update);
      if (member.isAdult) await saveExtraEmails({ centerId: center.id, personId: member.person.id, existing, drafts: extras, primary: update.email ?? null });
      await refreshMember();
      router.push('/family');
    } catch (err) {
      setError(report(err, 'save your details').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack gap={space.md}>
      {error ? <Banner tone="error" message={error} /> : null}
      <ProfileFields variant="about" draft={draft} onChange={setDraft} errors={errors} withContact={member.isAdult} emails={member.isAdult ? extras : undefined} onEmailsChange={member.isAdult ? setExtras : undefined} />
      <Button label={t('common.continue')} onPress={save} busy={busy} />
    </VStack>
  );
}
