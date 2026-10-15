import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/components/states';
import { Button, Card, Chip, ChipGroup, Row, Segmented, Txt, VStack } from '@/components/ui';
import { PhotoGlyph } from '@/features/give/icons';
import { GiftToggle, QtyButton } from '@/features/give/store-parts';
import { logError } from '@/lib/errors';
import { formatCents } from '@/lib/format';
import type { StoreItem } from '@/lib/api/store';
import { activeSection, hasSectionSwitch, isOrderable, itemsInCategory, STORE_SECTION_LABEL_KEYS, type StoreSectionKey, type StoreSectionView } from '@/lib/store-sections';
import { useCart } from '@/providers/cart';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

function ItemPhoto({ url }: { url: string | undefined }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ width: 72, height: 72, borderRadius: radii.card, backgroundColor: colors.storeLight, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          style={{ width: 72, height: 72 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
          onError={(e) => {
            logError('loading a store photo (showing the plain tile instead)', e.error);
            setFailed(true);
          }}
        />
      ) : (
        <PhotoGlyph color={colors.white} />
      )}
    </View>
  );
}

/** A photo, a name, a line of detail and the price: what both kinds of card say about an item. */
function ItemSummary({ item, photoUrl }: { item: StoreItem; photoUrl: string | undefined }) {
  return (
    <Row gap={space.md} align="flex-start">
      <ItemPhoto url={photoUrl} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
          {item.name}
        </Txt>
        {item.description || item.pack_size ? (
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body, lineHeight: 17 }}>
            {[item.description, item.pack_size].filter(Boolean).join(' · ')}
          </Txt>
        ) : null}
        <Txt variant="body" color="store" style={{ fontFamily: fonts.bodyBold, marginTop: 4 }}>
          {formatCents(item.price_cents, { alwaysCents: true })}
        </Txt>
      </View>
    </Row>
  );
}

/** A Food item: quantities, gift packing, the kitchen's cart (unchanged from before the store had sections). */
function FoodItemCard({ item, photoUrl, giftCents }: { item: StoreItem; photoUrl: string | undefined; giftCents: number | null }) {
  const t = useT();
  const cart = useCart();
  const line = cart.lines.find((l) => l.itemId === item.id);
  const gifted = (line?.giftQty ?? 0) > 0;
  const giftLabel = (on: boolean) => (on ? t('store.giftPacked') : t('store.giftPack', { amount: formatCents(giftCents ?? 0) }));
  return (
    <Card style={{ padding: space.md, gap: 10, borderColor: line ? colors.store : colors.border }}>
      <ItemSummary item={item} photoUrl={photoUrl} />
      {line ? (
        <Row gap={10}>
          <QtyButton glyph="−" label={t('store.less', { name: item.name })} onPress={() => cart.setQty(item, line.qty - 1)} />
          <Txt variant="cardTitle" style={{ minWidth: 24, textAlign: 'center', fontFamily: fonts.bodyBold }} accessibilityLiveRegion="polite">
            {String(line.qty)}
          </Txt>
          <QtyButton glyph="+" label={t('store.more', { name: item.name })} onPress={() => cart.setQty(item, line.qty + 1)} />
          {giftCents !== null && item.gift_pack ? <GiftToggle grow on={gifted} label={giftLabel(gifted)} onPress={() => cart.setGiftQty(item.id, gifted ? 0 : line.qty)} /> : null}
        </Row>
      ) : (
        <Button label={t('store.add')} accessibilityLabel={t('store.addItem', { name: item.name })} tone="outlineStore" size="sm" style={{ borderRadius: radii.pill }} onPress={() => cart.setQty(item, 1)} />
      )}
    </Card>
  );
}

/**
 * A Community Market item: shown to look at, with no cart, no quantity and no purchase action. Ordering is Food's
 * (docs/STORE_SECTIONS.md §4.3); the market's own ways of asking and ordering come with its listings.
 */
function MarketItemCard({ item, photoUrl }: { item: StoreItem; photoUrl: string | undefined }) {
  return (
    <Card style={{ padding: space.md, gap: 10 }}>
      <ItemSummary item={item} photoUrl={photoUrl} />
    </Card>
  );
}

/**
 * The store under its hero: the section (a "Food" heading while Food is the only section, else a switch between the
 * sections), the category chips of that section, and its items. `sections` comes from `groupStoreSections`; the screen owns
 * which section is picked because the hero above reads it (the kitchen's words and the pickup pill are Food's).
 */
export function StoreCatalog({
  sections,
  active,
  onPickSection,
  photos,
  giftCents,
}: {
  sections: StoreSectionView[];
  active: StoreSectionKey;
  onPickSection: (key: StoreSectionKey) => void;
  photos: ReadonlyMap<string, string> | undefined;
  giftCents: number | null;
}) {
  const t = useT();
  // The category chosen in each section, so going back to a section finds it as it was left.
  const [categoryBySection, setCategoryBySection] = useState<Partial<Record<StoreSectionKey, string | null>>>({});
  const section = activeSection(sections, active);
  const category = categoryBySection[section.key] ?? null;
  const shown = itemsInCategory(section, category);
  const photoOf = (item: StoreItem) => (item.photo_path ? photos?.get(item.photo_path) : undefined);

  return (
    <VStack gap={space.md}>
      {hasSectionSwitch(sections) ? (
        <Segmented label={t('store.sections')} value={section.key} onChange={onPickSection} options={sections.map((s) => ({ value: s.key, label: t(STORE_SECTION_LABEL_KEYS[s.key]) }))} />
      ) : (
        <Txt variant="section" accessibilityRole="header">
          {t(STORE_SECTION_LABEL_KEYS[section.key])}
        </Txt>
      )}
      {section.categories.length ? (
        <ChipGroup>
          <Chip label={t('store.all')} selected={category === null} onPress={() => setCategoryBySection((prev) => ({ ...prev, [section.key]: null }))} tone="store" />
          {section.categories.map((c) => (
            <Chip key={c.id} label={c.name} selected={category === c.id} onPress={() => setCategoryBySection((prev) => ({ ...prev, [section.key]: c.id }))} tone="store" />
          ))}
        </ChipGroup>
      ) : null}
      {shown.length === 0 ? <EmptyState icon="storefront-outline" title={t(section.key === 'food' ? 'store.empty' : 'store.marketEmpty')} /> : null}
      {shown.map((item) => (isOrderable(item) ? <FoodItemCard key={item.id} item={item} photoUrl={photoOf(item)} giftCents={giftCents} /> : <MarketItemCard key={item.id} item={item} photoUrl={photoOf(item)} />))}
    </VStack>
  );
}
