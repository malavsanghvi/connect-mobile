import { useIsFocused } from 'expo-router';

import { Screen } from '@/components/screen';
import { AlertsStrip, ConfirmPrompt, DeactivatedBanner, EventActionsStrip, FeedbackStrip, GuestSignInCard, useFeedbackHome, useHomeAlerts, useHomeEvents } from '@/features/home';
import { HomeRows, type LazyRow } from '@/features/home-rails';
import { useRailReveal } from '@/features/home-rail';
import { SurveyPopup } from '@/features/survey-popup';
import { isHomeCardVisible, type HomeCard } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { FreezeDataVersion, useDataVersion } from '@/providers/data-version';
import { useModules } from '@/providers/modules';

/**
 * Home, in Netflix-style rows (owner, 2026-10-02). Above the first row only what cannot wait: the deactivated notice
 * and urgent alerts. Then the rows (src/features/home-rails.tsx), each a strip of tiles that scrolls sideways with the
 * next tile peeking in:
 *
 *   1  Today at {center} and My Jain Way          4  Giving opportunities
 *   2  Plan a special day (hidden with none)      5  Life@{center}
 *   3  Events, each with the family's RSVP        6  Learn & listen
 *
 * Between rows 1 and 2, the notices that load after Home has been drawn (the other alerts, today's lunch times, feedback
 * requested), so they never push Today down; the "Still coming?" pop-up opens by itself 24 hours before an event. Under the
 * rows a guest gets the sign-in card. Each row loads on its own so one failure never blanks the screen; Events, Giving
 * and Learn & listen load only as they come near the screen (useRailReveal, fed by the screen's scroll position), and
 * Plan a special day when Home does, the rows under it waiting (invisible) for its answer. Rows, tiles and strip items of
 * modules the community switched off are left out (src/lib/modules.ts HOME_CARD_MODULE, src/lib/home-rails.ts); RSVPs,
 * lunch, labhs and giving are for adults only, and a guest gets the community's public events.
 *
 * Like every Home card, everything here reloads after a write elsewhere in the app, but only once Home is in
 * front again (FreezeDataVersion): a like or a playlist change on another screen does not reload what is
 * behind it, and Home catches up once when the member comes back.
 */
export default function HomeScreen() {
  const focused = useIsFocused();
  return (
    <FreezeDataVersion frozen={!focused}>
      <HomeContent />
    </FreezeDataVersion>
  );
}

function HomeContent() {
  const { member, guest } = useApp();
  const { invalidate } = useDataVersion();
  const { map } = useModules();
  const reveal = useRailReveal<LazyRow>();
  const on = (card: HomeCard) => isHomeCardVisible(map, card);
  const adult = !!member?.isAdult;
  const confirmOn = adult && on('confirm');
  const lunchOn = adult && on('lunch');
  const events = useHomeEvents(confirmOn || lunchOn);
  const feedbackOn = !!member && on('feedback');
  const feedback = useFeedbackHome(feedbackOn);
  const alertsOn = !!member && on('alerts');
  const alerts = useHomeAlerts(alertsOn);
  return (
    <>
      <Screen root showWordmark onRefresh={async () => invalidate()} onViewport={reveal.onViewport}>
        {member?.account?.status === 'deactivated' ? <DeactivatedBanner /> : null}
        {alertsOn ? <AlertsStrip state={alerts} part="urgent" /> : null}
        {confirmOn ? <ConfirmPrompt events={events} /> : null}
        <HomeRows
          reveal={reveal}
          underToday={
            <>
              {alertsOn ? <AlertsStrip state={alerts} part="other" /> : null}
              {confirmOn || lunchOn ? <EventActionsStrip events={events} lunch={lunchOn} /> : null}
              {feedbackOn ? <FeedbackStrip state={feedback} /> : null}
            </>
          }
        />
        {guest ? <GuestSignInCard /> : null}
      </Screen>
      {feedbackOn ? <SurveyPopup state={feedback} /> : null}
    </>
  );
}
