import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Markdownish } from '@/components/markdown';
import { Banner, Txt, VStack } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

import { readActivity, type ReadCard } from './activity';
import { useActivityImage } from './images';
import { ExtrasBox, LessonFrame, StepFooter, StepTitle } from './lesson-frame';
import { haptic } from './motion';
import { stepActivity, type StepProps } from './step-types';

/**
 * Read (and practice) steps: a short deck of cards, swiped or stepped through
 * with Next. A practice step names its done button (`confirm_label`).
 */
export function ReadCards({ ctx }: StepProps) {
  const t = useT();
  const activity = readActivity(stepActivity(ctx.step));
  const cards = activity.cards;
  const [at, setAt] = useState(0);
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const last = at >= cards.length - 1;

  const go = (n: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, n));
    setAt(next);
    haptic('tap');
    scroller.current?.scrollTo({ x: next * width, animated: true });
  };
  const onSwipe = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const n = Math.round(e.nativeEvent.contentOffset.x / width);
    if (n !== at && n >= 0 && n < cards.length) setAt(n);
  };

  return (
    <LessonFrame
      frame={ctx.frame}
      answered={last}
      footer={
        <StepFooter
          label={last ? (activity.confirmLabel ?? t('learn.continue')) : t('gyan.nextCard')}
          busy={ctx.frame.saving}
          onPress={() => (last ? ctx.finish({ kind: 'step', stars: 3 }) : go(at + 1))}
          secondary={at > 0 ? { label: t('gyan.prevCard'), onPress: () => go(at - 1) } : null}
        />
      }>
      <StepTitle>{ctx.step.title || ctx.level.name}</StepTitle>
      {cards.length === 0 ? (
        <Txt variant="small" color="muted">
          {t('gyan.cardsMissing')}
        </Txt>
      ) : (
        <View onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}>
          {width > 0 ? (
            <ScrollView
              ref={scroller}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onSwipe}
              scrollEventThrottle={32}
              accessibilityRole="adjustable"
              accessibilityLabel={t('gyan.cardOf', { n: at + 1, total: cards.length })}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => go(e.nativeEvent.actionName === 'increment' ? at + 1 : at - 1)}>
              {cards.map((c, i) => (
                <View key={i} style={{ width, paddingRight: 2 }}>
                  <CardView card={c} />
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.md }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {cards.map((_, i) => (
              <View key={i} style={{ width: i === at ? 18 : 8, height: 8, borderRadius: 4, backgroundColor: i === at ? colors.saffron : colors.nodeLocked }} />
            ))}
          </View>
          <Txt variant="caption" color="muted" center style={{ marginTop: 4 }}>
            {t('gyan.cardOf', { n: at + 1, total: cards.length })}
          </Txt>
        </View>
      )}
      <ExtrasBox extras={activity} showTip={last} />
    </LessonFrame>
  );
}

function CardView({ card }: { card: ReadCard }) {
  const t = useT();
  const img = useActivityImage(card.image, t('gyan.imageMissing'));
  return (
    <VStack gap={space.md} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: 18, paddingHorizontal: 18, minHeight: 220 }}>
      {card.emoji ? (
        <Txt variant="hero" center accessibilityElementsHidden importantForAccessibility="no">
          {card.emoji}
        </Txt>
      ) : null}
      {img?.status === 'ready' ? (
        <Image source={img.source} style={{ width: '100%', aspectRatio: img.aspect ?? 4 / 3, borderRadius: radii.lg }} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : img?.status === 'loading' ? (
        <ActivityIndicator color={colors.navy} />
      ) : img?.status === 'error' ? (
        <Banner tone="error" message={img.message} action={img.retry ? { label: t('common.retry'), onPress: img.retry } : undefined} />
      ) : null}
      {card.title ? (
        <Txt variant="headline" color="navy" accessibilityRole="header">
          {card.title}
        </Txt>
      ) : null}
      {card.body ? <Markdownish source={card.body} /> : null}
    </VStack>
  );
}
