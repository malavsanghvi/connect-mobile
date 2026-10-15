import { describe, expect, it } from '@jest/globals';

import { en } from '../../i18n/en';
import {
  activeSection,
  DEFAULT_STORE_SECTION,
  groupStoreSections,
  hasSectionSwitch,
  isOrderable,
  itemsInCategory,
  MARKET_OPEN_TO_GUESTS,
  sectionOf,
  STORE_SECTION_LABEL_KEYS,
  STORE_SECTIONS,
} from '../store-sections';

// Rows as the database gives them (connect-crm 0821 added `section`); the extra fields of a real row are left out on purpose.
type Cat = { id: string; name: string; sort_order: number; section?: string | null };
type Item = { id: string; name: string; category_id: string | null; section?: string | null };
const cat = (id: string, section?: string | null, sort_order = 0): Cat => ({ id, name: id, sort_order, section });
const item = (id: string, category_id: string | null, section?: string | null): Item => ({ id, name: id, category_id, section });

const FOOD_CATS = [cat('baked', 'food', 1), cat('drinks', 'food', 2)];
const FOOD_ITEMS = [item('bars', 'baked', 'food'), item('cookies', 'drinks', 'food'), item('loose', null, 'food')];
const MARKET_CATS = [cat('gifts', 'market', 3), cat('print', 'market', 4)];
const MARKET_ITEMS = [item('mug', 'gifts', 'market'), item('book', 'print', 'market')];

describe('the sections of the store', () => {
  it('has two known sections, Food first, and says each one in the dictionary only', () => {
    expect(STORE_SECTIONS).toEqual(['food', 'market']);
    expect(DEFAULT_STORE_SECTION).toBe('food');
    expect(STORE_SECTION_LABEL_KEYS).toEqual({ food: 'store.section.food', market: 'store.section.market' });
    expect(en['store.section.food']).toBe('Food');
    expect(en['store.section.market']).toBe('Community Market');
  });

  it('reads a row with no section (a database older than 0821) as Food', () => {
    expect(sectionOf({})).toBe('food');
    expect(sectionOf({ section: undefined })).toBe('food');
    expect(sectionOf({ section: null })).toBe('food');
    expect(sectionOf({ section: 'food' })).toBe('food');
    expect(sectionOf({ section: 'market' })).toBe('market');
  });

  it('does not place a section it does not know (a newer portal wrote it)', () => {
    expect(sectionOf({ section: 'services' })).toBeNull();
    expect(sectionOf({ section: '' })).toBeNull();
    expect(sectionOf({ section: 'Food' })).toBeNull();
  });
});

describe('grouping what loadStore read: sections -> categories -> items', () => {
  it('puts a store with only Food rows in one Food section, with everything it had', () => {
    const sections = groupStoreSections(FOOD_CATS, FOOD_ITEMS);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('food');
    expect(sections[0].categories.map((c) => c.id)).toEqual(['baked', 'drinks']);
    expect(sections[0].items.map((i) => i.id)).toEqual(['bars', 'cookies', 'loose']);
    expect(hasSectionSwitch(sections)).toBe(false);
  });

  it('treats rows with no section at all as Food: an older database reads exactly as before', () => {
    const bareCats: Cat[] = [cat('baked', undefined, 1), cat('drinks', null, 2)];
    const bareItems: Item[] = [item('bars', 'baked'), item('cookies', 'drinks', null), item('loose', null)];
    const sections = groupStoreSections(bareCats, bareItems);
    expect(sections.map((s) => s.key)).toEqual(['food']);
    expect(sections[0].categories).toHaveLength(2);
    expect(sections[0].items).toHaveLength(3);
  });

  it('keeps the order the database gave (categories by sort_order, items by name)', () => {
    const sections = groupStoreSections([cat('b', 'food', 1), cat('a', 'food', 2)], [item('x', 'b'), item('m', 'a'), item('z', 'b')]);
    expect(sections[0].categories.map((c) => c.id)).toEqual(['b', 'a']);
    expect(sections[0].items.map((i) => i.id)).toEqual(['x', 'm', 'z']);
  });

  it('draws a second section when it has an active item, Food first, each with only its own categories and items', () => {
    const sections = groupStoreSections([...MARKET_CATS, ...FOOD_CATS], [...MARKET_ITEMS, ...FOOD_ITEMS]);
    expect(sections.map((s) => s.key)).toEqual(['food', 'market']);
    expect(hasSectionSwitch(sections)).toBe(true);
    const [food, market] = sections;
    expect(food.categories.map((c) => c.id)).toEqual(['baked', 'drinks']);
    expect(food.items.map((i) => i.id)).toEqual(['bars', 'cookies', 'loose']);
    expect(market.categories.map((c) => c.id)).toEqual(['gifts', 'print']);
    expect(market.items.map((i) => i.id)).toEqual(['mug', 'book']);
  });

  it('does not make the Community Market appear for a category alone, or a teaser of any kind', () => {
    const sections = groupStoreSections([...FOOD_CATS, ...MARKET_CATS], FOOD_ITEMS);
    expect(sections.map((s) => s.key)).toEqual(['food']);
    expect(sections[0].categories.map((c) => c.id)).toEqual(['baked', 'drinks']);
  });

  it('does not show a row whose section this build does not know', () => {
    const sections = groupStoreSections([...FOOD_CATS, cat('mystery', 'services', 9)], [...FOOD_ITEMS, item('odd', 'mystery', 'services')]);
    expect(sections.map((s) => s.key)).toEqual(['food']);
    expect(sections[0].categories.map((c) => c.id)).toEqual(['baked', 'drinks']);
    expect(sections[0].items.map((i) => i.id)).toEqual(['bars', 'cookies', 'loose']);
  });

  it('keeps an item with no category under its section, and only there', () => {
    const sections = groupStoreSections([...FOOD_CATS, ...MARKET_CATS], [...FOOD_ITEMS, item('poster', null, 'market')]);
    expect(sections[1].items.map((i) => i.id)).toEqual(['poster']);
    expect(sections[0].items.map((i) => i.id)).not.toContain('poster');
  });

  it('still draws Food, empty, for a store with nothing in it (it reads "Nothing is on the menu" under its heading)', () => {
    const sections = groupStoreSections(FOOD_CATS, []);
    expect(sections.map((s) => s.key)).toEqual(['food']);
    expect(sections[0].items).toEqual([]);
    expect(groupStoreSections([], []).map((s) => s.key)).toEqual(['food']);
  });

  it('draws the Community Market alone, without a switch, when it is all a community has', () => {
    const sections = groupStoreSections([...FOOD_CATS, ...MARKET_CATS], MARKET_ITEMS);
    expect(sections.map((s) => s.key)).toEqual(['market']);
    expect(hasSectionSwitch(sections)).toBe(false);
    expect(sections[0].categories.map((c) => c.id)).toEqual(['gifts', 'print']);
  });
});

