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
  StoreBanner,
  TodayCard,
  useHomeEvents,
} from '@/features/home';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';

/**
 * Home, in the prototype's order (Main.dc.html L43–139). Each card loads on
 * its own so one failure never blanks the screen; the lunch, confirm and
 * next-event cards share one load.
 */
export default function HomeScreen() {
  const { member, guest } = useApp();
  const { invalidate } = useDataVersion();
  const events = useHomeEvents();
  return (
    <Screen root showWordmark onRefresh={async () => invalidate()}>
      {member?.account?.status === 'deactivated' ? <DeactivatedBanner /> : null}
      <TodayCard />
      {member ? <AlertsSection /> : null}
      {member ? <JainWayCard /> : null}
      {member ? <FeedbackCard /> : null}
      <LunchCard state={events} />
      {member?.isAdult ? <SpecialDayCard /> : null}
      <ConfirmCard state={events} />
      <StoreBanner />
      {member?.isAdult ? <GivingSection /> : null}
      <NextEventRow state={events} />
      <GuideLink />
      {guest ? <GuestSignInCard /> : null}
    </Screen>
  );
}
