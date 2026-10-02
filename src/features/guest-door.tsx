import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { GUEST_DOORS, type GuestDoor } from '@/lib/access';
import { useApp } from '@/providers/app';

/**
 * The screen a visitor chose on the Welcome screen ("Without signing in › Watch live darshan / Do puja"),
 * opened once the app is in guest mode. Kept in memory: the (app) screens only exist after guest mode is
 * on, so the Welcome screen cannot push them itself.
 */
let pending: string | null = null;

/** Call just before entering guest mode from the Welcome screen. */
export function openAfterGuest(door: GuestDoor): void {
  pending = GUEST_DOORS[door].route;
}

/**
 * Mounted with the (app) group, which a visitor reaches only in guest mode. Opens the chosen screen once, on
 * top of Home (so Back goes to Home). Anything left over when the group opens for a signed-in member is dropped.
 */
export function OpenGuestDoor() {
  const router = useRouter();
  const { guest } = useApp();

  useEffect(() => {
    const route = pending;
    if (!route) return;
    pending = null;
    if (guest) router.push(route);
  }, [guest, router]);

  return null;
}
