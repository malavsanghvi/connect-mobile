import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { FullScreen } from '@/components/full-screen';
import { QrScanner } from '@/components/qr-scanner';
import { Banner, Button, Card, LinkText, ListRow, Pill, SectionTitle, TextField, Txt } from '@/components/ui';
import { communityByJoinCode, findCommunity, type CommunityResult } from '@/lib/api/community';
import { formatJoinCode, parseJoinInput } from '@/lib/community';
import { env } from '@/lib/env';
import { report, type AppError } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

/**
 * "Find your community" (connect-crm docs/ONBOARDING_PLAN.md §7): shown on a
 * new install before the welcome screen, and from Settings › Switch community.
 * Search lists live communities only; a sandbox opens only with its join code
 * (typed, scanned from a poster's QR code, or from a
 * communityconnect://join/<code> link).
 */
export function FindCommunityScreen() {
  const t = useT();
  const app = useApp();
  const switching = app.choosingCommunity && !!app.center;
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeResult, setCodeResult] = useState<CommunityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<AppError | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const results = useLoad(() => (debounced.length >= 2 ? findCommunity(debounced) : Promise.resolve([])), [debounced], 'search for communities');
  // The build's own community (JSH for the JSH build), offered as one tap.
  const suggested = useLoad(
    async () => (await findCommunity(env.centerSlug)).find((c) => c.slug === env.centerSlug) ?? null,
    [env.centerSlug],
    'load the suggested community',
  );

  const lookUp = async (raw: string) => {
    setCodeError(null);
    setCodeResult(null);
    const parsed = parseJoinInput(raw);
    if (!parsed) {
      setCodeError(t('community.codeInvalid'));
      return;
    }
    setChecking(true);
    try {
      const found = await communityByJoinCode(parsed);
      if (found) setCodeResult(found);
      else setCodeError(t('community.codeNotFound'));
    } catch (err) {
      setCodeError(report(err, 'check the join code').userMessage);
    } finally {
      setChecking(false);
    }
  };

  // Opened from a join link or a poster QR code (communityconnect://join/<code>, https …/join/<code>).
  useEffect(() => {
    let active = true;
    Linking.getInitialURL()
      .then((url) => {
        const parsed = parseJoinInput(url);
        if (!active || !parsed || !url || !/\/join\//i.test(url)) return;
        setCode(formatJoinCode(parsed));
        void lookUp(parsed);
      })
      .catch((err: unknown) => report(err, 'read the link that opened the app'));
    return () => {
      active = false;
    };
    // Only the link the app was opened with; lookUp is stable enough for this one-off read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = async (c: CommunityResult) => {
    setOpenError(null);
    setOpening(c.slug);
    try {
      await app.chooseCommunity({ slug: c.slug, name: c.name });
    } catch (err) {
      setOpenError(report(err, `open ${c.name}`));
      setOpening(null);
    }
  };

  const row = (c: CommunityResult) => (
    <ListRow
      key={c.slug}
      title={c.name}
      subtitle={[c.place, c.shortName && c.shortName !== c.name ? c.shortName : null].filter(Boolean).join(' · ') || null}
      right={opening === c.slug ? <ActivityIndicator color={colors.navy} /> : c.sandbox ? <Pill label={t('community.sandboxTag')} tone="amber" /> : null}
      onPress={opening ? undefined : () => void open(c)}
      accessibilityHint={t('community.open', { name: c.name })}
    />
  );

  return (
    <FullScreen align="top">
      <View style={{ gap: space.sm, paddingTop: space.xl }}>
        <Txt variant="onboardingHero" accessibilityRole="header">
          {switching ? t('community.switchTitle') : t('community.title')}
        </Txt>
        <Txt variant="body" color="ink2">
          {switching ? t('community.switchSubtitle', { current: app.center?.name ?? '' }) : t('community.subtitle')}
        </Txt>
      </View>

      {openError ? <Banner tone="error" message={openError.userMessage} /> : null}

      {suggested.data && suggested.data.slug !== app.center?.slug ? (
        <Button
          label={opening === suggested.data.slug ? t('community.opening') : t('community.suggested', { name: suggested.data.name })}
          busy={opening === suggested.data.slug}
          disabled={!!opening}
          onPress={() => suggested.data && void open(suggested.data)}
        />
      ) : null}

      <View style={{ gap: space.sm }}>
        <TextField
          label={t('community.searchLabel')}
          placeholder={t('community.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          hint={query.trim().length > 0 && query.trim().length < 2 ? t('community.searchHint') : undefined}
          testID="community-search"
        />
        {debounced.length >= 2 ? (
          results.error ? (
            <Banner tone="error" message={results.error.userMessage} action={{ label: t('common.retry'), onPress: () => void results.reload() }} />
          ) : results.loading || debounced !== query.trim() ? (
            <Txt variant="small" color="muted">
              {t('community.searching')}
            </Txt>
          ) : (results.data ?? []).length === 0 ? (
            <Txt variant="small" color="muted">
              {t('community.noResults', { query: debounced })}
            </Txt>
          ) : (
            <Card padded={false} style={{ paddingHorizontal: space.cardX }}>
              {(results.data ?? []).map(row)}
            </Card>
          )
        ) : null}
      </View>

      <View style={{ gap: space.sm }}>
        <SectionTitle>{t('community.codeTitle')}</SectionTitle>
        <TextField
          label={t('community.codeLabel')}
          placeholder={t('community.codePlaceholder')}
          value={code}
          onChangeText={(v) => {
            setCode(v);
            setCodeError(null);
            setCodeResult(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={() => void lookUp(code)}
          error={codeError}
          hint={t('community.codeHint')}
          testID="community-code"
        />
        <Button label={checking ? t('community.checking') : t('community.checkCode')} busy={checking} disabled={checking || !code.trim()} tone="secondary" onPress={() => void lookUp(code)} />
        {codeResult ? (
          <Card tone={codeResult.sandbox ? 'panel' : 'default'}>
            <Txt variant="cardTitle">{codeResult.name}</Txt>
            {codeResult.place ? (
              <Txt variant="meta" color="muted">
                {codeResult.place}
              </Txt>
            ) : null}
            {codeResult.sandbox ? <Banner tone="warning" title={t('community.sandboxTag')} message={t('community.sandboxNote')} /> : null}
            <Button
              label={opening === codeResult.slug ? t('community.opening') : t('community.open', { name: codeResult.name })}
              busy={opening === codeResult.slug}
              disabled={!!opening}
              onPress={() => codeResult && void open(codeResult)}
            />
          </Card>
        ) : null}
        <LinkText label={scanning ? t('community.scanHide') : t('community.scan')} onPress={() => setScanning((s) => !s)} />
        {scanning ? (
          <QrScanner
            paused={checking}
            onScan={(data) => {
              const parsed = parseJoinInput(data);
              if (!parsed || !/\/join\//i.test(data) && /^[a-z][a-z0-9+.-]*:/i.test(data)) {
                setCodeError(t('community.scanNotJoin'));
                return;
              }
              setScanning(false);
              setCode(formatJoinCode(parsed));
              void lookUp(parsed);
            }}
          />
        ) : null}
      </View>

      {switching ? (
        <View style={{ alignItems: 'center', paddingBottom: space.xl }}>
          <LinkText label={t('community.cancel', { current: app.center?.name ?? '' })} onPress={app.cancelSwitchCommunity} />
        </View>
      ) : null}
    </FullScreen>
  );
}
