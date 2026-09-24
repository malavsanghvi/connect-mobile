import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { EmptyState, Loaded } from '@/components/states';
import { Banner, Txt, VStack } from '@/components/ui';
import { GuideFootnote, GuideIntro, GuideScreen, SignInFirst, useCommunity } from '@/features/guide-ui';
import { listWhatsAppGroups, requestWhatsAppJoin, type WhatsAppGroup } from '@/lib/api/guide';
import { report } from '@/lib/errors';
import { formatPhone } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

/**
 * WhatsApp groups (Welcome.dc.html secWhatsapp): request to join →
 * whatsapp_join_requests (an admin adds the number). Zone groups collapse
 * into one "Your zone group" row; without a zone it sends the member to
 * Your zone first.
 */
export default function WhatsAppScreen() {
  const t = useT();
  const community = useCommunity();
  const router = useRouter();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useLoad(() => (center && member ? listWhatsAppGroups(center.id, member.person.id) : Promise.resolve([])), [center?.id, member?.person.id], 'load WhatsApp groups');
  const phone = member?.person.phone_e164 ?? null;
  const zoneId = member?.household?.zone_id ?? null;

  const request = async (groupId: string) => {
    if (!center || !member) return;
    setBusy(groupId);
    setError(null);
    try {
      await requestWhatsAppJoin(center.id, groupId, member.person.id, phone);
      invalidate();
      toast(t('guide.waRequested'));
    } catch (err) {
      setError(report(err, 'send your request to join').userMessage);
    } finally {
      setBusy(null);
    }
  };

  return (
    <GuideScreen title={t('guide.waTitle')}>
      <GuideIntro>{t('guide.waIntro', { center: community })}</GuideIntro>
      {!member ? (
        <SignInFirst />
      ) : (
        <>
          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            {phone ? (
              <>
                <Txt variant="meta" color="muted">
                  {t('guide.waAdding')}
                </Txt>
                <Txt variant="meta" style={{ fontFamily: fonts.bodySemi }}>
                  {formatPhone(phone)}
                </Txt>
                <Txt variant="meta" color="muted">
                  {' · '}
                </Txt>
              </>
            ) : (
              <Txt variant="meta" color="muted">
                {`${t('guide.waNoPhone')} `}
              </Txt>
            )}
            <Pressable onPress={() => router.push({ pathname: '/person/[id]', params: { id: member.person.id } })} accessibilityRole="link" hitSlop={12}>
              <Txt variant="meta" color="navy" style={{ textDecorationLine: 'underline' }}>
                {t('guide.waChange')}
              </Txt>
            </Pressable>
          </View>
          {error ? <Banner tone="error" message={error} /> : null}
          <Loaded state={state}>
            {(groups) => {
              if (groups.length === 0) return <EmptyState icon="logo-whatsapp" title={t('guide.waNone')} />;
              const general = groups.filter((g) => !g.zone_id);
              const myZoneGroup = zoneId ? (groups.find((g) => g.zone_id === zoneId) ?? null) : null;
              const hasZoneGroups = groups.some((g) => g.zone_id);
              return (
                <VStack gap={space.md}>
                  {general.map((g) => (
                    <GroupRow key={g.id} name={g.name} sub={g.description} group={g} busy={busy === g.id} disabled={!phone} onRequest={() => request(g.id)} />
                  ))}
                  {hasZoneGroups ? (
                    myZoneGroup ? (
                      <GroupRow name={t('guide.waZoneGroup')} sub={myZoneGroup.name} group={myZoneGroup} busy={busy === myZoneGroup.id} disabled={!phone} onRequest={() => request(myZoneGroup.id)} />
                    ) : (
                      <GroupRow name={t('guide.waZoneGroup')} sub={t('guide.waFindZoneFirst')} group={null} busy={false} disabled={false} onRequest={() => router.push('/guide/zones')} />
                    )
                  ) : null}
                </VStack>
              );
            }}
          </Loaded>
          <GuideFootnote>{t('guide.waRules', { center: community })}</GuideFootnote>
        </>
      )}
    </GuideScreen>
  );
}

function GroupRow({ name, sub, group, busy, disabled, onRequest }: { name: string; sub: string | null; group: WhatsAppGroup | null; busy: boolean; disabled: boolean; onRequest: () => void }) {
  const t = useT();
  const req = group?.request ?? null;
  const done = !!req && req.status !== 'declined';
  const label = req ? t(`guide.wa.${req.status}` as 'guide.wa.pending') : t('guide.waJoin');
  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{name}</Txt>
        {sub ? (
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {sub}
          </Txt>
        ) : null}
      </View>
      <Pressable
        onPress={onRequest}
        disabled={!!req || busy || disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${name}`}
        accessibilityState={{ disabled: !!req || busy || disabled, busy }}
        style={({ pressed }) => ({
          minHeight: touch.min,
          paddingHorizontal: space.md,
          borderRadius: radii.xxl,
          borderWidth: 1,
          borderColor: req?.status === 'declined' ? colors.danger : colors.green,
          backgroundColor: done ? colors.green : colors.card,
          justifyContent: 'center',
          opacity: disabled && !req ? 0.45 : pressed ? 0.8 : 1,
        })}>
        <Txt variant="meta" color={done ? 'white' : req ? 'danger' : 'green'} style={{ fontFamily: fonts.bodySemi }}>
          {busy ? t('common.saving') : label}
        </Txt>
      </Pressable>
    </View>
  );
}
