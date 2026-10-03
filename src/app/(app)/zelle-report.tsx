import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { DateField } from '@/components/pickers';
import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Checkbox, TextField, Txt, VStack } from '@/components/ui';
import { DollarField } from '@/features/give/parts';
import { canReportZelle, zelleMethod, type PaymentMethods } from '@/features/pay/methods';
import {
  centsParam,
  centsToField,
  initialPledgeSelection,
  splitIds,
  validateReport,
  type ReportField,
  type ReportProblem,
} from '@/features/pay/zelle-report';
import type { StringKey } from '@/i18n/en';
import { isAdultsOnlyRefusal, loadPaymentMethods, reportZelle, type ReportReceipt } from '@/lib/api/payments';
import { listOpenPledges } from '@/lib/api/giving';
import { AppError, report } from '@/lib/errors';
import { formatCents, formatDob, todayAt } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

type OpenPledge = { id: string; pledge_number: string | null; amount_cents: number; paid_cents: number };
type FormData = { methods: PaymentMethods; pledges: OpenPledge[]; today: string };

/**
 * "I sent a Zelle" (payments plan PR 4). A Zelle goes from the member's bank to the community's bank, so the app cannot
 * know it arrived: the member reports it here and the treasurer matches it to the bank statement. Until then it shows as
 * "Reported" and is NOT counted as given, anywhere. Adults only; a child is told to ask a parent. The Pay sheet opens
 * this with the amount and pledges it was for (?amount=<cents>&pledges=<id,id>).
 */
export default function ZelleReportScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ amount?: string; pledges?: string }>();
  const { member, center } = useApp();
  const state = useLoad<FormData | null>(
    async () => {
      if (!member?.household || !center) return null;
      const [methods, pledges] = await Promise.all([loadPaymentMethods(center.id), listOpenPledges(member.household.id)]);
      return { methods, pledges, today: todayAt(center.time_zone) };
    },
    [member?.household?.id, center?.id],
    'load the Zelle form',
  );

  if (!member?.isAdult) {
    return (
      <Screen title={t('zelle.formTitle')}>
        <LockedState />
      </Screen>
    );
  }
  return (
    <Screen title={t('zelle.formTitle')}>
      <Loaded state={state}>
        {(data) => (data ? <ReportForm data={data} wantedAmount={centsParam(params.amount)} wantedPledges={splitIds(params.pledges)} /> : <EmptyState icon="people-outline" title={t('give.noHousehold')} />)}
      </Loaded>
    </Screen>
  );
}

