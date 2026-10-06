/**
 * Where a tapped push notification opens (and which inline actions it offers).
 *
 * A small registry so every feature adds its own route here instead of
 * editing the listener: the push payload's `data.type` picks the entry.
 * Pure (no React Native imports) so it is unit-tested.
 *
 * Payload contract for senders (connect-crm notification worker):
 *   data: { type: '<registered type>', ...fields the route reads }
 *   categoryIdentifier: one of NOTIFICATION_CATEGORIES (for inline buttons)
 */

import { parseHomeworkLink } from './homework';

export type NotificationData = Record<string, unknown>;

/** An expo-router location: pathname plus string params. */
export type NotificationTarget = { pathname: string; params?: Record<string, string> };

export type NotificationRoute = {
  /** Where tapping the notification (or an action without its own handler) opens. */
  open: (data: NotificationData) => NotificationTarget | null;
};

const routes = new Map<string, NotificationRoute>();

export function registerNotificationRoute(type: string, route: NotificationRoute): void {
  routes.set(type, route);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Target for a notification's data, or null when nothing here knows it (the
 * app just opens). A push without a `type` may still carry a `deep_link`
 * ("survey/<id>", as connect-crm queues for event feedback, or
 * "/gyan/homework/<id>?person=<id>" for homework); that opens too (survey and
 * homework links are the only ones known).
 */
export function notificationTarget(data: unknown): NotificationTarget | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as NotificationData;
  const type = str(d.type);
  if (!type) return surveyTarget(d) ?? homeworkLinkTarget(d, false);
  const route = routes.get(type);
  if (!route) return null;
  return route.open(d);
}

// ---------------------------------------------------------------------------
// Family circle (Saathi): "Anya finished Learn Navkar Mantra!" / "Dev could
// use your support" → My Jain Way › Saathi. Inline actions send anumodana or
// open the support card.
// ---------------------------------------------------------------------------

export const FAMILY_CIRCLE = 'family_circle';

/** iOS/Android notification categories with inline buttons (registered at start-up). */
export const NOTIFICATION_CATEGORIES = {
  familyCelebrate: 'family_circle_celebrate',
  familySupport: 'family_circle_support',
} as const;

export const NOTIFICATION_ACTIONS = {
  sendAnumodana: 'send_anumodana',
  encourage: 'encourage',
} as const;

registerNotificationRoute(FAMILY_CIRCLE, {
  open: (d) => {
    const params: Record<string, string> = { tab: 'saathi' };
    const person = str(d.person_id);
    if (person) params.person = person;
    return { pathname: '/jain-way', params };
  },
});

/** For the inline "Send anumodana" action: whom to cheer. */
export function familyCircleRecipient(data: unknown): { personId: string; name: string } | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as NotificationData;
  if (str(d.type) !== FAMILY_CIRCLE) return null;
  const personId = str(d.person_id);
  return personId ? { personId, name: str(d.person_name) ?? '' } : null;
}

// ---------------------------------------------------------------------------
// Event feedback: when an event completes connect-crm opens its survey and
// pushes a request now, then a reminder on day 1 and day 2 (templates
// event_survey / event_survey_reminder; data: survey_id, event_id,
// reward_points, deep_link "survey/<id>"). Tapping opens the survey itself.
// ---------------------------------------------------------------------------

export const EVENT_SURVEY = 'event_survey';
export const EVENT_SURVEY_REMINDER = 'event_survey_reminder';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The survey a push points at: data.survey_id, else data.deep_link "survey/<id>". Null if neither is a survey id. */
export function surveyIdFromData(d: NotificationData): string | null {
  const direct = str(d.survey_id);
  if (direct && UUID.test(direct)) return direct;
  const link = str(d.deep_link);
  const m = link ? /^\/?survey\/([^/?#]+)\/?$/i.exec(link) : null;
  return m && UUID.test(m[1]) ? m[1] : null;
}

function surveyTarget(d: NotificationData): NotificationTarget | null {
  const id = surveyIdFromData(d);
  return id ? { pathname: '/survey/[id]', params: { id } } : null;
}

registerNotificationRoute(EVENT_SURVEY, { open: surveyTarget });
registerNotificationRoute(EVENT_SURVEY_REMINDER, { open: surveyTarget });

// ---------------------------------------------------------------------------
// Homework (connect-crm 0587): "homework" to the learner (assigned, sent back,
// accepted) and "homework_parent" to the household adults (a child's answer
// waits for their OK; the teacher's decision). The worker forwards `type`,
// `deep_link` ("/gyan/homework/<assignment id>?person=<learner id>"),
// `assignment_id`, `submission_id` and `learner_id`; `person_id` is the
// RECIPIENT and is never forwarded (a parent's push must not open the parent's
// own item). A "homework_review" push (teachers, who review in the portal) has
// no route here: a tap just opens the app.
// ---------------------------------------------------------------------------

export const HOMEWORK = 'homework';
export const HOMEWORK_PARENT = 'homework_parent';

function uuidField(v: unknown): string | null {
  const s = str(v);
  return s && UUID.test(s) ? s : null;
}

/**
 * The homework a push points at: its deep link, else `assignment_id` with `learner_id` (the person whose answer it is).
 * `person_id` is read as an alias of `learner_id` only when the recipient is the learner (`homework` pushes); for any
 * other push it names someone else. Null when there is no usable assignment.
 */
function homeworkLinkTarget(d: NotificationData, recipientIsLearner: boolean): NotificationTarget | null {
  const link = parseHomeworkLink(str(d.deep_link));
  const assignmentId = link?.assignmentId ?? uuidField(d.assignment_id);
  if (!assignmentId) return null;
  const personId = link?.personId ?? uuidField(d.learner_id) ?? (recipientIsLearner ? uuidField(d.person_id) : null);
  return { pathname: '/gyan/homework/[assignmentId]', params: { assignmentId, ...(personId ? { person: personId } : {}) } };
}

/** To the learner: the item when the push says which (without a person it is their own), else the homework list. */
function homeworkTarget(d: NotificationData): NotificationTarget {
  return homeworkLinkTarget(d, true) ?? { pathname: '/gyan/homework' };
}

/**
 * To a household adult: the child's item when the push names the child. Without the child there is nothing right to
 * open (the adult's own item does not exist), so null: the app opens, and Home shows the "Needs your OK" strip.
 */
function homeworkParentTarget(d: NotificationData): NotificationTarget | null {
  const target = homeworkLinkTarget(d, false);
  return target?.params?.person ? target : null;
}

registerNotificationRoute(HOMEWORK, { open: homeworkTarget });
registerNotificationRoute(HOMEWORK_PARENT, { open: homeworkParentTarget });
