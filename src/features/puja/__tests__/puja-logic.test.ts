import { describe, expect, it } from '@jest/globals';

import { translate } from '../../../i18n';
import type { GyanGoal, GyanLevel, GyanStep } from '../../../lib/api/gyan';
import { blockingModule } from '../../../lib/modules';
import {
  askedUnsure,
  awaitLearned,
  completesLevel,
  dismissedOffer,
  findPuja,
  handLearned,
  learnedLine,
  learnRoute,
  NAVANG_GOAL_KEY,
  NO_OFFER,
  pujaDoneNote,
  pujaEntryVisible,
  pujaTryDetail,
  RETURN_TO_PUJA,
  showTeachOffer,
  stepRun,
  takeLearned,
  TEACH_AFTER_SLIPS,
  teachOfferAppeared,
} from '../puja-logic';

const SPOTS = [
  { key: 'toe_right', order: 1, puja: 1, label: 'Right big toe', x: 0.7, y: 0.8, r: 0.03 },
  { key: 'toe_left', order: 2, puja: 1, label: 'Left big toe', x: 0.3, y: 0.8, r: 0.03 },
];

const step = (id: string, kind: string, activity: unknown, sort_order = 0): GyanStep => ({
  id,
  level_id: 'level',
  kind,
  title: id,
  content_item_id: null,
  quiz: null,
  sort_order,
  points: 10,
  custom: {},
  activity: activity as GyanStep['activity'],
  repeat_points: kind === 'hotspot' ? 3 : 0,
});

const hotspot = (id: string, mode: 'learn' | 'practice', spots: unknown[] = SPOTS) => step(id, 'hotspot', { image: 'asset:mahavir-murti', mode, spots });

const level = (id: string, steps: GyanStep[], sort_order = 0): GyanLevel =>
  ({ id, goal_id: 'goal', key: id, name: id, sort_order, points: 20, steps: steps.map((s) => ({ ...s, level_id: id })) }) as unknown as GyanLevel;

const goal = (id: string, levels: GyanLevel[], o: { key?: string; center_id?: string | null } = {}): GyanGoal => ({
  id,
  center_id: o.center_id ?? null,
  tradition: 'shvetambar_murtipujak',
  key: o.key ?? NAVANG_GOAL_KEY,
  name: 'Learn Puja: Navang puja of Mahavir Swami',
  description: null,
  sort_order: 50,
  recommended: false,
  tint: null,
  mark: null,
  custom: {},
  levels,
});

/** The shared lesson as connect-crm 0571 makes it: one level, learn then practice. */
const NAVANG = goal('navang', [level('nine-places', [hotspot('learn', 'learn'), hotspot('practice', 'practice')])]);