function ReportForm({ data, wantedAmount, wantedPledges }: { data: FormData; wantedAmount: number | null; wantedPledges: string[] }) {
  const t = useT();
  const router = useRouter();
  const { member, center, orgHouseholdLabel } = useApp();
  const { invalidate } = useDataVersion();
  const zelle = zelleMethod(data.methods);
  const openIds = data.pledges.map((p) => p.id);
  // The pledges the Pay sheet was for, but only those the family still has open (and we say so when some are gone).
  const initial = initialPledgeSelection(wantedPledges, openIds);
  const [amount, setAmount] = useState(centsToField(wantedAmount));
  const [date, setDate] = useState(formatDob(data.today));
  const [confirmation, setConfirmation] = useState('');
  const [senderName, setSenderName] = useState('');
  const [selected, setSelected] = useState<string[]>(initial.selected);
  const [problems, setProblems] = useState<Partial<Record<ReportField, ReportProblem>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<ReportReceipt | null>(null);
  const [locked, setLocked] = useState(false);
  // A second tap while the first is on its way must not send a second report.
  const sending = useRef(false);

  const household = member?.household;
  const year = Number(data.today.slice(0, 4));
  const problemText = (field: ReportField): string | null => {
    const p = problems[field];
    return p ? t(`zelle.problem.${p}` as StringKey) : null;
  };
  // Pledges still open now (the list can change after a reload); never send one that is not.
  const stillSelected = selected.filter((id) => openIds.includes(id));

  if (locked) return <LockedState />;
  if (!household || !center) return <EmptyState icon="people-outline" title={t('give.noHousehold')} />;
  if (!zelle || !canReportZelle(data.methods)) {
    return <EmptyState icon="swap-horizontal-outline" title={t('zelle.notAvailable', { center: center.short_name || center.name })} body={t('zelle.notAvailableBody')} action={{ label: t('common.back'), onPress: () => router.back() }} />;
  }

  const submit = async () => {
    if (sending.current || done) return;
    const check = validateReport({ amount, date, confirmation, senderName, pledgeIds: stillSelected }, { today: data.today, openPledgeIds: openIds });
    if (!check.ok) {
      setProblems(check.problems);
      setSubmitError(null);
      return;
    }
    setProblems({});
    sending.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const receipt = await reportZelle({ centerId: center.id, householdId: household.id, value: check.value });
      setDone(receipt);
      invalidate();
    } catch (err) {
      if (isAdultsOnlyRefusal(err)) {
        setLocked(true);
      } else {
        const message = err instanceof AppError ? err.userMessage : report(err, 'send your report').userMessage;
        // A pledge that was closed in the meantime: read the family's pledges again, so the list (and the retry) is right.
        const pledgeGone = /pledge/i.test(message);
        setSubmitError(pledgeGone ? `${message} ${t('zelle.pledgesRefreshed')}` : message);
        if (pledgeGone) invalidate();
      }
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <VStack gap={space.md}>
        <Card tone="green" style={{ gap: space.xs }}>
          <Txt variant="section" color="greenDark" accessibilityRole="header" accessibilityLiveRegion="polite">
            {t(done.isTest ? 'zelle.sentTestTitle' : 'zelle.sentTitle')}
          </Txt>
          <Txt variant="small" color="greenDark2">
            {t(done.isTest ? 'zelle.sentTestBody' : 'zelle.sentBody', { days: zelle.windowDays })}
          </Txt>
        </Card>
        <Button label={t('zelle.backToGive')} onPress={() => router.navigate('/give')} />
      </VStack>
    );
  }

  return (
    <VStack gap={space.lg}>
      {data.methods.sandbox || zelle.rehearsal ? <Banner tone="info" message={t('zelle.sandboxForm')} /> : null}
      {/* The family this is reported for, by its card: never by name alone. */}
      <Card tone="panel" style={{ gap: 2 }} accessibilityLabel={t('zelle.reportingFor')}>
        <Txt variant="caption" color="muted">
          {t('zelle.reportingFor')}
        </Txt>
        <Txt variant="bodyStrong">{household.display_name}</Txt>
        <Txt variant="meta" color="muted" selectable>
          {[member?.orgHouseholdId ? `${orgHouseholdLabel} ${member.orgHouseholdId}` : null, household.household_number].filter(Boolean).join(' · ')}
        </Txt>
      </Card>
      <Txt variant="small" color="ink2">
        {t('zelle.formIntro')}
      </Txt>

      <DollarField label={t('zelle.amountLabel')} value={amount} onChangeText={setAmount} error={problemText('amount')} />
      <DateField label={t('zelle.dateLabel')} value={date} onChangeText={setDate} error={problemText('date')} minYear={year - 1} maxYear={year} />
      <TextField
        label={`${t('zelle.confirmationLabel')} (${t('common.optional')})`}
        hint={t('zelle.confirmationHint')}
        error={problemText('confirmation')}
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={60}
      />
      <TextField label={`${t('zelle.senderLabel')} (${t('common.optional')})`} hint={t('zelle.senderHint')} error={problemText('senderName')} value={senderName} onChangeText={setSenderName} autoCapitalize="words" maxLength={120} />

      <View style={{ gap: space.xs }}>
        <Txt variant="meta" color="muted">
          {t('zelle.pledgesLabel')}
        </Txt>
        {data.pledges.length === 0 ? (
          <Txt variant="small" color="ink2">
            {t('zelle.noOpenPledges')}
          </Txt>
        ) : (
          data.pledges.map((p) => (
            <Checkbox
              key={p.id}
              label={p.pledge_number ?? t('zelle.pledgeNoNumber')}
              sub={t('zelle.pledgeOpen', { amount: formatCents(Math.max(0, p.amount_cents - p.paid_cents)) })}
              checked={stillSelected.includes(p.id)}
              onChange={(on) => setSelected(on ? [...stillSelected, p.id] : stillSelected.filter((x) => x !== p.id))}
            />
          ))
        )}
        {initial.dropped > 0 ? (
          <Txt variant="meta" color="brownDark" accessibilityLiveRegion="polite">
            {t('zelle.pledgesDropped', { n: initial.dropped })}
          </Txt>
        ) : null}
        {problemText('pledges') ? (
          <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
            {problemText('pledges')}
          </Txt>
        ) : (
          <Txt variant="meta" color="muted">
            {t('zelle.pledgesHint')}
          </Txt>
        )}
      </View>

      {submitError ? <Banner tone="error" message={submitError} action={{ label: t('common.retry'), onPress: () => void submit() }} /> : null}
      <Txt variant="meta" color="muted">
        {t('zelle.notCounted', { days: zelle.windowDays })}
      </Txt>
      <Button label={submitting ? t('zelle.sending') : t('zelle.send')} onPress={() => void submit()} busy={submitting} disabled={submitting} />
    </VStack>
  );
}
