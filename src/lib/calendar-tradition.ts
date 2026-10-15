import type { CalendarLayer, CalendarMonth } from './api/calendar';

/**
 * The calendars of a community whose category has no tradition of its own (connect-crm 0594: only a category that uses a
 * tradition has the shared library, `layout.traditionContent`): its own calendars, and the shared ones that are not a
 * tradition's panchang or festivals. No tithi on any day, and nothing on a layer that was left out.
 *
 * Pure (a type import only), so the rule is unit-tested without the data layer.
 */
export function ownCalendarsOnly(month: CalendarMonth, centerId: string | null): CalendarMonth {
  const keep = (l: CalendarLayer) => (!!centerId && l.center_id === centerId) || (l.kind !== 'tithi' && l.kind !== 'festival');
  const layers = month.layers.filter(keep);
  const ids = new Set(layers.map((l) => l.id));
  return { layers, items: month.items.filter((i) => ids.has(i.layerId)), tithis: {} };
}
