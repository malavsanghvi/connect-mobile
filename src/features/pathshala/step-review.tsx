import { LoadingState } from '@/components/states';
import { Banner, Card, Pill, Row, Toggle, Txt, VStack } from '@/components/ui';
import type { StringKey } from '@/i18n/en';
import {
  chargedNow,
  FEE_ASSISTANCE_OFFERED,
  isAdultLine,
  lineLevel,
  lineNames,
  lineParts,
  outcomeKey,
  payNowCents,
  type RegistrationOptions,
  type RegistrationResult,
  type ReviewPart,
  type Selection,
} from '@/lib/pathshala-registration';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

import { AmountRow, money, StepHeader, whenText } from './shared';

const PART_LABEL: Record<ReviewPart['key'], StringKey> = {
  levelFee: 'reg.review.levelFee',
  sibling: 'reg.review.sibling',
  cap: 'reg.review.cap',
  late: 'reg.review.late',
  assistance: 'reg.review.assistance',
};

/** "$130.00", "−$13.00", "+$25.00". */
function signed(p: ReviewPart): string {
  if (p.key === 'levelFee') return money(p.cents);
  return p.cents < 0 ? `−${money(-p.cents)}` : `+${money(p.cents)}`;
}

/** The preview: `refused` when the database said no in its own words (trying again would not change it). */
export type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; refused: boolean }
  | { status: 'ready'; result: RegistrationResult; learners: Record<string, unknown>[]; clientKey: string };

/**
 * Step 3, "Review the fee" (plan §3.1): one line per learner and track exactly as the database priced it (level fee,
 * sibling discount, family cap, late fee, fee assistance, the line's total; a "not sure" line is priced when the office
 * places them), what happens to each line, the children's and the adults' totals and the family total; then what
 * registering does (added to the pledges, or paid now with the seats held), the withdrawal rule, and "Ask about fee
 * assistance". Nothing is worked out here. A refusal is the database's own sentence, as it comes.
 */
export function ReviewStep({
  options,
  preview,
  selections,
  notice,
  assistance,
  eyebrow,
  timeZone,
  onAssistance,
}: {
  options: RegistrationOptions;
  preview: PreviewState;
  selections: Selection[];
  /** The database's sentence when a registration was sent back here ("The fee changed since you looked; …"). */
  notice: string | null;
  assistance: boolean;
  eyebrow: string;
  timeZone: string | null;
  onAssistance: (on: boolean) => void;
}) {
  const t = useT();
  return (
    <VStack gap={space.md}>
      <StepHeader eyebrow={eyebrow} title={t('reg.review.title')} />
      {notice ? <Banner tone="warning" title={t('reg.review.changed')} message={notice} /> : null}
      {preview.status === 'loading' || preview.status === 'idle' ? <LoadingState label={t('reg.review.loading')} /> : null}
      {preview.status === 'error' ? <Banner tone="error" title={preview.refused ? t('reg.review.cannotTitle') : undefined} message={preview.message} /> : null}
      {/* The request can always be taken back, so a refusal that came with it never leaves the family stuck here. */}
      {FEE_ASSISTANCE_OFFERED && preview.status === 'error' && assistance ? <Toggle label={t('reg.review.assistanceAsk')} sub={t('reg.review.assistanceSub')} value={assistance} onChange={onAssistance} /> : null}
      {preview.status === 'ready' ? <ReviewLines options={options} result={preview.result} selections={selections} assistance={assistance} timeZone={timeZone} onAssistance={onAssistance} /> : null}
    </VStack>
  );
}

function ReviewLines({
  options,
  result,
  selections,
  assistance,
  timeZone,
  onAssistance,
}: {
  options: RegistrationOptions;
  result: RegistrationResult;
  selections: Selection[];
  assistance: boolean;
  timeZone: string | null;
  onAssistance: (on: boolean) => void;
}) {
  const t = useT();
  const { term } = options;
  const mode = term.paymentMode;
  const names = lineNames(result, options.learners, selections);
  const charged = chargedNow(result);
  const payNow = payNowCents(result);
  const anyFee = result.lines.some((l) => l.baseFeeCents > 0 || l.totalCents > 0);
  const modeText =
    mode === 'pay_now'
      ? payNow > 0
        ? t('reg.review.payNow', { amount: money(payNow), hours: term.holdHours })
        : t('reg.review.nothingNow')
      : charged.count > 1
        ? t('reg.review.pledges', { amount: money(charged.cents), n: charged.count })
        : charged.count === 1
          ? t('reg.review.pledgesOne', { amount: money(charged.cents) })
          : t('reg.review.nothingBilled');
  return (
    <VStack gap={space.md}>
      {result.lines.map((line, i) => {
        const name = names[i];
        const { track, level } = lineLevel(line, options.tracks);
        const adult = isAdultLine(line, options.learners);
        const charges = line.outcome === 'seat';
        return (
          <Card key={`${line.personId ?? 'new'}:${line.trackId}:${i}`}>
            <Row style={{ justifyContent: 'space-between' }} align="flex-start">
              <Txt variant="bodyStrong" style={{ flex: 1 }}>
                {[name, level ?? track].filter(Boolean).join(' · ')}
              </Txt>
              {adult ? <Pill label={t('reg.review.adultPill')} tone="navy" /> : null}
            </Row>
            {line.priced ? (
              <>
                {lineParts(line).map((p) => (
                  <AmountRow key={p.key} label={t(PART_LABEL[p.key])} value={signed(p)} />
                ))}
                <AmountRow label={t('reg.review.lineTotal')} value={money(line.totalCents)} strong />
              </>
            ) : (
              <Txt variant="small" color="ink2">
                {t('reg.review.unpriced', { name })}
              </Txt>
            )}
            <Txt variant="meta" color={charges ? 'greenDark' : 'brown'}>
              {[t(outcomeKey(line, mode), { name }), mode === 'pay_now' && !charges ? t('reg.review.nothingToPay') : null].filter(Boolean).join(' · ')}
            </Txt>
            {adult ? (
              <Txt variant="fine" color="muted">
                {t('reg.review.adult')}
              </Txt>
            ) : null}
          </Card>
        );
      })}
      <Card tone="panel">
        {result.childrenTotalCents > 0 && result.adultsTotalCents > 0 ? (
          <>
            <AmountRow label={t('reg.review.children')} value={money(result.childrenTotalCents)} />
            <AmountRow label={t('reg.review.adults')} value={money(result.adultsTotalCents)} />
          </>
        ) : null}
        <AmountRow label={t('reg.review.family')} value={money(result.totalCents)} strong />
      </Card>
      <Card tone={mode === 'pay_now' && payNow > 0 ? 'amber' : 'default'}>
        <Txt variant="small" color="ink">
          {modeText}
        </Txt>
        {result.late ? (
          <Txt variant="small" color="ink2">
            {t('reg.review.lateNote')}
          </Txt>
        ) : null}
        {assistance ? (
          <Txt variant="small" color="ink2">
            {t('reg.review.assistanceWaits')}
          </Txt>
        ) : null}
        {term.withdrawalCreditUntil ? (
          <Txt variant="meta" color="muted">
            {t('reg.review.withdraw', { date: whenText(term.withdrawalCreditUntil, timeZone) })}
          </Txt>
        ) : null}
      </Card>
      {FEE_ASSISTANCE_OFFERED && anyFee ? <Toggle label={t('reg.review.assistanceAsk')} sub={t('reg.review.assistanceSub')} value={assistance} onChange={onAssistance} /> : null}
    </VStack>
  );
}
