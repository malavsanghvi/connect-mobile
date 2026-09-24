import { Screen } from '@/components/screen';
import { FamilyReview } from '@/features/onboarding/family-review';
import { useT } from '@/providers/settings';

/** "Update family profile": the onboarding family step, reachable any time from the Family tab. */
export default function FamilyReviewScreen() {
  const t = useT();
  return (
    <Screen title={t('familyStep.title')}>
      <FamilyReview />
    </Screen>
  );
}
