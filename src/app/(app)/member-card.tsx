import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Qr } from '@/components/qr';
import { Screen } from '@/components/screen';
import { Button, Txt } from '@/components/ui';
import { roleLabel } from '@/features/labels';
import { fullName } from '@/lib/format';
import { ageOn } from '@/lib/rules';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, tracking } from '@/theme';

/**
 * Member card (Main.dc.html isCard, L1297–1317): centred navy card with the
 * community name, the person, a navy QR on a white panel, then first-name
 * pills. The QR encodes the permanent member number (works offline). The
 * prototype's 30-second rotating code needs a signed-token function on the
 * server that does not exist yet, so the card does not claim rotation.
 */
export default function MemberCardScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ person?: string }>();
  const { member, center, orgMemberLabel } = useApp();
  const { toast } = useFeedback();
  const [selectedId, setSelectedId] = useState<string | null>(params.person ?? null);
  if (!member) return null;
  const fm = member.members.find((m) => m.person.id === (selectedId ?? member.person.id)) ?? member.members[0];
  const age = ageOn(fm.person.date_of_birth, member.today);
  const tierOne = member.membership?.status === 'active' ? t(`tierOne.${member.membership.tier}` as 'tierOne.life') : null;
  const id = fm.orgMemberId ? `${orgMemberLabel} ${fm.orgMemberId}` : fm.person.member_number;
  const tag = [roleLabel(t, fm.role), fm.isAdult ? tierOne : age != null ? String(age) : null, id].filter(Boolean).join(' · ');

  return (
    <Screen title={t('card.title')} niva={false}>
      <View style={{ backgroundColor: colors.navy, borderRadius: radii.sheet, paddingVertical: 22, paddingHorizontal: space.gutter, alignItems: 'center', gap: 14 }}>
        <Txt variant="caption" color="onNavy" center style={{ fontFamily: fonts.body, letterSpacing: tracking.eyebrow * 1.3, textTransform: 'uppercase' }}>
          {center?.name ?? ''}
        </Txt>
        <Txt variant="display" color="white" center style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 30 }} accessibilityRole="header">
          {fullName(fm.person)}
        </Txt>
        <Txt variant="meta" color="onNavy" center selectable>
          {tag}
        </Txt>
        {fm.person.member_number ? (
          <Qr value={fm.person.member_number} size={189} color={colors.navy} radius={radii.row} padding={14} label={t('card.qrLabel', { name: fullName(fm.person) })} />
        ) : (
          <Txt variant="small" color="onNavy" center>
            {t('card.noNumber')}
          </Txt>
        )}
        <Txt variant="caption" color="onNavy" center style={{ fontFamily: fonts.body }}>
          {t('card.qrNote')}
        </Txt>
      </View>
      {member.members.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm }}>
          {member.members.map((m) => {
            const on = m.person.id === fm.person.id;
            return (
              <Pressable
                key={m.person.id}
                onPress={() => setSelectedId(m.person.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: radii.xxl, borderWidth: 1, borderColor: on ? colors.navy : colors.borderInput, backgroundColor: on ? colors.navy : colors.card, justifyContent: 'center' }}>
                <Txt variant="small" color={on ? 'white' : 'ink'} style={{ fontFamily: fonts.bodyMedium }}>
                  {m.person.preferred_name || m.person.first_name}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Button label={t('card.wallet')} tone="black" onPress={() => toast(t('card.walletHint'), 'info')} />
    </Screen>
  );
}
