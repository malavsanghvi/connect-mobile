import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Markdownish } from '@/components/markdown';
import { Banner, Txt, VStack } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

import { announceIos } from './a11y';
import { readActivity, type ReadCard } from './activity';
import { useActivityImage, usePictureRetry } from './images';
import { ExtrasBox, LessonFrame, StepFooter, StepTitle, useBrokenContentLog } from './lesson-frame';
import { haptic, useReduceMotion } from './motion';
import { BROKEN_STEP_STARS, stepActivity, type StepProps } from './step-types';

/** How long a Next/Back scroll may take before swipes are followed again. */
const SCROLL_SETTLE_MS = 700;

/**
 * Read (and practice) steps: a short deck of cards, swiped or stepped through
 * with Next. A practice step names its done button (`confirm_label`). The
 * current card follows every scroll (the web has no momentum events), and
 * screen readers read only the current card; Next and Back step through.
 */
export function ReadCards({ ctx }: StepProps) {
  const t = useT();
  const reduce = useReduceMotion();
  const activity = readActivity(stepActivity(ctx.step));
  const cards = activity.cards;
  const [at, setAt] = useState(0);
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  // The card a Next/Back scroll is heading for: scroll events on the way there don't move the dots back.
  const heading = useRef<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = at >= cards.length - 1;
  useBrokenContentLog(cards.length === 0, ctx.step, 'no cards it can show');

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const go = (n: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, n));
    setAt(next);
    haptic('tap');
    heading.current = next;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      heading.current = null;
    }, SCROLL_SETTLE_MS);
    scroller.current?.scrollTo({ x: next * width, animated: reduce === false });
    const card = cards[next];
    announceIos([t('gyan.cardOf', { n: next + 1, total: cards.length }), card?.title].filter(Boolean).join('. '));
  };
  const onScrolled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const n = Math.round(e.nativeEvent.contentOffset.x / width);
    if (n < 0 || n >= cards.length) return;
    if (heading.current !== null) {
      if (n === heading.current) heading.current = null;
      return;
    }
    if (n !== at) setAt(n);
  };

  return (
    <LessonFrame
      frame={ctx.frame}
      answered={last}
      footer={
        <StepFooter
          label={last ? (activity.confirmLabel ?? t('learn.continue')) : t('gyan.nextCard')}
          busy={ctx.frame.saving}
          onPress={() => (last ? ctx.finish({ kind: 'step', stars: cards.length === 0 ? BROKEN_STEP_STARS : 3 }) : go(at + 1))}
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
            <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScrolled} onMomentumScrollEnd={onScrolled} scrollEventThrottle={32}>
              {cards.map((c, i) => (
                // Only the current card is read out; the others are off screen.
                <View key={i} style={{ width, paddingRight: 2 }} aria-hidden={i !== at}>
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
          <Txt variant="caption" color="muted" center style={{ marginTop: 4 }} accessibilityLiveRegion="polite">
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
  const picture = usePictureRetry(img);
  return (
    <VStack gap={space.md} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: 18, paddingHorizontal: 18, minHeight: 220 }}>
      {card.emoji ? (
        <Txt variant="hero" center accessibilityElementsHidden importantForAccessibility="no">
          {card.emoji}
        </Txt>
      ) : null}
      {img?.status === 'ready' && picture.failed ? (
        // Retry gets a storage picture a new link first, then loads it again.
        picture.renewing ? (
          <ActivityIndicator color={colors.navy} />
        ) : (
          <Banner tone="error" message={t('gyan.imageFailed')} action={{ label: t('common.retry'), onPress: picture.retry }} />
        )
      ) : img?.status === 'ready' ? (
        <Image key={picture.attempt} source={img.source} style={{ width: '100%', aspectRatio: img.aspect ?? 4 / 3, borderRadius: radii.lg }} contentFit="cover" accessibilityIgnoresInvertColors onError={picture.onError} />
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
