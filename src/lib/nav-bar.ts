import { isTabVisible, type ModuleMap } from './modules';
import type { ResolvedTabs } from './template';

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
 * level the organization asks for). A kind of organization with no fourth tab (a chamber of commerce) leaves "jain-way" out.
 *
 * `template` (src/lib/template.ts resolveTabs) can reorder the tabs and hide some; it never adds one: a tab whose modules are off, or
 * that the kind of organization does not have, stays out whatever the template says. Without it the order is TABS.
 */
export function barItems(map: ModuleMap, nivaAllowed: boolean, practiceTab: boolean = true, template?: Pick<ResolvedTabs, 'order' | 'hidden'>): BarItem[] {
  // The fourth tab (route "jain-way", whatever it is called) is there when the kind of organization has one (its practice term) and a module of it is on.
  const order: readonly TabName[] = template?.order ?? TABS;
  const tabs: BarItem[] = order.filter((tab) => !template?.hidden.has(tab) && isTabVisible(map, tab) && (tab !== 'jain-way' || practiceTab));
  return nivaAllowed ? [...tabs, 'niva'] : tabs;
}
