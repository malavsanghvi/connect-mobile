import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, IconButton, TextField, Txt, VStack } from '@/components/ui';
import { OCCASIONS, kindLabel, listDisplayName, occasionOf, reminderSpan, splitTithi, whenText, yearsOn, type Occasion } from '@/features/special-days';
import { deleteSpecialDay, listSpecialDays, nextTithiDates, saveSpecialDay } from '@/lib/api/family';
import { report } from '@/lib/errors';
import { formatDay, formatDob, monthShortUpper, parseDobInput, parseISODate, todayAt } from '@/lib/format';
import { isWithinReminder, nextOccurrence } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

const TINT: Record<Occasion | 'diksha', { bg: string; fg: string }> = {
  birthday: { bg: colors.brownTint, fg: colors.brown },
  anniversary: { bg: colors.dangerTint, fg: colors.anniversary },
  birth_tithi: { bg: colors.navyTint, fg: colors.navy },
  punyatithi: { bg: colors.frame, fg: colors.muted },
  other: { bg: colors.greenTint, fg: colors.green },
  diksha: { bg: colors.navyTint, fg: colors.navy },
};

/**
 * Special days (Main.dc.html isDays): date tile, title, "Turns 10 · Tue, Oct 6",
 * reminder line in weeks, "Plan labh" inside the reminder window (opens the
 * Birthday labh screen), dashed "+ Add a special day" that toggles to "Close".
 */
