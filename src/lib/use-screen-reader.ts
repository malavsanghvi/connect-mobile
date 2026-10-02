import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { logError } from './errors';

/*
 * Whether VoiceOver or TalkBack is on: one store for the app, read once and
 * kept up to date, like Reduce Motion in src/features/gyan/motion.ts. A
 * browser cannot tell (react-native-web always answers "on"), so on the web
 * this is false and pages rely on ARIA instead (live regions, focus).
 */

/** null until the phone has answered (a moment after the first use). */
let screenReader: boolean | null = null;
let watching = false;
const listeners = new Set<() => void>();

function setScreenReader(v: boolean): void {
  if (screenReader === v) return;
  screenReader = v;
  for (const l of listeners) l();
}

function watch(): void {
  if (watching || Platform.OS === 'web') return;
  watching = true;
  AccessibilityInfo.isScreenReaderEnabled()
    .then((v) => setScreenReader(!!v))
    .catch((err: unknown) => {
      logError('checking whether a screen reader is on (assuming it is off)', err);
      setScreenReader(false);
    });
  // Kept for the whole app session: the screen reader can be turned on while the app is open.
  AccessibilityInfo.addEventListener('screenReaderChanged', (v: boolean) => setScreenReader(!!v));
}

function subscribe(listener: () => void): () => void {
  watch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = (): boolean | null => (Platform.OS === 'web' ? false : screenReader);

/** true / false, or null while it is not known yet. */
export function useScreenReader(): boolean | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
