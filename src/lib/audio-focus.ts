/**
 * One sound at a time. The app-wide player (src/providers/player.tsx) and the
 * screen players (recitations, pachchakhan — src/features/audio.tsx) each
 * register a "pause" here; whichever starts playing claims the focus and the
 * others pause, so a stavan never plays over a recitation. Pure, unit-tested
 * in src/lib/__tests__/audio-focus.test.ts.
 */

type Pause = () => void;

const owners = new Map<number, Pause>();
let lastId = 0;

/** Register a player; call `unregister` when it goes away. */
export function registerAudioOwner(pause: Pause): { id: number; unregister: () => void } {
  lastId += 1;
  const id = lastId;
  owners.set(id, pause);
  return { id, unregister: () => void owners.delete(id) };
}

/**
 * `id` is about to play: pause every other registered player. A player that
 * fails to pause is reported to `onError` (logged by the caller) and the rest
 * still pause.
 */
export function claimAudioFocus(id: number, onError: (err: unknown) => void): void {
  for (const [other, pause] of owners) {
    if (other === id) continue;
    try {
      pause();
    } catch (err) {
      onError(err);
    }
  }
}
