import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Row, Txt, VStack } from '@/components/ui';
import { announce, focusSoon, webLiveRegion } from '@/features/gyan/a11y';
import type { HotspotSpot } from '@/features/gyan/activity';
import { PointsBurst } from '@/features/gyan/confetti';
import { SpotPicture } from '@/features/gyan/hotspot';
import { freshPractice, practiceLook, practiceScore, practiceSuccess, practiceTap, type PracticeState } from '@/features/gyan/hotspot-logic';
import { FeedbackNote, type Feedback } from '@/features/gyan/lesson-frame';
import { haptic, useReduceMotion, useShake } from '@/features/gyan/motion';
import type { Burst } from '@/features/gyan/step-types';
import { TryResult, usePracticeTries, type TryState } from '@/features/gyan/tries';
import { Button3D } from '@/features/gyan-ui';
import {
  askedUnsure,
  awaitLearned,
  dismissedOffer,
  findPuja,
  learnRoute,
  NAVANG_GOAL_KEY,
  NO_OFFER,
  pujaDoneNote,
  pujaTryDetail,
  showTeachOffer,
  takeLearned,
  teachOfferAppeared,
  type PujaLesson,
  type TeachOffer,
} from '@/features/puja/puja-logic';
import { loadGyan } from '@/lib/api/gyan';
import type { Center } from '@/lib/api/member';
import type { AppError } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

/**
 * Virtual puja (Home › Today › Do puja; connect://puja, /puja on the web):
 * the Navang puja of Mahavir Swami, done straight away. It is the Navang puja
 * lesson's practice step (Gyan Path, goal key "navang_puja", found by key),
 * full screen: touch the 13 places in order on the derasar photo; a wrong
 * touch shakes and the right place glows. Each completed puja is a practice
 * try (app.record_gyan_attempt: try points up to the community's daily cap).
 * It teaches only when needed: "Learn the order" is always there, and after
 * two wrong touches in a try (or "I'm not sure") it offers the learn step,
 * which comes back here when done. The photo comes straight after the intro
 * and the pinned footer stays short, so the spots stay on screen during a try.
 */
export default function PujaScreen() {
  const t = useT();
  const { center, member, setGuest } = useApp();
  const state = useLoad(
    () => (center && member ? loadGyan(center, [], { goalKey: NAVANG_GOAL_KEY }).then((d) => findPuja(d.goals)) : Promise.resolve(null)),
    [center?.id, member?.person.id],
    'load the virtual puja',
  );

  if (!member || !center) {
    return (
      <Frame>
        <Card tone="panel">
          <Txt variant="small">{t('puja.signIn')}</Txt>
          <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
        </Card>
      </Frame>
    );
  }
  if (state.data === undefined) {
    return <Frame>{state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : <LoadingState />}</Frame>;
  }
  if (state.data === null) {
    return (
      <Frame>
        {state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null}
        <EmptyState icon="flame-outline" title={t('puja.unavailable')} body={t('puja.unavailableBody')} />
      </Frame>
    );
  }
  // A new practice step (the content changed) is a fresh puja; reloads of the same one keep the try in progress.
  return <Puja key={state.data.practice.step.id} lesson={state.data} center={center} personId={member.person.id} refreshError={state.error} reload={state.reload} />;
}

/** The screen around the puja: a separate full-screen flow, like a lesson (no tab bar, no Niva button). */
function Frame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const t = useT();
  return (
    <Screen title={t('puja.title')} tabBar={false} niva={false} footer={footer}>
      <Txt variant="title" color="ink" accessibilityRole="header">
        {t('puja.heading')}
      </Txt>
      {children}
    </Screen>
  );
}

