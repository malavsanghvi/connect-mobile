import { useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { Txt } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

import type { FillQuestion } from './activity';
import { ExplainBox, LessonFrame, StepFooter } from './lesson-frame';
import { haptic, useReduceMotion, useShake } from './motion';
import type { QuestionProps } from './quiz-choice';
import { sameWord, shuffled, splitBlank, triesAllowed } from './quiz-logic';

type Phase = 'answering' | 'retry' | 'right' | 'shown';

/** Fill: pick the missing word for the blank, Check; one retry. */
export function FillView({ ctx, q, seed }: QuestionProps<FillQuestion>) {
  const t = useT();
  const reduce = useReduceMotion();
  const shake = useShake(reduce);
  const [options] = useState(() => shuffled(q.options, seed));
  const [pick, setPick] = useState<string | null>(null);
  const [misses, setMisses] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('answering');
  const resolved = phase === 'right' || phase === 'shown';
  const [before, after] = splitBlank(q.sentence);
  const inBlank = resolved ? q.answer : pick;

  const check = () => {
    if (pick === null) return;
    if (sameWord(pick, q.answer)) {
      haptic('right');
      setPhase('right');
      return;
    }
    haptic('wrong');
    shake.shake();
    const used = misses.length + 1;
    setMisses([...misses, pick]);
    if (used < triesAllowed('fill')) {
      setPhase('retry');
      setPick(null);
    } else setPhase('shown');
  };

  const feedback =
    phase === 'retry'
      ? { text: t('gyan.retryHint'), ok: false }
      : phase === 'right'
        ? { text: misses.length ? t('gyan.rightSecondTry') : t('learn.allCorrect'), ok: true }
        : phase === 'shown'
          ? { text: t('learn.someWrong'), ok: false }
          : null;

  return (
    <LessonFrame
      frame={ctx.frame}
      answered={resolved}
      footer={
        resolved ? (
          <StepFooter feedback={feedback} label={t('learn.continue')} busy={ctx.frame.saving} onPress={() => ctx.finish({ kind: 'question', firstTry: phase === 'right' && misses.length === 0 })} />
        ) : (
          <StepFooter feedback={feedback} label={t('learn.check')} tone="check" disabled={pick === null} onPress={check} />
        )
      }>
      <Txt variant="eyebrow" color="muted">
        {t('gyan.fillTitle')}
      </Txt>
      <Animated.View style={shake.style}>
        <Txt variant="title" color="ink" accessibilityRole="header" accessibilityLabel={`${before}${inBlank ?? t('gyan.blank')}${after}`}>
          {before}
          <Txt variant="title" color={resolved ? 'green' : inBlank ? 'navy' : 'faint'} style={{ textDecorationLine: 'underline' }}>
            {inBlank ?? '      '}
          </Txt>
          {after}
        </Txt>
      </Animated.View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((o) => {
          const ruledOut = misses.includes(o);
          const right = resolved && sameWord(o, q.answer);
          const picked = pick === o;
          return (
            <Pressable
              key={o}
              disabled={resolved || ruledOut}
              onPress={() => setPick(o)}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked, disabled: resolved || ruledOut }}
              accessibilityLabel={`${o}${right ? `, ${t('learn.correctAnswer')}` : ruledOut ? `, ${t('learn.wrongAnswer')}` : ''}`}
              style={{
                minHeight: 48,
                justifyContent: 'center',
                borderRadius: radii.pill,
                borderWidth: 2,
                borderColor: right ? colors.green : ruledOut ? colors.danger : picked ? colors.navy : colors.borderInput,
                backgroundColor: right ? colors.greenTint : ruledOut ? colors.dangerTint : picked ? colors.navyTint : colors.card,
                paddingHorizontal: 18,
                opacity: ruledOut ? 0.7 : 1,
              }}>
              <Txt variant="bodyStrong" color="ink" style={ruledOut ? { textDecorationLine: 'line-through' } : null}>
                {o}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {resolved ? <ExplainBox text={q.explain} /> : null}
    </LessonFrame>
  );
}