describe('findPuja', () => {
  it('finds the practice step and the learn step of the Navang puja by its key', () => {
    const found = findPuja([goal('samayik', [level('l1', [hotspot('other', 'practice')])], { key: 'samayik' }), NAVANG]);
    expect(found?.goal.id).toBe('navang');
    expect(found?.practice.step.id).toBe('practice');
    expect(found?.practice.level.id).toBe('nine-places');
    expect(found?.practice.activity.mode).toBe('practice');
    expect(found?.practice.activity.spots.map((s) => s.key)).toEqual(['toe_right', 'toe_left']);
    expect(found?.learn?.step.id).toBe('learn');
  });

  it('is null when there is no Navang goal, or it has no practice step with spots', () => {
    expect(findPuja([])).toBeNull();
    expect(findPuja([goal('samayik', [level('l1', [hotspot('p', 'practice')])], { key: 'samayik' })])).toBeNull();
    expect(findPuja([goal('navang', [level('l1', [hotspot('learn', 'learn')])])])).toBeNull();
    expect(findPuja([goal('navang', [level('l1', [hotspot('learn', 'learn'), hotspot('practice', 'practice', [])])])])).toBeNull();
    expect(findPuja([goal('navang', [level('l1', [step('read', 'read', { cards: [] })])])])).toBeNull();
    expect(findPuja([goal('navang', [])])).toBeNull();
  });

  it('ignores spots without a place or a label (they cannot be touched)', () => {
    const broken = goal('navang', [level('l1', [hotspot('practice', 'practice', [{ key: 'x', label: 'no place' }, { x: 0.5, y: 0.5 }])])]);
    expect(findPuja([broken])).toBeNull();
  });

  it("prefers the community's own Navang goal over the shared one, unless its own has nothing to practise", () => {
    const own = goal('own', [level('o1', [hotspot('own-practice', 'practice')])], { center_id: 'center' });
    expect(findPuja([NAVANG, own])?.practice.step.id).toBe('own-practice');
    const empty = goal('own-empty', [level('o1', [hotspot('own-learn', 'learn')])], { center_id: 'center' });
    expect(findPuja([empty, NAVANG])?.goal.id).toBe('navang');
  });

  it('matches the key exactly, as loadGyan filters it on the server', () => {
    expect(findPuja([goal('g', NAVANG.levels, { key: 'navang_puja' })])?.goal.id).toBe('g');
    expect(findPuja([goal('g', NAVANG.levels, { key: 'Navang_Puja' })])).toBeNull();
  });

  it('teaches from the learn step in the same level, else the nearest level before it, else any', () => {
    const sameLevel = goal('g', [level('a', [hotspot('learn-a', 'learn')]), level('b', [hotspot('learn-b', 'learn'), hotspot('practice-b', 'practice')])]);
    expect(findPuja([sameLevel])?.learn?.step.id).toBe('learn-b');
    const before = goal('g', [level('a', [hotspot('learn-a', 'learn')]), level('b', [hotspot('learn-b', 'learn')]), level('c', [hotspot('practice-c', 'practice')]), level('d', [hotspot('learn-d', 'learn')])]);
    expect(findPuja([before])?.learn?.step.id).toBe('learn-b');
    const after = goal('g', [level('a', [hotspot('practice-a', 'practice')]), level('b', [hotspot('learn-b', 'learn')])]);
    expect(findPuja([after])?.learn?.step.id).toBe('learn-b');
  });

  it('has no learn step when the lesson has none (no teaching offer then)', () => {
    const found = findPuja([goal('g', [level('a', [hotspot('practice', 'practice')])])]);
    expect(found?.practice.step.id).toBe('practice');
    expect(found?.learn).toBeNull();
  });

  it('takes the first practice step when there are several', () => {
    const two = goal('g', [level('a', [hotspot('p1', 'practice'), hotspot('p2', 'practice')]), level('b', [hotspot('p3', 'practice')])]);
    expect(findPuja([two])?.practice.step.id).toBe('p1');
  });
});

describe('when to offer teaching', () => {
  it(`offers after ${TEACH_AFTER_SLIPS} wrong touches in a try`, () => {
    expect(TEACH_AFTER_SLIPS).toBe(2);
    expect(showTeachOffer(NO_OFFER, 0, true)).toBe(false);
    expect(showTeachOffer(NO_OFFER, 1, true)).toBe(false);
    expect(showTeachOffer(NO_OFFER, 2, true)).toBe(true);
    expect(showTeachOffer(NO_OFFER, 5, true)).toBe(true);
  });

  it("offers straight away after \"I'm not sure\"", () => {
    expect(showTeachOffer(askedUnsure(), 0, true)).toBe(true);
  });

  it('stops offering in this try after "Not now", until the member asks again', () => {
    expect(showTeachOffer(dismissedOffer(), 2, true)).toBe(false);
    expect(showTeachOffer(dismissedOffer(), 6, true)).toBe(false);
    expect(showTeachOffer(askedUnsure(), 6, true)).toBe(true);
  });

  it('never offers without a learn step to open', () => {
    expect(showTeachOffer(NO_OFFER, 4, false)).toBe(false);
    expect(showTeachOffer(askedUnsure(), 0, false)).toBe(false);
  });

  it('says the offer once, on the touch that made it appear', () => {
    expect(teachOfferAppeared(NO_OFFER, 1, 2, true)).toBe(true);
    expect(teachOfferAppeared(NO_OFFER, 2, 3, true)).toBe(false);
    expect(teachOfferAppeared(NO_OFFER, 0, 1, true)).toBe(false);
    expect(teachOfferAppeared(dismissedOffer(), 1, 2, true)).toBe(false);
    expect(teachOfferAppeared(NO_OFFER, 1, 2, false)).toBe(false);
  });
});

describe('Home button', () => {
  it('shows when the lesson is there, or when the check failed; not while checking or when there is none', () => {
    expect(pujaEntryVisible(true, false)).toBe(true);
    expect(pujaEntryVisible(undefined, true)).toBe(true);
    expect(pujaEntryVisible(undefined, false)).toBe(false);
    expect(pujaEntryVisible(false, false)).toBe(false);
    // A later check failed, but the last answer was "no Navang puja here".
    expect(pujaEntryVisible(false, true)).toBe(false);
  });
});

