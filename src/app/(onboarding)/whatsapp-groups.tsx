import { Redirect, useRouter } from 'expo-router';

import { Loaded } from '@/components/states';
import { Banner, Button, VStack } from '@/components/ui';
import { GuideFootnote, useCommunity } from '@/features/guide-ui';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { ONBOARDING_STEP_NUMBER } from '@/features/onboarding/steps';
import { useWhatsAppGroups, WhatsAppGroupList, WhatsAppPhoneLine } from '@/features/whatsapp-groups';
import { useApp } from '@/providers/app';
import { useModule } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * Onboarding step 8: ask to join the community's WhatsApp groups (an admin adds the number on the person's profile,
 * usually within a day), the same request as the welcome guide. Optional and skippable. Adults only, and passed over
 * when the Communications module is off or the community has no active group, so nobody sees an empty step.
 */
export default function WhatsAppStepScreen() {
  const router = useRouter();
  const t = useT();
  const community = useCommunity();
  const { member, center } = useApp();
  const commsOn = useModule('comms');
  const { state, busy, error, request, phone, zoneId } = useWhatsAppGroups();
  if (!member || !center) return null;
  if (!member.isAdult || !commsOn) return <Redirect href="/contact" />;
  if (state.data && state.data.length === 0) return <Redirect href="/contact" />;
  const next = () => router.push('/contact');

  return (
    <OnboardingFrame step={ONBOARDING_STEP_NUMBER.whatsapp} title={t('waStep.title')} subtitle={t('guide.waIntro', { center: community })} onBack={() => router.back()} onSkip={next}>
      <VStack gap={space.md}>
        {/* The number was entered on "About you"; changing it goes back there. */}
        <WhatsAppPhoneLine phone={phone} onChange={() => router.dismissTo('/about')} />
        {error ? <Banner tone="error" message={error} /> : null}
        <Loaded state={state}>{(groups) => <WhatsAppGroupList groups={groups} zoneId={zoneId} phone={phone} busy={busy} onRequest={request} />}</Loaded>
        <GuideFootnote>{t('guide.waRules', { center: community })}</GuideFootnote>
        <Button label={t('common.continue')} onPress={next} />
      </VStack>
    </OnboardingFrame>
  );
}
