import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDob, monthName, parseDobInput, toISODate, weekdayOf } from '@/lib/format';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space, touch, type as typeScale } from '@/theme';

import { StrokeIcon } from './stroke-icon';
import { Button, Row, Txt } from './ui';

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
