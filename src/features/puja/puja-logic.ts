/**
 * Virtual puja (Home › Today › Do puja, /puja): which Gyan Path steps it
 * uses, when it offers to teach the order, and what it says when a puja is
 * complete. The puja is the Navang puja lesson's practice step (connect-crm
 * 0571, goal key "navang_puja"), done full screen; its tries are recorded
 * like the lesson's (app.record_gyan_attempt). Pure (no React Native) so it is
 * unit-tested in __tests__/puja-logic.test.ts.
 */
import type { GyanGoal, GyanLevel, GyanStep } from '../../lib/api/gyan';
import { hotspotActivity, type HotspotActivity } from '../gyan/activity';
import type { AttemptDetail, Line } from '../gyan/points';
import { stepActivity } from '../gyan/step-types';

/** gyan_goals.key of the Navang puja of Mahavir Swami (the shared library's lesson, or a community's own copy). */
export const NAVANG_GOAL_KEY = 'navang_puja';

/** Wrong touches in one try after which the puja offers to teach the order. */
export const TEACH_AFTER_SLIPS = 2;

/** The level screen's `then` value: go back to the puja once the step it opened at is done. */
export const RETURN_TO_PUJA = 'puja';

export type PujaStep = { level: GyanLevel; step: GyanStep; activity: HotspotActivity };

/** The puja's practice step, and the learn step it teaches from (null when the lesson has none). */
export type PujaLesson = { goal: GyanGoal; practice: PujaStep; learn: PujaStep | null };

/** Hotspot steps of a goal in one mode, in lesson order, that have spots to touch. */
function hotspotSteps(goal: GyanGoal, mode: HotspotActivity['mode']): PujaStep[] {
  const out: PujaStep[] = [];
  for (const level of goal.levels) {
    for (const step of level.steps) {
      if (step.kind !== 'hotspot') continue;
      const activity = hotspotActivity(stepActivity(step));
      if (activity.mode === mode && activity.spots.length > 0) out.push({ level, step, activity });
    }
  }
  return out;
}

/**
 * The Navang puja in the goals loadGyan gave, found by its key (never by id):
 * the community's own goal with that key first, then the shared one. The
 * puja is the goal's first hotspot step in practice mode with spots; it is
 * taught from the learn-mode hotspot step in the same level, else the nearest
 * level before it, else any. Null when no such goal has a practice step,
 * which hides the Home button.
 */
export function findPuja(goals: readonly GyanGoal[], key: string = NAVANG_GOAL_KEY): PujaLesson | null {
  const want = key.trim().toLowerCase();
  const matching = goals.filter((g) => (g.key ?? '').trim().toLowerCase() === want);
  const ordered = [...matching.filter((g) => g.center_id !== null), ...matching.filter((g) => g.center_id === null)];
  for (const goal of ordered) {
    const practice = hotspotSteps(goal, 'practice')[0];
    if (!practice) continue;
    const learns = hotspotSteps(goal, 'learn');
    const at = goal.levels.indexOf(practice.level);
    const learn =
      learns.find((x) => x.level.id === practice.level.id) ??
      [...learns].reverse().find((x) => goal.levels.indexOf(x.level) < at) ??
      learns[0] ??
      null;
    return { goal, practice, learn };
  }
  return null;
}

/**
 * Home's "Do puja": shown when the lesson was found, and also when the check
 * failed (the puja screen then says what went wrong, with Try again; a
 * feature is never hidden because of our own error). Hidden while checking
 * and when the community has no Navang puja to do.
 */
export function pujaEntryVisible(found: boolean | undefined, checkFailed: boolean): boolean {
  return found === true || (found === undefined && checkFailed);
}

/** The teaching offer within one try: asked for ("I'm not sure"), or turned down ("Not now"). */
export type TeachOffer = { unsure: boolean; dismissed: boolean };

export const NO_OFFER: TeachOffer = { unsure: false, dismissed: false };

/** "I'm not sure": offer to teach now (again, even after "Not now"). */
export const askedUnsure = (): TeachOffer => ({ unsure: true, dismissed: false });

/** "Not now": no more offers in this try (the member can still ask with "I'm not sure"). */
export const dismissedOffer = (): TeachOffer => ({ unsure: false, dismissed: true });

/**
 * Offer "Want to learn it step by step?" after TEACH_AFTER_SLIPS wrong touches
 * in this try, or when the member said they're not sure; never once they said
 * "Not now" in this try, and never when there is no learn step to open.
 */
export function showTeachOffer(offer: TeachOffer, slips: number, hasLearn: boolean): boolean {
  if (!hasLearn || offer.dismissed) return false;
  return offer.unsure || slips >= TEACH_AFTER_SLIPS;
}

/** The offer appeared with this touch (so screen readers are told once, not on every later touch). */
export function teachOfferAppeared(offer: TeachOffer, slipsBefore: number, slipsAfter: number, hasLearn: boolean): boolean {
  return !showTeachOffer(offer, slipsBefore, hasLearn) && showTeachOffer(offer, slipsAfter, hasLearn);
}

/**
 * Under "Your puja is complete": every touch in order, how many wrong
 * touches, or (more than the lesson's max_slips) that it counts with fewer.
 * The puja is complete either way; the try line says whether it earned points.
 */
export function pujaDoneNote(slips: number, maxSlips: number): Line {
  if (slips <= 0) return { key: 'puja.doneClean' };
  if (slips <= maxSlips) return slips === 1 ? { key: 'puja.doneSlip' } : { key: 'puja.doneSlips', vars: { n: slips } };
  if (maxSlips <= 0) return slips === 1 ? { key: 'puja.doneTooManyOne' } : { key: 'puja.doneTooManyNone', vars: { n: slips } };
  return { key: 'puja.doneTooMany', vars: { n: slips, max: maxSlips } };
}

/** p_detail of a puja's try (the lesson's practice detail, marked as done from the virtual puja). */
export function pujaTryDetail(slips: number, spots: number): AttemptDetail {
  return { mode: 'practice', slips, spots, via: 'virtual_puja' };
}

/** The level screen at the learn step, coming back to the puja afterwards ("Learn the order"). */
export function learnRoute(goalId: string, learn: Pick<PujaStep, 'level' | 'step'>) {
  return { pathname: '/gyan/[goalId]/level/[levelId]' as const, params: { goalId, levelId: learn.level.id, step: learn.step.id, then: RETURN_TO_PUJA } };
}

/**
 * A lesson opened at one step (the level screen's `step`): where its screens
 * start and how many there are (a quiz has one per question). Null when the
 * step isn't in the level, so the lesson opens at its start as before.
 */
export function stepRun(screens: readonly { step: { id: string } }[], stepId: string | null | undefined): { start: number; count: number } | null {
  if (!stepId) return null;
  const start = screens.findIndex((s) => s.step.id === stepId);
  if (start < 0) return null;
  let count = 0;
  while (start + count < screens.length && screens[start + count].step.id === stepId) count += 1;
  return { start, count };
}
