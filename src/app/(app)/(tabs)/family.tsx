import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { Avatar, Banner, Button, Card, IconButton, LinkText, Pill, Row, SectionTitle, Txt } from '@/components/ui';
import { roleLabel } from '@/features/labels';
import { listDisplayName } from '@/features/special-days';
import { listSpecialDays, loadEligibility } from '@/lib/api/family';
import { logError } from '@/lib/errors';
import { formatDay, formatLongDate, fullName } from '@/lib/format';
import { ageOn, identifierLine, nextOccurrence } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

/** Family (prototype §2.20): identifiers, members, special days, voting eligibility, membership. */
export default function FamilyScreen() {
  const t = useT();
  const router = useRouter();
  const { member, setGuest, orgMemberLabel, orgHouseholdLabel, signOut } = useApp();
  const { invalidate } = useDataVersion();
  const { confirm } = useFeedback();
  const days = useLoad(() => (member?.household ? listSpecialDays(member.household.id) : Promise.resolve([])), [member?.household?.id], 'load special days');
  const eligibility = useLoad(() => (member ? loadEligibility(member.person.id) : Promise.resolve(null)), [member?.person.id], 'load voting eligibility');

  if (!member) {
    return (
      <Screen title={t('tab.family')} root>
        <Card tone="panel">
          <Txt variant="small">{t('family.signIn')}</Txt>
          <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
        </Card>
      </Screen>
    );
  }

  const household = member.household;
  const householdLine = [
    household?.display_name,
    member.orgHouseholdId ? `${orgHouseholdLabel} ${member.orgHouseholdId}` : null,
    household?.household_number ? `Connect ${household.household_number}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const ms = member.membership;
  const upcomingDays = (days.data ?? [])
    .map((d) => ({ d, next: d.calendar_date ? nextOccurrence(d.calendar_date, member.today) : null }))
    .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999'))
    .slice(0, 2);

  const doSignOut = async () => {
    const ok = await confirm({ title: t('settings.signOutTitle'), body: t('settings.signOutBody'), confirmLabel: t('settings.signOut') });
    if (ok) signOut().catch((err: unknown) => logError('signing out', err));
  };

  return (
    <Screen title={t('tab.family')} root onRefresh={async () => invalidate()}>
      <Card tone="navy">
        <Txt variant="headline" color="white" accessibilityRole="header">
          {household?.display_name ?? fullName(member.person)}
        </Txt>
        <Txt variant="small" color="onNavy" selectable>
          {householdLine}
        </Txt>
        {ms ? (
          <Row gap={space.sm}>
            <Pill label={t(`tier.${ms.tier}`)} tone={ms.status === 'active' ? 'green' : 'amber'} />
            <Txt variant="caption" color="onNavy">
              {ms.status === 'active' ? t('family.memberSince', { date: formatLongDate(ms.starts_on) }) : t(`membership.${ms.status}` as 'membership.pending')}
              {ms.ends_on ? ` · ${t('family.until', { date: formatLongDate(ms.ends_on) })}` : ''}
            </Txt>
          </Row>
        ) : (
          <Txt variant="caption" color="onNavy">
            {t('family.noMembership')}
          </Txt>
        )}
      </Card>

      <Card tone="amber" onPress={() => router.push('/special-days')} accessibilityLabel={t('family.specialDays')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="cardTitle" color="brownDark">
            {t('family.specialDays')}
          </Txt>
          <Icon name="chevron-forward" size={18} color={colors.brown} />
        </Row>
        {days.data === undefined ? (
          days.error ? <ErrorState error={days.error} onRetry={() => void days.reload()} /> : <LoadingState />
        ) : upcomingDays.length === 0 ? (
          <Txt variant="small" color="brownText">
            {t('family.noSpecialDays')}
          </Txt>
        ) : (
          upcomingDays.map(({ d, next }) => (
            <Txt key={d.id} variant="small" color="brownText">
              {`${listDisplayName(t, d, member.members)}${next ? ` — ${formatDay(next)}` : d.tithi ? ` — ${d.tithi_month ?? ''} ${d.tithi}` : ''}`}
            </Txt>
          ))
        )}
      </Card>

      <SectionTitle>{t('family.members')}</SectionTitle>
      <Card>
        {member.members.map((fm) => {
          const age = ageOn(fm.person.date_of_birth, member.today);
          const ids = identifierLine({ orgLabel: orgMemberLabel, orgId: fm.orgMemberId, connectNumber: fm.person.member_number });
          return (
            <Row key={fm.person.id} gap={space.md} style={{ paddingVertical: space.sm }}>
              <Avatar name={fm.person.first_name} tone={fm.isAdult ? 'navy' : 'purple'} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong">{fullName(fm.person)}</Txt>
                <Txt variant="meta" color="muted">
                  {[roleLabel(t, fm.role), age != null ? t('family.age', { age }) : null].filter(Boolean).join(' · ')}
                </Txt>
                {ids ? (
                  <Txt variant="caption" color="muted" selectable>
                    {ids}
                  </Txt>
                ) : null}
              </View>
              <Button label={t('family.profile')} tone="secondary" size="sm" fill={false} onPress={() => router.push({ pathname: '/person/[id]', params: { id: fm.person.id } })} />
              <IconButton icon="qr-code-outline" label={t('family.qrFor', { name: fm.person.first_name })} onPress={() => router.push({ pathname: '/member-card', params: { person: fm.person.id } })} />
            </Row>
          );
        })}
        {member.isAdult ? <LinkText label={t('family.updateFamily')} onPress={() => router.push('/family-review')} /> : null}
      </Card>

      {eligibility.data === undefined ? (
        eligibility.error ? <ErrorState error={eligibility.error} onRetry={() => void eligibility.reload()} /> : null
      ) : eligibility.data ? (
        <Card tone={eligibility.data.canVote ? 'green' : 'default'}>
          <Txt variant="cardTitle" color={eligibility.data.canVote ? 'greenDark' : 'ink'}>
            {eligibility.data.canVote ? t('family.votingGood') : t('family.votingNot')}
          </Txt>
          {eligibility.data.reasons.map((r) => (
            <Row key={r.label} gap={space.sm} align="flex-start">
              <Icon name={r.ok === false ? 'close-circle' : 'checkmark-circle'} size={18} color={r.ok === false ? colors.danger : colors.green} />
              <Txt variant="small" style={{ flex: 1 }}>
                {r.ok === false ? `${t('family.notMet')}: ${r.label}` : r.label}
              </Txt>
            </Row>
          ))}
          <Txt variant="caption" color="muted">
            {t('family.votingAsOf', { date: formatLongDate(eligibility.data.computedAt.slice(0, 10)) })}
            {eligibility.data.overridden ? ` · ${t('family.votingOverride')}` : ''}
          </Txt>
        </Card>
      ) : (
        <Banner tone="info" message={t('family.votingUnknown')} />
      )}

      <Txt variant="meta" color="muted">
        {t('family.prefsNote')}
      </Txt>
      <Card>
        <LinkText label={t('family.contactPrefs')} onPress={() => router.push('/preferences')} />
        <LinkText label={t('family.guide')} onPress={() => router.push('/guide')} />
        <LinkText label={t('settings.signOut')} onPress={doSignOut} color="danger" />
      </Card>
    </Screen>
  );
}
