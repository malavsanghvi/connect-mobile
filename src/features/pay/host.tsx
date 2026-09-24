import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterMark } from '@/components/brand';
import { Banner, Button, Row, Txt, VStack } from '@/components/ui';
import { report } from '@/lib/errors';
import { formatCents } from '@/lib/format';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { cardCharger, registerPayHost, type PaymentOutcome, type PaymentRequest, type SavingJob, type SavingOutcome } from './controller';
import { runSteps, stepStatuses, type StepStatus } from './steps';

/** Prototype animates each step for 750ms; real steps are shown for at least this long so they can be read. */
const MIN_STEP_MS = 450;
/** Let the sheet finish sliding away before the next full-screen view opens (iOS stacks modals badly). */
const MODAL_GAP_MS = 350;

type SheetState = { req: PaymentRequest; resolve: (o: PaymentOutcome) => void; busy: boolean; error: string | null };
type SavingState = { job: SavingJob; resolve: (o: SavingOutcome) => void; done: number; failed: string | null; running: boolean; result: string | null };

/** Pay sheet, "Saving" and "Thank you" for the whole app. Mount once, inside the providers. */
export function PayHost() {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [saving, setSaving] = useState<SavingState | null>(null);
  const [paid, setPaid] = useState<{ amountCents: number } | null>(null);
  const savingRef = useRef<SavingState | null>(null);

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
            setSheet({ req, resolve, busy: false, error: null });
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

  const confirm = async () => {
    const charge = cardCharger();
    if (!sheet || !charge) return;
    setSheet({ ...sheet, busy: true, error: null });
    try {
      const res = await charge(sheet.req);
      const amountCents = sheet.req.amountCents;
      closeSheet({ status: 'paid', paymentId: res.paymentId });
      setTimeout(() => setPaid({ amountCents }), MODAL_GAP_MS);
    } catch (err) {
      setSheet((s) => (s ? { ...s, busy: false, error: report(err, 'take your payment').userMessage } : s));
    }
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
      <PaySheet state={sheet} onCancel={() => closeSheet({ status: sheet && !cardCharger() ? 'not_available' : 'cancelled' })} onAlternative={alternative} onConfirm={confirm} />
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

/** Prototype Pay sheet (L1559): Pay · Cancel; To / For / Card / Total; confirm. */
function PaySheet({ state, onCancel, onAlternative, onConfirm }: { state: SheetState | null; onCancel: () => void; onAlternative: () => void; onConfirm: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { center } = useApp();
  const charge = cardCharger();
  const req = state?.req;
  const saved = !!(req?.pledgeId || req?.pledgeIds?.length);
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
          <SheetRow label={t('pay.to')} value={center?.name ?? ''} />
          <SheetRow label={t('pay.for')} value={req?.forLabel ?? ''} />
          <SheetRow label={t('pay.card')} value={charge ? t('pay.cardOnFile') : t('pay.noCard')} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="headline" style={{ fontFamily: fonts.bodyBold, fontSize: 20 }}>
              {t('pay.total')}
            </Txt>
            <Txt variant="headline" style={{ fontFamily: fonts.bodyBold, fontSize: 20 }}>
              {formatCents(req?.amountCents ?? 0)}
            </Txt>
          </Row>
          {state?.error ? <Banner tone="error" message={state.error} /> : null}
          {charge ? (
            <Button label={t('pay.confirm')} tone="black" onPress={onConfirm} busy={state?.busy} />
          ) : (
            <>
              <View style={{ backgroundColor: colors.brownTint, borderColor: colors.brownBorder, borderWidth: 1, borderRadius: radii.card, padding: space.md, gap: space.xs }} accessibilityLiveRegion="polite">
                <Txt variant="smallStrong" color="brownDark">
                  {t('pay.title')}
                </Txt>
                <Txt variant="small" color="brownDark">
                  {saved ? t('pay.notSetUp') : t('pay.notSetUpNoPledge')}
                </Txt>
                <Txt variant="meta" color="brownText">
                  {t('pay.howToPay')}
                </Txt>
              </View>
              {req?.alternative ? <Button label={req.alternative.label} onPress={onAlternative} /> : null}
              <Button label={t('common.gotIt')} tone={req?.alternative ? 'secondary' : 'primary'} size={req?.alternative ? 'md' : 'cta'} onPress={onCancel} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
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

/** Prototype "Thank you" (L443). Shown only after a real, successful charge. */
function ThankYou({ state, onClose }: { state: { amountCents: number } | null; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const back = () => {
    onClose();
    router.navigate('/give');
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
          {t('paid.title')}
        </Txt>
        <Txt variant="body" color="ink2" center>
          {t('paid.body', { amount: formatCents(state?.amountCents ?? 0) })}
        </Txt>
        <Button label={t('paid.back')} tone="secondary" size="md" fill={false} style={{ paddingHorizontal: 28, minHeight: touch.secondary }} onPress={back} />
      </View>
    </Modal>
  );
}
