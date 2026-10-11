/**
 * Which screen is this, for the usage logger (connect-crm B91). Pure: unit-tested in src/lib/__tests__/activity-routes.test.ts.
 *
 * A screen is recorded as a PATTERN such as `/event/[id]/confirm`, never as the address the person is on
 * (`/event/8f0c…/confirm?x=1`): a real id, a name or a query string never leaves the phone. The pattern comes from the
 * route's file path (expo-router's `useSegments()`), so it has no id in it to begin with; `routePattern` still refuses
 * anything that is not a plain word or a `[param]`, so a stray id can never survive.
 */

/** A folder or file name of a route: lower-case words and hyphens only (`member-card`, `pathshala-enroll`). */
const STATIC_SEGMENT = /^[a-z][a-z-]{0,39}$/;
/** A dynamic segment as written in the file name: `[id]`, `[slug]`, `[...rest]`. */
const PARAM_SEGMENT = /^\[(\.\.\.)?[A-Za-z][A-Za-z0-9_]{0,23}\]$/;
/** A route group, `(app)`, `(tabs)`: part of the file path, not of the address. */
const GROUP_SEGMENT = /^\(.*\)$/;

/** What stands in for any segment that is not a plain word or a `[param]`. */
export const ID_PLACEHOLDER = '[id]';

/**
 * `['(app)', 'event', '[id]', 'confirm']` becomes `/event/[id]/confirm`. Groups and `index` are dropped, so the home tab is `/`.
 * Anything else that is not a plain word or a `[param]` (a uuid, a number, a name, a query string) becomes `[id]`.
 */
export function routePattern(segments: readonly string[]): string {
  const parts: string[] = [];
  for (const raw of segments) {
    const segment = String(raw);
    if (GROUP_SEGMENT.test(segment) || segment === 'index' || segment === '') continue;
    if (PARAM_SEGMENT.test(segment) || STATIC_SEGMENT.test(segment) || segment === '+not-found') parts.push(segment);
    else parts.push(ID_PLACEHOLDER);
  }
  return `/${parts.join('/')}`;
}

/** The key a screen is recorded under: `screen:/event/[id]`. */
export function screenKey(pattern: string): string {
  return `screen:${pattern}`;
}

/** True for a key made by `screenKey(routePattern(...))`: nothing but plain words, `[params]` and slashes after `screen:`. */
export function isScreenKey(key: string): boolean {
  if (!key.startsWith('screen:/')) return false;
  const rest = key.slice('screen:/'.length);
  if (rest === '') return true;
  return rest.split('/').every((s) => PARAM_SEGMENT.test(s) || STATIC_SEGMENT.test(s) || s === '+not-found');
}

/** One open visit to a screen, closed with how long it was on screen (ms). */
export type ScreenVisit = { end: (visibleMs: number) => void };

type TrackerDeps = {
  /** Starts recording a visit; null when nothing is being recorded (a guest, opted out, not signed in yet). */
  begin: (key: string) => ScreenVisit | null;
  now: () => number;
};

/**
 * Follows the current screen and how long it is visible. A visit ends when the person moves to another screen or the app
 * goes to the background (time away is not counted), and starts again for the same screen when the app comes back.
 */
export function createScreenTracker(deps: TrackerDeps) {
  let pattern: string | null = null;
  let visit: ScreenVisit | null = null;
  let since = 0;
  let hidden = false;

  const close = () => {
    if (visit) visit.end(Math.max(0, deps.now() - since));
    visit = null;
  };
  const open = () => {
    if (pattern === null || hidden) return;
    since = deps.now();
    visit = deps.begin(screenKey(pattern));
  };

  return {
    /** The route changed (also called with the first route). The same pattern again is not a new visit. */
    show(next: string | null) {
      if (next === pattern) return;
      close();
      pattern = next;
      open();
    },
    /** The app went to the background. */
    background() {
      if (hidden) return;
      close();
      hidden = true;
    },
    /** The app came back: the screen that was open starts a new visit. */
    foreground() {
      if (!hidden) return;
      hidden = false;
      open();
    },
    /** Recording just became possible (signed in): the screen already in view starts its visit now. */
    retry() {
      if (pattern !== null && visit === null && !hidden) open();
    },
    /** The tracker is no longer used (the layout unmounted). */
    stop() {
      close();
      pattern = null;
    },
  };
}

export type ScreenTracker = ReturnType<typeof createScreenTracker>;
