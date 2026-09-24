import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, Divider, TextField, Toggle, Txt, VStack } from '@/components/ui';
import { roleLabel } from '@/features/labels';
import { ProfileFields } from '@/features/onboarding/profile-fields';
import { INTERESTS, normalizeInterests, relationshipChanged, toggle, type InterestKey } from '@/features/profile';
import { LANGUAGES, isLanguage, type Language, type StringKey } from '@/i18n';
import {
  BEST_CALL_TIMES,
  CONTACT_CHANNELS,
  draftFromPerson,
  loadContactPrefs,
  planEmailChanges,
  profileToUpdate,
  recordChannelOptins,
  requestRelationshipChange,
  saveExtraEmails,
  saveTopicPrefs,
  updatePerson,
  type BestCallTime,
  type ContactChannel,
  type ContactPrefs,
  type EmailDraft,
  type ProfileErrors,
} from '@/lib/api/family';
import type { FamilyMember } from '@/lib/api/member';
import { check, report } from '@/lib/errors';
import { fullName } from '@/lib/format';
import { ageOn } from '@/lib/rules';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useSettings, useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

const EXPERTISE = ['Medicine and health', 'Law', 'Tax and accounting', 'Finance and investing', 'Real estate', 'Engineering and tech', 'Education and careers', 'Business and startups', 'Arts and music'];

/**
 * Person profile (Main.dc.html isPerson, L793–899): navy hero with QR, one
 * Details card, How to reach, per-topic notification switches, Community
 * connections, Interests and ONE "Save changes". Adults edit themselves and
 * their children; children have no contact or community sections.
 */
export default function PersonScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member, center } = useApp();
  const fm = member?.members.find((m) => m.person.id === id);
  const prefs = useLoad(
    () => (fm && center ? loadContactPrefs(center.id, fm.person.id, member?.household?.id ?? null) : Promise.resolve(null)),
    [center?.id, fm?.person.id, member?.household?.id],
    'load this profile',
  );
  return (
    <Screen title={t('profile.title')}>
      {fm && member ? <Loaded state={prefs}>{(p) => (p ? <PersonBody key={fm.person.id} fm={fm} prefs={p} /> : null)}</Loaded> : <EmptyState title={t('profile.notFound')} />}
    </Screen>
  );
}

