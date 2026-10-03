import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Banner, Txt } from '@/components/ui';
import { loadTriesToday, recordGyanAttempt } from '@/lib/api/gyan';
import { report } from '@/lib/errors';
import { newRequestId } from '@/lib/request-context';
import { useLoad } from '@/lib/use-load';
import { useT } from '@/providers/settings';
import { colors, radii, touch } from '@/theme';

import { announce, webLiveRegion } from './a11y';
import { haptic } from './motion';
import { attemptLine, counterLine, practiceCap, scoreStars, triesPay, type AttemptDetail, type AttemptResult, type Line } from './points';
import type { StepContext } from './step-types';

/** One finished try. `tryId` is made once and kept when the same try is sent again. */
type Pending = { tryId: string; success: boolean; score: number | null; detail: AttemptDetail };

export type TryState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; success: boolean; line: Line }
  | { status: 'error'; message: string; code: string | null; pending: Pending };

/**
 * What recording tries needs from its screen: a lesson step, or the virtual puja (src/app/(app)/puja.tsx).
 * `personId` is null for a visitor who is not signed in (the virtual puja is open to the public): they have no
 * tries to count and none are recorded.
 */
export type TryContext = Pick<StepContext, 'centerId' | 'timeZone' | 'rules' | 'step' | 'addPracticePoints' | 'burst' | 'reloadLesson'> & { personId: string | null };

/**
 * Practice tries for one step: today's "N of 10" counter and recording each
 * try through app.record_gyan_attempt (which awards the repeat points).
 * A try that could not be saved says so, with Try again (the same try id, so
 * a try the server did record is never paid twice). Without a person (a
 * visitor who is not signed in) nothing is counted and `record` does nothing:
 * the screen asks them to sign in to earn points instead.
 */
export function usePracticeTries(ctx: TryContext) {
  const t = useT();
  const counter = useLoad(() => (ctx.personId ? loadTriesToday(ctx.personId, ctx.step.id, ctx.timeZone) : Promise.resolve(0)), [ctx.personId, ctx.step.id], 'load your practice tries for today');
  const [latest, setLatest] = useState<AttemptResult | null>(null);
  const [state, setState] = useState<TryState>({ status: 'idle' });
  // Best score of a saved successful try: the server has then completed the step with stars from it.
  const [bestSaved, setBestSaved] = useState<number | null>(null);
  const cap = latest?.cap ?? practiceCap(ctx.rules);
  const triesToday = latest?.triesToday ?? counter.data ?? null;
  const repeatPoints = Math.max(0, ctx.step.repeat_points || 0);

  const record = async (attempt: Omit<Pending, 'tryId'> & { tryId?: string }) => {
    // No person, no try: a visitor who is not signed in earns and records nothing (puja.tsx says so).
    if (!ctx.personId) return;
    const pending: Pending = { ...attempt, tryId: attempt.tryId ?? newRequestId() };
    setState({ status: 'saving' });
    try {
      const r = await recordGyanAttempt({ centerId: ctx.centerId, stepId: ctx.step.id, ...pending });
      setLatest(r);
      if (pending.success) setBestSaved((b) => Math.max(b ?? 0, pending.score ?? 0));
      const line = attemptLine(r, pending.success, repeatPoints);
      setState({ status: 'saved', success: pending.success, line });
      // The header's total refreshes when the step is saved (one reload, not one per try).
      // The celebration reads the step, level and treasure points from the ledger; only the repeat part is "practice".
      if (r.tryPoints > 0) ctx.addPracticePoints(r.tryPoints);
      // The line below already says the points, so the burst stays quiet for screen readers.
      if (r.pointsAwarded > 0) ctx.burst({ points: r.pointsAwarded, confetti: true, silent: true });
      haptic(pending.success ? 'complete' : 'wrong');
      // VoiceOver and TalkBack are told here, after the try's own result; TryResult's line is a live region only on the web.
      announce(t(line.key, line.vars), { queue: true });
    } catch (err) {
      const e = report(err, t('gyan.saveTryAction'));
      setState({ status: 'error', message: e.userMessage, code: e.code, pending });
    }
  };

  return {
    cap,
    triesToday,
    /** Good tries earn points here (a cap of 0 or no repeat points: they don't, and no counter is shown). */
    pays: triesPay(cap, repeatPoints),
    /** A successful try was saved: the server completed the step (no separate save needed). */
    savedSuccess: bestSaved !== null,
    /** Stars the server gave the step from the best saved successful try. */
    savedStars: bestSaved !== null ? scoreStars(bestSaved) : null,
    saving: state.status === 'saving',
    repeatPoints,
    counterError: counter.error && triesToday === null ? counter : null,
    state,
    record,
    reset: () => setState({ status: 'idle' }),
    reloadLesson: ctx.reloadLesson,
  };
}

/** "3 of 10 today" (or why it couldn't be loaded, with Try again). Nothing when tries don't earn points. */
export function TriesCounter({ tries }: { tries: ReturnType<typeof usePracticeTries> }) {
  const t = useT();
  if (!tries.pays) return null;
  if (tries.counterError) {
    return (
      <Pressable onPress={() => void tries.counterError?.reload()} accessibilityRole="button" style={{ minHeight: touch.min, justifyContent: 'center' }}>
        <Txt variant="caption" color="danger">
          {`${t('gyan.counterFailed')} ${t('common.retry')}`}
        </Txt>
      </Pressable>
    );
  }
  if (tries.triesToday === null) return null;
  const line = counterLine(tries.triesToday, tries.cap);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <View style={{ backgroundColor: colors.celebrateBg, borderWidth: 1, borderColor: colors.celebrateBorder, borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: 12 }}>
        <Txt variant="caption" color="brown">
          {t(line.key, line.vars)}
        </Txt>
      </View>
      <Txt variant="caption" color="muted">
        {t('gyan.repeatHint', { n: tries.repeatPoints, cap: tries.cap })}
      </Txt>
    </View>
  );
}

/**
 * The result of the last try: points line, saving, or a failed save. Try
 * again resends the same try; a step that no longer exists offers Reload the
 * lesson, and the server's own refusals (not a member, another community's
 * lesson) have no retry, because trying again cannot change them.
 */
export function TryResult({ tries }: { tries: ReturnType<typeof usePracticeTries> }) {
  const t = useT();
  const s = tries.state;
  if (s.status === 'idle') return null;
  if (s.status === 'saving') {
    return (
      <Txt variant="small" color="muted" accessibilityLiveRegion="polite">
        {t('gyan.savingTry')}
      </Txt>
    );
  }
  if (s.status === 'error') {
    const action =
      s.code === 'P0002' ? { label: t('gyan.reloadLesson'), onPress: tries.reloadLesson } : s.code === '22023' || s.code === '42501' ? undefined : { label: t('common.retry'), onPress: () => void tries.record(s.pending) };
    return <Banner tone="error" message={s.message} action={action} />;
  }
  return (
    <View style={{ backgroundColor: s.success ? colors.greenTint : colors.panel, borderRadius: radii.row, paddingVertical: 10, paddingHorizontal: 14 }} accessibilityLiveRegion={webLiveRegion}>
      <Txt variant="smallStrong" color={s.success ? 'greenDark' : 'brownText'}>
        {t(s.line.key, s.line.vars)}
      </Txt>
    </View>
  );
}
