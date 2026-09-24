import { describe, expect, it } from '@jest/globals';

import { en, type StringKey } from '../../i18n/en';
import {
  accuracyPercent,
  attendanceSummary,
  classSchedule,
  registrationOpen,
  behindDays,
  categoryLabel,
  circleStatus,
  communityName,
  continueGoalId,
  currentChapter,
  formatSources,
  goalMark,
  levelStars,
  mapLayout,
  parseClockTime,
  pointRules,
  pointsEarned,
  practiceTiming,
  relativeWhen,
  reminderClock,
  saathiNeedsAttention,
  sortByTime,
  splitFeed,
  standingTone,
  tintBackground,
  todayAtMinutes,
  type FeedItem,
} from '../learning';

const t = (k: StringKey) => en[k];

describe('community and points', () => {
  it('uses the short name, then the name', () => {
    expect(communityName({ short_name: 'JSH', name: 'Jain Society of Houston' })).toBe('JSH');
    expect(communityName({ short_name: '', name: 'Jain Center' })).toBe('Jain Center');
    expect(communityName(null)).toBe('');
  });
  it('reads centers.rules.points with server defaults', () => {
    expect(pointRules({ points: { anumodana_points: 7, support_points: 4, day_complete_bonus: 25 } })).toEqual({ anumodana: 7, support: 4, dayBonus: 25 });
    expect(pointRules(null)).toEqual({ anumodana: 5, support: 3, dayBonus: 20 });
    expect(pointRules({ points: { day_complete_bonus: '30' } }).dayBonus).toBe(30);
  });
});

