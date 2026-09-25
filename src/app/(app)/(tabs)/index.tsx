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
  useHomeEvents,
} from '@/features/home';
import { isHomeCardVisible, type HomeCard } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useModules } from '@/providers/modules';

/**
 * Home, in the prototype's order (Main.dc.html L43–139). Each card loads on
 * its own so one failure never blanks the screen; the lunch, confirm and
 * next-event cards share one load. Cards of modules the community switched
 * off are left out (src/lib/modules.ts HOME_CARD_MODULE).
 */
export default function HomeScreen() {
  const { member, guest } = useApp();
  const { invalidate } = useDataVersion();
  const { map } = useModules();
  const on = (card: HomeCard) => isHomeCardVisible(map, card);
  const events = useHomeEvents();
  return (
    <Screen root showWordmark onRefresh={async () => invalidate()}>
      {member?.account?.status === 'deactivated' ? <DeactivatedBanner /> : null}
      {on('today') ? <TodayCard /> : null}
      {member && on('alerts') ? <AlertsSection /> : null}
      {member && on('jainWay') ? <JainWayCard /> : null}
      {member && on('feedback') ? <FeedbackCard /> : null}
      {on('lunch') ? <LunchCard state={events} /> : null}
      {member?.isAdult && on('specialDay') ? <SpecialDayCard /> : null}
      {on('confirm') ? <ConfirmCard state={events} /> : null}
      {member?.isAdult && on('giving') ? <GivingSection /> : null}
      {on('nextEvent') ? <NextEventRow state={events} /> : null}
      {on('guide') ? <GuideLink /> : null}
      {guest ? <GuestSignInCard /> : null}
    </Screen>
  );
}
