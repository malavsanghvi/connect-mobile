import { isTabVisible, type ModuleMap } from './modules';

/** Route names of the five tabs in `(app)/(tabs)`, in prototype order. */
export const TABS = ['index', 'events', 'give', 'jain-way', 'family'] as const;
export type TabName = (typeof TABS)[number];

/**
 * What the bottom bar holds: the five tabs, then Niva as the sixth item (owner, 2026-10-07: the floating Niva button sat on top of
 * the cards). Niva is not a tab of the navigator: it opens the Ask Niva chat on top of whatever the member was on.
 */
export type BarItem = TabName | 'niva';

/**
 * The items the bar shows, in order. A tab whose modules the community switched off is left out, and Niva is there only for
 * someone who may use Ask Niva (the organization's access level for it, and its module on: not for a visitor, and not below the
 * level the organization asks for).
 */
export function barItems(map: ModuleMap, nivaAllowed: boolean): BarItem[] {
  const tabs: BarItem[] = TABS.filter((tab) => isTabVisible(map, tab));
  return nivaAllowed ? [...tabs, 'niva'] : tabs;
}
