import { useState } from 'react';

import { Loaded } from '@/components/states';
import { Banner, Button, Chip, ChipGroup, Radio, Txt, VStack } from '@/components/ui';
import { CONTACT_CHANNELS, loadContactPrefs, saveContactPrefs, type ContactChannel, type ContactPrefs } from '@/lib/api/family';
import type { FamilyMember, Member } from '@/lib/api/member';
import { check, report } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { LANGUAGES, type Language, isLanguage } from '@/i18n';
import { useSettings } from '@/providers/settings';
import { colors, space } from '@/theme';

export type ContactSummary = { channels: ContactChannel[]; physicalMail: boolean | null };

const CHANNEL_KEYS = { sms: 'prefs.sms', whatsapp: 'prefs.whatsapp', email: 'prefs.email' } as const;

/**
 * "How should we reach you?" — channels, language, topics and the required
 * documents-and-mail choice. Used by onboarding step 5 and Settings › Preferences.
 */
export function ContactPrefsForm({
  member,
  target,
  centerId,
  mode,
  onSaved,
}: {
  member: Member;
  /** The family member being edited (defaults to the signed-in person). */
  target?: FamilyMember;
  centerId: string;
  mode: 'onboarding' | 'settings';
  onSaved: (summary: ContactSummary) => void;
}) {
  const person = target?.person ?? member.person;
  const state = useLoad(() => loadContactPrefs(centerId, person.id, member.household?.id ?? null), [centerId, person.id, member.household?.id], 'load contact preferences');
  return <Loaded state={state}>{(data) => <Editor initial={data} member={member} target={target} centerId={centerId} mode={mode} onSaved={onSaved} />}</Loaded>;
}

function Editor({ initial, member, target, centerId, mode, onSaved }: { initial: ContactPrefs; member: Member; target?: FamilyMember; centerId: string; mode: 'onboarding' | 'settings'; onSaved: (summary: ContactSummary) => void }) {
  const { t, setLanguage } = useSettings();
  const person = target?.person ?? member.person;
  const isSelf = person.id === member.person.id;
  const personIsAdult = target ? target.isAdult : member.isAdult;
  const [channels, setChannels] = useState<ContactChannel[]>(initial.channels.length || mode === 'settings' ? initial.channels : ['sms', 'whatsapp', 'email']);
  const [topics, setTopics] = useState<string[]>(initial.selectedTopics);
  const [paper, setPaper] = useState<boolean | null>(mode === 'settings' ? (initial.physicalMail ?? initial.householdPhysicalMail) : initial.physicalMail);
  const [lang, setLang] = useState<Language>(isLanguage(person.language) ? person.language : 'en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Documents & mail is a household choice made by an adult; children's messages go to parents.
  const needsPaper = isSelf && member.isAdult && !!member.household;
  const blocked = needsPaper && paper === null;
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

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
        isAdult: personIsAdult,
        topics: initial.topics,
        selectedTopics: topics,
        channels: personIsAdult ? channels : [],
        physicalMail: needsPaper ? paper : null,
        phone: person.phone_e164,
        email: person.email,
      });
      if (lang !== person.language) {
        check(await supabase.from('people').update({ language: lang }).eq('id', person.id), 'save the app language');
        if (isSelf) check(await supabase.from('accounts').update({ language: lang }).eq('user_id', member.userId), 'save your app language');
      }
      if (isSelf) setLanguage(lang);
      onSaved({ channels, physicalMail: needsPaper ? paper : null });
    } catch (err) {
      setError(report(err, 'save your preferences').userMessage);
    } finally {
      setBusy(false);
    }
  };

  const missingPhone = !person.phone_e164;
  const missingEmail = !person.email;

  return (
    <VStack gap={space.lg}>
      {!personIsAdult ? (
        <Txt variant="small" color="muted">
          {t('profile.childMessages', { name: person.preferred_name || person.first_name })}
        </Txt>
      ) : null}
      {personIsAdult ? (
      <VStack gap={space.sm}>
        <Txt variant="section">{t('prefs.contactBy')}</Txt>
        <ChipGroup>
          {CONTACT_CHANNELS.map((c) => (
            <Chip key={c} label={t(CHANNEL_KEYS[c])} selected={channels.includes(c)} onPress={() => setChannels(toggle(channels, c))} />
          ))}
        </ChipGroup>
        {(missingPhone && (channels.includes('sms') || channels.includes('whatsapp'))) || (missingEmail && channels.includes('email')) ? (
          <Txt variant="meta" color="brown">
            {t('prefs.needAddress')}
          </Txt>
        ) : null}
      </VStack>
      ) : null}

      <VStack gap={space.sm}>
        <Txt variant="section">{t('prefs.language')}</Txt>
        <ChipGroup>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.label} selected={lang === l.code} onPress={() => setLang(l.code)} />
          ))}
        </ChipGroup>
      </VStack>

      {initial.topics.length > 0 ? (
        <VStack gap={space.sm}>
          <Txt variant="section">{t('prefs.topics')}</Txt>
          <ChipGroup>
            {initial.topics
              .filter((topic) => personIsAdult || !topic.marketing)
              .map((topic) => (
                <Chip key={topic.key} label={topic.name} selected={topics.includes(topic.key)} onPress={() => setTopics(toggle(topics, topic.key))} />
              ))}
          </ChipGroup>
        </VStack>
      ) : null}

      {needsPaper ? (
        <VStack gap={space.sm} style={blocked && mode === 'onboarding' ? { borderWidth: 1.5, borderColor: colors.saffron, borderRadius: 18, padding: space.md } : undefined}>
          <Txt variant="section">{t('prefs.documents')}</Txt>
          <Txt variant="meta" color="muted">
            {t('prefs.documentsRequired')}
          </Txt>
          <Radio label={t('prefs.digitalOnly')} sub={t('prefs.digitalOnlySub')} selected={paper === false} onPress={() => setPaper(false)} />
          <Radio label={t('prefs.physicalMail')} sub={t('prefs.physicalMailSub')} selected={paper === true} onPress={() => setPaper(true)} />
        </VStack>
      ) : null}

      <Txt variant="meta" color="muted">
        {t('prefs.privacyNote')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button
        label={blocked ? t('prefs.chooseDocuments') : mode === 'onboarding' ? t('prefs.finish') : t('common.save')}
        onPress={submit}
        busy={busy}
        disabled={blocked}
      />
    </VStack>
  );
}
