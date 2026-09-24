import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Qr } from '@/components/qr';
import { Band, Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, LinkText, Pill, Row, SectionTitle, Txt, VStack } from '@/components/ui';
import { bandFor } from '@/features/events';
import { findEventSurvey, getEvent, getHouseholdRsvp, getPledgeById, listAttendees, listLunchSlots, moveLunchSlot, rsvpState, type LunchSlot } from '@/lib/api/events';
import { report } from '@/lib/errors';
import { formatCents, formatDate, formatTime, formatTimeRange } from '@/lib/format';
import { lunchCard } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

/** Tickets: one QR per attendee, lunch times after check-in, commitment, confirm/cancel (prototype §2.4). */
export default function TicketsScreen() {
  const t = useT();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member, center } = useApp();
  const { payNotice } = useFeedback();
  const tz = center?.time_zone ?? null;
  const state = useLoad(
    async () => {
      const event = await getEvent(id);
      const rsvp = member?.household ? await getHouseholdRsvp(id, member.household.id) : null;
      const [attendees, slots, pledge, survey] = await Promise.all([
        rsvp ? listAttendees(rsvp.id) : Promise.resolve([]),
        event.lunch_enabled ? listLunchSlots(event.id) : Promise.resolve([]),
        rsvp?.commitment_pledge_id && member?.isAdult ? getPledgeById(rsvp.commitment_pledge_id) : Promise.resolve(null),
        member ? findEventSurvey(event.id) : Promise.resolve(null),
      ]);
      return { event, rsvp, attendees, slots, pledge, survey, now: new Date() };
    },
    [id, member?.household?.id],
    'load your tickets',
  );

  if (member && !member.isAdult) {
    // Prototype §1.5: tickets are managed by adults; children see "Ask a parent".
    return (
      <Screen title={t('tickets.title')}>
        <LockedState onBack={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen title={t('tickets.title')}>
      <Loaded state={state}>
        {({ event, rsvp, attendees, slots, pledge, survey, now }) => {
          const st = rsvpState(rsvp);
          const active = attendees.filter((a) => a.status !== 'cancelled' && !a.ticket_revoked);
          const lunch = lunchCard(
            active.map((a) => ({ name: a.display_name, checkedIn: !!a.checked_in_at, slotStartsAt: slots.find((s) => s.id === a.lunch_slot_id)?.starts_at ?? null })),
            slots,
            tz,
          );
          const firstCheckIn = active.map((a) => a.checked_in_at).filter((x): x is string => !!x).sort()[0] ?? null;
          return (
            <>
              <Band color={bandFor(event.id)} title={event.name} subtitle={`${formatDate(event.starts_at, tz)} · ${formatTimeRange(event.starts_at, event.ends_at, tz)}${event.venue ? ` · ${event.venue}` : ''}`} />
              {!rsvp || st === 'none' ? (
                <EmptyState icon="ticket-outline" title={t('tickets.none')} action={member?.isAdult ? { label: t('events.rsvp'), onPress: () => router.replace({ pathname: '/event/[id]', params: { id: event.id } }) } : undefined} />
              ) : st === 'cancelled' ? (
                <Card tone="panel">
                  <Txt variant="cardTitle">{t('tickets.cancelledTitle')}</Txt>
                  <Txt variant="small" color="ink2">
                    {t('tickets.cancelledBody')}
                  </Txt>
                  {member?.isAdult ? <Button label={t('tickets.rsvpAgain')} onPress={() => router.replace({ pathname: '/event/[id]', params: { id: event.id } })} size="md" /> : null}
                </Card>
              ) : (
                <>
                  <Banner
                    tone="success"
                    title={t('tickets.allSet')}
                    message={st === 'confirmed' || st === 'attended' ? t('tickets.confirmedLine', { n: active.length }) : t('tickets.pendingLine', { n: active.length, hours: event.confirmation_hours_before })}
                  />

                  {pledge ? (
                    <Card tone="amber">
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Txt variant="cardTitle" color="brownDark">
                          {t('tickets.committed', { amount: formatCents(pledge.amount_cents) })}
                        </Txt>
                        <Pill label={pledge.status === 'paid' ? t('pledges.paid') : t('pledges.open')} tone={pledge.status === 'paid' ? 'green' : 'amber'} />
                      </Row>
                      <Txt variant="meta" color="brownText">
                        {[pledge.pledge_number, pledge.status === 'paid' ? t('tickets.receiptEmailed') : t('tickets.openPledge')].filter(Boolean).join(' · ')}
                      </Txt>
                      {pledge.status !== 'paid' ? <Button label={t('give.payNow')} tone="brown" size="md" onPress={() => payNotice({ amountLabel: formatCents(pledge.amount_cents - pledge.paid_cents) })} /> : null}
                    </Card>
                  ) : null}

                  <SectionTitle>{t('tickets.yourTickets')}</SectionTitle>
                  {active.map((a) => (
                    <Card key={a.id}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <Txt variant="cardTitle">{a.display_name}</Txt>
                          <Txt variant="meta" color="muted">
                            {a.checked_in_at ? t('tickets.checkedInAt', { time: formatTime(a.checked_in_at, tz) }) : t('tickets.ticketFor', { event: event.name })}
                          </Txt>
                        </View>
                        {a.checked_in_at ? <Pill label={t('tickets.checkedIn')} tone="green" /> : null}
                      </Row>
                      {a.ticket_token ? (
                        <Qr value={a.ticket_token} size={170} label={t('tickets.qrLabel', { name: a.display_name })} />
                      ) : (
                        <Txt variant="meta" color="muted">
                          {t('tickets.issuing')}
                        </Txt>
                      )}
                    </Card>
                  ))}

                  {event.lunch_enabled ? (
                    <Card tone="green">
                      <Txt variant="headline" color="greenDark">
                        {t('lunch.title')}
                      </Txt>
                      <Txt variant="meta" color="greenDark">
                        {firstCheckIn ? t('lunch.checkedInAt', { time: formatTime(firstCheckIn, tz), date: formatDate(event.starts_at, tz) }) : event.lunch_starts_at ? t('lunch.startsAt', { date: formatDate(event.starts_at, tz), time: formatTime(event.lunch_starts_at, tz) }) : ''}
                      </Txt>
                      {lunch.state === 'ready' ? (
                        <VStack gap={space.sm}>
                          {lunch.groups.map((g) => (
                            <Row key={g.startsAt} align="flex-start" gap={space.md}>
                              <Txt variant="section" color="greenDark" style={{ width: 84 }}>
                                {g.time}
                              </Txt>
                              <View style={{ flex: 1 }}>
                                <Txt variant="bodyStrong" color="greenDark">
                                  {g.names.join(', ')}
                                </Txt>
                                <Txt variant="meta" color="greenDark">
                                  {g.isFirstSlot ? t('lunch.startsTag') : t('lunch.assignedTag')}
                                </Txt>
                                {member?.isAdult ? (
                                  <LunchMover
                                    attendeeIds={active.filter((a) => slots.find((sl) => sl.id === a.lunch_slot_id)?.starts_at === g.startsAt).map((a) => a.id)}
                                    currentStartsAt={g.startsAt}
                                    slots={slots}
                                    now={now}
                                    tz={tz}
                                  />
                                ) : null}
                              </View>
                            </Row>
                          ))}
                          <Txt variant="meta" color="greenDark">
                            {lunch.nowServing ? t('lunch.notifyServing', { slot: lunch.nowServing }) : t('lunch.notify')}
                          </Txt>
                        </VStack>
                      ) : lunch.state === 'assigning' ? (
                        <Txt variant="small" color="greenDark">
                          {t('lunch.assigning')}
                        </Txt>
                      ) : (
                        <Txt variant="small" color="greenDark">
                          {t('lunch.pending')}
                        </Txt>
                      )}
                    </Card>
                  ) : null}

                  {member ? (
                    <VStack gap={space.sm}>
                      {st === 'rsvpd' ? <Button label={t('tickets.confirmOrCancel')} onPress={() => router.push({ pathname: '/event/[id]/confirm', params: { id: event.id } })} /> : null}
                      <Button label={t('tickets.changeRsvp')} tone="secondary" onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })} />
                      <Button label={t('tickets.wallet')} tone="secondary" disabled onPress={() => {}} icon="wallet-outline" />
                    </VStack>
                  ) : null}
                </>
              )}
              {survey ? (
                <Card tone="purple" onPress={() => router.push({ pathname: '/survey/[id]', params: { id: survey.id } })} accessibilityLabel={t('home.shareFeedback')}>
                  <Txt variant="eyebrow" color="purple">
                    {t('home.feedbackRequested')}
                  </Txt>
                  <Txt variant="bodyStrong" color="purpleDark">
                    {survey.title}
                  </Txt>
                </Card>
              ) : null}
              <Txt variant="fine" color="muted" style={{ color: colors.muted }}>
                {t('tickets.walletNote')}
              </Txt>
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

/** "Missed it or staying for the program? Join a later slot" (app.move_lunch_slot). */
function LunchMover({ attendeeIds, currentStartsAt, slots, now, tz }: { attendeeIds: string[]; currentStartsAt: string; slots: LunchSlot[]; now: Date; tz: string | null }) {
  const t = useT();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const later = slots.filter(
    (sl) => new Date(sl.starts_at) > new Date(currentStartsAt) && new Date(sl.starts_at).getTime() > now.getTime() - 5 * 60000 && sl.status !== 'done' && sl.seats - sl.assigned >= attendeeIds.length,
  );
  if (attendeeIds.length === 0 || later.length === 0) return null;
  const move = async (slot: LunchSlot) => {
    setBusy(slot.id);
    setError(null);
    try {
      await moveLunchSlot(attendeeIds, slot.id);
      invalidate();
      toast(t('lunch.moved', { time: formatTime(slot.starts_at, tz) }));
      setOpen(false);
    } catch (err) {
      setError(report(err, 'change your lunch time').userMessage);
    } finally {
      setBusy(null);
    }
  };
  if (!open) return <LinkText label={t('lunch.later')} onPress={() => setOpen(true)} color="greenDark" />;
  return (
    <VStack gap={space.xs}>
      <Txt variant="meta" color="greenDark">
        {t('lunch.laterPrompt')}
      </Txt>
      <ChipGroup>
        {later.map((sl) => (
          <Chip key={sl.id} label={busy === sl.id ? t('common.saving') : formatTime(sl.starts_at, tz)} selected={false} disabled={busy !== null} onPress={() => move(sl)} />
        ))}
      </ChipGroup>
      {error ? <Banner tone="error" message={error} /> : null}
    </VStack>
  );
}
