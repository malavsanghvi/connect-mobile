import { describe, expect, it } from '@jest/globals';

import { translate } from '../../i18n';
import { isSurveyOpen, parseDismissals, pickSurveyForPopup, pointsLine, POPUP_DAYS_AFTER_OPEN, recordDismissal, surveyOpenedAt, surveyPopupDecision, type PopupSurvey } from '../survey-popup';

const TZ = 'America/Chicago';
const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars);

// 2026-09-20 18:00 Chicago (CDT, UTC-5) = 23:00 UTC: the evening the event's survey opens.
const OPENED = '2026-09-20T23:00:00.000Z';
const at = (iso: string) => new Date(iso);

function survey(over: Partial<PopupSurvey> = {}): PopupSurvey {
  return {
    id: 's1',
    kind: 'event_feedback',
    status: 'open',
    event_id: 'e1',
    opens_at: OPENED,
    closes_at: '2026-10-04T23:00:00.000Z', // 14 days later
    completion_started_at: OPENED,
    created_at: '2026-09-01T12:00:00.000Z',
    ...over,
  };
}

const decide = (over: { survey?: Partial<PopupSurvey>; now?: string; completed?: boolean; dismissals?: Record<string, string> } = {}) =>
  surveyPopupDecision({ survey: survey(over.survey), now: at(over.now ?? '2026-09-20T23:05:00.000Z'), tz: TZ, completed: over.completed, dismissals: over.dismissals ?? {} });

describe('feedback pop-up: should it show?', () => {
  it('shows when an event survey has just opened and the member has not answered', () => {
    expect(decide()).toBe('show');
  });

  it('does not show for a survey that is not open', () => {
    expect(decide({ survey: { status: 'closed' } })).toBe('not_open');
    expect(decide({ survey: { status: 'draft' } })).toBe('not_open');
    expect(decide({ survey: { opens_at: '2026-09-21T23:00:00.000Z' } })).toBe('not_open');
    expect(decide({ survey: { closes_at: '2026-09-20T22:00:00.000Z' } })).toBe('not_open');
  });

  it('does not show for surveys that are not event feedback', () => {
    expect(decide({ survey: { kind: 'poll' } })).toBe('not_event_feedback');
    expect(decide({ survey: { event_id: null } })).toBe('not_event_feedback');
  });

  it('does not show once the member has answered', () => {
    expect(decide({ completed: true })).toBe('completed');
  });

  it('shows on the day it opened and on each of the next two local days, then stops', () => {
    expect(POPUP_DAYS_AFTER_OPEN).toBe(2);
    expect(decide({ now: '2026-09-21T15:00:00.000Z' })).toBe('show'); // day 1
    expect(decide({ now: '2026-09-22T15:00:00.000Z' })).toBe('show'); // day 2
    expect(decide({ now: '2026-09-23T15:00:00.000Z' })).toBe('window_over'); // day 3: only the card remains
    expect(decide({ now: '2026-09-30T15:00:00.000Z' })).toBe('window_over');
  });

  it('counts days at the center, not in UTC', () => {
    // Opened 6:00 PM Chicago on the 20th. 11:30 PM Chicago on the 22nd is already the 23rd in UTC, but still day 2 locally.
    expect(decide({ now: '2026-09-23T04:30:00.000Z' })).toBe('show');
    // 12:30 AM Chicago on the 23rd is day 3.
    expect(decide({ now: '2026-09-23T05:30:00.000Z' })).toBe('window_over');
  });

  it('does not nag twice in one local day, but may show again the next day', () => {
    const dismissed = { s1: '2026-09-21' };
    expect(decide({ now: '2026-09-21T15:00:00.000Z', dismissals: dismissed })).toBe('dismissed_today');
    expect(decide({ now: '2026-09-22T15:00:00.000Z', dismissals: dismissed })).toBe('show');
    // Another survey's dismissal does not count.
    expect(decide({ now: '2026-09-21T15:00:00.000Z', dismissals: { other: '2026-09-21' } })).toBe('show');
  });

  it('a dismissal is for the center day: 11:30 PM Chicago is still "today" there', () => {
    expect(decide({ now: '2026-09-21T04:30:00.000Z', dismissals: { s1: '2026-09-20' } })).toBe('dismissed_today');
  });

  it('falls back to completion_started_at, then creation, when opens_at is missing', () => {
    expect(surveyOpenedAt({ opens_at: null, completion_started_at: OPENED, created_at: '2026-09-01T00:00:00.000Z' })?.toISOString()).toBe(OPENED);
    expect(surveyOpenedAt({ opens_at: null, completion_started_at: null, created_at: '2026-09-20T23:00:00.000Z' })?.toISOString()).toBe(OPENED);
    expect(surveyOpenedAt({ opens_at: null, completion_started_at: null, created_at: 'garbage' })).toBeNull();
    // An unknown opening never shows the pop-up.
    expect(decide({ survey: { opens_at: null, completion_started_at: null, created_at: 'garbage' } })).toBe('window_over');
  });

  it('isSurveyOpen honours status and the opens/closes window', () => {
    const now = at('2026-09-21T12:00:00.000Z');
    expect(isSurveyOpen({ status: 'open', opens_at: null, closes_at: null }, now)).toBe(true);
    expect(isSurveyOpen({ status: 'open', opens_at: '2026-09-21T12:00:00.000Z', closes_at: '2026-09-22T00:00:00.000Z' }, now)).toBe(true);
    expect(isSurveyOpen({ status: 'open', opens_at: null, closes_at: '2026-09-21T12:00:00.000Z' }, now)).toBe(false);
    expect(isSurveyOpen({ status: 'closed', opens_at: null, closes_at: null }, now)).toBe(false);
  });
});

