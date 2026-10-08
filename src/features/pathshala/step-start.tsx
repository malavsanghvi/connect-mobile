import { useRouter } from 'expo-router';

import { Banner, Button, Card, Chip, ChipGroup, Txt, VStack } from '@/components/ui';
import type { RegistrationTerm } from '@/lib/api/pathshala';
import { formatCents, formatLongDate } from '@/lib/format';
import { membershipState, startBlock, type RegistrationOptions } from '@/lib/pathshala-registration';
import { useModule } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

import { FactLine, StepHeader, whenText } from './shared';

/**
 * Step 0, "Before you start" (plan §3.1): which term (when there is more than one), which household (an adult of more
 * than one, P32), the window (open, late with its fee, closed, opens on a date), membership (P6: register now, seats
 * wait for it) and what registering does in this term's payment mode. A closed window or the database's own reason
 * stops here. Membership only matters while the community's Membership module is on: with it off nobody could ever be
 * let in, so the database does not hold anyone for it (0590 `pathshala_membership_hold_applies`).
 */
export function StartStep({
  options,
  terms,
  eyebrow,
  timeZone,
  onTerm,
  onHousehold,
}: {
  options: RegistrationOptions;
  terms: RegistrationTerm[];
  eyebrow: string;
  timeZone: string | null;
  onTerm: (id: string) => void;
  onHousehold: (id: string) => void;
}) {
  const t = useT();
  const router = useRouter();
  const { term, household, households } = options;
  const w = term.window;
  const block = startBlock(options);
  const membership = membershipState(household.membership);
  const membershipOn = useModule('membership');
  const membershipMatters = term.membershipRequired && membershipOn;

  const windowLine =
    w.state === 'late'
      ? w.lateUntil
        ? w.lateFeeCents > 0
          ? t('reg.start.late', { date: whenText(w.lateUntil, timeZone), fee: formatCents(w.lateFeeCents) })
          : t('reg.start.lateNoFee', { date: whenText(w.lateUntil, timeZone) })
        : t('reg.start.lateOpen', { fee: formatCents(w.lateFeeCents) })
      : w.state === 'open'
        ? w.closesAt
          ? t('reg.start.open', { date: whenText(w.closesAt, timeZone) })
          : t('reg.start.openNoEnd')
        : null;

  // The family rules of the term's fees (children only, P23): the sibling discount and the family cap.
  const cap = term.familyCapCents !== null ? formatCents(term.familyCapCents, { alwaysCents: true }) : null;
  const familyLine =
    term.siblingDiscountPct > 0 && cap
      ? t('reg.start.siblingCap', { pct: term.siblingDiscountPct, cap })
      : term.siblingDiscountPct > 0
        ? t('reg.start.sibling', { pct: term.siblingDiscountPct })
        : cap
          ? t('reg.start.cap', { cap })
          : null;

  const modeLine =
    term.paymentMode === 'pay_now'
      ? term.officePayment.allowed
        ? t('reg.start.payNowOffice', { hours: term.holdHours, days: term.officePayment.holdDays })
        : t('reg.start.payNow', { hours: term.holdHours })
      : t('reg.start.pledge');

  const blockText =
    block?.kind === 'closed'
      ? t('reg.start.closed', { term: term.name })
      : block?.kind === 'not_yet'
        ? block.opensAt
          ? t('reg.start.notYet', { term: term.name, date: whenText(block.opensAt, timeZone) })
          : t('reg.start.notYetNoDate', { term: term.name })
        : block?.kind === 'cannot'
          ? (block.reason ?? t('reg.start.cannot'))
          : null;

  return (
    <VStack gap={space.md}>
      <StepHeader eyebrow={eyebrow} title={t('reg.start.title')} />
      {terms.length > 1 ? (
        <VStack gap={space.xs}>
          <Txt variant="smallStrong">{t('reg.start.term')}</Txt>
          <ChipGroup>
            {terms.map((x) => (
              <Chip key={x.id} label={x.name} selected={x.id === term.id} onPress={() => onTerm(x.id)} />
            ))}
          </ChipGroup>
        </VStack>
      ) : (
        <Txt variant="bodyStrong">{`${t('reg.start.term')}: ${term.name}`}</Txt>
      )}
      {households.length > 1 ? (
        <VStack gap={space.xs}>
          <Txt variant="smallStrong">{t('reg.start.household')}</Txt>
          <ChipGroup>
            {households.map((h) => (
              <Chip key={h.id} label={[h.name, h.number].filter(Boolean).join(' · ')} selected={h.id === household.id} onPress={() => onHousehold(h.id)} />
            ))}
          </ChipGroup>
          <Txt variant="meta" color="muted">
            {t('reg.start.householdHint')}
          </Txt>
        </VStack>
      ) : null}
      <Card>
        {windowLine ? <FactLine text={windowLine} tone={w.state === 'late' ? 'brown' : 'green'} /> : null}
        {membershipMatters ? (
          <FactLine text={membership === 'member' ? t('reg.start.member') : membership === 'applying' ? t('reg.start.applying') : t('reg.start.notMember')} tone={membership === 'member' ? 'green' : 'brown'} />
        ) : null}
        <FactLine text={modeLine} />
        {familyLine ? <FactLine text={familyLine} /> : null}
        {term.seatRule === 'office' ? <FactLine text={t('reg.start.officeStep')} /> : null}
        {term.firstClassOn ? <FactLine text={t('reg.start.firstClass', { date: whenText(term.firstClassOn, timeZone) })} /> : null}
        {term.ageCutoffOn ? <FactLine text={t('reg.start.ages', { date: formatLongDate(term.ageCutoffOn) })} /> : null}
      </Card>
      {membershipMatters && membership === 'none' && !block ? <Button label={t('reg.start.applyCta')} tone="secondary" size="md" icon="ribbon-outline" onPress={() => router.push('/guide/apply')} /> : null}
      {blockText ? <Banner tone="warning" message={blockText} /> : null}
    </VStack>
  );
}
