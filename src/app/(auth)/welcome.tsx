import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { CenterMark, useBranding } from '@/components/brand';
import { FullScreen } from '@/components/full-screen';
import type { IconName } from '@/components/icon';
import { ErrorState } from '@/components/states';
import { Button, LinkText, Txt, VStack } from '@/components/ui';
import { openAfterGuest, useGuestDoors } from '@/features/guest-door';
import { GUEST_DOORS, type GuestDoor } from '@/lib/access';
import { welcomeSignInChoices } from '@/lib/auth-config';
import { useAccess } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { fonts, space } from '@/theme';

const DOOR_ICON: Record<GuestDoor, IconName> = { darshan: 'eye-outline', puja: 'flame-outline' };

/**
 * Onboarding step 0 (Onboarding.dc.html s0; docs/PROTOTYPE_ONBOARDING.md §1.3), with "Without signing in":
 * a button for each area the community lets a visitor use (Live darshan, Virtual puja, by the organization's
 * access levels) that has something to open here, which enters guest mode and opens it.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const t = useT();
  const { center, setGuest, switchCommunity } = useApp();
  const brand = useBranding();
  const access = useAccess();
  const doors = useGuestDoors();
  const openDoor = (door: GuestDoor) => {
    openAfterGuest(door);
    setGuest(true);
  };
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
          {/* Email only while the mobile number is switched off (src/lib/auth-config.ts): one button, no "or" divider. */}
          {welcomeSignInChoices().map((choice) => (
            <Button key={choice.mode} label={t(choice.labelKey)} tone={choice.tone} onPress={() => router.push({ pathname: '/sign-in', params: { mode: choice.mode } })} />
          ))}
          {doors.length > 0 ? (
            <VStack gap={10} style={{ paddingTop: space.md }}>
              <Txt variant="eyebrow" color="muted" accessibilityRole="header">
                {t('welcome.withoutSigningIn')}
              </Txt>
              {doors.map((door) => (
                <Button key={door} label={t(GUEST_DOORS[door].label)} tone="outlineBrown" size="md" icon={DOOR_ICON[door]} onPress={() => openDoor(door)} />
              ))}
            </VStack>
          ) : null}
          {/* The visitor's options could not be read: say so (the sign-in buttons above still work). */}
          {access.error ? <ErrorState error={access.error} onRetry={() => void access.reload()} /> : null}
          <View style={{ alignItems: 'center', gap: space.md }}>
            <LinkText label={t('welcome.guest')} onPress={() => setGuest(true)} />
            <LinkText label={t('community.notYours')} color="muted" onPress={switchCommunity} />
          </View>
        </View>
      </View>
    </FullScreen>
  );
}
