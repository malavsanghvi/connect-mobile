import type { ComponentType } from 'react';

import { Txt } from '@/components/ui';
import { useT } from '@/providers/settings';

import { parseQuestions, type Question, type QuestionType } from './activity';
import { LessonFrame, StepFooter } from './lesson-frame';
import { ChoiceView, type QuestionProps } from './quiz-choice';
import { FillView } from './quiz-fill';
import { MatchView } from './quiz-match';
import { OrderView } from './quiz-order';
import { TrueFalseView } from './quiz-truefalse';
import type { StepProps } from './step-types';

/** One component per question type. */
const QUESTION_VIEWS: { [K in QuestionType]: ComponentType<QuestionProps<Extract<Question, { type: K }>>> } = {
  choice: ChoiceView,
  truefalse: TrueFalseView,
  order: OrderView,
  match: MatchView,
  fill: FillView,
};

function QuestionView({ ctx, q, seed }: QuestionProps<Question>) {
  const View = QUESTION_VIEWS[q.type] as ComponentType<QuestionProps<Question>>;
  return <View ctx={ctx} q={q} seed={seed} />;
}

/** A quiz step shows one question per screen; the shell counts first-try answers for the stars. */
export function QuizStep({ ctx }: StepProps) {
  const t = useT();
  const questions = parseQuestions(ctx.step.quiz);
  const q = ctx.question !== null ? questions[ctx.question] : null;
  if (!q) {
    return (
      <LessonFrame frame={ctx.frame} answered footer={<StepFooter label={t('learn.continue')} busy={ctx.frame.saving} onPress={() => ctx.finish({ kind: 'step', stars: 3 })} />}>
        <Txt variant="small" color="muted">
          {t('learn.quizMissing')}
        </Txt>
      </LessonFrame>
    );
  }
  return <QuestionView ctx={ctx} q={q} seed={`${ctx.step.id}:${ctx.question}`} />;
}
