import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BiometricGate } from '@/components/biometric-gate';
import { FullScreenError, FullScreenLoading } from '@/components/full-screen';
import { iconFont } from '@/components/icon';
import { SetupScreen } from '@/components/setup-screen';
import { logError } from '@/lib/errors';
import { AppProvider, useApp } from '@/providers/app';
import { DataVersionProvider } from '@/providers/data-version';
import { FeedbackProvider } from '@/providers/feedback';
import { SettingsProvider, useT } from '@/providers/settings';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch((err: unknown) => logError('keeping the splash screen up', err));

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    ...iconFont,
  });

  useEffect(() => {
    if (fontError) logError('loading fonts (continuing with system fonts)', fontError);
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch((err: unknown) => logError('hiding the splash screen', err));
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <DataVersionProvider>
          <AppProvider>
            <FeedbackProvider>
              <StatusBar style="dark" />
              <RootNavigator />
            </FeedbackProvider>
          </AppProvider>
        </DataVersionProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const app = useApp();
  const t = useT();

  if (!app.configured) return <SetupScreen />;
  if (app.booting) return <FullScreenLoading />;
  if (app.bootError) return <FullScreenError error={app.bootError} onRetry={app.retryBoot} />;
  if (app.session && app.memberLoading) return <FullScreenLoading label={t('boot.loadingFamily')} />;
  if (app.session && app.memberError) {
    return (
      <FullScreenError
        error={app.memberError}
        onRetry={() => {
          app.refreshMember().catch((err: unknown) => logError('retrying family load', err));
        }}
        secondary={{
          label: t('lock.signOut'),
          onPress: () => {
            app.signOut().catch((err: unknown) => logError('signing out after a failed family load', err));
          },
        }}
      />
    );
  }

  const signedIn = !!app.session;
  const linked = !!app.member;

  return (
    <BiometricGate active={signedIn}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
        <Stack.Protected guard={!signedIn && !app.guest}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && (!linked || app.onboarding)}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={(signedIn && linked && !app.onboarding) || (!signedIn && app.guest)}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </BiometricGate>
  );
}
