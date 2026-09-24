import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Row, TextField, Txt, VStack } from '@/components/ui';
import { GiftToggle, QtyButton } from '@/features/give/store-parts';
import { runSaving, startPayment } from '@/features/pay';
import { giftPackCents, listPickupWindows, startOrder, submitOrder, type PlacedOrder } from '@/lib/api/store';
import { report } from '@/lib/errors';
import { formatCents, formatDate, formatTimeRange } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useCart } from '@/providers/cart';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/** Your order (prototype Main.dc.html L1050–1085): lines with gift toggle, gift message, pickup, totals, pay. */
export default function CartScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center, setGuest } = useApp();
  const cart = useCart();
  const { invalidate } = useDataVersion();
  const windows = useLoad(() => (center ? listPickupWindows(center.id) : Promise.resolve([])), [center?.id], 'load pickup times');
  const [windowId, setWindowId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const giftCents = giftPackCents(center);
  const tz = center?.time_zone ?? null;
  const items = cart.lines.reduce((s, l) => s + l.qty * l.unitCents, 0);
  const giftUnits = cart.lines.reduce((s, l) => s + l.giftQty, 0);
  const gift = giftCents ? giftUnits * giftCents : 0;
  const total = items + gift;

  if (member && !member.isAdult) {
    return (
      <Screen title={t('store.orderTitle')} niva={false}>
        <LockedState />
      </Screen>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <Screen title={t('store.orderTitle')} niva={false}>
        <EmptyState icon="basket-outline" title={t('store.cartEmpty')} action={{ label: t('store.browse'), onPress: () => router.replace('/store') }} />
      </Screen>
    );
  }

  const windowLabel = (w: { starts_at: string; ends_at: string }) => `${formatDate(w.starts_at, tz)} · ${formatTimeRange(w.starts_at, w.ends_at, tz)}`;

  /** Place the order unpaid ("pay at pickup") through the Saving screen. */
  const placeUnpaid = () => {
    if (!member?.household || !center) return;
    const chosen = windows.data?.find((w) => w.id === (windowId ?? windows.data?.[0]?.id)) ?? null;
    if (!chosen) return setError(t('store.pickupRequired'));
    setError(null);
    const household = member.household;
    const lines = cart.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, giftQty: giftCents ? l.giftQty : 0, unitCents: l.unitCents }));
    const count = cart.count;
    const gifted = giftCents ? giftUnits : 0;
    const placed: { order: PlacedOrder | null } = { order: null };
    runSaving({
      title: t('store.savingTitle'),
      steps: [
        {
          label: t('store.stepSend', { n: count, center: center.short_name || center.name }),
          run: async () => {
            placed.order = await startOrder({ centerId: center.id, householdId: household.id, personId: member.person.id, pickupWindowId: chosen.id, lines, giftPackCents: giftCents, giftMessage: message });
          },
        },
        {
          label: t('store.stepPickup', { when: windowLabel(chosen) }),
          run: async () => {
            if (!placed.order) throw new Error('order was not started');
            await submitOrder(placed.order);
            cart.clear();
            invalidate();
          },
        },
      ],
      result: () => [t('store.placedResult', { order: placed.order?.orderNumber ?? '', when: windowLabel(chosen) }), gifted ? t('store.placedGifts', { n: gifted }) : null, t('store.payAtPickup', { amount: formatCents(placed.order?.totalCents ?? total) })].filter(Boolean).join(' '),
      cta: { label: t('common.done'), onPress: () => router.dismissTo('/') },
    }).catch((err: unknown) => setError(report(err, 'place your order').userMessage));
  };

  const pay = () => {
    if (!(windows.data ?? []).length) return setError(t('store.noPickup'));
    setError(null);
    startPayment({ amountCents: total, forLabel: t('store.payFor'), context: 'store', alternative: { label: t('store.placeUnpaid'), run: placeUnpaid } }).catch((err: unknown) =>
      setError(report(err, 'open the payment sheet').userMessage),
    );
  };

  const giftLabel = (on: boolean) => (on ? t('store.giftPacked') : t('store.giftPack', { amount: formatCents(giftCents ?? 0, { alwaysCents: true }) }));

  return (
    <Screen title={t('store.orderTitle')} niva={false}>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {cart.lines.map((l) => {
          const item = { id: l.itemId, name: l.name, price_cents: l.unitCents };
          const on = l.giftQty > 0;
          return (
            <VStack key={l.itemId} gap={6} style={{ paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
                <Txt variant="body" style={{ fontFamily: fonts.bodySemi, flex: 1 }}>{`${l.name} × ${l.qty}`}</Txt>
                <Txt variant="body" style={{ fontFamily: fonts.bodyBold }}>
                  {formatCents(l.qty * l.unitCents + (giftCents ? l.giftQty * giftCents : 0), { alwaysCents: true })}
                </Txt>
              </Row>
              <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                {giftCents && on ? t('store.eachWithGift', { amount: formatCents(l.unitCents, { alwaysCents: true }), gift: formatCents(giftCents, { alwaysCents: true }) }) : t('store.each', { amount: formatCents(l.unitCents, { alwaysCents: true }) })}
              </Txt>
              <Row gap={space.sm}>
                <QtyButton glyph="−" size={40} label={t('store.less', { name: l.name })} onPress={() => cart.setQty(item, l.qty - 1)} />
                <QtyButton glyph="+" size={40} label={t('store.more', { name: l.name })} onPress={() => cart.setQty(item, l.qty + 1)} />
                {giftCents !== null && l.giftPack ? <GiftToggle compact on={on} label={giftLabel(on)} onPress={() => cart.setGiftQty(l.itemId, on ? 0 : l.qty)} /> : null}
              </Row>
            </VStack>
          );
        })}
        <Pressable onPress={() => router.navigate('/store')} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Txt variant="small" color="store" style={{ fontFamily: fonts.bodySemi }}>
            {t('store.addMore')}
          </Txt>
        </Pressable>
      </Card>
      {giftUnits > 0 ? <TextField label={t('store.giftMessage')} value={message} onChangeText={setMessage} placeholder={t('store.giftMessagePlaceholder', { name: member?.person.last_name ?? '' })} /> : null}
      <VStack gap={space.sm}>
        <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
          {t('store.pickup')}
        </Txt>
        <Loaded state={windows}>
          {(list) =>
            list.length === 0 ? (
              <Banner tone="warning" message={t('store.noPickup')} />
            ) : (
              <VStack gap={space.sm}>
                {list.map((w) => {
                  const on = (windowId ?? list[0].id) === w.id;
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() => setWindowId(w.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => ({ borderWidth: 2, borderColor: on ? colors.store : colors.border, backgroundColor: on ? colors.storeTint : colors.card, borderRadius: radii.card, minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                      <Txt variant="small" style={{ fontFamily: fonts.bodyMedium }}>
                        {windowLabel(w)}
                      </Txt>
                    </Pressable>
                  );
                })}
              </VStack>
            )
          }
        </Loaded>
      </VStack>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="small" color="muted">
            {t('store.items', { n: cart.count })}
          </Txt>
          <Txt variant="small">{formatCents(items, { alwaysCents: true })}</Txt>
        </Row>
        {giftCents !== null ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small" color="muted">
              {t('store.giftLine', { n: giftUnits, amount: formatCents(giftCents, { alwaysCents: true }) })}
            </Txt>
            <Txt variant="small">{formatCents(gift, { alwaysCents: true })}</Txt>
          </Row>
        ) : null}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space.sm, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt variant="subhead" style={{ fontFamily: fonts.bodyBold }}>
            {t('store.total')}
          </Txt>
          <Txt variant="subhead" style={{ fontFamily: fonts.bodyBold }}>
            {formatCents(total, { alwaysCents: true })}
          </Txt>
        </View>
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {t('store.taxNote')}
        </Txt>
      </Card>
      {error ? <Banner tone="error" message={error} /> : null}
      {!member ? (
        <Card tone="panel">
          <Txt variant="small">{t('store.signIn')}</Txt>
          <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
        </Card>
      ) : (
        <Button label={t('store.pay', { amount: formatCents(total, { alwaysCents: true }) })} tone="black" onPress={pay} disabled={(windows.data ?? []).length === 0} />
      )}
      <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
        {t('store.footer')}
      </Txt>
    </Screen>
  );
}
