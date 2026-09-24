import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { FullScreen, FullScreenLoading } from '@/components/full-screen';
import { Banner, Button, Card, LinkText, Txt } from '@/components/ui';
import { communityByJoinCode } from '@/lib/api/community';
import { parseJoinInput } from '@/lib/community';
import { report, type AppError } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

/**
 * A join link opened while the app is already set up
 * (communityconnect://join/<code> or https://…/join/<code>): confirm, then
 * switch to that community. First-run links are handled by "Find your community".
 */
export default function JoinLinkScreen() {
  const t = useT();
  const router = useRouter();
  const app = useApp();
  const params = useLocalSearchParams<{ code: string }>();
  const code = parseJoinInput(`/join/${params.code ?? ''}`);
  const found = useLoad(() => (code ? communityByJoinCode(code) : Promise.resolve(null)), [code], 'check the join code');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  // The screen this member starts on: the app, family matching, or the welcome screen.
  const start = (app.session && !app.member) || app.onboarding ? '/family-match' : app.session || app.guest ? '/' : '/welcome';
  const home = () => router.replace(start);

  if (code && found.loading) return <FullScreenLoading label={t('community.linkChecking')} />;
  const c = found.data ?? null;
  const here = !!c && c.slug === app.center?.slug;
  // Already in that community (for example the link was used to choose it on first run): just open it.
  if (here) return <Redirect href={start} />;

  return (
    <FullScreen>
      <Txt variant="title" color="navy" accessibilityRole="header">
        {t('community.linkTitle')}
      </Txt>
      {!code ? <Banner tone="error" message={t('community.linkInvalid')} /> : null}
      {found.error ? <Banner tone="error" message={found.error.userMessage} action={{ label: t('common.retry'), onPress: () => void found.reload() }} /> : null}
      {code && !found.error && !c ? <Banner tone="error" message={t('community.codeNotFound')} /> : null}
      {error ? <Banner tone="error" message={error.userMessage} /> : null}
      {c ? (
        <Card>
          <Txt variant="cardTitle">{c.name}</Txt>
          {c.sandbox ? <Banner tone="warning" title={t('community.sandboxTag')} message={t('community.sandboxNote')} /> : null}
          <Button
              label={opening ? t('community.opening') : t('community.open', { name: c.name })}
              busy={opening}
              disabled={opening}
              onPress={() => {
                setOpening(true);
                setError(null);
                // The app reloads for the new community and comes back here, where the redirect above opens it.
                app.chooseCommunity({ slug: c.slug, name: c.name }).catch((err: unknown) => {
                  setError(report(err, `open ${c.name}`));
                  setOpening(false);
                });
              }}
            />
        </Card>
      ) : null}
      <LinkText label={t('community.goHome')} onPress={home} />
    </FullScreen>
  );
}
