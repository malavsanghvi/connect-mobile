import { useState } from 'react';
import { Animated } from 'react-native';

import { VStack } from '@/components/ui';
import { useT } from '@/providers/settings';

import type { ChoiceQuestion } from './activity';
import { ExplainBox, LessonFrame, OptionCard, StepFooter, StepTitle } from './lesson-frame';
import { haptic, useReduceMotion, useShake } from './motion';
import { triesAllowed } from './quiz-logic';
import type { StepContext } from './step-types';

export type QuestionProps<Q> = { ctx: StepContext; q: Q; seed: string };

type Phase = 'answering' | 'retry' | 'right' | 'shown';

/** Choice: pick one, Check; a wrong first pick is crossed out and there is one more try; then the "why". */
export function ChoiceView({ ctx, q }: QuestionProps<ChoiceQuestion>) {
  const t = useT();
  const reduce = useReduceMotion();
  const shake = useShake(reduce);
  const [pick, setPick] = useState<number | null>(null);
  const [misses, setMisses] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('answering');
  const resolved = phase === 'right' || phase === 'shown';

  const check = () => {
    if (pick === null) return;
    if (pick === q.answer) {
      haptic('right');
      setPhase('right');
      return;
    }
    haptic('wrong');
    shake.shake();
    const used = misses.length + 1;
    setMisses([...misses, pick]);
    if (used < triesAllowed('choice')) {
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
      <Animated.View style={shake.style}>
        <VStack gap={10}>
          <StepTitle>{q.question}</StepTitle>
          {q.options.map((o, i) => {
            const state = resolved && i === q.answer ? 'right' : phase === 'shown' && misses.includes(i) ? 'wrong' : misses.includes(i) ? 'ruledOut' : 'idle';
            return <OptionCard key={i} label={o} picked={pick === i} state={state} disabled={resolved || misses.includes(i)} onPress={() => setPick(i)} />;
          })}
        </VStack>
      </Animated.View>
      {resolved ? <ExplainBox text={q.explain} /> : null}
    </LessonFrame>
  );
}
