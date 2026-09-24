import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Checkbox, Row, Txt, VStack } from '@/components/ui';
import { AmountTile, AvailabilityBar, CheckRow, DollarField, slotsText, TileGrid } from '@/features/give/parts';
import { availabilityFraction, multiTotalCents, opportunityKind, parseOptions, presetAmounts, slotsLine, takenKeys, type Availability, type OpportunityOption } from '@/features/give/rules';
import { runSaving, startPayment, type SavingStep } from '@/features/pay';
import { createPledge, getOpportunity, opportunityAvailability, pledgeSourceFor, type OpportunityWithCampaign } from '@/lib/api/giving';
import { AppError, report } from '@/lib/errors';
import { formatCents, formatCentsCompact, parseAmountToCents } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/** Giving opportunity "Sponsor" (prototype Main.dc.html L400–441): tier, multi, amount, fixed and open kinds. */
export default function OpportunityScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useApp();
  const state = useLoad(
    async () => {
      const [opp, availability] = await Promise.all([getOpportunity(id), opportunityAvailability(id)]);
      return { opp, availability };
    },
    [id],
    'load this opportunity',
  );
  return (
    <Screen title={t('opp.title')}>
      {!member?.isAdult ? <LockedState /> : <Loaded state={state}>{({ opp, availability }) => <OpportunityBody opp={opp} availability={availability} />}</Loaded>}
    </Screen>
  );
}

type AmountChoice = { kind: 'preset'; cents: number } | { kind: 'other' };

