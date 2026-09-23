import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { FullScreen } from '@/components/full-screen';
import { CenterMark } from '@/components/screen';
import { Button, LinkText, Txt } from '@/components/ui';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/** Onboarding step 0 (docs/PROTOTYPE_ONBOARDING.md §1.3). */
export default function WelcomeScreen() {
  const router = useRouter();
  const t = useT();
  const { center, setGuest } = useApp();
  return (
    <FullScreen>
      <View style={{ alignItems: 'flex-start', gap: space.lg }}>
        <CenterMark size={72} />
        <Txt variant="eyebrow" color="brown">
          {t('welcome.jaiJinendra')}
        </Txt>
        <Txt variant="hero" color="navy" accessibilityRole="header">
          {t('welcome.headline', { center: center?.name ?? '' })}
        </Txt>
        <Txt variant="body" color="ink2">
          {t('welcome.subtitle')}
        </Txt>
      </View>
      <View style={{ gap: space.md, marginTop: space.lg }}>
        <Button label={t('welcome.email')} icon="mail-outline" onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'email' } })} />
        <Button label={t('welcome.mobile')} icon="phone-portrait-outline" tone="secondary" onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'phone' } })} />
        <View style={{ alignItems: 'center' }}>
          <LinkText label={t('welcome.guest')} onPress={() => setGuest(true)} />
        </View>
      </View>
    </FullScreen>
  );
}
