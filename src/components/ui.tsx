import { Children, type ReactNode } from 'react';
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
import { colors, fonts, radii, space, touch, tracking, type as typeScale, type ColorName } from '@/theme';

import { Icon, type IconName } from './icon';
import { StrokeIcon, type StrokeIconName } from './stroke-icon';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export type TxtVariant =
  | 'onboardingHero'
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
  onboardingHero: { fontFamily: fonts.displayBold, fontSize: typeScale.onboardingHero, lineHeight: 39 },
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
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: typeScale.caption, lineHeight: 16, letterSpacing: tracking.eyebrow, textTransform: 'uppercase' },
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

/**
 * Prototype buttons (Main.dc.html): fully rounded, weight 600, 1px border on
 * outlined tones. Filled: navy primary, green, brown, purple, black (#111),
 * store, maroon, danger. Outlined (white fill, coloured 1px border and text):
 * secondary (navy), outlineGreen, outlineBrown, outlinePurple, outlineDanger,
 * outlineStore, outlineBlack.
 */
export type ButtonTone =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'brown'
  | 'green'
  | 'maroon'
  | 'store'
  | 'purple'
  | 'black'
  | 'light'
  | 'outlineGreen'
  | 'outlineBrown'
  | 'outlinePurple'
  | 'outlineDanger'
  | 'outlineStore'
  | 'outlineBlack';

const buttonTones: Record<ButtonTone, { bg: string; fg: ColorName; border?: string }> = {
  primary: { bg: colors.navy, fg: 'white' },
  secondary: { bg: colors.card, fg: 'navy', border: colors.navy },
  ghost: { bg: 'transparent', fg: 'navy' },
  danger: { bg: colors.danger, fg: 'white' },
  brown: { bg: colors.brown, fg: 'white' },
  green: { bg: colors.green, fg: 'white' },
  maroon: { bg: colors.maroonButton, fg: 'white' },
  store: { bg: colors.store, fg: 'white' },
  purple: { bg: colors.purple, fg: 'white' },
  black: { bg: colors.black, fg: 'white' },
  light: { bg: colors.white, fg: 'navy' },
  outlineGreen: { bg: colors.card, fg: 'green', border: colors.green },
  outlineBrown: { bg: colors.card, fg: 'brown', border: colors.brown },
  outlinePurple: { bg: colors.card, fg: 'purple', border: colors.purple },
  outlineDanger: { bg: colors.card, fg: 'danger', border: colors.danger },
  outlineStore: { bg: colors.card, fg: 'store', border: colors.store },
  outlineBlack: { bg: colors.card, fg: 'black', border: colors.black },
};

/** cta 52/r26/16 · md 48/r26/15 · card 46/r22/14 (buttons inside cards) · sm 44/r20/13. */
const buttonSizes = {
  cta: { h: touch.cta, r: radii.cta, font: typeScale.section, padX: space.gutter },
  md: { h: touch.secondary, r: radii.cta, font: typeScale.body, padX: space.lg },
  card: { h: 46, r: radii.pill, font: typeScale.bodySmall, padX: space.lg },
  sm: { h: touch.min, r: radii.xxl, font: typeScale.meta, padX: 14 },
} as const;

export type ButtonProps = {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  size?: keyof typeof buttonSizes;
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  accessibilityHint?: string;
  /** Spoken name when the visible label is not unique on the screen (defaults to the label). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  fill?: boolean;
};

export function Button({ label, onPress, tone = 'primary', size = 'cta', disabled, busy, icon, accessibilityHint, accessibilityLabel, style, fill = true }: ButtonProps) {
  const { scale } = useSettings();
  const t = buttonTones[tone];
  const sz = buttonSizes[size];
  const inactive = disabled || busy;
  const filled = !t.border && tone !== 'ghost' && tone !== 'light';
  const bg = inactive && filled ? colors.navyDisabled : t.bg;
  const fg: ColorName = inactive && !filled ? 'faint' : t.fg;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [
        {
          minHeight: sz.h,
          borderRadius: sz.r,
          backgroundColor: bg,
          borderWidth: t.border ? 1 : 0,
          borderColor: inactive ? colors.borderInput : t.border,
          paddingHorizontal: sz.padX,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          alignSelf: fill ? 'stretch' : 'flex-start',
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}>
      {busy ? <ActivityIndicator color={colors[fg]} /> : icon ? <Icon name={icon} size={18} color={colors[fg]} /> : null}
      <Txt variant="smallStrong" color={fg} center style={{ fontSize: sz.font * scale, lineHeight: Math.round(sz.font * 1.3) * scale }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export type IconButtonVariant = 'plain' | 'outline' | 'filled';

/**
 * 44px round icon-only button. `outline` = the prototype header button (white,
 * 1px #E3D9C8 border); `filled` = the navy member-card button. Pass `glyph`
 * for the prototype's stroke icons, or `icon` for an Ionicons name.
 */
export function IconButton({
  icon,
  glyph,
  label,
  onPress,
  color,
  disabled,
  variant = 'plain',
  size = touch.min,
  iconSize,
}: {
  icon?: IconName;
  glyph?: StrokeIconName;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  variant?: IconButtonVariant;
  size?: number;
  iconSize?: number;
}) {
  const fg = color ?? (variant === 'filled' ? colors.white : colors.navy);
  const glyphSize = iconSize ?? (glyph ? 20 : 24);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={size < touch.min ? (touch.min - size) / 2 : 4}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        backgroundColor: variant === 'filled' ? colors.navy : variant === 'outline' ? colors.card : 'transparent',
        borderWidth: variant === 'outline' ? 1 : 0,
        borderColor: colors.borderInput,
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}>
      {glyph ? <StrokeIcon name={glyph} size={glyphSize} color={fg} strokeWidth={2} /> : icon ? <Icon name={icon} size={glyphSize} color={fg} /> : null}
    </Pressable>
  );
}

