import { Stack } from 'expo-router';

import { DrawerProvider } from '@/components/drawer';
import { CartProvider } from '@/providers/cart';
import { PushProvider } from '@/providers/push';
import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: '(tabs)' };

/**
 * Signed-in (or guest) app: tabs plus pushed screens, drawer, cart and push
 * registration. Pushed screens draw the same tab bar themselves (Screen →
 * SubScreenTabBar), so it stays visible as in the prototype without moving
 * routes (deep links unchanged).
 */
export default function AppLayout() {
  return (
    <PushProvider>
      <CartProvider>
        <DrawerProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        </DrawerProvider>
      </CartProvider>
    </PushProvider>
  );
}
