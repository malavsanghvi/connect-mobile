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
 * ("survey/<id>", as connect-crm queues for event feedback); that opens too
 * (survey links are the only ones known).
 */
export function notificationTarget(data: unknown): NotificationTarget | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as NotificationData;
  const type = str(d.type);
  if (!type) return surveyTarget(d);
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
