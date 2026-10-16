import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Row, TextField, Txt, VStack } from '@/components/ui';
import { PickedFiles, ProofFileButtons, ProofFiles, ProofStatusPill, proofMethodName, Timeline } from '@/features/pay/proof-parts';
import { useProofFiles } from '@/features/pay/use-proof-files';
import { answerProofQuestion, loadProofPolicy, myPaymentProofs, newProofAttempt, proofReceipts, withdrawPaymentProof } from '@/lib/api/proofs';
import { report } from '@/lib/errors';
import { formatCents, formatLongDate } from '@/lib/format';
import { canWithdraw, DEFAULT_POLICY, MAX_PROOF_FILES, newestProofFirst, type PaymentProof, type ProofPolicy, type TimelineTone } from '@/lib/proofs';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

type Data = { proofs: PaymentProof[]; policy: ProofPolicy; receipts: Map<string, string> };

/**
 * My payment proofs (docs/PAYMENT_PROOFS_AND_RECONCILIATION_PLAN.md §4.1): every proof the family sent, with where it stands.
 * Open one to see its files and what has happened, to take it back while it is waiting, or to answer the treasury team.
 * Adults only. A proof is never called paid here until the treasury team has said so.
 */
export default function PaymentProofsScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ proof?: string }>();
  const { member, center } = useApp();
  const [openId, setOpenId] = useState<string | null>(typeof params.proof === 'string' && params.proof ? params.proof : null);
  const state = useLoad<Data | null>(
    async () => {
      if (!member?.household || !member.isAdult || !center) return null;
      const [proofs, policy] = await Promise.all([myPaymentProofs(center.id, member.household.id), loadProofPolicy(center.id)]);
      const receipts = await proofReceipts(proofs.flatMap((p) => (p.paymentId ? [p.paymentId] : [])));
      return { proofs: newestProofFirst(proofs), policy: policy ?? DEFAULT_POLICY, receipts };
    },
    [member?.household?.id, member?.isAdult ?? false, center?.id],
    'load your payment proofs',
  );

  if (!member?.isAdult) {
    return (
      <Screen title={t('proofs.title')}>
        <LockedState />
      </Screen>
    );
  }
  return (
    <Screen title={t('proofs.title')}>
      <Loaded state={state}>
        {(data) => {
          if (!data) return <EmptyState icon="people-outline" title={t('give.noHousehold')} />;
          const open = openId ? data.proofs.find((p) => p.id === openId) : undefined;
          if (open) return <ProofDetail proof={open} policy={data.policy} receipt={open.paymentId ? (data.receipts.get(open.paymentId) ?? null) : null} onBack={() => setOpenId(null)} />;
          if (openId && data.proofs.length > 0) return <EmptyState icon="receipt-outline" title={t('proofs.notFound')} action={{ label: t('proofs.title'), onPress: () => setOpenId(null) }} />;
          return <ProofList proofs={data.proofs} receipts={data.receipts} onOpen={setOpenId} />;
        }}
      </Loaded>
    </Screen>
  );
}

function titleOf(t: ReturnType<typeof useT>, p: PaymentProof): string {
  const method = proofMethodName(t, p.method);
  return p.reference ? t('proofs.cardTitleRef', { amount: formatCents(p.amountCents), method, reference: p.reference }) : t('proofs.cardTitle', { amount: formatCents(p.amountCents), method });
}

function textOf(t: ReturnType<typeof useT>, p: PaymentProof, receipt: string | null): string {
  switch (p.status) {
    case 'submitted':
      return t('proofs.textSubmitted');
    case 'needs_info':
      return t('proofs.textNeeds');
    case 'rejected':
      return t('proofs.textRejected');
    case 'withdrawn':
      return t('proofs.textWithdrawn');
    default:
      return receipt ? t('proofs.textApproved', { receipt }) : t('proofs.textApprovedNoReceipt');
  }
}

