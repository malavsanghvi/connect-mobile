import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Loaded } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, LinkText, TextField, Txt, VStack } from '@/components/ui';
import { applicationStatusKey, applyableTypes } from '@/features/membership';
import { GuideIntro, GuideScreen, SignInFirst } from '@/features/guide-ui';
import { listMembershipTypes } from '@/lib/api/guide';
import { findReference, isOpenApplication, myApplication, submitApplication, type ReferenceMatch } from '@/lib/api/membership';
import { AppError, report } from '@/lib/errors';
import { formatCents } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { fonts, space } from '@/theme';

/**
 * Apply for membership: choose the type, name a reference by their email,
 * mobile or member number (an exact match, never a browse of members), say how
 * you know them, send. The reference confirms in their app; the center (and,
 * for Life, a second Executive Committee member) approves in the portal.
 */
export default function ApplyScreen() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const { center, member, refreshMember } = useApp();
  const { invalidate } = useDataVersion();
  const data = useLoad(
    async () => {
      if (!center || !member) return { types: [], current: null };
      const [types, current] = await Promise.all([listMembershipTypes(center.id), myApplication(center.id)]);
      return { types, current };
    },
    [center?.id, member?.person.id],
    'load membership types',
  );
  const [typeId, setTypeId] = useState<string | null>(params.type ?? null);
  const [contact, setContact] = useState('');
  const [matches, setMatches] = useState<ReferenceMatch[] | null>(null);
  const [reference, setReference] = useState<ReferenceMatch | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'find' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ type: string; reference: string | null } | null>(null);

  if (!member) {
    return (
      <GuideScreen title={t('apply.title')}>
        <GuideIntro>{t('apply.intro')}</GuideIntro>
        <SignInFirst />
      </GuideScreen>
    );
  }

  const heldTier = member.membership?.status === 'active' ? member.membership.tier : null;

  return (
    <GuideScreen title={t('apply.title')}>
      <Loaded state={data}>
        {({ types, current }) => {
          if (sent) {
            return (
              <Card tone="green" style={{ padding: space.lg, gap: 6 }}>
                <Txt variant="section" color="greenDark" style={{ fontFamily: fonts.bodyBold }} accessibilityRole="alert">
                  {t('apply.sentTitle')}
                </Txt>
                <Txt variant="small" color="greenDark2" style={{ lineHeight: 21 }}>
                  {sent.reference ? t('apply.sentRef', { type: sent.type, name: sent.reference }) : t('apply.sentNoRef', { type: sent.type })}
                </Txt>
                <View style={{ alignSelf: 'flex-start' }}>
                  <LinkText label={t('apply.backToMembership')} color="greenDark" onPress={() => router.replace('/guide/membership')} />
                </View>
              </Card>
            );
          }
          if (current && isOpenApplication(current.status)) {
            return (
              <Card tone="panel" style={{ gap: 6 }}>
                <Txt variant="section" style={{ fontFamily: fonts.bodyBold }}>
                  {t('apply.inProgress', { type: current.type_name })}
                </Txt>
                <Txt variant="small" color="ink2">
                  {t(applicationStatusKey(current.status), { name: current.reference_name ?? '' })}
                </Txt>
              </Card>
            );
          }
          const options = applyableTypes(types, heldTier);
          if (options.length === 0) return <Banner tone="info" message={heldTier ? t('apply.nothingHigher') : t('guide.memNone')} />;
          const chosen = options.find((o) => o.id === typeId) ?? options[0];
          const needsRef = chosen.reference_required;

          const find = async () => {
            if (!center) return;
            setBusy('find');
            setError(null);
            setReference(null);
            try {
              const rows = await findReference(center.id, chosen.id, contact);
              setMatches(rows);
              const eligible = rows.filter((r) => r.eligible);
              if (eligible.length === 1) setReference(eligible[0]);
            } catch (err) {
              setMatches(null);
              setError(report(err, 'look up your reference').userMessage);
            } finally {
              setBusy(null);
            }
          };

          const send = async () => {
            if (!center) return;
            setBusy('send');
            setError(null);
            try {
              if (needsRef && !reference) throw new AppError(t('apply.chooseReference'), 'no reference chosen');
              await submitApplication({ centerId: center.id, typeId: chosen.id, referenceId: needsRef ? (reference?.person_id ?? null) : null, note });
              setSent({ type: chosen.name, reference: needsRef ? (reference?.name ?? null) : null });
              invalidate();
              await refreshMember();
            } catch (err) {
              setError(report(err, 'send your application').userMessage);
            } finally {
              setBusy(null);
            }
          };

          return (
            <VStack gap={space.md}>
              <GuideIntro>{t('apply.intro')}</GuideIntro>
              <Txt variant="smallStrong">{t('apply.type')}</Txt>
              <ChipGroup>
                {options.map((o) => (
                  <Chip
                    key={o.id}
                    label={o.name}
                    selected={o.id === chosen.id}
                    onPress={() => {
                      setTypeId(o.id);
                      setMatches(null);
                      setReference(null);
                    }}
                  />
                ))}
              </ChipGroup>
              <Txt variant="meta" color="ink2">
                {chosen.fee_cents > 0 ? t('apply.fee', { amount: formatCents(chosen.fee_cents) }) : t('apply.noFee')}
              </Txt>
              {needsRef ? (
                <Card style={{ gap: space.sm }}>
                  <Txt variant="section">{t('apply.referenceTitle')}</Txt>
                  <Txt variant="meta" color="muted">
                    {chosen.reference_tier_min === 'life' ? t('apply.referenceLife') : t('apply.referenceYearly')}
                  </Txt>
                  <TextField
                    label={t('apply.referenceContact')}
                    value={contact}
                    onChangeText={(v) => {
                      setContact(v);
                      setMatches(null);
                      setReference(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Button label={t('apply.findReference')} tone="secondary" size="md" onPress={find} busy={busy === 'find'} disabled={contact.trim().length < 4} />
                  {matches && matches.length === 0 ? <Banner tone="warning" message={t('apply.noMatch')} /> : null}
                  {(matches ?? []).map((m) =>
                    m.eligible ? (
                      <Chip key={m.person_id} label={`${m.name}${m.household_label ? ` · ${m.household_label}` : ''}`} selected={reference?.person_id === m.person_id} onPress={() => setReference(m)} />
                    ) : (
                      <Banner key={m.person_id} tone="warning" title={m.name} message={m.problem ?? t('apply.notEligible')} />
                    ),
                  )}
                  <TextField label={t('apply.note')} value={note} onChangeText={setNote} placeholder={t('apply.notePlaceholder')} multiline />
                </Card>
              ) : null}
              {error ? <Banner tone="error" message={error} /> : null}
              <Button label={t('apply.send')} onPress={send} busy={busy === 'send'} disabled={busy !== null || (needsRef && !reference)} />
              <Txt variant="meta" color="muted">
                {chosen.fee_cents > 0 ? t('apply.feeHonest') : t('apply.afterSend')}
              </Txt>
            </VStack>
          );
        }}
      </Loaded>
    </GuideScreen>
  );
}
