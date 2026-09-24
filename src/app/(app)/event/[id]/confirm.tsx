import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Txt, VStack } from '@/components/ui';
import { bandFor, peopleLabel } from '@/features/events';
import { compactTime, confirmSchedule, relativeDay } from '@/features/event-rules';
import { addHouseholdAttendees, cancelRsvp, confirmAttendance, getEvent, getHouseholdRsvp, listAttendees, type Attendee, type EventRow, type Rsvp } from '@/lib/api/events';
import type { Member } from '@/lib/api/member';
import { report } from '@/lib/errors';
import { formatDate, fullName, todayAt, zonedParts } from '@/lib/format';
import { isSenior, isUnder12 } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/** Confirm attendance or release seats (prototype L750–768). */
export default function ConfirmScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useApp();
  const state = useLoad(
    async () => {
      const event = await getEvent(id);
      const rsvp = member?.household ? await getHouseholdRsvp(id, member.household.id) : null;
      const attendees = rsvp ? await listAttendees(rsvp.id) : [];
      return { event, rsvp, attendees };
    },
    [id, member?.household?.id],
    'load your RSVP',
  );
  return <Screen title={t('confirm.title')}>{member && !member.isAdult ? <LockedState /> : <Loaded state={state}>{(d) => (member ? <ConfirmBody {...d} member={member} /> : null)}</Loaded>}</Screen>;
}

/** One row per household member (anyone can be re-ticked) plus guests already on the RSVP. */
type RowItem = { key: string; name: string; attendee: Attendee | null; personId: string | null; locked: boolean };

