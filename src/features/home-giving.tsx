import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { PanResponder, Platform, View, type AccessibilityActionEvent, type ViewProps } from 'react-native';

import { ErrorState } from '@/components/states';
import { Card, IconButton, Row, Txt } from '@/components/ui';
import { useReduceMotion } from '@/features/gyan/motion';
import { listOpportunities } from '@/lib/api/giving';
import { formatCents } from '@/lib/format';
import { isSidewaysDrag, keyStep, ROTATE_MS, shouldAutoAdvance, swipeStep, wrapIndex } from '@/lib/rotation';
import { useLoad } from '@/lib/use-load';
import { useScreenReader } from '@/lib/use-screen-reader';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, space } from '@/theme';

import { PillButton } from './home';
import { givingSlides, type GivingSlide } from './home-rules';

const isWeb = Platform.OS === 'web';

/** Page dots up to this many opportunities; past it they would not fit a 320 px phone, so the card says "3 of 14" instead. */
const MAX_DOTS = 8;

/**
 * Home "Giving": every open opportunity, one at a time (home-rules
 * givingSlides). Loads on its own; a failure shows in plain English with
 * Try again. Hidden when nothing is open.
 */
export function GivingCard() {
  const { center } = useApp();
  const state = useLoad(() => (center ? listOpportunities(center.id) : Promise.resolve([])), [center?.id], 'load giving opportunities');
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  const slides = givingSlides(state.data);
  if (slides.length === 0) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null;
  return (
    <>
      {state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null}
      <GivingRotator slides={slides} />
    </>
  );
}

/**
 * The rotating card. It moves on every 6 seconds (src/lib/rotation.ts) and
 * stops while a finger, the mouse or the keyboard focus is on it, while Home
 * is behind another screen, with Reduce Motion on, and with VoiceOver or
 * TalkBack on. The pause button stops it for as long as the person wants
 * (WCAG 2.2.2), which also covers a web screen reader the app cannot detect.
 * It can always be moved by hand: swipe sideways, the ‹ › buttons, the arrow
 * keys on the web, and the screen reader's adjust gesture (swipe up or down
 * on the card). The card keeps the height of its tallest opportunity so the
 * cards below it never jump, and its buttons stay the same elements from one
 * opportunity to the next, so keyboard and screen-reader focus is never lost.
 */