describe('feedback pop-up: which survey', () => {
  const req = (id: string, over: Partial<PopupSurvey> = {}) => ({ survey: survey({ id, ...over }), eventName: id });
  const ctx = { now: at('2026-09-21T15:00:00.000Z'), tz: TZ, dismissals: {} as Record<string, string> };

  it('picks the first request that should show (newest first)', () => {
    expect(pickSurveyForPopup([req('a'), req('b')], ctx)?.survey.id).toBe('a');
  });
  it('skips ones already closed today, answered, or past the window', () => {
    expect(pickSurveyForPopup([req('a'), req('b')], { ...ctx, dismissals: { a: '2026-09-21' } })?.survey.id).toBe('b');
    expect(pickSurveyForPopup([req('a'), req('b')], { ...ctx, completedIds: new Set(['a']) })?.survey.id).toBe('b');
    expect(pickSurveyForPopup([req('old', { opens_at: '2026-09-10T00:00:00.000Z', completion_started_at: null }), req('b')], ctx)?.survey.id).toBe('b');
  });
  it('is null when nothing qualifies', () => {
    expect(pickSurveyForPopup([], ctx)).toBeNull();
    expect(pickSurveyForPopup([req('a')], { ...ctx, dismissals: { a: '2026-09-21' } })).toBeNull();
  });
});

describe('feedback pop-up: remembered dismissals', () => {
  it('reads stored junk safely', () => {
    expect(parseDismissals(null)).toEqual({});
    expect(parseDismissals(['x'])).toEqual({});
    expect(parseDismissals({ a: '2026-09-21', b: 5, c: 'yesterday', d: '2026-13-45' })).toEqual({ a: '2026-09-21' });
  });
  it('records today and forgets old entries', () => {
    const next = recordDismissal({ old: '2026-08-01', recent: '2026-09-15' }, 's1', '2026-09-21');
    expect(next).toEqual({ recent: '2026-09-15', s1: '2026-09-21' });
  });
  it('replaces an earlier dismissal of the same survey', () => {
    expect(recordDismissal({ s1: '2026-09-20' }, 's1', '2026-09-21')).toEqual({ s1: '2026-09-21' });
  });
});

describe('feedback pop-up: points wording', () => {
  it('says how many community points the survey earns', () => {
    expect(pointsLine(t, 'earn', 25, 'JSH')).toBe('Earn 25 JSH points for sharing your feedback');
    expect(pointsLine(t, 'earned', 25, 'JSH')).toBe('You earned 25 JSH points.');
  });
  it('uses the singular for one point and says nothing for none', () => {
    expect(pointsLine(t, 'earn', 1, 'JSH')).toBe('Earn 1 JSH point for sharing your feedback');
    expect(pointsLine(t, 'earned', 1, 'JSH')).toBe('You earned 1 JSH point.');
    expect(pointsLine(t, 'earn', 0, 'JSH')).toBeNull();
    expect(pointsLine(t, 'earned', 0, 'JSH')).toBeNull();
  });
  it('does not leave a double space when the community has no short name', () => {
    expect(pointsLine(t, 'earn', 10, '')).toBe('Earn 10 points for sharing your feedback');
  });
});
