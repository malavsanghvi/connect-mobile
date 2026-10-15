import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { brandFontAssets } from '@/brand/fonts';
import { BiometricGate } from '@/components/biometric-gate';
import { FullScreenError, FullScreenLoading } from '@/components/full-screen';
import { iconFont } from '@/components/icon';
import { SetupScreen } from '@/components/setup-screen';
import { Txt } from '@/components/ui';
import { FindCommunityScreen } from '@/features/community/find-community';
import { DemoBanner } from '@/features/demo/banner';
import { DemoChooserScreen } from '@/features/demo/chooser';
import { LegalStepScreen } from '@/features/onboarding/legal-step';
import { PayHost } from '@/features/pay';
import { ReopenEventLink } from '@/features/return-to-event';
import { logError } from '@/lib/errors';
import { setClientScreen } from '@/lib/request-context';
import { AccessProvider } from '@/providers/access';
import { AppProvider, useApp } from '@/providers/app';
import { CategoryProvider, useCategory } from '@/providers/category';
import { DataVersionProvider } from '@/providers/data-version';
import { DemoProvider, useDemo } from '@/providers/demo';
import { FeedbackProvider } from '@/providers/feedback';
import { ActivityRecorder } from '@/providers/activity';
import { ForegroundProvider } from '@/providers/foreground';
import { ModulesProvider } from '@/providers/modules';
import { SettingsProvider, useT } from '@/providers/settings';
import { colors, layout } from '@/theme';

// Web only — Metro drops CSS imports on native builds. Boxes react-native-web's
// <Modal> portals (drawer, sheets, popovers) to the same width as WebFrame below.
import '@/global.css';

SplashScreen.preventAutoHideAsync().catch((err: unknown) => logError('keeping the splash screen up', err));

