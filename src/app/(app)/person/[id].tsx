import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/states';
import { Avatar, Banner, Button, Card, Chip, ChipGroup, IconButton, Row, SectionTitle, TextField, Toggle, Txt, VStack } from '@/components/ui';
import { roleLabel } from '@/features/labels';
import { ContactPrefsForm } from '@/features/onboarding/contact-prefs-form';
import { ProfileFields } from '@/features/onboarding/profile-fields';
import { draftFromPerson, profileToUpdate, updatePerson, type ProfileErrors } from '@/lib/api/family';
import type { FamilyMember } from '@/lib/api/member';
import { report } from '@/lib/errors';
import { fullName } from '@/lib/format';
import { ageOn, identifierLine } from '@/lib/rules';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

const EXPERTISE = ['Medicine and health', 'Law', 'Tax and accounting', 'Finance and investing', 'Real estate', 'Engineering and tech', 'Education and careers', 'Business and startups', 'Arts and music'];

/** Person profile (prototype §2.21). Adults edit themselves and their children; children view only contact-free fields. */
export default function PersonScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useApp();
  const fm = member?.members.find((m) => m.person.id === id);
  return <Screen title={t('profile.title')}>{fm && member ? <PersonBody key={fm.person.id} fm={fm} /> : <EmptyState title={t('profile.notFound')} />}</Screen>;
}

function PersonBody({ fm }: { fm: FamilyMember }) {
  const t = useT();
  const router = useRouter();
  const { member, center, refreshMember, orgMemberLabel } = useApp();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState(() => draftFromPerson(fm.person));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [newcomers, setNewcomers] = useState(fm.person.new_member_contact_opt_in);
  const [expertiseOn, setExpertiseOn] = useState(fm.person.expertise_opt_in);
  const [tags, setTags] = useState<string[]>(fm.person.expertise_tags ?? []);
  const [headline, setHeadline] = useState(fm.person.expertise_headline ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!member || !center) return null;

  const isSelf = fm.person.id === member.person.id;
  const canEdit = isSelf || member.isAdult;
  // Children can't change contact or consent settings (FEATURE_TRACEABILITY: onboarding rules).
  const withContact = fm.isAdult && canEdit;
  const age = ageOn(fm.person.date_of_birth, member.today);
  const ids = identifierLine({ orgLabel: orgMemberLabel, orgId: fm.orgMemberId, connectNumber: fm.person.member_number });

  const save = async () => {
    const { update, errors: errs } = profileToUpdate(draft, withContact);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      await updatePerson(fm.person.id, {
        ...update,
        ...(fm.isAdult
          ? { new_member_contact_opt_in: newcomers, expertise_opt_in: expertiseOn, expertise_tags: expertiseOn ? tags : [], expertise_headline: expertiseOn && headline.trim() ? headline.trim() : null }
          : {}),
      });
      await refreshMember();
      setSaved(true);
      toast(t('profile.saved'));
    } catch (err) {
      setError(report(err, 'save this profile').userMessage);
    } finally {
      setBusy(false);
    }
  };
  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    setSaved(false);
    fn(v);
  };

  return (
    <VStack gap={space.lg}>
      <Card tone="navy">
        <Row gap={space.md}>
          <Avatar name={fm.person.first_name} size={52} />
          <View style={{ flex: 1 }}>
            <Txt variant="headline" color="white">
              {fullName(fm.person)}
            </Txt>
            <Txt variant="meta" color="onNavy">
              {[roleLabel(t, fm.role), age != null ? t('family.age', { age }) : null].filter(Boolean).join(' · ')}
            </Txt>
            {ids ? (
              <Txt variant="caption" color="onNavy" selectable>
                {ids}
              </Txt>
            ) : null}
          </View>
          <IconButton icon="qr-code-outline" label={t('family.qrFor', { name: fm.person.first_name })} color={colors.white} onPress={() => router.push({ pathname: '/member-card', params: { person: fm.person.id } })} />
        </Row>
      </Card>

      <SectionTitle>{t('profile.details')}</SectionTitle>
      <ProfileFields draft={draft} onChange={touch(setDraft)} errors={errors} withContact={withContact} editable={canEdit} />

      {!fm.isAdult ? (
        <Banner tone="info" message={t('profile.childNote', { name: fm.person.first_name })} />
      ) : canEdit ? (
        <VStack gap={space.sm}>
          <SectionTitle>{t('profile.community')}</SectionTitle>
          <Card>
            <Toggle label={t('profile.newcomers')} sub={t('profile.newcomersSub')} value={newcomers} onChange={touch(setNewcomers)} />
            {newcomers ? (
              <Txt variant="meta" color="muted">
                {t('profile.newcomersNote', { name: fm.person.first_name })}
              </Txt>
            ) : null}
            <Toggle label={t('profile.expertise')} sub={t('profile.expertiseSub')} value={expertiseOn} onChange={touch(setExpertiseOn)} />
            {expertiseOn ? (
              <VStack gap={space.sm}>
                <ChipGroup>
                  {EXPERTISE.map((tag) => (
                    <Chip key={tag} label={tag} selected={tags.includes(tag)} onPress={() => touch(setTags)(tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag])} />
                  ))}
                </ChipGroup>
                <TextField label={t('profile.headline')} value={headline} onChangeText={touch(setHeadline)} placeholder={t('profile.headlinePlaceholder')} />
                <Txt variant="meta" color="muted">
                  {t('profile.expertiseDisclaimer')}
                </Txt>
              </VStack>
            ) : null}
          </Card>
        </VStack>
      ) : null}

      {error ? <Banner tone="error" message={error} /> : null}
      {canEdit ? <Button label={saved ? t('profile.savedButton') : t('common.save')} onPress={save} busy={busy} tone={saved ? 'green' : 'primary'} /> : <Banner tone="info" message={t('profile.viewOnly')} />}

      {canEdit ? (
        <VStack gap={space.sm}>
          <SectionTitle>{t('profile.notifications', { name: fm.person.first_name })}</SectionTitle>
          <ContactPrefsForm member={member} target={fm} centerId={center.id} mode="settings" onSaved={() => toast(t('prefs.saved'))} />
        </VStack>
      ) : null}
    </VStack>
  );
}
