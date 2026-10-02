import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { FullScreenLoading } from '@/components/full-screen';
import { flyerLinkTarget } from '@/lib/flyer';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

/**
 * The QR code on an event flyer (https://<member web app>/e/<event id>). Outside the route guards,
 * like join/[code]: a signed-out visitor enters guest mode and lands on the event; a signed-in
 * account goes through the normal start screen (family matching, onboarding and the legal step are
 * never skipped) or, once linked, straight to the event.
 */
export default function EventLinkScreen() {
  const t = useT();
  const router = useRouter();
  const { session, member, onboarding, guest, setGuest } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const target = flyerLinkTarget({ signedIn: !!session, linked: !!member, onboarding, guest }, typeof id === 'string' ? id : null);
  // The event screen sits in the (app) group, which opens for a signed-out visitor only in guest mode.
  const waitingForGuest = target.guest && !guest;

  useEffect(() => {
    if (waitingForGuest) setGuest(true);
  }, [waitingForGuest, setGuest]);

  useEffect(() => {
    if (!waitingForGuest) router.replace(target.href);
  }, [waitingForGuest, target.href, router]);

  return <FullScreenLoading label={t('link.openingEvent')} />;
}
