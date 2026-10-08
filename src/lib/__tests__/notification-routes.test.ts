import { describe, expect, it } from '@jest/globals';

import { routeForNotification } from '../../features/event-rules';
import { boliIdFromData, eventIdFromData, familyCircleRecipient, notificationTarget, registerNotificationRoute, surveyIdFromData } from '../notification-routes';

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
    const PARENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const target = { pathname: '/gyan/homework/[assignmentId]', params: { assignmentId: ASSIGNMENT, person: PERSON } };
    it('open the homework the deep link names, for the learner and for a parent', () => {
      expect(notificationTarget({ type: 'homework', deep_link: `/gyan/homework/${ASSIGNMENT}?person=${PERSON}` })).toEqual(target);
      expect(notificationTarget({ type: 'homework_parent', deep_link: `/gyan/homework/${ASSIGNMENT}?person=${PERSON}` })).toEqual(target);
      expect(notificationTarget({ type: 'homework', deep_link: `gyan/homework/${ASSIGNMENT}` })).toEqual({ pathname: '/gyan/homework/[assignmentId]', params: { assignmentId: ASSIGNMENT } });
    });
    it('follow the deep link without a type too', () => {
      expect(notificationTarget({ deep_link: `/gyan/homework/${ASSIGNMENT}?person=${PERSON}` })).toEqual(target);
    });
    it('read the ids the worker forwards (assignment_id and learner_id) when there is no link', () => {
      expect(notificationTarget({ type: 'homework', assignment_id: ASSIGNMENT, learner_id: PERSON })).toEqual(target);
      expect(notificationTarget({ type: 'homework_parent', assignment_id: ASSIGNMENT, learner_id: PERSON })).toEqual(target);
      expect(notificationTarget({ type: 'homework', assignment_id: ASSIGNMENT })).toEqual({ pathname: '/gyan/homework/[assignmentId]', params: { assignmentId: ASSIGNMENT } });
    });
    it("open the child's item for the real payload of a parent's push", () => {
      const payload = { type: 'homework_parent', deep_link: `/gyan/homework/${ASSIGNMENT}?person=${PERSON}`, assignment_id: ASSIGNMENT, submission_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', learner_id: PERSON };
      expect(notificationTarget(payload)).toEqual(target);
      expect(notificationTarget({ ...payload, deep_link: undefined })).toEqual(target);
    });
    it('keep person_id as an alias of learner_id for the learner own push only (it is the recipient everywhere else)', () => {
      expect(notificationTarget({ type: 'homework', assignment_id: ASSIGNMENT, person_id: PERSON })).toEqual(target);
      expect(notificationTarget({ assignment_id: ASSIGNMENT, person_id: PERSON })).toEqual({ pathname: '/gyan/homework/[assignmentId]', params: { assignmentId: ASSIGNMENT } });
      // learner_id wins over person_id, and a parent's person_id never opens the parent's own item.
      expect(notificationTarget({ type: 'homework', assignment_id: ASSIGNMENT, learner_id: PERSON, person_id: PARENT })).toEqual(target);
      expect(notificationTarget({ type: 'homework_parent', assignment_id: ASSIGNMENT, person_id: PARENT })).toBeNull();
      expect(notificationTarget({ type: 'homework_parent', assignment_id: ASSIGNMENT, learner_id: PERSON, person_id: PARENT })).toEqual(target);
    });
    it('open the homework list for the learner, and the app for a parent, when the push names no usable item', () => {
      expect(notificationTarget({ type: 'homework' })).toEqual({ pathname: '/gyan/homework' });
      expect(notificationTarget({ type: 'homework', deep_link: 'gyan/homework/not-an-id' })).toEqual({ pathname: '/gyan/homework' });
      // A parent without the child: nothing right to open (their own item does not exist), so the app just opens on Home.
      expect(notificationTarget({ type: 'homework_parent' })).toBeNull();
      expect(notificationTarget({ type: 'homework_parent', deep_link: 'gyan/homework/not-an-id' })).toBeNull();
      expect(notificationTarget({ type: 'homework_parent', assignment_id: ASSIGNMENT })).toBeNull();
      expect(notificationTarget({ deep_link: 'gyan/homework/not-an-id' })).toBeNull();
    });
    it('give a teacher\'s homework_review push no route (they review in the portal)', () => {
      expect(notificationTarget({ type: 'homework_review', assignment_id: ASSIGNMENT, submission_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', learner_id: PERSON })).toBeNull();
    });
  });

  describe('Pathshala pushes (connect-crm 0591: the data the push worker forwards is type, deep_link and learner_id)', () => {
    const TERM = '22222222-2222-4222-8222-222222222222';
    const LEARNER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const learn = { pathname: '/jain-way', params: { tab: 'three_l', section: 'learn' } };
    it("open 3L › Learn for every learner's news (/pathshala?person=<id>) until the learner's page exists", () => {
      // pathshala_registered, _payment_due, _hold_reminder, _hold_released, _waitlisted, _placed, _membership_hold,
      // _hold_lifted, _child_added and the registration summary all send this link (app._pathshala_vars).
      expect(notificationTarget({ type: 'pathshala', deep_link: `/pathshala?person=${LEARNER}`, learner_id: LEARNER })).toEqual(learn);
      expect(notificationTarget({ type: 'pathshala', deep_link: `/pathshala?person=${LEARNER}` })).toEqual(learn);
    });
    it('open registration for the term the link names (the summary of a child being added, "child not added")', () => {
      expect(notificationTarget({ type: 'pathshala', deep_link: `/pathshala-enroll?term=${TERM}` })).toEqual({ pathname: '/pathshala-enroll', params: { term: TERM } });
      expect(notificationTarget({ type: 'pathshala', deep_link: '/pathshala-enroll?term=not-an-id' })).toEqual({ pathname: '/pathshala-enroll' });
    });
    it('open a real screen for every message 0591 sends (app._pathshala_route keeps type, deep_link and learner_id, nulls stripped)', () => {
      const learner = (template: string) => ({ template, data: { type: 'pathshala', deep_link: `/pathshala?person=${LEARNER}`, learner_id: LEARNER }, opens: learn });
      const table = [
        // app._pathshala_vars: one learner's news to the household's adults.
        learner('pathshala_registered'),
        learner('pathshala_payment_due'),
        learner('pathshala_hold_reminder'),
        learner('pathshala_hold_released'),
        learner('pathshala_waitlisted'),
        learner('pathshala_placed'),
        learner('pathshala_membership_hold'),
        learner('pathshala_hold_lifted'),
        learner('pathshala_child_added'),
        // register_pathshala_children: the summary links the first line's learner, or the term when that line is a child being added.
        learner('pathshala_registration_received'),
        { template: 'pathshala_registration_received', data: { type: 'pathshala', deep_link: `/pathshala-enroll?term=${TERM}` }, opens: { pathname: '/pathshala-enroll', params: { term: TERM } } },
        // pathshala_change_request_trigger: the office declined to add the child.
        { template: 'pathshala_child_not_added', data: { type: 'pathshala', deep_link: `/pathshala-enroll?term=${TERM}` }, opens: { pathname: '/pathshala-enroll', params: { term: TERM } } },
      ];
      for (const row of table) expect([row.template, notificationTarget(row.data)]).toEqual([row.template, row.opens]);
    });
    it('open 3L › Learn for a Pathshala push without a usable link', () => {
      expect(notificationTarget({ type: 'pathshala' })).toEqual(learn);
      expect(notificationTarget({ type: 'pathshala', deep_link: `/somewhere/${LEARNER}` })).toEqual(learn);
      expect(notificationTarget({ type: 'pathshala', deep_link: '/guide/membership' })).toEqual(learn);
    });
    it('follow a Pathshala link without a type too, and nothing else', () => {
      expect(notificationTarget({ deep_link: `/pathshala-enroll?term=${TERM}` })).toEqual({ pathname: '/pathshala-enroll', params: { term: TERM } });
      expect(notificationTarget({ deep_link: `/pathshala?person=${LEARNER}` })).toEqual(learn);
      expect(notificationTarget({ deep_link: '/settings' })).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// connect-crm 0596 / 0598: the pushes the server sends, with the payloads it really queues. Each is opened by exactly one
// of the two routers (this registry, or the event-notification router in src/features/event-rules.ts).
// ---------------------------------------------------------------------------
describe('notice pushes (connect-crm 0596 and 0598)', () => {
  const BOLI = '99999999-9999-4999-8999-999999999999';
  const ORDER = '88888888-8888-4888-8888-888888888888';
  const DAY = '77777777-7777-4777-8777-777777777777';
  const SLOT = '66666666-6666-4666-8666-666666666666';

  // What the worker forwards (pushRouting): type, deep_link and the routing ids; never the recipient.
  const payloads = {
    boli_outbid: { type: 'boli_outbid', deep_link: `/boli/${BOLI}`, boli_id: BOLI, event_id: EVENT },
    boli_closing: { type: 'boli_closing', deep_link: `/boli/${BOLI}`, boli_id: BOLI },
    store_order_ready: { type: 'store_order_ready', deep_link: '/store', order_id: ORDER },
    lunch_reminder: { type: 'lunch_reminder', deep_link: `/event/${EVENT}/tickets`, event_id: EVENT },
    rsvp_confirm: { type: 'rsvp_confirm', deep_link: `/event/${EVENT}/confirm`, event_id: EVENT },
    special_day: { type: 'special_day', deep_link: `/labh/${DAY}`, special_day_id: DAY },
  };

  it('opens the boli for "another family pledged more" and for the notice before it closes', () => {
    const target = { pathname: '/boli/[id]', params: { id: BOLI } };
    expect(notificationTarget(payloads.boli_outbid)).toEqual(target);
    expect(notificationTarget(payloads.boli_closing)).toEqual(target);
    // The id from the deep link when boli_id is missing.
    expect(notificationTarget({ type: 'boli_outbid', deep_link: `/boli/${BOLI}` })).toEqual(target);
    expect(notificationTarget({ type: 'boli_closing', deep_link: `boli/${BOLI}/` })).toEqual(target);
    expect(boliIdFromData({ boli_id: BOLI })).toBe(BOLI);
  });
  it('opens the app only when a boli push names no usable boli', () => {
    expect(notificationTarget({ type: 'boli_outbid' })).toBeNull();
    expect(notificationTarget({ type: 'boli_outbid', boli_id: 'not-an-id' })).toBeNull();
    expect(notificationTarget({ type: 'boli_closing', deep_link: '/boli/not-an-id' })).toBeNull();
    expect(notificationTarget({ type: 'boli_closing', deep_link: `/give/${BOLI}` })).toBeNull();
    expect(notificationTarget({ type: 'boli_closing', deep_link: `/boli/${BOLI}/../../x` })).toBeNull();
  });
  it('opens the store for "your order is ready"', () => {
    expect(notificationTarget(payloads.store_order_ready)).toEqual({ pathname: '/store' });
    expect(notificationTarget({ type: 'store_order_ready' })).toEqual({ pathname: '/store' });
  });
  it('opens the event tickets for the lunch reminder, by event id or by deep link (old payloads had only event_id and slot_id)', () => {
    const target = { pathname: '/event/[id]/tickets', params: { id: EVENT } };
    expect(notificationTarget(payloads.lunch_reminder)).toEqual(target);
    expect(notificationTarget({ type: 'lunch_reminder', event_id: EVENT, slot_id: SLOT })).toEqual(target);
    expect(notificationTarget({ type: 'lunch_reminder', deep_link: `/event/${EVENT}/tickets` })).toEqual(target);
    expect(notificationTarget({ type: 'lunch_reminder' })).toBeNull();
    expect(notificationTarget({ type: 'lunch_reminder', event_id: 'nope', deep_link: '/event/nope/tickets' })).toBeNull();
    expect(eventIdFromData({ deep_link: `/event/${EVENT}/confirm` })).toBe(EVENT);
  });

  it('leaves the RSVP confirmation and the special-day prompt to the event router (confirm pop-up with Yes / Change, the labh screen)', () => {
    expect(routeForNotification(payloads.rsvp_confirm, null)).toEqual({ kind: 'confirm_popup', eventId: EVENT });
    expect(routeForNotification(payloads.rsvp_confirm, 'confirm_yes')).toEqual({ kind: 'confirm_yes', eventId: EVENT });
    expect(routeForNotification(payloads.rsvp_confirm, 'confirm_change')).toEqual({ kind: 'confirm_screen', eventId: EVENT });
    expect(routeForNotification(payloads.special_day, null)).toEqual({ kind: 'labh', dayId: DAY });
    expect(notificationTarget(payloads.rsvp_confirm)).toBeNull();
    expect(notificationTarget(payloads.special_day)).toBeNull();
  });

  it('opens each push exactly once: one router answers, never both (no double navigation)', () => {
    for (const [template, data] of Object.entries(payloads)) {
      const registry = notificationTarget(data);
      const events = routeForNotification(data, null);
      expect([template, Number(registry !== null) + Number(events !== null)]).toEqual([template, 1]);
    }
    // The event feedback pushes (0596) too: the registry only.
    const survey = { type: 'event_survey', survey_id: SURVEY, event_id: EVENT, deep_link: `survey/${SURVEY}` };
    expect(Number(notificationTarget(survey) !== null) + Number(routeForNotification(survey, null) !== null)).toBe(1);
  });

  it('just opens the app for an old, unknown or empty payload', () => {
    for (const data of [undefined, null, {}, [], 'boli', { type: 'something_new' }, { type: 'boli' }, { deep_link: `/boli/${BOLI}` }, { type: 'rsvp_confirm' }]) {
      expect([data, notificationTarget(data) === null && routeForNotification(data, null) === null]).toEqual([data, true]);
    }
  });
});
