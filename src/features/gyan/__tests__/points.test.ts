import { describe, expect, it } from '@jest/globals';

import { en } from '../../../i18n/en';
import { translate } from '../../../i18n';
import { confettiPieces } from '../celebrate';
import { attemptLine, counterLine, levelBonus, parseAttemptResult, practiceCap } from '../points';

describe('parseAttemptResult', () => {
  it('reads the RPC answer', () => {
    expect(parseAttemptResult({ points_awarded: 3, tries_today: 4, cap: 10, first_time: false })).toEqual({ pointsAwarded: 3, triesToday: 4, cap: 10, firstTime: false });
  });
  it('defaults safely', () => {
    expect(parseAttemptResult(null)).toEqual({ pointsAwarded: 0, triesToday: 0, cap: 10, firstTime: false });
    expect(parseAttemptResult({ cap: 0 }).cap).toBe(10);
  });
});

describe('practiceCap', () => {
  it('reads the community rule with a default of 10', () => {
    expect(practiceCap({ points: { gyan_practice_daily_cap: 5 } })).toBe(5);
    expect(practiceCap({ points: { gyan_practice_daily_cap: '12' } })).toBe(12);
    expect(practiceCap(null)).toBe(10);
  });
});

describe('attemptLine', () => {
  const say = (l: ReturnType<typeof attemptLine>) => translate('en', l.key, l.vars);
  it('says the points and the counter', () => {
    expect(say(attemptLine({ pointsAwarded: 3, triesToday: 4, cap: 10, firstTime: false }, true))).toBe('+3 points · 4 of 10 today');
  });
  it('says when the day is capped', () => {
    expect(say(attemptLine({ pointsAwarded: 0, triesToday: 10, cap: 10, firstTime: false }, true))).toBe("Today's practice points are done — keep practising!");
  });
  it('shows the counter for a try that did not count', () => {
    expect(say(attemptLine({ pointsAwarded: 0, triesToday: 4, cap: 10, firstTime: false }, false))).toBe('Not counted this time · 4 of 10 today');
  });
  it('says a success with no repeat points plainly', () => {
    expect(say(attemptLine({ pointsAwarded: 0, triesToday: 2, cap: 10, firstTime: true }, true))).toBe('Well done · 2 of 10 today');
  });
  it('has a counter line', () => {
    expect(translate('en', counterLine(3, 10).key, counterLine(3, 10).vars)).toBe('3 of 10 today');
    expect(translate('en', counterLine(10, 10).key, counterLine(10, 10).vars)).toBe('10 of 10 today · points are done for today');
  });
  it('uses keys that exist', () => {
    for (const k of ['gyan.tryPoints', 'gyan.tryCapped', 'gyan.tryCounted', 'gyan.tryNotCounted', 'gyan.counter', 'gyan.counterDone']) expect(k in en).toBe(true);
  });
});

describe('levelBonus', () => {
  it('pays the level points (no sign-off) and the treasure once', () => {
    expect(levelBonus({ points: 20, requires_teacher_signoff: false, treasure_points: 50 }, false)).toEqual({ bonus: 20, treasure: 50 });
    expect(levelBonus({ points: 20, requires_teacher_signoff: true, treasure_points: 0 }, false)).toEqual({ bonus: 0, treasure: 0 });
    expect(levelBonus({ points: 20, requires_teacher_signoff: false }, true)).toEqual({ bonus: 0, treasure: 0 });
  });
});

describe('confettiPieces', () => {
  it('is the same for a seed and stays in range', () => {
    const a = confettiPieces(7, 20);
    expect(a).toEqual(confettiPieces(7, 20));
    expect(a).toHaveLength(20);
    for (const p of a) {
      expect(p.rise).toBeLessThanOrEqual(0);
      expect(p.fall).toBeGreaterThan(0);
      expect(p.color).toBeLessThan(5);
      expect(p.delay).toBeLessThanOrEqual(0.2);
    }
  });
});
