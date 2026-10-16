import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/pickers';
import { Banner, Button, Chip, ChipGroup, Row, TextField, Txt, VStack } from '@/components/ui';
import { DollarField } from '@/features/give/parts';
import type { StringKey } from '@/i18n/en';
import { newProofAttempt, submitPaymentProof } from '@/lib/api/proofs';
import { report } from '@/lib/errors';
import { formatCents, formatDob, formatLongDate } from '@/lib/format';
import {
  MAX_PROOF_FILES,
  proofNeeded,
  referenceLabelKey,
  validateProofFiles,
  validateProofForm,
  type ProofField,
  type ProofProblem,
  type ProofValue,
  type SubmittedProof,
} from '@/lib/proofs';
import { previewProofAllocation, stillToPayCents, type AllocatablePledge } from '@/lib/rules';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { PickedFiles, proofMethodName } from './proof-parts';
import type { ProofSetup } from './proof-setup';
import { useProofFiles } from './use-proof-files';
import { centsToField } from './zelle-report';

/** A pledge the sheet can show by name: what it is for, its number, and what the preview needs to order and size it. */
export type ProofSheetPledge = AllocatablePledge & { title: string; number: string | null };

export type ProofSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The community's accepted ways and rules (useProofSetup). */
  setup: ProofSetup;
  centerId: string;
  householdId: string;
  /** The community's date today, 'YYYY-MM-DD'. */
  today: string;
  /** The family's pledges: the preview picks among them, oldest first, exactly as the database does. */
  pledges: ProofSheetPledge[];
  /** Where it was opened from: Open pledges, or an RSVP's checkout (the amount is then locked to its pledge). */
  entry: 'open_pledges' | 'rsvp';
  /** Open pledges: the pledges ticked on the screen. None = all of the family's open pledges. */
  initialPledgeIds?: string[];
  /** RSVP: the one pledge the proof is bound to. */
  lockedPledgeId?: string;
  /** RSVP: the RSVP's id. */
  entryRef?: string;
  /** RSVP: what the pledge is for, e.g. "P-0587 · Harvest supper". */
  forLabel?: string;
  /** The proof reached the database (the Sent screen is up). */
  onSent?: (sent: SubmittedProof) => void;
};

type Step = 'details' | 'proof' | 'review' | 'sent';

const STEP_NUMBER: Record<Exclude<Step, 'sent'>, number> = { details: 1, proof: 2, review: 3 };

/** "I paid another way": method, amount, date and reference → proof (photos from the gallery) → where it will go → sent. Adults only; callers hide it for a child. */
export function ProofSheet(props: ProofSheetProps) {
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      {/* The body is built fresh each time the sheet opens, so a new try never inherits an old form or an old confirmation key. */}
      {props.visible ? <SheetBody {...props} /> : null}
    </Modal>
  );
}

