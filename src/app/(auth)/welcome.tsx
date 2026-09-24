import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { CenterMark, useBranding } from '@/components/brand';
import { FullScreen } from '@/components/full-screen';
import { Button, LinkText, Txt } from '@/components/ui';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { fonts, space } from '@/theme';

/** Onboarding step 0 (Onboarding.dc.html s0; docs/PROTOTYPE_ONBOARDING.md §1.3). */
export default function WelcomeScreen() {
  const router = useRouter();
  const t = useT();
  const { center, setGuest } = useApp();
  const brand = useBranding();
  return (
    <FullScreen align="top">
      <View style={{ gap: 18, paddingTop: 40 }}>
        <View style={{ alignSelf: 'center' }}>
          {/* The community's full lockup, 150px wide; a smaller initials mark when it has no logo. */}
          <CenterMark kind="logo" size={brand.logoUrl || brand.markUrl ? 150 : 72} maxWidth={150} />
        </View>
        <Txt variant="section" color="muted" style={{ fontFamily: fonts.body }}>
          {t('welcome.jaiJinendra')}
        </Txt>
        <Txt variant="onboardingHero" accessibilityRole="header">
          {t('welcome.headline', { center: center?.name ?? '' })}
        </Txt>
        <Txt variant="body" color="ink2">
          {t('welcome.subtitle')}
        </Txt>
        <View style={{ gap: 10, paddingTop: space.xl }}>
          <Button label={t('welcome.email')} onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'email' } })} />
          <Button label={t('welcome.mobile')} tone="secondary" onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'phone' } })} />
          <View style={{ alignItems: 'center' }}>
            <LinkText label={t('welcome.guest')} onPress={() => setGuest(true)} />
          </View>
        </View>
      </View>
    </FullScreen>
  );
}
