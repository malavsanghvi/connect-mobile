/**
 * Which notification topics the app lists (pure, so it is unit-tested).
 *
 * connect-crm 0598 adds notification_topics.has_sender: false for a topic nothing in Weaver sends (daily temple timings,
 * My Jain Way reminders, family celebrations, newsletters, alerts, account), so the app hides its switch instead of showing
 * one that does nothing. A portal that has not been updated yet sends no such column, and then every topic is shown, as
 * before.
 */
export function topicHasSender(topic: { key?: string; has_sender?: boolean | null }): boolean {
  return topic.has_sender !== false;
}
