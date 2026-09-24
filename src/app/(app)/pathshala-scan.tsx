import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { QrScanner } from '@/components/qr-scanner';
import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/states';
import { Banner, Button, Card, TextField, Txt, VStack } from '@/components/ui';
import { redeemAttendance } from '@/lib/api/gyan';
import { report } from '@/lib/errors';
import { firstName } from '@/lib/format';
import { parseAttendanceQr } from '@/lib/rules';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * Pathshala attendance: scan the QR the teacher shows in class
 * (connect:pathshala-attendance?session=…&token=…). A student scans for
 * themselves; a parent scans for their child (p_person).
 */
export default function PathshalaScanScreen() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ person?: string }>();
  const { member } = useApp();
  const { invalidate } = useDataVersion();
  const [result, setResult] = useState<{ status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const lock = useRef(false);

  const student = member?.members.find((m) => m.person.id === (params.person ?? member.person.id));
  if (!member || !student) {
    return (
      <Screen title={t('attend.title')}>
        <EmptyState title={t('profile.notFound')} />
      </Screen>
    );
  }
  const forSelf = student.person.id === member.person.id;
  const name = firstName(student.person);

  const submit = async (text: string) => {
    if (lock.current) return;
    const parsed = parseAttendanceQr(text);
    if (!parsed) {
      setError(t('attend.notClassCode'));
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const status = await redeemAttendance(parsed.session, parsed.token, forSelf ? null : student.person.id);
      setResult({ status });
      invalidate();
    } catch (err) {
      // The database explains what went wrong (expired code, not enrolled, wrong code).
      setError(report(err, 'mark attendance').userMessage);
      lock.current = false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('attend.title')}>
      <Txt variant="body" color="ink2">
        {forSelf ? t('attend.introSelf') : t('attend.introChild', { name })}
      </Txt>
      {result ? (
        <Card tone="green">
          <Txt variant="headline" color="greenDark" accessibilityRole="alert">
            {result.status === 'late' ? t('attend.late', { name }) : t('attend.present', { name })}
          </Txt>
          <Button label={t('common.done')} tone="green" onPress={() => (router.canGoBack() ? router.back() : router.replace('/jain-way'))} />
        </Card>
      ) : (
        <VStack gap={space.md}>
          <QrScanner onScan={(data) => void submit(data)} paused={busy} />
          {error ? <Banner tone="error" message={error} /> : null}
          <TextField label={t('attend.manual')} hint={t('attend.manualHint')} value={manual} onChangeText={setManual} autoCapitalize="none" autoCorrect={false} />
          <Button label={t('attend.submit')} tone="purple" onPress={() => void submit(manual)} busy={busy} disabled={!manual.trim()} />
        </VStack>
      )}
    </Screen>
  );
}
