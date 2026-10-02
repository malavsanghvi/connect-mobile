import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Animated, Pressable, View, type LayoutChangeEvent } from 'react-native';

import { Banner, Txt, VStack } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch as touchSize } from '@/theme';

import { announce } from './a11y';
import { hotspotActivity, type HotspotActivity, type HotspotSpot } from './activity';
import {
  freshPractice,
  hitSpot,
  learnLook,
  practiceLook,
  practiceNote,
  practiceScore,
  practiceSuccess,
  practiceTap,
  spatialOrder,
  spotBox,
  spotProgress,
  tapPoint,
  tapTargets,
  type PracticeState,
  type SpotLook,
} from './hotspot-logic';
import { useActivityImage, usePictureRetry, type ResolvedImage } from './images';
import { ExtrasBox, LessonFrame, StepFooter, StepTitle, useBrokenContentLog } from './lesson-frame';
import { haptic, usePulse, useReduceMotion, useShake } from './motion';
import { scoreStars } from './points';
import { BROKEN_STEP_STARS, stepActivity, type StepProps } from './step-types';
import { TriesCounter, TryResult, usePracticeTries } from './tries';

const DEFAULT_ASPECT = 3 / 4;
const MAX_IMAGE_HEIGHT = 560;

/** What the picture (or, without one, the list) needs from a mode. */
export type SpotsProps = {
  activity: HotspotActivity;
  look: (s: HotspotSpot, i: number) => SpotLook;
  onTouch: (s: HotspotSpot) => void;
  labelFor: (s: HotspotSpot, i: number) => string;
  /** Screen-reader (and list) order: the tap order to learn it, positions on the picture to practise it. */
  order: 'tap' | 'position';
};

/**
 * Hotspot (Navang puja): a picture with spots at fractional x / y.
 * Learn: one glowing spot at a time with what to do and why; touch it to go on.
 * Practice: touch every spot in order; a wrong touch shakes and the right spot
 * glows; each finished try is recorded (points up to the daily cap), as many
 * tries as you like. A try with at most `max_slips` wrong touches completes
 * the step; until one does, the step can't be finished.
 */
export function HotspotStep({ ctx }: StepProps) {
  const activity = hotspotActivity(stepActivity(ctx.step));
  return activity.mode === 'practice' ? <PracticeMode ctx={ctx} activity={activity} /> : <LearnMode ctx={ctx} activity={activity} />;
}

function LearnMode({ ctx, activity }: StepProps & { activity: HotspotActivity }) {
  const t = useT();
  const spots = activity.spots;
  const [at, setAt] = useState(0);
  const learned = at >= spots.length;
  const current = spots[at] ?? null;
  useBrokenContentLog(spots.length === 0, ctx.step, 'no spots it can show');

  const progressText = (index: number) => {
    const p = spotProgress(spots, index);
    return p.kind === 'puja' ? `${t('gyan.pujaOf', { n: p.n, total: p.total })} · ${t('gyan.spotOf', { n: index + 1, total: spots.length })}` : t('gyan.spotOf', { n: p.n, total: p.total });
  };

  const touch = (s: HotspotSpot) => {
    if (s.key !== current?.key) return;
    const nextIndex = at + 1;
    haptic(nextIndex >= spots.length ? 'right' : 'tap');
    setAt(nextIndex);
    const next = spots[nextIndex];
    // Say what to do next (the card isn't a live region, so every screen reader is told).
    if (next) announce([progressText(nextIndex), next.label, next.say].filter(Boolean).join('. '));
    else announce(t('gyan.learnedAll', { n: spots.length })); // the footer note then shows it (a live region only on the web)
  };
  const look = learnLook(at);

  return (
    <LessonFrame
      frame={ctx.frame}
      answered={learned}
      footer={
        <StepFooter
          feedback={learned && spots.length > 0 ? { text: t('gyan.learnedAll', { n: spots.length }), ok: true, announced: true } : null}
          label={learned || spots.length === 0 ? t('learn.continue') : t('gyan.touchGlowing')}
          disabled={!learned && spots.length > 0}
          busy={ctx.frame.saving}
          onPress={() => ctx.finish({ kind: 'step', stars: spots.length === 0 ? BROKEN_STEP_STARS : 3 })}
        />
      }>
      <StepTitle>{ctx.step.title || ctx.level.name}</StepTitle>
      <Intro text={activity.intro ?? t('gyan.learnIntro')} />
      {spots.length === 0 ? (
        <Txt variant="small" color="muted">
          {t('gyan.spotsMissing')}
        </Txt>
      ) : null}
      {current ? (
        <VStack gap={4} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: 12, paddingHorizontal: 14 }}>
          <Txt variant="eyebrow" color="brown">
            {progressText(at)}
          </Txt>
          <Txt variant="cardTitle" color="navy">
            {current.label}
          </Txt>
          {current.say ? (
            <Txt variant="small" color="ink2">
              {current.say}
            </Txt>
          ) : null}
          {current.why ? (
            <Txt variant="small" color="muted">
              {`${t('gyan.why')}: ${current.why}`}
            </Txt>
          ) : null}
        </VStack>
      ) : null}
      {spots.length > 0 ? <SpotPicture activity={activity} look={look} onTouch={touch} labelFor={(s, i) => t('gyan.spotA11y', { label: s.label, n: i + 1, total: spots.length })} order="tap" /> : null}
      <ExtrasBox extras={activity} showTip={learned} />
    </LessonFrame>
  );
}

