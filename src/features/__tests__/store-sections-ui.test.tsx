import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import StoreScreen from '@/app/(app)/store';
import { WordsProvider, SettingsProvider } from '@/providers/settings';
import { wordsFor } from '@/i18n/categories';
import { genericProfile } from '@/lib/categories';
import type { StoreItem } from '@/lib/api/store';
import { CartProvider, useCart } from '@/providers/cart';

// What the screen asks the database for, and the app state it reads (the community, the family, whether the visitor is a guest).
const mockLoadStore = jest.fn<() => Promise<{ categories: unknown[]; items: unknown[] }>>();
const mockWindows = jest.fn<() => Promise<unknown[]>>();
const mockApp: { center: unknown; member: unknown; guest: boolean } = { center: null, member: null, guest: false };
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/providers/app', () => ({ useApp: () => mockApp }));
jest.mock('@/lib/api/store', () => ({
  loadStore: () => mockLoadStore(),
  listPickupWindows: () => mockWindows(),
  listMyOrders: async () => [],
  giftPackCents: () => null,
  cancelMyOrder: async () => undefined,
}));
jest.mock('@/lib/api/files', () => ({ BUCKETS: { storePhotos: 'store-photos' }, signedUrls: async () => new Map<string, string>() }));
// The header and drawer are not under test; the screen's content and its footer are.
jest.mock('@/components/screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return { Screen: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => createElement(View, null, children, footer) };
});
jest.mock('@/lib/storage', () => ({ readPref: async (_k: string, fallback: unknown) => fallback, writePref: async () => undefined }));

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const row = (over: Partial<StoreItem> & { id: string; name: string }): StoreItem =>
  ({
    center_id: 'c1',
    category_id: null,
    sku: null,
    description: null,
    photo_path: null,
    price_cents: 500,
    pack_size: null,
    taxable: false,
    track_inventory: false,
    stock_on_hand: 0,
    low_stock_threshold: null,
    status: 'active',
    qbo_item_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    gift_pack: false,
    custom: {},
    section: 'food',
    ...over,
  }) as StoreItem;
const category = (id: string, name: string, sort_order: number, section: string | undefined = 'food') => ({ id, center_id: 'c1', name, sort_order, custom: {}, section });

const FOOD_CATEGORIES = [category('baked', 'Baked', 1), category('drinks', 'Drinks', 2)];
const FOOD_ITEMS = [row({ id: 'bars', name: 'Lemon bars', category_id: 'baked', price_cents: 450, description: 'Six to a box' }), row({ id: 'tea', name: 'Iced tea', category_id: 'drinks', price_cents: 300 })];
const MARKET_CATEGORIES = [category('gifts', 'Gifts', 3, 'market')];
const MARKET_ITEMS = [row({ id: 'mug', name: 'Engraved mug', category_id: 'gifts', section: 'market', price_cents: 1200, description: 'Laser engraved with a name' })];