describe('a guest looking around', () => {
  const all = [...MARKET_ITEMS, ...FOOD_ITEMS];

  it('reads the same rows and groups the Food store exactly as a member does', () => {
    const guest = groupStoreSections(FOOD_CATS, FOOD_ITEMS, { guest: true });
    const member = groupStoreSections(FOOD_CATS, FOOD_ITEMS, { guest: false });
    expect(guest).toEqual(member);
    expect(guest.map((s) => s.key)).toEqual(['food']);
  });

  it('does not see the Community Market while it is for members (decision CM14), and so gets no switch', () => {
    expect(MARKET_OPEN_TO_GUESTS).toBe(false);
    const sections = groupStoreSections([...FOOD_CATS, ...MARKET_CATS], all, { guest: true });
    expect(sections.map((s) => s.key)).toEqual(['food']);
    expect(hasSectionSwitch(sections)).toBe(false);
    expect(sections[0].items.map((i) => i.id)).toEqual(['bars', 'cookies', 'loose']);
  });

  it('a member of the same community sees both', () => {
    expect(groupStoreSections([...FOOD_CATS, ...MARKET_CATS], all, { guest: false }).map((s) => s.key)).toEqual(['food', 'market']);
    expect(groupStoreSections([...FOOD_CATS, ...MARKET_CATS], all).map((s) => s.key)).toEqual(['food', 'market']);
  });

  it('is shown an empty Food store, not a market, when the community has only market items', () => {
    const sections = groupStoreSections(MARKET_CATS, MARKET_ITEMS, { guest: true });
    expect(sections.map((s) => s.key)).toEqual(['food']);
    expect(sections[0].items).toEqual([]);
  });
});

describe('choosing a section and a category', () => {
  const sections = groupStoreSections([...FOOD_CATS, ...MARKET_CATS], [...FOOD_ITEMS, ...MARKET_ITEMS]);

  it('starts on the one that was picked, and on the first when the pick is no longer there', () => {
    expect(activeSection(sections, 'market').key).toBe('market');
    expect(activeSection(sections, 'food').key).toBe('food');
    expect(activeSection(groupStoreSections(FOOD_CATS, FOOD_ITEMS), 'market').key).toBe('food');
  });

  it('filters one section by a category chip, "All" with null, and treats a chip of another section as "All"', () => {
    const [food] = sections;
    expect(itemsInCategory(food, null).map((i) => i.id)).toEqual(['bars', 'cookies', 'loose']);
    expect(itemsInCategory(food, 'baked').map((i) => i.id)).toEqual(['bars']);
    expect(itemsInCategory(food, 'gifts').map((i) => i.id)).toEqual(['bars', 'cookies', 'loose']);
  });
});

describe('what can be ordered', () => {
  it('lets only a Food item into the cart, a pickup window and an order', () => {
    expect(isOrderable({ section: 'food' })).toBe(true);
    expect(isOrderable({})).toBe(true);
    expect(isOrderable({ section: null })).toBe(true);
    expect(isOrderable({ section: 'market' })).toBe(false);
    expect(isOrderable({ section: 'services' })).toBe(false);
  });
});
