import { describe, expect, it } from '@jest/globals';

import { routeForNotification } from '../../features/event-rules';
import { familyCircleRecipient, notificationTarget, registerNotificationRoute, surveyIdFromData } from '../notification-routes';

const SURVEY = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const EVENT = '5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9';

describe('notification routes', () => {
  it('opens the Saathi tab for family-circle pushes', () => {
    expect(notificationTarget({ type: 'family_circle', person_id: 'p1' })).toEqual({ pathname: '/jain-way', params: { tab: 'saathi', person: 'p1' } });
    expect(notificationTarget({ type: 'family_circle' })).toEqual({ pathname: '/jain-way', params: { tab: 'saathi' } });
  });
  it('ignores unknown or malformed payloads', () => {
    expect(notificationTarget({ type: 'nope' })).toBeNull();
    expect(notificationTarget(null)).toBeNull();
    expect(notificationTarget(['family_circle'])).toBeNull();
  });
  it('lets features register their own routes', () => {
    registerNotificationRoute('survey_test', { open: (d) => ({ pathname: '/survey/[id]', params: { id: String(d.survey_id) } }) });
    expect(notificationTarget({ type: 'survey_test', survey_id: 's1' })).toEqual({ pathname: '/survey/[id]', params: { id: 's1' } });
  });
  it('reads the anumodana recipient', () => {
    expect(familyCircleRecipient({ type: 'family_circle', person_id: 'p1', person_name: 'Anya' })).toEqual({ personId: 'p1', name: 'Anya' });
    expect(familyCircleRecipient({ type: 'family_circle' })).toBeNull();
    expect(familyCircleRecipient({ type: 'other', person_id: 'p1' })).toBeNull();
  });
  describe('event feedback pushes', () => {
    const target = { pathname: '/survey/[id]', params: { id: SURVEY } };
    it('open the survey for the first request and for each reminder', () => {
      expect(notificationTarget({ type: 'event_survey', survey_id: SURVEY, event_id: EVENT, reward_points: 25 })).toEqual(target);
      expect(notificationTarget({ type: 'event_survey_reminder', survey_id: SURVEY })).toEqual(target);
    });
    it('follow the deep link the server queues ("survey/<id>"), with or without a type', () => {
      expect(notificationTarget({ type: 'event_survey', deep_link: `survey/${SURVEY}` })).toEqual(target);
      expect(notificationTarget({ deep_link: `survey/${SURVEY}` })).toEqual(target);
      expect(notificationTarget({ deep_link: `/survey/${SURVEY}` })).toEqual(target);
    });
    it('do nothing for a survey push without a usable survey id', () => {
      expect(notificationTarget({ type: 'event_survey' })).toBeNull();
      expect(notificationTarget({ type: 'event_survey', survey_id: 'not-an-id' })).toBeNull();
      expect(notificationTarget({ deep_link: 'survey/not-an-id' })).toBeNull();
      expect(notificationTarget({ deep_link: 'event/' + EVENT })).toBeNull();
      expect(notificationTarget({ deep_link: `survey/${SURVEY}/../../x` })).toBeNull();
    });
    it('read the survey id from survey_id first, then the link', () => {
      expect(surveyIdFromData({ survey_id: SURVEY, deep_link: 'survey/ignored' })).toBe(SURVEY);
      expect(surveyIdFromData({ deep_link: `survey/${SURVEY}` })).toBe(SURVEY);
      expect(surveyIdFromData({})).toBeNull();
    });
    it('are handled by this registry only, never also by the event-notification router (no double navigation)', () => {
      expect(routeForNotification({ type: 'event_survey', survey_id: SURVEY, deep_link: `survey/${SURVEY}` }, null)).toBeNull();
      expect(routeForNotification({ type: 'event_survey_reminder', survey_id: SURVEY, event_id: EVENT }, null)).toBeNull();
      expect(routeForNotification({ survey_id: SURVEY, deep_link: `survey/${SURVEY}` }, null)).toBeNull();
    });
  });

  describe('homework pushes (connect-crm 0587)', () => {
    const ASSIGNMENT = '11111111-1111-4111-8111-111111111111';
    const PERSON = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const target = { pathname: '/gyan/homework/[assignmentId]', params: { assignmentId: ASSIGNMENT, person: PERSON } };
    it('open the homework the deep link names, for the learner and for a parent', () => {
      expect(notificationTarget({ type: 'homework', deep_link: `/gyan/homework/${ASSIGNMENT}?person=${PERSON}` })).toEqual(target);
      expect(notificationTarget({ type: 'homework_parent', deep_link: `/gyan/homework/${ASSIGNMENT}?person=${PERSON}` })).toEqual(target);
      expect(notificationTarget({ type: 'homework', deep_link: `gyan/homework/${ASSIGNMENT}` })).toEqual({ pathname: '/gyan/homework/[assignmentId]', params: { assignmentId: ASSIGNMENT } });
    });
    it('follow the deep link without a type too', () => {
      expect(notificationTarget({ deep_link: `/gyan/homework/${ASSIGNMENT}?person=${PERSON}` })).toEqual(target);
    });
    it('read the ids from fields when there is no link', () => {
      expect(notificationTarget({ type: 'homework', assignment_id: ASSIGNMENT, person_id: PERSON })).toEqual(target);
      expect(notificationTarget({ type: 'homework_parent', assignment_id: ASSIGNMENT })).toEqual({ pathname: '/gyan/homework/[assignmentId]', params: { assignmentId: ASSIGNMENT } });
    });
    it('open the homework list when the worker forwarded no payload yet (README gap 29)', () => {
      expect(notificationTarget({ type: 'homework' })).toEqual({ pathname: '/gyan/homework' });
      expect(notificationTarget({ type: 'homework_parent', deep_link: 'gyan/homework/not-an-id' })).toEqual({ pathname: '/gyan/homework' });
      expect(notificationTarget({ deep_link: 'gyan/homework/not-an-id' })).toBeNull();
    });
  });
});
