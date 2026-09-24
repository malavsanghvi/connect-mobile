import { useState } from 'react';

import { Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Banner, Button, Card, ListRow, SectionTitle, TextField, Txt, VStack } from '@/components/ui';
import { findZoneByZip, listZones, sendToInbox, zoneInbox, type Zone } from '@/lib/api/guide';
import { report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/** Zone finder by ZIP (zones.zip_codes) + message the zone lead inbox. */
export default function ZonesScreen() {
  const t = useT();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const zones = useLoad(() => (center ? listZones(center.id) : Promise.resolve([])), [center?.id], 'load zones');
  const [zip, setZip] = useState(member?.household?.postal_code ?? '');
  const [zone, setZone] = useState<Zone | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const find = async () => {
    if (!center) return;
    setBusy('find');
    setError(null);
    setNotFound(false);
    try {
      const z = await findZoneByZip(center.id, zip);
      setZone(z);
      setNotFound(!z);
      if (z) setMessage(t('guide.leadDefault', { family: member?.household?.display_name ?? '', zone: z.name }));
    } catch (err) {
      setError(report(err, 'find your zone').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const messageLead = async () => {
    if (!center || !member || !zone) return;
    setBusy('msg');
    setError(null);
    try {
      const inbox = await zoneInbox(center.id, zone.id);
      await sendToInbox({ centerId: center.id, userId: member.userId, personId: member.person.id, inboxId: inbox?.id, preferredKeys: ['office'], subject: t('guide.leadSubject', { zone: zone.name }), body: message });
      toast(t('guide.messageSent'));
    } catch (err) {
      setError(report(err, 'message the zone lead').userMessage);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title={t('guide.zoneTitle')} tabBar={false}>
      <Txt variant="small" color="ink2">
        {t('guide.zoneIntro')}
      </Txt>
      <TextField label={t('guide.zip')} value={zip} onChangeText={setZip} keyboardType="number-pad" maxLength={5} returnKeyType="search" onSubmitEditing={find} />
      <Button label={t('guide.findZone')} onPress={find} busy={busy === 'find'} />
      {error ? <Banner tone="error" message={error} /> : null}
      {notFound ? <Banner tone="warning" message={t('guide.zoneNotFound', { zip })} /> : null}
      {zone ? (
        <Card tone="green">
          <Txt variant="eyebrow" color="greenDark">
            {t('guide.yourZone')}
          </Txt>
          <Txt variant="headline" color="greenDark">
            {t('guide.zoneName', { zone: zone.name })}
          </Txt>
          {member ? (
            <VStack gap={space.sm}>
              <TextField label={t('guide.messageLead')} value={message} onChangeText={setMessage} multiline />
              <Txt variant="meta" color="greenDark">
                {t('guide.shareNote')}
              </Txt>
              <Button label={t('guide.send')} tone="green" onPress={messageLead} busy={busy === 'msg'} disabled={!message.trim()} />
            </VStack>
          ) : null}
        </Card>
      ) : null}
      <SectionTitle>{t('guide.allZones')}</SectionTitle>
      <Loaded state={zones}>
        {(list) => (
          <Card>
            {list.map((z) => (
              <ListRow key={z.id} title={z.name} subtitle={z.zip_codes.slice(0, 8).join(' ')} onPress={() => setZone(z)} chevron={false} />
            ))}
          </Card>
        )}
      </Loaded>
    </Screen>
  );
}
