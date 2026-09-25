import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Loaded } from '@/components/states';
import { Banner, Button, Chip, ChipGroup, Txt, VStack } from '@/components/ui';
import { INTERESTS, normalizeInterests, toggle, type InterestKey } from '@/features/profile';
import { LANGUAGES, type Language, type StringKey, isLanguage } from '@/i18n';
import { BEST_CALL_TIMES, CONTACT_CHANNELS, loadContactPrefs, saveContactPrefs, saveDocumentsChoice, type BestCallTime, type ContactChannel, type ContactPrefs } from '@/lib/api/family';
import type { Member } from '@/lib/api/member';
import { check, report } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

export type ContactSummary = { channels: ContactChannel[]; physicalMail: boolean | null };

function Label({ children }: { children: string }) {
  return (
    <Txt variant="meta" color="muted">
      {children}
    </Txt>
  );
}

function Block({ children }: { children: ReactNode }) {
  return <VStack gap={space.sm}>{children}</VStack>;
}

/** Onboarding radio card: 2px border, navy when chosen, dot at the top. */
function PaperOption({ title, sub, selected, onPress }: { title: string; sub: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${title}. ${sub}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        borderWidth: 2,
        borderColor: selected ? colors.navy : colors.borderInput,
        backgroundColor: selected ? colors.navyTint : colors.card,
        borderRadius: radii.card,
        paddingVertical: 10,
        paddingHorizontal: space.md,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.navy, backgroundColor: selected ? colors.navy : colors.card, marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Txt variant="smallStrong" style={{ fontFamily: fonts.bodyBold }}>
          {title}
        </Txt>
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {sub}
        </Txt>
      </View>
    </Pressable>
  );
}

/**
 * Documents and mail — a household choice made by an adult (households.physical_mail_opt_in
 * plus a consent record). `required` = the onboarding saffron outline until chosen.
 */
export function DocumentsChoice({ value, onChange, required }: { value: boolean | null; onChange: (physicalMail: boolean) => void; required?: boolean }) {
  const { t } = useSettings();
  const { center } = useApp();
  return (
    <View style={{ gap: space.sm, backgroundColor: colors.card, borderWidth: 2, borderColor: required && value === null ? colors.saffron : colors.borderInput, borderRadius: radii.xl, padding: 14 }}>
      <Txt variant="section" style={{ fontFamily: fonts.bodyBold }}>
        {t('prefs.documents')}
      </Txt>
      <Txt variant="meta" color="muted">
        {t('prefs.documentsRequired')}
      </Txt>
      <PaperOption title={t('prefs.digitalOnly')} sub={t('prefs.digitalOnlySub', { center: center?.short_name || center?.name || '' })} selected={value === false} onPress={() => onChange(false)} />
      <PaperOption title={t('prefs.physicalMail')} sub={t('prefs.physicalMailSub')} selected={value === true} onPress={() => onChange(true)} />
    </View>
  );
}

/**
 * Onboarding step 5 "How should we reach you?" (Onboarding.dc.html s5):
 * channels (2×2 incl. Phone call), best time to call, app language,
 * "Interested in" (people.interests), and the required documents-and-mail choice.
 */
export function ContactPrefsForm({ member, centerId, onSaved }: { member: Member; centerId: string; onSaved: (summary: ContactSummary) => void }) {
  const state = useLoad(() => loadContactPrefs(centerId, member.person.id, member.household?.id ?? null), [centerId, member.person.id, member.household?.id], 'load contact preferences');
  return <Loaded state={state}>{(data) => <Editor initial={data} member={member} centerId={centerId} onSaved={onSaved} />}</Loaded>;
}

