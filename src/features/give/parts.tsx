import type { ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ProgressBar, Row, Txt } from '@/components/ui';
import type { Translate } from '@/i18n';
import { formatCents } from '@/lib/format';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import type { SlotsLine } from './rules';

/** Plain 16/600 heading between Give cards (prototype "Open opportunities", "Family pledges"). */
export function Heading({ children }: { children: string }) {
  return (
    <Txt variant="section" accessibilityRole="header">
      {children}
    </Txt>
  );
}

/** Tinted amount tile (prototype Give / Family pledges summary). */
export function TintTile({ tone, label, value, sub, size = 20 }: { tone: 'amber' | 'green'; label: string; value: string; sub?: string; size?: number }) {
  const amber = tone === 'amber';
  const { scale } = useSettings();
  return (
    <View style={{ flex: 1, backgroundColor: amber ? colors.brownTint : colors.greenTint, borderRadius: size > 20 ? radii.card : radii.lg, padding: size > 20 ? space.md : 10, gap: 2 }}>
      <Txt variant="caption" color={amber ? 'brownText' : 'greenDark2'} style={{ fontFamily: fonts.body }}>
        {label}
      </Txt>
      <Txt color={amber ? 'brown' : 'green'} style={{ fontFamily: fonts.bodyBold, fontSize: size * scale, lineHeight: Math.round(size * 1.3) * scale }}>
        {value}
      </Txt>
      {sub ? (
        <Txt variant="caption" color={amber ? 'brownText' : 'greenDark2'} style={{ fontFamily: fonts.body }}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

/** Square checkbox as the prototype draws it (26px, radius 7, 2px border). */
export function CheckBox({ checked, color = colors.brown, disabled, size = 26 }: { checked: boolean; color?: string; disabled?: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.check,
        borderWidth: 2,
        borderColor: disabled ? colors.toggleOff : color,
        backgroundColor: checked ? color : disabled ? colors.frame : colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
      {checked ? <Icon name="checkmark" size={size - 10} color={colors.white} /> : null}
    </View>
  );
}

/** Checklist row with name, note and amount (pujan checklist, labh options). */
export function CheckRow({ label, note, amountCents, checked, onToggle, disabled, last, minHeight = touch.row }: { label: string; note?: string | null; amountCents: number; checked: boolean; onToggle: () => void; disabled?: boolean; last?: boolean; minHeight?: number }) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={[label, note, formatCents(amountCents)].filter(Boolean).join('. ')}
      style={({ pressed }) => ({ minHeight, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider, opacity: pressed ? 0.8 : 1 })}>
      <CheckBox checked={checked && !disabled} disabled={disabled} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="body" color={disabled ? 'faint' : 'ink'} style={{ fontFamily: fonts.bodySemi }}>
          {label}
        </Txt>
        {note ? (
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {note}
          </Txt>
        ) : null}
      </View>
      <Txt variant="body" color={disabled ? 'faint' : 'ink'} style={{ fontFamily: fonts.bodyBold }}>
        {formatCents(amountCents)}
      </Txt>
    </Pressable>
  );
}

/** 60px amount / tier tile: brown border and amber fill when selected. */
export function AmountTile({ label, sub, selected, onPress, big }: { label: string; sub?: string | null; selected: boolean; onPress: () => void; big?: boolean }) {
  const { scale } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 60,
        borderRadius: radii.card,
        borderWidth: 2,
        borderColor: selected ? colors.brown : colors.border,
        backgroundColor: selected ? colors.brownTint : colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: space.sm,
        paddingHorizontal: space.xs,
        gap: 2,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Txt center style={{ fontFamily: fonts.bodyBold, fontSize: (big ? 17 : 15) * scale, lineHeight: Math.round((big ? 17 : 15) * 1.3) * scale }}>
        {label}
      </Txt>
      {sub ? (
        <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.bodySemi }}>
          {sub}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/** Rows of equal-width tiles. */
export function TileGrid({ columns, children }: { columns: number; children: ReactNode[] }) {
  const rows: ReactNode[][] = [];
  for (let i = 0; i < children.length; i += columns) rows.push(children.slice(i, i + columns));
  return (
    <View style={{ gap: space.sm }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: space.sm }}>
          {row}
          {Array.from({ length: columns - row.length }, (_, k) => (
            <View key={`pad${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** "$" amount field with a coloured 2px border (prototype "Your amount"). */
export function DollarField({ label, value, onChangeText, color = colors.brown, error }: { label?: string; value: string; onChangeText: (v: string) => void; color?: string; error?: string | null }) {
  const { scale } = useSettings();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Txt variant="meta" color="muted">
          {label}
        </Txt>
      ) : null}
      <Row gap={4} style={{ borderWidth: 2, borderColor: error ? colors.danger : color, borderRadius: radii.lg, backgroundColor: colors.card, minHeight: 50, paddingHorizontal: space.md }}>
        <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 18 * scale, color }}>$</Txt>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          accessibilityLabel={label}
          style={{ flex: 1, minHeight: 46, fontFamily: fonts.bodySemi, fontSize: 18 * scale, color: colors.ink }}
        />
      </Row>
      {error ? (
        <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

export function slotsText(t: Translate, line: SlotsLine): string {
  switch (line.kind) {
    case 'multi':
      return t('opp.slotsMulti', { taken: line.taken, total: line.total });
    case 'goal':
      return t('opp.slotsGoal', { pct: line.percent });
    case 'slots':
      return t('opp.slotsTaken', { taken: line.taken, total: line.total });
    default:
      return line.n === 1 ? t('opp.slotsFamiliesOne') : t('opp.slotsFamilies', { n: line.n });
  }
}

/** Saffron availability bar on a 6/8px track. */
export function AvailabilityBar({ fraction, height = 6, label }: { fraction: number; height?: number; label: string }) {
  return <ProgressBar value={fraction} color={colors.saffron} track={colors.divider} height={height} label={label} />;
}
