import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, LinkText, Txt, VStack } from '@/components/ui';
import { clock, useInAppAudio } from '@/features/audio';
import { GyanHeaderChips } from '@/features/gyan-header';
import { Button3D, PlayGlyph, StarGlyph } from '@/features/gyan-ui';
import { pickTranslation } from '@/i18n';
import { completeStep, isLevelDone, isStepDone, loadGyan, parseQuiz, requestSignoff, uploadRecitation, type GyanData, type GyanGoal, type GyanLevel, type GyanStep } from '@/lib/api/gyan';
import { loadPointsAndStreak, type ContentItem } from '@/lib/api/jainway';
import { logError, must, report } from '@/lib/errors';
import { todayAt } from '@/lib/format';
import { accuracyPercent, communityName, levelStars, pointsEarned } from '@/lib/learning';
import { streakDisplay } from '@/lib/rules';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

type LessonScreen = { step: GyanStep; stepIndex: number; question: number | null; lastOfStep: boolean };

/** One screen per step, and one per quiz question (prototype: learn → quiz → quiz → recite). */
function lessonScreens(level: GyanLevel): LessonScreen[] {
  const out: LessonScreen[] = [];
  level.steps.forEach((step, stepIndex) => {
    const quiz = step.kind === 'quiz' ? parseQuiz(step.quiz) : [];
    if (quiz.length > 1) quiz.forEach((_, q) => out.push({ step, stepIndex, question: q, lastOfStep: q === quiz.length - 1 }));
    else out.push({ step, stepIndex, question: step.kind === 'quiz' && quiz.length === 1 ? 0 : null, lastOfStep: true });
  });
  return out;
}

/** Gyan Path lesson (GyanPath.dc.html L98–164): one step at a time, then the level-complete celebration. */
export default function GyanLevelScreen() {
  const { t } = useSettings();
  const { goalId, levelId } = useLocalSearchParams<{ goalId: string; levelId: string }>();
  const { center, member } = useApp();
  const state = useLoad(
    async () => {
      if (!center || !member) throw new Error('not signed in');
      const data = await loadGyan(center, [member.person.id]);
      const goal = data.goals.find((g) => g.id === goalId) ?? null;
      const level = goal?.levels.find((l) => l.id === levelId) ?? null;
      const ids = (level?.steps ?? []).map((s) => s.content_item_id).filter((x): x is string => !!x);
      const content = ids.length ? must(await supabase.from('content_items').select('*').in('id', ids), 'load lesson content') : [];
      return { data, goal, level, content };
    },
    [center?.id, member?.person.id, goalId, levelId],
    'load this level',
  );
  // The lesson keeps its own copy once started, so saving a step (which reloads data) doesn't restart it.
  const [snapshot, setSnapshot] = useState<typeof state.data | null>(null);
  if (state.data && (!snapshot || snapshot.level?.id !== state.data.level?.id)) setSnapshot(state.data);
  const current = snapshot ?? state.data;
  if (!current || !current.goal || !current.level || !member) {
    return (
      <Screen title={current?.goal?.name ?? t('learn.gyanPath')} tabBar={false} niva={false}>
        <Loaded state={state}>{() => <EmptyState title={t('learn.goalMissing')} />}</Loaded>
      </Screen>
    );
  }
  // Later reloads (after each saved step) only refresh the header; their errors are logged by useLoad.
  return <Lesson key={current.level.id} data={current.data} goal={current.goal} level={current.level} content={current.content} />;
}

type RunResult = { stars: Record<string, number>; correct: number; questions: number };

