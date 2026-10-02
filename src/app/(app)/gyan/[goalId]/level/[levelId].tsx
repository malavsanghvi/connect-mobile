import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { useInAppAudio } from '@/features/audio';
import { announceIos } from '@/features/gyan/a11y';
import { Celebration, type RunResult } from '@/features/gyan/celebration';
import { PointsBurst } from '@/features/gyan/confetti';
import { logSkippedContent } from '@/features/gyan/lesson-frame';
import { haptic } from '@/features/gyan/motion';
import { quizStars } from '@/features/gyan/quiz-logic';
import { lessonScreens, STEP_COMPONENTS, stepKindLabel, stepRenderer } from '@/features/gyan/registry';
import type { Burst, StepContext, StepResult } from '@/features/gyan/step-types';
import { GyanHeaderChips } from '@/features/gyan-header';
import { RETURN_TO_PUJA, stepRun } from '@/features/puja/puja-logic';
import { completeStep, isLevelDone, isStepDone, loadGyan, type GyanData, type GyanGoal, type GyanLevel } from '@/lib/api/gyan';
import type { ContentItem } from '@/lib/api/jainway';
import { must, report } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useSettings } from '@/providers/settings';

let reloads = 0;
/** A new value each time, so "Reload the lesson" always opens a fresh copy of the screen. */
function nextReloadNonce(): string {
  reloads += 1;
  return String(reloads);
}

/**
 * Gyan Path lesson (GyanPath.dc.html L98–164): one step at a time, then the
 * level-complete celebration. `step` opens it at that step; with
 * `then=puja` (the virtual puja's "Learn the order") only that step is shown,
 * and the member goes back to the puja once it is done.
 */
export default function GyanLevelScreen() {
  const { t } = useSettings();
  const { goalId, levelId, step, then } = useLocalSearchParams<{ goalId: string; levelId: string; step?: string; then?: string }>();
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
  return (
    <Lesson
      key={current.level.id}
      data={current.data}
      goal={current.goal}
      level={current.level}
      content={current.content}
      startStepId={typeof step === 'string' && step ? step : null}
      backToPuja={then === RETURN_TO_PUJA}
    />
  );
}

