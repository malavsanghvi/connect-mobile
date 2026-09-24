import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { Band, Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Checkbox, Txt, VStack } from '@/components/ui';
import { bandFor } from '@/features/events';
import { cancelRsvp, confirmAttendance, getEvent, getHouseholdRsvp, listAttendees, type Attendee, type EventRow, type Rsvp } from '@/lib/api/events';
import { report } from '@/lib/errors';
import { formatDate, formatTime } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/** Confirm attendance or release seats (prototype §2.5). */
export default function ConfirmScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useApp();
  const state = useLoad(
    async () => {
      const event = await getEvent(id);
      const rsvp = member?.household ? await getHouseholdRsvp(id, member.household.id) : null;
      const attendees = rsvp ? (await listAttendees(rsvp.id)).filter((a) => a.status !== 'cancelled') : [];
      return { event, rsvp, attendees };
    },
    [id, member?.household?.id],
    'load your RSVP',
  );
  return (
    <Screen title={t('confirm.title')}>
      {member && !member.isAdult ? <LockedState /> : <Loaded state={state}>{(d) => <ConfirmBody {...d} />}</Loaded>}
    </Screen>
  );
}

function ConfirmBody({ event, rsvp, attendees }: { event: EventRow; rsvp: Rsvp | null; attendees: Attendee[] }) {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const { toast, confirm } = useFeedback();
  const { invalidate } = useDataVersion();
  const [keep, setKeep] = useState<string[]>(() => attendees.map((a) => a.id));
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tz = center?.time_zone ?? null;

  if (!rsvp || rsvp.status === 'cancelled' || attendees.length === 0) return <EmptyState icon="ticket-outline" title={t('tickets.none')} />;

  const doConfirm = async () => {
    setBusy('confirm');
    setError(null);
    try {
      await confirmAttendance(rsvp.id, keep, attendees.filter((a) => !keep.includes(a.id)).map((a) => a.id));
      invalidate();
      toast(t('events.confirmedToast', { n: keep.length }));
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

  return (
    <VStack gap={space.lg}>
      <Band color={bandFor(event.id)} title={event.name} subtitle={`${formatDate(event.starts_at, tz)} · ${formatTime(event.starts_at, tz)}${event.venue ? ` · ${event.venue}` : ''}`} />
      <Txt variant="body" color="ink2">
        {t('confirm.untick')}
      </Txt>
      <Card>
        {attendees.map((a) => (
          <Checkbox key={a.id} label={a.display_name} checked={keep.includes(a.id)} onChange={(v) => setKeep(v ? [...keep, a.id] : keep.filter((x) => x !== a.id))} disabled={!!a.checked_in_at} />
        ))}
      </Card>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={keep.length ? t('confirm.confirmN', { n: keep.length }) : t('events.selectWho')} onPress={doConfirm} disabled={keep.length === 0} busy={busy === 'confirm'} />
      <Button label={t('confirm.cantMakeIt')} tone="secondary" onPress={doCancel} busy={busy === 'cancel'} />
      <Txt variant="meta" color="muted">
        {rsvp.commitment_pledge_id ? `${t('confirm.nudgeNote')} ${t('confirm.pledgeStays')}` : t('confirm.nudgeNote')}
      </Txt>
    </VStack>
  );
}
