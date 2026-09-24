import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';

import { Band, Screen } from '@/components/screen';
import { Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Checkbox, Chip, ChipGroup, IconButton, LinkText, Pill, Row, SectionTitle, Segmented, TextField, Toggle, Txt, VStack } from '@/components/ui';
import { bandFor } from '@/features/events';
import { commitmentOptions, getEvent, getHouseholdRsvp, getPledgeById, listAttendees, rsvpBlockReason, submitRsvp, type Attendee, type EventRow, type GoingPerson, type Rsvp } from '@/lib/api/events';
import type { Member } from '@/lib/api/member';
import type { Tables } from '@/lib/database.types';
import { report } from '@/lib/errors';
import { formatCents, formatDate, formatTimeRange, fullName, parseAmountToCents, zonedParts } from '@/lib/format';
import { commitmentTotalCents, isSenior, isUnder12 } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

type Loaded_ = { event: EventRow; rsvp: Rsvp | null; attendees: Attendee[]; pledge: Tables<'pledges'> | null; now: Date };

/** Event detail + RSVP (prototype §2.3). */
export default function EventScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member, center } = useApp();
  const state = useLoad(
    async (): Promise<Loaded_> => {
      const event = await getEvent(id);
      const rsvp = member?.household ? await getHouseholdRsvp(id, member.household.id) : null;
      const [attendees, pledge] = await Promise.all([rsvp ? listAttendees(rsvp.id) : Promise.resolve([]), rsvp?.commitment_pledge_id && member?.isAdult ? getPledgeById(rsvp.commitment_pledge_id) : Promise.resolve(null)]);
      return { event, rsvp, attendees, pledge, now: new Date() };
    },
    [id, member?.household?.id],
    'load this event',
  );

  return (
    <Screen title={t('events.rsvpTitle')}>
      <Loaded state={state}>{(d) => <EventBody data={d} member={member} tz={center?.time_zone ?? null} />}</Loaded>
    </Screen>
  );
}

