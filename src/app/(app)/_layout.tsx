import { Stack } from 'expo-router';

import { DrawerProvider } from '@/components/drawer';
import { moduleStackLayout } from '@/components/module-off';
import { ConfirmPopupProvider } from '@/features/confirm-popup';
import { NotificationRouter } from '@/components/notification-router';
import { CartProvider } from '@/providers/cart';
import { MediaStateProvider } from '@/providers/media-state';
import { PlayerProvider } from '@/providers/player';
import { PushProvider } from '@/providers/push';
import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: '(tabs)' };

/**
 * Signed-in (or guest) app: tabs plus pushed screens, drawer, cart, push
 * registration, notification taps and the 24-hour confirm pop-up. Pushed screens draw the same tab bar themselves (Screen →
 * SubScreenTabBar), so it stays visible as in the prototype without moving
 * routes (deep links unchanged). Screens whose module the community switched
 * off render the "not offered" screen instead (moduleStackLayout). The 3L
 * player (one audio queue, mini player above the tab bar) and the member's
 * likes / playlist changes live here, so they survive moving between screens.
 */
export default function AppLayout() {
  return (
    <PushProvider>
      <CartProvider>
        <MediaStateProvider>
          <PlayerProvider>
            <DrawerProvider>
              <NotificationRouter />
              <ConfirmPopupProvider>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }} screenLayout={moduleStackLayout}>
                  <Stack.Screen name="(tabs)" />
                </Stack>
              </ConfirmPopupProvider>
            </DrawerProvider>
          </PlayerProvider>
        </MediaStateProvider>
      </CartProvider>
    </PushProvider>
  );
}
