import { Pressable, TextInput, View } from 'react-native';

import { Chip, ChipGroup, IconButton, Row, TextField, Txt, VStack } from '@/components/ui';
import type { EmailDraft, Gender, ProfileDraft, ProfileErrors } from '@/lib/api/family';
import { useSettings, useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

const GENDERS: { value: Gender; key: 'profile.female' | 'profile.male' | 'profile.preferNot' }[] = [
  { value: 'female', key: 'profile.female' },
  { value: 'male', key: 'profile.male' },
  { value: 'prefer_not_to_say', key: 'profile.preferNot' },
];

/**
 * Person details, three layouts from the prototypes:
 * - `about`   onboarding step 3: names, DOB, gender, profession, employer, mobile, emails list
 * - `family`  onboarding step 4 editor: relationship + DOB, gender, (adult) profession, mobile, email
 * - `profile` Family › Profile: relationship + DOB, gender, (adult) profession, mobile, emails list
 * Fields in `family` / `profile` are the compact 44px inputs with 12px labels.
 */
export function ProfileFields({
  draft,
  onChange,
  errors,
  withContact,
  editable = true,
  variant = 'about',
  emails,
  onEmailsChange,
}: {
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  errors: ProfileErrors;
  withContact: boolean;
  editable?: boolean;
  variant?: 'about' | 'family' | 'profile';
  /** Extra addresses (person_emails) for the emails list; omit to hide the list. */
  emails?: EmailDraft[];
  onEmailsChange?: (next: EmailDraft[]) => void;
}) {
  const t = useT();
  const set = (patch: Partial<ProfileDraft>) => onChange({ ...draft, ...patch });
  const compact = variant !== 'about';
  const size = compact ? 'sm' : 'md';
  return (
    <VStack gap={compact ? space.sm : space.md}>
      {variant === 'about' ? (
        <Row gap={10} align="flex-start">
          <View style={{ flex: 1 }}>
            <TextField label={t('profile.firstName')} value={draft.first_name} onChangeText={(v) => set({ first_name: v })} error={errors.first_name} editable={editable} autoComplete="given-name" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={t('profile.lastName')} value={draft.last_name} onChangeText={(v) => set({ last_name: v })} error={errors.last_name} editable={editable} autoComplete="family-name" />
          </View>
        </Row>
      ) : null}
      {compact ? (
        <Row gap={space.sm} align="flex-start">
          <View style={{ flex: 1 }}>
            <TextField
              size="sm"
              label={t(variant === 'family' ? 'familyStep.relationship' : 'profile.relationship')}
              value={draft.relationship}
              onChangeText={(v) => set({ relationship: v })}
              editable={editable}
              placeholder={t('familyStep.relationshipPlaceholder')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField size="sm" label={t('profile.dob')} value={draft.dob} onChangeText={(v) => set({ dob: v })} error={errors.dob} editable={editable} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" />
          </View>
        </Row>
      ) : (
        <TextField label={t('profile.dob')} value={draft.dob} onChangeText={(v) => set({ dob: v })} error={errors.dob} editable={editable} placeholder="MM / DD / YYYY" keyboardType="numbers-and-punctuation" />
      )}
      <VStack gap={space.xs}>
        <Txt variant={compact ? 'caption' : 'meta'} color="muted" style={compact ? { fontFamily: fonts.body } : undefined}>
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
          <TextField size={size} label={t('profile.profession')} value={draft.profession} onChangeText={(v) => set({ profession: v })} editable={editable} />
          {variant === 'about' ? (
            <TextField label={t('profile.employer')} value={draft.employer} onChangeText={(v) => set({ employer: v })} editable={editable} placeholder={t('profile.employerPlaceholder')} />
          ) : null}
          <TextField
            size={size}
            label={t('profile.mobile')}
            value={draft.phone}
            onChangeText={(v) => set({ phone: v })}
            error={errors.phone}
            editable={editable}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="(713) 555-0142"
          />
          {emails && onEmailsChange ? (
            <EmailsEditor compact={compact} primary={draft.email} onPrimary={(v) => set({ email: v })} primaryError={errors.email} extras={emails} onExtras={onEmailsChange} editable={editable} />
          ) : (
            <TextField
              size={size}
              label={t('profile.email')}
              value={draft.email}
              onChangeText={(v) => set({ email: v })}
              error={errors.email}
              editable={editable}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          )}
        </>
      ) : null}
    </VStack>
  );
}