function EventBody({ data, member, tz }: { data: Loaded_; member: Member | null; tz: string | null }) {
  const t = useT();
  const router = useRouter();
  const { setGuest } = useApp();
  const { event } = data;
  const openDirections = async () => {
    if (!event.venue) return;
    try {
      await WebBrowser.openBrowserAsync(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue)}`);
    } catch (err) {
      report(err, 'open directions');
    }
  };
  const block = rsvpBlockReason(event, data.now);

  return (
    <>
      <Band color={bandFor(event.id)} title={event.name} subtitle={`${formatDate(event.starts_at, tz)} · ${formatTimeRange(event.starts_at, event.ends_at, tz)}`}>
        {event.venue ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small" color="white" style={{ flex: 1 }}>
              {event.venue}
            </Txt>
            <IconButton icon="navigate-outline" label={t('events.directions')} color={colors.white} onPress={openDirections} />
          </Row>
        ) : null}
      </Band>
      {event.description ? (
        <Txt variant="body" color="ink2">
          {event.description}
        </Txt>
      ) : null}
      {!member ? (
        <Card tone="panel">
          <Txt variant="small">{t('events.signInToRsvp')}</Txt>
          <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
        </Card>
      ) : !member.isAdult ? (
        <LockedState onBack={() => router.replace('/')} />
      ) : block === 'not_open_yet' ? (
        <Banner tone="info" message={t('events.opensOn', { date: formatDate(event.rsvp_opens_at, tz) })} />
      ) : block ? (
        <Banner tone="info" message={t('events.rsvpClosed')} />
      ) : (
        <RsvpForm data={data} member={member} tz={tz} />
      )}
    </>
  );
}

type GoingState = Record<string, { going: boolean; assistance: boolean; note: string }>;

function RsvpForm({ data, member, tz }: { data: Loaded_; member: Member; tz: string | null }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const { event, rsvp, attendees, pledge } = data;
  const activeRsvp = rsvp && rsvp.status !== 'cancelled' ? rsvp : null;
  const eventDate = event.starts_at ? zonedParts(new Date(event.starts_at), tz).iso : member.today;
  const flags = Array.isArray(event.attendee_flags) ? (event.attendee_flags as string[]) : [];
  const allowGuests = event.audience === 'members_and_guests' || event.audience === 'public';
  const options = commitmentOptions(event);
  const hasCommitmentOptions = options.perPerson.length > 0 || options.lumpSum.length > 0 || options.open;

  const [going, setGoing] = useState<GoingState>(() => {
    const init: GoingState = {};
    for (const m of member.members) {
      const a = attendees.find((x) => x.person_id === m.person.id);
      init[m.person.id] = { going: activeRsvp ? !!a && a.status !== 'cancelled' : true, assistance: a?.needs_assistance ?? false, note: a?.assistance_note ?? '' };
    }
    return init;
  });
  const [guests, setGuests] = useState<string[]>(() => (activeRsvp ? attendees.filter((a) => !a.person_id && a.status !== 'cancelled').map((a) => a.display_name) : []));
  const [guestDraft, setGuestDraft] = useState('');
  const [mode, setMode] = useState<'none' | 'per_person' | 'lump_sum'>('none');
  const [unit, setUnit] = useState<number | 'other'>(0);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMembers = member.members.filter((m) => going[m.person.id]?.going);
  const count = selectedMembers.length + guests.length;
  const unitCents = unit === 'other' ? (parseAmountToCents(other) ?? 0) : unit;
  const total = commitmentTotalCents(mode, unitCents, count);
  const canCommit = hasCommitmentOptions && !pledge;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const list: GoingPerson[] = [
      ...selectedMembers.map((m) => ({
        personId: m.person.id,
        name: fullName(m.person),
        childUnder12: isUnder12(m.person.date_of_birth, eventDate),
        senior: isSenior(m.person.date_of_birth, eventDate),
        assistance: going[m.person.id]?.assistance ?? false,
        assistanceNote: going[m.person.id]?.note ?? '',
      })),
      ...guests.map((g) => ({ personId: null, name: g, childUnder12: false, senior: false, assistance: false, assistanceNote: '' })),
    ];
    try {
      const res = await submitRsvp({ event, member, existing: rsvp, going: list, commitment: { mode: canCommit ? mode : 'none', totalCents: canCommit ? total : 0 } });
      invalidate();
      toast(res.pledgeNumber ? t('events.rsvpSavedPledge', { n: count, pledge: res.pledgeNumber }) : t('events.rsvpSaved', { n: count }));
      router.replace({ pathname: '/event/[id]/tickets', params: { id: event.id } });
    } catch (err) {
      setError(report(err, 'save your RSVP').userMessage);
    } finally {
      setBusy(false);
    }
  };

  const label =
    count === 0
      ? t('events.selectWho')
      : `${activeRsvp ? t('events.updateRsvp', { n: count }) : t('events.rsvpN', { n: count })}${canCommit && mode !== 'none' && total > 0 ? ` · ${t('events.commit', { amount: formatCents(total) })}` : ''}`;

  return (
    <VStack gap={space.lg}>
      <SectionTitle>{t('events.whosComing')}</SectionTitle>
      <Card>
        {member.members.map((m) => {
          const g = going[m.person.id] ?? { going: false, assistance: false, note: '' };
          const tags = [
            isUnder12(m.person.date_of_birth, eventDate) && flags.includes('child_under_12') ? t('events.flagChild') : null,
            isSenior(m.person.date_of_birth, eventDate) && flags.includes('senior') ? t('events.flagSenior') : null,
          ].filter((x): x is string => !!x);
          return (
            <View key={m.person.id}>
              <Checkbox
                label={fullName(m.person)}
                sub={tags.join(' · ') || null}
                checked={g.going}
                onChange={(v) => setGoing({ ...going, [m.person.id]: { ...g, going: v } })}
              />
              {g.going && flags.includes('assistance') ? (
                <View style={{ paddingLeft: 38, gap: space.xs }}>
                  <Toggle label={t('events.needsAssistance')} value={g.assistance} onChange={(v) => setGoing({ ...going, [m.person.id]: { ...g, assistance: v } })} />
                  {g.assistance ? <TextField label={t('events.assistanceNote')} value={g.note} onChangeText={(v) => setGoing({ ...going, [m.person.id]: { ...g, note: v } })} placeholder={t('events.assistancePlaceholder')} /> : null}
                </View>
              ) : null}
            </View>
          );
        })}
        {guests.map((g) => (
          <Row key={g} style={{ justifyContent: 'space-between', minHeight: 44 }}>
            <Txt variant="bodyStrong">{g}</Txt>
            <Row gap={space.xs}>
              <Pill label={t('events.guest')} tone="grey" />
              <IconButton icon="close" label={t('events.removeGuest', { name: g })} onPress={() => setGuests(guests.filter((x) => x !== g))} />
            </Row>
          </Row>
        ))}
        {allowGuests ? (
          <Row gap={space.sm} align="flex-end">
            <View style={{ flex: 1 }}>
              <TextField label={t('events.addGuest')} value={guestDraft} onChangeText={setGuestDraft} placeholder={t('events.guestName')} />
            </View>
            <Button
              label={t('events.add')}
              tone="secondary"
              size="md"
              fill={false}
              disabled={!guestDraft.trim()}
              onPress={() => {
                setGuests([...guests, guestDraft.trim()]);
                setGuestDraft('');
              }}
            />
          </Row>
        ) : null}
      </Card>

      {pledge ? (
        <Banner tone="info" message={t('events.existingPledge', { amount: formatCents(pledge.amount_cents), pledge: pledge.pledge_number ?? '' })} />
      ) : canCommit ? (
        <VStack gap={space.sm}>
          <SectionTitle>{t('events.commitTitle')}</SectionTitle>
          <Segmented
            label={t('events.commitTitle')}
            value={mode}
            onChange={(v) => {
              setMode(v);
              setUnit(v === 'per_person' ? (options.perPerson[0] ?? 'other') : v === 'lump_sum' ? (options.lumpSum[0] ?? 'other') : 0);
            }}
            options={[
              { value: 'none', label: t('events.commitNone') },
              ...(options.perPerson.length || options.open ? [{ value: 'per_person' as const, label: t('events.commitPerPerson') }] : []),
              ...(options.lumpSum.length || options.open ? [{ value: 'lump_sum' as const, label: t('events.commitLump') }] : []),
            ]}
          />
          {mode !== 'none' ? (
            <Card>
              <ChipGroup>
                {(mode === 'per_person' ? options.perPerson : options.lumpSum).map((c) => (
                  <Chip key={c} label={formatCents(c)} selected={unit === c} onPress={() => setUnit(c)} tone="brown" />
                ))}
                {options.open ? <Chip label={t('events.other')} selected={unit === 'other'} onPress={() => setUnit('other')} tone="brown" /> : null}
              </ChipGroup>
              {unit === 'other' ? <TextField label={t('events.yourAmount')} value={other} onChangeText={setOther} keyboardType="decimal-pad" placeholder="101" /> : null}
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="small" color="muted">
                  {mode === 'per_person' ? t('events.perPersonMath', { amount: formatCents(unitCents), n: count }) : t('events.lumpMath')}
                </Txt>
                <Txt variant="subhead" color="brown">
                  {formatCents(total)}
                </Txt>
              </Row>
              <Txt variant="meta" color="muted">
                {t('events.commitNote')}
              </Txt>
            </Card>
          ) : null}
        </VStack>
      ) : null}

      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={label} onPress={submit} busy={busy} disabled={count === 0 || (canCommit && mode !== 'none' && total <= 0)} tone="maroon" />
      {activeRsvp ? <LinkText label={t('events.viewTickets')} onPress={() => router.push({ pathname: '/event/[id]/tickets', params: { id: event.id } })} /> : null}
    </VStack>
  );
}
