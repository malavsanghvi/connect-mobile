import { useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Card, Checkbox, Chip, ChipGroup, LinkText, Row, TextField, Txt, VStack } from '@/components/ui';
import { saveBirthDate } from '@/lib/api/pathshala';
import { report } from '@/lib/errors';
import { parseDobInput } from '@/lib/format';
import { enrollmentStatus, myWaiverHolds, type LearnerRow, type NewChild, type RegistrationOptions, type Selection } from '@/lib/pathshala-registration';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

import { StepHeader, whenText } from './shared';

/** The relationships a child being added can have (the names connect-crm 0491 seeds; the office can correct it). */
const RELATIONSHIPS = [
  { value: 'Child', key: 'reg.rel.child' },
  { value: 'Grandchild', key: 'reg.rel.grandchild' },
  { value: 'Other relative', key: 'reg.rel.other' },
] as const;

/**
 * Step 1, "Who is joining" (plan §3.1): everyone in the household with their age on the term's cut-off date, children
 * first, then adult learners ("me" included; adults pay the adult class fee with no sibling discount, P23). Those
 * already registered show where they stand and can only add another track; the signed-in adult whose registration
 * (made by another adult) waits for their agreement to the waiver chooses themself to agree. A learner the database
 * has no birth date for is asked for it. A child who is not on the family yet can be added: the office adds them first.
 */
