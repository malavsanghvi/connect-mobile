import { useState } from 'react';
import { View } from 'react-native';

import { ErrorState } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, LinkText, Row, TextField, Txt } from '@/components/ui';
import { CheckRow } from '@/features/give/parts';
import { turningAge } from '@/features/give/rules';
import { asClause, occasionsFor, canPlanLabh, kindLabel, labhDedication, labhToPledge, listDisplayName, reminderSpan, splitTithi, type Occasion } from '@/features/special-days';
import { saveSpecialDay } from '@/lib/api/family';
import { commitLabh, loadLabhOptions, type LabhOption } from '@/lib/api/giving';
import { report } from '@/lib/errors';
import { formatCents, formatDob, fullName, parseDobInput } from '@/lib/format';
import { nextOccurrence } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useCategory } from '@/providers/category';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useModule } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { fonts, space } from '@/theme';

function FieldLabel({ children }: { children: string }) {
  return (
    <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
      {children}
    </Txt>
  );
}

/**
 * "Would you like to plan any special days?" — Yes / Not now, asked before the form: on the onboarding step, and on
 * Family › Special days while the family has none yet.
 */
export function PlanDaysQuestion({ question, onYes, onNotNow }: { question: string; onYes: () => void; onNotNow: () => void }) {
  const t = useT();
  return (
    <Card style={{ gap: space.md }}>
      <Txt variant="section" accessibilityRole="header">
        {question}
      </Txt>
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}>
          <Button label={t('common.yes')} size="md" onPress={onYes} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t('days.notNow')} size="md" tone="secondary" onPress={onNotNow} />
        </View>
      </Row>
    </Card>
  );
}

/**
 * The "add a special day" form (whose, occasion, remember by, date or tithi, reminder) and, for an adult with Giving
 * on and any day but a punyatithi, an optional "Plan a labh for this day" list of the center's active labh options.
 * Saving adds the day, then records the picked labh through app.commit_labh: one open pledge each, paid later from
 * Give › Family pledges. If the day saves but the labh does not, the form says so and Retry repeats only the labh,
 * so the day is never added twice. Shared by Family › Special days and the onboarding step; `onDone` runs once the
 * day (and any labh) is saved.
 */