function PracticeMode({ ctx, activity }: StepProps & { activity: HotspotActivity }) {
  const t = useT();
  const reduce = useReduceMotion();
  const shake = useShake(reduce);
  const spots = activity.spots;
  const tries = usePracticeTries(ctx);
  const [practice, setPractice] = useState<PracticeState>(freshPractice);
  const [note, setNote] = useState<{ text: string; ok: boolean; announced: true } | null>(null);
  // Best score of a good try (at most max_slips wrong touches) in this lesson; null until there is one.
  const [bestGood, setBestGood] = useState<number | null>(null);
  const [lastFailed, setLastFailed] = useState(false);
  useBrokenContentLog(spots.length === 0, ctx.step, 'no spots it can show');
  const hadGood = bestGood !== null;
  // Only a good try finishes the step (a broken step with no spots can always be finished).
  const canContinue = hadGood || spots.length === 0;

  const say = (text: string, ok: boolean) => {
    setNote({ text, ok, announced: true });
    announce(text); // VoiceOver and TalkBack are told here; the note is a live region only on the web
  };

  const touch = (s: HotspotSpot) => {
    if (tries.saving) return;
    const { state, outcome } = practiceTap(practice, spots, s.key);
    if (outcome === 'ignored') return;
    setPractice(state);
    if (outcome === 'wrong') {
      haptic('wrong');
      shake.shake();
      const want = spots[state.next];
      say(t('gyan.wrongSpot', { label: want?.label ?? '' }), false);
      return;
    }
    if (outcome === 'right') {
      haptic('tap');
      say(t('gyan.rightSpot', { label: s.label }), true);
      return;
    }
    // done: one finished try
    const success = practiceSuccess(state, activity.maxSlips);
    const score = practiceScore(spots.length, state.slips);
    if (success) setBestGood((b) => Math.max(b ?? 0, score));
    setLastFailed(!success);
    const line = practiceNote(state.slips, activity.maxSlips);
    say(t(line.key, line.vars), success);
    void tries.record({ success, score, detail: { mode: 'practice', slips: state.slips, spots: spots.length } });
  };
  const again = () => {
    setPractice(freshPractice());
    setNote(null);
    setLastFailed(false);
    tries.reset();
  };
  const finish = () =>
    ctx.finish({
      kind: 'step',
      // A saved good try already completed the step with its stars; if it couldn't be saved, the best good try's score counts.
      stars: spots.length === 0 ? BROKEN_STEP_STARS : (tries.savedStars ?? scoreStars(bestGood ?? 0)),
      savedByTry: tries.savedSuccess,
    });
  const look = practiceLook(practice);

  // A try that just failed: practising again is the main action (Continue only after a good try).
  const practiseFirst = practice.done && lastFailed;
  const footer = practiseFirst ? (
    <StepFooter feedback={note} label={t('gyan.practiceAgain')} disabled={tries.saving} onPress={again} secondary={canContinue && !tries.saving ? { label: t('learn.continue'), onPress: finish } : null} />
  ) : (
    <StepFooter
      feedback={note}
      label={canContinue ? t('learn.continue') : t('gyan.spotOf', { n: Math.min(practice.next + 1, spots.length), total: spots.length })}
      disabled={!canContinue || tries.saving}
      busy={ctx.frame.saving}
      onPress={finish}
      secondary={practice.done && !tries.saving ? { label: t('gyan.practiceAgain'), onPress: again } : null}
    />
  );

  return (
    <LessonFrame frame={ctx.frame} answered={canContinue} footer={footer}>
      <StepTitle>{ctx.step.title || ctx.level.name}</StepTitle>
      <TriesCounter tries={tries} />
      <Intro text={activity.intro ?? t('gyan.practiceIntro')} />
      {spots.length === 0 ? (
        <Txt variant="small" color="muted">
          {t('gyan.spotsMissing')}
        </Txt>
      ) : null}
      <TryResult tries={tries} />
      {spots.length > 0 ? (
        <Animated.View style={shake.style}>
          <SpotPicture activity={activity} look={look} onTouch={touch} labelFor={(s) => t('gyan.spotPracticeA11y', { label: s.label })} order="position" />
        </Animated.View>
      ) : null}
      <ExtrasBox extras={activity} showTip={hadGood} />
    </LessonFrame>
  );
}

