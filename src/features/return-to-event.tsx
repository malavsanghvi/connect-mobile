import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { flyerLinkPath, isUuid } from '@/lib/flyer';
import { createHandoff } from '@/lib/handoff';
import { useApp } from '@/providers/app';

// Both hand-offs below are taken through createHandoff, never `const x = pending; pending = null;` inside the
// components: the React Compiler turned that into "pending = null; use(pending)", so the value was always null and
// using it threw (src/lib/handoff.ts).

/**
 * The event a guest was looking at when they pressed Sign in (for example a members-only event
 * opened from a flyer's QR link), reopened once they are in the app as a member. Kept in memory:
 * the sign-in code is typed into the app, so the page never reloads in between.
 */
const eventToReturnTo = createHandoff<{ eventId: string; centerId: string }>();

/** Call just before leaving guest mode for the sign-in screen. */
export function returnToEventAfterSignIn(eventId: string, centerId: string | null | undefined): void {
  eventToReturnTo.set(centerId && isUuid(eventId) ? { eventId: eventId.toLowerCase(), centerId } : null);
}

/**
 * Mounted with the (app) group, which opens for a linked member who has finished onboarding (and
 * the legal step covers it when due), or for a guest. The member lands back on the event, in the
 * same community only; a guest who went back to browsing drops it.
 */
export function ReturnToEvent() {
  const router = useRouter();
  const { session, center } = useApp();
  const signedIn = !!session;
  const centerId = center?.id ?? null;

  useEffect(() => {
    const p = eventToReturnTo.take();
    if (!p) return;
    if (signedIn && p.centerId === centerId) router.push(`/event/${p.eventId}`);
  }, [signedIn, centerId, router]);

  return null;
}

/**
 * A flyer's QR link (/e/<id>) switching to the event's own community. While the new community
 * loads, the loading screen replaces the root navigator, which then starts again on its first
 * screen (welcome, family matching or home) and forgets the link; so the link is kept here.
 */
const eventLinkToReopen = createHandoff<{ eventId: string; slug: string }>();

/** Call just before chooseCommunity on /e/<id>, and with null when the switch failed. */
export function reopenEventLinkAfterSwitch(link: { eventId: string; slug: string } | null): void {
  eventLinkToReopen.set(link && link.slug && isUuid(link.eventId) ? { eventId: link.eventId.toLowerCase(), slug: link.slug } : null);
}

/**
 * Mounted beside the root navigator, so it mounts again with it after a switch. Once the community
 * the link switched to is open, it opens /e/<id> again (naming that community), which sends the
 * visitor on from there. Used once; dropped when another community opened instead.
 */
export function ReopenEventLink() {
  const router = useRouter();
  const slug = useApp().center?.slug ?? null;

  useEffect(() => {
    const link = eventLinkToReopen.take();
    if (!link) return;
    if (slug && link.slug === slug) router.replace(flyerLinkPath(link.eventId, slug));
  }, [slug, router]);

  return null;
}
