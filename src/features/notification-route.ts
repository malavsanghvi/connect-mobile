/**
 * Where a tapped push notification should open. Payload keys (data):
 *   special_day_id → the Birthday labh screen for that day
 *   path           → any in-app path starting with "/" (no scheme, no "//")
 * Anything else opens nothing (the app just comes to the front).
 */
export function notificationPath(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.special_day_id === 'string' && /^[0-9a-f-]{36}$/i.test(d.special_day_id)) return `/labh/${d.special_day_id}`;
  if (typeof d.path === 'string' && /^\/(?!\/)[\w\-/?=&.%[\]]*$/.test(d.path)) return d.path;
  return null;
}
