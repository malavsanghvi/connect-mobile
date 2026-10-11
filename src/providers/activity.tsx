import { useEffect } from 'react';
import { AppState } from 'react-native';

import { FLUSH_EVERY_MS } from '@/lib/activity';
import { activityLogger } from '@/lib/activity-runtime';
import { useScreenTracking } from '@/lib/use-screen-tracking';
import { useApp } from '@/providers/app';

/**
 * Mount once in the root layout, inside the app provider. Starts the usage logger (src/lib/activity.ts) and follows the
 * screens. Renders nothing.
 *
 *  - The logger records only while someone is signed in to a community and is not under 18; a guest, a sign-out and a child
 *    account empty it. (The database decides again from the sign-in; this is the phone's half.)
 *  - It sends what waits when the app goes to the background, when it comes back and every minute while it is open.
 */
export function ActivityRecorder() {
  const { booting, session, center, member } = useApp();
  const userId = session?.user.id ?? null;
  const centerId = center?.id ?? null;
  const child = !!member && !member.isAdult;

  useEffect(() => {
    const logger = activityLogger();
    // While the sign-in is still being read the answer is not known: do not empty what was kept.
    if (booting) return;
    if (!userId || child) logger.reset();
    else logger.setContext(centerId ? { userId, centerId } : null);
  }, [booting, userId, centerId, child]);

  useEffect(() => {
    const logger = activityLogger();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => void logger.flush(), FLUSH_EVERY_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        start();
        void logger.flush();
      } else {
        stop();
        void logger.flush({ force: true });
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, []);

  useScreenTracking(!booting && !!userId && !!centerId && !child);
  return null;
}
