import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { ActivityNoticeCard } from '@/features/activity-notice';
import { FLUSH_EVERY_MS } from '@/lib/activity';
import { contextFor, noticeKey, type NoticePhase } from '@/lib/activity-notice';
import { activityLogger, activityNotice } from '@/lib/activity-runtime';
import { useScreenTracking } from '@/lib/use-screen-tracking';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useForegroundTick } from '@/providers/foreground';
import { useT } from '@/providers/settings';

/**
 * Mount once in the root navigator (inside the app provider, after the app is unlocked). Starts the usage logger
 * (src/lib/activity.ts), follows the screens, and shows the first-run notice (src/lib/activity-notice.ts).
 *
 *  - The logger records only while someone is signed in to a community, is not under 18, and has seen the notice there
 *    once. The notice is shown only when the community's recording is on; otherwise nothing is shown and nothing is
 *    recorded. A guest, a sign-out and a child account empty the logger. (The database decides again from the sign-in;
 *    this is the phone's half.)
 *  - It sends what waits when the app goes to the background, when it comes back and every minute while it is open.
 */
export function ActivityRecorder() {
  const t = useT();
  const { toast } = useFeedback();
  const tick = useForegroundTick();
  const { booting, session, center, member, onboarding, legalPending } = useApp();
  const userId = session?.user.id ?? null;
  const centerId = center?.id ?? null;
  const child = !!member && !member.isAdult;
  const key = userId && centerId ? noticeKey(userId, centerId) : null;
  const [decision, setDecision] = useState<{ key: string; phase: NoticePhase } | null>(null);

  // Another person or community, a guest, a child: nothing is recorded until it has been decided again below.
  useEffect(() => {
    const logger = activityLogger();
    // While the sign-in is still being read the answer is not known: do not empty what was kept.
    if (booting) return;
    if (!userId || child) logger.reset();
    else logger.setContext(null);
  }, [booting, userId, centerId, child]);

  // Seen the notice here → record. Not seen and recording is on → show it. Anything else → nothing. Looked at again when the
  // app comes back (a community may turn recording on later).
  useEffect(() => {
    if (booting || !userId || !centerId || child) return;
    let alive = true;
    activityNotice()
      .check(userId, centerId)
      .then((phase) => {
        if (!alive) return;
        setDecision({ key: noticeKey(userId, centerId), phase });
        activityLogger().setContext(contextFor(phase, userId, centerId));
      })
      .catch(() => undefined); // check() does not reject; telemetry never throws
    return () => {
      alive = false;
    };
  }, [booting, userId, centerId, child, tick]);

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

  const deciding = decision !== null && key !== null && decision.key === key ? decision.phase : null;
  useScreenTracking(!booting && !child && deciding === 'record');

  // Over the app, but not over the legal step or the onboarding steps: after them.
  const visible = deciding === 'show' && !!member && !onboarding && legalPending !== null && legalPending.length === 0;

  const gotIt = () => {
    if (!userId || !centerId || key === null) return;
    void activityNotice().gotIt(userId, centerId);
    setDecision({ key, phase: 'record' });
    activityLogger().setContext(contextFor('record', userId, centerId));
  };

  // The logger stops at once (it is the first thing turnOff does); the account is told, and if that fails the member is told.
  const turnOff = () => {
    if (!userId || !centerId || key === null) return;
    setDecision({ key, phase: 'quiet' });
    activityLogger().setContext(null);
    activityNotice()
      .turnOff(userId, centerId)
      .then(({ synced }) => {
        if (!synced) toast(t('settings.helpImproveFailed'), 'error');
      })
      .catch(() => toast(t('settings.helpImproveFailed'), 'error'));
  };

  return visible ? <ActivityNoticeCard onGotIt={gotIt} onTurnOff={turnOff} /> : null;
}
