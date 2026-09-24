import { createContext, useContext, useState, type ReactNode } from 'react';

/** giftQty is either 0 or qty: a line is gift-packed as a whole (prototype). giftPack = the item can be gift-packed. */
export type CartLine = { itemId: string; name: string; unitCents: number; qty: number; giftQty: number; giftPack: boolean };

type CartItem = { id: string; name: string; price_cents: number; gift_pack?: boolean };

type CartContextValue = {
  lines: CartLine[];
  setQty: (item: CartItem, qty: number) => void;
  setGiftQty: (itemId: string, giftQty: number) => void;
  clear: () => void;
  count: number;
};

const CartContext = createContext<CartContextValue | null>(null);

/** Satvik Store cart, kept in memory until the order is placed. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const setQty: CartContextValue['setQty'] = (item, qty) =>
    setLines((prev) => {
      const rest = prev.filter((l) => l.itemId !== item.id);
      if (qty <= 0) return rest;
      const existing = prev.find((l) => l.itemId === item.id);
      const gifted = (existing?.giftQty ?? 0) > 0;
      const next: CartLine = { itemId: item.id, name: item.name, unitCents: item.price_cents, qty, giftQty: gifted ? qty : 0, giftPack: item.gift_pack ?? existing?.giftPack ?? true };
      return existing ? prev.map((l) => (l.itemId === item.id ? next : l)) : [...rest, next];
    });
  const setGiftQty = (itemId: string, giftQty: number) => setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, giftQty: Math.max(0, Math.min(l.qty, giftQty)) } : l)));
  return (
    <CartContext.Provider value={{ lines, setQty, setGiftQty, clear: () => setLines([]), count: lines.reduce((s, l) => s + l.qty, 0) }}>{children}</CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
