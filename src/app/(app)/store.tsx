import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Banner, Button, Card, Row, Txt, VStack } from '@/components/ui';
import { pickupPill } from '@/features/give/rules';
import { StoreCatalog } from '@/features/store/catalog';
import { BUCKETS, signedUrls } from '@/lib/api/files';
import { cancelMyOrder, giftPackCents, listMyOrders, listPickupWindows, loadStore, type MyOrder } from '@/lib/api/store';
import { report } from '@/lib/errors';
import { formatCents, formatDate, formatTimeRange } from '@/lib/format';
import { activeSection, groupStoreSections, type StoreSectionKey } from '@/lib/store-sections';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useCart } from '@/providers/cart';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, shadows, space } from '@/theme';

/**
 * My Store (prototype Main.dc.html L1012–1047): browse, quantities, gift packing. The store has sections above its
 * categories (src/lib/store-sections.ts): Food, which is ordered for pickup, and, only when it has something in it, the
 * Community Market, which is shown and not ordered.
 */
export default function StoreScreen() {
  const t = useT();
  const router = useRouter();
  const { center, member, guest } = useApp();
  const cart = useCart();
  const householdId = member?.household?.id ?? null;
  const orders = useLoad(() => (center && householdId ? listMyOrders(center.id, householdId) : Promise.resolve([] as MyOrder[])), [center?.id, householdId], 'load your orders');
  const [pickedSection, setPickedSection] = useState<StoreSectionKey>('food');
  const state = useLoad(() => (center ? loadStore(center.id) : Promise.reject(new Error('no center'))), [center?.id], 'load the store');
  const windows = useLoad(() => (center ? listPickupWindows(center.id) : Promise.resolve([])), [center?.id], 'load pickup times');
  const photoPaths = (state.data?.items ?? []).map((i) => i.photo_path).filter((p): p is string => !!p);
  const photos = useLoad(() => signedUrls(photoPaths, BUCKETS.storePhotos, 'load the store photos'), [photoPaths], 'load the store photos');
  const giftCents = giftPackCents(center);
  const total = cart.lines.reduce((s, l) => s + l.qty * l.unitCents + (giftCents ? l.giftQty * giftCents : 0), 0);
  const pill = windows.data ? pickupPill(windows.data, new Date(), center?.time_zone ?? null) : null;

  const sections = state.data ? groupStoreSections(state.data.categories, state.data.items, { guest }) : null;
  const section = sections ? activeSection(sections, pickedSection) : null;
  // The kitchen's words and the pickup times are Food's; the Community Market has neither.
  const inMarket = section?.key === 'market';

  return (
    <Screen
      title={t('store.title')}
      footer={
        cart.count > 0 ? (
          <Pressable
            onPress={() => router.push('/cart')}
            accessibilityRole="button"
            accessibilityLabel={t('store.viewOrder', { n: cart.count, amount: formatCents(total) })}
            style={({ pressed }) => [{ backgroundColor: colors.store, borderRadius: radii.cart, minHeight: 56, paddingHorizontal: space.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: pressed ? 0.9 : 1 }, shadows.cart]}>
            <Txt variant="section" color="white">
              {cart.count === 1 ? t('store.viewOrderOne') : t('store.viewOrderShort', { n: cart.count })}
            </Txt>
            <Txt variant="section" color="white" style={{ fontFamily: fonts.bodyBold }}>
              {formatCents(total)}
            </Txt>
          </Pressable>
        ) : undefined
      }>
      <View style={{ borderRadius: radii.xxl, backgroundColor: colors.store, padding: 18, gap: 4 }}>
        <Txt color="white" accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 30 }}>
          {t('store.heroTitle', { center: center?.short_name ?? '' })}
        </Txt>
        <Txt variant="meta" color="onStore">
          {t(inMarket ? 'store.marketHeroBody' : 'store.heroBody')}
        </Txt>
        {pill && !inMarket ? (
          <View style={{ backgroundColor: colors.storeLight, borderRadius: radii.md, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start', marginTop: 4 }}>
            <Txt variant="caption" color="white" style={{ fontFamily: fonts.bodySemi }}>
              {t('store.cutoffPill', { cutoff: pill.cutoff, days: pill.days.join(t('store.or')) })}
            </Txt>
          </View>
        ) : null}
      </View>
      {orders.error ? <Banner tone="error" message={orders.error.userMessage} action={{ label: t('common.retry'), onPress: () => void orders.reload() }} /> : null}
      {orders.data && orders.data.length > 0 ? <MyOrders orders={orders.data} onChanged={() => void orders.reload()} /> : null}
      {windows.error ? <Banner tone="error" message={windows.error.userMessage} action={{ label: t('common.retry'), onPress: () => void windows.reload() }} /> : null}
      {photos.error ? <Banner tone="warning" message={photos.error.userMessage} action={{ label: t('common.retry'), onPress: () => void photos.reload() }} /> : null}
      <Loaded state={state}>
        {() => (sections && section ? <StoreCatalog sections={sections} active={section.key} onPickSection={setPickedSection} photos={photos.data} giftCents={giftCents} /> : null)}
      </Loaded>
    </Screen>
  );
}

