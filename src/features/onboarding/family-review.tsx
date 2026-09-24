import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Banner, Button, Card, Row, TextField, Txt, VStack } from '@/components/ui';
import { genderLabel, roleLabel } from '@/features/labels';
import { relationshipChanged } from '@/features/profile';
import { draftFromPerson, listOpenHouseholdRequests, profileToUpdate, requestAddFamilyMember, requestRelationshipChange, updatePerson, type ProfileErrors } from '@/lib/api/family';
import type { FamilyMember } from '@/lib/api/member';
import { report } from '@/lib/errors';
import { formatDob, fullName } from '@/lib/format';
import { ageOn } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { ProfileFields } from './profile-fields';

/** Inline editor under a member card; "Done" saves (only if something changed) and closes. */
function PersonEditor({ fm, registerSave }: { fm: FamilyMember; registerSave: (fn: () => Promise<boolean>) => void }) {
  const t = useT();
  const { member, center, refreshMember } = useApp();
  const recorded = roleLabel(t, fm.role);
  const initial = draftFromPerson(fm.person, recorded);
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [error, setError] = useState<string | null>(null);

  const save = async (): Promise<boolean> => {
    if (JSON.stringify(draft) === JSON.stringify(initial)) return true;
    const { update, errors: errs } = profileToUpdate(draft, fm.isAdult);
    setErrors(errs);
    if (Object.keys(errs).length) return false;
    setError(null);
    try {
      await updatePerson(fm.person.id, update);
      if (member?.household && center && member.isAdult && relationshipChanged(recorded, draft.relationship)) {
        await requestRelationshipChange({ centerId: center.id, userId: member.userId, householdId: member.household.id, personId: fm.person.id, from: fm.role, to: draft.relationship });
      }
      await refreshMember();
      return true;
    } catch (err) {
      setError(report(err, 'save this family member').userMessage);
      return false;
    }
  };
  // The card header's "Done" button calls the latest save.
  useEffect(() => {
    registerSave(save);
  });

  return (
    <VStack gap={10} style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 }}>
      {error ? <Banner tone="error" message={error} /> : null}
      <ProfileFields variant="family" draft={draft} onChange={setDraft} errors={errors} withContact={fm.isAdult} />
      {relationshipChanged(recorded, draft.relationship) ? (
        <Txt variant="caption" color="brown" style={{ fontFamily: fonts.body }}>
          {t('profile.relationshipNote')}
        </Txt>
      ) : null}
      {!fm.isAdult ? (
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {t('familyStep.childNote')}
        </Txt>
      ) : null}
    </VStack>
  );
}

