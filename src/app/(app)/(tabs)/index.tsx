import { Screen } from '@/components/screen';
import {
  AlertsSection,
  DeactivatedBanner,
  EventsSection,
  GivingSection,
  GuestSignInCard,
  GuideLink,
  JainWayCard,
  SpecialDaySection,
  StoreBanner,
  SurveysSection,
  TodayCard,
} from '@/features/home';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';

/** Home (prototype §2.1). Each card loads on its own so one failure never blanks the screen. */
export default function HomeScreen() {
  const { member, guest } = useApp();
  const { invalidate } = useDataVersion();
  return (
    <Screen root showWordmark onRefresh={async () => invalidate()}>
      {member?.account?.status === 'deactivated' ? <DeactivatedBanner /> : null}
      <TodayCard />
      {member ? <AlertsSection /> : null}
      {member ? <JainWayCard /> : null}
      {member ? <SurveysSection /> : null}
      <EventsSection />
      {member?.isAdult ? <GivingSection /> : null}
      {member?.isAdult ? <SpecialDaySection /> : null}
      <StoreBanner />
      <GuideLink />
      {guest ? <GuestSignInCard /> : null}
    </Screen>
  );
}