function ProofList({ proofs, receipts, onOpen }: { proofs: PaymentProof[]; receipts: Map<string, string>; onOpen: (id: string) => void }) {
  const t = useT();
  if (proofs.length === 0) return <EmptyState icon="receipt-outline" title={t('proofs.none')} body={t('proofs.noneBody')} />;
  return (
    <VStack gap={space.md}>
      {proofs.map((p) => (
        <Card key={p.id} onPress={() => onOpen(p.id)} accessibilityLabel={`${titleOf(t, p)}. ${t('proofs.sentOn', { date: formatLongDate(p.createdAt.slice(0, 10)) })}`} style={{ gap: space.xs }}>
          <Row style={{ justifyContent: 'space-between' }} align="flex-start" gap={space.md}>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{titleOf(t, p)}</Txt>
              <Txt variant="meta" color="muted">
                {t('proofs.sentOn', { date: formatLongDate(p.createdAt.slice(0, 10)) })}
              </Txt>
            </View>
            <ProofStatusPill status={p.status} />
          </Row>
          <Txt variant="small" color="ink2">
            {textOf(t, p, p.paymentId ? (receipts.get(p.paymentId) ?? null) : null)}
          </Txt>
          <Txt variant="smallStrong" color="navy">
            {p.status === 'needs_info' ? t('proofs.answer') : t('proofs.seeDetails')}
          </Txt>
        </Card>
      ))}
    </VStack>
  );
}

