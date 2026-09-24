import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Qr } from '@/components/qr';
import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, LinkText, Pill, Row, Txt, VStack } from '@/components/ui';
import { EventIcon } from '@/features/event-icons';
import { compactTime, lunchWhy } from '@/features/event-rules';
import { shareOnWhatsApp } from '@/features/media';
import { startPayment } from '@/features/pay';
import { findEventSurvey, getEvent, getHouseholdRsvp, getPledgeById, listAttendees, listLunchSlots, moveLunchSlot, rsvpState, type Attendee, type EventRow, type LunchSlot } from '@/lib/api/events';
import { logError, report } from '@/lib/errors';
import { formatCents, formatDate, formatTime, joinNames } from '@/lib/format';
import { lunchCard, type LunchGroup } from '@/lib/rules';
import { readPref, writePref } from '@/lib/storage';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

const MOVED_KEY = 'lunchMovedSlots';

/** Tickets (prototype L311–359): all-set card, commitment, compact ticket rows, lunch, share, change. */
export default function TicketsScreen() {
  const t = useT();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member, center } = useApp();
  const { payNotice } = useFeedback();
  const tz = center?.time_zone ?? null;
  const [shareError, setShareError] = useState<string | null>(null);
  const state = useLoad(
    async () => {
      const event = await getEvent(id);
      const rsvp = member?.household ? await getHouseholdRsvp(id, member.household.id) : null;
      const [attendees, slots, pledge, survey, moved] = await Promise.all([
        rsvp ? listAttendees(rsvp.id) : Promise.resolve([]),
        event.lunch_enabled ? listLunchSlots(event.id) : Promise.resolve([]),
        rsvp?.commitment_pledge_id && member?.isAdult ? getPledgeById(rsvp.commitment_pledge_id) : Promise.resolve(null),
        member ? findEventSurvey(event.id) : Promise.resolve(null),
        readPref<Record<string, string>>(MOVED_KEY, {}),
      ]);
      return { event, rsvp, attendees, slots, pledge, survey, movedSlotId: moved[event.id] ?? null, now: new Date() };
    },
    [id, member?.household?.id],
    'load your tickets',
  );

  if (member && !member.isAdult) {
    // Tickets are managed by adults; children see "Ask a parent".
    return (
      <Screen title={t('tickets.title')}>
        <LockedState onBack={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen title={t('tickets.title')}>
      <Loaded state={state}>
        {({ event, rsvp, attendees, slots, pledge, survey, movedSlotId, now }) => {
          const st = rsvpState(rsvp);
          const active = attendees.filter((a) => a.status !== 'cancelled' && !a.ticket_revoked);
          const n = active.length;
          const share = async () => {
            setShareError(null);
            try {
              await shareOnWhatsApp(
                t('tickets.shareText', {
                  event: event.name,
                  when: [formatDate(event.starts_at, tz), compactTime(event.starts_at, tz)].filter(Boolean).join(' · '),
                  venue: event.venue ? ` · ${event.venue}` : '',
                  names: joinNames(active.map((a) => a.display_name)),
                  center: center?.short_name || center?.name || '',
                }),
              );
            } catch (err) {
              setShareError(`${t('tickets.shareFailed')} ${report(err, 'share your tickets').userMessage}`);
            }
          };
          if (!rsvp || st === 'none') {
            return <EmptyState icon="ticket-outline" title={t('tickets.none')} action={member?.isAdult ? { label: t('events.rsvp'), onPress: () => router.replace({ pathname: '/event/[id]', params: { id: event.id } }) } : undefined} />;
          }
          if (st === 'cancelled') {
            return (
              <Card tone="panel">
                <Txt variant="cardTitle">{t('tickets.cancelledTitle')}</Txt>
                <Txt variant="small" color="ink2">
                  {t('tickets.cancelledBody')}
                </Txt>
                {member?.isAdult ? <Button label={t('tickets.rsvpAgain')} onPress={() => router.replace({ pathname: '/event/[id]', params: { id: event.id } })} size="md" /> : null}
              </Card>
            );
          }
          const how = pledge ? (rsvp.commitment_mode === 'per_person' && n > 0 && pledge.amount_cents % n === 0 ? t('tickets.perPersonHow', { amount: formatCents(pledge.amount_cents / n), n }) : rsvp.commitment_mode === 'lump_sum' ? t('tickets.lumpHow') : null) : null;
          return (
            <VStack gap={14}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.greenTint, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: radii.xxl, padding: space.lg }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt variant="subhead" color="white" style={{ fontFamily: fonts.bodyBold }}>
                    {'✓'}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="section" color="greenDark" accessibilityRole="header">
                    {t('tickets.allSet')}
                  </Txt>
                  <Txt variant="meta" color="greenDark2">
                    {`${n === 1 ? t('tickets.addedOne') : t('tickets.added', { n })} · ${st === 'confirmed' || st === 'attended' ? t('tickets.confirmedLine') : t('tickets.pendingLine', { hours: event.confirmation_hours_before })}`}
                  </Txt>
                </View>
              </View>

              {pledge ? (
                <Card tone="amber">
                  <Row gap={space.md}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong" color="brownDark">
                        {t('tickets.committed', { amount: formatCents(pledge.amount_cents) })}
                      </Txt>
                      <Txt variant="caption" color="brownText" style={{ fontFamily: fonts.body }}>
                        {[how, pledge.pledge_number, pledge.status === 'paid' ? t('tickets.receiptEmailed') : t('tickets.openPledge')].filter(Boolean).join(' · ')}
                      </Txt>
                    </View>
                    {pledge.status !== 'paid' ? (
                      <Button
                        label={t('give.payNow')}
                        tone="brown"
                        size="sm"
                        fill={false}
                        onPress={() =>
                          void startPayment(
                            { amountCents: pledge.amount_cents - pledge.paid_cents, forLabel: event.name, pledgeId: pledge.id, pledgeNumber: pledge.pledge_number, context: 'rsvp_later' },
                            { payNotice, formatAmount: (c) => formatCents(c) },
                          )
                        }
                      />
                    ) : (
                      <Pill label={t('pledges.paid')} tone="green" />
                    )}
                  </Row>
                </Card>
              ) : null}

              {active.map((a) => (
                <TicketRow key={a.id} a={a} event={event} tz={tz} />
              ))}

              {event.lunch_enabled ? <LunchPanel event={event} active={active} slots={slots} tz={tz} now={now} movedSlotId={movedSlotId} canMove={!!member?.isAdult} /> : null}

              <Button label={t('tickets.wallet')} tone="black" disabled onPress={() => {}} />
              <Button label={t('tickets.shareWhatsApp')} tone="outlineGreen" size="md" onPress={() => void share()} />
              {shareError ? <Banner tone="error" message={shareError} /> : null}
              {member && st === 'rsvpd' ? <Button label={t('tickets.confirmOrCancel')} tone="secondary" size="md" onPress={() => router.push({ pathname: '/event/[id]/confirm', params: { id: event.id } })} /> : null}
              {member ? (
                <View style={{ alignItems: 'center' }}>
                  <LinkText label={t('tickets.changeRsvp')} onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })} />
                </View>
              ) : null}
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
              <Txt variant="fine" color="muted" center>
                {t('tickets.walletNote')}
              </Txt>
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}

/** Compact ticket row (44px navy QR tile, name, "Ticket · {event}"); tap to show the real QR. */
function TicketRow({ a, event, tz }: { a: Attendee; event: EventRow; tz: string | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen(!open)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? t('tickets.hideQr', { name: a.display_name }) : t('tickets.showQr', { name: a.display_name })}
      style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.md, opacity: pressed ? 0.9 : 1 })}>
      <Row gap={14}>
        <View style={{ width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
          <EventIcon name="ticket-qr" size={28} color={colors.white} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{a.display_name}</Txt>
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {a.checked_in_at ? t('tickets.checkedInAt', { time: formatTime(a.checked_in_at, tz) }) : t('tickets.ticketFor', { event: event.name })}
          </Txt>
        </View>
        {a.checked_in_at ? <Pill label={t('tickets.checkedIn')} tone="green" /> : null}
      </Row>
      {open ? (
        a.ticket_token ? (
          <Qr value={a.ticket_token} size={170} label={t('tickets.qrLabel', { name: a.display_name })} />
        ) : (
          <Txt variant="meta" color="muted">
            {t('tickets.issuing')}
          </Txt>
        )
      ) : null}
    </Pressable>
  );
}

