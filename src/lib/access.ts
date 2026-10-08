/**
 * Access levels: which areas of the app a person may use (connect-crm 0586,
 * docs/ACCESS_LEVELS.md).
 *
 * Every organization has an ordered ladder of levels (public, community, then
 * its own membership levels such as Member and Life member) and sets the
 * minimum level for each area. The database works out the person's level and
 * answers `app.feature_access_for_me(p_center)`; this file reads that answer
 * and decides what the app shows. It is pure (no React, no Supabase), so every
 * rule is unit-tested. The loader is `src/lib/api/access.ts`; the provider and
 * `useFeature()` are `src/providers/access.tsx`.
 *
 * The app decides what to SHOW. What the database enforces itself is the
 * portal's to say (today only the live darshan stream, by RLS); for the other
 * areas the app is the only guard until connect-crm BACKLOG B45.
 */
import type { StringKey, Translate } from '../i18n';

import type { AppError } from './errors';
import { isModuleOn, type ModuleKey, type ModuleMap } from './modules';

// ---------------------------------------------------------------------------
// The areas
// ---------------------------------------------------------------------------

/** The catalog of areas (connect-crm `app.access_features`, v1). A key the database adds later is ignored until this build knows it. */
export const FEATURE_KEYS = ['darshan', 'puja', 'timings', 'guide', 'listen', 'look', 'learn', 'niva'] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export function isFeatureKey(v: unknown): v is FeatureKey {
  return typeof v === 'string' && (FEATURE_KEYS as readonly string[]).includes(v);
}

/**
 * The module each area belongs to (the portal's `module_key`). An area whose module is switched off is
 * not available to anyone, whatever its level (the database says so too; this keeps the app consistent
 * while the two answers are loading, and when the portal is older than this build).
 */
export const FEATURE_MODULE: Record<FeatureKey, ModuleKey | null> = {
  darshan: 'content',
  puja: 'gyan_path',
  timings: null,
  guide: null,
  listen: 'content',
  look: 'content',
  learn: 'gyan_path',
  niva: 'niva',
};

/** The name of each area in the member's language ("Sign in to use Ask Niva"). */
export const AREA_LABEL: Record<FeatureKey, StringKey> = {
  darshan: 'access.area.darshan',
  puja: 'access.area.puja',
  timings: 'access.area.timings',
  guide: 'access.area.guide',
  listen: 'access.area.listen',
  look: 'access.area.look',
  learn: 'access.area.learn',
  niva: 'access.area.niva',
};

/**
 * Areas anyone could use before access levels existed. They stay open while the answer is still
 * loading or the portal has not got it yet (an area is never hidden because of our own error).
 */
export const OPEN_BEFORE_LEVELS: readonly FeatureKey[] = ['guide', 'timings'];

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/** Why an area is not available: the visitor is not signed in, the member's level is too low, or the area's module is off. */
export type AccessReason = 'sign_in' | 'level' | 'module_off';

/** A rung of the ladder, as the database names it for this organization. */
export type LevelRef = { key: string; label: string; rank: number };

export type FeatureDecision = {
  allowed: boolean;
  /** Why not (null when allowed, or when it is not known). */
  reason: AccessReason | null;
  /** The lowest level that may use the area (null when the answer did not say). */
  minLevel: LevelRef | null;
};

export type AccessSnapshot = {
  /** `database`: answered by `app.feature_access_for_me`. `fallback`: the portal does not have it yet, so the rules from before apply. */
  source: 'database' | 'fallback';
  signedIn: boolean;
  /** The person's own level (public for a visitor, community for a member of this community, then their membership levels). */
  level: LevelRef;
  features: Partial<Record<FeatureKey, FeatureDecision>>;
};

const PUBLIC_LEVEL: LevelRef = { key: 'public', label: 'Public', rank: 0 };
const COMMUNITY_LEVEL: LevelRef = { key: 'community', label: 'Community member', rank: 10 };

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function readLevel(v: unknown): LevelRef | null {
  if (!isObject(v)) return null;
  const { key, label, rank } = v;
  if (typeof key !== 'string' || !key.trim() || typeof rank !== 'number' || !Number.isFinite(rank)) return null;
  return { key, label: typeof label === 'string' && label.trim() ? label.trim() : key, rank };
}

function readReason(v: unknown): AccessReason | null {
  return v === 'sign_in' || v === 'level' || v === 'module_off' ? v : null;
}

/**
 * Read the `app.feature_access_for_me` answer:
 * `{ level: {key,label,rank}, signed_in, features: { <area>: { allowed, reason, min_level } } }`.
 * Null when it is not an answer at all (no `features`). Areas this build does not know are left out, an
 * area whose entry is unusable is left out too (it is then decided as before, see `decideFeature`), and a
 * "no" without a reason gets the one that fits the reader.
 */