/**
 * "Emails" list (Onboarding step 3, Profile): the primary address (people.email,
 * receipts go here) tagged Primary, extra addresses (person_emails) tagged
 * Work / Other (tap the tag to switch), and "+ Add another email".
 */
function EmailsEditor({
  compact,
  primary,
  onPrimary,
  primaryError,
  extras,
  onExtras,
  editable,
}: {
  compact: boolean;
  primary: string;
  onPrimary: (v: string) => void;
  primaryError?: string;
  extras: EmailDraft[];
  onExtras: (next: EmailDraft[]) => void;
  editable: boolean;
}) {
  const t = useT();
  const { scale } = useSettings();
  const h = compact ? touch.min : 48;
  const r = compact ? radii.md : radii.lg;
  const fontSize = (compact ? 14 : 15) * scale;
  const row = (value: string, onText: (v: string) => void, tag: string, tagColor: 'green' | 'navy', onTag?: () => void, onRemove?: () => void, label?: string) => (
    <View style={{ minHeight: h, borderRadius: r, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', paddingLeft: compact ? 10 : space.md }}>
      <TextInput
        value={value}
        onChangeText={onText}
        editable={editable}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        accessibilityLabel={label}
        placeholder="name@example.com"
        placeholderTextColor={colors.faint}
        style={{ flex: 1, minHeight: h, fontFamily: fonts.body, fontSize, color: colors.ink }}
      />
      <Pressable onPress={onTag} disabled={!onTag || !editable} accessibilityRole={onTag ? 'button' : 'text'} accessibilityLabel={onTag ? t('profile.emailTagSwitch', { tag }) : tag} hitSlop={8} style={{ paddingHorizontal: space.sm, minHeight: h, justifyContent: 'center' }}>
        <Txt variant="fine" color={tagColor} style={{ fontFamily: fonts.bodySemi }}>
          {tag}
        </Txt>
      </Pressable>
      {onRemove && editable ? <IconButton icon="close" label={t('profile.emailRemove', { email: value || t('profile.emailNew') })} onPress={onRemove} size={36} iconSize={18} color={colors.faint} /> : null}
    </View>
  );
  return (
    <VStack gap={6}>
      <Txt variant={compact ? 'caption' : 'meta'} color="muted" style={compact ? { fontFamily: fonts.body } : undefined}>
        {t('profile.emails')}
      </Txt>
      {row(primary, onPrimary, t('profile.emailPrimary'), 'green', undefined, undefined, `${t('profile.emails')}: ${t('profile.emailPrimary')}`)}
      {primaryError ? (
        <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
          {primaryError}
        </Txt>
      ) : null}
      {extras.map((e, i) =>
        <View key={e.id ?? `new-${i}`}>
          {row(
            e.email,
            (v) => onExtras(extras.map((x, j) => (j === i ? { ...x, email: v } : x))),
            e.label === 'work' ? t('profile.emailWork') : t('profile.emailOther'),
            'green',
            () => onExtras(extras.map((x, j) => (j === i ? { ...x, label: x.label === 'work' ? 'other' : 'work' } : x))),
            () => onExtras(extras.filter((_, j) => j !== i)),
            `${t('profile.emails')}: ${e.label === 'work' ? t('profile.emailWork') : t('profile.emailOther')}`,
          )}
        </View>,
      )}
      {editable ? (
        <Pressable onPress={() => onExtras([...extras, { id: null, email: '', label: 'work' }])} accessibilityRole="button" style={{ alignSelf: 'flex-start', minHeight: compact ? 40 : touch.min, justifyContent: 'center' }}>
          <Txt variant={compact ? 'meta' : 'smallStrong'} color="navy" style={{ fontFamily: fonts.bodySemi }}>
            {t('profile.addEmail')}
          </Txt>
        </Pressable>
      ) : null}
    </VStack>
  );
}
