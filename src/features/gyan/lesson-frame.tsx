import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Banner, Txt, VStack } from '@/components/ui';
import { GyanHeaderChips } from '@/features/gyan-header';
import { Button3D } from '@/features/gyan-ui';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import type { ActivityExtras } from './activity';
import type { FrameInfo } from './step-types';

/**
 * The lesson screen around one step (GyanPath.dc.html L98–164): header chips,
 * progress bar "n / total", the kind label, the step's body and its footer.
 * Each step renderer draws its own body and footer inside this frame.
 */
export function LessonFrame({ frame, answered, footer, children }: { frame: FrameInfo; answered: boolean; footer: ReactNode; children: ReactNode }) {
  const t = useT();
  const pct = Math.min(1, (frame.index + (answered ? 1 : 0)) / Math.max(1, frame.total));
  return (
    <Screen
      title={frame.title}
      tabBar={false}
      niva={false}
      scroll={false}
      headerRight={<GyanHeaderChips />}
      contentStyle={{ flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 }}
      footer={
        <VStack gap={space.md}>
          {frame.saveError ? <Banner tone="error" message={frame.saveError} /> : null}
          {footer}
        </VStack>
      }>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: 4, paddingBottom: space.xl, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }} style={{ height: 12, borderRadius: 6, backgroundColor: colors.frame, overflow: 'hidden' }}>
              <View style={{ width: `${pct * 100}%`, height: 12, borderRadius: 6, backgroundColor: colors.green }} />
            </View>
          </View>
          <Txt variant="meta" color="muted" style={{ fontFamily: fonts.bodyBold }}>
            {t('learn.stepCount', { n: frame.index + 1, total: frame.total })}
          </Txt>
        </View>
        <Txt variant="eyebrow" color="brown">
          {frame.kindLabel}
        </Txt>
        {children}
      </ScrollView>
    </Screen>
  );
}

export type PrimaryTone = 'go' | 'check' | 'skip';

/** Footer: optional feedback line, the 3D primary button and an optional note or secondary link. */
export function StepFooter({
  feedback,
  label,
  onPress,
  tone = 'go',
  disabled,
  busy,
  note,
  secondary,
}: {
  feedback?: { text: string; ok: boolean } | null;
  label: string;
  onPress: () => void;
  tone?: PrimaryTone;
  disabled?: boolean;
  busy?: boolean;
  note?: string | null;
  secondary?: { label: string; onPress: () => void } | null;
}) {
  const t = useT();
  const off = disabled && tone !== 'skip';
  const bg = off ? colors.checkGrey : tone === 'check' ? colors.saffron : tone === 'skip' ? colors.navyDisabled : colors.green;
  const edge = off ? colors.checkGreyShadow : tone === 'check' ? colors.brown : tone === 'skip' ? colors.skipShadow : colors.greenDark;
  return (
    <VStack gap={space.md}>
      {feedback ? <FeedbackNote text={feedback.text} ok={feedback.ok} /> : null}
      <Button3D label={busy ? t('learn.saving') : label} bg={bg} edge={edge} disabled={disabled} busy={busy} onPress={onPress} />
      {secondary ? (
        <Pressable onPress={secondary.onPress} accessibilityRole="button" style={({ pressed }) => ({ minHeight: touch.min, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Txt variant="smallStrong" color="navy">
            {secondary.label}
          </Txt>
        </Pressable>
      ) : null}
      {note ? (
        <Txt variant="caption" color="muted" center>
          {note}
        </Txt>
      ) : null}
    </VStack>
  );
}

export function FeedbackNote({ text, ok }: { text: string; ok: boolean }) {
  return (
    <View style={{ borderRadius: radii.row, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: ok ? colors.greenTint : colors.dangerTint }} accessibilityLiveRegion="polite">
      <Txt variant="smallStrong" color={ok ? 'greenDark' : 'wrongInk'}>
        {text}
      </Txt>
    </View>
  );
}

export function StepTitle({ children }: { children: string }) {
  return (
    <Txt variant="title" color="ink" accessibilityRole="header">
      {children}
    </Txt>
  );
}

/** "Why" after a question is answered (quiz `explain`). */
export function ExplainBox({ text }: { text: string | null }) {
  const t = useT();
  if (!text) return null;
  return (
    <View style={{ backgroundColor: colors.navyTint, borderRadius: radii.row, paddingVertical: 12, paddingHorizontal: 14, gap: 4 }} accessibilityLiveRegion="polite">
      <Txt variant="eyebrow" color="navy">
        {t('gyan.why')}
      </Txt>
      <Txt variant="small" color="ink2">
        {text}
      </Txt>
    </View>
  );
}

/**
 * Tip and fun fact that any activity may carry. The Pathshala review flag
 * (`review: needs_pathshala_review`) is for the office, never shown to members.
 */
export function ExtrasBox({ extras, showTip = true }: { extras: ActivityExtras; showTip?: boolean }) {
  const t = useT();
  return (
    <>
      {showTip && extras.tip ? (
        <View style={{ backgroundColor: colors.celebrateBg, borderWidth: 1, borderColor: colors.celebrateBorder, borderRadius: radii.row, paddingVertical: 12, paddingHorizontal: 14, gap: 4 }}>
          <Txt variant="eyebrow" color="brown">
            {t('gyan.tip')}
          </Txt>
          <Txt variant="small" color="ink2">
            {extras.tip}
          </Txt>
        </View>
      ) : null}
      {showTip && extras.funFact ? (
        <View style={{ backgroundColor: colors.purpleTint, borderRadius: radii.row, paddingVertical: 12, paddingHorizontal: 14, gap: 4 }}>
          <Txt variant="eyebrow" color="purple">
            {t('gyan.funFact')}
          </Txt>
          <Txt variant="small" color="ink2">
            {extras.funFact}
          </Txt>
        </View>
      ) : null}
    </>
  );
}

/** A big answer option (quiz choice, true/false, fill): navy when picked, green right, red wrong. */
export function OptionCard({
  label,
  picked,
  state,
  disabled,
  onPress,
  a11yLabel,
}: {
  label: string;
  picked: boolean;
  state: 'idle' | 'right' | 'wrong' | 'ruledOut';
  disabled?: boolean;
  onPress: () => void;
  a11yLabel?: string;
}) {
  const t = useT();
  const border = state === 'right' ? colors.green : state === 'wrong' ? colors.danger : picked ? colors.navy : colors.borderInput;
  const fill = state === 'right' ? colors.greenTint : state === 'wrong' ? colors.dangerTint : state === 'ruledOut' ? colors.panel : picked ? colors.navyTint : colors.card;
  const suffix = state === 'right' ? `, ${t('learn.correctAnswer')}` : state === 'wrong' || state === 'ruledOut' ? `, ${t('learn.wrongAnswer')}` : '';
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: picked, disabled: !!disabled }}
      accessibilityLabel={`${a11yLabel ?? label}${suffix}`}
      style={{ borderRadius: radii.row, backgroundColor: border, paddingBottom: 4, opacity: state === 'ruledOut' ? 0.6 : 1 }}>
      <View style={{ minHeight: 60, borderRadius: radii.row, borderWidth: 2, borderColor: border, backgroundColor: fill, paddingVertical: 10, paddingHorizontal: 14, justifyContent: 'center' }}>
        <Txt variant="bodyStrong" color="ink" style={state === 'ruledOut' ? { textDecorationLine: 'line-through' } : null}>
          {label}
        </Txt>
      </View>
    </Pressable>
  );
}
