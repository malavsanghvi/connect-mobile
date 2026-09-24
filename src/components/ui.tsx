import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space, touch, type as typeScale, type ColorName } from '@/theme';

import { Icon, type IconName } from './icon';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export type TxtVariant =
  | 'hero'
  | 'display'
  | 'title'
  | 'headline'
  | 'subhead'
  | 'cardTitle'
  | 'section'
  | 'body'
  | 'bodyStrong'
  | 'small'
  | 'smallStrong'
  | 'meta'
  | 'caption'
  | 'eyebrow'
  | 'fine'
  | 'badge';

const variants: Record<TxtVariant, TextStyle> = {
  hero: { fontFamily: fonts.displayBold, fontSize: typeScale.hero, lineHeight: 36 },
  display: { fontFamily: fonts.displayBold, fontSize: typeScale.display, lineHeight: 32 },
  title: { fontFamily: fonts.displayBold, fontSize: typeScale.title, lineHeight: 28 },
  headline: { fontFamily: fonts.display, fontSize: typeScale.headline, lineHeight: 25 },
  subhead: { fontFamily: fonts.bodySemi, fontSize: typeScale.subhead, lineHeight: 24 },
  cardTitle: { fontFamily: fonts.bodySemi, fontSize: typeScale.cardTitle, lineHeight: 23 },
  section: { fontFamily: fonts.bodySemi, fontSize: typeScale.section, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: typeScale.body, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: typeScale.body, lineHeight: 22 },
  small: { fontFamily: fonts.body, fontSize: typeScale.bodySmall, lineHeight: 20 },
  smallStrong: { fontFamily: fonts.bodySemi, fontSize: typeScale.bodySmall, lineHeight: 20 },
  meta: { fontFamily: fonts.body, fontSize: typeScale.meta, lineHeight: 18 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: typeScale.caption, lineHeight: 16 },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: typeScale.caption, lineHeight: 16, letterSpacing: 0.9, textTransform: 'uppercase' },
  fine: { fontFamily: fonts.body, fontSize: typeScale.fine, lineHeight: 15 },
  badge: { fontFamily: fonts.bodyBold, fontSize: typeScale.badge, lineHeight: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
};

export type TxtProps = TextProps & {
  variant?: TxtVariant;
  color?: ColorName;
  center?: boolean;
  style?: StyleProp<TextStyle>;
};

