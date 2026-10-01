import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Animated, Pressable, View, type LayoutChangeEvent } from 'react-native';

import { Banner, Txt, VStack } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

import { hotspotActivity, type HotspotActivity, type HotspotSpot } from './activity';
import { freshPractice, practiceScore, practiceSuccess, practiceTap, spotBox, spotProgress, type PracticeState } from './hotspot-logic';
import { useActivityImage } from './images';
import { ExtrasBox, LessonFrame, StepFooter, StepTitle } from './lesson-frame';
import { haptic, usePulse, useReduceMotion, useShake } from './motion';
import { stepActivity, type StepProps } from './step-types';
import { TriesCounter, TryResult, usePracticeTries } from './tries';

const DEFAULT_ASPECT = 3 / 4;
const MAX_IMAGE_HEIGHT = 560;

type SpotLook = 'glow' | 'done' | 'plain' | 'hidden';

/**
 * Hotspot (Navang puja): a picture with spots at fractional x / y.
 * Learn: one glowing spot at a time with what to do and why; touch it to go on.
 * Practice: touch every spot in order; a wrong touch shakes and the right spot
 * glows; each finished try is recorded (points up to the daily cap), as many
 * tries as you like.
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
  const progress = current ? spotProgress(spots, at) : null;

  const touch = (s: HotspotSpot) => {
    if (s.key !== current?.key) return;
    haptic(at + 1 >= spots.length ? 'right' : 'tap');
    setAt(at + 1);
  };
  const look = (s: HotspotSpot, i: number): SpotLook => (i < at ? 'done' : i === at ? 'glow' : 'hidden');

  return (
    <LessonFrame
      frame={ctx.frame}
      answered={learned}
      footer={
        <StepFooter
          feedback={learned ? { text: t('gyan.learnedAll', { n: spots.length }), ok: true } : null}
          label={learned || spots.length === 0 ? t('learn.continue') : t('gyan.touchGlowing')}
          disabled={!learned && spots.length > 0}
          busy={ctx.frame.saving}
          onPress={() => ctx.finish({ kind: 'step', stars: 3 })}
        />
      }>
      <StepTitle>{ctx.step.title || ctx.level.name}</StepTitle>
      <Intro text={activity.intro ?? t('gyan.learnIntro')} />
      {current && progress ? (
        <VStack gap={4} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: 12, paddingHorizontal: 14 }}>
          <Txt variant="eyebrow" color="brown" accessibilityLiveRegion="polite">
            {progress.kind === 'puja' ? `${t('gyan.pujaOf', { n: progress.n, total: progress.total })} · ${t('gyan.spotOf', { n: at + 1, total: spots.length })}` : t('gyan.spotOf', { n: progress.n, total: progress.total })}
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
      <SpotImage activity={activity} look={look} onTouch={touch} labelFor={(s, i) => t('gyan.spotA11y', { label: s.label, n: i + 1, total: spots.length })} />
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
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [finished, setFinished] = useState(false); // at least one try finished

  const touch = (s: HotspotSpot) => {
    if (tries.saving) return;
    const { state, outcome } = practiceTap(practice, spots, s.key);
    if (outcome === 'ignored') return;
    setPractice(state);
    if (outcome === 'wrong') {
      haptic('wrong');
      shake.shake();
      const want = spots[state.next];
      setNote({ text: t('gyan.wrongSpot', { label: want?.label ?? '' }), ok: false });
      return;
    }
    if (outcome === 'right') {
      haptic('tap');
      setNote({ text: t('gyan.rightSpot', { label: s.label }), ok: true });
      return;
    }
    // done: one finished try
    const success = practiceSuccess(state, activity.maxSlips);
    setFinished(true);
    setNote({
      text: state.slips === 0 ? t('gyan.tryClean') : success ? t('gyan.trySlips', { n: state.slips }) : t('gyan.tryTooMany', { n: state.slips, max: activity.maxSlips }),
      ok: success,
    });
    void tries.record({ success, score: practiceScore(spots.length, state.slips), detail: { mode: 'practice', slips: state.slips, spots: spots.length } });
  };
  const again = () => {
    setPractice(freshPractice());
    setNote(null);
    tries.reset();
  };
  const look = (s: HotspotSpot, i: number): SpotLook => (i < practice.next ? 'done' : practice.hint === s.key ? 'glow' : 'plain');

  return (
    <LessonFrame
      frame={ctx.frame}
      answered={finished}
      footer={
        <StepFooter
          feedback={note}
          label={finished || spots.length === 0 ? t('learn.continue') : t('gyan.spotOf', { n: Math.min(practice.next + 1, spots.length), total: spots.length })}
          disabled={(!finished && spots.length > 0) || tries.saving}
          busy={ctx.frame.saving}
          onPress={() => ctx.finish({ kind: 'step', stars: tries.savedStars ?? 1, savedByTry: tries.savedSuccess })}
          secondary={practice.done && !tries.saving ? { label: t('gyan.practiceAgain'), onPress: again } : null}
        />
      }>
      <StepTitle>{ctx.step.title || ctx.level.name}</StepTitle>
      <TriesCounter tries={tries} />
      <Intro text={activity.intro ?? t('gyan.practiceIntro')} />
      <TryResult tries={tries} />
      <Animated.View style={shake.style}>
        <SpotImage activity={activity} look={look} onTouch={touch} labelFor={(s) => t('gyan.spotPracticeA11y', { label: s.label })} />
      </Animated.View>
      <ExtrasBox extras={activity} showTip={finished} />
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

/** The picture with its spots, sized to the picture's own shape so fractions land where they should. */
function SpotImage({ activity, look, onTouch, labelFor }: { activity: HotspotActivity; look: (s: HotspotSpot, i: number) => SpotLook; onTouch: (s: HotspotSpot) => void; labelFor: (s: HotspotSpot, i: number) => string }) {
  const t = useT();
  const reduce = useReduceMotion();
  const img = useActivityImage(activity.image, t('gyan.imageMissing'));
  const [box, setBox] = useState(0);
  const [loadedAspect, setLoadedAspect] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const anyGlow = activity.spots.some((s, i) => look(s, i) === 'glow');
  const pulse = usePulse(anyGlow, reduce);

  const aspect = loadedAspect ?? (img?.status === 'ready' ? img.aspect : null) ?? activity.aspect ?? DEFAULT_ASPECT;
  const width = Math.min(box, MAX_IMAGE_HEIGHT * aspect);
  const height = width / aspect;

  if (!img) return <Banner tone="info" message={t('gyan.pictureNotAdded')} />;
  if (img.status === 'error') return <Banner tone="error" message={img.message} action={img.retry ? { label: t('common.retry'), onPress: img.retry } : undefined} />;
  if (failed) {
    return (
      <Banner
        tone="error"
        message={t('gyan.imageFailed')}
        action={{
          label: t('common.retry'),
          onPress: () => {
            setFailed(false);
            setAttempt(attempt + 1);
          },
        }}
      />
    );
  }

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
            onError={() => setFailed(true)}
          />
          {activity.spots.map((s, i) => {
            const l = look(s, i);
            if (l === 'hidden') return null;
            const { cx, cy, radius } = spotBox(s, width, height);
            const dot = l === 'glow' ? 30 : 22;
            return (
              <Pressable
                key={s.key}
                onPress={() => onTouch(s)}
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
        </View>
      ) : (
        <View style={{ height: 200, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.navy} />
        </View>
      )}
      {img.status === 'ready' && img.placeholder ? (
        <Txt variant="caption" color="faint" center style={{ marginTop: space.xs }}>
          {t('gyan.imagePlaceholder')}
        </Txt>
      ) : null}
    </View>
  );
}
