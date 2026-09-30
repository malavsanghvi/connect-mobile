import { useState } from 'react';

import { DateField } from '@/components/pickers';
import { Loaded } from '@/components/states';
import { Banner, Button, Chip, ChipGroup, TextField, Txt, VStack } from '@/components/ui';
import { listVolunteerGroups, myVolunteerInterests, saveVolunteerInterests, type VolunteerGroup } from '@/lib/api/guide';
import type { Person } from '@/lib/api/member';
import { loadDietaryOptions, loadProfileDetails, saveProfileDetails } from '@/lib/api/profile-details';
import type { Tables } from '@/lib/database.types';
import { report } from '@/lib/errors';
import {
  DIETARY_OTHER_KEY,
  MAX_DIETARY_OTHER,
  MAX_EC_NAME,
  MAX_EC_RELATIONSHIP,
  dietaryChoiceList,
  dietaryLabel,
  draftFromDetails,
  isEmptyDetails,
  toggleDietary,
  validateDetails,
  type DetailsDraft,
  type DetailsError,
  type DetailsErrors,
  type DietaryOption,
  type ProfileDetailsRow,
} from '@/lib/profile-details';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * "More about you" — the optional details a community asks for after the bulk upload: wedding
 * anniversary (adults), dietary needs, volunteering interests (adults), and an emergency contact.
 * ONE form, used by onboarding step 5 ("A little more about you") and by Profile › More about you.
 *
 * Saves to app.person_profile_details (connect-crm 0546) and, for the volunteering teams, to
 * app.volunteer_interests (the same rows the Welcome guide's Volunteer screen writes). Everything
 * is optional. A child's details are written by an adult of the family, so `editable` is the
 * CALLER's adulthood, not the person's; `isAdult` is the PERSON's (children carry no anniversary
 * or volunteering).
 */