function ConfirmBody({ event, rsvp, attendees, member }: { event: EventRow; rsvp: Rsvp | null; attendees: Attendee[]; member: Member }) {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const { toast, confirm } = useFeedback();
  const { invalidate } = useDataVersion();
  const tz = center?.time_zone ?? null;
  const isActive = (a: Attendee) => a.status !== 'cancelled' && !a.ticket_revoked;

  const rows: RowItem[] = [
    ...member.members.map((m) => {
      const a = attendees.find((x) => x.person_id === m.person.id) ?? null;
      return { key: m.person.id, name: a?.display_name ?? fullName(m.person), attendee: a, personId: m.person.id, locked: !!a?.checked_in_at };
    }),
    ...attendees.filter((a) => !a.person_id && isActive(a)).map((a) => ({ key: a.id, name: a.display_name, attendee: a, personId: null, locked: !!a.checked_in_at })),
  ];
  const [keep, setKeep] = useState<string[]>(() => rows.filter((r) => r.attendee && isActive(r.attendee)).map((r) => r.key));
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!rsvp || rsvp.status === 'cancelled' || !attendees.some(isActive)) return <EmptyState icon="ticket-outline" title={t('tickets.none')} />;

  const eventIso = event.starts_at ? zonedParts(new Date(event.starts_at), tz).iso : null;
  const rel = relativeDay(eventIso, todayAt(tz));
  const schedule = event.starts_at ? confirmSchedule(event.starts_at, tz, event.confirmation_hours_before) : null;
  const heroLine = [rel === 'tomorrow' ? t('confirm.tomorrow') : rel === 'today' ? t('confirm.today') : null, formatDate(event.starts_at, tz), compactTime(event.starts_at, tz), event.venue].filter(Boolean).join(' · ');
  const eventDate = eventIso ?? member.today;

  const doConfirm = async () => {
    setBusy('confirm');
    setError(null);
    try {
      const chosen = rows.filter((r) => keep.includes(r.key));
      const toAdd = chosen.filter((r) => !r.attendee && r.personId);
      const added = await addHouseholdAttendees(
        event,
        rsvp.id,
        toAdd.map((r) => {
          const p = member.members.find((m) => m.person.id === r.personId)?.person;
          return { personId: r.personId, name: r.name, childUnder12: isUnder12(p?.date_of_birth, eventDate), senior: isSenior(p?.date_of_birth, eventDate) };
        }),
      );
      const keepIds = [...chosen.filter((r) => r.attendee).map((r) => (r.attendee as Attendee).id), ...added];
      const dropIds = rows.filter((r) => r.attendee && isActive(r.attendee) && !keep.includes(r.key)).map((r) => (r.attendee as Attendee).id);
      await confirmAttendance(rsvp.id, keepIds, dropIds);
      invalidate();
      toast(t('notif.confirmedToast', { people: peopleLabel(t, keepIds.length) }));
      router.replace({ pathname: '/event/[id]/tickets', params: { id: event.id } });
    } catch (err) {
      setError(report(err, 'confirm your attendance').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const doCancel = async () => {
    const ok = await confirm({ title: t('confirm.cancelTitle'), body: t('confirm.cancelBody'), confirmLabel: t('confirm.cancelCta'), tone: 'danger', cancelLabel: t('confirm.keep') });
    if (!ok) return;
    setBusy('cancel');
    setError(null);
    try {
      await cancelRsvp(rsvp.id);
      invalidate();
      toast(t('confirm.cancelledToast'));
      router.replace('/');
    } catch (err) {
      setError(report(err, 'cancel your RSVP').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const footer = schedule ? t('confirm.nudgeNoteAt', { time: schedule.nudgeAt }) : t('confirm.nudgeNote');

  return (
    <VStack gap={14}>
      <View style={{ borderRadius: radii.xxl, backgroundColor: bandFor(event.id), padding: 18, gap: 4 }}>
        <Txt variant="title" color="white" style={{ fontFamily: fonts.display }} accessibilityRole="header">
          {event.name}
        </Txt>
        <Txt variant="meta" color="onMaroon">
          {heroLine}
        </Txt>
      </View>
      <Txt variant="small" color="ink2">
        {schedule && rel ? t('confirm.untickReplyBy', { when: schedule.replyBy }) : t('confirm.untick')}
      </Txt>
      <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xxl, padding: 14, gap: space.sm }}>
        {rows.map((r) => {
          const checked = keep.includes(r.key);
          return (
            <Pressable
              key={r.key}
              onPress={() => setKeep(checked ? keep.filter((x) => x !== r.key) : [...keep, r.key])}
              disabled={r.locked}
              accessibilityRole="checkbox"
              accessibilityLabel={r.locked ? `${r.name}. ${t('confirm.checkedInLocked')}` : r.name}
              accessibilityState={{ checked, disabled: r.locked }}
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
                opacity: r.locked ? 0.6 : pressed ? 0.85 : 1,
              })}>
              <View style={{ width: 24, height: 24, borderRadius: radii.xs, borderWidth: 2, borderColor: colors.navy, backgroundColor: checked ? colors.navy : colors.card, alignItems: 'center', justifyContent: 'center' }}>
                {checked ? (
                  <Txt variant="smallStrong" color="white" style={{ fontFamily: fonts.bodyBold }}>
                    {'✓'}
                  </Txt>
                ) : null}
              </View>
              <Txt variant="body" style={{ flex: 1, fontFamily: fonts.bodyMedium }}>
                {r.name}
              </Txt>
              {r.locked ? (
                <Txt variant="caption" color="green">
                  {t('confirm.checkedInLocked')}
                </Txt>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={keep.length ? t('confirm.confirmN', { people: peopleLabel(t, keep.length) }) : t('events.selectWho')} tone="green" onPress={doConfirm} disabled={keep.length === 0 || busy === 'cancel'} busy={busy === 'confirm'} />
      <Button label={t('confirm.cantMakeIt')} tone="outlineDanger" size="md" onPress={doCancel} busy={busy === 'cancel'} disabled={busy === 'confirm'} />
      <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
        {rsvp.commitment_pledge_id ? `${footer} ${t('confirm.pledgeStays')}` : footer}
      </Txt>
    </VStack>
  );
}