function GivingRotator({ slides }: { slides: GivingSlide[] }) {
  const t = useT();
  const router = useRouter();
  const n = slides.length;
  // Counts every move; the slide shown is this wrapped to the list (so a shorter list after a refresh still lands on one).
  const [pos, setPos] = useState(0);
  const [touching, setTouching] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReduceMotion();
  const screenReader = useScreenReader();
  const screenFocused = useIsFocused();
  const at = wrapIndex(pos, n);
  const auto = shouldAutoAdvance({ count: n, held: touching || hovering || focusWithin || paused, screenFocused, reduceMotion, screenReader });
  // The pause button is offered only where the card would move by itself; with Reduce Motion or a screen reader on it never does.
  const canPause = n > 1 && reduceMotion === false && screenReader === false;

  // One timer per slide: moving by hand starts the full 6 seconds again.
  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(() => setPos((p) => p + 1), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [auto, at]);

  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => isSidewaysDrag(g.dx, g.dy),
      onPanResponderGrant: () => setTouching(true),
      // Once the card has the swipe, the page does not take it back half way.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_e, g) => {
        const step = swipeStep(g.dx, g.dy);
        if (step !== 0) setPos((p) => p + step);
        setTouching(false);
      },
      onPanResponderTerminate: () => setTouching(false),
    }),
  );

  const move = (step: -1 | 1) => setPos((p) => p + step);
  const slide = slides[at];
  const subOf = (s: GivingSlide) => [s.campaignName, s.fromCents ? t('give.from', { amount: formatCents(s.fromCents) }) : t('give.anyAmount')].filter(Boolean).join(' · ');
  const open = (s: GivingSlide) => router.push({ pathname: '/opportunity/[id]', params: { id: s.opportunityId } });

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') move(1);
    else if (e.nativeEvent.actionName === 'decrement') move(-1);
    else if (e.nativeEvent.actionName === 'activate' && slide) open(slide);
  };

  // Web: the arrow keys move it while focus is inside, and the mouse or focus being on it holds it still.
  const webProps = (
    isWeb
      ? {
          role: 'region',
          'aria-label': t('home.givingRegion'),
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            const step = keyStep(e.key);
            if (step === 0 || n < 2) return;
            e.preventDefault();
            move(step);
          },
          onFocus: () => setFocusWithin(true),
          onBlur: () => setFocusWithin(false),
          onPointerEnter: () => setHovering(true),
          onPointerLeave: () => setHovering(false),
        }
      : {}
  ) as unknown as ViewProps;

  if (!slide) return null;
  const many = n > 1;
  const position = t('home.givingPosition', { n: at + 1, total: n });

  return (
    <View {...webProps} onTouchStart={() => setTouching(true)} onTouchEnd={() => setTouching(false)} onTouchCancel={() => setTouching(false)}>
      <Card hero tone="amber">
        <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
          <Txt variant="eyebrow" color="brown" style={{ fontFamily: fonts.bodySemi, letterSpacing: 0.48, flex: 1 }}>
            {many ? t('home.givingEyebrow') : t('home.newOpportunity')}
          </Txt>
          {many ? (
            <Row gap={space.xs}>
              {canPause ? (
                <IconButton
                  icon={paused ? 'play' : 'pause'}
                  label={paused ? t('home.givingPlay') : t('home.givingPause')}
                  variant="outline"
                  size={36}
                  iconSize={16}
                  color={colors.brown}
                  onPress={() => setPaused((p) => !p)}
                />
              ) : null}
              <IconButton icon="chevron-back" label={t('home.givingPrev')} variant="outline" size={36} iconSize={18} color={colors.brown} onPress={() => move(-1)} />
              <IconButton icon="chevron-forward" label={t('home.givingNext')} variant="outline" size={36} iconSize={18} color={colors.brown} onPress={() => move(1)} />
            </Row>
          ) : null}
        </Row>
        <View {...pan.panHandlers} style={{ gap: space.sm }}>
          {/* Every slide is laid out in the same place (only the current one shows), so the card is as tall as the tallest. */}
          <View
            accessible={!isWeb && many}
            accessibilityRole={!isWeb && many ? 'adjustable' : undefined}
            // The label stays the same; the value names the opportunity, so adjusting reads out the new one.
            accessibilityLabel={!isWeb && many ? t('home.givingRegion') : undefined}
            accessibilityValue={!isWeb && many ? { text: t('home.givingSlideValue', { position, title: slide.title, detail: subOf(slide) }) } : undefined}
            accessibilityHint={!isWeb && many ? t('home.givingHint') : undefined}
            accessibilityActions={!isWeb && many ? [{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }] : undefined}
            onAccessibilityAction={!isWeb && many ? onAccessibilityAction : undefined}
            // Web: the change is read out only when it was asked for (never while it moves on by itself).
            aria-live={isWeb && many ? (auto ? 'off' : 'polite') : undefined}
            style={{ flexDirection: 'row' }}>
            {slides.map((s, i) => {
              const current = i === at;
              return (
                <View
                  key={s.key}
                  aria-hidden={!current}
                  accessibilityElementsHidden={!current}
                  importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
                  style={{ width: '100%', marginRight: i < n - 1 ? '-100%' : 0, opacity: current ? 1 : 0, pointerEvents: current ? 'auto' : 'none', gap: space.sm }}>
                  <Txt variant="headline">{s.title}</Txt>
                  <Txt variant="small" color="brownText">
                    {subOf(s)}
                  </Txt>
                </View>
              );
            })}
          </View>
          {/* One button for whichever opportunity is showing: it is never removed as the card moves, so focus on it stays put. */}
          <PillButton label={t('home.viewAndSponsor')} a11yLabel={t('home.viewAndSponsorA11y', { title: slide.title })} tone="brown" onPress={() => open(slide)} />
        </View>
        {many && n <= MAX_DOTS ? (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: space.xxs }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
            {slides.map((s, i) => (
              <View key={s.key} style={{ width: i === at ? 18 : 8, height: 8, borderRadius: 4, backgroundColor: i === at ? colors.brown : colors.brownBorder }} />
            ))}
          </View>
        ) : null}
        {many && n > MAX_DOTS ? (
          // Too many for dots: "3 of 14" (screen readers hear the position in the card's value instead).
          <Txt variant="caption" color="brownText" center accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ paddingTop: space.xxs }}>
            {position}
          </Txt>
        ) : null}
      </Card>
    </View>
  );
}