export default function RootLayout() {
  // The brand kit's two faces (src/brand/fonts.ts) and the icon font.
  const [fontsLoaded, fontError] = useFonts({ ...brandFontAssets, ...iconFont });

  useEffect(() => {
    if (fontError) logError('loading fonts (continuing with system fonts)', fontError);
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch((err: unknown) => logError('hiding the splash screen', err));
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <WebFrame>
      <SafeAreaProvider>
        <SettingsProvider>
          <DataVersionProvider>
            {/* Goes up when the app returns to the foreground (and every few minutes), so what an administrator changed shows without an update. */}
            <ForegroundProvider>
              {/* "Try the demo": a running demo and the chooser. Above the app, which asks it which community to open. */}
              <DemoProvider>
              <AppProvider>
                {/* The community's kind of organization and its words: below the community, above the modules (their defaults come from the kind). */}
                <CategoryProvider>
                  <ModulesProvider>
                    {/* What this person may use (access levels): read for a visitor who is not signed in too, so it sits above the (auth) screens. */}
                    <AccessProvider>
                      <FeedbackProvider>
                        <StatusBar style="dark" />
                        <ScreenTracker />
                        <RootNavigator />
                        <PayHost />
                      </FeedbackProvider>
                    </AccessProvider>
                  </ModulesProvider>
                </CategoryProvider>
              </AppProvider>
              </DemoProvider>
            </ForegroundProvider>
          </DataVersionProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </WebFrame>
  );
}

/**
 * Web only: boxes the whole app (header, tab bar, drawer, every screen) to a
 * phone-sized column and centres it, so opening the site on a wide monitor
 * still reads as a mobile app instead of a mobile layout stretched edge to
 * edge. Native builds render children untouched.
 */
function WebFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.frame, alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: layout.webAppWidth, backgroundColor: colors.ground, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

/** Keeps the `x-client-screen` header (audit trail) in step with the current route. */
function ScreenTracker() {
  const pathname = usePathname();
  useEffect(() => {
    setClientScreen(pathname);
  }, [pathname]);
  return null;
}

function RootNavigator() {
  const app = useApp();
  const category = useCategory();
  const demo = useDemo();
  const t = useT();

  if (!app.configured) return <SetupScreen />;
  // "Try the demo": choosing a demo community (from the button, from /demo, or after a demo ended) comes before any community. Choosing
  // who to be happens over the running demo community instead (below), so the screen the visitor was on is still there under it; with no
  // demo running yet ("Choose someone else" on a demo community) there is nothing to draw it over, so it takes the screen like the first step.
  if (demo.chooser === 'community' || (demo.chooser === 'person' && demo.mode === 'off')) return <DemoChooserScreen />;
  // A demo that is starting on its own (a /demo?as=family or ?persona= link, Try again) says so instead of showing another screen first.
  if (demo.starting && demo.chooser === null) return <FullScreenLoading label={t('demo.starting')} />;
  // A new install (or Settings › Switch community): choose the community first.
  if (app.needsCommunity || app.choosingCommunity) return <FindCommunityScreen />;
  if (app.booting) return <FullScreenLoading />;
  // A kind of organization this build has no layout for waits for its first answer rather than flashing another layout.
  if (!app.bootError && !category.ready) return <FullScreenLoading />;
  if (app.bootError) {
    return (
      <FullScreenError
        error={app.bootError}
        onRetry={app.retryBoot}
        secondary={{ label: demo.mode !== 'off' ? t('demo.leave') : t('community.notYours'), onPress: app.switchCommunity }}
      />
    );
  }
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
      {/* Switching community goes through the loading screen, so every screen mounts again with its data and colours. */}
      <View style={{ flex: 1 }}>
      {/* While a demo runs: "Demo · Teacher · 1 h 42 min left · Leave the demo", over every screen. */}
      <DemoBanner />
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
        <Stack.Screen name="join/[code]" />
        <Stack.Screen name="e/[id]" />
        <Stack.Screen name="demo" />
      </Stack>
      {/* "Be someone in the demo" / "Switch person": the demo people over the running demo, which keeps its place under them. */}
      {demo.chooser === 'person' ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <DemoChooserScreen />
        </View>
      ) : null}
      {/* A flyer's QR link that switched community opens again once the navigator is back. */}
      <ReopenEventLink />
      {/* The legal step (#20) covers the app until the member's answers are recorded; the
          navigation underneath keeps its place, so onboarding continues where it was. */}
      {signedIn && linked ? <LegalGate /> : null}
      {app.sandbox ? <SandboxWatermark /> : null}
      {/* The usage logger (screens and a few steps; opt-out in Settings › Privacy) and its first-run notice: nothing is recorded until the
          community's recording is on and the notice has been seen. Inside the lock, so nothing shows over a locked app. */}
      <ActivityRecorder />
      </View>
    </BiometricGate>
  );
}

/** Over the app: loading, an error with retry, or the documents to answer. */
function LegalGate() {
  const app = useApp();
  const t = useT();
  const cover = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
  if (app.legalError) {
    return (
      <View style={cover}>
        <FullScreenError
          error={app.legalError}
          onRetry={app.retryLegal}
          secondary={{
            label: t('lock.signOut'),
            onPress: () => {
              app.signOut().catch((err: unknown) => logError('signing out after the legal step failed to load', err));
            },
          }}
        />
      </View>
    );
  }
  if (app.legalPending === null) {
    return (
      <View style={cover}>
        <FullScreenLoading label={t('legal.loading')} />
      </View>
    );
  }
  if (app.legalPending.length === 0) return null;
  return (
    <View style={cover}>
      <LegalStepScreen key={app.legalPending.map((d) => d.documentId).join(',')} docs={app.legalPending} />
    </View>
  );
}

/** "Sandbox · test data" over every screen of a sandbox community (never blocks a tap). */
function SandboxWatermark() {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      testID="sandbox-watermark"
      style={{
        position: 'absolute',
        top: insets.top + 2,
        alignSelf: 'center',
        paddingHorizontal: 10,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: colors.brownTint,
        borderWidth: 1,
        borderColor: colors.brownBorder,
        opacity: 0.95,
      }}>
      <Txt variant="badge" color="brownDark">
        {t('community.watermark')}
      </Txt>
    </View>
  );
}