function SheetBody({ onClose, setup, centerId, householdId, today, pledges, entry, initialPledgeIds, lockedPledgeId, entryRef, forLabel, onSent }: ProofSheetProps) {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { invalidate } = useDataVersion();
  const chosen = lockedPledgeId ? [lockedPledgeId] : initialPledgeIds && initialPledgeIds.length > 0 ? initialPledgeIds : null;
  const coverable = stillToPayCents(pledges, chosen);
  const lockedCents = entry === 'rsvp' ? coverable : null;
  const year = Number(today.slice(0, 4));

  const [step, setStep] = useState<Step>('details');
  const [method, setMethod] = useState<string | null>(setup.methods[0] ?? null);
  const [amount, setAmount] = useState(centsToField(coverable));
  const [date, setDate] = useState(formatDob(today));
  const [reference, setReference] = useState('');
  const [problems, setProblems] = useState<Partial<Record<ProofField, ProofProblem>>>({});
  const [filesProblem, setFilesProblem] = useState<StringKey | null>(null);
  const [value, setValue] = useState<ProofValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SubmittedProof | null>(null);
  // One try at sending: the same proof folder and confirmation key through retries, so a lost answer never becomes two proofs.
  const [attempt] = useState(newProofAttempt);
  const busy = useRef(false);
  const { files, notice, pick, remove: removeFile } = useProofFiles(attempt, MAX_PROOF_FILES);

  const methodName = (m: string): string => proofMethodName(t, m);
  const problemText = (field: ProofField): string | null => {
    const p = problems[field];
    return p ? t(`proof.problem.${p}` as StringKey) : null;
  };

  const goProof = () => {
    const check = validateProofForm({ method, amount, date, reference }, { today, methods: setup.methods, lockedCents, coverableCents: coverable });
    if (!check.ok) {
      setProblems(check.problems);
      return;
    }
    setProblems({});
    setValue(check.value);
    setStep('proof');
  };

  const goReview = () => {
    const problem = validateProofFiles(files.length, value?.method ?? null, setup.policy);
    if (problem) {
      setFilesProblem(`proof.problem.${problem}` as StringKey);
      return;
    }
    setFilesProblem(null);
    setStep('review');
  };

  const send = async () => {
    if (busy.current || !value) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await submitPaymentProof({
        attempt,
        centerId,
        householdId,
        method: value.method,
        amountCents: value.amountCents,
        paidOn: value.paidOn,
        reference: value.reference,
        pledgeIds: chosen,
        entry,
        entryRef: entry === 'rsvp' ? (entryRef ?? null) : null,
        files,
      });
      // Only now: the database has answered with the proof.
      setSent(result);
      setStep('sent');
      invalidate();
      onSent?.(result);
    } catch (err) {
      setError(report(err, 'send your proof').userMessage);
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const preview = value ? previewProofAllocation(pledges, value.amountCents, chosen) : null;
  const pledgeById = new Map(pledges.map((p) => [p.id, p]));
  const fileCountText = files.length === 1 ? t('proof.fileCountOne') : t('proof.fileCount', { n: files.length });
  const refText = value?.reference ?? '';

  const titleKey: StringKey = step === 'proof' ? 'proof.stepProof' : step === 'review' ? 'proof.stepReview' : 'proof.title';

  return (
    <View style={{ flex: 1, backgroundColor: colors.scrimSheet, justifyContent: 'flex-end' }}>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={t('proof.close')} />
      <View accessibilityViewIsModal style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 24 + insets.bottom, gap: space.md }}>
        {step === 'sent' && sent ? (
          <SentView sent={sent} entry={entry} t={t} onClose={onClose} onFollow={() => {
            onClose();
            router.push('/payment-proofs');
          }} />
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between' }} align="flex-start">
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="eyebrow" color="muted">
                  {t('proof.stepOf', { n: STEP_NUMBER[step as Exclude<Step, 'sent'>] })}
                </Txt>
                <Txt variant="cardTitle" style={{ fontFamily: fonts.bodyBold }} accessibilityRole="header">
                  {t(titleKey)}
                </Txt>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('proof.close')}
                hitSlop={4}
                style={({ pressed }) => ({ backgroundColor: colors.chip, borderRadius: radii.xxl, minHeight: touch.min, minWidth: touch.min, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <Txt variant="subhead" color="ink2">
                  {'×'}
                </Txt>
              </Pressable>
            </Row>

            <ScrollView style={{ maxHeight: Math.max(260, height * 0.6) }} contentContainerStyle={{ gap: space.md, paddingBottom: space.xs }} keyboardShouldPersistTaps="handled">
              {step === 'details' ? (
                <>
                  <Txt variant="small" color="ink2">
                    {t('proof.intro')}
                  </Txt>
                  {forLabel ? (
                    <View style={{ backgroundColor: colors.panel, borderRadius: radii.lg, padding: space.md }}>
                      <Txt variant="smallStrong">{forLabel}</Txt>
                    </View>
                  ) : null}
                  {problemText('pledges') ? <Banner tone="error" message={problemText('pledges') ?? ''} /> : null}
                  {lockedCents !== null ? (
                    <View style={{ gap: 4 }}>
                      <Txt variant="meta" color="muted">
                        {t('proof.amountLockedLabel')}
                      </Txt>
                      <Txt variant="bodyStrong">{t('proof.amountLocked', { amount: formatCents(lockedCents) })}</Txt>
                    </View>
                  ) : (
                    <View style={{ gap: 4 }}>
                      <DollarField label={t('proof.amountLabel')} value={amount} onChangeText={setAmount} error={problemText('amount')} />
                      <Txt variant="meta" color="muted">
                        {chosen ? t('proof.amountHintChosen', { n: chosen.length, amount: formatCents(coverable) }) : t('proof.amountHint', { amount: formatCents(coverable) })}
                      </Txt>
                    </View>
                  )}
                  <View style={{ gap: space.xs }}>
                    <Txt variant="meta" color="muted">
                      {t('proof.methodLabel')}
                    </Txt>
                    <ChipGroup>
                      {setup.methods.map((m) => (
                        <Chip key={m} label={methodName(m)} selected={method === m} onPress={() => setMethod(m)} />
                      ))}
                    </ChipGroup>
                    {problemText('method') ? (
                      <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
                        {problemText('method')}
                      </Txt>
                    ) : null}
                  </View>
                  <DateField label={t('proof.dateLabel')} value={date} onChangeText={setDate} error={problemText('date')} minYear={year - 1} maxYear={year} />
                  <TextField
                    label={t(referenceLabelKey(method))}
                    error={problemText('reference')}
                    value={reference}
                    onChangeText={setReference}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={80}
                  />
                </>
              ) : null}

              {step === 'proof' ? (
                <>
                  <Txt variant="small" color="ink2">
                    {t('proof.proofIntro')}
                  </Txt>
                  <Button label={files.length === 0 ? t('proof.choosePhoto') : t('proof.chooseMore')} tone="secondary" size="md" disabled={files.length >= MAX_PROOF_FILES} onPress={() => {
                    setFilesProblem(null);
                    void pick();
                  }}
                  />
                  {notice ? <Banner tone="error" message={notice} action={{ label: t('common.retry'), onPress: () => void pick() }} /> : null}
                  <Txt variant="meta" color="muted" accessibilityLiveRegion="polite">
                    {fileCountText}
                  </Txt>
                  <PickedFiles files={files} onRemove={(f) => { removeFile(f); setFilesProblem(null); }} />
                  {files.length === 0 ? (
                    <Txt variant="meta" color={proofNeeded(setup.policy, value?.method ?? null) ? 'danger' : 'muted'}>
                      {proofNeeded(setup.policy, value?.method ?? null) ? t('proof.needed', { method: methodName(value?.method ?? '') }) : t('proof.optionalProof', { method: methodName(value?.method ?? '') })}
                    </Txt>
                  ) : null}
                  {filesProblem ? (
                    <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
                      {t(filesProblem)}
                    </Txt>
                  ) : null}
                </>
              ) : null}

              {step === 'review' && value && preview ? (
                <>
                  <View style={{ backgroundColor: colors.panel, borderRadius: radii.lg, padding: space.md, gap: 2 }}>
                    <Txt variant="bodyStrong">
                      {refText ? t('proof.summaryRef', { amount: formatCents(value.amountCents), method: methodName(value.method), reference: refText }) : t('proof.summary', { amount: formatCents(value.amountCents), method: methodName(value.method) })}
                    </Txt>
                    <Txt variant="meta" color="muted">
                      {t('proof.paidOn', { date: formatLongDate(value.paidOn), files: fileCountText })}
                    </Txt>
                  </View>
                  <View style={{ gap: space.xs }}>
                    <Txt variant="meta" color="muted">
                      {t('proof.whereTitle')}
                    </Txt>
                    {preview.lines.map((l) => {
                      const p = pledgeById.get(l.pledgeId);
                      return (
                        <Row key={l.pledgeId} style={{ justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: space.md }} align="flex-start" gap={space.md}>
                          <View style={{ flex: 1 }}>
                            <Txt variant="smallStrong">{p?.title ?? ''}</Txt>
                            <Txt variant="fine" color="faint">
                              {[p?.number, p ? formatLongDate(p.pledged_at.slice(0, 10)) : null].filter(Boolean).join(' · ')}
                            </Txt>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Txt variant="smallStrong">{t('proof.coverOf', { amount: formatCents(l.takeCents), total: formatCents(p?.amount_cents ?? l.takeCents) })}</Txt>
                            <Txt variant="fine" color={l.becomes === 'soft_credit' ? 'navy' : 'muted'}>
                              {l.becomes === 'soft_credit' ? t('proof.becomesSoft') : t('proof.stillToPay', { amount: formatCents(l.leftCents) })}
                            </Txt>
                          </View>
                        </Row>
                      );
                    })}
                  </View>
                  {preview.excessCents > 0 ? <Banner tone="info" message={t('proof.excess', { amount: formatCents(value.amountCents), used: formatCents(preview.creditedCents) })} /> : null}
                  <Txt variant="small" color="ink2">
                    {entry === 'rsvp' ? t('proof.rsvpNote') : t('proof.notPaid')}
                  </Txt>
                  {error ? <Banner tone="error" message={error} action={{ label: t('common.retry'), onPress: () => void send() }} /> : null}
                </>
              ) : null}
            </ScrollView>

            {step === 'details' ? <Button label={t('proof.next')} onPress={goProof} /> : null}
            {step === 'proof' ? (
              <Row gap={space.sm}>
                <View style={{ flex: 1 }}>
                  <Button label={t('proof.back')} tone="secondary" onPress={() => setStep('details')} />
                </View>
                <View style={{ flex: 2 }}>
                  <Button label={t('proof.nextReview')} onPress={goReview} />
                </View>
              </Row>
            ) : null}
            {step === 'review' ? (
              <Row gap={space.sm}>
                <View style={{ flex: 1 }}>
                  <Button label={t('proof.back')} tone="secondary" disabled={sending} onPress={() => setStep('proof')} />
                </View>
                <View style={{ flex: 2 }}>
                  <Button label={sending ? t('proof.sending') : entry === 'rsvp' ? t('proof.sendRsvp') : t('proof.send')} busy={sending} disabled={sending || !preview || preview.lines.length === 0} onPress={() => void send()} />
                </View>
              </Row>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function SentView({ sent, entry, t, onClose, onFollow }: { sent: SubmittedProof; entry: 'open_pledges' | 'rsvp'; t: ReturnType<typeof useT>; onClose: () => void; onFollow: () => void }) {
  const n = sent.proof.covered.length;
  const amount = formatCents(sent.proof.amountCents);
  return (
    <VStack gap={space.md}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
        <Txt variant="title" color="greenDark">
          {'✓'}
        </Txt>
      </View>
      <Txt variant="title" center accessibilityRole="header" accessibilityLiveRegion="polite">
        {t('proof.sentTitle')}
      </Txt>
      <Txt variant="small" color="ink2" center>
        {n === 1 ? t('proof.sentBodyOne', { amount }) : t('proof.sentBody', { amount, n })}
      </Txt>
      {(['proof.sentStep1', 'proof.sentStep2', 'proof.sentStep3'] as const).map((key, i) => (
        <Row key={key} gap={space.sm} align="flex-start">
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.navyTint, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="fine" color="navy" style={{ fontFamily: fonts.bodyBold }}>
              {String(i + 1)}
            </Txt>
          </View>
          <Txt variant="small" color="ink2" style={{ flex: 1 }}>
            {t(key)}
          </Txt>
        </Row>
      ))}
      {sent.lookalikes.length > 0 ? <Banner tone="info" message={t('proof.lookalike', { what: sent.lookalikes.map((l) => l.label).join('; ') })} /> : null}
      <Button label={t('proof.followProof')} tone="secondary" onPress={onFollow} />
      <Button label={entry === 'rsvp' ? t('proof.done') : t('proof.backToPledges')} onPress={onClose} />
    </VStack>
  );
}
