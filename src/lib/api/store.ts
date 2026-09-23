import type { Tables } from '../database.types';
import { AppError, check, logError, must } from '../errors';
import { supabase } from '../supabase';

import type { Center } from './member';

export type StoreItem = Tables<'store_items'>;
export type PickupWindow = Tables<'pickup_windows'>;

/** Gift-pack price per unit from centers.rules.store.gift_pack_cents; null = gift packing not offered. */
export function giftPackCents(center: Center | null): number | null {
  const rules = center?.rules;
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return null;
  const store = (rules as Record<string, unknown>).store;
  if (!store || typeof store !== 'object' || Array.isArray(store)) return null;
  const v = (store as Record<string, unknown>).gift_pack_cents;
  return typeof v === 'number' && v >= 0 ? v : null;
}

export async function loadStore(centerId: string): Promise<{ categories: Tables<'store_categories'>[]; items: StoreItem[] }> {
  const [catRes, itemsRes] = await Promise.all([
    supabase.from('store_categories').select('*').eq('center_id', centerId).order('sort_order'),
    supabase.from('store_items').select('*').eq('center_id', centerId).eq('status', 'active').order('name'),
  ]);
  return { categories: must(catRes, 'load the store'), items: must(itemsRes, 'load the store') };
}

export async function listPickupWindows(centerId: string): Promise<PickupWindow[]> {
  const rows = must(await supabase.from('pickup_windows').select('*').eq('center_id', centerId).eq('status', 'open').gt('order_cutoff_at', new Date().toISOString()).order('starts_at'), 'load pickup times');
  return rows.filter((w) => w.capacity == null || w.orders_count < w.capacity);
}

export type PlacedOrder = { id: string; orderNumber: string; totalCents: number };

/**
 * Place an order. RLS lets a household add lines only while the order is a
 * 'cart', so: insert the order as a cart → add lines → mark it 'placed'.
 * Sales tax is not computed in the app (no tax rate in the schema — see README).
 */
export async function placeOrder(args: {
  centerId: string;
  householdId: string;
  personId: string;
  pickupWindowId: string;
  lines: { itemId: string; qty: number; giftQty: number; unitCents: number }[];
  giftPackCents: number | null;
  giftMessage: string;
}): Promise<PlacedOrder> {
  if (args.lines.length === 0) throw new AppError('Your order is empty.', 'empty order');
  const subtotal = args.lines.reduce((s, l) => s + l.unitCents * l.qty, 0);
  const giftUnits = args.lines.reduce((s, l) => s + l.giftQty, 0);
  const gift = args.giftPackCents ? giftUnits * args.giftPackCents : 0;
  const order = must(
    await supabase
      .from('store_orders')
      .insert({
        center_id: args.centerId,
        // order_number is issued by the app.assign_numbers trigger when null; the
        // generated Insert type marks it required only because the column is NOT NULL.
        order_number: null as unknown as string,
        household_id: args.householdId,
        person_id: args.personId,
        pickup_window_id: args.pickupWindowId,
        subtotal_cents: subtotal,
        gift_packing_cents: gift,
        tax_cents: 0,
        total_cents: subtotal + gift,
        status: 'cart',
        gift_message: giftUnits > 0 && args.giftMessage.trim() ? args.giftMessage.trim() : null,
      })
      .select('id, order_number, total_cents')
      .single(),
    'start your order',
  );
  try {
    const rows = args.lines.flatMap((l) => {
      const out = [];
      const plain = l.qty - l.giftQty;
      if (plain > 0) out.push({ center_id: args.centerId, order_id: order.id, item_id: l.itemId, quantity: plain, unit_price_cents: l.unitCents, is_gift: false, line_total_cents: plain * l.unitCents });
      if (l.giftQty > 0) out.push({ center_id: args.centerId, order_id: order.id, item_id: l.itemId, quantity: l.giftQty, unit_price_cents: l.unitCents, is_gift: true, line_total_cents: l.giftQty * l.unitCents });
      return out;
    });
    check(await supabase.from('store_order_lines').insert(rows), 'add items to your order');
    check(await supabase.from('store_orders').update({ status: 'placed', placed_at: new Date().toISOString() }).eq('id', order.id), 'place your order');
  } catch (err) {
    // The cart row stays as 'cart' (never sent to the kitchen); log for cleanup.
    logError(`order ${order.order_number} left as an unplaced cart after a failure`, err);
    throw err;
  }
  return { id: order.id, orderNumber: order.order_number, totalCents: order.total_cents };
}
