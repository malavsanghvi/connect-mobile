import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Row, Txt } from '@/components/ui';
import { roleLabel } from '@/features/labels';
import { listDisplayName, whenText } from '@/features/special-days';
import { listSpecialDays, loadEligibility } from '@/lib/api/family';
import { myApplication, myReferenceRequests } from '@/lib/api/membership';
import { applicationStatusKey } from '@/features/membership';
import { rememberedName } from '@/features/remembrance';
import { logError } from '@/lib/errors';
import { formatLongDate, fullName } from '@/lib/format';
import { ageOn, nextOccurrence } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useModule } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * Family tab (Main.dc.html isFamily, L454–482): household identifiers,
 * Special days preview, members with Profile and QR, voting eligibility,
 * the per-person preferences note, guide link and sign out.
 */
export default function FamilyScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center, setGuest, orgMemberLabel, orgHouseholdLabel, signOut, setOnboarding } = useApp();
  const { invalidate } = useDataVersion();
  const { confirm } = useFeedback();
  const membershipOn = useModule('membership');
  const refs = useLoad(() => (member && membershipOn ? myReferenceRequests() : Promise.resolve([])), [member?.person.id, membershipOn], 'load the reference requests');
  const application = useLoad(() => (member && center && membershipOn ? myApplication(center.id) : Promise.resolve(null)), [member?.person.id, center?.id, membershipOn], 'load your membership application');
  const days = useLoad(() => (member?.household ? listSpecialDays(member.household.id) : Promise.resolve([])), [member?.household?.id], 'load special days');
  const eligibility = useLoad(() => (member ? loadEligibility(member.person.id) : Promise.resolve(null)), [member?.person.id], 'load voting eligibility');
  const community = center?.short_name || center?.name || '';

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
  const ms = member.membership;
  const tierOne = ms && ms.status === 'active' ? t(`tierOne.${ms.tier}` as 'tierOne.life') : null;
  const upcomingDays = (days.data ?? [])
    .map((d) => ({ d, next: d.calendar_date ? nextOccurrence(d.calendar_date, member.today) : null }))
    .filter((x) => x.next)
    .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999'))
    .slice(0, 2);

  const doSignOut = async () => {
    const ok = await confirm({ title: t('settings.signOutTitle'), body: t('settings.signOutBody'), confirmLabel: t('settings.signOut') });
    if (ok) signOut().catch((err: unknown) => logError('signing out', err));
  };

  const pill = (label: string, onPress: () => void, filled: boolean, a11y: string) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.navy, backgroundColor: filled ? colors.navy : colors.card, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Txt variant="meta" color={filled ? 'white' : 'navy'} style={{ fontFamily: fonts.bodySemi }}>
        {label}
      </Txt>
    </Pressable>
  );

  return (
    <Screen title={t('tab.family')} root onRefresh={async () => invalidate()}>
      {/* Household identifiers stay visible (founder rule: IDs exactly as issued). */}
      {household ? (
        <View style={{ paddingHorizontal: 4, gap: 2 }}>
          <Txt variant="headline" accessibilityRole="header">
            {household.display_name}
          </Txt>
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }} selectable>
            {[member.orgHouseholdId ? `${orgHouseholdLabel} ${member.orgHouseholdId}` : null, household.household_number, ms ? (ms.status === 'active' ? t('family.memberSince', { date: formatLongDate(ms.starts_on) }) : t(`membership.${ms.status}` as 'membership.pending')) : t('family.noMembership')]
              .filter(Boolean)
              .join(' · ')}
          </Txt>
        </View>
      ) : null}

      {(refs.data ?? []).length > 0 ? (
        <Banner tone="info" message={t('refreq.card', { n: refs.data?.length ?? 0 })} action={{ label: t('refreq.title'), onPress: () => router.push('/reference-requests') }} />
      ) : null}
      {refs.error ? <Banner tone="error" message={refs.error.userMessage} action={{ label: t('common.retry'), onPress: () => void refs.reload() }} /> : null}
      {application.data && application.data.status !== 'approved' ? (
        <Pressable onPress={() => router.push('/guide/apply')} accessibilityRole="link">
          <Card tone="panel" style={{ gap: 4 }}>
            <Txt variant="smallStrong">{t('apply.inProgress', { type: application.data.type_name })}</Txt>
            <Txt variant="meta" color="ink2">
              {t(applicationStatusKey(application.data.status), { name: application.data.reference_name ?? '' })}
            </Txt>
          </Card>
        </Pressable>
      ) : null}
      {application.error ? <Banner tone="error" message={application.error.userMessage} action={{ label: t('common.retry'), onPress: () => void application.reload() }} /> : null}

      <Pressable
        onPress={() => router.push('/special-days')}
        accessibilityRole="button"
        accessibilityLabel={`${t('family.specialDays')}. ${t('family.seeAll')}`}
        style={({ pressed }) => ({ backgroundColor: colors.brownTint, borderWidth: 1, borderColor: colors.brownBorder, borderRadius: radii.xl, paddingVertical: 14, paddingHorizontal: space.lg, gap: space.sm, opacity: pressed ? 0.9 : 1 })}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="body" color="brownDark" style={{ fontFamily: fonts.bodyBold }}>
            {t('family.specialDays')}
          </Txt>
          <Txt variant="meta" color="brown" style={{ fontFamily: fonts.bodySemi }}>
            {t('family.seeAll')}
          </Txt>
        </Row>
        {days.data === undefined ? (
          days.error ? <ErrorState error={days.error} onRetry={() => void days.reload()} /> : <LoadingState />
        ) : upcomingDays.length === 0 ? (
          <Txt variant="meta" color="brownText">
            {t('family.noSpecialDays')}
          </Txt>
        ) : (
          upcomingDays.map(({ d, next }) => (
            <Row key={d.id} style={{ justifyContent: 'space-between' }} gap={space.sm}>
              <Txt variant="meta" style={{ flexShrink: 1 }}>
                {listDisplayName(t, d, member.members)}
              </Txt>
              <Txt variant="meta" color="brownText" style={{ fontFamily: fonts.bodySemi }}>
                {whenText(t, member.today, next)}
              </Txt>
            </Row>
          ))
        )}
      </Pressable>

      <Card style={{ paddingVertical: 6, gap: 0 }}>
        {member.members.map((fm) => {
          const age = ageOn(fm.person.date_of_birth, member.today);
          const id = fm.orgMemberId ? `${orgMemberLabel} ${fm.orgMemberId}` : fm.person.member_number;
          const tag = [roleLabel(t, fm.role), fm.isAdult ? tierOne : age != null ? String(age) : null, id].filter(Boolean).join(' · ');
          return (
            <Row key={fm.person.id} gap={space.md} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.navyTint2, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
                <Txt variant="bodyStrong" color="navy">
                  {fm.person.first_name.charAt(0).toUpperCase()}
                </Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="body" style={{ fontFamily: fonts.bodyMedium }}>
                  {fullName(fm.person)}
                </Txt>
                <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }} selectable>
                  {tag}
                </Txt>
              </View>
              {pill(t('family.profile'), () => router.push({ pathname: '/person/[id]', params: { id: fm.person.id } }), true, `${t('family.profile')}: ${fm.person.first_name}`)}
              {pill(t('family.qr'), () => router.push({ pathname: '/member-card', params: { person: fm.person.id } }), false, t('family.qrFor', { name: fm.person.first_name }))}
            </Row>
          );
        })}
        {member.remembered.length ? (
          <View testID="in-memory" style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider }} accessibilityRole="text">
            <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
              {t('family.inMemory', { names: member.remembered.map((m) => rememberedName(m.person)).join(', ') })}
            </Txt>
          </View>
        ) : null}
        {member.isAdult ? (
          <Pressable onPress={() => setOnboarding(true)} accessibilityRole="button" style={{ paddingVertical: 14 }}>
            <Txt variant="smallStrong" color="navy">
              {t('family.updateFamily')}
            </Txt>
          </Pressable>
        ) : null}
      </Card>

      {eligibility.data === undefined ? (
        eligibility.error ? <ErrorState error={eligibility.error} onRetry={() => void eligibility.reload()} /> : null
      ) : eligibility.data ? (
        <Card tone={eligibility.data.canVote ? 'green' : 'default'} style={{ gap: 6 }}>
          <Txt variant="body" color={eligibility.data.canVote ? 'greenDark' : 'ink'} style={{ fontFamily: fonts.bodySemi }}>
            {eligibility.data.canVote ? t('family.votingGood') : t('family.votingNot')}
          </Txt>
          {eligibility.data.reasons.map((r) => (
            <Txt key={r.label} variant="meta" color={r.ok === false ? 'danger' : 'greenDark2'}>
              {r.ok === false ? `✗ ${t('family.notMet')}: ${r.label}` : `✓ ${r.label}`}
            </Txt>
          ))}
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {t('family.votingAsOf', { date: formatLongDate(eligibility.data.computedAt.slice(0, 10)) })}
            {eligibility.data.overridden ? ` · ${t('family.votingOverride')}` : ''}
          </Txt>
        </Card>
      ) : (
        <Card tone="panel">
          <Txt variant="meta" color="muted">
            {t('family.votingUnknown')}
          </Txt>
        </Card>
      )}

      <View style={{ backgroundColor: colors.panel, borderRadius: radii.card, paddingVertical: space.md, paddingHorizontal: 14 }}>
        <Txt variant="meta" color="muted">
          {t('family.prefsNote')}
        </Txt>
      </View>
      <Pressable onPress={() => router.push('/guide')} accessibilityRole="link" style={{ padding: space.md, alignItems: 'center' }}>
        <Txt variant="smallStrong" color="navy">
          {t('family.guide', { center: community })}
        </Txt>
      </Pressable>
      {member.isAdult && household ? (
        <Pressable onPress={() => router.push('/preferences')} accessibilityRole="link" style={{ paddingVertical: 4, alignItems: 'center', minHeight: 44, justifyContent: 'center' }}>
          <Txt variant="meta" color="navy">
            {t('family.contactPrefs')}
          </Txt>
        </Pressable>
      ) : null}
      <Pressable onPress={() => void doSignOut()} accessibilityRole="button" style={{ padding: 4, alignItems: 'center', minHeight: 44, justifyContent: 'center' }}>
        <Txt variant="small" color="muted" style={{ fontFamily: fonts.bodyMedium }}>
          {t('settings.signOut')}
        </Txt>
      </Pressable>
    </Screen>
  );
}