function Puja({ lesson, center, personId, refreshError, reload }: { lesson: PujaLesson; center: Center; personId: string; refreshError: AppError | null; reload: () => Promise<void> }) {
  const t = useT();
  const router = useRouter();
  const { invalidate } = useDataVersion();
  const reduce = useReduceMotion();
  const shake = useShake(reduce);
  const { practice: puja, learn } = lesson;
  const activity = puja.activity;
  const spots = activity.spots;
  const hasLearn = learn !== null;
  const [burst, setBurst] = useState<(Burst & { id: number }) | null>(null);
  const tries = usePracticeTries({
    centerId: center.id,
    personId,
    timeZone: center.time_zone,
    rules: center.rules,
    step: puja.step,
    // "+3 points" floats up gently; no confetti on a puja. The try line below says it to screen readers.
    burst: (b) => setBurst((prev) => ({ ...b, confetti: false, id: (prev?.id ?? 0) + 1 })),
    addPracticePoints: () => undefined,
    reloadLesson: () => void reload(),
  });
  const [practice, setPractice] = useState<PracticeState>(freshPractice);
  const [note, setNote] = useState<Feedback | null>(null);
  const [offer, setOffer] = useState<TeachOffer>(NO_OFFER);
  const offering = showTeachOffer(offer, practice.slips, hasLearn);
  const success = practiceSuccess(practice, activity.maxSlips);
  // A saved try may have paid points or completed the step: other screens (Home, Gyan Path) reload, as after
  // any write. Once per saved try (invalidate is a new function after each reload).
  const refreshedFor = useRef<TryState | null>(null);
  useEffect(() => {
    if (tries.state.status !== 'saved' || refreshedFor.current === tries.state) return;
    refreshedFor.current = tries.state;
    invalidate();
  }, [tries.state, invalidate]);

  const say = (text: string, ok: boolean) => {
    setNote({ text, ok, announced: true });
    announce(text); // VoiceOver and TalkBack are told here; the note is a live region only on the web
  };

  // When a pressed control gives way (I'm not sure → the offer, Do it again → a fresh try), screen readers are moved
  // to what replaced it instead of dropping to the top of the screen.
  const offerTitle = useRef<View>(null);
  const counter = useRef<View>(null);
  const [focusTo, setFocusTo] = useState<{ on: 'offer' | 'counter'; n: number } | null>(null);
  useEffect(() => (focusTo ? focusSoon(focusTo.on === 'offer' ? offerTitle : counter) : undefined), [focusTo]);
  const moveFocus = (on: 'offer' | 'counter') => setFocusTo((f) => ({ on, n: (f?.n ?? 0) + 1 }));

  // Back from the learn step: only when the member finished it does the try in progress start over (a finished
  // try stays, with Do it again); backing out of the lesson keeps the try and its hint as they were.
  const learning = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!learning.current) return;
      learning.current = false;
      const learned = takeLearned();
      if (learned === null) return;
      setPractice((p) => (p.done ? p : freshPractice()));
      setOffer(NO_OFFER);
      setNote({ text: learned, ok: true, announced: true });
      // Said once this screen is back in front: a line said during the move back would be cut off.
      const timer = setTimeout(() => announce(learned, { queue: true }), 400);
      return () => clearTimeout(timer);
    }, []),
  );

  const touchSpot = (s: HotspotSpot) => {
    const { state, outcome } = practiceTap(practice, spots, s.key);
    if (outcome === 'ignored') return;
    setPractice(state);
    if (outcome === 'wrong') {
      haptic('wrong');
      shake.shake();
      say(t('gyan.wrongSpot', { label: spots[state.next]?.label ?? '' }), false);
      if (teachOfferAppeared(offer, practice.slips, state.slips, hasLearn)) announce(t('puja.offerTitle'), { queue: true });
      return;
    }
    if (outcome === 'right') {
      haptic('tap');
      say(t('gyan.rightSpot', { label: s.label }), true);
      return;
    }
    // The 13th touch: the puja is complete, whatever is saved. The try's points line follows when it is saved.
    const done = pujaDoneNote(state.slips, activity.maxSlips);
    setNote(null);
    announce(`${t('puja.complete')} ${t(done.key, done.vars)}`);
    void tries.record({ success: practiceSuccess(state, activity.maxSlips), score: practiceScore(spots.length, state.slips), detail: pujaTryDetail(state.slips, spots.length) });
  };

  const again = () => {
    setPractice(freshPractice());
    setNote(null);
    setOffer(NO_OFFER);
    tries.reset();
    moveFocus('counter'); // "Touch 1 of 13" is read out
  };

  const unsure = () => {
    setOffer(askedUnsure());
    moveFocus('offer'); // the button gives way to the offer, whose question is read out
  };

  const openLearn = () => {
    if (!learn) return;
    // Nothing changes here yet: the try starts over only if the member finishes the learn step (see above).
    learning.current = true;
    awaitLearned();
    router.push(learnRoute(lesson.goal.id, learn));
  };

  const doneLine = pujaDoneNote(practice.slips, activity.maxSlips);
  const footer = practice.done ? (
    <VStack gap={space.md}>
      {note ? <FeedbackNote text={note.text} ok={note.ok} announced={note.announced} /> : null}
      <Completion title={t('puja.complete')} line={t(doneLine.key, doneLine.vars)} />
      <TryResult tries={tries} />
      <Button3D label={t('puja.again')} bg={colors.green} edge={colors.greenDark} disabled={tries.saving} onPress={again} />
      {offering || (!success && hasLearn) ? <Quiet label={t('puja.offerYes')} hint={t('puja.learnHint')} onPress={openLearn} center /> : null}
    </VStack>
  ) : (
    <VStack gap={space.sm}>
      {note ? <FeedbackNote text={note.text} ok={note.ok} announced={note.announced} /> : null}
      {offering ? <TeachOfferCard titleRef={offerTitle} onLearn={openLearn} onDismiss={() => setOffer(dismissedOffer())} /> : null}
      <Row gap={space.sm} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <View ref={counter} accessible>
          <Txt variant="smallStrong" color="brown">
            {t('gyan.spotOf', { n: Math.min(practice.next + 1, spots.length), total: spots.length })}
          </Txt>
        </View>
        {hasLearn && !offering ? <Quiet label={t('puja.unsure')} onPress={unsure} /> : null}
      </Row>
    </VStack>
  );

  return (
    <View style={{ flex: 1 }}>
      <Frame footer={footer}>
        <Txt variant="small" color="ink2">
          {t('puja.intro')}
        </Txt>
        {refreshError ? <ErrorState error={refreshError} onRetry={() => void reload()} /> : null}
        <Animated.View style={shake.style}>
          <SpotPicture activity={activity} look={practiceLook(practice)} onTouch={touchSpot} labelFor={(s) => t('gyan.spotPracticeA11y', { label: s.label })} order="position" />
        </Animated.View>
        {/* Below the photo, so the whole photo fits on a small phone at the start of a try. */}
        {hasLearn ? <Quiet label={t('puja.learnOrder')} hint={t('puja.learnHint')} onPress={openLearn} link /> : null}
      </Frame>
      {burst ? <PointsBurst key={burst.id} seed={burst.id * 101} label={burst.points ? t('gyan.plusPoints', { n: burst.points }) : (burst.message ?? null)} confetti={burst.confetti} /> : null}
    </View>
  );
}

