import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, Banner, Button, Card, Row, TextField, Txt, VStack } from '@/components/ui';
import { draftFromPerson, profileToUpdate, requestAddFamilyMember, updatePerson, type ProfileErrors } from '@/lib/api/family';
import type { FamilyMember } from '@/lib/api/member';
import { report } from '@/lib/errors';
import { fullName } from '@/lib/format';
import { ageOn } from '@/lib/rules';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { genderLabel } from '@/features/labels';
import { space } from '@/theme';

import { ProfileFields } from './profile-fields';

function PersonEditor({ fm, onDone }: { fm: FamilyMember; onDone: () => void }) {
  const t = useT();
  const { refreshMember } = useApp();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState(() => draftFromPerson(fm.person));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const { update, errors: errs } = profileToUpdate(draft, fm.isAdult);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      await updatePerson(fm.person.id, update);
      await refreshMember();
      toast(t('family.savedPerson', { name: draft.first_name }));
      onDone();
    } catch (err) {
      setError(report(err, 'save this profile').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack gap={space.md}>
      {error ? <Banner tone="error" message={error} /> : null}
      <ProfileFields draft={draft} onChange={setDraft} errors={errors} withContact={fm.isAdult} />
      {!fm.isAdult ? (
        <Txt variant="meta" color="muted">
          {t('familyStep.childNote')}
        </Txt>
      ) : null}
      <Button label={t('common.save')} onPress={save} busy={busy} size="md" />
    </VStack>
  );
}

function AddMemberForm({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { member, center } = useApp();
  const { toast } = useFeedback();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState(member?.person.last_name ?? '');
  const [relationship, setRelationship] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!member || !center) return null;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestAddFamilyMember({ centerId: center.id, userId: member.userId, personId: member.person.id, householdName: member.household?.display_name ?? fullName(member.person), first, last, relationship, dob });
      toast(t('familyStep.addSent'));
      onClose();
    } catch (err) {
      setError(report(err, 'send the request to add a family member').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Txt variant="section">{t('familyStep.addTitle')}</Txt>
      <Txt variant="meta" color="muted">
        {t('familyStep.addBody')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <TextField label={t('profile.firstName')} value={first} onChangeText={setFirst} />
      <TextField label={t('profile.lastName')} value={last} onChangeText={setLast} />
      <TextField label={t('familyStep.relationship')} value={relationship} onChangeText={setRelationship} placeholder={t('familyStep.relationshipPlaceholder')} />
      <TextField label={t('profile.dob')} value={dob} onChangeText={setDob} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" />
      <Button label={t('familyStep.addSend')} onPress={send} busy={busy} size="md" />
      <Button label={t('common.cancel')} onPress={onClose} tone="ghost" size="md" />
    </Card>
  );
}

/** Review / edit every family member (onboarding step 4). */
export function FamilyReview() {
  const t = useT();
  const { member } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (!member) return null;

  return (
    <VStack>
      {member.members.map((fm) => {
        const canEdit = fm.person.id === member.person.id || member.isAdult;
        const age = ageOn(fm.person.date_of_birth, member.today);
        const summary = [t(`role.${fm.role}`), age != null ? t('family.age', { age }) : null, genderLabel(t, fm.person.gender), fm.isAdult ? fm.person.profession : null]
          .filter(Boolean)
          .join(' · ');
        const open = openId === fm.person.id;
        return (
          <Card key={fm.person.id}>
            <Row gap={space.md}>
              <Avatar name={fm.person.first_name} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{fullName(fm.person)}</Txt>
                <Txt variant="meta" color="muted">
                  {summary}
                </Txt>
              </View>
              {canEdit ? <Button label={open ? t('common.done') : t('common.edit')} tone="secondary" size="sm" fill={false} onPress={() => setOpenId(open ? null : fm.person.id)} /> : null}
            </Row>
            {open ? <PersonEditor fm={fm} onDone={() => setOpenId(null)} /> : null}
          </Card>
        );
      })}
      {adding ? <AddMemberForm onClose={() => setAdding(false)} /> : member.isAdult ? <Button label={t('familyStep.add')} tone="secondary" icon="add" onPress={() => setAdding(true)} /> : null}
      <Txt variant="meta" color="muted">
        {t('familyStep.relationshipNote')}
      </Txt>
    </VStack>
  );
}
