import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, IconButton, Row, Segmented, TextField, Toggle, Txt, VStack } from '@/components/ui';
import { SPECIAL_DAY_KINDS, kindLabel, listDisplayName } from '@/features/special-days';
import { deleteSpecialDay, listSpecialDays, nextTithiDates, saveSpecialDay, type SpecialDayKind } from '@/lib/api/family';
import { report } from '@/lib/errors';
import { daysBetween, formatDay, formatDob, monthShortUpper, parseDobInput, parseISODate, todayAt } from '@/lib/format';
import { nextOccurrence } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

const KIND_TINT: Record<string, { bg: string; fg: string }> = {
  birthday: { bg: colors.brownTint, fg: colors.brown },
  anniversary: { bg: colors.dangerTint, fg: colors.maroon },
  punyatithi: { bg: colors.chip, fg: colors.muted },
  diksha: { bg: colors.navyTint, fg: colors.navy },
  other: { bg: colors.greenTint, fg: colors.green },
};

/** Special days (prototype §2.22): private to the household; adults add and remove. */
export default function SpecialDaysScreen() {
  const t = useT();
  const { member, center } = useApp();
  const { invalidate } = useDataVersion();
  const { toast, confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useLoad(
    async () => {
      if (!member?.household || !center) throw new Error('no household');
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
      <Txt variant="small" color="ink2">
        {t('days.intro')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Loaded state={state}>
        {(rows) => (
          <VStack gap={space.md}>
            {rows.length === 0 ? <EmptyState icon="gift-outline" title={t('days.none')} /> : null}
            {rows.map(({ day, next, today }) => {
              const tint = KIND_TINT[day.kind] ?? KIND_TINT.other;
              const inDays = next ? daysBetween(today, next) : null;
              const name = listDisplayName(t, day, member.members);
              return (
                <Card key={day.id}>
                  <Row gap={space.md}>
                    <View style={{ width: 52, borderRadius: radii.lg, backgroundColor: tint.bg, alignItems: 'center', paddingVertical: space.sm }}>
                      <Txt variant="badge" style={{ color: tint.fg }}>
                        {next ? monthShortUpper(next) : '—'}
                      </Txt>
                      <Txt variant="section" style={{ color: tint.fg }}>
                        {next ? String(parseISODate(next)?.d ?? '') : '?'}
                      </Txt>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="bodyStrong">{name}</Txt>
                      <Txt variant="meta" color="muted">
                        {[kindLabel(t, day.kind), day.tithi ? `${day.tithi_month ?? ''} ${day.tithi}`.trim() : null, next ? formatDay(next) : t('days.tithiUnknown')].filter(Boolean).join(' · ')}
                      </Txt>
                      <Txt variant="caption" color="muted">
                        {inDays != null && inDays <= day.reminder_days_before ? t('days.reminderSent', { n: day.reminder_days_before }) : t('days.reminderBefore', { n: day.reminder_days_before })}
                      </Txt>
                    </View>
                    {member.isAdult ? <IconButton icon="trash-outline" label={t('days.removeLabel', { name })} color={colors.danger} onPress={() => remove(day.id, name)} /> : null}
                  </Row>
                </Card>
              );
            })}
          </VStack>
        )}
      </Loaded>
      {member.isAdult ? adding ? <AddForm onDone={() => setAdding(false)} /> : <Button label={t('days.add')} tone="brown" icon="add" onPress={() => setAdding(true)} /> : null}
    </Screen>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const { member, center } = useApp();
  const { invalidate } = useDataVersion();
  const { toast } = useFeedback();
  const [who, setWho] = useState<string | null>(member?.members[0]?.person.id ?? null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<SpecialDayKind>('birthday');
  const [by, setBy] = useState<'date' | 'tithi'>('date');
  const [date, setDate] = useState(() => formatDob(member?.members[0]?.person.date_of_birth));
  const [tithi, setTithi] = useState('');
  const [month, setMonth] = useState('');
  const [remind, setRemind] = useState(14);
  const [showHome, setShowHome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!member?.household || !center) return null;

  const save = async () => {
    setError(null);
    let calendarDate: string | null = null;
    if (by === 'date') {
      calendarDate = parseDobInput(date);
      if (!calendarDate) return setError(t('days.dateInvalid'));
    } else if (!tithi.trim() || !month.trim()) {
      return setError(t('days.tithiRequired'));
    }
    if (!who && !label.trim()) return setError(t('days.labelRequired'));
    setBusy(true);
    try {
      await saveSpecialDay({
        center_id: center.id,
        household_id: member.household?.id as string,
        person_id: who,
        kind,
        label: label.trim() || null,
        calendar_date: calendarDate,
        tithi: by === 'tithi' ? tithi.trim() : null,
        tithi_month: by === 'tithi' ? month.trim() : null,
        reminder_days_before: remind,
        show_on_home: kind === 'punyatithi' ? false : showHome,
      });
      invalidate();
      toast(t('days.saved', { n: remind }));
      onDone();
    } catch (err) {
      setError(report(err, 'save this special day').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Txt variant="section">{t('days.addTitle')}</Txt>
      <Txt variant="smallStrong" color="ink2">
        {t('days.whose')}
      </Txt>
      <ChipGroup>
        {member.members.map((m) => (
          <Chip key={m.person.id} label={m.person.preferred_name || m.person.first_name} selected={who === m.person.id} onPress={() => setWho(m.person.id)} tone="brown" />
        ))}
        <Chip label={t('days.someoneElse')} selected={who === null} onPress={() => setWho(null)} tone="brown" />
      </ChipGroup>
      {who === null ? <TextField label={t('days.label')} value={label} onChangeText={setLabel} placeholder={t('days.labelPlaceholder')} /> : null}
      <Txt variant="smallStrong" color="ink2">
        {t('days.occasion')}
      </Txt>
      <ChipGroup>
        {SPECIAL_DAY_KINDS.map((k) => (
          <Chip key={k} label={kindLabel(t, k)} selected={kind === k} onPress={() => setKind(k)} tone="brown" />
        ))}
      </ChipGroup>
      <Segmented
        label={t('days.rememberBy')}
        value={by}
        onChange={setBy}
        options={[
          { value: 'date', label: t('days.byDate') },
          { value: 'tithi', label: t('days.byTithi') },
        ]}
      />
      {by === 'date' ? (
        <TextField label={t('days.date')} value={date} onChangeText={setDate} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" hint={t('days.dateHint')} />
      ) : (
        <Row gap={space.md} align="flex-start">
          <View style={{ flex: 1 }}>
            <TextField label={t('days.tithiMonth')} value={month} onChangeText={setMonth} placeholder="Kartak" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={t('days.tithi')} value={tithi} onChangeText={setTithi} placeholder="Sud 5" />
          </View>
        </Row>
      )}
      <Txt variant="smallStrong" color="ink2">
        {t('days.remind')}
      </Txt>
      <ChipGroup>
        {[7, 14, 30].map((n) => (
          <Chip key={n} label={n === 7 ? t('days.week1') : n === 14 ? t('days.week2') : t('days.month1')} selected={remind === n} onPress={() => setRemind(n)} tone="brown" />
        ))}
      </ChipGroup>
      {kind !== 'punyatithi' ? <Toggle label={t('days.showHome')} value={showHome} onChange={setShowHome} /> : <Txt variant="meta" color="muted">{t('days.punyatithiNote')}</Txt>}
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={t('days.save')} tone="brown" onPress={save} busy={busy} />
      <Button label={t('common.cancel')} tone="ghost" size="md" onPress={onDone} />
    </Card>
  );
}
