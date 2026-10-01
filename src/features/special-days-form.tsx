import { useState } from 'react';

import { Banner, Button, Card, Chip, ChipGroup, TextField, Txt } from '@/components/ui';
import { OCCASIONS, kindLabel, reminderSpan, splitTithi, type Occasion } from '@/features/special-days';
import { saveSpecialDay } from '@/lib/api/family';
import { report } from '@/lib/errors';
import { formatDob, parseDobInput } from '@/lib/format';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { fonts } from '@/theme';

function FieldLabel({ children }: { children: string }) {
  return (
    <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
      {children}
    </Txt>
  );
}

/**
 * The "add a special day" form (whose, occasion, remember by, date or tithi, reminder). Shared by Family › Special
 * days and the onboarding step, so both save through the same path. `onDone` runs after a successful save.
 */
export function AddSpecialDayForm({ onDone, preview = false }: { onDone: () => void; /** Preview of onboarding: check the form as usual but save nothing. */ preview?: boolean }) {
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
    if (preview) {
      toast(t('preview.notSaved'));
      return onDone();
    }
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
