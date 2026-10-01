import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, IconButton, LinkText, ProgressBar, Row, Txt } from '@/components/ui';
import { useApp } from '@/providers/app';
import { useModule } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, layout, space } from '@/theme';

import { onboardingProgress, type OnboardingStep } from './steps';

/**
 * Chrome for the onboarding steps: back, optional skip, and a progress bar along the steps this person walks (a
 * child's shorter path fills it in even steps too). No "Step n of N" text: the bar alone says how far along.
 */
export function OnboardingFrame({
  step,
  title,
  subtitle,
  children,
  footer,
  onBack,
  onSkip,
}: {
  step: OnboardingStep;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
}) {
  const t = useT();
  const { member, onboardingPreview, setOnboarding } = useApp();
  const commsOn = useModule('comms');
  // Before the login is linked (sign-in, family match) nobody knows yet whether a child is signing up.
  const progress = onboardingProgress(step, { isAdult: member ? member.isAdult : null, commsOn });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      {/* Onboarding.dc.html top bar: padding 16/20/8, back · skip, 6px progress (the "Step n of N" label is gone). */}
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.sm, gap: 10 }}>
        <Row gap={space.md} style={{ justifyContent: 'space-between' }}>
          {onBack ? <IconButton glyph="back" variant="outline" label={t('common.back')} onPress={onBack} /> : <View style={{ width: 44, height: 44 }} />}
          {onSkip ? <LinkText label={t('onboarding.skip')} onPress={onSkip} /> : null}
        </Row>
        <ProgressBar value={progress} color={colors.navy} track={colors.track} label={t('onboarding.progress', { pct: Math.round(progress * 100) })} />
        {onboardingPreview ? <Banner tone="info" message={t('preview.banner')} action={{ label: t('preview.exit'), onPress: () => setOnboarding(false) }} /> : null}
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: space.xxl }}>
          <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', gap: space.lg }}>
            <View style={{ gap: space.sm }}>
              <Txt variant="display" accessibilityRole="header">
                {title}
              </Txt>
              {subtitle ? (
                <Txt variant="body" color="muted">
                  {subtitle}
                </Txt>
              ) : null}
            </View>
            {children}
          </View>
        </ScrollView>
        {footer ? (
          <View style={{ padding: space.gutter, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.ground }}>
            <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', gap: space.sm }}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
