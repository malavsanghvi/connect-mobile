import { useState } from 'react';
import { Animated } from 'react-native';

import { Txt, VStack } from '@/components/ui';
import { useT } from '@/providers/settings';

import type { TrueFalseQuestion } from './activity';
import { ExplainBox, LessonFrame, OptionCard, StepFooter, StepTitle } from './lesson-frame';
import { haptic, useReduceMotion, useShake } from './motion';
import type { QuestionProps } from './quiz-choice';

/** True or false: one try, then the right answer and the "why". */
export function TrueFalseView({ ctx, q }: QuestionProps<TrueFalseQuestion>) {
  const t = useT();
  const reduce = useReduceMotion();
  const shake = useShake(reduce);
  const [pick, setPick] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  const right = checked && pick === q.answer;

  const check = () => {
    if (pick === null) return;
    setChecked(true);
    if (pick === q.answer) haptic('right');
    else {
      haptic('wrong');
      shake.shake();
    }
  };

  const option = (value: boolean) => {
    const state = checked && value === q.answer ? 'right' : checked && value === pick ? 'wrong' : 'idle';
    return <OptionCard key={String(value)} label={value ? t('gyan.true') : t('gyan.false')} picked={pick === value} state={state} disabled={checked} onPress={() => setPick(value)} />;
  };

  return (
    <LessonFrame
      frame={ctx.frame}
      answered={checked}
      footer={
        checked ? (
          <StepFooter
            feedback={{ text: right ? t('learn.allCorrect') : t('learn.someWrong'), ok: right }}
            label={t('learn.continue')}
            busy={ctx.frame.saving}
            onPress={() => ctx.finish({ kind: 'question', firstTry: right })}
          />
        ) : (
          <StepFooter label={t('learn.check')} tone="check" disabled={pick === null} onPress={check} />
        )
      }>
      <Txt variant="eyebrow" color="muted">
        {t('gyan.trueFalse')}
      </Txt>
      <Animated.View style={shake.style}>
        <VStack gap={10}>
          <StepTitle>{q.statement}</StepTitle>
          {option(true)}
          {option(false)}
        </VStack>
      </Animated.View>
      {checked ? <ExplainBox text={q.explain} /> : null}
    </LessonFrame>
  );
}
