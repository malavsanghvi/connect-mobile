import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Loaded } from '@/components/states';
import { Row, Txt, VStack } from '@/components/ui';
import { attendeeNote, confirmLabel, defaultSelection, doneAtStation } from '@/features/volunteer';
import {
  confirmCheckIn,
  eventCounts,
  lookupByPhone,
  lookupTicket,
  myVolunteerEvents,
  ticketTokenForRsvp,
  type CheckInResult,
  type PhoneMatch,
  type Station,
  type VolunteerEvent,
} from '@/lib/api/volunteer';
import { report } from '@/lib/errors';
import { formatTime } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useSettings, useT } from '@/providers/settings';
import { colors, fonts, layout, radii, space, touch } from '@/theme';

const STATIONS: Station[] = ['entry', 'food', 'gifts'];

/**
 * Volunteer check-in board (Volunteer.dc.html): dark full screen, counter,
 * Entry / Food / Gifts stations, scan → confirm who is here → record, walk-in
 * by phone and kiosk mode. Only for a checkin_volunteer / event_lead grant on a
 * live event. A scan first calls check_in(…, 'lookup') (read only), then the
 * station with p_attendee_ids for exactly the people the volunteer ticked.
 */
export default function VolunteerScreen() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const events = useLoad(() => (center ? myVolunteerEvents(center.id) : Promise.resolve([])), [center?.id], 'check your volunteer roles');
  const exit = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.volBg }}>
      <Loaded state={events}>
        {(list) =>
          list.length === 0 ? (
            <VStack gap={space.lg}>
              <Header title={t('volunteer.title')} onExit={exit} />
              <View style={{ marginHorizontal: space.gutter, backgroundColor: colors.volPanel, borderRadius: radii.xxl, padding: space.gutter, gap: space.sm }}>
                <Txt variant="section" color="volText">
                  {t('volunteer.noEvents')}
                </Txt>
                <Txt variant="small" color="volMuted">
                  {t('volunteer.noEventsBody')}
                </Txt>
              </View>
            </VStack>
          ) : (
            <Board events={list} onExit={exit} />
          )
        }
      </Loaded>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Dark pieces (Volunteer.dc.html)
// ---------------------------------------------------------------------------

