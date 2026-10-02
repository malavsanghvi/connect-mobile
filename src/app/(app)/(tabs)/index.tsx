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
import { GivingCard } from '@/features/home-giving';
import { HomeShortcuts } from '@/features/home-shortcuts';
import { SurveyPopup } from '@/features/survey-popup';
import { isHomeCardVisible, type HomeCard } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useModules } from '@/providers/modules';

/**
 * Home, layout B (owner, 2026-10-02): Today (compact) → the shortcuts grid →
 * alerts → "Up next" (the RSVP to confirm, today's lunch times, the next
 * event and a special day whose reminder has started) → Giving, rotating
 * through every open opportunity → "Plan a special day" → My Jain Way →
 * Feedback → the guide link → guest sign-in.
 *
 * Each card loads on its own so one failure never blanks the screen; the
 * event rows of Up next share one load, and Up next and the Plan card share
 * the special-days load. Cards of modules the community switched off are left
 * out (src/lib/modules.ts HOME_CARD_MODULE); RSVPs, lunch, labhs and giving
 * are for adults only.
 */
export default function HomeScreen() {
  const { member, guest } = useApp();
  const { invalidate } = useDataVersion();
  const { map } = useModules();
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
      <Screen root showWordmark onRefresh={async () => invalidate()}>
        {member?.account?.status === 'deactivated' ? <DeactivatedBanner /> : null}
        {on('today') ? <TodayCard /> : null}
        {member ? <HomeShortcuts /> : null}
        {member && on('alerts') ? <AlertsSection /> : null}
        <UpNextCard events={events} days={days} show={upNext} />
        {adult && on('giving') ? <GivingCard /> : null}
        {specialOn ? <PlanSpecialDayCard days={days} excludeReminder={upNext.specialDay} /> : null}
        {member && on('jainWay') ? <JainWayCard /> : null}
        {feedbackOn ? <FeedbackCard state={feedback} /> : null}
        {on('guide') ? <GuideLink /> : null}
        {guest ? <GuestSignInCard /> : null}
      </Screen>
      {feedbackOn ? <SurveyPopup state={feedback} /> : null}
    </>
  );
}