function Editor({ initial, member, centerId, onSaved }: { initial: ContactPrefs; member: Member; centerId: string; onSaved: (summary: ContactSummary) => void }) {
  const { t, setLanguage } = useSettings();
  const { center } = useApp();
  const person = member.person;
  const community = center?.short_name || center?.name || '';
  const [channels, setChannels] = useState<ContactChannel[]>(initial.channelsChosen ? initial.channels : ['phone_call', 'sms', 'whatsapp', 'email']);
  const [callTime, setCallTime] = useState<BestCallTime | null>(BEST_CALL_TIMES.find((x) => x === person.best_call_time) ?? 'evening');
  const [interests, setInterests] = useState<InterestKey[]>(normalizeInterests(person.interests));
  const [paper, setPaper] = useState<boolean | null>(initial.physicalMail);
  const [lang, setLang] = useState<Language>(isLanguage(person.language) ? person.language : 'en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPaper = member.isAdult && !!member.household;
  const blocked = needsPaper && paper === null;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    setError(null);
    try {
      await saveContactPrefs({
        centerId,
        userId: member.userId,
        personId: person.id,
        householdId: member.household?.id ?? null,
        isAdult: member.isAdult,
        topics: initial.topics,
        selectedTopics: initial.selectedTopics,
        channels: member.isAdult ? channels : [],
        bestCallTime: callTime,
        interests,
        physicalMail: needsPaper ? paper : null,
        phone: person.phone_e164,
        email: person.email,
      });
      if (lang !== person.language) {
        check(await supabase.from('people').update({ language: lang }).eq('id', person.id), 'save the app language');
        check(await supabase.from('accounts').update({ language: lang }).eq('user_id', member.userId), 'save your app language');
      }
      setLanguage(lang);
      onSaved({ channels, physicalMail: needsPaper ? paper : null });
    } catch (err) {
      setError(report(err, 'save your preferences').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack gap={space.lg}>
      {member.isAdult ? (
        <>
          <Block>
            <Label>{t('prefs.contactBy')}</Label>
            <ChipGroup columns={2}>
              {CONTACT_CHANNELS.map((c) => (
                <Chip key={c} grid label={t(`profile.channel.${c}` as StringKey)} selected={channels.includes(c)} onPress={() => setChannels(toggle(channels, c))} />
              ))}
            </ChipGroup>
            {(!person.phone_e164 && channels.some((c) => c !== 'email')) || (!person.email && channels.includes('email')) ? (
              <Txt variant="meta" color="brown">
                {t('prefs.needAddress')}
              </Txt>
            ) : null}
          </Block>
          <Block>
            <Label>{t('profile.bestTime')}</Label>
            <ChipGroup columns={3}>
              {BEST_CALL_TIMES.map((x) => (
                <Chip key={x} grid label={t(`profile.time.${x}` as StringKey)} selected={callTime === x} onPress={() => setCallTime(callTime === x ? null : x)} />
              ))}
            </ChipGroup>
          </Block>
        </>
      ) : null}

      <Block>
        <Label>{t('prefs.language')}</Label>
        <ChipGroup columns={3}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} grid label={l.label} selected={lang === l.code} onPress={() => setLang(l.code)} />
          ))}
        </ChipGroup>
      </Block>

      <Block>
        <Label>{t('prefs.topics')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {INTERESTS.map((k) => {
            const on = interests.includes(k);
            const label = t(`profile.interest.${k}` as StringKey);
            return (
              <Pressable
                key={k}
                onPress={() => setInterests(toggle(interests, k))}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: on }}
                style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.brownBorder, backgroundColor: on ? colors.brownTint : colors.card, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                <Txt variant="meta" color="brownDark" style={{ fontFamily: fonts.bodyMedium }}>
                  {label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </Block>

      {needsPaper ? <DocumentsChoice value={paper} onChange={setPaper} required /> : null}

      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={blocked ? t('prefs.chooseDocuments') : t('prefs.finish')} onPress={submit} busy={busy} disabled={blocked} />
      <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
        {t('prefs.privacyNote', { center: community })}
      </Txt>
    </VStack>
  );
}

/** Family › Documents and mail: change the household's paper-or-digital choice later. */
export function DocumentsForm({ member, centerId, onSaved }: { member: Member; centerId: string; onSaved: () => void }) {
  const state = useLoad(() => loadContactPrefs(centerId, member.person.id, member.household?.id ?? null), [centerId, member.person.id, member.household?.id], 'load your documents and mail choice');
  return <Loaded state={state}>{(data) => <DocumentsEditor initial={data.physicalMail ?? data.householdPhysicalMail} member={member} centerId={centerId} onSaved={onSaved} />}</Loaded>;
}

function DocumentsEditor({ initial, member, centerId, onSaved }: { initial: boolean | null; member: Member; centerId: string; onSaved: () => void }) {
  const { t } = useSettings();
  const [paper, setPaper] = useState<boolean | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const household = member.household;
  if (!household || !member.isAdult) return <Banner tone="info" message={t('prefs.adultsOnly')} />;
  const save = async () => {
    if (paper === null) return;
    setBusy(true);
    setError(null);
    try {
      await saveDocumentsChoice({ centerId, userId: member.userId, personId: member.person.id, householdId: household.id, physicalMail: paper });
      onSaved();
    } catch (err) {
      setError(report(err, 'save your documents and mail choice').userMessage);
    } finally {
      setBusy(false);
    }
  };
  return (
    <VStack gap={space.lg}>
      <DocumentsChoice value={paper} onChange={setPaper} />
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={t('common.save')} onPress={save} busy={busy} disabled={paper === null || paper === initial} />
    </VStack>
  );
}