export function WhoStep({
  options,
  rows,
  chosen,
  newChildren,
  eyebrow,
  timeZone,
  newChildAgeOf,
  onToggle,
  onAddChild,
  onRemoveChild,
}: {
  options: RegistrationOptions;
  rows: LearnerRow[];
  chosen: Record<string, Selection>;
  newChildren: Selection[];
  eyebrow: string;
  timeZone: string | null;
  newChildAgeOf: (child: NewChild) => number | null;
  onToggle: (row: LearnerRow) => void;
  onAddChild: (child: NewChild) => void;
  onRemoveChild: (key: string) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const trackName = (id: string | null) => options.tracks.find((x) => x.id === id)?.name ?? null;
  const anySelectable = rows.some((r) => r.selectable);

  return (
    <VStack gap={space.md}>
      <StepHeader eyebrow={eyebrow} title={t('reg.who.title')} />
      <Txt variant="small" color="ink2">
        {t('reg.who.intro')}
      </Txt>
      {!anySelectable && newChildren.length === 0 ? <Banner tone="info" message={t('reg.who.none')} /> : null}
      <Card>
        {rows.map((row, i) => {
          const l = row.learner;
          const name = row.isMe ? t('reg.who.me', { name: l.firstName }) : l.firstName;
          const label = l.ageOnCutoff !== null ? `${name} · ${t('reg.who.age', { n: l.ageOnCutoff })}` : name;
          const sub = [
            row.group === 'adult' ? t('reg.who.adult') : null,
            ...row.live.map((e) => {
              const view = enrollmentStatus(e.status ?? 'requested', { holdReason: e.holdReason, holdUntil: e.holdExpiresAt, offered: false, registrationId: null, trackId: e.trackId });
              const status = t(view.key, { until: whenText(view.until, timeZone) });
              const track = trackName(e.trackId);
              return track ? t('reg.who.taken', { track, status }) : status;
            }),
            !row.selectable ? (row.live.length > 0 ? t('reg.who.allTaken') : t('reg.who.noLevels', { name: l.firstName })) : null,
            row.selectable && myWaiverHolds({ ...l, isMe: row.isMe }).length > 0 ? t('reg.who.agreeMine') : null,
            row.selectable && l.needsBirthDate ? t('reg.who.dobAsk', { name: l.firstName }) : null,
          ]
            .filter(Boolean)
            .join('\n');
          const checked = !!chosen[l.personId];
          return (
            <View key={l.personId} style={{ gap: space.xs, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.dividerLight, paddingTop: i > 0 ? space.xs : 0 }}>
              <Checkbox label={label} sub={sub || null} checked={checked} disabled={!row.selectable} onChange={() => onToggle(row)} />
              {checked && l.needsBirthDate ? <BirthDateField personId={l.personId} name={l.firstName} /> : null}
            </View>
          );
        })}
        {newChildren.map((s) => {
          const child = s.newChild as NewChild;
          const age = newChildAgeOf(child);
          return (
            <View key={s.key} style={{ gap: space.xxs, borderTopWidth: 1, borderTopColor: colors.dividerLight, paddingTop: space.xs }}>
              <Row style={{ justifyContent: 'space-between' }} align="flex-start">
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong">{age !== null ? `${child.firstName} · ${t('reg.who.age', { n: age })}` : child.firstName}</Txt>
                  <Txt variant="meta" color="brown">
                    {t('reg.who.newChild', { name: child.firstName })}
                  </Txt>
                </View>
                <LinkText label={t('reg.who.remove')} onPress={() => onRemoveChild(s.key)} />
              </Row>
            </View>
          );
        })}
      </Card>
      {adding ? (
        <AddChildForm
          onCancel={() => setAdding(false)}
          onAdd={(child) => {
            onAddChild(child);
            setAdding(false);
          }}
        />
      ) : (
        <Button label={t('reg.who.add')} tone="secondary" size="md" icon="person-add-outline" onPress={() => setAdding(true)} />
      )}
    </VStack>
  );
}

/** A learner's missing birth date, saved on their record before the fee can be worked out (plan §2.3). */
function BirthDateField({ personId, name }: { personId: string; name: string }) {
  const t = useT();
  const { invalidate } = useDataVersion();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const iso = parseDobInput(value);
    if (!iso) {
      setError(t('reg.who.dobInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveBirthDate(personId, iso);
      // The options are asked for again: the database then knows the age and stops asking.
      invalidate();
    } catch (err) {
      setError(t('reg.who.dobFailed', { name, reason: report(err, `save ${name}'s date of birth`).userMessage }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: space.xs, marginLeft: 36 }}>
      <TextField label={t('reg.who.dob')} hint={t('reg.who.dobHint')} value={value} onChangeText={setValue} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" error={error} />
      <Button label={t('reg.who.dobSave')} tone="secondary" size="sm" fill={false} busy={busy} disabled={!value.trim()} onPress={() => void save()} />
    </View>
  );
}

/** "Add a child who isn't listed": first and last name, birth date, relationship. Nothing is sent until Register. */
function AddChildForm({ onAdd, onCancel }: { onAdd: (child: NewChild) => void; onCancel: () => void }) {
  const t = useT();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [relationship, setRelationship] = useState<string>(RELATIONSHIPS[0].value);
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    if (!first.trim() || !last.trim()) {
      setError(t('reg.who.addNeedName'));
      return;
    }
    const iso = parseDobInput(dob);
    if (!iso) {
      setError(t('reg.who.addNeedDob'));
      return;
    }
    onAdd({ firstName: first.trim(), lastName: last.trim(), dateOfBirth: iso, relationship });
  };
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: space.md, gap: space.sm, backgroundColor: colors.card }}>
      <Txt variant="bodyStrong" accessibilityRole="header">
        {t('reg.who.addTitle')}
      </Txt>
      <Txt variant="meta" color="muted">
        {t('reg.who.addIntro')}
      </Txt>
      <TextField label={t('reg.who.addFirst')} value={first} onChangeText={setFirst} autoCapitalize="words" />
      <TextField label={t('reg.who.addLast')} value={last} onChangeText={setLast} autoCapitalize="words" />
      <TextField label={t('reg.who.dob')} value={dob} onChangeText={setDob} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" />
      <VStack gap={space.xs}>
        <Txt variant="meta" color="muted">
          {t('reg.who.addRelationship')}
        </Txt>
        <ChipGroup>
          {RELATIONSHIPS.map((r) => (
            <Chip key={r.value} label={t(r.key)} selected={relationship === r.value} onPress={() => setRelationship(r.value)} />
          ))}
        </ChipGroup>
      </VStack>
      {error ? <Banner tone="error" message={error} /> : null}
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        <Button label={t('reg.who.addSave')} size="sm" fill={false} onPress={add} />
        <Button label={t('common.cancel')} tone="secondary" size="sm" fill={false} onPress={onCancel} />
      </Row>
    </View>
  );
}