function Lesson({ data, goal, level, content }: { data: GyanData; goal: GyanGoal; level: GyanLevel; content: ContentItem[] }) {
  const { t, language } = useSettings();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const me = member?.person.id ?? '';
  const screens = lessonScreens(level);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [wrongInStep, setWrongInStep] = useState(0);
  const [run, setRun] = useState<RunResult>({ stars: {}, correct: 0, questions: 0 });
  const [recording, setRecording] = useState<{ path: string | null; uploaded: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [alreadyDone] = useState(() => new Set(level.steps.filter((s) => isStepDone(data.progress, me, s.id)).map((s) => s.id)));
  const [wasLevelDone] = useState(() => isLevelDone(level, data.progress, me));
  const audio = useInAppAudio(t('learn.audioFailed'));
  const index = goal.levels.findIndex((l) => l.id === level.id);
  const levelAudio = level.steps.map((s) => content.find((c) => c.id === s.content_item_id)?.media_url).find((u): u is string => !!u) ?? null;

  if (done) return <Celebration data={data} goal={goal} level={level} index={index} run={run} alreadyDone={alreadyDone} wasLevelDone={wasLevelDone} />;

  const header = <GyanHeaderChips />;
  if (screens.length === 0) {
    return (
      <Screen title={goal.name} tabBar={false} niva={false} headerRight={header}>
        <EmptyState icon="hourglass-outline" title={t('learn.noSteps')} body={t('learn.noStepsBody')} />
      </Screen>
    );
  }

  const s = screens[i];
  const step = s.step;
  const item = content.find((c) => c.id === step.content_item_id) ?? null;
  const tr = item ? pickTranslation({ title: item.title, body_md: item.body_md ?? '' }, item.translations, language) : null;
  const quiz = step.kind === 'quiz' ? parseQuiz(step.quiz) : [];
  const q = s.question !== null ? quiz[s.question] : null;
  const isQuiz = step.kind === 'quiz';
  const isRecite = step.kind === 'recite';
  const answered = !isQuiz || !q || checked;
  const pct = (i + (answered ? 1 : 0)) / screens.length;

  const kindLabel = isQuiz
    ? t('learn.stepQuiz')
    : isRecite
      ? t('learn.stepRecite')
      : step.kind === 'video'
        ? t('learn.stepWatch')
        : step.kind === 'practice'
          ? t('learn.stepPractice')
          : t('learn.stepLearn', { n: index + 1 });

  const advance = async () => {
    setError(null);
    if (isQuiz && q && !checked) {
      if (pick === null) return;
      const right = pick === q.answer;
      setChecked(true);
      if (!right) setWrongInStep((w) => w + 1);
      setRun((r) => ({ ...r, correct: r.correct + (right ? 1 : 0), questions: r.questions + 1 }));
      return;
    }
    audio.stop();
    if (s.lastOfStep) {
      const stars = isQuiz ? Math.max(1, 3 - wrongInStep) : isRecite ? (recording?.uploaded ? 3 : 2) : 3;
      if (!center) return;
      setBusy(true);
      try {
        await completeStep(center.id, me, step.id, stars, data.progress, recording?.uploaded ? recording.path : null);
        invalidate();
      } catch (err) {
        setError(report(err, 'save your progress').userMessage);
        return;
      } finally {
        setBusy(false);
      }
      setRun((r) => ({ ...r, stars: { ...r.stars, [step.id]: stars } }));
      setWrongInStep(0);
      setRecording(null);
    }
    if (i + 1 >= screens.length) {
      setDone(true);
      return;
    }
    setI(i + 1);
    setPick(null);
    setChecked(false);
  };

  let primaryLabel = t('learn.continue');
  let bg: string = colors.green;
  let edge: string = colors.greenDark;
  if (isQuiz && q && !checked) {
    primaryLabel = t('learn.check');
    bg = pick === null ? colors.checkGrey : colors.saffron;
    edge = pick === null ? colors.checkGreyShadow : colors.brown;
  } else if (isRecite && !recording) {
    primaryLabel = t('learn.skipRecitation');
    bg = colors.navyDisabled;
    edge = colors.skipShadow;
  }
  if (busy) primaryLabel = t('learn.saving');

  const correct = q && checked ? pick === q.answer : null;
  const feedback =
    isQuiz && q && checked
      ? { text: correct ? t('learn.allCorrect') : t('learn.someWrong'), ok: !!correct }
      : isRecite && recording
        ? { text: recording.uploaded ? t('learn.recitationSaved') : t('learn.recitationNotSaved'), ok: recording.uploaded }
        : null;

  return (
    <Screen
      title={goal.name}
      tabBar={false}
      niva={false}
      scroll={false}
      headerRight={header}
      contentStyle={{ flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 }}
      footer={
        <VStack gap={space.md}>
          {feedback ? (
            <View style={{ borderRadius: radii.row, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: feedback.ok ? colors.greenTint : colors.dangerTint }} accessibilityLiveRegion="polite">
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: feedback.ok ? colors.greenDark : colors.wrongInk }}>{feedback.text}</Text>
            </View>
          ) : null}
          {error ? <Banner tone="error" message={error} /> : null}
          <Button3D label={primaryLabel} bg={bg} edge={edge} disabled={isQuiz && !!q && !checked && pick === null} busy={busy} onPress={() => void advance()} />
          {isRecite && !recording ? (
            <Txt variant="caption" color="muted" center>
              {t('learn.skipNote')}
            </Txt>
          ) : null}
        </VStack>
      }>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: 4, paddingBottom: space.xl, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }} style={{ height: 12, borderRadius: 6, backgroundColor: colors.frame, overflow: 'hidden' }}>
              <View style={{ width: `${pct * 100}%`, height: 12, borderRadius: 6, backgroundColor: colors.green }} />
            </View>
          </View>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted }}>{t('learn.stepCount', { n: i + 1, total: screens.length })}</Text>
        </View>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.7, color: colors.brown }}>{kindLabel.toUpperCase()}</Text>
        {audio.error ? <Banner tone="error" message={audio.error} /> : null}

        {isQuiz ? (
          q ? (
            <VStack gap={10}>
              <Text style={{ fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 28, color: colors.ink }} accessibilityRole="header">
                {q.question}
              </Text>
              {q.options.map((o, oi) => {
                const picked = pick === oi;
                const right = checked && oi === q.answer;
                const wrong = checked && picked && oi !== q.answer;
                const border = right ? colors.green : wrong ? colors.danger : picked ? colors.navy : colors.borderInput;
                return (
                  <Pressable
                    key={oi}
                    disabled={checked}
                    onPress={() => setPick(oi)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: picked, disabled: checked }}
                    accessibilityLabel={`${o}${right ? `, ${t('learn.correctAnswer')}` : wrong ? `, ${t('learn.wrongAnswer')}` : ''}`}
                    style={{ borderRadius: radii.row, backgroundColor: border, paddingBottom: 4 }}>
                    <View style={{ minHeight: 60, borderRadius: radii.row, borderWidth: 2, borderColor: border, backgroundColor: right ? colors.greenTint : wrong ? colors.dangerTint : picked ? colors.navyTint : colors.card, paddingVertical: 10, paddingHorizontal: 14, justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink }}>{o}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </VStack>
          ) : (
            <Txt variant="small" color="muted">
              {t('learn.quizMissing')}
            </Txt>
          )
        ) : isRecite ? (
          <Recite
            name={level.name}
            stepId={step.id}
            audioUrl={item?.media_url ?? levelAudio}
            audio={audio}
            recording={recording}
            onRecorded={setRecording}
            existing={data.progress}
          />
        ) : (
          <VStack gap={12}>
            <Text style={{ fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 31, color: colors.ink }} accessibilityRole="header">
              {step.title || level.name}
            </Text>
            <Txt variant="body" color="ink2" style={{ lineHeight: 23 }} selectable>
              {tr?.body_md || t('learn.contentFromPathshala')}
            </Txt>
            <ListenButton id={step.id} url={item?.media_url ?? null} audio={audio} />
            <SutraLines item={item} />
          </VStack>
        )}
      </ScrollView>
    </Screen>
  );
}

function ListenButton({ id, url, audio }: { id: string; url: string | null; audio: ReturnType<typeof useInAppAudio> }) {
  const { t } = useSettings();
  const mine = audio.current === id;
  const playing = mine && audio.playing;
  const label = !url ? t('learn.noAudio') : mine && audio.loading ? t('learn.loadingAudio') : playing ? t('learn.playing', { time: clock(audio.position) }) : t('learn.listenRecitation');
  return (
    <Pressable
      disabled={!url}
      onPress={() => {
        if (url) audio.toggle(id, url);
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: !url, selected: playing }}
      accessibilityLabel={label}
      style={({ pressed }) => ({ backgroundColor: url ? colors.navy : colors.navyDisabled, borderRadius: radii.xl, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' }}>
        <PlayGlyph size={18} paused={playing} />
      </View>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.white, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

function SutraLines({ item }: { item: ContentItem | null }) {
  const { t } = useSettings();
  const m = item?.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? (item.metadata as Record<string, unknown>) : {};
  const lines = Array.isArray(m.lines) ? m.lines.filter((x): x is string => typeof x === 'string') : typeof m.sutra === 'string' ? m.sutra.split('\n') : [];
  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed2, borderRadius: radii.row, paddingVertical: 14, paddingHorizontal: 16, gap: 6 }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted }}>{t('learn.sutraLines').toUpperCase()}</Text>
      {lines.length ? (
        lines.map((l, i) => (
          <Txt key={i} variant="small" selectable>
            {l}
          </Txt>
        ))
      ) : (
        <Txt variant="small" color="faint" style={{ fontStyle: 'italic' }}>
          {t('learn.sutraPending')}
        </Txt>
      )}
    </View>
  );
}

function MicGlyph() {
  return (
    <Svg width={46} height={46} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={9} y={2} width={6} height={12} rx={3} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </Svg>
  );
}

/** Recite: a real recording, uploaded for the teacher (gyan_progress.recording_path, 90-day retention). */
function Recite({
  name,
  stepId,
  audioUrl,
  audio,
  recording,
  onRecorded,
  existing,
}: {
  name: string;
  stepId: string;
  audioUrl: string | null;
  audio: ReturnType<typeof useInAppAudio>;
  recording: { path: string | null; uploaded: boolean } | null;
  onRecorded: (r: { path: string | null; uploaded: boolean } | null) => void;
  existing: GyanData['progress'];
}) {
  const { t } = useSettings();
  const { center, member } = useApp();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<'idle' | 'listening' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (phase !== 'listening') return;
    let loop: Animated.CompositeAnimation | null = null;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!alive || reduce) return;
        loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }));
        loop.start();
      })
      .catch((err: unknown) => logError('checking reduce-motion for the recorder', err));
    return () => {
      alive = false;
      loop?.stop();
      pulse.setValue(0);
    };
  }, [phase, pulse]);

  const start = async () => {
    setError(null);
    try {
      audio.stop();
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError(t('learn.micDenied'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      onRecorded(null);
      setPhase('listening');
    } catch (err) {
      logError('starting a recitation recording', err);
      setError(t('learn.micFailed'));
      setPhase('idle');
    }
  };

  const stop = async () => {
    setDuration(rec.durationMillis / 1000);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch((err: unknown) => logError('leaving recording mode (continuing)', err));
    } catch (err) {
      logError('stopping a recitation recording', err);
      setError(t('learn.micFailed'));
      setPhase('idle');
      return;
    }
    const uri = recorder.uri;
    if (!uri || !center || !member) {
      logError('recitation recording has no file', new Error(`uri=${String(uri)}`));
      setError(t('learn.micFailed'));
      setPhase('idle');
      return;
    }
    setPhase('saving');
    try {
      const path = await uploadRecitation({ centerId: center.id, personId: member.person.id, stepId, uri, existing });
      onRecorded({ path, uploaded: true });
    } catch (err) {
      report(err, 'upload your recitation');
      onRecorded({ path: null, uploaded: false });
    } finally {
      setPhase('idle');
    }
  };

  const listening = phase === 'listening';
  const micBg = recording ? colors.green : listening ? colors.danger : colors.saffron;
  const micText = phase === 'saving' ? t('learn.micSaving') : listening ? t('learn.micListening') : recording ? t('learn.micRecorded', { time: clock(duration) }) : t('learn.micStart');
  const short = name.replace(/\s+sutra$/i, '');

  return (
    <VStack gap={14} style={{ alignItems: 'center' }}>
      <Text style={{ fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 30, color: colors.ink, textAlign: 'center' }} accessibilityRole="header">
        {t('learn.reciteTitle', { name: short })}
      </Text>
      <Txt variant="small" color="muted" center style={{ lineHeight: 21 }}>
        {t('learn.reciteBody')}
      </Txt>
      {audioUrl ? (
        <View style={{ alignSelf: 'stretch' }}>
          <ListenButton id={`${stepId}:ref`} url={audioUrl} audio={audio} />
        </View>
      ) : null}
      <View style={{ width: 120, height: 120, marginVertical: 12, alignItems: 'center', justifyContent: 'center' }}>
        {listening ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: colors.saffron,
              opacity: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1.23, 1.23] }) }],
            }}
          />
        ) : null}
        <Pressable
          onPress={() => void (listening ? stop() : start())}
          disabled={phase === 'saving'}
          accessibilityRole="button"
          accessibilityLabel={listening ? t('learn.micStopLabel') : t('learn.micLabel')}
          accessibilityState={{ busy: phase === 'saving' }}
          style={({ pressed }) => ({ width: 120, height: 120, borderRadius: 60, backgroundColor: micBg, alignItems: 'center', justifyContent: 'center', opacity: pressed || phase === 'saving' ? 0.85 : 1 })}>
          <MicGlyph />
        </Pressable>
      </View>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: recording?.uploaded ? colors.green : colors.muted }} accessibilityLiveRegion="polite">
        {listening ? `${micText} · ${clock(rec.durationMillis / 1000)}` : micText}
      </Text>
      {recording && !listening ? <LinkText label={t('learn.recordAgain')} onPress={() => void start()} /> : null}
      {error ? (
        <View style={{ alignSelf: 'stretch' }}>
          <Banner tone="error" message={error} />
        </View>
      ) : null}
    </VStack>
  );
}