/** All text goes through Txt so the member's text-size setting applies everywhere. */
export function Txt({ variant = 'body', color = 'ink', center, style, ...rest }: TxtProps) {
  const { scale } = useSettings();
  const v = variants[variant];
  return (
    <Text
      {...rest}
      style={[
        v,
        { color: colors[color], fontSize: (v.fontSize ?? 15) * scale, lineHeight: v.lineHeight ? v.lineHeight * scale : undefined },
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brown' | 'green' | 'maroon' | 'store' | 'purple' | 'light';

const buttonTones: Record<ButtonTone, { bg: string; fg: ColorName; border?: string }> = {
  primary: { bg: colors.navy, fg: 'white' },
  secondary: { bg: colors.card, fg: 'navy', border: colors.navyBorder },
  ghost: { bg: 'transparent', fg: 'navy' },
  danger: { bg: colors.danger, fg: 'white' },
  brown: { bg: colors.brown, fg: 'white' },
  green: { bg: colors.green, fg: 'white' },
  maroon: { bg: colors.maroonButton, fg: 'white' },
  store: { bg: colors.store, fg: 'white' },
  purple: { bg: colors.purple, fg: 'white' },
  light: { bg: colors.white, fg: 'navy' },
};

export type ButtonProps = {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  size?: 'cta' | 'md' | 'sm';
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  fill?: boolean;
};

export function Button({ label, onPress, tone = 'primary', size = 'cta', disabled, busy, icon, accessibilityHint, style, fill = true }: ButtonProps) {
  const t = buttonTones[tone];
  const inactive = disabled || busy;
  const height = size === 'cta' ? touch.cta : size === 'md' ? touch.secondary : touch.min;
  const bg = inactive && (tone === 'primary' || tone === 'brown' || tone === 'green' || tone === 'maroon' || tone === 'store' || tone === 'purple' || tone === 'danger') ? colors.navyDisabled : t.bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [
        {
          minHeight: height,
          borderRadius: size === 'cta' ? radii.cta : radii.pill,
          backgroundColor: bg,
          borderWidth: t.border ? 1.5 : 0,
          borderColor: t.border,
          paddingHorizontal: size === 'sm' ? space.md : space.lg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          alignSelf: fill ? 'stretch' : 'flex-start',
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}>
      {busy ? <ActivityIndicator color={colors[t.fg]} /> : icon ? <Icon name={icon} size={18} color={colors[t.fg]} /> : null}
      <Txt variant={size === 'cta' ? 'section' : 'smallStrong'} color={inactive && tone === 'secondary' ? 'faint' : t.fg} center>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Round icon-only button with a 44px target. */
export function IconButton({ icon, label, onPress, color = colors.navy, disabled }: { icon: IconName; label: string; onPress: () => void; color?: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({ width: touch.min, height: touch.min, borderRadius: touch.min / 2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={24} color={color} />
    </Pressable>
  );
}

export function LinkText({ label, onPress, color = 'navy' }: { label: string; onPress: () => void; color?: ColorName }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={{ minHeight: touch.min, justifyContent: 'center' }}>
      <Txt variant="smallStrong" color={color} style={{ textDecorationLine: 'underline' }}>
        {label}
      </Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export type CardTone = 'default' | 'navy' | 'brown' | 'amber' | 'green' | 'purple' | 'maroon' | 'store' | 'danger' | 'panel' | 'dashed';

const cardTones: Record<CardTone, { bg: string; border: string; dashed?: boolean }> = {
  default: { bg: colors.card, border: colors.border },
  navy: { bg: colors.navy, border: colors.navy },
  brown: { bg: colors.brown, border: colors.brown },
  amber: { bg: colors.brownTint, border: colors.brownBorder },
  green: { bg: colors.greenTint, border: colors.greenBorder },
  purple: { bg: colors.purpleBg, border: colors.purpleBorder },
  maroon: { bg: colors.maroon, border: colors.maroon },
  store: { bg: colors.store, border: colors.store },
  danger: { bg: colors.dangerTint, border: colors.danger },
  panel: { bg: colors.panel, border: colors.panel },
  dashed: { bg: 'transparent', border: colors.dashed, dashed: true },
};

export function Card({
  children,
  tone = 'default',
  onPress,
  accessibilityLabel,
  style,
  padded = true,
}: {
  children: ReactNode;
  tone?: CardTone;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const t = cardTones[tone];
  const base: ViewStyle = {
    backgroundColor: t.bg,
    borderColor: t.border,
    borderWidth: 1,
    borderStyle: t.dashed ? 'dashed' : 'solid',
    borderRadius: radii.xl,
    padding: padded ? space.lg : 0,
    gap: space.sm,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Row({ children, gap = space.sm, style, align = 'center' }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle['alignItems'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

export function VStack({ children, gap = space.md, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Divider({ color = colors.divider }: { color?: string }) {
  return <View style={{ height: 1, backgroundColor: color }} />;
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
      <Txt variant="eyebrow" color="muted" accessibilityRole="header">
        {children}
      </Txt>
      {action}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export function ListRow({
  title,
  subtitle,
  onPress,
  left,
  right,
  chevron = !!onPress,
  titleColor = 'ink',
  accessibilityHint,
}: {
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  left?: ReactNode;
  right?: ReactNode;
  chevron?: boolean;
  titleColor?: ColorName;
  accessibilityHint?: string;
}) {
  const content = (
    <Row gap={space.md} style={{ minHeight: touch.row, paddingVertical: space.sm }}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong" color={titleColor}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="meta" color="muted">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-forward" size={18} color={colors.faint} /> : null}
    </Row>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title} accessibilityHint={accessibilityHint} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Selection controls
// ---------------------------------------------------------------------------

export function Chip({ label, selected, onPress, disabled, tone = 'navy' }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean; tone?: 'navy' | 'brown' | 'store' | 'purple' }) {
  const on = { navy: colors.navy, brown: colors.brown, store: colors.store, purple: colors.purple }[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      style={({ pressed }) => ({
        minHeight: touch.min,
        paddingHorizontal: space.lg,
        borderRadius: radii.pill,
        borderWidth: 1.5,
        borderColor: selected ? on : colors.borderInput,
        backgroundColor: selected ? on : colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}>
      {selected ? <Icon name="checkmark" size={16} color={colors.white} /> : null}
      <Txt variant="smallStrong" color={selected ? 'white' : 'ink2'}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{children}</View>;
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; badge?: boolean }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: colors.panel, borderRadius: radii.card, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.badge ? `${o.label}, new activity` : o.label}
            style={{ flex: 1, minHeight: touch.min, borderRadius: radii.md, backgroundColor: selected ? colors.card : 'transparent', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
            <Txt variant="smallStrong" color={selected ? 'navy' : 'muted'}>
              {o.label}
            </Txt>
            {o.badge ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger }} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ label, sub, value, onChange, disabled }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Row gap={space.md} style={{ minHeight: touch.row, paddingVertical: space.xs }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        {sub ? (
          <Txt variant="meta" color="muted">
            {sub}
          </Txt>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={sub}
        trackColor={{ false: colors.toggleOff, true: colors.green }}
        thumbColor={colors.white}
        ios_backgroundColor={colors.toggleOff}
      />
    </Row>
  );
}

export function Checkbox({ label, sub, checked, onChange, disabled, right }: { label: string; sub?: string | null; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; right?: ReactNode }) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      accessibilityState={{ checked, disabled: !!disabled }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.row, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: radii.sm,
          borderWidth: 2,
          borderColor: checked ? colors.navy : colors.dashed,
          backgroundColor: checked ? colors.navy : colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {checked ? <Icon name="checkmark" size={18} color={colors.white} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        {sub ? (
          <Txt variant="meta" color="muted">
            {sub}
          </Txt>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Radio({ label, sub, selected, onPress }: { label: string; sub?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: touch.row,
        padding: space.md,
        borderRadius: radii.card,
        borderWidth: 1.5,
        borderColor: selected ? colors.navy : colors.borderInput,
        backgroundColor: selected ? colors.navyTint : colors.card,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? colors.navy : colors.dashed, alignItems: 'center', justifyContent: 'center' }}>
        {selected ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: colors.navy }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        {sub ? (
          <Txt variant="meta" color="muted">
            {sub}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

export function Stepper({ valueLabel, onMinus, onPlus, minusDisabled, plusDisabled, minusLabel, plusLabel, size = 52 }: { valueLabel: string; onMinus: () => void; onPlus: () => void; minusDisabled?: boolean; plusDisabled?: boolean; minusLabel: string; plusLabel: string; size?: number }) {
  const btn = (icon: IconName, label: string, onPress: () => void, disabled?: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: colors.navyBorder, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={22} color={colors.navy} />
    </Pressable>
  );
  return (
    <Row gap={space.lg} style={{ justifyContent: 'center' }}>
      {btn('remove', minusLabel, onMinus, minusDisabled)}
      <Txt variant={size >= 52 ? 'hero' : 'section'} color="navy" style={{ minWidth: 80 }} center accessibilityLiveRegion="polite">
        {valueLabel}
      </Txt>
      {btn('add', plusLabel, onPlus, plusDisabled)}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export function TextField({ label, hint, error, style, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const { scale } = useSettings();
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="smallStrong" color="ink2">
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={colors.faint}
        accessibilityLabel={label}
        accessibilityHint={hint}
        {...input}
        style={[
          {
            minHeight: touch.min + 4,
            borderWidth: 1.5,
            borderColor: error ? colors.danger : colors.borderInput,
            borderRadius: radii.md,
            backgroundColor: colors.card,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            fontFamily: fonts.body,
            fontSize: typeScale.body * scale,
            color: colors.ink,
          },
          input.multiline ? { minHeight: 110, textAlignVertical: 'top' } : null,
          style,
        ]}
      />
      {error ? (
        <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="meta" color="muted">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Small display pieces
// ---------------------------------------------------------------------------

export function ProgressBar({ value, color = colors.green, track = colors.panel, height = 6, label }: { value: number; color?: string; track?: string; height?: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

export type PillTone = 'green' | 'amber' | 'navy' | 'grey' | 'red' | 'purple';

const pillTones: Record<PillTone, { bg: string; fg: ColorName }> = {
  green: { bg: colors.greenTint, fg: 'greenDark' },
  amber: { bg: colors.brownTint, fg: 'brown' },
  navy: { bg: colors.navyTint, fg: 'navy' },
  grey: { bg: colors.chip, fg: 'muted' },
  red: { bg: colors.dangerTint, fg: 'danger' },
  purple: { bg: colors.purpleTint, fg: 'purpleDark' },
};

export function Pill({ label, tone = 'grey' }: { label: string; tone?: PillTone }) {
  const t = pillTones[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Txt variant="caption" color={t.fg}>
        {label}
      </Txt>
    </View>
  );
}

export function Avatar({ name, size = 44, tone = 'navy' }: { name: string; size?: number; tone?: 'navy' | 'brown' | 'purple' | 'green' }) {
  const bg = { navy: colors.navyTint, brown: colors.brownTint, purple: colors.purpleTint, green: colors.greenTint }[tone];
  const fg = ({ navy: 'navy', brown: 'brown', purple: 'purple', green: 'green' } as const)[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
      <Txt variant="section" color={fg}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Txt>
    </View>
  );
}

export function Stat({ label, value, sub, color = 'ink' }: { label: string; value: string; sub?: string; color?: ColorName }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="caption" color="muted">
        {label}
      </Txt>
      <Txt variant="cardTitle" color={color}>
        {value}
      </Txt>
      {sub ? (
        <Txt variant="fine" color="muted">
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

export type BannerTone = 'info' | 'success' | 'warning' | 'error';

const bannerTones: Record<BannerTone, { bg: string; border: string; fg: ColorName; icon: IconName }> = {
  info: { bg: colors.navyTint, border: colors.navyBorder, fg: 'navy', icon: 'information-circle' },
  success: { bg: colors.greenTint, border: colors.greenBorder, fg: 'greenDark', icon: 'checkmark-circle' },
  warning: { bg: colors.brownTint, border: colors.brownBorder, fg: 'brownDark', icon: 'alert-circle' },
  error: { bg: colors.dangerTint, border: colors.danger, fg: 'danger', icon: 'alert-circle' },
};

export function Banner({ tone = 'info', title, message, action }: { tone?: BannerTone; title?: string; message: string; action?: { label: string; onPress: () => void } }) {
  const t = bannerTones[tone];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      style={{ backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, borderRadius: radii.card, padding: space.md, gap: space.sm }}>
      <Row align="flex-start" gap={space.sm}>
        <Icon name={t.icon} size={20} color={colors[t.fg]} />
        <View style={{ flex: 1, gap: 2 }}>
          {title ? (
            <Txt variant="smallStrong" color={t.fg}>
              {title}
            </Txt>
          ) : null}
          <Txt variant="small" color={t.fg}>
            {message}
          </Txt>
        </View>
      </Row>
      {action ? <Button label={action.label} onPress={action.onPress} tone="secondary" size="sm" fill={false} /> : null}
    </View>
  );
}