function AddMemberCard({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { member, center } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState(member?.person.last_name ?? '');
  const [relationship, setRelationship] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!member || !center || !member.household) return null;
  const householdId = member.household.id;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestAddFamilyMember({ centerId: center.id, userId: member.userId, householdId, first, last, relationship, dob });
      invalidate();
      toast(t('familyStep.addSent'));
      onClose();
    } catch (err) {
      setError(report(err, 'send the request to add a family member').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card tone="outlineNavy" style={{ borderWidth: 1, gap: 10 }}>
      <Txt variant="bodyStrong">{t('familyStep.addTitle')}</Txt>
      <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
        {t('familyStep.addBody')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Row gap={space.sm} align="flex-start">
        <View style={{ flex: 1 }}>
          <TextField size="sm" label={t('profile.firstName')} value={first} onChangeText={setFirst} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField size="sm" label={t('profile.lastName')} value={last} onChangeText={setLast} />
        </View>
      </Row>
      <Row gap={space.sm} align="flex-start">
        <View style={{ flex: 1 }}>
          <TextField size="sm" label={t('familyStep.relationship')} value={relationship} onChangeText={setRelationship} placeholder={t('familyStep.relationshipPlaceholder')} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField size="sm" label={t('profile.dob')} value={dob} onChangeText={setDob} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" />
        </View>
      </Row>
      <Button label={t('familyStep.addSend')} onPress={send} busy={busy} size="md" />
      <Button label={t('common.cancel')} onPress={onClose} tone="ghost" size="md" />
    </Card>
  );
}

/**
 * "Your family" (onboarding step 4, Onboarding.dc.html s4): a card per
 * member with Edit / Done, the dashed "+ Add family member", and requests
 * still waiting for the membership team (household_change_requests).
 */
export function FamilyReview({ onContinue }: { onContinue?: () => void }) {
  const t = useT();
  const { member } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);
  const pending = useLoad(() => (member?.household ? listOpenHouseholdRequests(member.household.id) : Promise.resolve([])), [member?.household?.id], 'load your family requests');
  if (!member) return null;

  // Done (or opening another card) saves the open editor first; a failed save keeps it open.
  const toggleEdit = async (id: string) => {
    if (openId && saveRef.current) {
      setSaving(true);
      const ok = await saveRef.current();
      setSaving(false);
      if (!ok) return;
    }
    saveRef.current = null;
    setOpenId(openId === id ? null : id);
  };

  const pendingAdds = (pending.data ?? []).filter((r) => r.kind === 'add_member');

  return (
    <VStack gap={space.md}>
      {member.members.map((fm) => {
        const canEdit = fm.person.id === member.person.id || member.isAdult;
        const age = ageOn(fm.person.date_of_birth, member.today);
        const summary = [roleLabel(t, fm.role), age != null ? String(age) : null, genderLabel(t, fm.person.gender), fm.isAdult ? fm.person.profession : null].filter(Boolean).join(' · ');
        const open = openId === fm.person.id;
        return (
          <View key={fm.person.id} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: open ? colors.navy : colors.border, borderRadius: radii.xl, paddingVertical: space.md, paddingHorizontal: 14, gap: 10 }}>
            <Row gap={space.md}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.navyTint2, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
                <Txt variant="bodyStrong" color="navy">
                  {fm.person.first_name.charAt(0).toUpperCase()}
                </Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{fullName(fm.person)}</Txt>
                <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                  {summary}
                </Txt>
              </View>
              {canEdit ? <Button label={open ? t('common.done') : t('common.edit')} tone="secondary" size="sm" fill={false} busy={open && saving} onPress={() => void toggleEdit(fm.person.id)} style={{ minHeight: 40 }} /> : null}
            </Row>
            {open ? (
              <PersonEditor
                fm={fm}
                registerSave={(fn) => {
                  saveRef.current = fn;
                }}
              />
            ) : null}
          </View>
        );
      })}
      {pendingAdds.map((r) => {
        const d = (r.details ?? {}) as Record<string, unknown>;
        const name = [d.first_name, d.last_name].filter((x) => typeof x === 'string').join(' ');
        return (
          <View key={r.id} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: space.md, paddingHorizontal: 14, gap: 2 }}>
            <Txt variant="bodyStrong">{name || t('familyStep.newMember')}</Txt>
            <Txt variant="caption" color="brown" style={{ fontFamily: fonts.body }}>
              {[typeof d.relationship === 'string' ? d.relationship : null, typeof d.dob === 'string' ? formatDob(d.dob) : null, t('familyStep.pending')].filter(Boolean).join(' · ')}
            </Txt>
          </View>
        );
      })}
      {pending.error ? <Banner tone="error" message={pending.error.userMessage} action={{ label: t('common.retry'), onPress: () => void pending.reload() }} /> : null}
      {adding ? (
        <AddMemberCard onClose={() => setAdding(false)} />
      ) : member.isAdult && member.household ? (
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          style={({ pressed }) => ({ minHeight: 52, borderRadius: radii.row, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Txt variant="bodyStrong" color="navy">
            {t('familyStep.add')}
          </Txt>
        </Pressable>
      ) : null}
      {onContinue ? (
        <Button
          label={t('familyStep.looksRight')}
          busy={saving && !openId}
          onPress={async () => {
            if (openId && saveRef.current) {
              setSaving(true);
              const ok = await saveRef.current();
              setSaving(false);
              if (!ok) return;
              setOpenId(null);
            }
            onContinue();
          }}
        />
      ) : null}
      {onContinue ? (
        <Button
          label={t('familyStep.looksRight')}
          busy={saving && !openId}
          onPress={async () => {
            if (openId && saveRef.current) {
              setSaving(true);
              const ok = await saveRef.current();
              setSaving(false);
              if (!ok) return;
              setOpenId(null);
            }
            onContinue();
          }}
        />
      ) : null}
    </VStack>
  );
}