function Celebration({ data, goal, level, index, run, alreadyDone, wasLevelDone }: { data: GyanData; goal: GyanGoal; level: GyanLevel; index: number; run: RunResult; alreadyDone: Set<string>; wasLevelDone: boolean }) {
  const { t } = useSettings();
  const router = useRouter();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const community = communityName(center);
  const me = member?.person.id ?? '';
  const standing = useLoad(() => (center && member ? loadPointsAndStreak(center, member.person.id) : Promise.resolve(null)), [center?.id, member?.person.id], 'load your streak');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const stars = levelStars(level.steps.map((s) => run.stars[s.id] ?? data.progress.find((p) => p.person_id === me && p.step_id === s.id)?.stars ?? 0));
  const earned = pointsEarned(level.steps, alreadyDone);
  const streak = standing.data && center ? streakDisplay(standing.data.streak, todayAt(center.time_zone)).days : null;
  const next = goal.levels[index + 1] ?? null;
  const isFinal = !next;
  const signoff = data.signoffs.find((s) => s.level_id === level.id && s.person_id === me);
  const needsSignoff = isFinal && level.requires_teacher_signoff;
  const [pop] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [pop]);

  const askSignoff = async () => {
    if (!center) return;
    setBusy(true);
    setError(null);
    try {
      await requestSignoff(center.id, me, level.id);
      setRequested(true);
      invalidate();
    } catch (err) {
      setError(report(err, 'request a teacher sign-off').userMessage);
    } finally {
      setBusy(false);
    }
  };

  const stat = (value: string, label: string, color: string) => (
    <View style={{ flex: 1, backgroundColor: colors.navyPanel2, borderRadius: radii.card, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' }} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 20, color }}>{value}</Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.onNavy, textAlign: 'center' }}>{label}</Text>
    </View>
  );

  return (
    <Screen title={goal.name} tabBar={false} niva={false} scroll={false} headerRight={<GyanHeaderChips />} contentStyle={{ flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 }}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.navy }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingTop: 30, paddingHorizontal: 24, paddingBottom: 24, gap: 14 }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, color: colors.gold }}>{t('learn.doneEyebrow', { n: index + 1 }).toUpperCase()}</Text>
        <Text style={{ fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 35, color: colors.white, textAlign: 'center' }} accessibilityRole="header">
          {level.name}
        </Text>
        <Animated.View style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, transform: [{ scale: pop }] }} accessible accessibilityLabel={`${stars} / 3 ★`}>
          {[0, 1, 2].map((k) => (
            <StarGlyph key={k} size={64} color={k < stars ? colors.gold : colors.starOff} />
          ))}
        </Animated.View>
        <View style={{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' }}>
          {stat(`+${earned}`, t('learn.donePoints', { center: community }), colors.gold)}
          {stat(streak === null ? '–' : String(streak), t('learn.doneStreak'), colors.flame)}
          {stat(`${accuracyPercent(run.correct, run.questions)}%`, t('learn.doneAccuracy'), colors.onNavyGreen)}
        </View>
        {earned === 0 && wasLevelDone ? (
          <Txt variant="caption" color="onNavy" center>
            {t('learn.doneReplayPoints')}
          </Txt>
        ) : null}
        {needsSignoff && level.points > 0 ? (
          <Txt variant="caption" color="onNavy" center>
            {t('learn.doneSignoffPoints', { points: level.points, center: community })}
          </Txt>
        ) : null}
        {level.treasure && !wasLevelDone ? (
          <View style={{ alignSelf: 'stretch', backgroundColor: colors.gold, borderRadius: radii.row, paddingVertical: 12, paddingHorizontal: 14 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.treasureInk }}>{t('learn.treasureUnlocked', { reward: level.treasure })}</Text>
          </View>
        ) : null}
        <Txt variant="small" color="onNavy" center>
          {next ? t('learn.nextUp', { n: index + 2, name: next.name }) : needsSignoff ? t('learn.goalFinished', { goal: goal.name }) : t('learn.goalFinishedNoSignoff', { goal: goal.name })}
        </Txt>
        {needsSignoff ? (
          signoff || requested ? (
            <Txt variant="smallStrong" color="onNavyGreen" center>
              {signoff?.status === 'approved' ? t('learn.signedOff') : signoff?.status === 'needs_work' ? t('learn.needsWork') : t('learn.signoffRequested')}
            </Txt>
          ) : (
            <Button label={t('learn.requestSignoff')} tone="light" size="md" busy={busy} onPress={() => void askSignoff()} />
          )
        ) : null}
        {error ? (
          <View style={{ alignSelf: 'stretch' }}>
            <Banner tone="error" message={error} />
          </View>
        ) : null}
        <View style={{ flexGrow: 1 }} />
        <Button3D
          style={{ alignSelf: 'stretch' }}
          label={next ? t('learn.nextLevel') : t('learn.chooseGoal')}
          bg={colors.saffron}
          edge={colors.brown}
          onPress={() => {
            if (next) router.replace({ pathname: '/gyan/[goalId]/level/[levelId]', params: { goalId: goal.id, levelId: next.id } });
            else router.dismissTo('/gyan');
          }}
        />
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.onNavy }}>{t('learn.backToPath')}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
