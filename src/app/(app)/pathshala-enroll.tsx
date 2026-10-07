import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/states';
import { RegistrationFlow } from '@/features/pathshala/flow';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

/**
 * Pathshala registration (`/pathshala-enroll?term=<id>`; the route name is kept so existing links and the module map
 * keep working). A household adult registers children and adults, themselves included, through the guided flow of
 * src/features/pathshala/flow.tsx (connect-crm 0590/0591). A child is asked to have a parent register them. Against a
 * database without the registration functions the flow falls back to today's simple request form.
 */
export default function PathshalaEnrollScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ term?: string }>();
  const { center, member } = useApp();

  if (!member || !center || !member.household) {
    return (
      <Screen title={t('reg.title')} tabBar={false}>
        <EmptyState title={t('profile.notFound')} />
      </Screen>
    );
  }
  if (!member.isAdult) {
    return (
      <Screen title={t('reg.title')} tabBar={false}>
        <EmptyState icon="school-outline" title={t('reg.adultsOnly')} />
      </Screen>
    );
  }
  return <RegistrationFlow center={center} member={member} askedTerm={typeof params.term === 'string' && params.term ? params.term : null} />;
}
