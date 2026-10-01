import { useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { comboListShown, filterCombo, type ComboOption } from '@/lib/combo';
import { formatDob, monthName, parseDobInput, toISODate, weekdayOf } from '@/lib/format';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space, touch, type as typeScale } from '@/theme';

import { StrokeIcon } from './stroke-icon';
import { Button, Row, TextField, Txt } from './ui';

const fieldSizes = {
  sm: { h: touch.min, r: radii.md, font: typeScale.bodySmall, padX: 10 },
  md: { h: 48, r: radii.lg, font: typeScale.body, padX: space.md },
} as const;

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: space.lg }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: colors.card, borderRadius: radii.xl, padding: space.md, paddingBottom: space.md + insets.bottom, maxHeight: '80%' }}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * A pressable field, styled like `TextField`, that opens a modal list of
 * choices instead of the keyboard — a dropdown for a short, known list
 * (e.g. relationship) rather than free text.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  error,
  editable = true,
  size = 'sm',
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  editable?: boolean;
  size?: keyof typeof fieldSizes;
}) {
  const { scale } = useSettings();
  const [open, setOpen] = useState(false);
  const f = fieldSizes[size];
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="meta" color="muted">
        {label}
      </Txt>
      <Pressable
        onPress={() => editable && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={placeholder}
        style={{
          minHeight: f.h,
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.borderInput,
          borderRadius: f.r,
          backgroundColor: editable ? colors.card : colors.ground,
          paddingHorizontal: f.padX,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: editable ? 1 : 0.7,
        }}>
        <Txt style={{ fontFamily: fonts.body, fontSize: f.font * scale, color: value ? colors.ink : colors.faint }} numberOfLines={1}>
          {value || placeholder || ''}
        </Txt>
        <StrokeIcon name="forward" size={14} color={colors.faint} strokeWidth={2} />
      </Pressable>
      {error ? (
        <Txt variant="meta" color="danger">
          {error}
        </Txt>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Txt variant="bodyStrong" style={{ marginBottom: space.sm }}>
          {label}
        </Txt>
        <ScrollView style={{ maxHeight: 320 }}>
          {options.map((o) => (
            <Pressable
              key={o}
              onPress={() => {
                onChange(o);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: o === value }}
              style={{ minHeight: touch.min, justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: radii.md, backgroundColor: o === value ? colors.navyTint : 'transparent' }}>
              <Txt variant="body" color={o === value ? 'navy' : 'ink'} style={{ fontFamily: o === value ? fonts.bodySemi : fonts.body }}>
                {o}
              </Txt>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </View>
  );
}

/**
 * A type-ahead field: a `TextField` whose matching suggestions (lib/combo `filterCombo`) list under it while it has
 * focus. Free text is always allowed — the list only helps — and `normalize` tidies what was typed when the field
 * loses focus ("tex" → "TX"). Picking a suggestion calls `onPick` (default: put its value in the field). Pure JS, no
 * native module. Screens keep taps on the list from closing the keyboard (`keyboardShouldPersistTaps="handled"`); on
 * the web a row is picked as the press starts, before the field's blur.
 */
export function ComboField({
  label,
  value,
  onChangeText,
  options,
  onPick,
  normalize,
  maxShown = 6,
  ...field
}: Omit<TextInputProps, 'value' | 'onChangeText' | 'onFocus' | 'onBlur'> & {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  options: readonly ComboOption[];
  onPick?: (option: ComboOption) => void;
  normalize?: (v: string) => string;
  hint?: string;
  error?: string | null;
  size?: keyof typeof fieldSizes;
  maxShown?: number;
}) {
  const [open, setOpen] = useState(false);
  /** The text as last typed or picked: a blur right after a pick (web) must not put the typed text back. */
  const latest = useRef(value);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matches = open ? filterCombo(options, value, maxShown) : [];
  const shown = comboListShown(matches, value);

  const change = (v: string) => {
    latest.current = v;
    setOpen(true);
    onChangeText(v);
  };
  const pick = (o: ComboOption) => {
    latest.current = o.value;
    setOpen(false);
    if (onPick) onPick(o);
    else onChangeText(o.value);
  };
  const focus = () => {
    if (closing.current) clearTimeout(closing.current);
    latest.current = value;
    setOpen(true);
  };
  const blur = () => {
    const tidy = normalize ? normalize(latest.current) : latest.current;
    if (tidy !== latest.current) {
      latest.current = tidy;
      onChangeText(tidy);
    }
    // A moment's grace so a press that blurred the field still lands on its row.
    closing.current = setTimeout(() => setOpen(false), 200);
  };

  return (
    <View style={{ gap: space.xs }}>
      <TextField label={label} value={value} onChangeText={change} onFocus={focus} onBlur={blur} autoCorrect={false} {...field} />
      {shown ? (
        <View accessibilityLabel={label} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.card, overflow: 'hidden' }}>
          {matches.map((o, i) => (
            <Pressable
              key={o.value}
              onPressIn={Platform.OS === 'web' ? () => pick(o) : undefined}
              onPress={() => pick(o)}
              accessibilityRole="button"
              accessibilityLabel={o.detail ? `${o.label}, ${o.detail}` : o.label}
              style={({ pressed }) => ({
                minHeight: touch.min,
                paddingHorizontal: space.md,
                paddingVertical: space.xs,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
                backgroundColor: pressed ? colors.navyTint : 'transparent',
              })}>
              <Txt variant="body" style={{ flexShrink: 0 }}>
                {o.label}
              </Txt>
              {o.detail ? (
                <Txt variant="meta" color="muted" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
                  {o.detail}
                </Txt>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Days in `m` (1–12) of `y`, accounting for leap years. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * A pressable field, styled like `TextField`, that opens a calendar so a date
 * is picked rather than typed. Keeps the same "MM/DD/YYYY" contract as the
 * text field it replaces, so callers (validation, save) are unchanged.
 */
export function DateField({
  label,
  value,
  onChangeText,
  error,
  editable = true,
  size = 'sm',
  minYear = 1900,
  maxYear = new Date().getFullYear(),
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string | null;
  editable?: boolean;
  size?: keyof typeof fieldSizes;
  minYear?: number;
  maxYear?: number;
}) {
  const { scale } = useSettings();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'year' | 'month' | 'day'>('day');
  const parsed = useMemo(() => parseDobInput(value), [value]);
  const today = new Date();
  const [y, setY] = useState(parsed ? Number(parsed.slice(0, 4)) : maxYear - 30);
  const [m, setM] = useState(parsed ? Number(parsed.slice(5, 7)) : today.getUTCMonth() + 1);
  const f = fieldSizes[size];

  const openPicker = () => {
    if (parsed) {
      setY(Number(parsed.slice(0, 4)));
      setM(Number(parsed.slice(5, 7)));
    }
    setStep('day');
    setOpen(true);
  };
  const pickDay = (d: number) => {
    onChangeText(formatDob(toISODate(y, m, d)));
    setOpen(false);
  };

  const dim = daysInMonth(y, m);
  const firstWeekday = weekdayOf(toISODate(y, m, 1));
  const years: number[] = [];
  for (let yr = maxYear; yr >= minYear; yr--) years.push(yr);

  return (
    <View style={{ gap: 6 }}>
      <Txt variant="meta" color="muted">
        {label}
      </Txt>
      <Pressable
        onPress={() => editable && openPicker()}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          minHeight: f.h,
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.borderInput,
          borderRadius: f.r,
          backgroundColor: editable ? colors.card : colors.ground,
          paddingHorizontal: f.padX,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: editable ? 1 : 0.7,
        }}>
        <Txt style={{ fontFamily: fonts.body, fontSize: f.font * scale, color: value ? colors.ink : colors.faint }}>{value || 'MM/DD/YYYY'}</Txt>
        <StrokeIcon name="calendar" size={16} color={colors.faint} />
      </Pressable>
      {error ? (
        <Txt variant="meta" color="danger">
          {error}
        </Txt>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        {step === 'year' ? (
          <>
            <Txt variant="bodyStrong" style={{ marginBottom: space.sm }}>
              {label} · year
            </Txt>
            <ScrollView style={{ maxHeight: 320 }}>
              {years.map((yr) => (
                <Pressable
                  key={yr}
                  onPress={() => {
                    setY(yr);
                    setStep('month');
                  }}
                  style={{ minHeight: touch.min, justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: radii.md, backgroundColor: yr === y ? colors.navyTint : 'transparent' }}>
                  <Txt variant="body" color={yr === y ? 'navy' : 'ink'}>
                    {yr}
                  </Txt>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : step === 'month' ? (
          <>
            <Txt variant="bodyStrong" style={{ marginBottom: space.sm }}>
              {label} · {y}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
                <Pressable
                  key={mo}
                  onPress={() => {
                    setM(mo);
                    setStep('day');
                  }}
                  style={{
                    width: '30%',
                    minHeight: touch.min,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radii.md,
                    backgroundColor: mo === m ? colors.navyTint : colors.ground,
                  }}>
                  <Txt variant="body" color={mo === m ? 'navy' : 'ink'}>
                    {monthName(mo)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
              <Pressable onPress={() => setM(m === 1 ? (setY(y - 1), 12) : m - 1)} accessibilityLabel="Previous month" hitSlop={8} style={{ padding: space.xs }}>
                <StrokeIcon name="back" size={18} />
              </Pressable>
              <Pressable onPress={() => setStep('year')} accessibilityRole="button">
                <Txt variant="bodyStrong">
                  {monthName(m, true)} {y}
                </Txt>
              </Pressable>
              <Pressable onPress={() => setM(m === 12 ? (setY(y + 1), 1) : m + 1)} accessibilityLabel="Next month" hitSlop={8} style={{ padding: space.xs }}>
                <StrokeIcon name="forward" size={18} />
              </Pressable>
            </Row>
            <View style={{ flexDirection: 'row' }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
                <View key={i} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingBottom: 4 }}>
                  <Txt variant="meta" color="muted">
                    {w}
                  </Txt>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: firstWeekday }, (_, i) => (
                <View key={`b${i}`} style={{ width: `${100 / 7}%`, height: 40 }} />
              ))}
              {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
                const selected = parsed === toISODate(y, m, d);
                return (
                  <View key={d} style={{ width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <Pressable
                      onPress={() => pickDay(d)}
                      accessibilityRole="button"
                      style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.navy : 'transparent' }}>
                      <Txt variant="body" color={selected ? 'card' : 'ink'}>
                        {d}
                      </Txt>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        )}
        <Button label="Cancel" tone="ghost" size="sm" onPress={() => setOpen(false)} style={{ marginTop: space.sm }} />
      </Sheet>
    </View>
  );
}