function CardTitle({ children }: { children: string }) {
  return (
    <Txt variant="bodyStrong" accessibilityRole="header">
      {children}
    </Txt>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
      {children}
    </Txt>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <Card style={{ gap: 10 }}>{children}</Card>;
}

function PersonBody({ fm, prefs }: { fm: FamilyMember; prefs: ContactPrefs }) {
  const { t, setLanguage } = useSettings();
  const router = useRouter();
  const { member, center, refreshMember, orgMemberLabel } = useApp();
  const { toast } = useFeedback();
  const community = center?.short_name || center?.name || '';
  const recordedRelationship = roleLabel(t, fm.role);
  const [draft, setDraft] = useState(() => draftFromPerson(fm.person, recordedRelationship));
  const [emails, setEmails] = useState<EmailDraft[]>(() => prefs.emails.filter((e) => e.label !== 'primary').map((e) => ({ id: e.id, email: e.email, label: e.label === 'work' ? 'work' : 'other' })));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [channels, setChannels] = useState<ContactChannel[]>(prefs.channels);
  const [callTime, setCallTime] = useState<BestCallTime | null>(BEST_CALL_TIMES.find((x) => x === fm.person.best_call_time) ?? null);
  const [lang, setLang] = useState<Language>(isLanguage(fm.person.language) ? fm.person.language : 'en');
  const [topics, setTopics] = useState<string[]>(prefs.selectedTopics);
  const [newcomers, setNewcomers] = useState(fm.person.new_member_contact_opt_in);
  const [expertiseOn, setExpertiseOn] = useState(fm.person.expertise_opt_in);
  const [tags, setTags] = useState<string[]>(fm.person.expertise_tags ?? []);
  const [headline, setHeadline] = useState(fm.person.expertise_headline ?? '');
  const [interests, setInterests] = useState<InterestKey[]>(normalizeInterests(fm.person.interests));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!member || !center) return null;

  const isSelf = fm.person.id === member.person.id;
  const canEdit = isSelf || member.isAdult;
  const adult = fm.isAdult;
  const withContact = adult && canEdit;
  const first = fm.person.preferred_name || fm.person.first_name;
  const age = ageOn(fm.person.date_of_birth, member.today);
  const idText = fm.orgMemberId ? `${orgMemberLabel} ${fm.orgMemberId}` : fm.person.member_number;
  const heroLine = [recordedRelationship, age != null ? String(age) : null, idText].filter(Boolean).join(' · ');

  // Every control clears the "Saved" state so the button reads "Save changes" again.
  const edit =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      setSaved(false);
      fn(v);
    };

  const save = async () => {
    const { update, errors: errs } = profileToUpdate(draft, withContact);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      if (withContact) planEmailChanges(prefs.emails, emails, update.email ?? null); // validate before writing anything
      await updatePerson(fm.person.id, {
        ...update,
        interests,
        ...(adult
          ? {
              language: lang,
              contact_channels: channels,
              best_call_time: channels.includes('phone_call') ? callTime : null,
              new_member_contact_opt_in: newcomers,
              expertise_opt_in: expertiseOn,
              expertise_tags: expertiseOn ? tags : [],
              expertise_headline: expertiseOn && headline.trim() ? headline.trim() : null,
            }
          : {}),
      });
      if (withContact) {
        await saveExtraEmails({ centerId: center.id, personId: fm.person.id, existing: prefs.emails, drafts: emails, primary: update.email ?? null });
        await saveTopicPrefs({ centerId: center.id, personId: fm.person.id, isAdult: true, topics: prefs.topics, selectedTopics: topics, channels });
        const channelsChanged = channels.slice().sort().join() !== prefs.channels.slice().sort().join();
        const addressChanged = (update.phone_e164 ?? null) !== fm.person.phone_e164 || (update.email ?? null) !== fm.person.email;
        if (channelsChanged || addressChanged) await recordChannelOptins({ centerId: center.id, personId: fm.person.id, channels, phone: update.phone_e164 ?? null, email: update.email ?? null, source: 'app' });
      }
      if (isSelf && adult && lang !== fm.person.language) {
        check(await supabase.from('accounts').update({ language: lang }).eq('user_id', member.userId), 'save your app language');
        setLanguage(lang);
      }
      if (member.household && member.isAdult && relationshipChanged(recordedRelationship, draft.relationship)) {
        await requestRelationshipChange({ centerId: center.id, userId: member.userId, householdId: member.household.id, personId: fm.person.id, from: fm.role, to: draft.relationship });
        toast(t('profile.relationshipSent'));
      } else {
        toast(t('profile.saved', { center: community }));
      }
      await refreshMember();
      setSaved(true);
    } catch (err) {
      setError(report(err, 'save this profile').userMessage);
    } finally {
      setBusy(false);
    }
  };

  const grid = <T extends string>(values: readonly T[], selected: (v: T) => boolean, onPress: (v: T) => void, label: (v: T) => string, columns: 2 | 3) => (
    <ChipGroup columns={columns}>
      {values.map((v) => (
        <Chip key={v} grid label={label(v)} selected={selected(v)} onPress={() => onPress(v)} disabled={!canEdit} />
      ))}
    </ChipGroup>
  );

  return (
    <VStack gap={14}>
      <View style={{ backgroundColor: colors.navy, borderRadius: radii.xxl, paddingVertical: space.lg, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brownTint, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
          <Txt variant="title" color="navy">
            {first.charAt(0).toUpperCase()}
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="headline" color="white" style={{ fontSize: 21 }} accessibilityRole="header">
            {fullName(fm.person)}
          </Txt>
          <Txt variant="meta" color="onNavy" selectable>
            {heroLine}
          </Txt>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/member-card', params: { person: fm.person.id } })}
          accessibilityRole="button"
          accessibilityLabel={t('family.qrFor', { name: first })}
          style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.onNavy, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <Txt variant="meta" color="white" style={{ fontFamily: fonts.bodySemi }}>
            {t('family.qr')}
          </Txt>
        </Pressable>
      </View>

      <Section>
        <CardTitle>{t('profile.details')}</CardTitle>
        <ProfileFields
          variant="profile"
          draft={draft}
          onChange={edit(setDraft)}
          errors={errors}
          withContact={withContact}
          editable={canEdit}
          emails={withContact ? emails : undefined}
          onEmailsChange={withContact ? edit(setEmails) : undefined}
        />
        {member.isAdult && relationshipChanged(recordedRelationship, draft.relationship) ? (
          <Txt variant="caption" color="brown" style={{ fontFamily: fonts.body }}>
            {t('profile.relationshipNote')}
          </Txt>
        ) : null}
      </Section>

      {adult && canEdit ? (
        <>
          <Section>
            <CardTitle>{t('profile.reachTitle', { name: first })}</CardTitle>
            {grid(CONTACT_CHANNELS, (c) => channels.includes(c), (c) => edit(setChannels)(toggle(channels, c)), (c) => t(`profile.channel.${c}` as StringKey), 2)}
            <FieldLabel>{t('profile.bestTime')}</FieldLabel>
            {grid(BEST_CALL_TIMES, (x) => callTime === x, (x) => edit(setCallTime)(callTime === x ? null : x), (x) => t(`profile.time.${x}` as StringKey), 3)}
            <FieldLabel>{t('profile.language')}</FieldLabel>
            {grid(
              LANGUAGES.map((l) => l.code),
              (c) => lang === c,
              (c) => edit(setLang)(c),
              (c) => LANGUAGES.find((l) => l.code === c)?.label ?? c,
              3,
            )}
          </Section>

          {prefs.topics.length ? (
            <Card style={{ paddingVertical: 6, gap: 0 }}>
              <View style={{ paddingTop: 10, paddingBottom: 4 }}>
                <CardTitle>{t('profile.notifications', { name: first })}</CardTitle>
              </View>
              {prefs.topics.map((topic) => (
                <Toggle key={topic.key} label={topic.name} value={topics.includes(topic.key)} onChange={() => edit(setTopics)(toggle(topics, topic.key))} />
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {!adult ? (
        <View style={{ backgroundColor: colors.panel, borderRadius: radii.card, paddingVertical: space.md, paddingHorizontal: 14 }}>
          <Txt variant="meta" color="muted">
            {t('profile.childNote', { name: first })}
          </Txt>
        </View>
      ) : null}

      {adult && canEdit ? (
        <Section>
          <CardTitle>{t('profile.community')}</CardTitle>
          <Toggle label={t('profile.newcomers')} sub={t('profile.newcomersSub', { center: community, name: first })} value={newcomers} onChange={edit(setNewcomers)} />
          {newcomers ? (
            <Txt variant="fine" color="faint">
              {t('profile.newcomersNote', { name: first })}
            </Txt>
          ) : null}
          <Divider />
          <Toggle label={t('profile.expertise')} sub={t('profile.expertiseSub', { name: first })} value={expertiseOn} onChange={edit(setExpertiseOn)} />
          {expertiseOn ? (
            <VStack gap={space.sm}>
              <FieldLabel>{t('profile.expertiseAreas')}</FieldLabel>
              <ChipGroup>
                {EXPERTISE.map((tag) => (
                  <Chip key={tag} label={tag} selected={tags.includes(tag)} onPress={() => edit(setTags)(toggle(tags, tag))} />
                ))}
              </ChipGroup>
              <TextField size="sm" label={t('profile.headline')} value={headline} onChangeText={edit(setHeadline)} placeholder={t('profile.headlinePlaceholder')} />
              <Txt variant="fine" color="faint">
                {t('profile.expertiseDisclaimer', { center: community })}
              </Txt>
            </VStack>
          ) : null}
        </Section>
      ) : null}

      <Section>
        <CardTitle>{t('profile.interests')}</CardTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {INTERESTS.map((k) => {
            const on = interests.includes(k);
            const label = t(`profile.interest.${k}` as StringKey);
            return (
              <Pressable
                key={k}
                onPress={() => edit(setInterests)(toggle(interests, k))}
                disabled={!canEdit}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: on, disabled: !canEdit }}
                style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: space.md, borderRadius: 18, borderWidth: 1, borderColor: colors.brownBorder, backgroundColor: on ? colors.brownTint : colors.card, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                <Txt variant="meta" color="brownDark" style={{ fontFamily: fonts.bodyMedium }}>
                  {label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </Section>

      {error ? <Banner tone="error" message={error} /> : null}
      {canEdit ? (
        <Button label={saved ? t('profile.savedButton', { center: community }) : t('profile.save')} onPress={save} busy={busy} tone={saved ? 'green' : 'primary'} />
      ) : (
        <Banner tone="info" message={t('profile.viewOnly')} />
      )}
    </VStack>
  );
}