/** The intro, first paragraph with "Read more" when it is long. */
function Intro({ text }: { text: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const shown = open ? paragraphs : paragraphs.slice(0, 1);
  return (
    <VStack gap={space.sm}>
      {shown.map((p, i) => (
        <Txt key={i} variant="small" color="ink2">
          {p}
        </Txt>
      ))}
      {paragraphs.length > 1 ? (
        <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Txt variant="smallStrong" color="navy">
            {open ? t('gyan.readLess') : t('gyan.readMore')}
          </Txt>
        </Pressable>
      ) : null}
    </VStack>
  );
}

/** The spots shown now, in screen-reader order, each with its index in tap order. */
function ordered(activity: HotspotActivity, look: SpotsProps['look'], order: SpotsProps['order']): { s: HotspotSpot; i: number }[] {
  const shown = activity.spots.map((s, i) => ({ s, i })).filter(({ s, i }) => look(s, i) !== 'hidden');
  return order === 'position' ? spatialOrder(shown) : shown;
}

/**
 * The picture with its spots, sized to the picture's own shape so fractions
 * land where they should. When the picture can't be shown (none added, not in
 * this version of the app, or it failed to load), the spots become a list of
 * buttons, so the step can still be learned and practised. The virtual puja
 * (src/app/(app)/puja.tsx) draws its picture with this too.
 */
export function SpotPicture(props: SpotsProps) {
  const t = useT();
  const img = useActivityImage(props.activity.image, t('gyan.imageMissing'));
  const picture = usePictureRetry(img);

  if (!img) {
    return (
      <VStack gap={space.md}>
        <Banner tone="info" message={t('gyan.pictureNotAdded')} />
        <SpotList {...props} />
      </VStack>
    );
  }
  if (img.status === 'error' || picture.failed) {
    const retry = img.status === 'error' ? img.retry : picture.retry;
    return (
      <VStack gap={space.md}>
        {picture.renewing ? (
          <ActivityIndicator color={colors.navy} />
        ) : (
          <Banner tone="error" message={img.status === 'error' ? img.message : t('gyan.imageFailed')} action={retry ? { label: t('common.retry'), onPress: retry } : undefined} />
        )}
        <SpotList {...props} />
      </VStack>
    );
  }
  return <PictureWithSpots {...props} img={img} attempt={picture.attempt} onFailed={picture.onError} />;
}

function PictureWithSpots({ activity, look, onTouch, labelFor, order, img, attempt, onFailed }: SpotsProps & { img: Exclude<ResolvedImage, { status: 'error' }>; attempt: number; onFailed: () => void }) {
  const t = useT();
  const reduce = useReduceMotion();
  const [box, setBox] = useState(0);
  const [loadedAspect, setLoadedAspect] = useState<number | null>(null);
  const anyGlow = activity.spots.some((s, i) => look(s, i) === 'glow');
  const pulse = usePulse(anyGlow, reduce);

  const aspect = loadedAspect ?? (img.status === 'ready' ? img.aspect : null) ?? activity.aspect ?? DEFAULT_ASPECT;
  const width = Math.min(box, MAX_IMAGE_HEIGHT * aspect);
  const height = width / aspect;
  const shown = ordered(activity, look, order);
  // Only spots that can still respond take a touch: a touched one would swallow a tap meant for its neighbour.
  const targets = tapTargets(activity.spots, look);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setBox(Math.round(e.nativeEvent.layout.width))} style={{ alignItems: 'center' }}>
      {box > 0 && img.status === 'ready' ? (
        <View style={{ width, height, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.panel }}>
          <Image
            key={attempt}
            source={img.source}
            style={{ width, height }}
            contentFit="fill"
            accessibilityIgnoresInvertColors
            accessibilityElementsHidden
            importantForAccessibility="no"
            onLoad={(e) => {
              const { width: w, height: h } = e.source;
              if (w > 0 && h > 0 && Math.abs(w / h - aspect) > 0.01) setLoadedAspect(w / h);
            }}
            onError={onFailed}
          />
          {shown.map(({ s, i }) => {
            const l = look(s, i);
            const { cx, cy, radius } = spotBox(s, width, height);
            const dot = l === 'glow' ? 30 : 22;
            // Fingers reach the touch layer above; these are the buttons that screen readers and keyboards use.
            return (
              <Pressable
                key={s.key}
                onPress={() => onTouch(s)}
                onAccessibilityTap={() => onTouch(s)}
                accessibilityRole="button"
                accessibilityLabel={labelFor(s, i)}
                accessibilityState={{ selected: l === 'done' }}
                style={{ position: 'absolute', left: cx - radius, top: cy - radius, width: radius * 2, height: radius * 2, alignItems: 'center', justifyContent: 'center' }}>
                {l === 'glow' ? (
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      width: radius * 2,
                      height: radius * 2,
                      borderRadius: radius,
                      backgroundColor: colors.gold,
                      opacity: reduce !== false ? 0.45 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 0] }),
                      transform: reduce !== false ? [] : [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.35] }) }],
                    }}
                  />
                ) : null}
                <View
                  style={{
                    width: dot,
                    height: dot,
                    borderRadius: dot / 2,
                    borderWidth: l === 'plain' ? 2 : 3,
                    borderColor: l === 'glow' ? colors.saffron : l === 'done' ? colors.white : colors.saffron,
                    backgroundColor: l === 'glow' ? colors.gold : l === 'done' ? colors.green : colors.spotFill,
                  }}
                />
              </Pressable>
            );
          })}
          {/* One touch layer over the whole picture: of the spots still to touch, the one whose centre is nearest the finger wins, even where tap circles overlap. */}
          <Pressable
            onPress={(e) => {
              const p = tapPoint(e.nativeEvent);
              const hit = p ? hitSpot(targets, p.x, p.y, width, height) : null;
              if (hit) onTouch(hit);
            }}
            focusable={false}
            aria-hidden
            style={{ position: 'absolute', left: 0, top: 0, width, height }}
          />
        </View>
      ) : (
        <View style={{ height: 200, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.navy} />
        </View>
      )}
      {img.status === 'ready' && img.placeholder ? (
        <Txt variant="caption" color="muted" center style={{ marginTop: space.xs }}>
          {t('gyan.imagePlaceholder')}
        </Txt>
      ) : null}
    </View>
  );
}

