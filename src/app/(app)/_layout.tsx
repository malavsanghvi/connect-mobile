import { Stack } from 'expo-router';

import { DrawerProvider } from '@/components/drawer';
import { CartProvider } from '@/providers/cart';
import { PushProvider } from '@/providers/push';
import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: '(tabs)' };

/** Signed-in (or guest) app: tabs plus pushed screens, drawer, cart and push registration. */
export default function AppLayout() {
  return (
    <PushProvider>
      <CartProvider>
        <DrawerProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="member-card" options={{ presentation: 'modal' }} />
          </Stack>
        </DrawerProvider>
      </CartProvider>
    </PushProvider>
  );
}
