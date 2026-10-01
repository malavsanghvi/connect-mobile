import { Screen } from '@/components/screen';
import {
  AlertsSection,
  ConfirmCard,
  DeactivatedBanner,
  FeedbackCard,
  GivingSection,
  GuestSignInCard,
  GuideLink,
  JainWayCard,
  LunchCard,
  NextEventRow,
  SpecialDayCard,
  TodayCard,
  useFeedbackHome,
  useHomeEvents,
} from '@/features/home';
import { HomeShortcuts } from '@/features/home-shortcuts';
import { SurveyPopup } from '@/features/survey-popup';
import { isHomeCardVisible, type HomeCard } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useModules } from '@/providers/modules';

/**
 * Home, in the prototype's order (Main.dc.html L43–139). Each card loads on
 * its own so one failure never blanks the screen; the lunch, confirm and
 * next-event cards share one load. Cards of modules the community switched
 * off are left out (src/lib/modules.ts HOME_CARD_MODULE). The shortcuts
 * strip sits right under "Today at {center}" (src/lib/home-shortcuts.ts).
 */
export default function HomeScreen() {
  const { member, guest } = useApp();
  const { invalidate } = useDataVersion();
  const { map } = useModules();
  const on = (card: HomeCard) => isHomeCardVisible(map, card);
  const events = useHomeEvents();
  const feedbackOn = !!member && on('feedback');
  const feedback = useFeedbackHome(feedbackOn);
  return (
    <>
      <Screen root showWordmark onRefresh={async () => invalidate()}>
        {member?.account?.status === 'deactivated' ? <DeactivatedBanner /> : null}
        {on('today') ? <TodayCard /> : null}
        {member ? <HomeShortcuts /> : null}
        {member && on('alerts') ? <AlertsSection /> : null}
        {member && on('jainWay') ? <JainWayCard /> : null}
        {feedbackOn ? <FeedbackCard state={feedback} /> : null}
        {on('lunch') ? <LunchCard state={events} /> : null}
        {member?.isAdult && on('specialDay') ? <SpecialDayCard /> : null}
        {on('confirm') ? <ConfirmCard state={events} /> : null}
        {on('nextEvent') ? <NextEventRow state={events} /> : null}
        {member?.isAdult && on('giving') ? <GivingSection /> : null}
        {on('guide') ? <GuideLink /> : null}
        {guest ? <GuestSignInCard /> : null}
      </Screen>
      {feedbackOn ? <SurveyPopup state={feedback} /> : null}
    </>
  );
}