/** Text button (prototype: 14/600 navy, no underline). */
export function LinkText({ label, onPress, color = 'navy', underline = false }: { label: string; onPress: () => void; color?: ColorName; underline?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => ({ minHeight: touch.min, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Txt variant="smallStrong" color={color} style={underline ? { textDecorationLine: 'underline' } : null}>
        {label}
      </Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

/**
 * Card tones (prototype): `default` white with a 1px #E8E0D2 border; tinted
 * callouts (`amber`, `green`, `purple`, `danger`, `panel`); solid colour
 * cards with white text (`navy`, `brown`, `greenSolid`, `maroon`, `store`);
 * white cards with a 2px coloured border (`outlineNavy`, `outlinePurple`,
 * `outlineSaffron`, `outlineBrown`, `outlineGreen`), used for the Home
 * feature cards (feedback, special day, …).
 */
export type CardTone =
  | 'default'
  | 'navy'
  | 'brown'
  | 'amber'
  | 'green'
  | 'greenSolid'
  | 'purple'
  | 'maroon'
  | 'store'
  | 'danger'
  | 'panel'
  | 'dashed'
  | 'outlineNavy'
  | 'outlinePurple'
  | 'outlineSaffron'
  | 'outlineBrown'
  | 'outlineGreen';

const cardTones: Record<CardTone, { bg: string; border: string; dashed?: boolean; width?: number }> = {
  default: { bg: colors.card, border: colors.border },
  navy: { bg: colors.navy, border: colors.navy },
  brown: { bg: colors.brown, border: colors.brown },
  amber: { bg: colors.brownTint, border: colors.brownBorder },
  green: { bg: colors.greenTint, border: colors.greenBorder },
  greenSolid: { bg: colors.green, border: colors.green },
  purple: { bg: colors.purpleBg, border: colors.purpleBorder },
  maroon: { bg: colors.maroon, border: colors.maroon },
  store: { bg: colors.store, border: colors.store },
  danger: { bg: colors.dangerTint, border: colors.danger },
  panel: { bg: colors.panel, border: colors.panel },
  dashed: { bg: 'transparent', border: colors.dashed, dashed: true },
  outlineNavy: { bg: colors.card, border: colors.navy, width: 2 },
  outlinePurple: { bg: colors.card, border: colors.purple, width: 2 },
  outlineSaffron: { bg: colors.card, border: colors.saffron, width: 2 },
  outlineBrown: { bg: colors.card, border: colors.brown, width: 2 },
  outlineGreen: { bg: colors.card, border: colors.green, width: 2 },
};

export function Card({
  children,
  tone = 'default',
  onPress,
  accessibilityLabel,
  style,
  padded = true,
  hero,
}: {
  children: ReactNode;
  tone?: CardTone;
  /** Home "hero" card: radius 20, padding 16. */
  hero?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const t = cardTones[tone];
  const base: ViewStyle = {
    backgroundColor: t.bg,
    borderColor: t.border,
    borderWidth: t.width ?? 1,
    borderStyle: t.dashed ? 'dashed' : 'solid',
    borderRadius: hero ? radii.xxl : radii.xl,
    paddingVertical: padded ? (hero ? space.lg : space.cardY) : 0,
    paddingHorizontal: padded ? space.cardX : 0,
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
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm, paddingHorizontal: space.xxs, paddingTop: space.xxs }}>
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

/** The prototype's row chevron: a "›" glyph, 18px faint. */
export function Chevron({ color = 'faint' }: { color?: ColorName }) {
  return (
    <Text style={{ fontFamily: fonts.body, fontSize: 18, lineHeight: 22, color: colors[color] }} accessibilityElementsHidden importantForAccessibility="no">
      {'\u203A'}
    </Text>
  );
}

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
      {chevron ? <Chevron /> : null}
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

export type ChipTone = 'navy' | 'brown' | 'store' | 'purple';

/**
 * Prototype chip: white with a 1px border and text in the tone colour when
 * idle, solid tone with white text when selected, no checkmark.
 * `grid` = the compact cell used in fixed 2/3-column sets (40px, radius 12,
 * 13/500); otherwise the free-wrapping pill (44px, radius 20, 14/500).
 */
export function Chip({ label, selected, onPress, disabled, tone = 'navy', grid }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean; tone?: ChipTone; grid?: boolean }) {
  const { scale } = useSettings();
  const on = { navy: colors.navy, brown: colors.brown, store: colors.store, purple: colors.purple }[tone];
  const size = grid ? typeScale.meta : typeScale.bodySmall;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      style={({ pressed }) => ({
        minHeight: grid ? 40 : touch.min,
        paddingHorizontal: grid ? space.sm : 14,
        borderRadius: grid ? radii.lg : radii.xxl,
        borderWidth: 1,
        borderColor: on,
        backgroundColor: selected ? on : colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: grid ? 1 : 0,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: size * scale, lineHeight: Math.round(size * 1.35) * scale, color: selected ? colors.white : on, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Chips that wrap (default), or a fixed `columns` grid (2 or 3) as the
 * prototype uses for fixed sets (channels, times, languages, text size).
 */
export function ChipGroup({ children, columns }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  if (!columns) return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{children}</View>;
  const items = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <View style={{ gap: space.xs }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: space.xs }}>
          {row.map((item, c) => (
            <View key={c} style={{ flex: 1, flexDirection: 'row' }}>
              {item}
            </View>
          ))}
          {Array.from({ length: columns - row.length }, (_, k) => (
            <View key={`pad${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
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
          width: 24,
          height: 24,
          borderRadius: radii.xs,
          borderWidth: 2,
          borderColor: colors.navy,
          backgroundColor: checked ? colors.navy : colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {checked ? <Icon name="checkmark" size={16} color={colors.white} /> : null}
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

/**
 * Prototype input: label 13 regular muted above; field 48px, radius 12, 1px
 * #E3D9C8 border, 15px text. `size="lg"` = the onboarding sign-in field
 * (52px, radius 14, 16px); `size="sm"` = compact forms (44px, radius 10, 14px).
 */
const fieldSizes = {
  sm: { h: touch.min, r: radii.md, font: typeScale.bodySmall, padX: 10 },
  md: { h: 48, r: radii.lg, font: typeScale.body, padX: space.md },
  lg: { h: touch.cta, r: radii.card, font: typeScale.section, padX: 14 },
} as const;

export function TextField({ label, hint, error, style, size = 'md', ...input }: TextInputProps & { label: string; hint?: string; error?: string | null; size?: keyof typeof fieldSizes }) {
  const { scale } = useSettings();
  const f = fieldSizes[size];
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="meta" color="muted">
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={colors.faint}
        accessibilityLabel={label}
        accessibilityHint={hint}
        {...input}
        style={[
          {
            minHeight: f.h,
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.borderInput,
            borderRadius: f.r,
            backgroundColor: colors.card,
            paddingHorizontal: f.padX,
            paddingVertical: space.sm,
            fontFamily: fonts.body,
            fontSize: f.font * scale,
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

export type PillTone = 'green' | 'amber' | 'navy' | 'grey' | 'red' | 'purple' | 'live';

const pillTones: Record<PillTone, { bg: string; fg: ColorName }> = {
  green: { bg: colors.greenTint, fg: 'greenDark' },
  amber: { bg: colors.brownTint, fg: 'brown' },
  navy: { bg: colors.navyTint, fg: 'navy' },
  grey: { bg: colors.chip, fg: 'muted' },
  red: { bg: colors.dangerTint, fg: 'danger' },
  purple: { bg: colors.purpleTint, fg: 'purpleDark' },
  /** The only solid pill in the prototype: LIVE. */
  live: { bg: colors.live, fg: 'white' },
};

export function Pill({ label, tone = 'grey' }: { label: string; tone?: PillTone }) {
  const t = pillTones[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Txt variant="caption" color={t.fg} style={{ fontFamily: tone === 'live' ? fonts.bodyBold : fonts.bodySemi }}>
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