/** The spots as buttons, for when the picture can't be shown (in reading order when practising). */
function SpotList({ activity, look, onTouch, labelFor, order }: SpotsProps) {
  const t = useT();
  return (
    <VStack gap={space.sm}>
      <Txt variant="caption" color="muted">
        {t('gyan.spotListNote')}
      </Txt>
      {ordered(activity, look, order).map(({ s, i }) => {
        const l = look(s, i);
        return (
          <Pressable
            key={s.key}
            onPress={() => onTouch(s)}
            accessibilityRole="button"
            accessibilityLabel={labelFor(s, i)}
            accessibilityState={{ selected: l === 'done' }}
            style={({ pressed }) => ({
              minHeight: touchSize.min,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderRadius: radii.row,
              borderWidth: 2,
              borderColor: l === 'glow' ? colors.saffron : l === 'done' ? colors.green : colors.borderInput,
              backgroundColor: l === 'glow' ? colors.celebrateBg : l === 'done' ? colors.greenTint : pressed ? colors.panel : colors.card,
              paddingVertical: 8,
              paddingHorizontal: 12,
            })}>
            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: l === 'done' ? colors.white : colors.saffron, backgroundColor: l === 'glow' ? colors.gold : l === 'done' ? colors.green : colors.spotFill }} />
            <Txt variant="smallStrong" color="ink" style={{ flexShrink: 1 }}>
              {s.label}
            </Txt>
          </Pressable>
        );
      })}
    </VStack>
  );
}
