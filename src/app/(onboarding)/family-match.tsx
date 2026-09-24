import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Loaded } from '@/components/states';
import { Avatar, Banner, Button, Card, LinkText, Pill, Row, TextField, Txt, VStack } from '@/components/ui';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { createMyHousehold, findMyFamily, linkAccount } from '@/lib/api/member';
import { logError, report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/** Onboarding step 2: "Is this your family?" (app.find_my_family → link_account | create_my_household). */
export default function FamilyMatchScreen() {
  const router = useRouter();
  const t = useT();
  const { center, session, member, refreshMember, signOut } = useApp();
  const candidates = useLoad(() => (center ? findMyFamily(center.id) : Promise.resolve([])), [center?.id, session?.user.id], 'look up your family');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startNew, setStartNew] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');

  const identity = session?.user.email ?? (session?.user.phone ? `+${session.user.phone.replace(/^\+/, '')}` : '');

  // Already linked (e.g. came back to this step): just continue.
  if (member) {
    return (
      <OnboardingFrame step={2} title={t('match.title')} footer={<Button label={t('common.continue')} onPress={() => router.push('/about')} />}>
        <Banner tone="success" message={t('match.alreadyLinked', { family: member.household?.display_name ?? '' })} />
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
              <Txt variant="body" color="ink2">
                {t('match.found', { identity, center: center?.name ?? '' })}
              </Txt>
              {rows.map((c) => (
                <Card key={`${c.person_id}-${c.household_id}`}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt variant="headline" color="navy">
                      {c.household_name}
                    </Txt>
                    {c.tier ? <Pill label={t(`tier.${c.tier}`).toUpperCase()} tone="amber" /> : null}
                  </Row>
                  {c.member_names.map((n) => (
                    <Row key={n} gap={space.md} style={{ paddingVertical: 4 }}>
                      <Avatar name={n} size={36} />
                      <Txt variant="bodyStrong">{n}</Txt>
                    </Row>
                  ))}
                  <Button label={t('match.yes')} onPress={() => link(c.person_id)} busy={busyId === c.person_id} disabled={busyId !== null && busyId !== c.person_id} />
                </Card>
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