const STATUS_COLOR: Record<string, 'store' | 'green' | 'muted' | 'danger' | 'navy'> = {
  placed: 'navy',
  preparing: 'store',
  ready: 'green',
  picked_up: 'muted',
  cancelled: 'danger',
  refunded: 'muted',
};

/** "Your orders": follow each order through the kitchen; cancel while the store allows it (checked by the database). */
function MyOrders({ orders, onChanged }: { orders: MyOrder[]; onChanged: () => void }) {
  const t = useT();
  const { center } = useApp();
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tz = center?.time_zone ?? null;

  const cancel = async (o: MyOrder) => {
    const yes = await confirm({ title: t('store.cancelTitle', { order: o.orderNumber }), body: t('store.cancelBody'), confirmLabel: t('store.cancelOrder'), tone: 'danger', cancelLabel: t('store.keepOrder') });
    if (!yes) return;
    setBusy(o.id);
    setError(null);
    try {
      await cancelMyOrder(o.id);
      toast(t('store.cancelledToast', { order: o.orderNumber }));
      onChanged();
    } catch (err) {
      setError(report(err, 'cancel your order').userMessage);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Txt variant="section" accessibilityRole="header">
        {t('store.myOrders')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      {orders.map((o) => {
        const open = o.status === 'placed' || o.status === 'preparing';
        const statusKey = `store.orderStatus.${o.status}` as Parameters<typeof t>[0];
        return (
          <VStack key={o.id} gap={4} style={{ paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
              <Txt variant="bodyStrong">{t('store.orderHead', { order: o.orderNumber })}</Txt>
              <Txt variant="smallStrong" color={STATUS_COLOR[o.status] ?? 'muted'}>
                {t(statusKey)}
              </Txt>
            </Row>
            <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
              {o.lines.map((l) => t(l.gift ? 'store.orderLineGift' : 'store.orderLine', { name: l.name, n: l.qty })).join(' · ')}
            </Txt>
            <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
              {o.window ? t('store.orderPickup', { when: `${formatDate(o.window.starts_at, tz)} · ${formatTimeRange(o.window.starts_at, o.window.ends_at, tz)}` }) : t('store.orderNoPickup')}
              {' · '}
              {o.status === 'picked_up' || o.status === 'cancelled' || o.status === 'refunded' ? t('store.orderTotalDone', { amount: formatCents(o.totalCents, { alwaysCents: true }) }) : t('store.orderTotal', { amount: formatCents(o.totalCents, { alwaysCents: true }) })}
            </Txt>
            {open ? (
              <Button label={t('store.cancelOrder')} accessibilityLabel={`${t('store.cancelOrder')} ${o.orderNumber}`} tone="ghost" size="sm" fill={false} busy={busy === o.id} onPress={() => void cancel(o)} />
            ) : null}
          </VStack>
        );
      })}
    </Card>
  );
}
