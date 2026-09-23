import { View } from 'react-native';

import { Chip, ChipGroup, Row, TextField, Txt, VStack } from '@/components/ui';
import type { Gender, ProfileDraft, ProfileErrors } from '@/lib/api/family';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

const GENDERS: { value: Gender; key: 'profile.female' | 'profile.male' | 'profile.preferNot' }[] = [
  { value: 'female', key: 'profile.female' },
  { value: 'male', key: 'profile.male' },
  { value: 'prefer_not_to_say', key: 'profile.preferNot' },
];

/** Person details used by onboarding ("About you", "Your family") and the Profile screen. */
export function ProfileFields({
  draft,
  onChange,
  errors,
  withContact,
  editable = true,
}: {
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  errors: ProfileErrors;
  withContact: boolean;
  editable?: boolean;
}) {
  const t = useT();
  const set = (patch: Partial<ProfileDraft>) => onChange({ ...draft, ...patch });
  return (
    <VStack gap={space.md}>
      <Row gap={space.md} align="flex-start">
        <View style={{ flex: 1 }}>
          <TextField label={t('profile.firstName')} value={draft.first_name} onChangeText={(v) => set({ first_name: v })} error={errors.first_name} editable={editable} autoComplete="given-name" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label={t('profile.lastName')} value={draft.last_name} onChangeText={(v) => set({ last_name: v })} error={errors.last_name} editable={editable} autoComplete="family-name" />
        </View>
      </Row>
      <TextField
        label={t('profile.dob')}
        hint={t('profile.dobHint')}
        value={draft.dob}
        onChangeText={(v) => set({ dob: v })}
        error={errors.dob}
        editable={editable}
        placeholder="MM/DD/YYYY"
        keyboardType="numbers-and-punctuation"
      />
      <VStack gap={space.xs}>
        <Txt variant="smallStrong" color="ink2">
          {t('profile.gender')}
        </Txt>
        <ChipGroup>
          {GENDERS.map((g) => (
            <Chip key={g.value} label={t(g.key)} selected={draft.gender === g.value} onPress={() => set({ gender: draft.gender === g.value ? '' : g.value })} disabled={!editable} />
          ))}
        </ChipGroup>
      </VStack>
      {withContact ? (
        <>
          <TextField label={t('profile.profession')} value={draft.profession} onChangeText={(v) => set({ profession: v })} editable={editable} />
          <TextField label={t('profile.employer')} hint={t('profile.employerHint')} value={draft.employer} onChangeText={(v) => set({ employer: v })} editable={editable} placeholder={t('profile.employerPlaceholder')} />
          <TextField
            label={t('profile.mobile')}
            value={draft.phone}
            onChangeText={(v) => set({ phone: v })}
            error={errors.phone}
            editable={editable}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="(713) 555-0142"
          />
          <TextField
            label={t('profile.email')}
            hint={t('profile.emailHint')}
            value={draft.email}
            onChangeText={(v) => set({ email: v })}
            error={errors.email}
            editable={editable}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </>
      ) : null}
    </VStack>
  );
}