function whyText(t: ReturnType<typeof useT>, g: LunchGroup, attendees: Attendee[], checkedInTime: string | null, moved: boolean): { tag: string; why: string | null } {
  const members = attendees.map((a) => ({ name: a.display_name.split(' ')[0] ?? a.display_name, childUnder12: a.is_child_under_12, senior: a.is_senior }));
  const w = lunchWhy({ isFirstSlot: g.isFirstSlot, members, checkedInTime, movedByYou: moved });
  const tag = w.tag === 'starts' ? t('lunch.startsTag') : w.tag === 'moved' ? t('lunch.movedTag') : t('lunch.assignedTag');
  const why =
    w.why.kind === 'child'
      ? t('lunch.whyChild')
      : w.why.kind === 'seniors'
        ? w.why.names.map((name) => t('lunch.whySenior', { name })).join(' · ')
        : w.why.kind === 'arrival'
          ? t('lunch.whyArrival', { time: w.why.time ?? '' })
          : w.why.kind === 'moved'
            ? t('lunch.whyMoved')
            : null;
  return { tag, why };
}

/** Lunch after the program: pending note, slot rows with the "why" line, later slots inline (L331–352). */
function LunchPanel({ event, active, slots, tz, now, movedSlotId, canMove }: { event: EventRow; active: Attendee[]; slots: LunchSlot[]; tz: string | null; now: Date; movedSlotId: string | null; canMove: boolean }) {
  const t = useT();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [movedNow, setMoved] = useState<string | null>(null);
  const moved = movedNow ?? movedSlotId;

  const lunch = lunchCard(
    active.map((a) => ({ name: a.display_name, checkedIn: !!a.checked_in_at, slotStartsAt: slots.find((s) => s.id === a.lunch_slot_id)?.starts_at ?? null })),
    slots,
    tz,
  );
  const firstCheckIn = active.map((a) => a.checked_in_at).filter((x): x is string => !!x).sort()[0] ?? null;
  const checkedInTime = firstCheckIn ? formatTime(firstCheckIn, tz) : null;
  const firstSlot = [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;
  const head = firstCheckIn ? t('lunch.checkedInAt', { time: formatTime(firstCheckIn, tz), date: formatDate(event.starts_at, tz) }) : event.lunch_starts_at ? t('lunch.startsAt', { date: formatDate(event.starts_at, tz), time: formatTime(event.lunch_starts_at, tz) }) : formatDate(event.starts_at, tz);

  // The group that can move: everyone not already eating at the first slot (prototype "others").
  const groups = lunch.state === 'ready' ? lunch.groups : [];
  const movable = groups.filter((g) => !g.isFirstSlot);
  const moverGroup = movable[movable.length - 1] ?? null;
  const moverIds = moverGroup ? active.filter((a) => slots.find((sl) => sl.id === a.lunch_slot_id)?.starts_at === moverGroup.startsAt).map((a) => a.id) : [];
  const currentSlot = moverGroup ? (slots.find((sl) => sl.starts_at === moverGroup.startsAt) ?? null) : null;
  const later = currentSlot
    ? slots.filter((sl) => sl.id === currentSlot.id || (new Date(sl.starts_at) > new Date(currentSlot.starts_at) && new Date(sl.starts_at).getTime() > now.getTime() - 5 * 60000 && sl.status !== 'done' && sl.seats - sl.assigned >= moverIds.length))
    : [];

  const move = async (slot: LunchSlot) => {
    if (!currentSlot || slot.id === currentSlot.id) return;
    setBusy(slot.id);
    setError(null);
    try {
      await moveLunchSlot(moverIds, slot.id);
      setMoved(slot.id);
      try {
        const map = await readPref<Record<string, string>>(MOVED_KEY, {});
        await writePref(MOVED_KEY, { ...map, [event.id]: slot.id });
      } catch (err) {
        logError('remembering your lunch move on this device (the "You moved" tag may not show)', err);
      }
      invalidate();
      toast(t('lunch.moved', { time: formatTime(slot.starts_at, tz) }));
    } catch (err) {
      setError(report(err, 'change your lunch time').userMessage);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ borderWidth: 1, borderColor: colors.greenBorder, backgroundColor: colors.card, borderRadius: radii.xl, paddingVertical: 14, paddingHorizontal: space.lg, gap: 10 }}>
      <Row gap={10}>
        <View style={{ width: 40, height: 40, borderRadius: radii.lg, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' }}>
          <EventIcon name="lunch" size={22} color={colors.green} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong" style={{ fontFamily: fonts.bodyBold }}>
            {t('lunch.title')}
          </Txt>
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {head}
          </Txt>
        </View>
      </Row>
      {lunch.state === 'not_checked_in' ? (
        <View style={{ backgroundColor: colors.panel, borderRadius: radii.lg, paddingVertical: 10, paddingHorizontal: space.md }}>
          <Txt variant="meta" color="ink2">
            {firstSlot ? t('lunch.pending', { time: formatTime(firstSlot.starts_at, tz) }) : event.lunch_starts_at ? t('lunch.pending', { time: formatTime(event.lunch_starts_at, tz) }) : t('lunch.pendingNoTime')}
          </Txt>
        </View>
      ) : lunch.state === 'assigning' ? (
        <Txt variant="small" color="ink2">
          {t('lunch.assigning')}
        </Txt>
      ) : (
        <VStack gap={space.sm}>
          {lunch.groups.map((g) => {
            const inGroup = active.filter((a) => slots.find((sl) => sl.id === a.lunch_slot_id)?.starts_at === g.startsAt);
            const isMoved = !!moved && slots.find((sl) => sl.id === moved)?.starts_at === g.startsAt;
            const w = whyText(t, g, inGroup, checkedInTime, isMoved);
            return (
              <View key={g.startsAt} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, paddingVertical: 10, paddingHorizontal: space.md }}>
                <View style={{ minWidth: 72, alignItems: 'center' }}>
                  <Txt variant="subhead" color={g.isFirstSlot ? 'green' : 'navy'} style={{ fontFamily: fonts.bodyBold }}>
                    {g.time}
                  </Txt>
                  <Txt variant="fine" color="muted">
                    {w.tag}
                  </Txt>
                </View>
                <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: colors.divider, paddingLeft: space.md }}>
                  <Txt variant="smallStrong">{joinNames(inGroup.map((a) => a.display_name.split(' ')[0] ?? a.display_name))}</Txt>
                  {w.why ? (
                    <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                      {w.why}
                    </Txt>
                  ) : null}
                </View>
              </View>
            );
          })}
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {lunch.nowServing ? t('lunch.notifyServing', { slot: lunch.nowServing }) : t('lunch.notify')}
          </Txt>
          {canMove && currentSlot && later.length > 1 ? (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10, gap: space.xs }}>
              <Txt variant="meta" style={{ fontFamily: fonts.bodySemi }}>
                {t('lunch.later')}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                {later.map((sl) => {
                  const on = sl.id === currentSlot.id;
                  return (
                    <Pressable
                      key={sl.id}
                      onPress={() => void move(sl)}
                      disabled={busy !== null || on}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on, disabled: busy !== null }}
                      style={({ pressed }) => ({ minHeight: 38, borderRadius: radii.row, borderWidth: 1, borderColor: colors.green, backgroundColor: on ? colors.green : colors.card, paddingHorizontal: space.md, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                      <Txt variant="meta" color={on ? 'white' : 'green'} style={{ fontFamily: fonts.bodySemi }}>
                        {busy === sl.id ? t('common.saving') : formatTime(sl.starts_at, tz)}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
              {error ? <Banner tone="error" message={error} /> : null}
            </View>
          ) : null}
        </VStack>
      )}
    </View>
  );
}
