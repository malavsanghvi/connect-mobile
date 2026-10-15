import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { FullScreen, FullScreenLoading } from '@/components/full-screen';
import { Qr } from '@/components/qr';
import { Banner, Button, Card, LinkText, Pill, Row, Txt, VStack } from '@/components/ui';
import { EventIcon } from '@/features/event-icons';
import { peopleLabel } from '@/features/events';
import type { StringKey } from '@/i18n';
import { cancelContactRsvp, viewContactRsvp, type LinkFailure, type RsvpPage, type TicketPerson, type ViewAnswer } from '@/lib/api/rsvp-manage';
import { report } from '@/lib/errors';
import { formatDate, formatTimeRange } from '@/lib/format';
import { isRsvpToken } from '@/lib/rsvp-link';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * The page behind the link in the confirmation email of an RSVP made without signing in (connect-crm docs/RSVP_WITHOUT_LOGIN.md section 2,
 * step 6): the event, the people (names partly hidden by the database), a QR per person, and "We can't make it". Outside the route guards,
 * and outside the community choice: the link alone is the key, so it works on a phone where the app was never set up. Opening it with the
 * emailed link marks the RSVP verified (the database does that).
 *
 * `visit` is the page opened from "See my tickets" right after saving: the database lets that visit look, not cancel (that is Undo, for 15
 * minutes), so the cancel button is not drawn and the page says where cancelling is.
 */

const INVALID: ViewAnswer = { ok: false, code: 'expired', message: '' };
const FAILURE_TEXT: Record<string, StringKey> = {
  expired: 'rsvpLink.err.expired',
  rate_limited: 'rsvpLink.err.rate_limited',
  closed: 'rsvpLink.err.closed',
  too_late: 'rsvpLink.err.too_late',
};

/** The sentence for a refusal, in the visitor's language; a code this app does not know says the database's own sentence. */
export function linkFailureText(t: (key: StringKey) => string, failure: LinkFailure): string {
  const key = FAILURE_TEXT[failure.code];
  if (key) return t(key);
  return failure.message || t('rsvpLink.err.unknown');
}

const STATUS_KEY: Record<string, StringKey> = {
  rsvpd: 'rsvpLink.statusRegistered',
  invited: 'rsvpLink.statusRegistered',
  confirmed: 'rsvpLink.statusConfirmed',
  attended: 'rsvpLink.statusAttended',
  cancelled: 'rsvpLink.statusCancelled',
};

/** The people whose places are still held (a cancelled person's ticket no longer works). */
export function placesHeld(people: TicketPerson[]): TicketPerson[] {
  return people.filter((p) => p.status !== 'cancelled' && p.ticket !== null);
}

export function RsvpLinkPage({ token, visit }: { token: string | null; visit: boolean }) {
  const t = useT();
  const router = useRouter();
  const valid = isRsvpToken(token);
  const state = useLoad(() => (valid ? viewContactRsvp(token) : Promise.resolve(INVALID)), [token], 'load your RSVP');
  const openApp = () => router.replace('/');

  if (state.data === undefined) {
    if (!state.error) return <FullScreenLoading label={t('rsvpLink.opening')} />;
    return (
      <FullScreen align="top">
        <Txt variant="title" color="navy" accessibilityRole="header">
          {t('rsvpLink.title')}
        </Txt>
        <Banner tone="error" message={state.error.userMessage} action={{ label: t('common.retry'), onPress: () => void state.reload() }} />
        <LinkText label={t('rsvpLink.openApp')} onPress={openApp} />
      </FullScreen>
    );
  }

  return (
    <FullScreen align="top">
      <Txt variant="title" color="navy" accessibilityRole="header">
        {t('rsvpLink.title')}
      </Txt>
      {state.error ? <Banner tone="error" message={state.error.userMessage} action={{ label: t('common.retry'), onPress: () => void state.reload() }} /> : null}
      {state.data.ok ? (
        <RsvpBody token={token as string} page={state.data} visit={visit} onChanged={() => void state.reload()} />
      ) : (
        <Banner
          tone={state.data.code === 'rate_limited' ? 'warning' : 'info'}
          message={linkFailureText(t, state.data)}
          action={state.data.code === 'rate_limited' ? { label: t('common.retry'), onPress: () => void state.reload() } : undefined}
        />
      )}
      <LinkText label={t('rsvpLink.openApp')} onPress={openApp} />
    </FullScreen>
  );
}