/** A quiet text button or link, at least 44 points tall. */
function Quiet({ label, hint, onPress, link, center }: { label: string; hint?: string; onPress: () => void; link?: boolean; center?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={link ? 'link' : 'button'}
      accessibilityHint={hint}
      hitSlop={4}
      style={({ pressed }) => ({ minHeight: touch.min, justifyContent: 'center', alignSelf: center ? 'center' : 'flex-start', opacity: pressed ? 0.6 : 1 })}>
      <Txt variant="smallStrong" color="navy">
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * "Want to learn it step by step?" with Learn step by step / Not now. Kept
 * short (the Learn button's hint says what it shows): it sits in the pinned
 * footer, and every line there hides part of the photo.
 */
function TeachOfferCard({ titleRef, onLearn, onDismiss }: { titleRef: RefObject<View | null>; onLearn: () => void; onDismiss: () => void }) {
  const t = useT();
  return (
    <View style={{ backgroundColor: colors.navyTint, borderRadius: radii.row, paddingVertical: 10, paddingHorizontal: 14, gap: space.xs }} accessibilityLiveRegion={webLiveRegion}>
      <View ref={titleRef} accessible>
        <Txt variant="smallStrong" color="navy">
          {t('puja.offerTitle')}
        </Txt>
      </View>
      <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
        <Button label={t('puja.offerYes')} onPress={onLearn} size="sm" fill={false} accessibilityHint={t('puja.learnHint')} />
        <Quiet label={t('puja.offerNo')} onPress={onDismiss} />
      </Row>
    </View>
  );
}

/**
 * The gentle completion moment: the card fades in and settles; with Reduce
 * Motion on (or not known yet) it simply appears. Screen readers are told by
 * the touch that completed the puja (announce), browsers by the live region.
 */
function Completion({ title, line }: { title: string; line: string }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(reduce === false ? 0 : 1));
  useEffect(() => {
    if (reduce !== false) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const anim = Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [reduce, v]);
  const moving = reduce === false;
  return (
    <Animated.View
      accessibilityLiveRegion={webLiveRegion}
      style={{
        opacity: moving ? v : 1,
        transform: moving ? [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] : [],
        backgroundColor: colors.celebrateBg,
        borderWidth: 1,
        borderColor: colors.celebrateBorder,
        borderRadius: radii.xl,
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 4,
      }}>
      <Txt variant="cardTitle" color="navy">
        {title}
      </Txt>
      <Txt variant="small" color="ink2">
        {line}
      </Txt>
    </Animated.View>
  );
}