export function AddSpecialDayForm({ onDone, preview = false }: { onDone: () => void; /** Preview of onboarding: check the form as usual but save nothing. */ preview?: boolean }) {
  const t = useT();
  const { member, center } = useApp();
  const labhOn = useModule('labh');
  const { layout } = useCategory();
  const { invalidate } = useDataVersion();
  const { toast } = useFeedback();
  const [who, setWho] = useState<string | null>(member?.members[0]?.person.id ?? null);
  const [label, setLabel] = useState('');
  const [occasion, setOccasion] = useState<Occasion>('birthday');
  const [by, setBy] = useState<'date' | 'tithi'>('date');
  const [date, setDate] = useState(() => formatDob(member?.members[0]?.person.date_of_birth));
  const [tithi, setTithi] = useState('');
  const [remind, setRemind] = useState(14);
  const [picked, setPicked] = useState<string[]>([]);
  /** null: the default dedication for the day as it stands. */
  const [dedication, setDedication] = useState<string | null>(null);
  /** The day was saved but its labh was not: only the labh is retried. */
  const [savedDay, setSavedDay] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Money is adults only and needs the Labh module (which needs Giving); children never load the options.
  const labhAllowed = labhOn && !!member?.isAdult;
  const labhOptions = useLoad(() => (center && labhAllowed ? loadLabhOptions(center.id) : Promise.resolve<LabhOption[]>([])), [center?.id, labhAllowed], 'load the labh options');
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

  const kind = occasion === 'birth_tithi' ? 'birthday' : occasion;
  const calendarDate = by === 'date' ? parseDobInput(date) : null;
  const person = who ? (member.members.find((m) => m.person.id === who)?.person ?? null) : null;
  const heading = listDisplayName(t, { label: label.trim() || null, person_id: who, kind, calendar_date: calendarDate, tithi: by === 'tithi' ? (splitTithi(tithi)?.tithi ?? null) : null }, member.members);
  const labhAsked = canPlanLabh({ labhOn, isAdult: member.isAdult, occasion, labhPromptEnabled: true });
  const options = labhOptions.data ?? [];
  const { chosen, totalCents } = labhToPledge(options, picked, labhAsked && options.length > 0);
  const age = kind === 'birthday' && calendarDate ? turningAge(person?.date_of_birth, nextOccurrence(calendarDate, member.today)) : null;
  const dedicationText = dedication ?? labhDedication(t, { kind, heading, fullName: person ? fullName(person) : null, age });

  /** Record the picked labh for a saved day. On failure the day stays saved and the form offers Retry for this alone. */
  const pledgeLabh = async (dayId: string) => {
    setBusy(true);
    setError(null);
    try {
      const numbers = await commitLabh({ dayId, optionIds: chosen.map((o) => o.id), dedication: dedicationText, repeatYearly: false });
      invalidate();
      toast(t(numbers.length === 1 ? 'days.savedPledgeOne' : 'days.savedPledgeMany', { pledges: numbers.join(', ') }));
      setSavedDay(null);
      onDone();
    } catch (err) {
      setSavedDay({ id: dayId, name: heading });
      setError(t('days.labhFailed', { reason: asClause(report(err, 'save your labh').userMessage) }));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setError(null);
    let tithiParts: { month: string; tithi: string } | null = null;
    if (by === 'date') {
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
    let dayId: string;
    try {
      dayId = await saveSpecialDay({
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
    } catch (err) {
      setBusy(false);
      return setError(report(err, 'save this special day').userMessage);
    }
    invalidate();
    if (chosen.length === 0) {
      setBusy(false);
      toast(t('days.saved', { span: reminderSpan(t, remind) }));
      return onDone();
    }
    await pledgeLabh(dayId);
  };

  const labhSection =
    labhAsked && options.length > 0 ? (
      <View style={{ gap: space.sm }}>
        <FieldLabel>{t('days.labhTitle')}</FieldLabel>
        <Txt variant="meta" color="muted">
          {t('days.labhBody')}
        </Txt>
        <View>
          {options.map((o, i) => (
            <CheckRow
              key={o.id}
              label={o.name}
              note={o.purpose}
              amountCents={o.amount_cents}
              checked={picked.includes(o.id)}
              onToggle={() => setPicked(picked.includes(o.id) ? picked.filter((x) => x !== o.id) : [...picked, o.id])}
              last={i === options.length - 1}
            />
          ))}
        </View>
        {chosen.length ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="smallStrong">{chosen.length === 1 ? t('labh.oneSelected') : t('labh.nSelected', { n: chosen.length })}</Txt>
              <Txt variant="smallStrong" color="brown">
                {formatCents(totalCents)}
              </Txt>
            </Row>
            <TextField size="sm" label={t('labh.dedication')} value={dedicationText} onChangeText={setDedication} />
          </>
        ) : null}
      </View>
    ) : labhAsked && labhOptions.error && labhOptions.data === undefined ? (
      // The day can still be saved; the options just could not be listed.
      <ErrorState error={labhOptions.error} onRetry={() => void labhOptions.reload()} />
    ) : null;

  if (savedDay) {
    return (
      <Card style={{ gap: 10 }}>
        <Txt variant="bodyStrong" color="green">
          {t('days.daySaved', { name: savedDay.name })}
        </Txt>
        {labhSection}
        {error ? <Banner tone="error" message={error} /> : null}
        <Button label={t('common.retry')} size="md" tone="brown" onPress={() => void pledgeLabh(savedDay.id)} busy={busy} />
        <View style={{ alignItems: 'center' }}>
          <LinkText
            label={t('days.skipLabh')}
            onPress={() => {
              toast(t('days.saved', { span: reminderSpan(t, remind) }));
              onDone();
            }}
          />
        </View>
      </Card>
    );
  }

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
        {occasionsFor(layout.tradition).map((k) => (
          <Chip key={k} label={kindLabel(t, k)} selected={occasion === k} onPress={() => pickOccasion(k)} />
        ))}
      </ChipGroup>
      {layout.tradition ? (
        <>
          <FieldLabel>{t('days.rememberBy')}</FieldLabel>
          <ChipGroup columns={2}>
            <Chip grid label={t('days.byDate')} selected={by === 'date'} onPress={() => setBy('date')} />
            <Chip grid label={t('days.byTithi')} selected={by === 'tithi'} onPress={() => setBy('tithi')} />
          </ChipGroup>
        </>
      ) : null}
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
      {labhSection}
      {error ? <Banner tone="error" message={error} /> : null}
      <Button
        label={chosen.length ? t('days.saveAndPledge', { amount: formatCents(totalCents) }) : t('days.save')}
        tone={chosen.length ? 'brown' : 'primary'}
        size="md"
        onPress={save}
        busy={busy}
      />
    </Card>
  );
}