describe('completing a puja', () => {
  const say = (slips: number, max: number) => {
    const l = pujaDoneNote(slips, max);
    return translate('en', l.key, l.vars);
  };
  it('says every touch in order, or how many wrong touches', () => {
    expect(say(0, 2)).toBe('Every touch in order.');
    expect(say(1, 2)).toBe('With 1 wrong touch.');
    expect(say(2, 2)).toBe('With 2 wrong touches.');
  });
  it('says how few wrong touches count when there were too many', () => {
    expect(say(3, 2)).toBe('With 3 wrong touches. Do it again with 2 or fewer for it to count.');
    expect(say(1, 0)).toBe('With 1 wrong touch. Do it again with every touch in order for it to count.');
    expect(say(4, 0)).toBe('With 4 wrong touches. Do it again with every touch in order for it to count.');
  });
  it('records the try as the lesson does, marked as the virtual puja', () => {
    expect(pujaTryDetail(1, 13)).toEqual({ mode: 'practice', slips: 1, spots: 13, via: 'virtual_puja' });
  });
});

describe('Learn the order', () => {
  it('opens the level screen at the learn step and comes back to the puja', () => {
    const found = findPuja([NAVANG]);
    if (!found?.learn) throw new Error('expected a learn step');
    expect(learnRoute(found.goal.id, found.learn)).toEqual({
      pathname: '/gyan/[goalId]/level/[levelId]',
      params: { goalId: 'navang', levelId: 'nine-places', step: 'learn', then: RETURN_TO_PUJA },
    });
  });

  it('knows when the learn step completes the lesson (the server then pays the level bonus too)', () => {
    const ids = ['learn', 'practice'];
    // The puja was done first: learning now finishes the one-level Navang lesson.
    expect(completesLevel(ids, 'learn', new Set(['practice']), false)).toBe(true);
    // Nothing done yet, or the lesson was already complete: no bonus now.
    expect(completesLevel(ids, 'learn', new Set(), false)).toBe(false);
    expect(completesLevel(ids, 'learn', new Set(['learn', 'practice']), true)).toBe(false);
    // A step that isn't in the level never completes it.
    expect(completesLevel(ids, 'gone', new Set(['learn', 'practice']), false)).toBe(false);
  });

  it('says what the server paid for learning the order, and never claims a number it could not read', () => {
    const say = (points: number | null, levelDone: boolean) => {
      const l = learnedLine(points, levelDone);
      return translate('en', l.key, l.vars);
    };
    expect(say(10, false)).toBe("You've learned the order · +10 points. Now do the puja.");
    expect(say(0, false)).toBe("You've learned the order. Now do the puja.");
    expect(say(30, true)).toBe("You've learned the order and finished the lesson · +30 points. Now do the puja.");
    expect(say(null, true)).toBe("You've learned the order and finished the lesson. Now do the puja.");
    expect(say(0, true)).toBe("You've learned the order and finished the lesson. Now do the puja.");
  });

  it('starts the try over only when the member finished the learn step, not when they backed out', () => {
    takeLearned(); // nothing left over from another test
    // Backed out of the lesson: nothing was handed over, so the try goes on.
    awaitLearned();
    expect(takeLearned()).toBeNull();
    // Finished: the puja is told what to say once it is back in front, once.
    awaitLearned();
    expect(handLearned('learned')).toBe(true);
    expect(takeLearned()).toBe('learned');
    expect(takeLearned()).toBeNull();
    // No puja waiting (the level screen was opened some other way): the level screen tells the member itself.
    expect(handLearned('learned')).toBe(false);
    expect(takeLearned()).toBeNull();
  });

  it('finds where a step starts in the lesson, and how many screens it has', () => {
    const screens = [{ step: { id: 'read' } }, { step: { id: 'quiz' } }, { step: { id: 'quiz' } }, { step: { id: 'quiz' } }, { step: { id: 'learn' } }];
    expect(stepRun(screens, 'read')).toEqual({ start: 0, count: 1 });
    expect(stepRun(screens, 'quiz')).toEqual({ start: 1, count: 3 });
    expect(stepRun(screens, 'learn')).toEqual({ start: 4, count: 1 });
    expect(stepRun(screens, 'gone')).toBeNull();
    expect(stepRun(screens, null)).toBeNull();
    expect(stepRun(screens, '')).toBeNull();
  });
});

describe('the puja route', () => {
  it('is part of Gyan Path: a deep link shows "not offered" when the module is off', () => {
    expect(blockingModule({}, 'puja')).toBeNull();
    expect(blockingModule({ gyan_path: false }, 'puja')).toBe('gyan_path');
    expect(blockingModule({ gyan_path: false }, '/puja')).toBe('gyan_path');
  });
});
