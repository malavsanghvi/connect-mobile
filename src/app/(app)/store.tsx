import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Button, Card, Chip, ChipGroup, Row, Stepper, Txt, VStack } from '@/components/ui';
import { giftPackCents, loadStore } from '@/lib/api/store';
import { formatCents } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useCart } from '@/providers/cart';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

/** Satvik Store (prototype §2.25): browse, quantities, gift packing. */
export default function StoreScreen() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const cart = useCart();
  const [category, setCategory] = useState<string | null>(null);
  const state = useLoad(() => (center ? loadStore(center.id) : Promise.reject(new Error('no center'))), [center?.id], 'load the store');
  const giftCents = giftPackCents(center);
  const total = cart.lines.reduce((s, l) => s + l.qty * l.unitCents + (giftCents ? l.giftQty * giftCents : 0), 0);

  return (
    <Screen
      title={t('store.title')}
      footer={
        cart.count > 0 ? (
          <Pressable onPress={() => router.push('/cart')} accessibilityRole="button" accessibilityLabel={t('store.viewOrder', { n: cart.count, amount: formatCents(total) })} style={{ backgroundColor: colors.store, borderRadius: 28, minHeight: 56, paddingHorizontal: space.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt variant="section" color="white">
              {t('store.viewOrderShort', { n: cart.count })}
            </Txt>
            <Txt variant="section" color="white">
              {formatCents(total)}
            </Txt>
          </Pressable>
        ) : undefined
      }>
      <Card tone="store">
        <Txt variant="title" color="white" accessibilityRole="header">
          {t('store.heroTitle', { center: center?.short_name ?? '' })}
        </Txt>
        <Txt variant="small" color="onStore">
          {t('store.heroBody')}
        </Txt>
      </Card>
      <Loaded state={state}>
        {({ categories, items }) => {
          const shown = category ? items.filter((i) => i.category_id === category) : items;
          return (
            <VStack gap={space.md}>
              {categories.length ? (
                <ChipGroup>
                  <Chip label={t('store.all')} selected={category === null} onPress={() => setCategory(null)} tone="store" />
                  {categories.map((c) => (
                    <Chip key={c.id} label={c.name} selected={category === c.id} onPress={() => setCategory(c.id)} tone="store" />
                  ))}
                </ChipGroup>
              ) : null}
              {shown.length === 0 ? <EmptyState icon="storefront-outline" title={t('store.empty')} /> : null}
              {shown.map((item) => {
                const line = cart.lines.find((l) => l.itemId === item.id);
                return (
                  <Card key={item.id}>
                    <Row gap={space.md} align="flex-start">
                      <View style={{ width: 64, height: 64, borderRadius: radii.lg, backgroundColor: colors.storeTint }} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt variant="cardTitle">{item.name}</Txt>
                        {item.description ? (
                          <Txt variant="meta" color="muted">
                            {item.description}
                          </Txt>
                        ) : null}
                        <Txt variant="smallStrong" color="store">
                          {[formatCents(item.price_cents), item.pack_size].filter(Boolean).join(' · ')}
                        </Txt>
                      </View>
                    </Row>
                    {line ? (
                      <VStack gap={space.sm}>
                        <Stepper
                          size={44}
                          valueLabel={String(line.qty)}
                          onMinus={() => cart.setQty(item, line.qty - 1)}
                          onPlus={() => cart.setQty(item, line.qty + 1)}
                          minusLabel={t('store.less', { name: item.name })}
                          plusLabel={t('store.more', { name: item.name })}
                        />
                        {giftCents !== null ? (
                          <Chip
                            label={line.giftQty > 0 ? t('store.giftPacked', { n: line.giftQty }) : t('store.giftPack', { amount: formatCents(giftCents) })}
                            selected={line.giftQty > 0}
                            onPress={() => cart.setGiftQty(item.id, line.giftQty > 0 ? 0 : line.qty)}
                            tone="store"
                          />
                        ) : null}
                      </VStack>
                    ) : (
                      <Button label={t('store.add')} tone="store" size="md" onPress={() => cart.setQty(item, 1)} />
                    )}
                  </Card>
                );
              })}
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
