import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Markdownish } from '@/components/markdown';
import { Loaded } from '@/components/states';
import { Banner, Button, Card, Row, Txt, VStack } from '@/components/ui';
import { GuideScreen, guideFlagKey } from '@/features/guide-ui';
import type { Translate } from '@/i18n';
import { pickTranslation } from '@/i18n';
import { getGuideSection, listMembershipTypes, type MembershipType } from '@/lib/api/guide';
import { logError } from '@/lib/errors';
import { formatCents } from '@/lib/format';
import { readPref, writePref } from '@/lib/storage';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

function feeLabel(t: Translate, m: MembershipType): string {
  if (m.fee_cents <= 0) return m.tier === 'community' ? t('guide.memFree') : t('guide.memFeeTbd');
  const amount = formatCents(m.fee_cents);
  if (m.period_months == null) return t('guide.memOneTime', { amount });
  if (m.period_months === 12) return t('guide.memPerYear', { amount });
  return t('guide.memPerMonths', { amount, n: m.period_months });
}

/** What the type includes, from its rules (membership_types) — nothing invented. */
function whatLine(t: Translate, m: MembershipType): string {
  const parts: string[] = [];
  if (m.period_months == null && m.tier !== 'community') parts.push(t('guide.memLifetime'));
  parts.push(m.includes_spouse ? t('guide.memSpouse') : t('guide.memFamily'));
  if (m.period_months === 12) parts.push(t('guide.memRenew'));
  if (m.ec_approval_required) parts.push(t('guide.memEc'));
  if (m.reference_required) parts.push(t('guide.memReference'));
  if (m.voting_wait_days > 0) parts.push(t('guide.memVoting', { n: m.voting_wait_days }));
  return parts.join(' ');
}

/**
 * Membership (Welcome.dc.html secMembership): one card per membership type
 * with its fee, a "Good to know" panel (the center's "membership" guide
 * page) and "Become a member", which asks the membership team.
 */
export default function MembershipScreen() {
  const { t, language } = useSettings();
  const router = useRouter();
  const { center, member } = useApp();
  const flagKey = guideFlagKey(member?.person.id, 'membership');
  const state = useLoad(
    async () => {
      if (!center) return { types: [], page: null };
      const [types, page] = await Promise.all([listMembershipTypes(center.id), getGuideSection(center.id, 'membership')]);
      return { types, page };
    },
    [center?.id],
    'load membership types',
  );

  // Opening this page is the "Learn about membership" first step (remembered on this device).
  useEffect(() => {
    if (!flagKey) return;
    readPref<boolean>(flagKey, false)
      .then((seen) => (seen ? undefined : writePref(flagKey, true)))
      .catch((err: unknown) => logError('remembering that membership was read', err));
  }, [flagKey]);

  return (
    <GuideScreen title={t('guide.memTitle')}>
      <Loaded state={state}>
        {({ types, page }) => (
          <VStack gap={space.md}>
            {types.length === 0 ? <Banner tone="info" message={t('guide.memNone')} /> : null}
            {types.map((m) => (
              <Card key={m.id} style={{ gap: 6 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }} gap={space.sm}>
                  <Txt variant="section" style={{ fontFamily: fonts.bodyBold, flexShrink: 1 }}>
                    {m.name}
                  </Txt>
                  <Txt variant="section" color="brown" style={{ fontFamily: fonts.bodyBold }}>
                    {feeLabel(t, m)}
                  </Txt>
                </Row>
                <Txt variant="meta" color="ink2" style={{ lineHeight: 20 }}>
                  {whatLine(t, m)}
                </Txt>
              </Card>
            ))}
            {page ? (
              <View style={{ backgroundColor: colors.panel, borderRadius: radii.row, paddingVertical: 14, paddingHorizontal: space.lg, gap: 4 }}>
                <Txt variant="meta" color="ink2" style={{ fontFamily: fonts.bodyBold }}>
                  {t('guide.goodToKnow')}
                </Txt>
                <Markdownish source={pickTranslation({ title: page.title, body_md: page.body_md }, page.translations, language).body_md} />
              </View>
            ) : null}
            <Button label={t('guide.becomeMember')} onPress={() => router.push({ pathname: '/guide/ask', params: { topic: 'membership' } })} />
          </VStack>
        )}
      </Loaded>
    </GuideScreen>
  );
}