export function parseAccess(raw: unknown): AccessSnapshot | null {
  if (!isObject(raw) || !isObject(raw.features)) return null;
  const level = readLevel(raw.level);
  const signedIn = typeof raw.signed_in === 'boolean' ? raw.signed_in : level ? level.rank > PUBLIC_LEVEL.rank : false;
  const features: AccessSnapshot['features'] = {};
  for (const [key, value] of Object.entries(raw.features)) {
    if (!isFeatureKey(key) || !isObject(value) || typeof value.allowed !== 'boolean') continue;
    features[key] = {
      allowed: value.allowed,
      reason: value.allowed ? null : (readReason(value.reason) ?? (signedIn ? 'level' : 'sign_in')),
      minLevel: readLevel(value.min_level),
    };
  }
  return { source: 'database', signedIn, level: level ?? (signedIn ? COMMUNITY_LEVEL : PUBLIC_LEVEL), features };
}

/**
 * The rules from before access levels, for a portal that does not have `app.feature_access_for_me` yet
 * (so a new app can ship before the database change): a signed-in member may use everything, a visitor
 * only the guide and the timings.
 */
export function fallbackSnapshot(signedIn: boolean): AccessSnapshot {
  return { source: 'fallback', signedIn, level: signedIn ? COMMUNITY_LEVEL : PUBLIC_LEVEL, features: {} };
}

/** The rule from before access levels, for an area the answer does not mention. */
function ruleBeforeLevels(key: FeatureKey, signedIn: boolean): FeatureDecision {
  if (signedIn || OPEN_BEFORE_LEVELS.includes(key)) return { allowed: true, reason: null, minLevel: null };
  return { allowed: false, reason: 'sign_in', minLevel: COMMUNITY_LEVEL };
}

/**
 * Can this person use the area? Not when its module is switched off. Otherwise the database's answer
 * decides; an area it does not mention is decided as before access levels. With no answer yet (loading, or
 * it failed) only the areas that were always open are available, so the guide never waits for this check.
 */
export function decideFeature(snapshot: AccessSnapshot | null, key: FeatureKey, modules: ModuleMap): FeatureDecision {
  const moduleKey = FEATURE_MODULE[key];
  if (moduleKey && !isModuleOn(modules, moduleKey)) return { allowed: false, reason: 'module_off', minLevel: null };
  if (!snapshot) return { allowed: OPEN_BEFORE_LEVELS.includes(key), reason: null, minLevel: null };
  return snapshot.features[key] ?? ruleBeforeLevels(key, snapshot.signedIn);
}

// ---------------------------------------------------------------------------
// What to tell the person
// ---------------------------------------------------------------------------

export type FeatureMessage = {
  title: string;
  /** A second line (what to do next), or null. */
  body: string | null;
  /** Offer the Sign in button. */
  signIn: boolean;
};

/**
 * The notice for an area that is not available: "Sign in to use X" for a visitor, "X is available to
 * {level} and above. Ask the office about membership." for a member whose level is too low, "X isn't
 * offered by {community} right now" for a module that is off.
 */
export function featureMessage(t: Translate, key: FeatureKey, reason: AccessReason | null, minLevelLabel: string | null, community = ''): FeatureMessage {
  const area = t(AREA_LABEL[key]);
  switch (reason) {
    case 'sign_in':
      return { title: t('access.signInTo', { area }), body: null, signIn: true };
    case 'level':
      return { title: t('access.levelNeeded', { area, level: minLevelLabel ?? t('access.levelFallback') }), body: t('access.askOffice'), signIn: false };
    case 'module_off':
      return { title: t('modules.offTitle', { label: area, center: community }), body: t('modules.offBody'), signIn: false };
    default:
      return { title: t('access.unavailable', { area }), body: null, signIn: false };
  }
}

// ---------------------------------------------------------------------------
// Welcome: what a visitor can open without signing in
// ---------------------------------------------------------------------------

/**
 * The areas with a screen of their own that the Welcome screen can send a visitor straight to
 * ("Without signing in"), with the route to open and the button's words (the same ones Home uses).
 */
export const GUEST_DOORS = {
  darshan: { route: '/darshan', label: 'home.watchDarshan' },
  puja: { route: '/puja', label: 'puja.entry' },
} as const satisfies Partial<Record<FeatureKey, { route: string; label: StringKey }>>;

export type GuestDoor = keyof typeof GUEST_DOORS;

const GUEST_DOOR_KEYS = Object.keys(GUEST_DOORS) as GuestDoor[];

/**
 * The doors a visitor may use: the area is open to the public (not only to a level they could reach by
 * signing in) and its module is on. Empty until the answer is in. Whether the community has anything
 * behind a door is a separate check: see `guestDoorsToShow`.
 */
export function guestAreas(snapshot: AccessSnapshot | null, modules: ModuleMap): GuestDoor[] {
  if (!snapshot) return [];
  return GUEST_DOOR_KEYS.filter((key) => {
    const d = decideFeature(snapshot, key, modules);
    if (!d.allowed) return false;
    // A signed-in reader's yes may come from their level; a visitor's needs the area to be open to everyone.
    return !snapshot.signedIn || d.minLevel?.rank === PUBLIC_LEVEL.rank;
  });
}

