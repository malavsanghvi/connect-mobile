import { useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';

import { Banner, Txt } from '@/components/ui';
import { loadTriesToday, recordGyanAttempt } from '@/lib/api/gyan';
import { report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useT } from '@/providers/settings';
import { colors, radii, touch } from '@/theme';

import { haptic } from './motion';
import { attemptLine, counterLine, practiceCap, scoreStars, type AttemptResult, type Line } from './points';
import type { StepContext } from './step-types';

type Pending = { success: boolean; score: number | null; detail: Record<string, string | number | boolean | null> };

export type TryState = { status: 'idle' } | { status: 'saving' } | { status: 'saved'; success: boolean; line: Line } | { status: 'error'; message: string; pending: Pending };

/**
 * Practice tries for one step: today's "N of 10" counter and recording each
 * try through app.record_gyan_attempt (which awards the repeat points).
 * A try that could not be saved says so, with Try again.
 */
export function usePracticeTries(ctx: StepContext) {
  const t = useT();
  const counter = useLoad(() => loadTriesToday(ctx.personId, ctx.step.id, ctx.timeZone), [ctx.personId, ctx.step.id], 'load your practice tries for today');
  const [latest, setLatest] = useState<AttemptResult | null>(null);
  const [state, setState] = useState<TryState>({ status: 'idle' });
  // Best score of a saved successful try: the server has then completed the step with stars from it.
  const [bestSaved, setBestSaved] = useState<number | null>(null);
  const cap = latest?.cap ?? practiceCap(ctx.rules);
  const triesToday = latest?.triesToday ?? counter.data ?? null;

  const record = async (pending: Pending) => {
    setState({ status: 'saving' });
    try {
      const r = await recordGyanAttempt({ centerId: ctx.centerId, stepId: ctx.step.id, ...pending });
      setLatest(r);
      if (pending.success) setBestSaved(Math.max(bestSaved ?? 0, pending.score ?? 0));
      const line = attemptLine(r, pending.success);
      setState({ status: 'saved', success: pending.success, line });
      // The header's total refreshes when the step is saved (one reload, not one per try).
      // The celebration counts the step, level and treasure points itself; only the repeat part is "practice".
      if (r.tryPoints > 0) ctx.addPracticePoints(r.tryPoints);
      if (r.pointsAwarded > 0) ctx.burst({ points: r.pointsAwarded, confetti: true });
      haptic(pending.success ? 'complete' : 'wrong');
      AccessibilityInfo.announceForAccessibility(t(line.key, line.vars));
    } catch (err) {
      setState({ status: 'error', message: report(err, t('gyan.saveTryAction')).userMessage, pending });
    }
  };

  return {
    cap,
    triesToday,
    /** A successful try was saved: the server completed the step (no separate save needed). */
    savedSuccess: bestSaved !== null,
    /** Stars the server gave the step from the best saved successful try. */
    savedStars: bestSaved !== null ? scoreStars(bestSaved) : null,
    saving: state.status === 'saving',
    repeatPoints: Math.max(0, ctx.step.repeat_points || 0),
    counterError: counter.error && triesToday === null ? counter : null,
    state,
    record,
    reset: () => setState({ status: 'idle' }),
  };
}

/** "3 of 10 today" (or why it couldn't be loaded, with Try again). */
export function TriesCounter({ tries }: { tries: ReturnType<typeof usePracticeTries> }) {
  const t = useT();
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
      {tries.repeatPoints > 0 ? (
        <Txt variant="caption" color="muted">
          {t('gyan.repeatHint', { n: tries.repeatPoints, cap: tries.cap })}
        </Txt>
      ) : null}
    </View>
  );
}

/** The result of the last try: points line, saving, or a failed save with Try again. */
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
  if (s.status === 'error') return <Banner tone="error" message={s.message} action={{ label: t('common.retry'), onPress: () => void tries.record(s.pending) }} />;
  return (
    <View style={{ backgroundColor: s.success ? colors.greenTint : colors.panel, borderRadius: radii.row, paddingVertical: 10, paddingHorizontal: 14 }} accessibilityLiveRegion="polite">
      <Txt variant="smallStrong" color={s.success ? 'greenDark' : 'brownText'}>
        {t(s.line.key, s.line.vars)}
      </Txt>
    </View>
  );
}
