import { useState } from 'react';

import { useLoad, type LoadState } from '@/lib/use-load';

/**
 * A random item (Home › Recipe, Home › Podcast) that stays put while the app
 * reloads its data after a write elsewhere — the reload fetches the same item
 * again by id, with fresh likes — until the member asks for another.
 */
export function useRandomPick<T extends { id: string }>(
  pick: () => Promise<T | null>,
  byId: (id: string) => Promise<T>,
  deps: readonly unknown[],
  action: string,
): { state: LoadState<T | null>; round: number; again: () => void } {
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<{ key: string; id: string | null } | null>(null);
  const key = `${JSON.stringify(deps)}#${round}`;
  const state = useLoad(
    async () => {
      if (picked?.key === key) return picked.id ? byId(picked.id) : null;
      const item = await pick();
      setPicked({ key, id: item?.id ?? null });
      return item;
    },
    [key],
    action,
  );
  return { state, round, again: () => setRound((n) => n + 1) };
}
