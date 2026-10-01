import type { InAppAudio } from '@/features/audio';
import type { GyanData, GyanGoal, GyanLevel, GyanStep } from '@/lib/api/gyan';
import type { ContentItem } from '@/lib/api/jainway';

/** What the lesson shell shows around every step (progress, kind label, save state). */
export type FrameInfo = {
  title: string;
  /** Screen index (0-based) and count, for the progress bar. */
  index: number;
  total: number;
  kindLabel: string;
  /** The shell is saving the finished step. */
  saving: boolean;
  /** A failed save, in plain English (the step's Continue retries it). */
  saveError: string | null;
};

/**
 * How a screen ended: a quiz question (first try right or not), or a whole
 * step with its stars. `savedByTry`: a successful practice try already
 * completed the step on the server (app.record_gyan_attempt), so the shell
 * doesn't save it again (and doesn't show its points twice).
 */
export type StepResult = { kind: 'question'; firstTry: boolean } | { kind: 'step'; stars: number; recordingPath?: string | null; savedByTry?: boolean };

/** "+N points" over the lesson. `silent`: the caller announces its own line for screen readers (a practice try). */
export type Burst = { points: number | null; confetti: boolean; message?: string; silent?: boolean };

export type StepContext = {
  centerId: string;
  personId: string;
  timeZone: string | null;
  rules: unknown;
  goal: GyanGoal;
  level: GyanLevel;
  levelIndex: number;
  step: GyanStep;
  /** Index of the question on this screen (quiz steps show one question per screen). */
  question: number | null;
  data: GyanData;
  item: ContentItem | null;
  levelAudio: string | null;
  audio: InAppAudio;
  frame: FrameInfo;
  /** Save (when this screen ends its step) and move on. */
  finish: (result: StepResult) => void;
  /** "+N points" and confetti over the lesson. */
  burst: (b: Burst) => void;
  /** Practice points the server paid during this run (for the celebration). */
  addPracticePoints: (n: number) => void;
  /** Load the lesson again from the server (a step was removed meanwhile). */
  reloadLesson: () => void;
};

export type StepProps = { ctx: StepContext };

/** gyan_steps.activity (connect-crm 0570): the payload for cards, hotspot and voice steps. */
export function stepActivity(step: GyanStep): unknown {
  return step.activity ?? null;
}
