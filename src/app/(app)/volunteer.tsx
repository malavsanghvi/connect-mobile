import * as Device from 'expo-device';
import { useRef, useState } from 'react';

import { QrScanner } from '@/components/qr-scanner';
import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, Pill, Row, SectionTitle, TextField, Txt, VStack } from '@/components/ui';
import { checkIn, myVolunteerEvents, type CheckInResult } from '@/lib/api/volunteer';
import { report } from '@/lib/errors';
import { formatTime } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

const STATIONS = ['entry', 'food', 'gifts'] as const;
type Station = (typeof STATIONS)[number];

/**
 * Volunteer mode: only for a checkin_volunteer / event_lead grant on a live
 * event. Scans ticket QR codes and calls app.check_in (lunch slots are
 * assigned server-side on entry).
 */
export default function VolunteerScreen() {
  const t = useT();
  const { center } = useApp();
  const events = useLoad(() => (center ? myVolunteerEvents(center.id) : Promise.resolve([])), [center?.id], 'check your volunteer roles');
  const [eventId, setEventId] = useState<string | null>(null);
  const [station, setStation] = useState<Station>('entry');

  return (
    <Screen title={t('volunteer.title')} tabBar={false}>
      <Loaded state={events}>
        {(list) => {
          if (list.length === 0) return <EmptyState icon="scan-outline" title={t('volunteer.noEvents')} body={t('volunteer.noEventsBody')} />;
          const current = list.find((e) => e.id === eventId) ?? list[0];
          return (
            <VStack gap={space.lg}>
              {list.length > 1 ? (
                <ChipGroup>
                  {list.map((e) => (
                    <Chip key={e.id} label={e.name} selected={current.id === e.id} onPress={() => setEventId(e.id)} />
                  ))}
                </ChipGroup>
              ) : (
                <Txt variant="headline" color="navy">
                  {current.name}
                </Txt>
              )}
              <SectionTitle>{t('volunteer.station')}</SectionTitle>
              <ChipGroup>
                {STATIONS.map((s) => (
                  <Chip key={s} label={t(`volunteer.station.${s}`)} selected={station === s} onPress={() => setStation(s)} />
                ))}
              </ChipGroup>
              <Scanner key={`${current.id}-${station}`} eventId={current.id} station={station} />
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}

function ResultCard({ result }: { result: CheckInResult }) {
  const t = useT();
  const { center } = useApp();
  const tone = result.result === 'ok' ? 'green' : result.result === 'duplicate' ? 'amber' : 'danger';
  const title = t(`volunteer.result.${result.result}` as 'volunteer.result.ok');
  return (
    <Card tone={tone === 'green' ? 'green' : tone === 'amber' ? 'amber' : 'danger'}>
      <Txt variant="headline" color={tone === 'green' ? 'greenDark' : tone === 'amber' ? 'brownDark' : 'danger'} accessibilityRole="alert">
        {title}
      </Txt>
      {result.householdName ? <Txt variant="bodyStrong">{result.householdName}</Txt> : null}
      {result.attendees.map((a) => (
        <Row key={a.id} style={{ justifyContent: 'space-between' }}>
          <Txt variant="small" style={{ flex: 1 }}>
            {a.name}
          </Txt>
          <Row gap={4}>
            {a.child_under_12 ? <Pill label={t('events.flagChild')} tone="purple" /> : null}
            {a.senior ? <Pill label={t('events.flagSenior')} tone="navy" /> : null}
            {a.assistance ? <Pill label={t('volunteer.assistance')} tone="amber" /> : null}
            {a.lunch ? <Pill label={t('volunteer.lunchAt', { time: formatTime(a.lunch, center?.time_zone) })} tone="green" /> : null}
          </Row>
        </Row>
      ))}
    </Card>
  );
}

function Scanner({ eventId, station }: { eventId: string; station: Station }) {
  const t = useT();
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const lock = useRef(false);

  // check_in accepts Connect tickets, Connect member cards and legacy family QR codes (connect-crm 0016).
  const submit = async (token: string) => {
    const value = token.trim();
    if (!value || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      setResult(await checkIn(eventId, value, station, Device.modelName ?? null));
    } catch (err) {
      setError(report(err, 'check this ticket in').userMessage);
      lock.current = false;
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    lock.current = false;
    setResult(null);
    setError(null);
    setManual('');
  };

  return (
    <VStack gap={space.md}>
      <QrScanner onScan={(data) => void submit(data)} paused={busy || !!result} />
      {result ? <ResultCard result={result} /> : null}
      {error ? <Banner tone="error" message={error} /> : null}
      {result ? <Button label={t('volunteer.next')} onPress={next} /> : null}
      {!result ? (
        <VStack gap={space.sm}>
          <TextField label={t('volunteer.manual')} value={manual} onChangeText={setManual} autoCapitalize="none" autoCorrect={false} />
          <Button label={t('volunteer.checkIn')} tone="secondary" onPress={() => void submit(manual)} busy={busy} disabled={!manual.trim()} />
        </VStack>
      ) : null}
    </VStack>
  );
}
