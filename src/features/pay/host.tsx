import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterMark } from '@/components/brand';
import { Banner, Button, Radio, Row, Txt, VStack } from '@/components/ui';
import { errorCodeOf, track } from '@/lib/activity';
import { report } from '@/lib/errors';
import { formatCents } from '@/lib/format';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { cardCharger, registerPayHost, useCardCharger, type PaymentOutcome, type PaymentRequest, type SavingJob, type SavingOutcome } from './controller';
import { HowToGive } from './how-to-give';
import { canReportZelle, chosenOnline, joinNames, onlineMethods, otherMethods, type OnlineMethod, type PaymentMethods } from './methods';
import { usePaymentMethods } from './online';
import { processorLabel } from './online-wait';
import { runSteps, stepStatuses, type StepStatus } from './steps';

/** Prototype animates each step for 750ms; real steps are shown for at least this long so they can be read. */
const MIN_STEP_MS = 450;
/** Let the sheet finish sliding away before the next full-screen view opens (iOS stacks modals badly). */
const MODAL_GAP_MS = 350;

type SheetState = { req: PaymentRequest; resolve: (o: PaymentOutcome) => void; busy: boolean; error: string | null; /** The online way the member chose (a method's key); null until they choose, then the first one is used. */ choice: string | null };
type SavingState = { job: SavingJob; resolve: (o: SavingOutcome) => void; done: number; failed: string | null; running: boolean; result: string | null };

/** Pay sheet, "Saving" and "Thank you" for the whole app. Mount once, inside the providers. */
export function PayHost() {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [saving, setSaving] = useState<SavingState | null>(null);
  const [paid, setPaid] = useState<{ amountCents: number; context: PaymentRequest['context'] } | null>(null);
  const savingRef = useRef<SavingState | null>(null);
  // "I sent it" opens a screen once, however many times it is tapped while the sheet slides away.
  const openingReport = useRef(false);
  const router = useRouter();
  // What this community takes (Card, PayPal, Zelle, the office's instructions); registers the card charger.
  const { methods, error: methodsError, loading: methodsLoading } = usePaymentMethods();
  const { invalidate } = useDataVersion();
  const available = useCardCharger();

  useEffect(() => {
    savingRef.current = saving;
  });

  const run = async (from: number) => {
    const current = savingRef.current;
    if (!current) return;
    setSaving({ ...current, running: true, failed: null });
    const res = await runSteps(current.job.steps, from, (done) => setSaving((s) => (s ? { ...s, done } : s)), MIN_STEP_MS);
    if (res.ok) {
      let result: string;
      try {
        result = current.job.result();
      } catch (err) {
        result = '';
        report(err, 'show what was saved');
      }
      setSaving((s) => (s ? { ...s, running: false, done: res.done, result } : s));
      return;
    }
    const message = report(res.error, current.job.title.toLowerCase()).userMessage;
    setSaving((s) => (s ? { ...s, running: false, done: res.done, failed: message } : s));
  };

  useEffect(
    () =>
      registerPayHost({
        pay: (req) =>
          new Promise<PaymentOutcome>((resolve) => {
            setSheet({ req, resolve, busy: false, error: null, choice: null });
          }),
        save: (job) =>
          new Promise<SavingOutcome>((resolve) => {
            const state: SavingState = { job, resolve, done: 0, failed: null, running: true, result: null };
            savingRef.current = state;
            setSaving(state);
            void run(0);
          }),
      }),
    [],
  );

  const closeSheet = (outcome: PaymentOutcome) => {
    sheet?.resolve(outcome);
    setSheet(null);
  };

  const alternative = () => {
    const alt = sheet?.req.alternative;
    closeSheet({ status: 'alternative' });
    if (alt) setTimeout(alt.run, MODAL_GAP_MS);
  };

  const choose = (key: string) => setSheet((s) => (s && !s.busy ? { ...s, choice: key, error: null } : s));

  const confirm = async () => {
    const charge = cardCharger();
    // While a payment is starting the button is busy (and disabled); this is the same guard for anything else that calls it.
    if (!sheet || !charge || sheet.busy) return;
    setSheet({ ...sheet, busy: true, error: null });
    try {
      const res = await charge(sheet.req, chosenOnline(methods, sheet.choice) ?? undefined);
      const { amountCents, context } = sheet.req;
      closeSheet({ status: 'paid', paymentId: res.paymentId });
      setTimeout(() => setPaid({ amountCents, context }), MODAL_GAP_MS);
    } catch (err) {
      // The sheet stays open for another try; the usage logger counts this failure (a code only, never the amount).
      track('payment_failed', { entityKind: sheet.req.context, outcome: 'error', errorCode: errorCodeOf(err) });
      setSheet((s) => (s ? { ...s, busy: false, error: report(err, 'take your payment').userMessage } : s));
    }
  };

  // "I sent it" (Zelle): the sheet closes, then the report form opens with this payment's amount and pledges filled in.
  // Once only: a second tap while the sheet slides away must not open a second form.
  const reportZelleSent = () => {
    const req = sheet?.req;
    if (!req || openingReport.current) return;
    openingReport.current = true;
    closeSheet({ status: 'cancelled' });
    const ids = req.pledgeIds ?? (req.pledgeId ? [req.pledgeId] : []);
    setTimeout(() => {
      openingReport.current = false;
      router.push({ pathname: '/zelle-report', params: { amount: String(req.amountCents), pledges: ids.join(',') } });
    }, MODAL_GAP_MS);
  };

  const finishSaving = (ok: boolean) => {
    const s = savingRef.current;
    if (!s) return;
    savingRef.current = null;
    setSaving(null);
    s.resolve(ok ? { ok: true } : { ok: false, error: s.failed });
    if (ok) setTimeout(s.job.cta.onPress, 0);
  };

  return (
    <>
      <PaySheet state={sheet} methods={methods} loadError={methodsError} loading={methodsLoading} onRetryLoad={invalidate} charge={available} onCancel={() => closeSheet({ status: sheet && !available ? 'not_available' : 'cancelled' })} onAlternative={alternative} onChoose={choose} onReport={reportZelleSent} onConfirm={confirm} />
      <SavingView state={saving} onRetry={() => void run(saving?.done ?? 0)} onClose={() => finishSaving(false)} onContinue={() => finishSaving(true)} />
      <ThankYou state={paid} onClose={() => setPaid(null)} />
    </>
  );
}

