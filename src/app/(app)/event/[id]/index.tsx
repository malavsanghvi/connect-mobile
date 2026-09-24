import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { CenterMark } from '@/components/brand';
import { Screen } from '@/components/screen';
import { Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, IconButton, LinkText, Pill, Row, Segmented, TextField, Toggle, Txt, VStack } from '@/components/ui';
import { bandFor, peopleLabel, tierSingular } from '@/features/events';
import { roleLabel } from '@/features/labels';
import { startPayment } from '@/features/pay';
import { commitmentOptions, getEvent, getHouseholdRsvp, getPledgeById, listAttendees, rsvpBlockReason, submitRsvp, type Attendee, type EventRow, type GoingPerson, type Rsvp } from '@/lib/api/events';
import type { FamilyMember, Member } from '@/lib/api/member';
import type { Tables } from '@/lib/database.types';
import { report } from '@/lib/errors';
import { formatCents, formatDate, formatTimeRange, fullName, parseAmountToCents, zonedParts } from '@/lib/format';
import { ageOn, commitmentTotalCents, isSenior, isUnder12 } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

type Loaded_ = { event: EventRow; rsvp: Rsvp | null; attendees: Attendee[]; pledge: Tables<'pledges'> | null; now: Date };

type Sync = {
  title: string;
  steps: string[];
  at: number;
  result: string | null;
  error: string | null;
};

/** Event detail + RSVP (prototype L259–308) and the "Saving" screen (L901–926). */
export default function EventScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member, center } = useApp();
  const [sync, setSync] = useState<Sync | null>(null);
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
    <Screen title={sync ? t('sync.title') : t('events.rsvpTitle')}>
      {sync ? (
        <SyncView sync={sync} eventId={id} onBack={() => setSync(null)} />
      ) : (
        <Loaded state={state}>{(d) => <EventBody data={d} member={member} tz={center?.time_zone ?? null} onSync={setSync} />}</Loaded>
      )}
    </Screen>
  );
}

