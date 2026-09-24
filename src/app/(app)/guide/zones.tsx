import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Loaded } from '@/components/states';
import { Banner, Button, Txt, VStack } from '@/components/ui';
import { replyWithin } from '@/features/guide';
import { ComposeSheet, GuideIntro, GuideScreen, guideFlagKey, useGuideFlag } from '@/features/guide-ui';
import { findZoneByZip, getZone, listWhatsAppGroups, listZones, requestWhatsAppJoin, sendToInbox, zoneInbox, type Zone } from '@/lib/api/guide';
import { report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useSettings, useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

/**
 * Your zone (Welcome.dc.html secZone): ZIP finder inline, zone card with the
 * lead row, "Message lead" (compose sheet → the zone inbox) and "Join zone
 * WhatsApp", then all zones. A ZIP no zone lists shows a notice instead of
 * silently picking one.
 */
export default function ZonesScreen() {
  const t = useT();
  const { scale } = useSettings();
  const { center, member } = useApp();
  const zones = useLoad(() => (center ? listZones(center.id) : Promise.resolve([])), [center?.id], 'load zones');
  const home = useLoad(() => (member?.household?.zone_id ? getZone(member.household.zone_id) : Promise.resolve(null)), [member?.household?.zone_id], 'load your zone');
  const [, markZone] = useGuideFlag(guideFlagKey(member?.person.id, 'zone'));
  const [zip, setZip] = useState(member?.household?.postal_code ?? '');
  const [picked, setPicked] = useState<Zone | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zone = picked ?? home.data ?? null;

  const choose = (z: Zone) => {
    setPicked(z);
    setNotFound(null);
    markZone();
  };

  const find = async () => {
    if (!center) return;
    setBusy(true);
    setError(null);
    setNotFound(null);
    try {
      const z = await findZoneByZip(center.id, zip);
      if (z) choose(z);
      else setNotFound(zip.trim());
    } catch (err) {
      setError(report(err, 'find your zone').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GuideScreen title={t('guide.zoneTitle')}>
      <GuideIntro>{t('guide.zoneIntro')}</GuideIntro>
      <View style={{ gap: 6 }}>
        <Txt variant="meta" color="muted">
          {t('guide.zip')}
        </Txt>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <TextInput
            value={zip}
            onChangeText={setZip}
            keyboardType="number-pad"
            maxLength={5}
            returnKeyType="search"
            onSubmitEditing={find}
            accessibilityLabel={t('guide.zip')}
            placeholderTextColor={colors.faint}
            style={{ flex: 1, minHeight: 50, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.card, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 17 * scale, color: colors.ink }}
          />
          <Button label={t('guide.findZone')} size="md" fill={false} onPress={find} busy={busy} style={{ minHeight: 50, borderRadius: radii.lg }} />
        </View>
      </View>
      {error ? <Banner tone="error" message={error} /> : null}
      {notFound ? <Banner tone="warning" message={t('guide.zoneNotFound', { zip: notFound })} /> : null}
      {home.error ? <Banner tone="error" message={home.error.userMessage} action={{ label: t('common.retry'), onPress: () => void home.reload() }} /> : null}
      {zone ? <ZoneCard key={zone.id} zone={zone} /> : null}

      <Txt variant="bodyStrong" style={{ paddingTop: 4 }}>
        {t('guide.allZones')}
      </Txt>
      <Loaded state={zones}>
        {(list) => (
          <VStack gap={space.sm}>
            {list.map((z) => {
              const on = zone?.id === z.id;
              return (
                <Pressable
                  key={z.id}
                  onPress={() => choose(z)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({ minHeight: touch.row, borderRadius: radii.card, borderWidth: 1, borderColor: on ? colors.navy : colors.border, backgroundColor: on ? colors.navyTint : colors.card, paddingVertical: space.sm, paddingHorizontal: 14, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                  <Txt variant="bodyStrong">{z.name}</Txt>
                  <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                    {t('guide.zoneZips', { zips: z.zip_codes.slice(0, 8).join(', ') })}
                  </Txt>
                </Pressable>
              );
            })}
          </VStack>
        )}
      </Loaded>
    </GuideScreen>
  );
}

function ZoneCard({ zone }: { zone: Zone }) {
  const t = useT();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const extra = useLoad(
    async () => {
      if (!center) return { inbox: null, group: null };
      const [inbox, groups] = await Promise.all([zoneInbox(center.id, zone.id), member ? listWhatsAppGroups(center.id, member.person.id) : Promise.resolve([])]);
      return { inbox, group: groups.find((g) => g.zone_id === zone.id) ?? null };
    },
    [center?.id, zone.id, member?.person.id],
    'load the zone lead',
  );
  const within = replyWithin(extra.data?.inbox?.response_target_hours);
  const leadSub = !extra.data
    ? ''
    : !extra.data.inbox
      ? t('guide.zoneLeadNoInbox', { zone: zone.name })
      : within === 'days'
        ? t('guide.zoneLeadDays', { zone: zone.name, n: Math.ceil((extra.data.inbox.response_target_hours ?? 48) / 24) })
        : t('guide.zoneLeadDay', { zone: zone.name });
  const group = extra.data?.group ?? null;

  const join = async () => {
    if (!center || !member || !group) return;
    setBusy(true);
    setError(null);
    try {
      await requestWhatsAppJoin(center.id, group.id, member.person.id, member.person.phone_e164);
      invalidate();
      toast(t('guide.zoneWaSent', { zone: zone.name }));
    } catch (err) {
      setError(report(err, 'send your request to join').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 2, borderColor: colors.navy, borderRadius: radii.xxl, padding: space.lg, gap: 10 }}>
      <Txt variant="eyebrow" color="navy">
        {t('guide.yourZone')}
      </Txt>
      <Txt variant="title" style={{ fontFamily: fonts.display }} accessibilityRole="header">
        {t('guide.zoneName', { zone: zone.name })}
      </Txt>
      <Txt variant="meta" color="muted">
        {t('guide.zoneZips', { zips: zone.zip_codes.join(', ') })}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.panel, borderRadius: radii.card, paddingVertical: 10, paddingHorizontal: space.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
          <Txt variant="smallStrong" color="white" style={{ fontFamily: fonts.bodyBold }}>
            ZL
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{t('guide.zoneLead', { zone: zone.name })}</Txt>
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {leadSub}
          </Txt>
        </View>
      </View>
      {extra.error ? <Banner tone="error" message={extra.error.userMessage} action={{ label: t('common.retry'), onPress: () => void extra.reload() }} /> : null}
      {error ? <Banner tone="error" message={error} /> : null}
      {member ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button label={t('guide.messageLead')} size="card" onPress={() => setComposing(true)} disabled={!extra.data} />
          </View>
          <View style={{ flex: 1 }}>
            {group?.request ? (
              <View accessible accessibilityLabel={t('guide.zoneWaRequested')} style={{ minHeight: 46, borderRadius: radii.pill, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm }}>
                <Txt variant="meta" color="white" style={{ fontFamily: fonts.bodySemi }}>
                  {t('guide.zoneWaRequested')}
                </Txt>
              </View>
            ) : (
              <Button label={group ? t('guide.joinZoneWa') : t('guide.zoneWaNone')} size="card" tone="outlineGreen" onPress={join} busy={busy} disabled={!group} />
            )}
          </View>
        </View>
      ) : null}
      <ComposeSheet
        visible={composing}
        to={t('guide.leadTo', { zone: zone.name })}
        initialText={t('guide.leadDefault', { family: member?.household?.display_name ?? '', zone: zone.name })}
        onClose={() => setComposing(false)}
        onSend={async (text) => {
          if (!center || !member) return;
          await sendToInbox({ centerId: center.id, userId: member.userId, personId: member.person.id, inboxId: extra.data?.inbox?.id, preferredKeys: ['office'], subject: t('guide.leadSubject', { zone: zone.name }), body: text });
          setComposing(false);
          invalidate();
          toast(t('guide.messageSentTo', { to: t('guide.leadTo', { zone: zone.name }) }));
        }}
      />
    </View>
  );
}
