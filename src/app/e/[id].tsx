import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { FullScreen, FullScreenLoading } from '@/components/full-screen';
import { Banner, Button, Card, LinkText, Txt } from '@/components/ui';
import type { CommunityResult } from '@/lib/api/community';
import { eventLinkCommunity } from '@/lib/api/flyers';
import { report, type AppError } from '@/lib/errors';
import { flyerLinkCommunity, flyerLinkTarget, isUuid } from '@/lib/flyer';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

/**
 * The QR code on an event flyer (https://<member web app>/e/<event id>, optionally ?c=<community
 * web name>). Outside the route guards, like join/[code].
 *
 * The event opens in its own community: when that is not the one open here, a signed-out visitor
 * (guest mode keeps nothing) just switches to it, and a signed-in account is asked first, as with
 * a join link. The app reloads for the new community and comes back here.
 *
 * Then a signed-out visitor enters guest mode and lands on the event; a signed-in account goes
 * through the normal start screen (family matching, onboarding and the legal step are never
 * skipped) or, once linked, straight to the event.
 */
export default function EventLinkScreen() {
  const t = useT();
  const router = useRouter();
  const { session, member, onboarding, guest, setGuest, center, chooseCommunity } = useApp();
  const params = useLocalSearchParams<{ id: string; c?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : null;
  const eventId = isUuid(id) ? id.toLowerCase() : null;
  const named = flyerLinkCommunity(params.c);
  const hereId = center?.id ?? null;
  const hereSlug = center?.slug ?? null;
  const other = useLoad(
    () => (eventId && hereId && hereSlug ? eventLinkCommunity(eventId, named, { id: hereId, slug: hereSlug }) : Promise.resolve(null)),
    [eventId, named, hereId, hereSlug],
    "find the event's community",
  );
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<AppError | null>(null);
  const autoOpened = useRef<string | null>(null);

  const state = { signedIn: !!session, linked: !!member, onboarding, guest };
  const target = flyerLinkTarget(state, id);
  // The screen this account starts on (as for a join link), for "Go to the app".
  const start = flyerLinkTarget(state, null).href;
  const resolved = !other.loading && !other.error;
  const elsewhere = resolved ? (other.data ?? null) : null;
  const here = resolved && !elsewhere;
  // The event screen sits in the (app) group, which opens for a signed-out visitor only in guest mode.
  const waitingForGuest = here && target.guest && !guest;
  const href = here && !waitingForGuest ? target.href : null;
  const autoSlug = elsewhere && !session ? elsewhere.slug : null;
  const autoName = elsewhere && !session ? elsewhere.name : null;

  useEffect(() => {
    if (waitingForGuest) setGuest(true);
  }, [waitingForGuest, setGuest]);

  useEffect(() => {
    if (href) router.replace(href);
  }, [href, router]);

  useEffect(() => {
    if (!autoSlug || !autoName || autoOpened.current === autoSlug) return;
    autoOpened.current = autoSlug;
    chooseCommunity({ slug: autoSlug, name: autoName }).catch((err: unknown) => setOpenError(report(err, `open ${autoName}`)));
  }, [autoSlug, autoName, chooseCommunity]);

  const open = (c: CommunityResult) => {
    setOpening(true);
    setOpenError(null);
    // The app reloads for the new community and comes back here, where the event then opens.
    chooseCommunity({ slug: c.slug, name: c.name }).catch((err: unknown) => {
      setOpenError(report(err, `open ${c.name}`));
      setOpening(false);
    });
  };

  if (other.error) {
    return (
      <FullScreen>
        <Txt variant="title" color="navy" accessibilityRole="header">
          {t('link.eventTitle')}
        </Txt>
        <Banner tone="error" message={other.error.userMessage} action={{ label: t('common.retry'), onPress: () => void other.reload() }} />
        <LinkText label={t('community.goHome')} onPress={() => router.replace(start)} />
      </FullScreen>
    );
  }

  if (elsewhere && (session || openError)) {
    return (
      <FullScreen>
        <Txt variant="title" color="navy" accessibilityRole="header">
          {t('link.otherCommunityTitle')}
        </Txt>
        <Card>
          <Txt variant="cardTitle">{elsewhere.name}</Txt>
          <Txt variant="small" color="ink2">
            {t('link.otherCommunityBody', { name: elsewhere.name })}
          </Txt>
          {elsewhere.sandbox ? <Banner tone="warning" title={t('community.sandboxTag')} message={t('community.sandboxNote')} /> : null}
          {openError ? <Banner tone="error" message={openError.userMessage} /> : null}
          <Button label={opening ? t('community.opening') : t('community.open', { name: elsewhere.name })} busy={opening} disabled={opening} onPress={() => open(elsewhere)} />
        </Card>
        <LinkText label={t('community.goHome')} onPress={() => router.replace(start)} />
      </FullScreen>
    );
  }

  return <FullScreenLoading label={t('link.openingEvent')} />;
}