function EventBody({ data, member, tz, onSync }: { data: Loaded_; member: Member | null; tz: string | null; onSync: (s: Sync | ((prev: Sync | null) => Sync | null)) => void }) {
  const t = useT();
  const router = useRouter();
  const { setGuest } = useApp();
  const [dirError, setDirError] = useState<string | null>(null);
  const { event } = data;
  const openDirections = async () => {
    if (!event.venue) return;
    setDirError(null);
    try {
      await WebBrowser.openBrowserAsync(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue)}`);
    } catch (err) {
      setDirError(report(err, 'open directions').userMessage);
    }
  };
  const block = rsvpBlockReason(event, data.now);

  return (
    <VStack gap={14}>
      <View style={{ height: 120, borderRadius: radii.xxl, backgroundColor: bandFor(event.id), justifyContent: 'flex-end', padding: space.lg }}>
        <Txt variant="title" color="white" style={{ fontFamily: fonts.display }} accessibilityRole="header">
          {event.name}
        </Txt>
      </View>
      <View>
        <Txt variant="small" color="ink2">
          {[formatDate(event.starts_at, tz), formatTimeRange(event.starts_at, event.ends_at, tz)].filter(Boolean).join(' · ')}
        </Txt>
        {event.venue ? (
          <Txt variant="small" color="ink2">
            {`${event.venue} · `}
            <Txt variant="small" color="navy" style={{ textDecorationLine: 'underline' }} onPress={() => void openDirections()} accessibilityRole="link">
              {t('events.directions')}
            </Txt>
          </Txt>
        ) : null}
      </View>
      {dirError ? <Banner tone="error" message={dirError} /> : null}
      {event.description ? (
        <Txt variant="small" color="ink2">
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
        <RsvpForm data={data} member={member} tz={tz} onSync={onSync} />
      )}
    </VStack>
  );
}

type GoingState = Record<string, { going: boolean; assistance: boolean; note: string }>;
type Mode = 'none' | 'per_person' | 'lump_sum';

function memberTag(t: ReturnType<typeof useT>, m: FamilyMember, tier: string | null, today: string): string {
  const role = roleLabel(t, m.role);
  if (!m.isAdult) {
    const age = ageOn(m.person.date_of_birth, today);
    return m.role === 'child' && age != null ? t('events.childAge', { age }) : age != null ? `${role} · ${age}` : role;
  }
  return tier ? `${role} · ${tier}` : role;
}

/** Bordered row with a checkbox (prototype "Who's coming?" rows). */
function PersonRow({ label, sub, checked, onPress, disabled }: { label: string; sub?: string | null; checked: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      accessibilityState={{ checked, disabled: !!disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 52,
        paddingVertical: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: checked ? colors.navyBorder : colors.border,
        backgroundColor: checked ? colors.navyTint : colors.card,
        opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 24, height: 24, borderRadius: radii.xs, borderWidth: 2, borderColor: colors.navy, backgroundColor: checked ? colors.navy : colors.card, alignItems: 'center', justifyContent: 'center' }}>
        {checked ? (
          <Txt variant="smallStrong" color="white" style={{ fontFamily: fonts.bodyBold }}>
            {'✓'}
          </Txt>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="body" style={{ fontFamily: fonts.bodyMedium }}>
          {label}
        </Txt>
        {sub ? (
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {sub}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

function DashedTile({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: !!active }}
      style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: radii.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: active ? colors.navy : colors.dashed, backgroundColor: active ? colors.navyTint : 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm, opacity: pressed ? 0.8 : 1 })}>
      <Txt variant="small" color="navy">
        {label}
      </Txt>
    </Pressable>
  );
}

function AmountTile({ label, selected, onPress, border = colors.brown, tint = colors.brownTint }: { label: string; selected: boolean; onPress: () => void; border?: string; tint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: radii.lg, borderWidth: 2, borderColor: selected ? border : colors.border, backgroundColor: selected ? tint : colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xs, opacity: pressed ? 0.85 : 1 })}>
      <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
        {label}
      </Txt>
    </Pressable>
  );
}

function RsvpForm({ data, member, tz, onSync }: { data: Loaded_; member: Member; tz: string | null; onSync: (s: Sync | ((prev: Sync | null) => Sync | null)) => void }) {
  const t = useT();
  const { center } = useApp();
  const { payNotice } = useFeedback();
  const { invalidate } = useDataVersion();
  const { event, rsvp, attendees, pledge } = data;
  const activeRsvp = rsvp && rsvp.status !== 'cancelled' ? rsvp : null;
  const eventDate = event.starts_at ? zonedParts(new Date(event.starts_at), tz).iso : member.today;
  const flags = Array.isArray(event.attendee_flags) ? (event.attendee_flags as string[]) : [];
  const allowGuests = event.audience === 'members_and_guests' || event.audience === 'public';
  const options = commitmentOptions(event);
  const hasCommitmentOptions = options.perPerson.length > 0 || options.lumpSum.length > 0 || options.open;
  const canCommit = hasCommitmentOptions && !pledge;
  const tier = member.membership && member.membership.status === 'active' ? tierSingular(t, member.membership.tier) : null;

  // Prototype default: Per person with the middle amount, on a first RSVP only.
  const defaultMode: Mode = canCommit && !activeRsvp && options.perPerson.length ? 'per_person' : 'none';
  const [going, setGoing] = useState<GoingState>(() => {
    const init: GoingState = {};
    for (const m of member.members) {
      const a = attendees.find((x) => x.person_id === m.person.id);
      init[m.person.id] = { going: activeRsvp ? !!a && a.status !== 'cancelled' : true, assistance: a?.needs_assistance ?? false, note: a?.assistance_note ?? '' };
    }
    return init;
  });
  const [guests, setGuests] = useState<string[]>(() => (activeRsvp ? attendees.filter((a) => !a.person_id && a.status !== 'cancelled').map((a) => a.display_name) : []));
  const [guestOpen, setGuestOpen] = useState(false);
  const [assistOpen, setAssistOpen] = useState(() => Object.values(going).some((g) => g.assistance));
  const [guestDraft, setGuestDraft] = useState('');
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [unit, setUnit] = useState<number | 'other'>(defaultMode === 'per_person' ? (options.perPerson[1] ?? options.perPerson[0] ?? 0) : 0);
  const [other, setOther] = useState('');
  const [payNow, setPayNow] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedMembers = member.members.filter((m) => going[m.person.id]?.going);
  const count = selectedMembers.length + guests.length;
  const unitCents = unit === 'other' ? (parseAmountToCents(other) ?? 0) : unit;
  const total = canCommit ? commitmentTotalCents(mode, unitCents, count) : 0;
  const committing = canCommit && mode !== 'none' && total > 0;
  const community = center?.short_name || center?.name || '';
  const family = member.household?.display_name ?? '';

  const submit = async () => {
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
    const people = peopleLabel(t, count);
    const steps = [
      t('sync.stepFind', { family, center: community }),
      t('sync.stepRegister', { people, event: event.name }),
      ...(committing ? [t('sync.stepPledge', { amount: formatCents(total), family })] : []),
      t('sync.stepTickets'),
    ];
    // The family is already known from sign-in, so step 1 is done as soon as saving starts.
    onSync({ title: committing ? t('sync.rsvpPledgeTitle') : t('sync.rsvpTitle'), steps, at: 1, result: null, error: null });
    try {
      const res = await submitRsvp({
        event,
        member,
        existing: rsvp,
        going: list,
        commitment: { mode: committing ? mode : 'none', totalCents: committing ? total : 0 },
        onStep: (s) => onSync((prev) => (prev ? { ...prev, at: s === 'registered' ? 2 : 3 } : prev)),
      });
      invalidate();
      const result = res.pledgeNumber ? `${t('sync.resultRsvp', { people })} ${t('sync.resultPledge', { pledge: res.pledgeNumber, amount: formatCents(total) })}` : t('sync.resultRsvp', { people });
      onSync((prev) => (prev ? { ...prev, at: prev.steps.length, result } : prev));
      if (committing && payNow && res.pledgeId) {
        await startPayment({ amountCents: total, forLabel: event.name, pledgeId: res.pledgeId, pledgeNumber: res.pledgeNumber, context: 'rsvp' }, { payNotice, formatAmount: (c) => formatCents(c) });
      }
    } catch (err) {
      const message = report(err, 'save your RSVP').userMessage;
      onSync((prev) => (prev ? { ...prev, error: message } : prev));
    }
  };

  const label = count === 0 ? t('events.selectWho') : `${activeRsvp ? t('events.updateRsvp', { people: peopleLabel(t, count) }) : t('events.rsvpN', { people: peopleLabel(t, count) })}${committing ? ` · ${t('events.commit', { amount: formatCents(total) })}` : ''}`;
  const amounts = mode === 'per_person' ? options.perPerson : mode === 'lump_sum' ? options.lumpSum : [];
  const showOther = mode !== 'none' && (options.open || amounts.length === 0);

  return (
    <VStack gap={14}>
      <Card hero style={{ gap: 10 }}>
        <Txt variant="section">{t('events.whosComing')}</Txt>
        {member.members.map((m) => {
          const g = going[m.person.id] ?? { going: false, assistance: false, note: '' };
          return (
            <View key={m.person.id} style={{ gap: space.xs }}>
              <PersonRow label={fullName(m.person)} sub={memberTag(t, m, tier, member.today)} checked={g.going} onPress={() => setGoing({ ...going, [m.person.id]: { ...g, going: !g.going } })} />
              {assistOpen && g.going ? (
                <View style={{ paddingLeft: space.md, gap: space.xs }}>
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
        {allowGuests || flags.includes('assistance') ? (
          <Row gap={space.sm}>
            {allowGuests ? <DashedTile label={t('events.addGuestTile')} onPress={() => setGuestOpen(!guestOpen)} active={guestOpen} /> : null}
            {flags.includes('assistance') ? <DashedTile label={t('events.seniorAssistance')} onPress={() => setAssistOpen(!assistOpen)} active={assistOpen} /> : null}
          </Row>
        ) : null}
        {allowGuests && guestOpen ? (
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
        <Card hero style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }} align="baseline">
            <Txt variant="section">{t('events.commitTitle')}</Txt>
            <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
              {t('events.optional')}
            </Txt>
          </Row>
          <Segmented
            label={t('events.commitTitle')}
            value={mode}
            onChange={(v) => {
              setMode(v);
              setUnit(v === 'per_person' ? (options.perPerson[1] ?? options.perPerson[0] ?? 'other') : v === 'lump_sum' ? (options.lumpSum[1] ?? options.lumpSum[0] ?? 'other') : 0);
            }}
            options={[
              { value: 'none', label: t('events.commitNone') },
              ...(options.perPerson.length || options.open ? [{ value: 'per_person' as const, label: t('events.commitPerPerson') }] : []),
              ...(options.lumpSum.length || options.open ? [{ value: 'lump_sum' as const, label: t('events.commitLump') }] : []),
            ]}
          />
          {mode !== 'none' ? (
            <VStack gap={10}>
              <Row gap={space.xs}>
                {amounts.map((c) => (
                  <AmountTile key={c} label={formatCents(c)} selected={unit === c} onPress={() => setUnit(c)} />
                ))}
                {showOther ? <AmountTile label={t('events.other')} selected={unit === 'other'} onPress={() => setUnit('other')} /> : null}
              </Row>
              {unit === 'other' ? (
                <View style={{ gap: space.xs }}>
                  <Txt variant="meta" color="muted">
                    {t('events.familyAmount')}
                  </Txt>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 50, borderWidth: 2, borderColor: colors.brown, borderRadius: radii.lg, backgroundColor: colors.card, paddingHorizontal: space.md }}>
                    <Txt variant="subhead" color="brown" style={{ fontFamily: fonts.bodyBold }}>
                      $
                    </Txt>
                    <TextInput
                      value={other}
                      onChangeText={setOther}
                      keyboardType="decimal-pad"
                      accessibilityLabel={t('events.familyAmount')}
                      placeholder="101"
                      placeholderTextColor={colors.faint}
                      style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 18, color: colors.ink, paddingVertical: space.sm }}
                    />
                  </View>
                </View>
              ) : null}
              <Row style={{ justifyContent: 'space-between', backgroundColor: colors.brownTint, borderRadius: radii.lg, paddingVertical: 10, paddingHorizontal: space.md }}>
                <Txt variant="meta" color="brownText">
                  {mode === 'per_person' ? t('events.perPersonMath', { amount: formatCents(unitCents), people: peopleLabel(t, count) }) : t('events.lumpMath')}
                </Txt>
                <Txt variant="subhead" color="brown" style={{ fontFamily: fonts.bodyBold }}>
                  {formatCents(total)}
                </Txt>
              </Row>
              <Row gap={space.xs}>
                <AmountTile label={t('events.payNow')} selected={payNow} onPress={() => setPayNow(true)} border={colors.navy} tint={colors.navyTint} />
                <AmountTile label={t('events.addAsPledge')} selected={!payNow} onPress={() => setPayNow(false)} border={colors.navy} tint={colors.navyTint} />
              </Row>
              <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                {payNow ? t('events.payNowNote') : t('events.commitNote')}
              </Txt>
            </VStack>
          ) : null}
        </Card>
      ) : null}

      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={label} onPress={() => void submit()} disabled={count === 0 || (canCommit && mode !== 'none' && total <= 0)} />
      {activeRsvp ? <ViewTicketsLink eventId={event.id} /> : null}
    </VStack>
  );
}

function ViewTicketsLink({ eventId }: { eventId: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <View style={{ alignItems: 'center' }}>
      <LinkText label={t('events.viewTickets')} onPress={() => router.push({ pathname: '/event/[id]/tickets', params: { id: eventId } })} />
    </View>
  );
}

/** "Saving" screen: mark, step list with ✓ / … / pending, green result box, "See your tickets". */
function SyncView({ sync, eventId, onBack }: { sync: Sync; eventId: string; onBack: () => void }) {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const finished = !sync.error && sync.at >= sync.steps.length && !!sync.result;
  return (
    <VStack gap={space.lg} style={{ paddingTop: space.md }}>
      <Row gap={space.md}>
        <CenterMark size={48} />
        <View style={{ flex: 1 }}>
          <Txt variant="title" style={{ fontFamily: fonts.displayBold, color: colors.ink }} accessibilityRole="header">
            {sync.title}
          </Txt>
          <Txt variant="meta" color="muted">
            {t('sync.keepOpen')}
          </Txt>
        </View>
      </Row>
      <Card style={{ paddingVertical: space.sm, gap: 0 }}>
        {sync.steps.map((label, i) => {
          const done = i < sync.at;
          const current = i === sync.at && !sync.error;
          const failed = i === sync.at && !!sync.error;
          return (
            <Row key={label} gap={space.md} style={{ minHeight: 48, borderBottomWidth: i < sync.steps.length - 1 ? 1 : 0, borderBottomColor: colors.dividerLight }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: done ? colors.green : failed ? colors.danger : current ? colors.saffron : colors.borderInput, alignItems: 'center', justifyContent: 'center' }}>
                <Txt variant="smallStrong" color="white" style={{ fontFamily: fonts.bodyBold }}>
                  {done ? '✓' : failed ? '!' : current ? '…' : ''}
                </Txt>
              </View>
              <Txt variant="body" color={i <= sync.at ? 'ink' : 'faint'} style={{ flex: 1, fontFamily: current ? fonts.bodySemi : fonts.body }}>
                {label}
              </Txt>
            </Row>
          );
        })}
      </Card>
      {sync.error ? (
        <VStack gap={space.md}>
          <Banner tone="error" title={t('sync.failed')} message={sync.error} />
          <Button label={t('sync.backToRsvp')} tone="secondary" onPress={onBack} />
        </VStack>
      ) : null}
      {finished ? (
        <VStack gap={space.md}>
          <Card tone="green" style={{ gap: 4 }}>
            <Txt variant="section" color="greenDark" style={{ fontFamily: fonts.bodyBold }}>
              {t('sync.savedTo', { center: center?.short_name || center?.name || '' })}
            </Txt>
            <Txt variant="meta" color="greenDark2">
              {sync.result}
            </Txt>
          </Card>
          <Button label={t('sync.seeTickets')} onPress={() => router.replace({ pathname: '/event/[id]/tickets', params: { id: eventId } })} />
        </VStack>
      ) : null}
    </VStack>
  );
}

