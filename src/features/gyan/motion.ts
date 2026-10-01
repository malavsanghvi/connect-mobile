import * as Haptics from 'expo-haptics';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

import { logError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Reduce Motion: one store for the app, read once and kept up to date, so a
// newly mounted animation starts from the known setting instead of `false`.
// ---------------------------------------------------------------------------

/** null until the phone has answered (a moment after the first use). */
let reduceMotion: boolean | null = null;
let watching = false;
const listeners = new Set<() => void>();

function setReduceMotion(v: boolean): void {
  if (reduceMotion === v) return;
  reduceMotion = v;
  for (const l of listeners) l();
}

function watchReduceMotion(): void {
  if (watching) return;
  watching = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => setReduceMotion(!!v))
    .catch((err: unknown) => {
      logError('checking reduce-motion (animating anyway)', err);
      setReduceMotion(false);
    });
  // Kept for the whole app session: the setting can change while the app is open.
  AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => setReduceMotion(!!v));
}

function subscribe(listener: () => void): () => void {
  watchReduceMotion();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = (): boolean | null => reduceMotion;

/**
 * The phone's "reduce motion" setting: true, false, or null while it is not
 * known yet. Animations wait for `false` before they move; with `true` they
 * stay still (a fade at most).
 */
export function useReduceMotion(): boolean | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export type HapticKind = 'tap' | 'right' | 'wrong' | 'complete';

/** A small buzz for right / wrong / complete. Not on web; a phone without haptics just stays still. */
export function haptic(kind: HapticKind): void {
  if (Platform.OS === 'web') return;
  const run =
    kind === 'tap'
      ? Haptics.selectionAsync()
      : kind === 'right'
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        : kind === 'wrong'
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  run.catch((err: unknown) => logError(`haptic feedback "${kind}" (continuing without it)`, err));
}

/** A sideways shake for a wrong answer; still when reduce-motion is on (or not known yet). */
export function useShake(reduce: boolean | null): { style: { transform: { translateX: Animated.Value }[] }; shake: () => void } {
  const [x] = useState(() => new Animated.Value(0));
  const shake = () => {
    if (reduce !== false) return;
    x.setValue(0);
    Animated.sequence(
      [10, -10, 7, -7, 3, 0].map((toValue) => Animated.timing(x, { toValue, duration: 55, easing: Easing.linear, useNativeDriver: true })),
    ).start();
  };
  return { style: { transform: [{ translateX: x }] }, shake };
}

/** A soft pulsing 0 → 1 loop for a glowing spot or microphone; 0 when reduce-motion is on (or not known yet). */
export function usePulse(active: boolean, reduce: boolean | null): Animated.Value {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active || reduce !== false) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      v.setValue(0);
    };
  }, [active, reduce, v]);
  return v;
}
