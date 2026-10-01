import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Txt } from '@/components/ui';
import { colors, fonts, radii } from '@/theme';

import { confettiPieces } from './celebrate';
import { useReduceMotion } from './motion';

/** A burst of confetti from the top centre (pure JS, Animated). Nothing at all with reduce-motion on. */
export function Confetti({ seed, top = 120 }: { seed: number; top?: number }) {
  const reduce = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const [pieces] = useState(() => confettiPieces(seed));
  useEffect(() => {
    if (reduce) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [reduce, progress]);
  if (reduce) return null;
  const palette = [colors.gold, colors.saffron, colors.green, colors.navy, colors.flame];
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, right: 0, top, alignItems: 'center' }}>
      {pieces.map((p, i) => {
        const start = p.delay;
        const range = (a: number[]) => a.map((x) => start + (1 - start) * x);
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size * 0.55,
              borderRadius: 2,
              backgroundColor: palette[p.color % palette.length],
              opacity: progress.interpolate({ inputRange: [0, start, 0.8, 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
              transform: [
                { translateX: progress.interpolate({ inputRange: range([0, 1]), outputRange: [0, p.dx], extrapolate: 'clamp' }) },
                { translateY: progress.interpolate({ inputRange: range([0, 0.35, 1]), outputRange: [0, p.rise, p.fall], extrapolate: 'clamp' }) },
                { rotate: progress.interpolate({ inputRange: range([0, 1]), outputRange: ['0deg', `${p.spin * 360}deg`], extrapolate: 'clamp' }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

/** "+N points" that pops in and floats away, with optional confetti. Mount it with a new key for each burst. */
export function PointsBurst({ seed, label, confetti }: { seed: number; label: string | null; confetti: boolean }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    v.setValue(0);
    const anim = Animated.timing(v, { toValue: 1, duration: reduce ? 2200 : 1700, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [v, reduce]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      {confetti ? <Confetti seed={seed} /> : null}
      {label ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            alignSelf: 'center',
            top: 110,
            backgroundColor: colors.gold,
            borderRadius: radii.pill,
            paddingVertical: 10,
            paddingHorizontal: 22,
            opacity: v.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] }),
            transform: reduce
              ? []
              : [
                  { scale: v.interpolate({ inputRange: [0, 0.15, 0.3, 1], outputRange: [0.6, 1.15, 1, 1] }) },
                  { translateY: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, -40] }) },
                ],
          }}>
          <Txt variant="subhead" color="treasureInk" style={{ fontFamily: fonts.bodyBold }}>
            {label}
          </Txt>
        </Animated.View>
      ) : null}
    </View>
  );
}