function OpportunityBody({ opp, availability }: { opp: OpportunityWithCampaign; availability: Availability[] }) {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const { invalidate } = useDataVersion();
  const kind = opportunityKind(opp.kind);
  const options = parseOptions(opp.options);
  const presets = kind === 'amount' || kind === 'open' ? presetAmounts(opp) : [];
  const taken = takenKeys(availability);
  const min = opp.min_amount_cents ?? 0;

  const [tierKey, setTierKey] = useState<string | null>(options[0]?.key ?? null);
  const [picked, setPicked] = useState<string[]>([]);
  const [amountChoice, setAmountChoice] = useState<AmountChoice>(presets.length ? { kind: 'preset', cents: presets[0] } : { kind: 'other' });
  const [other, setOther] = useState('');
  const [showName, setShowName] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tier = kind === 'tier' ? (options.find((o) => o.key === tierKey) ?? null) : null;
  const otherCents = parseAmountToCents(other) ?? 0;
  const amount =
    kind === 'fixed'
      ? (opp.amount_cents ?? 0)
      : kind === 'tier'
        ? (tier?.amountCents ?? 0)
        : kind === 'multi'
          ? multiTotalCents(options, picked, taken)
          : amountChoice.kind === 'preset'
            ? amountChoice.cents
            : otherCents;
  const belowMin = (kind === 'amount' || kind === 'open') && min > 0 && amount > 0 && amount < min;
  const soldOut =
    opp.status !== 'open' ||
    (kind === 'multi' ? options.length > 0 && options.every((o) => taken.has(o.key)) : opp.quantity_available != null && (availability[0]?.slotsTaken ?? opp.quantity_taken) >= opp.quantity_available);
  const canAct = amount > 0 && !belowMin && !soldOut;
  const line = slotsLine(kind, availability, (opp.campaign?.goal_cents ?? 0) > 0);
  const fraction = availabilityFraction(availability) ?? 0;
  const multiPicked: OpportunityOption[] = options.filter((o) => picked.includes(o.key) && !taken.has(o.key));
  const detail = kind === 'tier' ? (tier ? t('opp.tierSponsor', { tier: tier.label }) : '') : kind === 'multi' ? multiPicked.map((o) => o.label).join(', ') : '';
  const invalidMessage = belowMin ? t('opp.minimum', { amount: formatCents(min) }) : kind === 'multi' ? t('opp.selectPujans') : t('opp.chooseAmount');

  const commit = () => {
    if (!member?.household || !center) return;
    if (!canAct) return setError(invalidMessage);
    setError(null);
    const household = member.household;
    // One pledge per multi item (each item is taken by one family); otherwise one pledge.
    const pieces: { amountCents: number; option: OpportunityOption | null }[] = kind === 'multi' ? multiPicked.map((o) => ({ amountCents: o.amountCents, option: o })) : [{ amountCents: amount, option: tier }];
    const numbers: string[] = [];
    const steps: SavingStep[] = [];
    if (kind === 'multi' || kind === 'tier' || opp.quantity_available != null) {
      steps.push({
        label: t('opp.stepCheck'),
        run: async () => {
          const fresh = await opportunityAvailability(opp.id);
          const nowTaken = takenKeys(fresh);
          const clash = pieces.find((p) => p.option && kind === 'multi' && nowTaken.has(p.option.key));
          if (clash?.option) throw new AppError(t('opp.justTaken', { name: clash.option.label }), `option ${clash.option.key} taken`);
          const head = fresh[0];
          if (kind !== 'multi' && opp.quantity_available != null && head && head.slotsTaken >= opp.quantity_available) throw new AppError(t('opp.soldOut'), 'quantity used up');
        },
      });
    }
    for (const p of pieces) {
      steps.push({
        label: t('opp.stepCreate', { amount: formatCents(p.amountCents), name: kind === 'multi' && p.option ? p.option.label : opp.name }),
        run: async () => {
          const pledge = await createPledge({
            centerId: center.id,
            householdId: household.id,
            personId: member.person.id,
            userId: member.userId,
            amountCents: p.amountCents,
            source: kind === 'multi' ? 'pujan' : pledgeSourceFor(opp.campaign),
            campaignId: opp.campaign_id,
            opportunityId: opp.id,
            fundId: opp.campaign?.fund_id ?? null,
            anonymous: !showName,
            recognitionName: showName ? household.display_name : null,
            opportunityOption: p.option?.key ?? null,
          });
          numbers.push(pledge.pledge_number ?? '');
          invalidate();
        },
      });
    }
    if (kind === 'tier' && tier) steps.push({ label: t('opp.stepRecording', { detail }) });
    runSaving({
      title: t('opp.savingTitle'),
      steps,
      result: () => t(numbers.length > 1 ? 'opp.savedResultMany' : 'opp.savedResult', { pledge: numbers.filter(Boolean).join(', '), amount: formatCents(amount) }),
      cta: { label: t('opp.seePledges'), onPress: () => router.replace('/pledges') },
    }).catch((err: unknown) => setError(report(err, 'save your pledge').userMessage));
  };

  const payNow = () => {
    if (!canAct) return setError(invalidMessage);
    setError(null);
    startPayment({
      amountCents: amount,
      forLabel: detail ? `${opp.name} · ${detail}` : opp.name,
      context: 'opportunity',
      alternative: { label: t('pay.pledgeInstead', { amount: formatCents(amount) }), run: commit },
    }).catch((err: unknown) => setError(report(err, 'open the payment sheet').userMessage));
  };

  return (
    <VStack gap={14}>
      <View style={{ minHeight: 120, borderRadius: radii.xxl, backgroundColor: colors.brown, justifyContent: 'flex-end', padding: space.lg }}>
        <Txt color="white" accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27 }}>
          {opp.name}
        </Txt>
      </View>
      {opp.description || opp.campaign?.description ? (
        <Txt variant="small" color="ink2" style={{ lineHeight: 22 }}>
          {opp.description ?? opp.campaign?.description}
        </Txt>
      ) : null}
      <Card>
        <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
          <Txt variant="smallStrong" style={{ flex: 1 }}>
            {slotsText(t, line)}
          </Txt>
          <Txt variant="small" color="muted">
            {t('opp.live')}
          </Txt>
        </Row>
        <AvailabilityBar fraction={fraction} height={8} label={slotsText(t, line)} />
      </Card>

      {soldOut ? (
        <Banner tone="info" message={t('opp.soldOut')} />
      ) : (
        <>
          {kind === 'fixed' ? (
            <Card tone="amber">
              <Txt variant="small" color="brownText">
                {t('opp.fixedAmount')}
              </Txt>
              <Txt variant="hero" color="brown">
                {formatCents(opp.amount_cents ?? 0)}
              </Txt>
            </Card>
          ) : null}

          {kind === 'tier' ? (
            <VStack gap={space.sm}>
              <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
                {t('opp.chooseLevel')}
              </Txt>
              <TileGrid columns={3}>
                {options.map((o) => (
                  <AmountTile key={o.key} label={o.label} sub={formatCents(o.amountCents)} selected={tierKey === o.key} onPress={() => setTierKey(o.key)} />
                ))}
              </TileGrid>
            </VStack>
          ) : null}

          {kind === 'amount' || kind === 'open' ? (
            <VStack gap={space.sm}>
              <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
                {t('opp.chooseAmount')}
              </Txt>
              {presets.length ? (
                <TileGrid columns={2}>
                  {[
                    ...presets.map((c) => <AmountTile key={c} big label={formatCentsCompact(c)} selected={amountChoice.kind === 'preset' && amountChoice.cents === c} onPress={() => setAmountChoice({ kind: 'preset', cents: c })} />),
                    <AmountTile key="other" big label={t('opp.other')} sub={t('opp.yourAmount')} selected={amountChoice.kind === 'other'} onPress={() => setAmountChoice({ kind: 'other' })} />,
                  ]}
                </TileGrid>
              ) : null}
              {amountChoice.kind === 'other' ? <DollarField label={t('opp.yourAmount')} value={other} onChangeText={setOther} error={belowMin ? t('opp.minimum', { amount: formatCents(min) }) : null} /> : null}
            </VStack>
          ) : null}

          {kind === 'multi' ? (
            <Card style={{ paddingVertical: 6, paddingHorizontal: 14, gap: 0 }}>
              <Txt variant="body" style={{ fontFamily: fonts.bodySemi, paddingTop: space.sm, paddingBottom: 4 }}>
                {t('opp.choosePujans')}
              </Txt>
              {options.map((o) => {
                const isTaken = taken.has(o.key);
                return (
                  <CheckRow
                    key={o.key}
                    label={o.label}
                    note={isTaken ? t('opp.takenByOther') : (o.note ?? (o.fixed ? t('opp.fixedBoli') : null))}
                    amountCents={o.amountCents}
                    checked={picked.includes(o.key)}
                    disabled={isTaken}
                    onToggle={() => setPicked(picked.includes(o.key) ? picked.filter((k) => k !== o.key) : [...picked, o.key])}
                  />
                );
              })}
              <Row style={{ justifyContent: 'space-between', paddingTop: space.md, paddingBottom: space.sm }}>
                <Txt variant="section" style={{ fontFamily: fonts.bodyBold }}>
                  {multiPicked.length === 0 ? t('opp.selectPujans') : multiPicked.length === 1 ? t('opp.pujanSelected') : t('opp.pujansSelected', { n: multiPicked.length })}
                </Txt>
                <Txt variant="section" color="brown" style={{ fontFamily: fonts.bodyBold }}>
                  {formatCents(amount)}
                </Txt>
              </Row>
            </Card>
          ) : null}

          <Checkbox label={t('opp.showName')} checked={showName} onChange={setShowName} disabled={!opp.allow_anonymous} />
          {error ? <Banner tone="error" message={error} /> : null}
          <Button label={t('opp.commit', { amount: formatCents(amount) })} onPress={commit} disabled={!canAct} />
          <Button label={t('opp.payNow', { amount: formatCents(amount) })} tone="outlineBlack" size="md" onPress={payNow} disabled={!canAct} />
          <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
            {t('opp.footnote')}
          </Txt>
        </>
      )}
    </VStack>
  );
}
