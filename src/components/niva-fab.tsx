import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';

import type { StringKey } from '@/i18n/en';
import { useApp } from '@/providers/app';
import { useSettings } from '@/providers/settings';
import { colors, components, fonts, radii, shadows, space } from '@/theme';

import { StrokeIcon } from './stroke-icon';
import { Txt } from './ui';

const QUESTIONS: StringKey[] = ['niva.fabQ1', 'niva.fabQ2', 'niva.fabQ3'];

function FabButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const { scale } = useSettings();
  const size = components.fab.size * Math.min(scale, 1.15);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [
        {
          height: components.fab.h,
          minWidth: components.fab.h,
          paddingLeft: 16,
          paddingRight: 18,
          borderRadius: radii.fab,
          backgroundColor: colors.brown,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          opacity: pressed ? 0.9 : 1,
        },
        shadows.fab,
      ]}>
      <StrokeIcon name="sparkle" size={24} color={colors.white} strokeWidth={2} />
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: size, lineHeight: size * 1.3, color: colors.white }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Niva floating button (prototype Main L1398–1411): brown "✦ Niva" pill at the
 * bottom right, opening a popover with three suggested questions and
 * "Open chat". Place it inside a relatively positioned area that ends where
 * the tab bar (or sticky footer) starts; it floats 16px above that edge.
 */
export function NivaFab() {
  const { t } = useSettings();
  const router = useRouter();
  const { center } = useApp();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const anchor = useRef<View>(null);
  const [open, setOpen] = useState<{ bottom: number; right: number } | null>(null);
  const community = center?.short_name || center?.name || '';

  const show = () => {
    const node = anchor.current;
    if (!node) return setOpen({ bottom: components.fab.bottom, right: components.fab.right });
    node.measureInWindow((x, y, w) => {
      setOpen({ bottom: Math.max(0, windowHeight - y - components.fab.h), right: Math.max(0, windowWidth - x - w) });
    });
  };
  const ask = (q?: string) => {
    setOpen(null);
    router.push(q ? { pathname: '/niva', params: { q } } : '/niva');
  };

  return (
    <>
      <View ref={anchor} collapsable={false} style={{ position: 'absolute', right: components.fab.right, bottom: 16, opacity: open ? 0 : 1 }}>
        <FabButton label={t('niva.fab')} a11y={t('niva.fabLabel', { center: community })} onPress={show} />
      </View>
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.scrimFaint }} onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel={t('niva.fabCloseLabel')} />
        {open ? (
          <>
            <View
              accessibilityViewIsModal
              style={[
                {
                  position: 'absolute',
                  right: open.right,
                  bottom: open.bottom + components.fab.h + 12,
                  width: 290,
                  maxWidth: windowWidth - 32,
                  backgroundColor: colors.card,
                  borderRadius: radii.pill,
                  padding: 14,
                  gap: space.sm,
                },
                shadows.menu,
              ]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <StrokeIcon name="sparkle" size={18} color={colors.brown} strokeWidth={2} />
                <Txt variant="bodyStrong" style={{ fontFamily: fonts.bodyBold }} accessibilityRole="header">
                  {t('niva.fabLabel', { center: community })}
                </Txt>
              </View>
              <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                {t('niva.fabSub')}
              </Txt>
              {QUESTIONS.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => ask(t(key))}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: colors.brownBorder,
                    backgroundColor: colors.brownTint,
                    borderRadius: radii.card,
                    paddingVertical: space.sm,
                    paddingHorizontal: space.md,
                    opacity: pressed ? 0.8 : 1,
                  })}>
                  <Txt variant="meta" color="brownDark" style={{ fontFamily: fonts.bodyMedium }}>
                    {t(key)}
                  </Txt>
                </Pressable>
              ))}
              <Pressable
                onPress={() => ask()}
                accessibilityRole="button"
                style={({ pressed }) => ({ minHeight: 46, borderRadius: radii.pill, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                <Txt variant="smallStrong" color="white">
                  {t('niva.openChat')}
                </Txt>
              </Pressable>
            </View>
            <View style={{ position: 'absolute', right: open.right, bottom: open.bottom }}>
              <FabButton label={t('niva.fabClose')} a11y={t('niva.fabCloseLabel')} onPress={() => setOpen(null)} />
            </View>
          </>
        ) : null}
      </Modal>
    </>
  );
}
