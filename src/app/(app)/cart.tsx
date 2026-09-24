import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Radio, Row, SectionTitle, Stepper, TextField, Txt, VStack } from '@/components/ui';
import { giftPackCents, listPickupWindows, placeOrder } from '@/lib/api/store';
import { report } from '@/lib/errors';
import { formatCents, formatDate, formatTimeRange } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useCart } from '@/providers/cart';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/** Your order (prototype §2.26): pickup window, gift message, place order (adults). */
export default function CartScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center, setGuest } = useApp();
  const cart = useCart();
  const { toast, payNotice } = useFeedback();
  const { invalidate } = useDataVersion();
  const windows = useLoad(() => (center ? listPickupWindows(center.id) : Promise.resolve([])), [center?.id], 'load pickup times');
  const [windowId, setWindowId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const giftCents = giftPackCents(center);
  const tz = center?.time_zone ?? null;
  const items = cart.lines.reduce((s, l) => s + l.qty * l.unitCents, 0);
  const giftUnits = cart.lines.reduce((s, l) => s + l.giftQty, 0);
  const gift = giftCents ? giftUnits * giftCents : 0;

  if (cart.lines.length === 0) {
    return (
      <Screen title={t('store.orderTitle')} niva={false}>
        <EmptyState icon="basket-outline" title={t('store.cartEmpty')} action={{ label: t('store.browse'), onPress: () => router.replace('/store') }} />
      </Screen>
    );
  }

  const place = async () => {
    if (!member?.household || !center) return;
    const chosen = windowId ?? windows.data?.[0]?.id ?? null;
    if (!chosen) return setError(t('store.pickupRequired'));
    setBusy(true);
    setError(null);
    try {
      const order = await placeOrder({
        centerId: center.id,
        householdId: member.household.id,
        personId: member.person.id,
        pickupWindowId: chosen,
        lines: cart.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, giftQty: giftCents ? l.giftQty : 0, unitCents: l.unitCents })),
        giftPackCents: giftCents,
        giftMessage: message,
      });
      cart.clear();
      invalidate();
      toast(t('store.placed', { order: order.orderNumber }));
      payNotice({ amountLabel: formatCents(order.totalCents), saved: false });
      router.replace('/');
    } catch (err) {
      setError(report(err, 'place your order').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('store.orderTitle')} niva={false}>
      <Card>
        {cart.lines.map((l) => (
          <VStack key={l.itemId} gap={space.xs} style={{ paddingVertical: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="bodyStrong">{`${l.name} × ${l.qty}`}</Txt>
              <Txt variant="bodyStrong">{formatCents(l.qty * l.unitCents + (giftCents ? l.giftQty * giftCents : 0))}</Txt>
            </Row>
            <Txt variant="meta" color="muted">
              {giftCents && l.giftQty ? t('store.eachWithGift', { amount: formatCents(l.unitCents), gift: formatCents(giftCents), n: l.giftQty }) : t('store.each', { amount: formatCents(l.unitCents) })}
            </Txt>
            <Stepper size={44} valueLabel={String(l.qty)} onMinus={() => cart.setQty({ id: l.itemId, name: l.name, price_cents: l.unitCents }, l.qty - 1)} onPlus={() => cart.setQty({ id: l.itemId, name: l.name, price_cents: l.unitCents }, l.qty + 1)} minusLabel={t('store.less', { name: l.name })} plusLabel={t('store.more', { name: l.name })} />
          </VStack>
        ))}
        <Button label={t('store.addMore')} tone="ghost" size="md" onPress={() => router.back()} />
      </Card>
      {giftUnits > 0 ? <TextField label={t('store.giftMessage')} value={message} onChangeText={setMessage} multiline /> : null}
      <SectionTitle>{t('store.pickup')}</SectionTitle>
      <Loaded state={windows}>
        {(list) =>
          list.length === 0 ? (
            <Banner tone="warning" message={t('store.noPickup')} />
          ) : (
            <VStack gap={space.sm}>
              {list.map((w) => (
                <Radio key={w.id} label={`${formatDate(w.starts_at, tz)} · ${formatTimeRange(w.starts_at, w.ends_at, tz)}`} sub={[w.location, t('store.orderBy', { date: `${formatDate(w.order_cutoff_at, tz)} ${formatTimeRange(w.order_cutoff_at, null, tz)}` })].filter(Boolean).join(' · ')} selected={(windowId ?? list[0].id) === w.id} onPress={() => setWindowId(w.id)} />
              ))}
            </VStack>
          )
        }
      </Loaded>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="small">{t('store.items', { n: cart.count })}</Txt>
          <Txt variant="small">{formatCents(items)}</Txt>
        </Row>
        {gift > 0 && giftCents ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small">{t('store.giftLine', { n: giftUnits, amount: formatCents(giftCents) })}</Txt>
            <Txt variant="small">{formatCents(gift)}</Txt>
          </Row>
        ) : null}
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="section">{t('store.total')}</Txt>
          <Txt variant="section">{formatCents(items + gift)}</Txt>
        </Row>
        <Txt variant="meta" color="muted">
          {t('store.taxNote')}
        </Txt>
      </Card>
      {error ? <Banner tone="error" message={error} /> : null}
      {!member ? (
        <Card tone="panel">
          <Txt variant="small">{t('store.signIn')}</Txt>
          <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
        </Card>
      ) : !member.isAdult ? (
        <LockedState />
      ) : (
        <Button label={t('store.placeOrder', { amount: formatCents(items + gift) })} tone="store" onPress={place} busy={busy} disabled={(windows.data ?? []).length === 0} />
      )}
      <Txt variant="meta" color="muted">
        {t('store.footer')}
      </Txt>
    </Screen>
  );
}