function ProofDetail({ proof, policy, receipt, onBack }: { proof: PaymentProof; policy: ProofPolicy; receipt: string | null; onBack: () => void }) {
  const t = useT();
  const { center } = useApp();
  const { invalidate } = useDataVersion();
  const { toast, confirm } = useFeedback();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'withdraw' | 'reply' | null>(null);
  const [message, setMessage] = useState('');
  // One try at the reply: its own confirmation, kept through retries (files already up are not uploaded again).
  const [attempt, setAttempt] = useState(newProofAttempt);
  const kept = proof.files.filter((f) => !f.removed);
  const room = MAX_PROOF_FILES - kept.length;
  const picker = useProofFiles(attempt, Math.max(0, room));
  const timeline = proof.events.map((e) => ({ at: e.createdAt, text: e.body, tone: (e.kind === 'approved' ? 'green' : e.kind === 'rejected' || e.kind === 'withdrawn' ? 'grey' : e.kind === 'question' ? 'amber' : 'navy') as TimelineTone }));

  const banner = (() => {
    switch (proof.status) {
      case 'submitted':
        return { tone: 'navy' as const, title: t('proofs.waitingTitle'), body: t('proofs.waitingBody') };
      case 'needs_info':
        return { tone: 'amber' as const, title: t('proofs.needsTitle'), body: proof.question ?? '' };
      case 'rejected':
        return { tone: 'grey' as const, title: t('proofs.rejectedTitle'), body: [proof.decisionReason ? t('proofs.reason', { reason: proof.decisionReason }) : null, t('proofs.rejectedBody')].filter(Boolean).join(' ') };
      case 'withdrawn':
        return { tone: 'grey' as const, title: t('proofs.withdrawnTitle'), body: t('proofs.withdrawnBody') };
      default:
        return { tone: 'green' as const, title: t('proofs.approvedTitle'), body: receipt ? t('proofs.approvedBody', { receipt }) : t('proofs.approvedBodyNoReceipt') };
    }
  })();
  const bannerBg = banner.tone === 'navy' ? colors.navyTint : banner.tone === 'amber' ? colors.warningTint : banner.tone === 'green' ? colors.greenTint : colors.chip;

  const withdraw = async () => {
    const ok = await confirm({ title: t('proofs.withdrawAsk'), body: t('proofs.withdrawBody'), confirmLabel: t('proofs.withdrawYes'), cancelLabel: t('proofs.withdrawKeep'), tone: 'danger' });
    if (!ok) return;
    setBusy('withdraw');
    setError(null);
    try {
      await withdrawPaymentProof(proof.id);
      toast(t('proofs.withdrawn'));
      invalidate();
    } catch (err) {
      setError(report(err, 'take your proof back').userMessage);
      // Decided in the meantime? Read the proofs again, so the screen shows where it really stands.
      invalidate();
    } finally {
      setBusy(null);
    }
  };

  const reply = async () => {
    if (!center) return;
    setBusy('reply');
    setError(null);
    try {
      await answerProofQuestion({ proof, centerId: center.id, message, files: picker.files, attempt });
      toast(t('proofs.replySent'));
      setMessage('');
      picker.clear();
      setAttempt(newProofAttempt());
      invalidate();
    } catch (err) {
      setError(report(err, 'send your reply').userMessage);
    } finally {
      setBusy(null);
    }
  };

  return (
    <VStack gap={space.lg}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="section" accessibilityRole="header">
          {t('proofs.detailTitle', { amount: formatCents(proof.amountCents) })}
        </Txt>
        <ProofStatusPill status={proof.status} />
      </Row>
      <View style={{ backgroundColor: bannerBg, borderRadius: radii.card, padding: space.md, gap: 2 }} accessibilityLiveRegion="polite">
        <Txt variant="smallStrong">{banner.title}</Txt>
        {banner.body ? (
          <Txt variant="small" color="ink2">
            {proof.status === 'needs_info' ? `“${banner.body}”` : banner.body}
          </Txt>
        ) : null}
      </View>

      <Card style={{ gap: space.sm }}>
        <Txt variant="bodyStrong">{t('proofs.paidLine', { method: proofMethodName(t, proof.method), reference: proof.reference ? ` ${proof.reference}` : '', date: formatLongDate(proof.paidOn) })}</Txt>
        <Txt variant="meta" color="muted">
          {t('proofs.sentBy', { date: formatLongDate(proof.createdAt.slice(0, 10)) })}
        </Txt>
        {proof.isTest ? <Txt variant="meta" color="muted">{t('proofs.test')}</Txt> : null}
        <Txt variant="eyebrow" color="muted">
          {t('proofs.filesTitle')}
        </Txt>
        {kept.length > 0 ? <ProofFiles files={kept} /> : (
          <Txt variant="small" color="muted">
            {proof.files.length > 0 ? t('proofs.fileRemoved') : t('proofs.noFiles')}
          </Txt>
        )}
      </Card>

      {proof.covered.length > 0 ? (
        <VStack gap={space.sm}>
          <Txt variant="eyebrow" color="muted" accessibilityRole="header">
            {t('proofs.coversTitle')}
          </Txt>
          {proof.covered.map((c) => (
            <Row key={c.pledgeId} style={{ justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: space.md }} gap={space.md}>
              <Txt variant="smallStrong" style={{ flex: 1 }}>
                {[c.title, c.pledgeNumber].filter(Boolean).join(' · ') || t('proofs.pledgeNoNumber')}
              </Txt>
              <Txt variant="smallStrong">{t('proofs.coverLine', { amount: formatCents(c.amountCents), total: formatCents(c.pledgeAmountCents) })}</Txt>
            </Row>
          ))}
          {proof.excessCents > 0 ? (
            <Txt variant="meta" color="muted">
              {t('proofs.excessLine', { amount: formatCents(proof.excessCents) })}
            </Txt>
          ) : null}
        </VStack>
      ) : null}

      {proof.events.length > 0 ? (
        <VStack gap={space.sm}>
          <Txt variant="eyebrow" color="muted" accessibilityRole="header">
            {t('proofs.timeline')}
          </Txt>
          <Timeline entries={timeline} />
        </VStack>
      ) : null}

      {proof.status === 'needs_info' ? (
        <VStack gap={space.md}>
          <TextField label={t('proofs.replyLabel')} value={message} onChangeText={setMessage} maxLength={500} multiline />
          {room > 0 ? <ProofFileButtons picker={picker} room={room} /> : null}
          <PickedFiles files={picker.files} onRemove={picker.remove} />
          <Button label={busy === 'reply' ? t('proofs.replySending') : t('proofs.replySend')} busy={busy === 'reply'} disabled={busy !== null} onPress={() => void reply()} />
          <Txt variant="meta" color="muted">
            {t('proofs.replyNote', { days: policy.replyWaitDays })}
          </Txt>
        </VStack>
      ) : null}

      {error ? <Banner tone="error" message={error} /> : null}

      {canWithdraw(proof.status) ? (
        <VStack gap={space.xs}>
          <Button label={t('proofs.withdraw')} tone="outlineDanger" busy={busy === 'withdraw'} disabled={busy !== null} onPress={() => void withdraw()} />
          <Txt variant="meta" color="muted" center style={{ fontFamily: fonts.body }}>
            {t('proofs.withdrawHint')}
          </Txt>
        </VStack>
      ) : null}
      <Button label={t('proofs.title')} tone="ghost" size="md" onPress={onBack} />
    </VStack>
  );
}