function RsvpBody({ token, page, visit, onChanged }: { token: string; page: RsvpPage; visit: boolean; onChanged: () => void }) {
  const t = useT();
  const { center } = useApp();
  const tz = center?.time_zone ?? null;
  const cancelled = page.status === 'cancelled';
  const held = placesHeld(page.people);
  const running = useRef(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [refused, setRefused] = useState<LinkFailure | null>(null);
  const when = [formatDate(page.event.startsAt, tz), formatTimeRange(page.event.startsAt, page.event.endsAt, tz)].filter(Boolean).join(' · ');

  const cancel = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFault(null);
    setRefused(null);
    try {
      const answer = await cancelContactRsvp(token);
      if (!answer.ok) setRefused(answer);
      setAsking(false);
      // Either way the page is read again: it now says what is true.
      onChanged();
    } catch (err) {
      setFault(report(err, 'cancel your RSVP').userMessage);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <VStack gap={14}>
      <View style={{ gap: 2 }}>
        <Txt variant="headline" accessibilityRole="header">
          {page.event.name}
        </Txt>
        {when ? (
          <Txt variant="small" color="ink2">
            {when}
          </Txt>
        ) : null}
        {page.event.venue ? (
          <Txt variant="small" color="ink2">
            {page.event.venue}
          </Txt>
        ) : null}
      </View>

      <Card tone={cancelled ? 'panel' : 'green'} style={{ gap: 4 }}>
        <Txt variant="section" color={cancelled ? 'ink' : 'greenDark'} style={{ fontFamily: fonts.bodyBold }}>
          {t(STATUS_KEY[page.status] ?? 'rsvpLink.statusRegistered')}
        </Txt>
        {cancelled ? (
          <Txt variant="small" color="ink2">
            {t('rsvpLink.cancelledBody')}
          </Txt>
        ) : null}
      </Card>

      {!cancelled && held.length > 0 ? (
        <VStack gap={space.sm}>
          <Txt variant="section" accessibilityRole="header">
            {t('events.whosComing')}
          </Txt>
          {held.map((p) => (
            <TicketRow key={p.slot} person={p} eventName={page.event.name} />
          ))}
          <Txt variant="meta" color="muted">
            {t('rsvpLink.hidden')}
          </Txt>
          <Txt variant="fine" color="muted" center>
            {t('tickets.entranceNote')}
          </Txt>
        </VStack>
      ) : null}

      {fault ? <Banner tone="error" message={fault} action={{ label: t('common.retry'), onPress: () => void cancel() }} /> : null}
      {refused ? <Banner tone="warning" message={linkFailureText(t, refused)} /> : null}

      {!cancelled && visit ? (
        <Txt variant="small" color="ink2">
          {t('rsvpLink.visitNote')}
        </Txt>
      ) : null}
      {!cancelled && !visit && page.canCancel ? (
        asking ? (
          <Card tone="panel">
            <Txt variant="smallStrong">{t('rsvpLink.cancelAsk', { people: peopleLabel(t, held.length) })}</Txt>
            <Button label={t('rsvpLink.cancelYes')} tone="secondary" size="md" onPress={() => void cancel()} busy={busy} />
            <Button label={t('rsvpLink.cancelKeep')} tone="ghost" size="md" onPress={() => setAsking(false)} disabled={busy} />
          </Card>
        ) : (
          <Button label={t('rsvpLink.cancel')} tone="secondary" size="md" onPress={() => setAsking(true)} />
        )
      ) : null}
      {!cancelled && !visit && !page.canCancel ? (
        <Txt variant="small" color="ink2">
          {t('rsvpLink.cancelNoMore')}
        </Txt>
      ) : null}
      {!cancelled ? (
        <Txt variant="meta" color="muted">
          {t('rsvpLink.changeNote')}
        </Txt>
      ) : null}
    </VStack>
  );
}

/** One person: the partly hidden name, and a tap for the QR to show at the entrance. */
function TicketRow({ person, eventName }: { person: TicketPerson; eventName: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen(!open)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? t('tickets.hideQr', { name: person.label }) : t('tickets.showQr', { name: person.label })}
      style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.md, opacity: pressed ? 0.9 : 1 })}>
      <Row gap={14}>
        <View style={{ width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
          <EventIcon name="ticket-qr" size={28} color={colors.white} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{person.label}</Txt>
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {t(person.kind === 'child' ? 'rsvpLink.child' : 'rsvpLink.adult')} · {t('tickets.ticketFor', { event: eventName })}
          </Txt>
        </View>
        {person.checkedIn ? <Pill label={t('tickets.checkedIn')} tone="green" /> : null}
      </Row>
      {open && person.ticket ? <Qr value={person.ticket} size={170} label={t('tickets.qrLabel', { name: person.label })} /> : null}
    </Pressable>
  );
}
