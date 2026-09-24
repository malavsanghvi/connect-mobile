import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Device from 'expo-device';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Banner, Button, Card, Chip, ChipGroup, Divider, ListRow, Pill, Row, SectionTitle, Toggle, Txt } from '@/components/ui';
import { LANGUAGES, type Language } from '@/i18n';
import { biometricSupport, readBiometricOptIn, writeBiometricOptIn, type BiometricSupport } from '@/lib/biometrics';
import { createDataRequest, deactivateAccount, QUIET_HOURS_RANGE, reactivateAccount, requestDeletion, setDirectoryOptIn, updateAccount } from '@/lib/api/settings';
import { check, logError, report } from '@/lib/errors';
import { formatPhone, fullName } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useModule } from '@/providers/modules';
import { usePush } from '@/providers/push';
import { useSettings } from '@/providers/settings';
import type { TextSize } from '@/theme';
import { colors, fonts, space } from '@/theme';

const TEXT_SIZES: { value: TextSize; key: 'settings.textStandard' | 'settings.textLarge' | 'settings.textLargest' }[] = [
  { value: 'standard', key: 'settings.textStandard' },
  { value: 'large', key: 'settings.textLarge' },
  { value: 'largest', key: 'settings.textLargest' },
];

/** Settings (prototype §2.27): account, notifications, preferences, privacy, account status. */
export default function SettingsScreen() {
  const router = useRouter();
  const { t, language, setLanguage, textSize, setTextSize } = useSettings();
  const { member, center, refreshMember, signOut } = useApp();
  const { toast, confirm, payNotice } = useFeedback();
  const push = usePush();
  const givingOn = useModule('giving');
  // "Contact" and "Report a problem" send a message to a team inbox (comms module).
  const askOn = useModule('comms');
  const [bio, setBio] = useState<BiometricSupport | null>(null);
  const [bioOn, setBioOn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([biometricSupport(), readBiometricOptIn()]).then(([s, on]) => {
      if (!alive) return;
      setBio(s);
      setBioOn(on);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!member || !center) return null;
  const account = member.account;
  const deactivated = account?.status === 'deactivated';
  const community = center.short_name || center.name;
  const household = member.household;

  const run = async (key: string, action: string, fn: () => Promise<void>, success?: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (success) toast(success);
    } catch (err) {
      setError(report(err, action).userMessage);
    } finally {
      setBusy(null);
    }
  };

  const changeLanguage = (lang: Language) =>
    run('lang', 'save your app language', async () => {
      setLanguage(lang);
      await updateAccount(member.userId, { language: lang });
      check(await supabase.from('people').update({ language: lang }).eq('id', member.person.id), 'save your app language');
      await refreshMember();
    });

  const changeTextSize = (size: TextSize) =>
    run('text', 'save your text size', async () => {
      setTextSize(size);
      await updateAccount(member.userId, { large_text: size !== 'standard' });
    });

  const toggleBio = (on: boolean) =>
    run('bio', 'change biometric sign-in', async () => {
      await writeBiometricOptIn(on);
      setBioOn(on);
    });

  const accountAction = async (kind: 'deactivate' | 'delete' | 'signout') => {
    const copy = {
      deactivate: { title: t('settings.deactivateTitle'), body: t('settings.deactivateBody'), cta: t('settings.deactivate'), tone: 'brown' as const },
      delete: { title: t('settings.deleteTitle'), body: t('settings.deleteBody'), cta: t('settings.delete'), tone: 'danger' as const },
      signout: { title: t('settings.signOutTitle'), body: t('settings.signOutBody'), cta: t('settings.signOut'), tone: 'primary' as const },
    }[kind];
    const ok = await confirm({ title: copy.title, body: copy.body, confirmLabel: copy.cta, tone: copy.tone });
    if (!ok) return;
    await run(kind, kind === 'signout' ? 'sign out' : kind === 'delete' ? 'request deletion' : 'deactivate your account', async () => {
      if (kind === 'deactivate') {
        // Prototype: stay in the app with the deactivated notice and a Reactivate button.
        await deactivateAccount(center.id, member.person.id, member.userId);
        await refreshMember();
        return;
      }
      if (kind === 'delete') await requestDeletion(center.id, member.person.id, member.userId);
      await signOut();
    });
  };

  const pushSub =
    push.status.state === 'registered'
      ? t('settings.pushOn')
      : push.status.state === 'off'
        ? t('settings.pushOff')
        : push.status.state === 'checking'
          ? t('common.loading')
          : push.status.reason;

  return (
    <Screen title={t('settings.title')} niva={false}>
      <Card>
        <Row gap={space.md}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
            <Txt variant="subhead" color="white" style={{ fontFamily: fonts.bodyBold }}>
              {member.person.first_name.charAt(0).toUpperCase()}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="cardTitle">{fullName(member.person)}</Txt>
            <Txt variant="meta" color="muted">
              {[member.email, member.phone ? formatPhone(member.phone) : null].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          <Pill label={account?.status === 'active' || !account ? t('settings.active') : t(`account.${account.status}` as 'account.deactivated')} tone={account?.status === 'active' || !account ? 'green' : 'amber'} />
        </Row>
      </Card>
      {error ? <Banner tone="error" message={error} /> : null}

      <SectionTitle>{t('settings.account')}</SectionTitle>
      <Card>
        <ListRow title={t('settings.profileFamily')} subtitle={t('settings.profileFamilySub')} onPress={() => router.push('/family')} />
        <Divider />
        <ListRow title={t('settings.security')} subtitle={t('settings.securitySub')} onPress={() => router.push({ pathname: '/person/[id]', params: { id: member.person.id } })} />
        <Divider />
        {bio ? (
          bio.available ? (
            <Toggle label={t('settings.biometric', { method: bio.label })} sub={t('settings.biometricSub')} value={bioOn} onChange={toggleBio} disabled={busy === 'bio'} />
          ) : (
            <ListRow title={t('settings.biometric', { method: bio.label })} subtitle={bio.reason} />
          )
        ) : null}
        <Divider />
        <ListRow title={t('settings.devices')} subtitle={t('settings.devicesSub', { device: Device.modelName ?? t('settings.thisDevice') })} />
      </Card>

      <SectionTitle>{t('settings.notifications')}</SectionTitle>
      <Card>
        <Toggle
          label={t('settings.push')}
          sub={pushSub}
          value={push.status.state === 'registered'}
          disabled={push.status.state === 'checking' || push.status.state === 'unsupported' || busy === 'push'}
          onChange={(on) => run('push', on ? 'turn on notifications' : 'turn off notifications', () => push.setEnabled(on))}
        />
        <Divider />
        <Toggle
          label={t('settings.quiet')}
          sub={t('settings.quietSub')}
          value={!!account?.quiet_hours}
          disabled={busy === 'quiet'}
          onChange={(on) => run('quiet', 'save quiet hours', async () => {
            await updateAccount(member.userId, { quiet_hours: on ? QUIET_HOURS_RANGE : null });
            await refreshMember();
          })}
        />
        <Divider />
        <ListRow title={t('settings.topics')} subtitle={t('settings.topicsSub')} onPress={() => router.push('/family')} />
      </Card>

      <SectionTitle>{t('settings.preferences')}</SectionTitle>
      <Card>
        <Txt variant="smallStrong" color="ink2">
          {t('settings.language')}
        </Txt>
        <ChipGroup columns={3}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} grid label={l.label} selected={language === l.code} onPress={() => changeLanguage(l.code)} />
          ))}
        </ChipGroup>
        <Txt variant="meta" color="muted">
          {t('settings.languageNote')}
        </Txt>
        <Divider />
        <Txt variant="smallStrong" color="ink2">
          {t('settings.textSize')}
        </Txt>
        <ChipGroup columns={3}>
          {TEXT_SIZES.map((s) => (
            <Chip key={s.value} grid label={t(s.key)} selected={textSize === s.value} onPress={() => changeTextSize(s.value)} />
          ))}
        </ChipGroup>
        <Divider />
        <Txt variant="smallStrong" color="ink2">
          {t('settings.appearance')}
        </Txt>
        <ChipGroup columns={3}>
          <Chip grid label={t('settings.themeLight')} selected onPress={() => undefined} />
          <Chip grid label={t('settings.themeDark')} selected={false} disabled onPress={() => undefined} />
          <Chip grid label={t('settings.themeSystem')} selected={false} disabled onPress={() => undefined} />
        </ChipGroup>
        <Txt variant="meta" color="muted">
          {t('settings.themeNote')}
        </Txt>
      </Card>

      <SectionTitle>{t('settings.privacy')}</SectionTitle>
      <Card>
        {household && member.isAdult ? (
          <>
            <Toggle
              label={t('settings.directory')}
              sub={t('settings.directorySub')}
              value={household.directory_opt_in}
              disabled={busy === 'dir'}
              onChange={(on) =>
                run('dir', 'update your directory listing', async () => {
                  await setDirectoryOptIn({ centerId: center.id, householdId: household.id, personId: member.person.id, userId: member.userId, on });
                  await refreshMember();
                })
              }
            />
            <Divider />
          </>
        ) : null}
        <ListRow
          title={t('settings.download')}
          subtitle={t('settings.downloadSub')}
          onPress={() => run('export', 'request your data', () => createDataRequest(center.id, member.person.id, member.userId, 'export'), t('settings.downloadToast'))}
        />
        <Divider />
        <ListRow title={t('settings.privacyPolicy')} subtitle={t('settings.privacyPolicySub', { center: community })} onPress={() => router.push({ pathname: '/legal', params: { kind: 'privacy' } })} />
        <Divider />
        <ListRow title={t('settings.terms')} subtitle={t('settings.termsSub')} onPress={() => router.push({ pathname: '/legal', params: { kind: 'terms' } })} />
      </Card>

      {member.isAdult ? (
        <>
          <SectionTitle>{t('settings.payments')}</SectionTitle>
          <Card>
            <ListRow title={t('settings.savedMethods')} subtitle={t('settings.savedMethodsSub')} onPress={() => payNotice({ saved: false })} />
            {givingOn ? (
              <>
                <Divider />
                <ListRow title={t('settings.receipts')} subtitle={t('settings.receiptsSub', { email: member.person.email ?? member.email ?? '' })} onPress={() => router.push('/pledges')} />
              </>
            ) : null}
          </Card>
        </>
      ) : null}

      <SectionTitle>{t('settings.support')}</SectionTitle>
      <Card>
        <ListRow title={t('settings.help')} subtitle={t('settings.helpSub')} onPress={() => router.push('/guide')} />
        <Divider />
        {askOn ? (
          <>
            <ListRow title={t('settings.contact', { center: community })} subtitle={t('settings.contactSub')} onPress={() => router.push('/guide/ask')} />
            <Divider />
            <ListRow title={t('settings.report')} subtitle={t('settings.reportSub')} onPress={() => router.push({ pathname: '/guide/ask', params: { topic: 'office' } })} />
            <Divider />
          </>
        ) : null}
        <ListRow title={t('settings.about')} subtitle={t('settings.aboutSub', { version: Constants.expoConfig?.version ?? '1.0.0', build: String(Constants.nativeBuildVersion ?? Constants.expoConfig?.version ?? '1') })} />
      </Card>

      <SectionTitle>{t('settings.status')}</SectionTitle>
      <Card style={{ gap: 10 }}>
        {deactivated ? (
          <>
            <Txt variant="meta" color="brown" style={{ fontFamily: fonts.bodySemi }}>
              {t('settings.deactivatedBody')}
            </Txt>
            <Button label={t('settings.reactivateAccount')} tone="green" size="card" onPress={() => run('reactivate', 'reactivate your account', async () => {
              await reactivateAccount(center.id, member.person.id, member.userId);
              await refreshMember();
            }, t('settings.reactivated'))} busy={busy === 'reactivate'} />
          </>
        ) : (
          <>
            <Txt variant="meta" color="muted">
              {t('settings.statusBody', { center: community })}
            </Txt>
            <Button label={t('settings.deactivate')} tone="outlineBrown" size="card" onPress={() => accountAction('deactivate')} busy={busy === 'deactivate'} />
          </>
        )}
        <Pressable onPress={() => void accountAction('delete')} accessibilityRole="button" disabled={busy === 'delete'} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="smallStrong" color="danger">
            {t('settings.delete')}
          </Txt>
        </Pressable>
      </Card>
      <Button
        label={t('settings.signOut')}
        tone="secondary"
        onPress={() => {
          accountAction('signout').catch((err: unknown) => logError('signing out', err));
        }}
        busy={busy === 'signout'}
      />
    </Screen>
  );
}