export default function SpecialDaysScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const { invalidate } = useDataVersion();
  const { toast, confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useLoad(
    async () => {
      if (!member?.household || !center) return [];
      const today = todayAt(center.time_zone);
      const days = await listSpecialDays(member.household.id);
      const tithi = await nextTithiDates(center.id, today, days.filter((d) => !d.calendar_date && d.tithi && d.tithi_month).map((d) => ({ id: d.id, tithi: d.tithi as string, month: d.tithi_month as string })));
      return days
        .map((d) => ({ day: d, next: d.calendar_date ? nextOccurrence(d.calendar_date, today) : (tithi[d.id] ?? null), today }))
        .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999'));
    },
    [member?.household?.id, center?.id],
    'load special days',
  );
  if (!member) return null;

  const remove = async (id: string, name: string) => {
    const ok = await confirm({ title: t('days.removeTitle'), body: t('days.removeBody', { name }), confirmLabel: t('common.delete'), tone: 'danger' });
    if (!ok) return;
    setError(null);
    try {
      await deleteSpecialDay(id);
      invalidate();
      toast(t('days.removed'));
    } catch (err) {
      setError(report(err, 'remove this special day').userMessage);
    }
  };

  return (
    <Screen title={t('days.title')} onRefresh={async () => invalidate()}>
      <Txt variant="small" color="ink2" style={{ lineHeight: 21 }}>
        {t('days.intro')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Loaded state={state}>
        {(rows) => (
          <VStack gap={space.md}>
            {rows.length === 0 ? <EmptyState icon="gift-outline" title={t('days.none')} /> : null}
            {rows.map(({ day, next, today }) => {
              const occ = occasionOf(day);
              const tint = TINT[occ];
              const name = listDisplayName(t, day, member.members);
              const who = day.person_id ? member.members.find((m) => m.person.id === day.person_id) : null;
              const years = day.calendar_date ? yearsOn(day.calendar_date, next) : null;
              const yearsText = years != null ? (occ === 'birthday' ? t('days.turns', { n: years }) : occ === 'anniversary' ? t('days.years', { n: years }) : null) : null;
              const sub = [
                yearsText,
                day.tithi ? `${day.tithi_month ?? ''} ${day.tithi}`.trim() : null,
                next ? formatDay(next) : t('days.tithiUnknown'),
              ]
                .filter(Boolean)
                .join(' · ');
              const soon = isWithinReminder(next, today, day.reminder_days_before);
              const span = reminderSpan(t, day.reminder_days_before);
              const remind = soon ? t('days.reminderSent', { span }) : t('days.reminderBefore', { span, when: whenText(t, today, next) });
              const canPlan = soon && day.labh_prompt_enabled && occ !== 'punyatithi' && member.isAdult;
              return (
                <View key={day.id} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={{ width: 48, height: 52, borderRadius: radii.lg, backgroundColor: tint.bg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
                    <Txt variant="badge" style={{ color: tint.fg }}>
                      {next ? monthShortUpper(next) : '—'}
                    </Txt>
                    <Txt variant="subhead" style={{ color: tint.fg, fontFamily: fonts.bodyBold }}>
                      {next ? String(parseISODate(next)?.d ?? '') : '?'}
                    </Txt>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong">{name}</Txt>
                    <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                      {who && occ === 'punyatithi' && !day.label ? `${who.person.first_name} · ${sub}` : sub}
                    </Txt>
                    <Txt variant="fine" color="faint">
                      {remind}
                    </Txt>
                  </View>
                  {canPlan ? (
                    <Pressable
                      onPress={() => router.push(`/labh/${day.id}` as Href)}
                      accessibilityRole="button"
                      accessibilityLabel={t('days.planLabhLabel', { name })}
                      style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: space.md, borderRadius: 18, backgroundColor: colors.brown, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                      <Txt variant="caption" color="white" style={{ fontFamily: fonts.bodySemi }}>
                        {t('days.planLabh')}
                      </Txt>
                    </Pressable>
                  ) : null}
                  {member.isAdult && !canPlan ? <IconButton icon="trash-outline" label={t('days.removeLabel', { name })} color={colors.faint} iconSize={20} onPress={() => remove(day.id, name)} /> : null}
                </View>
              );
            })}
          </VStack>
        )}
      </Loaded>
      {member.isAdult ? (
        <>
          <Pressable
            onPress={() => setAdding(!adding)}
            accessibilityRole="button"
            accessibilityState={{ expanded: adding }}
            style={({ pressed }) => ({ minHeight: 52, borderRadius: radii.row, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Txt variant="bodyStrong" color="navy">
              {adding ? t('days.close') : t('days.add')}
            </Txt>
          </Pressable>
          {adding ? <AddForm onDone={() => setAdding(false)} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
      {children}
    </Txt>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const { member, center } = useApp();
  const { invalidate } = useDataVersion();
  const { toast } = useFeedback();
  const [who, setWho] = useState<string | null>(member?.members[0]?.person.id ?? null);
  const [label, setLabel] = useState('');
  const [occasion, setOccasion] = useState<Occasion>('birthday');
  const [by, setBy] = useState<'date' | 'tithi'>('date');
  const [date, setDate] = useState(() => formatDob(member?.members[0]?.person.date_of_birth));
  const [tithi, setTithi] = useState('');
  const [remind, setRemind] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!member?.household || !center) return null;
  const householdId = member.household.id;
  const pickWho = (id: string | null) => {
    setWho(id);
    const p = id ? member.members.find((m) => m.person.id === id) : null;
    if (occasion === 'birthday' && p?.person.date_of_birth) setDate(formatDob(p.person.date_of_birth));
  };
  const pickOccasion = (o: Occasion) => {
    setOccasion(o);
    if (o === 'birth_tithi' || o === 'punyatithi') setBy('tithi');
  };

  const save = async () => {
    setError(null);
    let calendarDate: string | null = null;
    let tithiParts: { month: string; tithi: string } | null = null;
    if (by === 'date') {
      calendarDate = parseDobInput(date);
      if (!calendarDate) return setError(t('days.dateInvalid'));
    } else {
      tithiParts = splitTithi(tithi);
      if (!tithiParts) return setError(t('days.tithiRequired'));
    }
    if (!who && !label.trim()) return setError(t('days.labelRequired'));
    setBusy(true);
    try {
      const kind = occasion === 'birth_tithi' ? 'birthday' : occasion;
      await saveSpecialDay({
        center_id: center.id,
        household_id: householdId,
        person_id: who,
        kind,
        label: label.trim() || null,
        calendar_date: calendarDate,
        tithi: tithiParts?.tithi ?? null,
        tithi_month: tithiParts?.month ?? null,
        reminder_days_before: remind,
        // Punyatithis are never shown on Home (connect-crm 0007 default).
        show_on_home: kind !== 'punyatithi',
      });
      invalidate();
      toast(t('days.saved', { span: reminderSpan(t, remind) }));
      onDone();
    } catch (err) {
      setError(report(err, 'save this special day').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <FieldLabel>{t('days.whose')}</FieldLabel>
      <ChipGroup>
        {member.members.map((m) => (
          <Chip key={m.person.id} label={m.person.preferred_name || m.person.first_name} selected={who === m.person.id} onPress={() => pickWho(m.person.id)} />
        ))}
        <Chip label={t('days.someoneElse')} selected={who === null} onPress={() => pickWho(null)} />
      </ChipGroup>
      {who === null ? <TextField size="sm" label={t('days.label')} value={label} onChangeText={setLabel} placeholder={t('days.labelPlaceholder')} /> : null}
      <FieldLabel>{t('days.occasion')}</FieldLabel>
      <ChipGroup>
        {OCCASIONS.map((k) => (
          <Chip key={k} label={kindLabel(t, k)} selected={occasion === k} onPress={() => pickOccasion(k)} />
        ))}
      </ChipGroup>
      <FieldLabel>{t('days.rememberBy')}</FieldLabel>
      <ChipGroup columns={2}>
        <Chip grid label={t('days.byDate')} selected={by === 'date'} onPress={() => setBy('date')} />
        <Chip grid label={t('days.byTithi')} selected={by === 'tithi'} onPress={() => setBy('tithi')} />
      </ChipGroup>
      {by === 'date' ? (
        <TextField size="sm" label={t('days.date')} value={date} onChangeText={setDate} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" />
      ) : (
        <TextField size="sm" label={t('days.tithiField')} value={tithi} onChangeText={setTithi} placeholder="Kartak sud 12" />
      )}
      <FieldLabel>{t('days.remind')}</FieldLabel>
      <ChipGroup columns={3}>
        {[7, 14, 30].map((n) => (
          <Chip key={n} grid label={reminderSpan(t, n)} selected={remind === n} onPress={() => setRemind(n)} />
        ))}
      </ChipGroup>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={t('days.save')} size="md" onPress={save} busy={busy} />
    </Card>
  );
}
