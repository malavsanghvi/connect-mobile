import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Qr } from '@/components/qr';
import { Button, Chip, ChipGroup, IconButton, Row, Txt } from '@/components/ui';
import { roleLabel } from '@/features/labels';
import { fullName } from '@/lib/format';
import { ageOn, identifierLine } from '@/lib/rules';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, layout, radii, space } from '@/theme';

/**
 * Member card (prototype §2.24): one QR per family member.
 * The QR currently encodes the permanent Connect member number. Rotating,
 * signed, offline-verifiable tokens (30-second refresh) are a later edge
 * function; when it exists, fetch the token here instead of the raw number.
 */
export default function MemberCardScreen() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ person?: string }>();
  const { member, center, orgMemberLabel } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(params.person ?? null);
  if (!member) return null;
  const fm = member.members.find((m) => m.person.id === (selectedId ?? member.person.id)) ?? member.members[0];
  const age = ageOn(fm.person.date_of_birth, member.today);
  const ids = identifierLine({ orgLabel: orgMemberLabel, orgId: fm.orgMemberId, connectNumber: fm.person.member_number });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.md, paddingTop: space.sm }}>
        <View style={{ width: 44 }} />
        <Txt variant="title" color="navy" accessibilityRole="header">
          {t('card.title')}
        </Txt>
        <IconButton icon="close" label={t('common.close')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.lg }}>
        <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', gap: space.lg }}>
          <View style={{ backgroundColor: colors.navy, borderRadius: radii.sheet, padding: space.xl, gap: space.md }}>
            <Txt variant="eyebrow" color="onNavy">
              {center?.name ?? ''}
            </Txt>
            <Txt variant="display" color="white">
              {fullName(fm.person)}
            </Txt>
            <Txt variant="small" color="onNavy">
              {[roleLabel(t, fm.role), age != null ? t('family.age', { age }) : null, member.membership?.status === 'active' ? t(`tier.${member.membership.tier}`) : null].filter(Boolean).join(' · ')}
            </Txt>
            {ids ? (
              <Txt variant="smallStrong" color="white" selectable>
                {ids}
              </Txt>
            ) : null}
            {fm.person.member_number ? (
              <Qr value={fm.person.member_number} size={200} label={t('card.qrLabel', { name: fullName(fm.person) })} />
            ) : (
              <Txt variant="small" color="onNavy">
                {t('card.noNumber')}
              </Txt>
            )}
            <Txt variant="caption" color="onNavy" center>
              {t('card.qrNote')}
            </Txt>
          </View>
          {member.members.length > 1 ? (
            <ChipGroup>
              {member.members.map((m) => (
                <Chip key={m.person.id} label={m.person.preferred_name || m.person.first_name} selected={m.person.id === fm.person.id} onPress={() => setSelectedId(m.person.id)} />
              ))}
            </ChipGroup>
          ) : null}
          <Button label={t('card.wallet')} tone="secondary" disabled icon="wallet-outline" onPress={() => {}} accessibilityHint={t('card.walletHint')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