/**
 * What the Welcome screen found out about one door (`useGuestDoors` in src/features/guest-door.tsx): the community has
 * something behind it (`leads`), has nothing (`nothing`: no stream and no aarti time, no Navang puja lesson), the check
 * could not be made (`failed`), or is still being made (`checking`).
 */
export type DoorCheck = 'leads' | 'nothing' | 'failed' | 'checking';

/**
 * The check for one door, from the load that answers it (`data`: the community has something behind the door).
 * A door the visitor may not use anyway (`wanted` is false) has nothing to check.
 */
export function doorCheckFor(wanted: boolean, load: { loading: boolean; error: unknown; data: boolean | undefined }): DoorCheck {
  if (!wanted) return 'nothing';
  if (load.loading) return 'checking';
  if (load.error) return 'failed';
  return load.data === true ? 'leads' : 'nothing';
}

/**
 * The doors worth showing a visitor: open to the public (`guestAreas`) and leading somewhere, the same test Home's doors
 * pass (a community with no stream and no aarti time has no darshan door; one with no Navang puja lesson has no puja
 * door), so a visitor is never taken to "Live darshan is offline". Nothing shows until every check has settled, so the
 * section does not grow door by door. A check that failed keeps its door: the screen it opens says what went wrong, with
 * Try again (a feature is never hidden because of our own error).
 */
export function guestDoorsToShow(open: readonly GuestDoor[], checks: Record<GuestDoor, DoorCheck>): GuestDoor[] {
  if (open.some((door) => checks[door] === 'checking')) return [];
  return open.filter((door) => checks[door] === 'leads' || checks[door] === 'failed');
}

/**
 * What the hand-off from the Welcome screen does on a render (`OpenGuestDoor` in src/features/guest-door.tsx):
 * `idle` (no door was chosen), `drop` (the app opened for someone who is not a guest: forget the choice),
 * `wait` (guest mode is on but the navigator that just mounted cannot take a push yet; keep the choice) or
 * `open` (go to the screen). Pushing before the navigator is ready throws on the web ("Cannot read properties of
 * null (reading 'pathname')") and blanks the page.
 */
export type GuestDoorStep = 'idle' | 'drop' | 'wait' | 'open';

export function guestDoorStep(input: { pending: string | null; guest: boolean; navReady: boolean }): GuestDoorStep {
  if (!input.pending) return 'idle';
  if (!input.guest) return 'drop';
  return input.navReady ? 'open' : 'wait';
}

// ---------------------------------------------------------------------------
// Holding the answer (src/providers/access.tsx)
// ---------------------------------------------------------------------------

/** What the provider holds: the answer for one person in one community, or why there is none. */
export type AccessSlot = { scope: string; snapshot: AccessSnapshot | null; error: AppError | null };

/** What one read of the answer came back with. */
export type AccessRead = { snapshot: AccessSnapshot } | { error: AppError };

/**
 * The community and the person an answer belongs to: the login, and the person it is linked to in this community
 * (null while the login is not linked). A login that is not linked yet is another answer from the one it gets once
 * it is, because the database works a person's level out from that link (an unlinked login is public there). So
 * finishing onboarding changes the scope, and the answer is read again.
 */
export function accessScope(centerId: string | null, userId: string | null, personId: string | null): string {
  return `${centerId ?? ''}#${userId ?? ''}#${personId ?? ''}`;
}

/**
 * Is it time to read the answer (the community is known)? Not while a signed-in person's link to the community is
 * still being looked up: the answer depends on it, so asking early would give a returning member a second read and a
 * flicker, and a new one the answer for a visitor. And not again for a person and community the portal was found to
 * lack the function for (`missingFor` is the scope of the last read when it found it missing, else null).
 */
export function accessReadDue(s: { signedIn: boolean; memberLoading: boolean; scope: string; missingFor: string | null }): boolean {
  if (s.signedIn && s.memberLoading) return false;
  return s.missingFor !== s.scope;
}

/**
 * The slot after a read. An answer replaces whatever was there. A failure keeps the earlier answer when
 * it was for the same person and community (so a refresh that fails changes nothing on screen) and never
 * keeps another person's.
 */
export function settleSlot(prev: AccessSlot | null, scope: string, read: AccessRead): AccessSlot {
  if ('snapshot' in read) return { scope, snapshot: read.snapshot, error: null };
  return { scope, snapshot: prev && prev.scope === scope ? prev.snapshot : null, error: read.error };
}

/** The slot that applies now: none while the person or the community has changed and their answer is not in yet. */
export function currentSlot(slot: AccessSlot | null, scope: string): AccessSlot | null {
  return slot && slot.scope === scope ? slot : null;
}
