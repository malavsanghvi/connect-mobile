import { Stack } from 'expo-router';

import { DrawerProvider } from '@/components/drawer';
import { ConfirmPopupProvider } from '@/features/confirm-popup';
import { NotificationRouter } from '@/components/notification-router';
import { CartProvider } from '@/providers/cart';
import { PushProvider } from '@/providers/push';
import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: '(tabs)' };

/**
 * Signed-in (or guest) app: tabs plus pushed screens, drawer, cart, push
 * registration, notification taps and the 24-hour confirm pop-up. Pushed screens draw the same tab bar themselves (Screen →
 * SubScreenTabBar), so it stays visible as in the prototype without moving
 * routes (deep links unchanged).
 */
export default function AppLayout() {
  return (
    <PushProvider>
      <CartProvider>
        <DrawerProvider>
          <NotificationRouter />
          <ConfirmPopupProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
              <Stack.Screen name="(tabs)" />
            </Stack>
          </ConfirmPopupProvider>
        </DrawerProvider>
      </CartProvider>
    </PushProvider>
  );
}
