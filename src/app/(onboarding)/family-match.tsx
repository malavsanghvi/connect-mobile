import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Loaded } from '@/components/states';
import { Banner, Button, Card, LinkText, Row, TextField, Txt, VStack } from '@/components/ui';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { createMyHousehold, findMyFamily, linkAccount } from '@/lib/api/member';
import { logError, report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/** Onboarding step 2: "Is this your family?" (app.find_my_family → link_account | create_my_household). */
export default function FamilyMatchScreen() {
  const router = useRouter();
  const t = useT();
  const { center, session, member, refreshMember, signOut, setOnboarding } = useApp();
  const candidates = useLoad(() => (center ? findMyFamily(center.id) : Promise.resolve([])), [center?.id, session?.user.id], 'look up your family');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startNew, setStartNew] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');

  const identity = session?.user.email ?? (session?.user.phone ? `+${session.user.phone.replace(/^\+/, '')}` : '');

  // Already linked (e.g. "Update family profile" from the Family tab): show the family as on record.
  if (member) {
    const tier = member.membership?.status === 'active' ? member.membership.tier : null;
    return (
      <OnboardingFrame step={2} title={t('match.title')} onBack={() => setOnboarding(false)}>
        <VStack gap={space.lg}>
          <FamilyCard
            name={member.household?.display_name ?? ''}
            tier={tier ? t(`tier.${tier}`).toUpperCase() : null}
            people={member.members.map((m) => ({ key: m.person.id, name: `${m.person.first_name} ${m.person.last_name}`.trim(), rel: t(`role.${m.role}`) }))}
          />
          <Button label={t('match.yes')} onPress={() => router.push('/about')} />
        </VStack>
      </OnboardingFrame>
    );
  }

  const link = async (personId: string) => {
    if (!center) return;
    setBusyId(personId);
    setError(null);
    try {
      await linkAccount(center.id, personId);
      await refreshMember();
      router.push('/about');
    } catch (err) {
      setError(report(err, 'link your account').userMessage);
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    if (!center) return;
    if (!first.trim() || !last.trim()) return setError(t('match.nameRequired'));
    setBusyId('new');
    setError(null);
    try {
      await createMyHousehold(center.id, first.trim(), last.trim());
      await refreshMember();
      router.push('/about');
    } catch (err) {
      setError(report(err, 'start your family profile').userMessage);
    } finally {
      setBusyId(null);
    }
  };

  const newForm = (
    <Card>
      <Txt variant="section">{t('match.newTitle')}</Txt>
      <Txt variant="meta" color="muted">
        {t('match.newBody')}
      </Txt>
      <TextField label={t('profile.firstName')} value={first} onChangeText={setFirst} autoComplete="given-name" />
      <TextField label={t('profile.lastName')} value={last} onChangeText={setLast} autoComplete="family-name" />
      <Button label={t('match.startNew')} onPress={create} busy={busyId === 'new'} />
    </Card>
  );

  return (
    <OnboardingFrame step={2} title={t('match.title')} onBack={() => signOut().catch((err: unknown) => logError('signing out from family match', err))}>
      {error ? <Banner tone="error" message={error} /> : null}
      <Loaded state={candidates} loadingLabel={t('match.looking')}>
        {(rows) =>
          rows.length === 0 ? (
            <VStack>
              <Txt variant="body" color="ink2">
                {t('match.none', { identity, center: center?.name ?? '' })}
              </Txt>
              {newForm}
            </VStack>
          ) : (
            <VStack>
              <Txt variant="small" color="muted">
                {t('match.found', { identity: session?.user.email ? t('match.yourEmail') : t('match.yourMobile'), center: center?.short_name || center?.name || '' })}
              </Txt>
              {rows.map((c) => (
                <VStack key={`${c.person_id}-${c.household_id}`} gap={space.lg}>
                  <FamilyCard name={c.household_name} tier={c.tier ? t(`tier.${c.tier}`).toUpperCase() : null} people={c.member_names.map((n) => ({ key: n, name: n, rel: null }))} />
                  <Button label={t('match.yes')} onPress={() => link(c.person_id)} busy={busyId === c.person_id} disabled={busyId !== null && busyId !== c.person_id} />
                </VStack>
              ))}
              {startNew ? newForm : (
                <View style={{ alignItems: 'center' }}>
                  <LinkText label={t('match.notMine')} onPress={() => setStartNew(true)} />
                </View>
              )}
              <Txt variant="meta" color="muted">
                {t('match.officeHelp')}
              </Txt>
            </VStack>
          )
        }
      </Loaded>
    </OnboardingFrame>
  );
}

/** Onboarding.dc.html s2 card: household in Fraunces 22 ink, tier in green caps, one row per person (with relationship when known). */
function FamilyCard({ name, tier, people }: { name: string; tier: string | null; people: { key: string; name: string; rel: string | null }[] }) {
  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xxl, padding: space.lg, gap: 10 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }} gap={space.sm}>
        <Txt variant="title" style={{ fontFamily: fonts.display, flexShrink: 1 }}>
          {name}
        </Txt>
        {tier ? (
          <Txt variant="caption" color="green" style={{ fontFamily: fonts.bodySemi }}>
            {tier}
          </Txt>
        ) : null}
      </Row>
      {people.map((p) => (
        <Row key={p.key} gap={space.md} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.divider }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.navyTint2, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
            <Txt variant="bodyStrong" color="navy">
              {p.name.charAt(0).toUpperCase()}
            </Txt>
          </View>
          <View>
            <Txt variant="body" style={{ fontFamily: fonts.bodyMedium }}>
              {p.name}
            </Txt>
            {p.rel ? (
              <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                {p.rel}
              </Txt>
            ) : null}
          </View>
        </Row>
      ))}
    </View>
  );
}
