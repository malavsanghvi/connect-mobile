import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { Band, Screen } from '@/components/screen';
import { Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, ProgressBar, TextField, Toggle, Txt, VStack } from '@/components/ui';
import { createPledge, getOpportunity, pledgeSourceFor, type OpportunityWithCampaign } from '@/lib/api/giving';
import { report } from '@/lib/errors';
import { formatCents, parseAmountToCents } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

/** Giving opportunity (prototype §2.12): commit as a pledge; "Pay now" is honest about payments. */
export default function OpportunityScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useApp();
  const state = useLoad(() => getOpportunity(id), [id], 'load this opportunity');
  return (
    <Screen title={t('opp.title')}>
      {!member?.isAdult ? <LockedState /> : <Loaded state={state}>{(o) => <OpportunityBody opp={o} />}</Loaded>}
    </Screen>
  );
}

const SUGGESTED = [10100, 25100, 50100, 100100];

function OpportunityBody({ opp }: { opp: OpportunityWithCampaign }) {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const { toast, payNotice } = useFeedback();
  const { invalidate } = useDataVersion();
  const fixed = opp.amount_cents;
  const min = opp.min_amount_cents ?? 0;
  const suggestions = SUGGESTED.filter((c) => c >= min).slice(0, 3);
  const [choice, setChoice] = useState<number | 'other'>(fixed ?? suggestions[0] ?? 'other');
  const [other, setOther] = useState('');
  const [showName, setShowName] = useState(true);
  const [dedication, setDedication] = useState('');
  const [busy, setBusy] = useState<'pledge' | 'pay' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const soldOut = opp.status !== 'open' || (opp.quantity_available != null && opp.quantity_taken >= opp.quantity_available);

  const amount = fixed ?? (choice === 'other' ? (parseAmountToCents(other) ?? 0) : choice);
  const belowMin = !fixed && min > 0 && amount > 0 && amount < min;

  const commit = async (andPay: boolean) => {
    if (!member?.household || !center) return;
    if (amount <= 0) return setError(t('opp.chooseAmount'));
    if (belowMin) return setError(t('opp.minimum', { amount: formatCents(min) }));
    setBusy(andPay ? 'pay' : 'pledge');
    setError(null);
    try {
      const pledge = await createPledge({
        centerId: center.id,
        householdId: member.household.id,
        personId: member.person.id,
        userId: member.userId,
        amountCents: amount,
        source: pledgeSourceFor(opp.campaign),
        campaignId: opp.campaign_id,
        opportunityId: opp.id,
        fundId: opp.campaign?.fund_id ?? null,
        dedication: dedication.trim() || opp.name,
        anonymous: !showName,
        recognitionName: showName ? member.household.display_name : null,
      });
      invalidate();
      toast(t('opp.pledged', { amount: formatCents(amount), pledge: pledge.pledge_number ?? '' }));
      if (andPay) payNotice({ amountLabel: formatCents(amount) });
      router.replace('/pledges');
    } catch (err) {
      setError(report(err, 'save your pledge').userMessage);
    } finally {
      setBusy(null);
    }
  };

  return (
    <VStack gap={space.lg}>
      <Band color={colors.brown} eyebrow={opp.campaign?.name ?? undefined} title={opp.name} />
      {opp.description || opp.campaign?.description ? (
        <Txt variant="body" color="ink2">
          {opp.description ?? opp.campaign?.description}
        </Txt>
      ) : null}
      {opp.quantity_available != null ? (
        <Card>
          <Txt variant="smallStrong">{t('give.taken', { taken: opp.quantity_taken, total: opp.quantity_available })}</Txt>
          <ProgressBar value={opp.quantity_taken / opp.quantity_available} color={colors.saffron} label={t('give.taken', { taken: opp.quantity_taken, total: opp.quantity_available })} />
          <Txt variant="caption" color="muted">
            {t('opp.availabilityNote')}
          </Txt>
        </Card>
      ) : null}
      {soldOut ? (
        <Banner tone="info" message={t('opp.soldOut')} />
      ) : (
        <>
          {fixed ? (
            <Card tone="amber">
              <Txt variant="small" color="brownText">
                {t('opp.fixedAmount')}
              </Txt>
              <Txt variant="hero" color="brown">
                {formatCents(fixed)}
              </Txt>
            </Card>
          ) : (
            <Card>
              <Txt variant="section">{t('opp.chooseAmount')}</Txt>
              <ChipGroup>
                {suggestions.map((c) => (
                  <Chip key={c} label={formatCents(c)} selected={choice === c} onPress={() => setChoice(c)} tone="brown" />
                ))}
                <Chip label={t('events.other')} selected={choice === 'other'} onPress={() => setChoice('other')} tone="brown" />
              </ChipGroup>
              {choice === 'other' ? <TextField label={t('events.yourAmount')} value={other} onChangeText={setOther} keyboardType="decimal-pad" error={belowMin ? t('opp.minimum', { amount: formatCents(min) }) : null} /> : null}
              {min > 0 ? (
                <Txt variant="meta" color="muted">
                  {t('opp.minimum', { amount: formatCents(min) })}
                </Txt>
              ) : null}
            </Card>
          )}
          <TextField label={t('opp.dedication')} value={dedication} onChangeText={setDedication} placeholder={t('opp.dedicationPlaceholder')} />
          {opp.allow_anonymous ? <Toggle label={t('opp.showName')} value={showName} onChange={setShowName} /> : null}
          {error ? <Banner tone="error" message={error} /> : null}
          <Button label={t('opp.commit', { amount: formatCents(amount) })} tone="brown" onPress={() => commit(false)} busy={busy === 'pledge'} disabled={amount <= 0 || belowMin || busy !== null} />
          <Button label={t('opp.payNow', { amount: formatCents(amount) })} tone="secondary" onPress={() => commit(true)} busy={busy === 'pay'} disabled={amount <= 0 || belowMin || busy !== null} />
          <Txt variant="meta" color="muted">
            {t('opp.footnote')}
          </Txt>
        </>
      )}
    </VStack>
  );
}