async function render(el: ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={insets}>
        <SettingsProvider>
          <CartProvider>{el}</CartProvider>
        </SettingsProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

const flat = (node: ReactTestInstance): string =>
  [node.props.children]
    .flat(Infinity)
    .map((c: unknown) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('');
const texts = (tree: ReactTestRenderer): string[] => tree.root.findAllByType(Text).map(flat).filter(Boolean);
const hasText = (tree: ReactTestRenderer, s: string): boolean => texts(tree).some((t) => t === s);
const mentions = (tree: ReactTestRenderer, re: RegExp): boolean => texts(tree).some((t) => re.test(t));
const isPressable = (n: ReactTestInstance): boolean => typeof n.props.onPress === 'function' && typeof n.props.accessibilityRole === 'string';
const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] =>
  tree.root.findAll((n) => isPressable(n) && (n.props.accessibilityLabel === label || (n.props.accessibilityLabel === undefined && n.findAllByType(Text).some((x) => flat(x) === label))));
const press = async (tree: ReactTestRenderer, label: string): Promise<void> => {
  const hit = pressables(tree, label)[0];
  if (!hit) throw new Error(`nothing to press called "${label}"`);
  await act(async () => {
    hit.props.onPress();
  });
};
/** Every "Add ... to order" button on the screen. */
const addButtons = (tree: ReactTestRenderer): string[] => tree.root.findAll((n) => isPressable(n) && /^Add .+ to order$/.test(String(n.props.accessibilityLabel))).map((n) => String(n.props.accessibilityLabel));
const tabs = (tree: ReactTestRenderer): ReactTestInstance[] => tree.root.findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');
const tabLabels = (tree: ReactTestRenderer): string[] => tabs(tree).map((n) => String(n.props.accessibilityLabel));
const headers = (tree: ReactTestRenderer): string[] => tree.root.findAll((n) => n.props.accessibilityRole === 'header' && n.type === Text).map(flat);
/** The category chips on the screen, in order (a chip is a checkbox that says whether it is the one chosen). */
const chips = (tree: ReactTestRenderer): string[] => tree.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function').map((n) => String(n.props.accessibilityLabel ?? ''));

async function openStore(opts: { categories: unknown[]; items: unknown[]; guest?: boolean; words?: ReturnType<typeof wordsFor> }): Promise<ReactTestRenderer> {
  mockLoadStore.mockResolvedValue({ categories: opts.categories, items: opts.items });
  mockApp.guest = opts.guest ?? false;
  return render(opts.words ? <WordsProvider words={opts.words}><StoreScreen /></WordsProvider> : <StoreScreen />);
}

beforeEach(() => {
  mockLoadStore.mockReset();
  mockWindows.mockReset();
  mockWindows.mockResolvedValue([]);
  mockPush.mockReset();
  mockApp.center = { id: 'c1', short_name: 'Lakeside Club', time_zone: 'America/Chicago', rules: null };
  mockApp.member = { household: { id: 'h1' } };
  mockApp.guest = false;
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('a store with only Food in it (every store today)', () => {
  it('shows one "Food" heading and everything the store had, with no switch and no mention of a market', async () => {
    const tree = await openStore({ categories: FOOD_CATEGORIES, items: FOOD_ITEMS });
    expect(headers(tree)).toContain('Food');
    expect(tabs(tree)).toHaveLength(0);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Lemon bars', 'Six to a box', '$4.50', 'Iced tea', '$3.00']));
    expect(chips(tree)).toEqual(['All', 'Baked', 'Drinks']);
    expect(addButtons(tree)).toEqual(['Add Lemon bars to order', 'Add Iced tea to order']);
    expect(mentions(tree, /market/i)).toBe(false);
    expect(mentions(tree, /coming soon|soon/i)).toBe(false);
  });

  it('is the same for a database that does not have the section column yet', async () => {
    const bareCategories = FOOD_CATEGORIES.map(({ section: _s, ...c }) => c);
    const bareItems = FOOD_ITEMS.map(({ section: _s, ...i }) => i);
    const tree = await openStore({ categories: bareCategories, items: bareItems });
    expect(headers(tree)).toContain('Food');
    expect(tabs(tree)).toHaveLength(0);
    expect(addButtons(tree)).toHaveLength(2);
    expect(chips(tree)).toEqual(['All', 'Baked', 'Drinks']);
  });

  it('keeps the kitchen words and the pickup times in the hero', async () => {
    mockWindows.mockResolvedValue([{ id: 'w1', starts_at: '2099-01-05T18:00:00Z', ends_at: '2099-01-05T20:00:00Z', order_cutoff_at: '2099-01-03T18:00:00Z', status: 'open', capacity: null, orders_count: 0 }]);
    const tree = await openStore({ categories: FOOD_CATEGORIES, items: FOOD_ITEMS });
    expect(hasText(tree, 'Lakeside Club · My Store')).toBe(true);
    expect(mentions(tree, /^Made to order in the .* kitchen/)).toBe(true);
    expect(mentions(tree, /^Order by .* · pickup /)).toBe(true);
  });

  it('keeps the cart working: add, the order bar, more and fewer', async () => {
    const tree = await openStore({ categories: FOOD_CATEGORIES, items: FOOD_ITEMS });
    await press(tree, 'Add Lemon bars to order');
    expect(hasText(tree, 'View order · 1 item')).toBe(true);
    await press(tree, 'One more Lemon bars');
    expect(mentions(tree, /^View order · 2 items$/)).toBe(true);
    await press(tree, 'One fewer Lemon bars');
    await press(tree, 'One fewer Lemon bars');
    expect(mentions(tree, /^View order/)).toBe(false);
    await press(tree, 'Add Iced tea to order');
    await press(tree, 'View order (1) · $3');
    expect(mockPush).toHaveBeenCalledWith('/cart');
  });

  it('filters by category chip as before', async () => {
    const tree = await openStore({ categories: FOOD_CATEGORIES, items: FOOD_ITEMS });
    await press(tree, 'Drinks');
    expect(addButtons(tree)).toEqual(['Add Iced tea to order']);
    await press(tree, 'All');
    expect(addButtons(tree)).toHaveLength(2);
  });

  it('says "Nothing is on the menu right now." under the Food heading when it has no items', async () => {
    const tree = await openStore({ categories: FOOD_CATEGORIES, items: [] });
    expect(headers(tree)).toContain('Food');
    expect(hasText(tree, 'Nothing is on the menu right now.')).toBe(true);
    expect(tabs(tree)).toHaveLength(0);
  });
});

describe('no Community Market until it has something in it', () => {
  it('draws no tab, heading, teaser or word of it for market categories with no items', async () => {
    const tree = await openStore({ categories: [...FOOD_CATEGORIES, ...MARKET_CATEGORIES], items: FOOD_ITEMS });
    expect(tabs(tree)).toHaveLength(0);
    expect(headers(tree)).toEqual(expect.arrayContaining(['Food']));
    expect(mentions(tree, /community market|market|coming soon/i)).toBe(false);
    expect(hasText(tree, 'Gifts')).toBe(false);
    expect(chips(tree)).toEqual(['All', 'Baked', 'Drinks']);
  });

  it('shows no row whose section the app does not know', async () => {
    const odd = row({ id: 'odd', name: 'Mystery', section: 'services' });
    const tree = await openStore({ categories: [...FOOD_CATEGORIES, category('mystery', 'Mystery shelf', 9, 'services')], items: [...FOOD_ITEMS, odd] });
    expect(hasText(tree, 'Mystery')).toBe(false);
    expect(hasText(tree, 'Mystery shelf')).toBe(false);
    expect(tabs(tree)).toHaveLength(0);
  });
});

describe('a store with two sections (Food and the Community Market)', () => {
  const both = { categories: [...MARKET_CATEGORIES, ...FOOD_CATEGORIES], items: [...MARKET_ITEMS, ...FOOD_ITEMS] };

  it('shows a switch with Food first, one section at a time, starting on Food exactly as before', async () => {
    const tree = await openStore(both);
    expect(tabLabels(tree)).toEqual(['Food', 'Community Market']);
    expect(tabs(tree).map((n) => n.props.accessibilityState.selected)).toEqual([true, false]);
    expect(addButtons(tree)).toEqual(['Add Lemon bars to order', 'Add Iced tea to order']);
    expect(hasText(tree, 'Engraved mug')).toBe(false);
    expect(chips(tree)).toEqual(['All', 'Baked', 'Drinks']);
  });

  it('shows the market as listings with a photo, name, description and price, and nothing to buy', async () => {
    const tree = await openStore(both);
    await press(tree, 'Community Market');
    expect(tabs(tree).map((n) => n.props.accessibilityState.selected)).toEqual([false, true]);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Engraved mug', 'Laser engraved with a name', '$12.00']));
    expect(chips(tree)).toEqual(['All', 'Gifts']);
    expect(hasText(tree, 'Lemon bars')).toBe(false);
    // No cart button, no quantity, no gift pack, no order bar: a listing is looked at, not added.
    expect(addButtons(tree)).toEqual([]);
    expect(pressables(tree, 'One more Engraved mug')).toHaveLength(0);
    expect(mentions(tree, /^Add to order$|gift pack|^View order/i)).toBe(false);
  });

  it('says what the market is instead of the kitchen, and leaves the pickup times out of it', async () => {
    mockWindows.mockResolvedValue([{ id: 'w1', starts_at: '2099-01-05T18:00:00Z', ends_at: '2099-01-05T20:00:00Z', order_cutoff_at: '2099-01-03T18:00:00Z', status: 'open', capacity: null, orders_count: 0 }]);
    const tree = await openStore(both);
    expect(mentions(tree, /^Order by /)).toBe(true);
    await press(tree, 'Community Market');
    expect(mentions(tree, /kitchen/i)).toBe(false);
    expect(mentions(tree, /^Order by /)).toBe(false);
    expect(mentions(tree, /^Products and services offered through your community/)).toBe(true);
    await press(tree, 'Food');
    expect(mentions(tree, /^Order by /)).toBe(true);
    expect(mentions(tree, /kitchen/i)).toBe(true);
  });

  it('goes back to Food with its cart intact', async () => {
    const tree = await openStore(both);
    await press(tree, 'Add Iced tea to order');
    await press(tree, 'Community Market');
    expect(hasText(tree, 'View order · 1 item')).toBe(true);
    await press(tree, 'Food');
    expect(addButtons(tree)).toEqual(['Add Lemon bars to order']);
    expect(pressables(tree, 'One more Iced tea')).toHaveLength(1);
  });

  it('keeps the category chosen in each section', async () => {
    const tree = await openStore(both);
    await press(tree, 'Drinks');
    await press(tree, 'Community Market');
    await press(tree, 'Gifts');
    await press(tree, 'Food');
    expect(addButtons(tree)).toEqual(['Add Iced tea to order']);
  });

  it('draws the market alone, under its own heading and without a switch, when Food has nothing', async () => {
    const tree = await openStore({ categories: [...MARKET_CATEGORIES, ...FOOD_CATEGORIES], items: MARKET_ITEMS });
    expect(tabs(tree)).toHaveLength(0);
    expect(headers(tree)).toContain('Community Market');
    expect(hasText(tree, 'Engraved mug')).toBe(true);
    expect(addButtons(tree)).toEqual([]);
  });

  it('says the same words under a community of another kind', async () => {
    const words = wordsFor(genericProfile('book_club', 'Book club'));
    const tree = await openStore({ ...both, words });
    expect(tabLabels(tree)).toEqual(['Food', 'Community Market']);
    expect(mentions(tree, /^Made to order in our kitchen\.$/)).toBe(true);
    await press(tree, 'Community Market');
    expect(addButtons(tree)).toEqual([]);
  });
});

describe('a guest looking around', () => {
  it('reads the same store: the Food heading, the Food items and the cart buttons', async () => {
    const tree = await openStore({ categories: FOOD_CATEGORIES, items: FOOD_ITEMS, guest: true });
    expect(headers(tree)).toContain('Food');
    expect(tabs(tree)).toHaveLength(0);
    expect(addButtons(tree)).toHaveLength(2);
    expect(mockLoadStore).toHaveBeenCalledTimes(1);
  });

  it('is not shown the Community Market while it is for members, and the Food store is whole', async () => {
    const tree = await openStore({ categories: [...MARKET_CATEGORIES, ...FOOD_CATEGORIES], items: [...MARKET_ITEMS, ...FOOD_ITEMS], guest: true });
    expect(tabs(tree)).toHaveLength(0);
    expect(headers(tree)).toContain('Food');
    expect(mentions(tree, /market|Engraved mug/i)).toBe(false);
    expect(addButtons(tree)).toEqual(['Add Lemon bars to order', 'Add Iced tea to order']);
  });
});

describe('the cart and the market', () => {
  function Probe({ items }: { items: StoreItem[] }) {
    const cart = useCart();
    return (
      <>
        <Text>{`count ${cart.count}`}</Text>
        {items.map((i) => (
          <Text key={i.id} accessibilityRole="button" onPress={() => cart.setQty(i, 1)}>{`add ${i.id}`}</Text>
        ))}
      </>
    );
  }
  const count = (tree: ReactTestRenderer) => texts(tree).find((t) => t.startsWith('count '));

  it('refuses a Community Market item whatever calls it, and still takes Food and an item with no section', async () => {
    const noSection = { ...FOOD_ITEMS[0], id: 'plain', section: undefined } as unknown as StoreItem;
    const tree = await render(<Probe items={[MARKET_ITEMS[0], FOOD_ITEMS[1], noSection]} />);
    expect(count(tree)).toBe('count 0');
    await act(async () => {
      tree.root.findAll((n) => n.props.accessibilityRole === 'button' && flat(n) === 'add mug')[0].props.onPress();
    });
    expect(count(tree)).toBe('count 0');
    await act(async () => {
      tree.root.findAll((n) => n.props.accessibilityRole === 'button' && flat(n) === 'add tea')[0].props.onPress();
    });
    expect(count(tree)).toBe('count 1');
    await act(async () => {
      tree.root.findAll((n) => n.props.accessibilityRole === 'button' && flat(n) === 'add plain')[0].props.onPress();
    });
    expect(count(tree)).toBe('count 2');
  });
});
