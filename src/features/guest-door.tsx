import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { doorCheckFor, GUEST_DOORS, guestAreas, guestDoorStep, guestDoorsToShow, type GuestDoor } from '@/lib/access';
import { loadGyan } from '@/lib/api/gyan';
import { loadToday } from '@/lib/api/home';
import { darshanDoorVisible } from '@/lib/darshan';
import { logError } from '@/lib/errors';
import { pushSoon } from '@/lib/push-soon';
import { useLoad } from '@/lib/use-load';
import { useAccess } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useModules } from '@/providers/modules';

import { findPuja, NAVANG_GOAL_KEY } from './puja/puja-logic';

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
 * The doors the Welcome screen offers a visitor ("Without signing in"): the areas the organization's access levels
 * open to the public, that lead somewhere in this community. The same test as Home's doors, so a visitor is not
 * taken to "Live darshan is offline" or "The virtual puja isn't available yet": the darshan door needs a stream or
 * an aarti time (Today's load), the puja door needs the community's Navang puja lesson. Both are read without a
 * session. Empty until the answer and the checks are in; a check that fails keeps its door (the screen says what
 * went wrong, with Try again).
 */
export function useGuestDoors(): GuestDoor[] {
  const { center } = useApp();
  const { snapshot } = useAccess();
  const { map } = useModules();
  const open = guestAreas(snapshot, map);
  const wantDarshan = open.includes('darshan');
  const wantPuja = open.includes('puja');
  const darshan = useLoad(
    () => (wantDarshan && center ? loadToday(center).then((today) => darshanDoorVisible(true, !!today.darshan, today.timings?.aarti ?? null)) : Promise.resolve(false)),
    [wantDarshan, center?.id],
    'check for live darshan',
  );
  const puja = useLoad(
    () => (wantPuja && center ? loadGyan(center, [], { goalKey: NAVANG_GOAL_KEY }).then((d) => findPuja(d.goals) !== null) : Promise.resolve(false)),
    [wantPuja, center?.id],
    'check for the virtual puja',
  );
  return guestDoorsToShow(open, { darshan: doorCheckFor(wantDarshan, darshan), puja: doorCheckFor(wantPuja, puja) });
}

/**
 * Mounted with the (app) group, which a visitor reaches only in guest mode. Opens the chosen screen once, on
 * top of Home (so Back goes to Home). Anything left over when the group opens for a signed-in member is dropped.
 */
export function OpenGuestDoor() {
  const router = useRouter();
  const { guest } = useApp();
  // This mounts together with the (app) navigator. Until the root navigation state exists the router has no route
  // information, and a push in that same moment threw "Cannot read properties of null (reading 'pathname')" on
  // the web, which blanked the page (the Welcome door buttons went to a blank screen).
  const navReady = !!useRootNavigationState()?.key;

  useEffect(() => {
    const step = guestDoorStep({ pending, guest, navReady });
    if (step === 'idle' || step === 'wait') return;
    const route = pending;
    pending = null;
    if (step !== 'open' || !route) return;
    // A moment later, and again if it throws: the person stays on Home rather than on a blank page.
    pushSoon(
      () => router.push(route),
      (err) => logError('opening the screen you chose on the Welcome screen (you are on Home)', err),
    );
  }, [guest, navReady, router]);

  return null;
}
