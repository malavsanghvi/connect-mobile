import { useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { beginScreen } from './activity';
import { createScreenTracker, routePattern, type ScreenTracker } from './activity-routes';

/**
 * Records which screen is in view and for how long (`screen:/event/[id]`, never a real id or a query string).
 *
 * The pattern comes from the route's file path (`useSegments`), so it carries no id to begin with; `routePattern` keeps it
 * that way. A visit ends when the person goes to another screen or the app goes to the background, and starts again for
 * the same screen when the app comes back. Nothing is recorded for a guest, someone who opted out, or an under-18 account:
 * `beginScreen` returns nothing then (see src/lib/activity.ts). `recording` goes true when someone signs in, so the screen
 * already in view is counted from then on. The logic is in activity-routes.ts and is unit-tested.
 */
export function useScreenTracking(recording = true): void {
  const pattern = routePattern(useSegments());
  const tracker = useRef<ScreenTracker | null>(null);

  useEffect(() => {
    const t = createScreenTracker({ begin: (key) => beginScreen(key), now: () => Date.now() });
    tracker.current = t;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') t.foreground();
      else t.background();
    });
    return () => {
      sub.remove();
      t.stop();
      tracker.current = null;
    };
  }, []);

  useEffect(() => {
    tracker.current?.show(pattern);
  }, [pattern]);

  useEffect(() => {
    if (recording) tracker.current?.retry();
  }, [recording]);
}