function SheetRow({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.dividerLight, paddingBottom: space.md }} align="flex-start" gap={space.md}>
      <Txt variant="body" color="muted">
        {label}
      </Txt>
      <Txt variant="body" style={{ fontFamily: fonts.bodyMedium, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </Row>
  );
}

/**
 * Pay sheet (prototype L1559): Pay · Cancel; To / For; how to pay; Total; confirm.
 *
 * When the community takes payments online, the member sees the ways it lists (Card, PayPal) and chooses one; the
 * provider's own page takes the payment. Zelle and the office's instructions sit under "Other ways to give", with a
 * copy button and "I sent it" for Zelle. When nothing can be paid online the sheet says so honestly and shows those
 * instructions instead. A child is told to ask a parent. Nothing here ever claims a payment: the provider's webhook
 * records an online one, and a Zelle counts only once a treasurer has matched it to the bank.
 */
function PaySheet({
  state,
  methods,
  loadError,
  loading,
  onRetryLoad,
  charge,
  onCancel,
  onAlternative,
  onChoose,
  onReport,
  onConfirm,
}: {
  state: SheetState | null;
  methods: PaymentMethods | null;
  /** Why how-to-give could not be loaded (shown with a retry), or null. */
  loadError: string | null;
  loading: boolean;
  onRetryLoad: () => void;
  charge: unknown;
  onCancel: () => void;
  onAlternative: () => void;
  onChoose: (key: string) => void;
  onReport: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { center, member } = useApp();
  const [othersOpen, setOthersOpen] = useState(false);
  const req = state?.req;
  const saved = !!(req?.pledgeId || req?.pledgeIds?.length);
  const adult = !member || member.isAdult;
  const online = charge && adult ? onlineMethods(methods) : [];
  const selected = chosenOnline(charge && adult ? methods : null, state?.choice ?? null);
  const others = adult ? otherMethods(methods) : [];
  const offReason = methods?.onlineUnavailable;
  const centerName = center?.short_name || center?.name || '';
  const reportOpens = canReportZelle(methods) ? onReport : undefined;
  // The list could not be read, or is still being read: say that, rather than "not set up yet".
  const unknown = online.length === 0 && !methods && (!!loadError || loading);
  // Under the choices, the other ways to give: shown with the new list (the older list never showed them on the sheet).
  const showOthers = online.length > 0 && others.length > 0 && methods?.source === 'methods';
  return (
    <Modal visible={!!state} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: colors.scrimSheet, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onCancel} accessibilityLabel={t('common.cancel')} />
        <View
          accessibilityViewIsModal
          style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, paddingTop: 22, paddingHorizontal: 22, paddingBottom: 34 + insets.bottom, gap: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="cardTitle" style={{ fontFamily: fonts.bodyBold }} accessibilityRole="header">
              {t('pay.sheetTitle')}
            </Txt>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              hitSlop={4}
              style={({ pressed }) => ({ backgroundColor: colors.chip, borderRadius: radii.xxl, minHeight: 36, paddingHorizontal: 14, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
              <Txt variant="small">{t('common.cancel')}</Txt>
            </Pressable>
          </Row>
          {!adult ? (
            <View style={{ backgroundColor: colors.brownTint, borderColor: colors.brownBorder, borderWidth: 1, borderRadius: radii.card, padding: space.md, gap: space.xs }} accessibilityLiveRegion="polite">
              <Txt variant="smallStrong" color="brownDark">
                {t('locked.title')}
              </Txt>
              <Txt variant="small" color="brownDark">
                {t('pay.askParent')}
              </Txt>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: Math.max(220, height * 0.5) }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
              <SheetRow label={t('pay.to')} value={center?.name ?? ''} />
              <SheetRow label={t('pay.for')} value={req?.forLabel ?? ''} />
              {online.length > 1 ? (
                <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
                  <Txt variant="body" color="muted">
                    {t('pay.payWith')}
                  </Txt>
                  {online.map((m) => (
                    <Radio key={m.key} label={m.label} sub={onlineNote(t, m)} selected={selected?.key === m.key} onPress={() => onChoose(m.key)} />
                  ))}
                </View>
              ) : online.length === 1 ? (
                <View style={{ gap: space.xs }}>
                  <SheetRow label={t('pay.provider')} value={online[0].label} />
                  {onlineNote(t, online[0]) ? (
                    <Txt variant="meta" color="muted">
                      {onlineNote(t, online[0])}
                    </Txt>
                  ) : null}
                </View>
              ) : unknown ? null : (
                <SheetRow label={t('pay.card')} value={t('pay.noCard')} />
              )}
              {showOthers ? (
                <View style={{ gap: space.sm }}>
                  <Pressable
                    onPress={() => setOthersOpen(!othersOpen)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: othersOpen }}
                    style={({ pressed }) => ({ minHeight: touch.min, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                    <Txt variant="smallStrong" color="navy">
                      {othersOpen ? t('pay.otherWaysHide') : t('pay.otherWays')}
                    </Txt>
                  </Pressable>
                  {othersOpen ? <HowToGive methods={others} onReport={reportOpens} /> : null}
                </View>
              ) : null}
              {unknown && loadError ? <Banner tone="error" title={t('pay.loadFailed')} message={loadError} action={{ label: t('common.retry'), onPress: onRetryLoad }} /> : null}
              {unknown && !loadError ? (
                <Txt variant="small" color="muted" accessibilityLiveRegion="polite">
                  {t('pay.checking')}
                </Txt>
              ) : null}
              {online.length === 0 && !unknown ? (
                <View style={{ backgroundColor: colors.brownTint, borderColor: colors.brownBorder, borderWidth: 1, borderRadius: radii.card, padding: space.md, gap: space.xs }} accessibilityLiveRegion="polite">
                  <Txt variant="smallStrong" color="brownDark">
                    {t('pay.title')}
                  </Txt>
                  <Txt variant="small" color="brownDark">
                    {offReason === 'offline_only' || offReason === 'test_mode'
                      ? t(`pay.onlineOff.${offReason}`, { center: centerName })
                      : saved
                        ? t('pay.notSetUp')
                        : t('pay.notSetUpNoPledge')}
                  </Txt>
                  {others.length > 0 ? (
                    <HowToGive methods={others} tone="brown" onReport={reportOpens} />
                  ) : (
                    <Txt variant="meta" color="brownText">
                      {t('pay.howToPay')}
                    </Txt>
                  )}
                </View>
              ) : null}
            </ScrollView>
          )}
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="headline" style={{ fontFamily: fonts.bodyBold, fontSize: 20 }}>
              {t('pay.total')}
            </Txt>
            <Txt variant="headline" style={{ fontFamily: fonts.bodyBold, fontSize: 20 }}>
              {formatCents(req?.amountCents ?? 0)}
            </Txt>
          </Row>
          {state?.error ? <Banner tone="error" message={state.error} /> : null}
          {selected?.mode === 'test' ? <Banner tone="info" message={t('pay.testMode')} /> : null}
          {online.length > 0 && selected ? (
            <>
              {state?.busy ? (
                <Txt variant="small" color="muted" accessibilityLiveRegion="polite">
                  {t('pay.finishOnProvider', { provider: processorLabel(selected.processor) })}
                </Txt>
              ) : null}
              <Button label={t('pay.confirm')} tone="black" onPress={onConfirm} busy={state?.busy} />
              {req?.alternative?.withOnline && !state?.busy ? <Button label={req.alternative.label} tone="secondary" size="md" onPress={onAlternative} /> : null}
            </>
          ) : (
            <>
              {req?.alternative ? <Button label={req.alternative.label} onPress={onAlternative} /> : null}
              <Button label={t('common.gotIt')} tone={req?.alternative ? 'secondary' : 'primary'} size={req?.alternative ? 'md' : 'cta'} onPress={onCancel} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Under a choice: what else appears on that provider's page (wallets, Venmo, bank account). Empty when nothing. */
function onlineNote(t: ReturnType<typeof useT>, m: OnlineMethod): string {
  const wallets = joinNames(m.wallets);
  const also = joinNames(m.also);
  return [wallets ? t('pay.walletsNote', { wallets }) : '', also ? t('pay.alsoNote', { names: also }) : ''].filter(Boolean).join(' ');
}

const STEP_LOOK: Record<StepStatus, { bg: string; glyph: string; color: 'ink' | 'faint' | 'danger' }> = {
  done: { bg: colors.green, glyph: '✓', color: 'ink' },
  running: { bg: colors.saffron, glyph: '…', color: 'ink' },
  pending: { bg: colors.borderInput, glyph: '', color: 'faint' },
  failed: { bg: colors.danger, glyph: '!', color: 'danger' },
};

/** Prototype "Saving" view (L901): mark, title, keep-open note, ticking steps, saved box and CTA. */
function SavingView({ state, onRetry, onClose, onContinue }: { state: SavingState | null; onRetry: () => void; onClose: () => void; onContinue: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { center } = useApp();
  const job = state?.job;
  const statuses = job ? stepStatuses(job.steps.length, state.done, !!state.failed) : [];
  const finished = !!job && !state.running && !state.failed && state.done >= job.steps.length;
  const onBack = () => {
    if (finished) onContinue();
    else if (state?.failed) onClose();
    // While steps run, back does nothing: leaving would hide a save in progress.
  };
  return (
    <Modal visible={!!state} animationType="fade" onRequestClose={onBack}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.ground }} contentContainerStyle={{ paddingTop: insets.top + 28, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.gutter, gap: space.lg }}>
        <Row gap={space.md}>
          <CenterMark size={48} />
          <View style={{ flex: 1 }}>
            <Txt variant="title" accessibilityRole="header">
              {job?.title ?? ''}
            </Txt>
            <Txt variant="meta" color="muted">
              {t('saving.keepOpen')}
            </Txt>
          </View>
        </Row>
        <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: space.sm, paddingHorizontal: space.lg }}>
          {job?.steps.map((step, i) => {
            const look = STEP_LOOK[statuses[i]];
            return (
              <View
                key={i}
                accessible
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, borderBottomWidth: i < job.steps.length - 1 ? 1 : 0, borderBottomColor: colors.dividerLight, paddingVertical: space.xs }}
                accessibilityLabel={`${step.label}. ${t(`saving.status.${statuses[i]}`)}`}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt variant="smallStrong" color="white" style={{ fontFamily: fonts.bodyBold }}>
                    {look.glyph}
                  </Txt>
                </View>
                <Txt variant="body" color={look.color} style={{ flex: 1, fontFamily: statuses[i] === 'running' || statuses[i] === 'failed' ? fonts.bodySemi : fonts.body }}>
                  {step.label}
                </Txt>
              </View>
            );
          })}
        </View>
        {state?.failed ? (
          <VStack gap={space.md}>
            <Banner tone="error" title={t('saving.failedTitle')} message={state.failed} />
            <Button label={t('common.retry')} onPress={onRetry} />
            <Button label={t('common.close')} tone="secondary" size="md" onPress={onClose} />
          </VStack>
        ) : null}
        {finished ? (
          <VStack gap={space.md}>
            <View style={{ backgroundColor: colors.greenTint, borderWidth: 1, borderColor: colors.greenBorder, borderRadius: radii.xl, paddingVertical: space.cardY, paddingHorizontal: space.cardX, gap: space.xxs }} accessibilityLiveRegion="polite">
              <Txt variant="section" color="greenDark" style={{ fontFamily: fonts.bodyBold }}>
                {t('saving.savedTo', { center: center?.short_name || center?.name || '' })}
              </Txt>
              {state?.result ? (
                <Txt variant="meta" color="greenDark2">
                  {state.result}
                </Txt>
              ) : null}
            </View>
            <Button label={job.cta.label} onPress={onContinue} />
          </VStack>
        ) : null}
      </ScrollView>
    </Modal>
  );
}

/**
 * Prototype "Thank you" (L443). Shown only after a real, successful charge. A Pathshala fee is a payment, not a gift
 * (plan P13): "Fee paid", no tax receipt, and the member stays where they paid from.
 */
function ThankYou({ state, onClose }: { state: { amountCents: number; context: PaymentRequest['context'] } | null; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fee = state?.context === 'pathshala';
  const back = () => {
    onClose();
    if (!fee) router.navigate('/give');
  };
  return (
    <Modal visible={!!state} animationType="fade" onRequestClose={back}>
      <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top + 40, paddingHorizontal: space.gutter, alignItems: 'center', gap: space.lg }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
          <Txt color="green" style={{ fontFamily: fonts.bodyBold, fontSize: 44, lineHeight: 52 }}>
            ✓
          </Txt>
        </View>
        <Txt variant="display" center accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 34 }}>
          {fee ? t('paid.feeTitle') : t('paid.title')}
        </Txt>
        <Txt variant="body" color="ink2" center>
          {t(fee ? 'paid.feeBody' : 'paid.body', { amount: formatCents(state?.amountCents ?? 0, { alwaysCents: fee }) })}
        </Txt>
        <Button label={fee ? t('common.done') : t('paid.back')} tone="secondary" size="md" fill={false} style={{ paddingHorizontal: 28, minHeight: touch.secondary }} onPress={back} />
      </View>
    </Modal>
  );
}