function Header({ title, onExit, right }: { title: string; onExit?: () => void; right?: ReactNode }) {
  const t = useT();
  return (
    <Row gap={space.md} style={{ paddingTop: space.lg, paddingHorizontal: space.gutter, paddingBottom: space.md }}>
      {onExit ? (
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel={t('volunteer.exitLabel')}
          style={({ pressed }) => ({ minHeight: touch.min, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.volBorder, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <Txt variant="smallStrong" color="volText">
            {t('volunteer.exit')}
          </Txt>
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt variant="eyebrow" color="volGold" style={{ fontFamily: fonts.body }}>
          {t('volunteer.eyebrow')}
        </Txt>
        <Txt variant="headline" color="volText" numberOfLines={1} accessibilityRole="header">
          {title}
        </Txt>
      </View>
      {right}
    </Row>
  );
}

function GoldButton({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(busy || disabled), busy: !!busy }}
      style={({ pressed }) => ({ minHeight: touch.cta, borderRadius: radii.cta, backgroundColor: colors.volGold, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}>
      {busy ? (
        <ActivityIndicator color={colors.volOnGold} />
      ) : (
        <Txt variant="section" color="volOnGold" style={{ fontFamily: fonts.bodyBold }}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}

function TextButton({ label, onPress, onLongPress, hint }: { label: string; onPress?: () => void; onLongPress?: () => void; hint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={900}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => ({ minHeight: touch.min, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Txt variant="smallStrong" color="volText">
        {label}
      </Txt>
    </Pressable>
  );
}

function Tile({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ flex: 1, minHeight: 64, borderRadius: radii.row, borderWidth: 1, borderColor: colors.volBorder, backgroundColor: colors.volPanel, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Txt variant="smallStrong" color="volText">
        {label}
      </Txt>
    </Pressable>
  );
}

function DarkInput({ label, hint, big, style, ...rest }: ComponentProps<typeof TextInput> & { label: string; hint?: string; big?: boolean }) {
  const { scale } = useSettings();
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="meta" color="volMuted">
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={colors.volMuted}
        accessibilityLabel={label}
        accessibilityHint={hint}
        {...rest}
        style={[
          { minHeight: touch.cta, borderRadius: radii.card, borderWidth: 1, borderColor: colors.volBorder, backgroundColor: colors.volPanel, color: colors.white, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: (big ? 18 : 16) * scale },
          style,
        ]}
      />
      {hint ? (
        <Txt variant="caption" color="volMuted">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ backgroundColor: colors.dangerTint, borderRadius: radii.card, padding: space.md, flexDirection: 'row', gap: space.sm }}>
      <Icon name="alert-circle" size={20} color={colors.danger} />
      <Txt variant="small" color="danger" style={{ flex: 1 }}>
        {message}
      </Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

type Step = 'scan' | 'walkin' | 'result';

function Board({ events, onExit }: { events: VolunteerEvent[]; onExit: () => void }) {
  const t = useT();
  const { center } = useApp();
  const [eventId, setEventId] = useState(events[0].id);
  const event = events.find((e) => e.id === eventId) ?? events[0];
  const [station, setStation] = useState<Station>('entry');
  const [step, setStep] = useState<Step>('scan');
  const [kiosk, setKiosk] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState<PhoneMatch[] | null>(null);
  const counts = useLoad(() => eventCounts(event.id), [event.id], 'load the check-in count');
  const scanLock = useRef(false);
  const device = Device.modelName ?? null;

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const toScan = () => {
    scanLock.current = false;
    setStep('scan');
    setResult(null);
    setToken(null);
    setError(null);
    setManual('');
  };

  const lookup = async (raw: string) => {
    const value = raw.trim();
    if (!value || scanLock.current) return;
    scanLock.current = true;
    setBusy('lookup');
    setError(null);
    setToast(null);
    try {
      const res = await lookupTicket(event.id, value, device);
      setToken(value);
      setResult(res);
      setSelected(defaultSelection(res.attendees, station));
      setStep('result');
    } catch (err) {
      setError(report(err, 'look up this ticket').userMessage);
      scanLock.current = false;
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (!token || !result || selected.length === 0) return;
    setBusy('confirm');
    setError(null);
    try {
      const res = await confirmCheckIn({ eventId: event.id, token, station, attendeeIds: selected, deviceId: device });
      if (res.result !== 'ok' && res.result !== 'duplicate') {
        setError(t(`volunteer.result.${res.result}` as 'volunteer.result.invalid'));
        return;
      }
      setToast(t('volunteer.done', { n: selected.length, name: result.householdName ?? '' }));
      toScan();
      void counts.reload();
    } catch (err) {
      setError(report(err, 'record this check-in').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const findByPhone = async () => {
    setBusy('phone');
    setError(null);
    setMatches(null);
    try {
      setMatches(await lookupByPhone(event.id, phone));
    } catch (err) {
      setError(report(err, 'look up this mobile number').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const openMatch = async (m: PhoneMatch) => {
    if (!m.rsvpId) return;
    setBusy(`m-${m.householdId}`);
    setError(null);
    let tk: string;
    try {
      tk = await ticketTokenForRsvp(m.rsvpId);
    } catch (err) {
      setError(report(err, "open this family's tickets").userMessage);
      setBusy(null);
      return;
    }
    setBusy(null);
    scanLock.current = false;
    await lookup(tk);
  };

  const counter =
    counts.data !== undefined ? (
      <View style={{ alignItems: 'flex-end' }} accessible accessibilityLabel={t('volunteer.counterLabel', { done: counts.data.checkedIn, n: counts.data.expected })}>
        <Txt variant="title" color="white" style={{ fontFamily: fonts.bodyBold }}>
          {String(counts.data.checkedIn)}
        </Txt>
        <Txt variant="fine" color="volMuted">
          {t('volunteer.counterOf', { n: counts.data.expected })}
        </Txt>
      </View>
    ) : counts.error ? (
      <Pressable onPress={() => void counts.reload()} accessibilityRole="button" accessibilityLabel={`${t('volunteer.countError')}. ${t('common.retry')}`} style={{ minHeight: touch.min, justifyContent: 'center', alignItems: 'flex-end' }}>
        <Txt variant="fine" color="volMuted">
          {t('volunteer.countError')}
        </Txt>
        <Txt variant="caption" color="volGold">
          {t('common.retry')}
        </Txt>
      </Pressable>
    ) : (
      <ActivityIndicator color={colors.volGold} />
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', flex: 1 }}>
        <Header title={event.name} onExit={kiosk ? undefined : onExit} right={counter} />
        {!kiosk && events.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.gutter, paddingBottom: space.sm }}>
            {events.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => {
                  setEventId(e.id);
                  toScan();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: e.id === event.id }}
                style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: radii.xxl, borderWidth: 1, borderColor: e.id === event.id ? colors.volGold : colors.volBorder, justifyContent: 'center' }}>
                <Txt variant="meta" color={e.id === event.id ? 'volGold' : 'volText'}>
                  {e.name}
                </Txt>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {!kiosk ? (
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: space.xs, marginHorizontal: space.gutter, backgroundColor: colors.volPanel, borderRadius: radii.card, padding: 4 }}>
            {STATIONS.map((s) => {
              const on = s === station;
              return (
                <Pressable
                  key={s}
                  onPress={() => {
                    setStation(s);
                    toScan();
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={{ flex: 1, minHeight: touch.min, borderRadius: radii.md, backgroundColor: on ? colors.volGold : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <Txt variant="smallStrong" color={on ? 'volOnGold' : 'volText'}>
                    {t(`volunteer.station.${s}`)}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.xl, gap: 14 }}>
          {error ? <ErrorLine message={error} /> : null}

          {step === 'scan' ? (
            <VStack gap={14}>
              {kiosk ? (
                <Txt variant="title" color="volText" center>
                  {t('volunteer.kioskTitle')}
                </Txt>
              ) : null}
              <Viewfinder hint={t('volunteer.scanHint', { station: t(`volunteer.station.${station}`) })} toast={toast} paused={busy !== null} onScan={(data) => void lookup(data)} />
              <DarkInput
                label={t('volunteer.manual')}
                hint={t('volunteer.manualHint')}
                value={manual}
                onChangeText={setManual}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => void lookup(manual)}
              />
              <GoldButton label={t('volunteer.lookUp')} onPress={() => void lookup(manual)} busy={busy === 'lookup'} disabled={!manual.trim()} />
              {!kiosk ? (
                <Row gap={10}>
                  <Tile
                    label={t('volunteer.walkin')}
                    onPress={() => {
                      setError(null);
                      setMatches(null);
                      setStep('walkin');
                    }}
                  />
                  <Tile
                    label={t('volunteer.kiosk')}
                    onPress={() => {
                      setKiosk(true);
                      setStation('entry');
                      toScan();
                    }}
                  />
                </Row>
              ) : (
                <TextButton label={t('volunteer.kioskExit')} hint={t('volunteer.kioskExitHint')} onLongPress={() => setKiosk(false)} />
              )}
              <Txt variant="caption" color="volMuted" center>
                {t('volunteer.footer')}
              </Txt>
            </VStack>
          ) : null}

          {step === 'walkin' ? (
            <VStack gap={14}>
              <Txt variant="title" color="volText" style={{ fontFamily: fonts.display }} accessibilityRole="header">
                {t('volunteer.findFamily')}
              </Txt>
              <DarkInput label={t('volunteer.mobile')} big value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="(713) 555-0142" returnKeyType="search" onSubmitEditing={findByPhone} />
              <GoldButton label={t('volunteer.findFamilyBtn')} onPress={findByPhone} busy={busy === 'phone'} disabled={phone.replace(/\D/g, '').length < 10} />
              {matches && matches.length === 0 ? (
                <Txt variant="small" color="volText">
                  {t('volunteer.noMatch', { center: center?.short_name || center?.name || '' })}
                </Txt>
              ) : null}
              {(matches ?? []).map((m) => (
                <View key={`${m.householdId}-${m.rsvpId ?? 'none'}`} style={{ backgroundColor: colors.volPanel, borderWidth: 1, borderColor: colors.volBorder, borderRadius: radii.row, padding: 14, gap: space.sm }}>
                  <Txt variant="bodyStrong" color="volText">
                    {m.membersMasked ?? ''}
                  </Txt>
                  <Txt variant="meta" color="volMuted">
                    {[m.householdLabel, m.rsvpStatus ? t('volunteer.rsvpStatus', { status: m.rsvpStatus }) : null].filter(Boolean).join(' · ')}
                  </Txt>
                  {m.rsvpId ? (
                    <GoldButton label={t('volunteer.openCheckIn')} onPress={() => void openMatch(m)} busy={busy === `m-${m.householdId}` || busy === 'lookup'} />
                  ) : (
                    <Txt variant="small" color="volGold">
                      {t('volunteer.noRsvpFamily')}
                    </Txt>
                  )}
                </View>
              ))}
              <TextButton label={t('volunteer.backToScanner')} onPress={toScan} />
              <Txt variant="caption" color="volMuted">
                {t('volunteer.guestNote')}
              </Txt>
            </VStack>
          ) : null}

          {step === 'result' && result ? (
            <ResultStep
              result={result}
              station={station}
              selected={selected}
              onToggle={(id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])}
              onConfirm={confirm}
              onCancel={toScan}
              busy={busy === 'confirm'}
              timeZone={center?.time_zone ?? null}
            />
          ) : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/** 360px viewfinder with the gold frame and red scan line; the camera fills it on phones. */
function Viewfinder({ hint, toast, paused, onScan }: { hint: string; toast: string | null; paused: boolean; onScan: (data: string) => void }) {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const web = Platform.OS === 'web';
  const live = !web && !!permission?.granted && !paused;
  return (
    <View style={{ height: 360, borderRadius: radii.sheet, backgroundColor: colors.volViewfinder, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={t('scan.cameraLabel')}>
      {live ? <CameraView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(r: BarcodeScanningResult) => onScan(r.data)} /> : null}
      <View style={{ width: 220, height: 220, borderWidth: 3, borderColor: colors.volGold, borderRadius: radii.xxl, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 190, height: 2, backgroundColor: colors.volScanLine }} />
      </View>
      {web ? (
        <Txt variant="meta" color="volMuted" center style={{ position: 'absolute', top: space.lg, left: space.lg, right: space.lg }}>
          {t('volunteer.webScan')}
        </Txt>
      ) : permission && !permission.granted ? (
        <View style={{ position: 'absolute', top: space.lg, left: space.lg, right: space.lg, gap: space.sm, alignItems: 'center' }}>
          <Txt variant="meta" color="volText" center>
            {permission.canAskAgain ? t('scan.cameraAsk') : t('scan.cameraDenied')}
          </Txt>
          {permission.canAskAgain ? (
            <Pressable onPress={() => void requestPermission()} accessibilityRole="button" style={{ minHeight: touch.min, paddingHorizontal: space.lg, borderRadius: radii.pill, backgroundColor: colors.volGold, justifyContent: 'center' }}>
              <Txt variant="smallStrong" color="volOnGold">
                {t('scan.allowCamera')}
              </Txt>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {paused ? <ActivityIndicator color={colors.volGold} style={{ position: 'absolute' }} /> : null}
      <Txt variant="meta" color="volMuted" center style={{ position: 'absolute', bottom: space.lg, left: space.lg, right: space.lg }}>
        {hint}
      </Txt>
      {toast ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ position: 'absolute', top: space.lg, backgroundColor: colors.green, borderRadius: radii.lg, paddingVertical: space.sm, paddingHorizontal: 14 }}>
          <Txt variant="smallStrong" color="white">
            {toast}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

function ResultStep({
  result,
  station,
  selected,
  onToggle,
  onConfirm,
  onCancel,
  busy,
  timeZone,
}: {
  result: CheckInResult;
  station: Station;
  selected: string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  timeZone: string | null;
}) {
  const t = useT();
  const stationName = t(`volunteer.station.${station}`);
  if (result.result !== 'ok') {
    return (
      <VStack gap={space.md}>
        <View style={{ backgroundColor: colors.ground, borderRadius: radii.pill, padding: 18, gap: 10 }}>
          <Txt variant="eyebrow" color="danger">
            {stationName}
          </Txt>
          <Txt variant="headline" accessibilityRole="alert">
            {t(`volunteer.result.${result.result}` as 'volunteer.result.invalid')}
          </Txt>
          {result.householdName ? (
            <Txt variant="small" color="muted">
              {result.householdName}
            </Txt>
          ) : null}
        </View>
        <GoldButton label={t('volunteer.backToScanner')} onPress={onCancel} />
      </VStack>
    );
  }
  const n = selected.length;
  const selectable = result.attendees.filter((a) => !doneAtStation(a, station));
  const label = confirmLabel(t, station, n);
  return (
    <VStack gap={space.md}>
      <View style={{ backgroundColor: colors.ground, borderRadius: radii.pill, padding: 18, gap: 10 }}>
        <Txt variant="eyebrow" color="green">
          {t('volunteer.validTicket', { station: stationName })}
        </Txt>
        <Txt variant="display" style={{ fontFamily: fonts.display }} accessibilityRole="header">
          {t('volunteer.welcome', { name: result.householdName ?? '' })}
        </Txt>
        <Txt variant="meta" color="muted">
          {selectable.length ? t('volunteer.confirmWho') : t('volunteer.allDone')}
        </Txt>
        {result.attendees.map((a) => {
          const done = doneAtStation(a, station);
          const on = selected.includes(a.id);
          const lunch = a.lunch ? t('volunteer.lunchAt', { time: formatTime(a.lunch, timeZone) }) : null;
          const note = attendeeNote(t, a, station, lunch);
          return (
            <Pressable
              key={a.id}
              onPress={() => onToggle(a.id)}
              disabled={done}
              accessibilityRole="checkbox"
              accessibilityLabel={`${a.name}. ${note}`}
              accessibilityState={{ checked: done || on, disabled: done }}
              style={{
                minHeight: touch.row,
                borderRadius: radii.card,
                borderWidth: 1,
                borderColor: on ? colors.navyBorder : colors.borderInput,
                backgroundColor: on ? colors.navyTint : colors.card,
                paddingVertical: space.sm,
                paddingHorizontal: space.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                opacity: done ? 0.6 : 1,
              }}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: radii.check,
                  borderWidth: 2,
                  borderColor: done ? colors.faint : colors.navy,
                  backgroundColor: on ? colors.navy : done ? colors.faint : colors.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {on || done ? <Icon name="checkmark" size={16} color={colors.white} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{a.name}</Txt>
                <Txt variant="caption" color="muted">
                  {note}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={onConfirm}
        disabled={n === 0 || busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: n === 0 || busy, busy }}
        style={({ pressed }) => ({ minHeight: touch.row, borderRadius: radii.cta, backgroundColor: n === 0 ? colors.navyDisabled : colors.green, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Txt variant="cardTitle" color="white" style={{ fontFamily: fonts.bodyBold }}>
            {label}
          </Txt>
        )}
      </Pressable>
      <TextButton label={t('common.cancel')} onPress={onCancel} />
    </VStack>
  );
}
