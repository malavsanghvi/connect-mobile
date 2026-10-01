import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

import { logError } from '@/lib/errors';

/** The phone's "reduce motion" setting, kept up to date. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduce(v);
      })
      .catch((err: unknown) => logError('checking reduce-motion (animating anyway)', err));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => setReduce(v));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
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

/** A sideways shake for a wrong answer; still when reduce-motion is on. */
export function useShake(reduce: boolean): { style: { transform: { translateX: Animated.Value }[] }; shake: () => void } {
  const [x] = useState(() => new Animated.Value(0));
  const shake = () => {
    if (reduce) return;
    x.setValue(0);
    Animated.sequence(
      [10, -10, 7, -7, 3, 0].map((toValue) => Animated.timing(x, { toValue, duration: 55, easing: Easing.linear, useNativeDriver: true })),
    ).start();
  };
  return { style: { transform: [{ translateX: x }] }, shake };
}

/** A soft pulsing 0 → 1 loop for a glowing spot or microphone; 0 when reduce-motion is on. */
export function usePulse(active: boolean, reduce: boolean): Animated.Value {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active || reduce) {
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
