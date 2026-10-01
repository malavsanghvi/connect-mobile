import type { ComponentType } from 'react';

import type { GyanStep } from '@/lib/api/gyan';
import type { StringKey } from '@/i18n/en';

import { parseQuestions, readActivity } from './activity';
import { HotspotStep } from './hotspot';
import { LearnStep } from './learn-step';
import { QuizStep } from './quiz';
import { ReadCards } from './read-cards';
import { ReciteStep } from './recite-step';
import { stepActivity, type StepProps } from './step-types';
import { VoiceStep } from './voice';

export type Renderer = 'quiz' | 'recite' | 'hotspot' | 'voice' | 'cards' | 'learn';

/** One component per kind of step. */
export const STEP_COMPONENTS: Record<Renderer, ComponentType<StepProps>> = {
  quiz: QuizStep,
  recite: ReciteStep,
  hotspot: HotspotStep,
  voice: VoiceStep,
  cards: ReadCards,
  learn: LearnStep,
};

/**
 * Which component draws a step (gyan_steps.kind). Read and practice steps with
 * cards get the card deck; without cards they keep the original learn screen
 * (as do listen and video).
 */
export function stepRenderer(step: GyanStep): Renderer {
  switch (step.kind) {
    case 'quiz':
    case 'recite':
    case 'hotspot':
    case 'voice':
      return step.kind;
    case 'read':
    case 'practice':
      return readActivity(stepActivity(step)).cards.length ? 'cards' : 'learn';
    default:
      return 'learn';
  }
}

/** The small label above each step ("Quick quiz", "Practise the puja"). */
export function stepKindLabel(step: GyanStep, levelNumber: number): { key: StringKey; vars?: Record<string, number> } {
  switch (step.kind) {
    case 'quiz':
      return { key: 'learn.stepQuiz' };
    case 'recite':
      return { key: 'learn.stepRecite' };
    case 'video':
      return { key: 'learn.stepWatch' };
    case 'practice':
      return { key: 'learn.stepPractice' };
    case 'voice':
      return { key: 'gyan.stepVoice' };
    case 'hotspot': {
      const a = stepActivity(step);
      const practice = !!a && typeof a === 'object' && (a as { mode?: unknown }).mode === 'practice';
      return { key: practice ? 'gyan.stepPujaPractice' : 'gyan.stepPujaLearn' };
    }
    case 'read':
      return readActivity(stepActivity(step)).cards.length ? { key: 'gyan.stepRead', vars: { n: levelNumber } } : { key: 'learn.stepLearn', vars: { n: levelNumber } };
    default:
      return { key: 'learn.stepLearn', vars: { n: levelNumber } };
  }
}

export type LessonScreen = { step: GyanStep; stepIndex: number; question: number | null; lastOfStep: boolean };

/** One screen per step, and one per quiz question (prototype: learn → quiz → quiz → recite). */
export function lessonScreens(steps: GyanStep[]): LessonScreen[] {
  const out: LessonScreen[] = [];
  steps.forEach((step, stepIndex) => {
    const quiz = step.kind === 'quiz' ? parseQuestions(step.quiz) : [];
    if (quiz.length > 1) quiz.forEach((_, q) => out.push({ step, stepIndex, question: q, lastOfStep: q === quiz.length - 1 }));
    else out.push({ step, stepIndex, question: step.kind === 'quiz' && quiz.length === 1 ? 0 : null, lastOfStep: true });
  });
  return out;
}
