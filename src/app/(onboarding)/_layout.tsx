import { Stack } from 'expo-router';

import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: 'family-match' };

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
      <Stack.Screen name="family-match" />
      <Stack.Screen name="about" />
      <Stack.Screen name="family" />
      <Stack.Screen name="contact" />
      <Stack.Screen name="done" />
    </Stack>
  );
}
