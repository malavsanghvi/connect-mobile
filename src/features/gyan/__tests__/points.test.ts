import { describe, expect, it } from '@jest/globals';

import { en } from '../../../i18n/en';
import { translate } from '../../../i18n';
import { attemptDetail, attemptLine, counterLine, levelAwards, MAX_ATTEMPT_DETAIL_BYTES, parseAttemptResult, practiceCap, scoreStars, triesPay, type AttemptResult } from '../points';

const result = (o: Partial<AttemptResult>): AttemptResult => ({ pointsAwarded: 0, tryPoints: 0, stepPoints: 0, levelPoints: 0, treasurePoints: 0, triesToday: 0, cap: 10, firstTime: false, replayed: false, ...o });

describe('parseAttemptResult', () => {
  it('reads the RPC answer', () => {
    expect(parseAttemptResult({ points_awarded: 13, try_points: 3, step_points: 10, level_points: 0, treasure_points: 0, tries_today: 1, cap: 10, first_time: true, level_complete: false })).toEqual(
      result({ pointsAwarded: 13, tryPoints: 3, stepPoints: 10, triesToday: 1, firstTime: true }),
    );
  });
  it('defaults safely', () => {
    expect(parseAttemptResult(null)).toEqual(result({}));
    expect(parseAttemptResult({ points_awarded: 3 }).tryPoints).toBe(3);
  });
  it('keeps a cap of 0: try points are switched off', () => {
    expect(parseAttemptResult({ cap: 0 }).cap).toBe(0);
    expect(parseAttemptResult({ cap: 5000 }).cap).toBe(1000);
  });
  it('without try_points, leaves the once-only awards out of the practice part', () => {
    expect(parseAttemptResult({ points_awarded: 33, step_points: 10, level_points: 20 }).tryPoints).toBe(3);
    expect(parseAttemptResult({ points_awarded: 10, step_points: 10 }).tryPoints).toBe(0);
  });
  it('reads a replayed answer (the same try sent again)', () => {
    expect(parseAttemptResult({ points_awarded: 3, try_points: 3, tries_today: 2, cap: 10, replayed: true })).toEqual(result({ pointsAwarded: 3, tryPoints: 3, triesToday: 2, replayed: true }));
  });
});

describe('scoreStars', () => {
  it('matches the server rule', () => {
    expect(scoreStars(100)).toBe(3);
    expect(scoreStars(90)).toBe(3);
    expect(scoreStars(89)).toBe(2);
    expect(scoreStars(60)).toBe(2);
    expect(scoreStars(59)).toBe(1);
  });
});

describe('practiceCap', () => {
  it('reads the community rule the way the server does, with a default of 10', () => {
    expect(practiceCap({ points: { gyan_practice_daily_cap: 5 } })).toBe(5);
    expect(practiceCap({ points: { gyan_practice_daily_cap: 5.9 } })).toBe(5);
    expect(practiceCap({ points: { gyan_practice_daily_cap: 0 } })).toBe(0);
    expect(practiceCap({ points: { gyan_practice_daily_cap: -3 } })).toBe(0);
    expect(practiceCap({ points: { gyan_practice_daily_cap: 1e9 } })).toBe(1000);
    // The server reads JSON numbers only; a string means the default.
    expect(practiceCap({ points: { gyan_practice_daily_cap: '12' } })).toBe(10);
    expect(practiceCap(null)).toBe(10);
  });
  it('says whether tries earn points', () => {
    expect(triesPay(10, 3)).toBe(true);
    expect(triesPay(0, 3)).toBe(false);
    expect(triesPay(10, 0)).toBe(false);
  });
});

