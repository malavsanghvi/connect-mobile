import { Screen } from '@/components/screen';
import {
  AlertsSection,
  DeactivatedBanner,
  FeedbackCard,
  GuestSignInCard,
  GuideLink,
  JainWayCard,
  PlanSpecialDayCard,
  TodayCard,
  UpNextCard,
  useFeedbackHome,
  useHomeEvents,
  useHomeSpecialDays,
} from '@/features/home';
import { HomeRails, useRailReveal } from '@/features/home-rails';
import { SurveyPopup } from '@/features/survey-popup';
import { isHomeCardVisible, type HomeCard } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useModules } from '@/providers/modules';

/**
 * Home, Netflix style (owner, 2026-10-02). At the top: Today (with Watch
 * live darshan and Do puja) → alerts → "Up next" (the RSVP to confirm,
 * today's lunch times, the next event and a special day whose reminder has
 * started) → "Plan a special day". Then the rails, rows of large tiles that
 * scroll sideways (src/features/home-rails.tsx): Continue learning, Upcoming
 * events, Listen, Give, Photos, Fully Jain recipes. Then My Jain Way →
 * Feedback → the guide link → guest sign-in.
 *
 * Each card and rail loads on its own so one failure never blanks the
 * screen; a rail loads only as it comes near the screen (useRailReveal, fed
 * by the screen's scroll position). Up next's event rows share one load, and
 * Up next and the Plan card share the special-days load. Cards and rails of
 * modules the community switched off are left out (src/lib/modules.ts
 * HOME_CARD_MODULE, src/lib/home-rails.ts); RSVPs, lunch, labhs and giving
 * are for adults only, and a guest gets the community's public events.
 */
export default function HomeScreen() {
  const { member, guest } = useApp();
  const { invalidate } = useDataVersion();
  const { map } = useModules();
  const reveal = useRailReveal();
  const on = (card: HomeCard) => isHomeCardVisible(map, card);
  const adult = !!member?.isAdult;
  const upNext = {
    confirm: adult && on('confirm'),
    lunch: adult && on('lunch'),
    nextEvent: on('nextEvent'),
    specialDay: adult && on('specialDay'),
  };
  const events = useHomeEvents(upNext.confirm || upNext.lunch || upNext.nextEvent);
  const specialOn = !!member && on('specialDay');
  const days = useHomeSpecialDays(specialOn);
  const feedbackOn = !!member && on('feedback');
  const feedback = useFeedbackHome(feedbackOn);
  return (
    <>
      <Screen root showWordmark onRefresh={async () => invalidate()} onViewport={reveal.onViewport}>
        {member?.account?.status === 'deactivated' ? <DeactivatedBanner /> : null}
        {on('today') ? <TodayCard /> : null}
        {member && on('alerts') ? <AlertsSection /> : null}
        <UpNextCard events={events} days={days} show={upNext} />
        {specialOn ? <PlanSpecialDayCard days={days} excludeReminder={upNext.specialDay} /> : null}
        <HomeRails reveal={reveal} />
        {member && on('jainWay') ? <JainWayCard /> : null}
        {feedbackOn ? <FeedbackCard state={feedback} /> : null}
        {on('guide') ? <GuideLink /> : null}
        {guest ? <GuestSignInCard /> : null}
      </Screen>
      {feedbackOn ? <SurveyPopup state={feedback} /> : null}
    </>
  );
}
