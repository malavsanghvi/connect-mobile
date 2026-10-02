import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { isUuid } from '@/lib/flyer';
import { useApp } from '@/providers/app';

/**
 * The event a guest was looking at when they pressed Sign in (for example a members-only event
 * opened from a flyer's QR link), reopened once they are in the app as a member. Kept in memory:
 * the sign-in code is typed into the app, so the page never reloads in between.
 */
let pending: { eventId: string; centerId: string } | null = null;

/** Call just before leaving guest mode for the sign-in screen. */
export function returnToEventAfterSignIn(eventId: string, centerId: string | null | undefined): void {
  pending = centerId && isUuid(eventId) ? { eventId: eventId.toLowerCase(), centerId } : null;
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
    const p = pending;
    if (!p) return;
    pending = null;
    if (signedIn && p.centerId === centerId) router.push(`/event/${p.eventId}`);
  }, [signedIn, centerId, router]);

  return null;
}
