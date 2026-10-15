/**
 * The store's sections (connect-crm migration 0821, docs/STORE_SECTIONS.md §4): Food, and the Community Market once a
 * community has something in it. Pure (no React, no Supabase), so the whole rule is unit-tested.
 *
 * What the app reads is unchanged: both tables, the same filters (`loadStore` in ./api/store). Only the way the rows are
 * drawn changes:
 *
 *   - sections come above categories: section -> categories -> items;
 *   - a row with no `section` (a database older than 0821) is Food, and a row with a section this build does not know
 *     is not shown (a newer portal wrote it; the app does not guess a place for it);
 *   - Food is always there. The Community Market is there only when it holds an active item, so a store that has none
 *     reads exactly as it always has, under one "Food" heading;
 *   - only a Food item is ever ordered (cart, pickup window, order). A Community Market item is shown, never added.
 */
import type { Tables } from './database.types';

export type StoreCategory = Tables<'store_categories'>;
export type StoreItemRow = Tables<'store_items'>;

/** The section keys the database knows, in the order they are drawn. A key never changes; a section's name can. */
export const STORE_SECTIONS = ['food', 'market'] as const;
export type StoreSectionKey = (typeof STORE_SECTIONS)[number];

/** The section a row without one belongs to (every row written before 0821, and every installed portal that does not write it). */
export const DEFAULT_STORE_SECTION: StoreSectionKey = 'food';

/**
 * The dictionary key of each section's name (src/i18n/en.ts). The Community Market's name is the owner's to change
 * (docs/STORE_MARKETPLACE.md decision CM1), so it is said in one place only: the string `store.section.market`.
 */
export const STORE_SECTION_LABEL_KEYS = {
  food: 'store.section.food',
  market: 'store.section.market',
} as const satisfies Record<StoreSectionKey, string>;

/**
 * Whether a visitor who has not signed in sees the Community Market. Off: the plan's decision CM14 is members only by
 * default (docs/STORE_MARKETPLACE.md). The database does not hide market rows from a guest of an open community, so
 * this is the app's decision, in one place. A guest's Food store is exactly as before.
 */
export const MARKET_OPEN_TO_GUESTS = false;

function isSectionKey(v: unknown): v is StoreSectionKey {
  return typeof v === 'string' && (STORE_SECTIONS as readonly string[]).includes(v);
}

/**
 * The section of a category or an item: its own `section`, Food when it has none (an older database), or null when it
 * names a section this build does not know.
 */
export function sectionOf(row: { section?: string | null }): StoreSectionKey | null {
  const s = row.section;
  if (s === undefined || s === null) return DEFAULT_STORE_SECTION;
  return isSectionKey(s) ? s : null;
}

/** Only a Food item goes in the cart, a pickup window and an order. A Community Market item is shown and never added. */
export function isOrderable(item: { section?: string | null }): boolean {
  return sectionOf(item) === 'food';
}

export type StoreSectionView<I extends { section?: string | null } = StoreItemRow, C extends { section?: string | null } = StoreCategory> = {
  key: StoreSectionKey;
  /** This section's categories, in the order the database gave them (`sort_order`). */
  categories: C[];
  /** This section's items. An item with no category is under "All" only. */
  items: I[];
};

/**
 * Group what `loadStore` read as sections -> categories -> items, the sections the visitor sees, in order.
 *
 * Food is always first and always there, so an empty store still reads "Nothing is on the menu right now" under its
 * heading. The Community Market follows only when it has at least one active item (a category alone does not make it
 * appear) and the visitor may see it. When Food has nothing and the Community Market has, the market is the only
 * section: the store is drawn with it alone, without a switch.
 */
export function groupStoreSections<I extends { section?: string | null }, C extends { section?: string | null }>(
  categories: readonly C[],
  items: readonly I[],
  options: { guest?: boolean } = {},
): StoreSectionView<I, C>[] {
  const withItems = STORE_SECTIONS.filter((key) => {
    if (key === 'market' && options.guest && !MARKET_OPEN_TO_GUESTS) return false;
    return items.some((i) => sectionOf(i) === key);
  });
  const keys: StoreSectionKey[] = withItems.length > 0 ? withItems : [DEFAULT_STORE_SECTION];
  return keys.map((key) => ({
    key,
    categories: categories.filter((c) => sectionOf(c) === key),
    items: items.filter((i) => sectionOf(i) === key),
  }));
}

/** True when the store has more than one section to choose between (the switch above the category chips). */
export function hasSectionSwitch(sections: readonly { key: StoreSectionKey }[]): boolean {
  return sections.length > 1;
}

/**
 * The section being looked at: the one picked while it is still there, else the first. A picked market that vanished
 * (the last listing was withdrawn while the screen was open) falls back to Food rather than showing nothing.
 */
export function activeSection<S extends { key: StoreSectionKey }>(sections: readonly S[], picked: StoreSectionKey): S {
  return sections.find((s) => s.key === picked) ?? sections[0];
}

/** The items of a section under one category chip (null = "All"); a category that is not this section's counts as "All". */
export function itemsInCategory<I extends { category_id: string | null }>(section: { categories: readonly { id: string }[]; items: readonly I[] }, categoryId: string | null): I[] {
  if (categoryId === null || !section.categories.some((c) => c.id === categoryId)) return [...section.items];
  return section.items.filter((i) => i.category_id === categoryId);
}
