import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton, LinkText, ProgressBar, Row, Txt } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors, layout, space } from '@/theme';

export const ONBOARDING_STEPS = 5;

/** Chrome for onboarding steps 1–5: back, "Step n of 5", optional skip, progress. */
export function OnboardingFrame({
  step,
  title,
  subtitle,
  children,
  footer,
  onBack,
  onSkip,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
}) {
  const t = useT();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      {/* Onboarding.dc.html top bar: padding 16/20/8, back · "Step n of 5" · skip, 6px progress. */}
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.sm, gap: 10 }}>
        <Row gap={space.md}>
          {onBack ? <IconButton glyph="back" variant="outline" label={t('common.back')} onPress={onBack} /> : <View style={{ width: 44, height: 44 }} />}
          <Txt variant="meta" color="muted" style={{ flex: 1 }}>
            {t('onboarding.stepOf', { step, total: ONBOARDING_STEPS })}
          </Txt>
          {onSkip ? <LinkText label={t('onboarding.skip')} onPress={onSkip} /> : null}
        </Row>
        <ProgressBar value={step / ONBOARDING_STEPS} color={colors.navy} track={colors.track} label={t('onboarding.stepOf', { step, total: ONBOARDING_STEPS })} />
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