describe('attemptLine', () => {
  const say = (l: ReturnType<typeof attemptLine>) => translate('en', l.key, l.vars);
  it('says the points and the counter', () => {
    expect(say(attemptLine(result({ pointsAwarded: 3, tryPoints: 3, triesToday: 4 }), true, 3))).toBe('+3 points · 4 of 10 today');
  });
  it('says when the day is capped', () => {
    expect(say(attemptLine(result({ triesToday: 10 }), true, 3))).toBe("Today's practice points are done — keep practising!");
  });
  it('shows the counter for a try that did not count', () => {
    expect(say(attemptLine(result({ triesToday: 4 }), false, 3))).toBe('Not counted this time · 4 of 10 today');
  });
  it('says a success with no repeat points plainly', () => {
    expect(say(attemptLine(result({ triesToday: 2, firstTime: true }), true, 3))).toBe('Well done · 2 of 10 today');
  });
  it('has no counter when try points are switched off (cap 0) or the step has none', () => {
    expect(say(attemptLine(result({ cap: 0, triesToday: 1 }), true, 3))).toBe('Well done!');
    expect(say(attemptLine(result({ cap: 0, pointsAwarded: 15, stepPoints: 15, firstTime: true }), true, 3))).toBe('+15 points');
    expect(say(attemptLine(result({ cap: 0 }), false, 3))).toBe('Not counted this time. Have another go.');
    expect(say(attemptLine(result({ triesToday: 3 }), true, 0))).toBe('Well done!');
  });
  it('has a counter line', () => {
    expect(translate('en', counterLine(3, 10).key, counterLine(3, 10).vars)).toBe('3 of 10 today');
    expect(translate('en', counterLine(10, 10).key, counterLine(10, 10).vars)).toBe('10 of 10 today · points are done for today');
  });
  it('uses keys that exist', () => {
    for (const k of ['gyan.tryPoints', 'gyan.tryCapped', 'gyan.tryCounted', 'gyan.tryNotCounted', 'gyan.counter', 'gyan.counterDone', 'gyan.tryPointsOnly', 'gyan.tryWellDone', 'gyan.tryNotCountedOnly']) expect(k in en).toBe(true);
  });
});

describe('levelAwards', () => {
  const level = { stepIds: ['s1', 's2', 's3'], levelId: 'L' };
  const rows = [
    { points: 10, reason: 'level', ref_id: 's1' },
    { points: 15, reason: 'level', ref_id: 's2' },
    { points: 20, reason: 'level', ref_id: 'L' },
    { points: 50, reason: 'gyan_treasure', ref_id: 'L' },
    { points: 3, reason: 'gyan_try', ref_id: 's2' },
    { points: 99, reason: 'level', ref_id: 'other' },
  ];
  it('adds up what the server paid for this level', () => {
    expect(levelAwards(rows, { ...level, alreadyDone: new Set(), wasLevelDone: false })).toEqual({ steps: 25, bonus: 20, treasure: 50 });
  });
  it('leaves out steps done before the lesson and a level already done', () => {
    expect(levelAwards(rows, { ...level, alreadyDone: new Set(['s1']), wasLevelDone: true })).toEqual({ steps: 15, bonus: 0, treasure: 0 });
  });
  it('shows no bonus when the server paid none (a step added to a level paid long ago)', () => {
    expect(levelAwards(rows.slice(0, 1), { ...level, alreadyDone: new Set(['s2', 's3']), wasLevelDone: false })).toEqual({ steps: 10, bonus: 0, treasure: 0 });
  });
});

describe('attemptDetail', () => {
  // UTF-8 length: each %XX of encodeURIComponent is one byte.
  const bytes = (o: unknown) => encodeURIComponent(JSON.stringify(o)).replace(/%[0-9A-F]{2}/g, 'x').length;
  it('adds the try id', () => {
    expect(attemptDetail({ mode: 'practice', slips: 1 }, 'abc')).toEqual({ mode: 'practice', slips: 1, try_id: 'abc' });
  });
  it('stays under 2 KB and always keeps the try id', () => {
    const long = attemptDetail({ heard: 'नमो '.repeat(400), found: 5, total: 9 }, 'abc');
    expect(long).toEqual({ found: 5, total: 9, try_id: 'abc' });
    expect(bytes(long)).toBeLessThanOrEqual(MAX_ATTEMPT_DETAIL_BYTES);
    const many = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`k${i}`, i]));
    expect(attemptDetail(many, 'abc')).toEqual({ try_id: 'abc' });
  });
});