export function MoreAboutYou({
  person,
  isAdult,
  editable,
  variant,
  subjectName,
  submitLabel,
  onSaved,
}: {
  person: Person;
  isAdult: boolean;
  editable: boolean;
  variant: 'onboarding' | 'profile';
  /** First name of the person when someone else is filling it in (a parent for a child), else omit. */
  subjectName?: string;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const { center } = useApp();
  const { isOn } = useModules();
  const volunteersOn = isOn('volunteers');
  const askVolunteering = isAdult && volunteersOn;
  const state = useLoad(
    async () => {
      if (!center) return null;
      const [row, options, groups, mine] = await Promise.all([
        loadProfileDetails(person.id),
        loadDietaryOptions(center.id),
        askVolunteering ? listVolunteerGroups(center.id) : Promise.resolve([] as VolunteerGroup[]),
        askVolunteering ? myVolunteerInterests(person.id) : Promise.resolve([] as Tables<'volunteer_interests'>[]),
      ]);
      return { row, options, groups, mine };
    },
    [center?.id, person.id, askVolunteering],
    'load these details',
  );
  return (
    <Loaded state={state}>
      {(data) =>
        data ? (
          <Editor person={person} isAdult={isAdult} editable={editable} variant={variant} subjectName={subjectName} submitLabel={submitLabel} onSaved={onSaved} row={data.row} options={data.options} groups={data.groups} mine={data.mine} />
        ) : null
      }
    </Loaded>
  );
}

function Editor({
  person,
  isAdult,
  editable,
  variant,
  subjectName,
  submitLabel,
  onSaved,
  row,
  options,
  groups,
  mine,
}: {
  person: Person;
  isAdult: boolean;
  editable: boolean;
  variant: 'onboarding' | 'profile';
  subjectName?: string;
  submitLabel?: string;
  onSaved?: () => void;
  row: ProfileDetailsRow | null;
  options: DietaryOption[];
  groups: VolunteerGroup[];
  mine: Tables<'volunteer_interests'>[];
}) {
  const t = useT();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<DetailsDraft>(() => draftFromDetails(row));
  const [picked, setPicked] = useState<string[]>(() => mine.filter((m) => m.status !== 'inactive').map((m) => m.group_id));
  const [errors, setErrors] = useState<DetailsErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!center || !member) return null;

  const community = center.short_name || center.name;
  const compact = variant === 'profile';
  const size = compact ? 'sm' : 'md';
  const choices = dietaryChoiceList(options, draft.dietary);
  const showVolunteering = isAdult && groups.length > 0;
  const fieldError = (e: DetailsError | undefined) => (e ? t(e.key, e.vars) : null);
  const set = (patch: Partial<DetailsDraft>) => {
    setSaved(false);
    setDraft({ ...draft, ...patch });
  };

  const save = async () => {
    const { value, errors: errs } = validateDetails(draft, { isAdult, today: member.today, dob: person.date_of_birth });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      // A member who skips every field never gets an empty row; one who clears a saved row does.
      if (!(isEmptyDetails(value) && !row)) await saveProfileDetails({ centerId: center.id, personId: person.id, value });
      if (showVolunteering) {
        // Read the current rows again so a second save never works from a stale list.
        const existing = await myVolunteerInterests(person.id);
        await saveVolunteerInterests({ centerId: center.id, personId: person.id, groupIds: picked, existing, allowEmpty: true });
      }
      invalidate();
      setSaved(true);
      if (variant === 'profile') toast(t('details.savedToast'));
      onSaved?.();
    } catch (err) {
      setError(report(err, 'save these details').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack gap={space.lg}>
      {isAdult ? (
        <VStack gap={space.xs}>
          <DateField
            label={t('details.anniversary')}
            value={draft.anniversary}
            onChangeText={(v) => set({ anniversary: v })}
            error={fieldError(errors.anniversary)}
            editable={editable}
            size={size}
            minYear={1940}
          />
          <Txt variant="caption" color="muted">
            {t('details.anniversaryHint')}
          </Txt>
        </VStack>
      ) : null}

      {choices.length > 0 ? (
        <VStack gap={space.sm}>
          <Txt variant="smallStrong" accessibilityRole="header">
            {t('details.dietary')}
          </Txt>
          <ChipGroup>
            {choices.map((o) => (
              <Chip key={o.key} label={dietaryLabel(o, t)} selected={draft.dietary.includes(o.key)} onPress={() => set({ dietary: toggleDietary(draft.dietary, o.key) })} disabled={!editable} />
            ))}
          </ChipGroup>
          {draft.dietary.includes(DIETARY_OTHER_KEY) ? (
            <TextField
              size={size}
              label={t('details.dietaryOther')}
              value={draft.dietaryOther}
              onChangeText={(v) => set({ dietaryOther: v })}
              placeholder={t('details.dietaryOtherPlaceholder')}
              error={fieldError(errors.dietaryOther)}
              editable={editable}
              maxLength={MAX_DIETARY_OTHER + 50}
            />
          ) : null}
          <Txt variant="caption" color="muted">
            {t('details.dietaryHint')}
          </Txt>
        </VStack>
      ) : null}

      {showVolunteering ? (
        <VStack gap={space.sm}>
          <Txt variant="smallStrong" accessibilityRole="header">
            {t('details.volunteering')}
          </Txt>
          <ChipGroup>
            {groups.map((g) => (
              <Chip
                key={g.id}
                label={g.name}
                selected={picked.includes(g.id)}
                onPress={() => {
                  setSaved(false);
                  setPicked(picked.includes(g.id) ? picked.filter((x) => x !== g.id) : [...picked, g.id]);
                }}
                disabled={!editable}
              />
            ))}
          </ChipGroup>
          <Txt variant="caption" color="muted">
            {t('details.volunteeringHint')}
          </Txt>
        </VStack>
      ) : null}

      <VStack gap={space.sm}>
        <Txt variant="smallStrong" accessibilityRole="header">
          {t('details.emergency')}
        </Txt>
        <Txt variant="caption" color="muted">
          {subjectName ? t('details.emergencyHintFor', { name: subjectName }) : t('details.emergencyHint')}
        </Txt>
        <TextField
          size={size}
          label={t('details.ecName')}
          value={draft.ecName}
          onChangeText={(v) => set({ ecName: v })}
          error={fieldError(errors.ecName)}
          editable={editable}
          autoComplete="name"
          maxLength={MAX_EC_NAME + 20}
        />
        <TextField
          size={size}
          label={t('details.ecRelationship')}
          value={draft.ecRelationship}
          onChangeText={(v) => set({ ecRelationship: v })}
          placeholder={t('details.ecRelationshipPlaceholder')}
          error={fieldError(errors.ecRelationship)}
          editable={editable}
          maxLength={MAX_EC_RELATIONSHIP + 20}
        />
        <TextField
          size={size}
          label={t('details.ecPhone')}
          value={draft.ecPhone}
          onChangeText={(v) => set({ ecPhone: v })}
          error={fieldError(errors.ecPhone)}
          editable={editable}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="(713) 555-0142"
        />
      </VStack>

      {error ? <Banner tone="error" message={error} action={{ label: t('common.retry'), onPress: () => void save() }} /> : null}
      {editable ? (
        <Button
          label={variant === 'onboarding' ? (submitLabel ?? t('common.continue')) : saved ? t('details.savedButton') : t('details.save')}
          onPress={() => void save()}
          busy={busy}
          tone={variant === 'profile' && saved ? 'green' : 'primary'}
        />
      ) : (
        <Banner tone="info" message={t('details.parentOnly')} />
      )}
      <Txt variant="caption" color="muted" center>
        {t('details.privacy', { center: community })}
      </Txt>
    </VStack>
  );
}