function Lesson({ data, goal, level, content, startStepId, backToPuja }: { data: GyanData; goal: GyanGoal; level: GyanLevel; content: ContentItem[]; startStepId: string | null; backToPuja: boolean }) {
  const { t } = useSettings();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const { toast } = useFeedback();
  const me = member?.person.id ?? '';
  const screens = lessonScreens(level.steps);
  // Opened at one step: start there. From the virtual puja, only that step's screens are shown (`single`).
  const startAt = stepRun(screens, startStepId);
  const single = backToPuja ? startAt : null;
  const [i, setI] = useState(startAt?.start ?? 0);
  const [missedInStep, setMissedInStep] = useState(0);
  const [run, setRun] = useState<RunResult>({ stars: {}, correct: 0, questions: 0, practicePoints: 0 });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [burst, setBurst] = useState<(Burst & { id: number }) | null>(null);
  const [alreadyDone] = useState(() => new Set(level.steps.filter((s) => isStepDone(data.progress, me, s.id)).map((s) => s.id)));
  const [wasLevelDone] = useState(() => isLevelDone(level, data.progress, me));
  // When the lesson started, for the celebration's tally of what the server paid since.
  const [startedAt] = useState(() => Date.now());
  const audio = useInAppAudio(t('learn.audioFailed'));
  const router = useRouter();
  const index = goal.levels.findIndex((l) => l.id === level.id);
  const levelAudio = level.steps.map((s) => content.find((c) => c.id === s.content_item_id)?.media_url).find((u): u is string => !!u) ?? null;
  // Questions, cards, spots or lines that can't be shown are left out of the lesson; the log names them for the office.
  useEffect(() => {
    level.steps.forEach(logSkippedContent);
  }, [level]);

  if (done) return <Celebration data={data} goal={goal} level={level} index={index} run={run} alreadyDone={alreadyDone} wasLevelDone={wasLevelDone} startedAt={startedAt} />;

  if (screens.length === 0 || !center) {
    return (
      <Screen title={goal.name} tabBar={false} niva={false} headerRight={<GyanHeaderChips />}>
        <EmptyState icon="hourglass-outline" title={t('learn.noSteps')} body={t('learn.noStepsBody')} />
      </Screen>
    );
  }

  const s = screens[i];
  const step = s.step;
  const showBurst = (b: Burst) => {
    setBurst({ ...b, id: (burst?.id ?? 0) + 1 });
    if (b.points && !b.silent) AccessibilityInfo.announceForAccessibility(t('gyan.plusPointsSaid', { n: b.points }));
  };

  const finish = async (result: StepResult) => {
    setSaveError(null);
    audio.stop();
    let missed = missedInStep;
    if (result.kind === 'question') {
      if (!result.firstTry) missed += 1;
      setRun((r) => ({ ...r, correct: r.correct + (result.firstTry ? 1 : 0), questions: r.questions + 1 }));
    }
    if (s.lastOfStep) {
      let stars = result.kind === 'step' ? result.stars : quizStars(missed);
      const savedByTry = result.kind === 'step' && !!result.savedByTry;
      let firstTime = false;
      if (savedByTry) {
        // The try's save kept the better of the stars already saved and this try's (greatest() on the server).
        stars = Math.max(stars, data.progress.find((p) => p.person_id === me && p.step_id === step.id)?.stars ?? 0);
      } else {
        setSaving(true);
        try {
          const saved = await completeStep(center.id, me, step.id, stars, result.kind === 'step' ? result.recordingPath : null);
          stars = saved.stars;
          firstTime = saved.firstTime;
        } catch (err) {
          setSaveError(report(err, 'save your progress').userMessage);
          // Undo this question's count; the Continue button retries the save.
          if (result.kind === 'question') setRun((r) => ({ ...r, correct: r.correct - (result.firstTry ? 1 : 0), questions: r.questions - 1 }));
          return;
        } finally {
          setSaving(false);
        }
      }
      invalidate();
      setRun((r) => ({ ...r, stars: { ...r.stars, [step.id]: stars } }));
      setMissedInStep(0);
      if (single) {
        // Learned from the virtual puja: back to the puja (the step's first-time points are in the note).
        const note = firstTime && step.points > 0 ? t('puja.learnedPoints', { n: step.points }) : t('puja.learned');
        toast(note);
        announceIos(note); // the toast is a live region, which TalkBack and browsers read themselves
        haptic('right');
        if (router.canGoBack()) router.back();
        else router.replace('/puja');
        return;
      }
      const last = i + 1 >= screens.length;
      // The first completion pays the step's points once (the server's trigger); a practice try already showed its own.
      if (firstTime && step.points > 0 && !last) showBurst({ points: step.points, confetti: false });
      // On the last step the celebration gives the "complete" buzz.
      if (!last) haptic('right');
    } else {
      setMissedInStep(missed);
    }
    if (i + 1 >= screens.length) {
      setDone(true);
      return;
    }
    setI(i + 1);
  };

  const label = stepKindLabel(step, index + 1);
  const ctx: StepContext = {
    centerId: center.id,
    personId: me,
    timeZone: center.time_zone,
    rules: center.rules,
    goal,
    level,
    levelIndex: index,
    step,
    question: s.question,
    data,
    item: content.find((c) => c.id === step.content_item_id) ?? null,
    levelAudio,
    audio,
    frame: { title: goal.name, index: single ? i - single.start : i, total: single ? single.count : screens.length, kindLabel: t(label.key, label.vars), saving, saveError },
    finish: (r) => void finish(r),
    burst: showBurst,
    addPracticePoints: (n) => setRun((r) => ({ ...r, practicePoints: r.practicePoints + n })),
    // A fresh copy of the screen loads the lesson again (the step may have been removed meanwhile).
    reloadLesson: () =>
      router.replace({
        pathname: '/gyan/[goalId]/level/[levelId]',
        params: { goalId: goal.id, levelId: level.id, reload: nextReloadNonce(), ...(startStepId ? { step: startStepId } : {}), ...(backToPuja ? { then: RETURN_TO_PUJA } : {}) },
      }),
  };
  const Step = STEP_COMPONENTS[stepRenderer(step)];

  return (
    <View style={{ flex: 1 }}>
      <Step key={`${step.id}:${s.question ?? ''}`} ctx={ctx} />
      {burst ? <PointsBurst key={burst.id} seed={burst.id * 101 + i} label={burst.points ? t('gyan.plusPoints', { n: burst.points }) : (burst.message ?? null)} confetti={burst.confetti} /> : null}
    </View>
  );
}