describe('practices', () => {
  it('labels the five prototype categories and title-cases others', () => {
    expect(categoryLabel('mantra_jaap', t)).toBe('Mantra & jaap');
    expect(categoryLabel('swadhyay_learning', t)).toBe('Swadhyay & learning');
    expect(categoryLabel('seva', t)).toBe('Seva');
  });
  it('uses published timings for Navkarsi and Chauvihar', () => {
    expect(practiceTiming({ key: 'navkarsi', default_time: null }, { navkarsi: '08:02:00' })).toEqual({ label: '8:02 AM', minutes: 482, kind: 'by' });
    expect(practiceTiming({ key: 'chauvihar', default_time: null }, { chauvihar: '19:21' })).toEqual({ label: '7:21 PM', minutes: 1161, kind: 'before' });
    expect(practiceTiming({ key: 'samayik', default_time: '18:00:00' }, null)).toEqual({ label: '6:00 PM', minutes: 1080, kind: 'at' });
    expect(practiceTiming({ key: 'navkarsi', default_time: null }, null).kind).toBe('anytime');
  });
  it('sorts by time with untimed practices last in catalog order', () => {
    const rows = [
      { id: 'a', sort_order: 1, m: null },
      { id: 'b', sort_order: 2, m: 1080 },
      { id: 'c', sort_order: 3, m: 405 },
      { id: 'd', sort_order: 0, m: null },
    ];
    expect(sortByTime(rows, (r) => r.m).map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
  });
  it('reminds 10 minutes before, across midnight', () => {
    expect(reminderClock(405)).toEqual({ hour: 6, minute: 35 });
    expect(reminderClock(5)).toEqual({ hour: 23, minute: 55 });
  });
  it('colours standing green at top 20%', () => {
    expect(standingTone(18)).toBe('green');
    expect(standingTone(20)).toBe('green');
    expect(standingTone(27)).toBe('saffron');
    expect(standingTone(null)).toBe('none');
  });
});

describe('pachchakhan reminder', () => {
  it('finds a clock time in the "when" text', () => {
    expect(parseClockTime('48 minutes after sunrise · today 8:02 AM')).toBe(482);
    expect(parseClockTime('Midday · about 1:15 PM today')).toBe(795);
    expect(parseClockTime('Before sunset · today by 7:21 p.m.')).toBe(1161);
    expect(parseClockTime('12:30 PM')).toBe(750);
    expect(parseClockTime('12 AM')).toBe(0);
    expect(parseClockTime('08:02')).toBe(482);
    expect(parseClockTime('One meal, one sitting')).toBeNull();
    expect(parseClockTime(null)).toBeNull();
  });
  it('turns center wall-clock minutes into a Date', () => {
    const now = new Date('2026-09-24T15:00:00Z'); // 10:00 AM in Chicago (CDT)
    expect(todayAtMinutes(13 * 60 + 15, now, 'America/Chicago').toISOString()).toBe('2026-09-24T18:15:00.000Z');
  });
});

const item = (o: Partial<FeedItem>): FeedItem => ({
  kind: 'daily_goal_met',
  person_id: 'p1',
  person_name: 'Rahul',
  title: 'Completed today’s practices',
  detail: '5 practices',
  occurred_at: '2026-09-24T12:00:00Z',
  anumodana_count: 0,
  i_sent: false,
  ...o,
});

describe('saathi', () => {
  it('reads the days from a behind detail', () => {
    expect(behindDays('No practice logged for 3 days')).toBe(3);
    expect(behindDays('something else')).toBeNull();
  });
  it('keeps one daily card per person and separates support asks', () => {
    const feed = [
      item({ occurred_at: '2026-09-23T12:00:00Z' }),
      item({ occurred_at: '2026-09-24T12:00:00Z' }),
      item({ kind: 'goal_completed', person_id: 'p2', occurred_at: '2026-09-24T10:00:00Z' }),
      item({ kind: 'behind', person_id: 'p3' }),
    ];
    const { celebrate, behind } = splitFeed(feed);
    expect(celebrate.map((c) => `${c.kind}:${c.occurred_at}`)).toEqual(['daily_goal_met:2026-09-24T12:00:00Z', 'goal_completed:2026-09-24T10:00:00Z']);
    expect(behind).toHaveLength(1);
  });
  it('shows the red dot until everything is cheered', () => {
    expect(saathiNeedsAttention([item({})], true)).toBe(true);
    expect(saathiNeedsAttention([item({ i_sent: true })], true)).toBe(false);
    expect(saathiNeedsAttention([item({ i_sent: true }), item({ kind: 'behind', person_id: 'p9' })], true)).toBe(true);
    expect(saathiNeedsAttention([item({ i_sent: true }), item({ kind: 'behind', person_id: 'p9' })], false)).toBe(false);
  });
  it('describes when an item happened', () => {
    const now = new Date('2026-09-24T20:00:00Z'); // 3 PM Chicago
    expect(relativeWhen('2026-09-24T19:30:00Z', now, 'America/Chicago')).toEqual({ key: 'saathi.when.now' });
    expect(relativeWhen('2026-09-24T18:00:00Z', now, 'America/Chicago')).toEqual({ key: 'saathi.when.hours', n: 2 });
    expect(relativeWhen('2026-09-24T13:00:00Z', now, 'America/Chicago')).toEqual({ key: 'saathi.when.morning' });
    expect(relativeWhen('2026-09-23T13:00:00Z', now, 'America/Chicago')).toEqual({ key: 'saathi.when.yesterday' });
    expect(relativeWhen('2026-09-20T13:00:00Z', now, 'America/Chicago')).toEqual({ key: 'saathi.when.days', n: 4 });
  });
  it('picks a member status', () => {
    const base = { visible: true, doneToday: 0, selected: 3, behind: null, completedGoal: false };
    expect(circleStatus({ ...base, visible: false })).toBe('private');
    expect(circleStatus({ ...base, behind: item({ kind: 'behind' }) })).toBe('behind');
    expect(circleStatus({ ...base, behind: item({ kind: 'behind', i_sent: true }) })).toBe('encouraged');
    expect(circleStatus({ ...base, doneToday: 3 })).toBe('met');
    expect(circleStatus({ ...base, completedGoal: true })).toBe('completed');
    expect(circleStatus(base)).toBe('onTrack');
  });
});

describe('gyan path', () => {
  it('lightens the goal tint for the map', () => {
    expect(tintBackground('#1B2C5C')).toBe('#E8EAEF');
    expect(tintBackground(null)).toBe('#F6EFE3');
  });
  it('uses the mark or the goal initial', () => {
    expect(goalMark({ mark: 'S', name: 'Learn Samayik' })).toBe('S');
    expect(goalMark({ mark: null, name: 'Learn Logassa sutra' })).toBe('L');
  });
  it('zigzags nodes and adds chapter pills', () => {
    const levels = [{ chapter: 'Chapter 1 · Foundations' }, { chapter: 'Chapter 1 · Foundations' }, { chapter: 'Chapter 2 · Sutras' }, { chapter: 'Chapter 2 · Sutras' }];
    const { items, height } = mapLayout(levels, 1, 390);
    expect(items.map((i) => i.kind)).toEqual(['chapter', 'node', 'node', 'chapter', 'node', 'node']);
    const nodes = items.filter((i): i is Extract<typeof i, { kind: 'node' }> => i.kind === 'node');
    expect(nodes.map((n) => n.x)).toEqual([195, 280, 195, 110]);
    expect(nodes.map((n) => n.size)).toEqual([66, 84, 66, 76]);
    expect(height).toBeGreaterThan(nodes[3].y + nodes[3].size);
  });
  it('names the current chapter without its number', () => {
    const levels = [{ chapter: 'Chapter 1 · Foundations' }, { chapter: 'Chapter 2 · Sutras of Samayik' }, { chapter: null }];
    expect(currentChapter(levels, 0)).toBe('Foundations');
    expect(currentChapter(levels, 2)).toBe('Sutras of Samayik');
    expect(currentChapter([{ chapter: null }], 0)).toBeNull();
  });
  it('scores stars, accuracy and points credited', () => {
    expect(levelStars([3, 2, 3])).toBe(2);
    expect(levelStars([])).toBe(0);
    expect(accuracyPercent(1, 2)).toBe(50);
    expect(accuracyPercent(0, 0)).toBe(100);
    const steps = [
      { id: 'a', points: 5 },
      { id: 'b', points: 5 },
      { id: 'c', points: 10 },
    ];
    expect(pointsEarned(steps, new Set(['a']))).toBe(15);
    expect(pointsEarned(steps, new Set(['a', 'b', 'c']))).toBe(0);
  });
  it('continues the most recent unfinished goal', () => {
    const goals = [
      { id: 'g1', recommended: true, done: false },
      { id: 'g2', recommended: false, done: false },
      { id: 'g3', recommended: false, done: true },
    ];
    const done = (g: { done: boolean }) => g.done;
    expect(continueGoalId(goals, new Map([['g2', '2026-09-20'], ['g3', '2026-09-23']]), done)).toBe('g2');
    expect(continueGoalId(goals, new Map(), done)).toBe('g1');
  });
});

describe('niva', () => {
  it('formats sources', () => {
    expect(formatSources(['JSH website', { title: 'About JSH' }, 'JSH website'])).toBe('JSH website · About JSH');
    expect(formatSources([])).toBeNull();
    expect(formatSources(null)).toBeNull();
  });
});

describe('Pathshala enrollment and attendance', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const term = { status: 'registration', registration_opens_at: null, registration_closes_at: null, ends_on: '2027-05-30' };
  it('takes requests while registration is open', () => {
    expect(registrationOpen(term, now)).toBe(true);
    expect(registrationOpen({ ...term, registration_closes_at: '2026-09-01T00:00:00Z' }, now)).toBe(false);
    expect(registrationOpen({ ...term, status: 'draft' }, now)).toBe(false);
    expect(registrationOpen({ ...term, status: 'closed' }, now)).toBe(false);
  });
  it('an active term takes requests only inside its window', () => {
    expect(registrationOpen({ ...term, status: 'active' }, now)).toBe(false);
    expect(registrationOpen({ ...term, status: 'active', registration_opens_at: '2026-09-01T00:00:00Z', registration_closes_at: '2026-10-01T00:00:00Z' }, now)).toBe(true);
    expect(registrationOpen({ ...term, status: 'active', registration_opens_at: '2026-10-01T00:00:00Z' }, now)).toBe(false);
  });
  it('formats the class schedule like the prototype', () => {
    expect(classSchedule('sunday', '10:00:00')).toBe('Sundays 10:00 AM');
    expect(classSchedule('saturday', '14:30')).toBe('Saturdays 2:30 PM');
    expect(classSchedule('sunday', null)).toBe('Sundays');
    expect(classSchedule(null, null)).toBeNull();
  });
  it('summarises attendance with the latest class day first', () => {
    const s = attendanceSummary([
      { status: 'present', held_on: '2026-09-13' },
      { status: 'absent', held_on: '2026-09-06' },
      { status: 'late', held_on: '2026-09-20' },
    ]);
    expect(s).toEqual({ last: { status: 'late', held_on: '2026-09-20' }, attended: 2, total: 3 });
    expect(attendanceSummary([])).toEqual({ last: null, attended: 0, total: 0 });
  });
});
