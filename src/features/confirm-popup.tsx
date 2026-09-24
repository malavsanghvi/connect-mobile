import * as Notifications from 'expo-notifications';
import { usePathname, useRouter, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

import { StrokeIcon } from '@/components/stroke-icon';
import { Banner, Button, Txt } from '@/components/ui';
import { confirmAttendance, findEventSurvey, getEvent, getHouseholdRsvp, listAttendees, type Attendee, type EventRow, type Rsvp } from '@/lib/api/events';
import type { Member } from '@/lib/api/member';
import { logError, report } from '@/lib/errors';
import { formatDate, todayAt, zonedParts } from '@/lib/format';
import { readPref, writePref } from '@/lib/storage';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import {
  ACTION_CONFIRM_CHANGE,
  ACTION_CONFIRM_YES,
  CATEGORY_RSVP_CONFIRM,
  compactTime,
  CONFIRM_POPUP_SNOOZE_MS,
  popupDue,
  relativeDay,
  routeForNotification,
  type NotificationRoute,
} from './event-rules';
import { peopleLabel } from './events';

type PopupData = { event: EventRow; rsvp: Rsvp; attendees: Attendee[]; tz: string | null };

type ConfirmPopupValue = {
  /** Show the "TOMORROW · PLEASE CONFIRM" pop-up. `auto` respects "Remind me later". */
  showConfirm: (eventId: string, opts?: { auto?: boolean }) => Promise<void>;
};

const ConfirmPopupContext = createContext<ConfirmPopupValue>({ showConfirm: async () => {} });

const SNOOZE_KEY = 'confirmPopupSnooze';

async function loadPopup(eventId: string, member: Member, tz: string | null): Promise<PopupData | null> {
  if (!member.household) return null;
  const event = await getEvent(eventId);
  const rsvp = await getHouseholdRsvp(eventId, member.household.id);
  if (!rsvp || rsvp.status === 'cancelled') return null;
  const attendees = (await listAttendees(rsvp.id)).filter((a) => a.status !== 'cancelled' && !a.ticket_revoked);
  if (attendees.length === 0) return null;
  return { event, rsvp, attendees, tz };
}

/**
 * The in-app 24-hour confirmation pop-up (Main.dc.html L1531–1553) and the
 * notification tap router (L1445–1529): taps on the RSVP reminder open the
 * pop-up, its "Yes, we're coming" / "Change or cancel" action buttons act
 * directly, and lunch, feedback and special-day pushes open their screens.
 */
export function ConfirmPopupProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [popup, setPopup] = useState<PopupData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberRef = useRef<Member | null>(null);
  const tzRef = useRef<string | null>(null);
  const pending = useRef<NotificationRoute[]>([]);
  const handled = useRef(new Set<string>());
  // An automatic pop-up (opened by Home 24 hours before an event) belongs to Home:
  // leaving Home closes it without snoozing, so it never sits over another screen,
  // including that event's own confirm screen. Pop-ups the member asked for (a
  // notification tap, a button) stay open wherever they are.
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const autoOpen = useRef(false);
  useEffect(() => {
    if (autoOpen.current && pathname !== '/') {
      autoOpen.current = false;
      setPopup(null);
      setError(null);
    }
  }, [pathname]);

  const showConfirm = useCallback(
    async (eventId: string, opts?: { auto?: boolean }) => {
      const m = memberRef.current;
      if (!m?.isAdult) return;
      try {
        if (opts?.auto) {
          const snooze = await readPref<Record<string, number>>(SNOOZE_KEY, {});
          if (!popupDue(snooze[eventId], Date.now())) return;
        }
        const data = await loadPopup(eventId, m, tzRef.current);
        if (!data) {
          if (!opts?.auto) toast(t('notif.noRsvp'), 'info');
          return;
        }
        // Loading takes a moment: if the member has left Home meanwhile, an automatic pop-up stays closed.
        if (opts?.auto && pathRef.current !== '/') return;
        setError(null);
        autoOpen.current = Boolean(opts?.auto);
        setPopup(data);
      } catch (err) {
        const e = report(err, 'open your RSVP reminder');
        if (!opts?.auto) toast(e.userMessage, 'error');
      }
    },
    [t, toast],
  );

  const quickConfirm = useCallback(
    async (eventId: string) => {
      const m = memberRef.current;
      if (!m?.isAdult) return;
      let data: PopupData | null = null;
      try {
        data = await loadPopup(eventId, m, tzRef.current);
        if (!data) return toast(t('notif.noRsvp'), 'info');
        await confirmAttendance(data.rsvp.id, data.attendees.map((a) => a.id), []);
        invalidate();
        toast(t('notif.confirmedToast', { people: peopleLabel(t, data.attendees.length) }));
      } catch (err) {
        const e = report(err, 'confirm your attendance');
        if (data) {
          // Keep the member one tap from retrying: show the pop-up with the reason.
          setPopup(data);
          setError(e.userMessage);
        } else {
          toast(e.userMessage, 'error');
        }
      }
    },
    [invalidate, t, toast],
  );

  const route = useCallback(
    async (r: NotificationRoute) => {
      if (!r) return;
      switch (r.kind) {
        case 'confirm_popup':
          router.navigate('/');
          await showConfirm(r.eventId);
          return;
        case 'confirm_yes':
          await quickConfirm(r.eventId);
          return;
        case 'confirm_screen':
          router.push({ pathname: '/event/[id]/confirm', params: { id: r.eventId } });
          return;
        case 'tickets':
          router.push({ pathname: '/event/[id]/tickets', params: { id: r.eventId } });
          return;
        case 'event':
          router.push({ pathname: '/event/[id]', params: { id: r.eventId } });
          return;
        case 'survey':
          router.push({ pathname: '/survey/[id]', params: { id: r.surveyId } });
          return;
        case 'event_feedback':
          try {
            const survey = await findEventSurvey(r.eventId);
            if (survey) router.push({ pathname: '/survey/[id]', params: { id: survey.id } });
            else toast(t('notif.surveyNotFound'), 'info');
          } catch (err) {
            toast(report(err, 'open the feedback survey').userMessage, 'error');
          }
          return;
        case 'labh':
          // The Birthday labh screen is built by the Family stream at /labh/[dayId].
          router.push(`/labh/${encodeURIComponent(r.dayId)}` as Href);
          return;
        case 'special_days':
          router.push('/special-days');
          return;
        case 'url':
          router.push(r.path as Href);
          return;
      }
    },
    [quickConfirm, router, showConfirm, t, toast],
  );

  // Keep the latest member for notification callbacks; flush taps that arrived before sign-in finished.
  useEffect(() => {
    memberRef.current = member;
    tzRef.current = center?.time_zone ?? null;
    if (!member || pending.current.length === 0) return;
    const queued = pending.current;
    pending.current = [];
    (async () => {
      for (const r of queued) await route(r);
    })().catch((err: unknown) => logError('opening a notification after sign-in', err));
  }, [member, center?.time_zone, route]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.setNotificationCategoryAsync(CATEGORY_RSVP_CONFIRM, [
      { identifier: ACTION_CONFIRM_YES, buttonTitle: t('notif.categoryYes'), options: { opensAppToForeground: true } },
      { identifier: ACTION_CONFIRM_CHANGE, buttonTitle: t('notif.categoryChange'), options: { opensAppToForeground: true } },
    ]).catch((err: unknown) => logError('registering the RSVP reminder buttons (Yes / Change)', err));

    const handle = (resp: Notifications.NotificationResponse) => {
      const key = `${resp.notification.request.identifier}:${resp.actionIdentifier}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      const actionId = resp.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? null : resp.actionIdentifier;
      const r = routeForNotification(resp.notification.request.content.data, actionId);
      Notifications.clearLastNotificationResponseAsync().catch((err: unknown) => logError('clearing the handled notification', err));
      if (!r) return;
      if (!memberRef.current) {
        pending.current.push(r);
        return;
      }
      route(r).catch((err: unknown) => logError('opening a notification', err));
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    Notifications.getLastNotificationResponseAsync()
      .then((resp) => {
        if (resp) handle(resp);
      })
      .catch((err: unknown) => logError('reading the notification that opened the app', err));
    return () => sub.remove();
  }, [route, t]);

  const close = async (snooze: boolean) => {
    const current = popup;
    setPopup(null);
    setError(null);
    if (!snooze || !current) return;
    try {
      const map = await readPref<Record<string, number>>(SNOOZE_KEY, {});
      await writePref(SNOOZE_KEY, { ...map, [current.event.id]: Date.now() + CONFIRM_POPUP_SNOOZE_MS });
    } catch (err) {
      logError('remembering "Remind me later" on this device (the pop-up may show again sooner)', err);
    }
  };

  const yes = async () => {
    if (!popup) return;
    setBusy(true);
    setError(null);
    try {
      await confirmAttendance(popup.rsvp.id, popup.attendees.map((a) => a.id), []);
      invalidate();
      toast(t('notif.confirmedToast', { people: peopleLabel(t, popup.attendees.length) }));
      setPopup(null);
    } catch (err) {
      setError(report(err, 'confirm your attendance').userMessage);
    } finally {
      setBusy(false);
    }
  };

  const change = () => {
    if (!popup) return;
    const id = popup.event.id;
    setPopup(null);
    router.push({ pathname: '/event/[id]/confirm', params: { id } });
  };

  const d = popup;
  const rel = d?.event.starts_at ? relativeDay(zonedParts(new Date(d.event.starts_at), d.tz).iso, todayAt(d.tz)) : null;
  const eyebrow = rel === 'tomorrow' ? t('notif.popupEyebrow') : rel === 'today' ? t('notif.popupEyebrowToday') : t('notif.popupEyebrowSoon');
  const when = d ? [formatDate(d.event.starts_at, d.tz), compactTime(d.event.starts_at, d.tz), d.event.venue].filter(Boolean).join(' · ') : '';

  return (
    <ConfirmPopupContext.Provider value={{ showConfirm }}>
      {children}
      <Modal visible={!!d} transparent animationType="fade" onRequestClose={() => void close(true)}>
        <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: space.gutter }}>
          {d ? (
            <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 480, backgroundColor: colors.card, borderRadius: radii.cta, overflow: 'hidden' }}>
              <View style={{ backgroundColor: colors.maroon, paddingVertical: 18, paddingHorizontal: space.gutter, gap: 4 }}>
                <Pressable
                  onPress={() => void close(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('notif.closePopup')}
                  style={{ position: 'absolute', top: space.md, right: space.md, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.maroonButton, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  <StrokeIcon name="close" size={16} color={colors.white} strokeWidth={2} />
                </Pressable>
                <Txt variant="eyebrow" color="onMaroon" style={{ fontFamily: fonts.bodySemi }}>
                  {eyebrow}
                </Txt>
                <Txt variant="title" color="white" style={{ fontFamily: fonts.display, paddingRight: 40 }} accessibilityRole="header">
                  {d.event.name}
                </Txt>
                <Txt variant="meta" color="onMaroon">
                  {when}
                </Txt>
              </View>
              <View style={{ paddingTop: 18, paddingHorizontal: space.gutter, paddingBottom: space.gutter, gap: space.md }}>
                <Txt variant="body">{t('notif.popupBody', { people: peopleLabel(t, d.attendees.length) })}</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                  {d.attendees.map((a) => (
                    <View key={a.id} style={{ backgroundColor: colors.navyTint, borderRadius: radii.card, paddingVertical: 6, paddingHorizontal: 10 }}>
                      <Txt variant="meta" color="navy" style={{ fontFamily: fonts.bodySemi }}>
                        {a.display_name}
                      </Txt>
                    </View>
                  ))}
                </View>
                {error ? <Banner tone="error" message={error} /> : null}
                <Button label={t('events.yesComing')} tone="green" onPress={yes} busy={busy} />
                <Button label={t('events.changeOrCancel')} tone="secondary" size="md" onPress={change} disabled={busy} />
                <Pressable onPress={() => void close(true)} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                  <Txt variant="smallStrong" color="muted">
                    {t('notif.remindLater')}
                  </Txt>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </ConfirmPopupContext.Provider>
  );
}

export function useConfirmPopup(): ConfirmPopupValue {
  return useContext(ConfirmPopupContext);
}
