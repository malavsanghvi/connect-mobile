import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Card, LinkText, Row, Txt } from '@/components/ui';
import { listWhatsAppGroups, requestWhatsAppJoin } from '@/lib/api/guide';
import { report } from '@/lib/errors';
import { formatPhone } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/** WhatsApp groups: request to join → whatsapp_join_requests (an admin adds the number). */
export default function WhatsAppScreen() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useLoad(() => (center && member ? listWhatsAppGroups(center.id, member.person.id) : Promise.resolve([])), [center?.id, member?.person.id], 'load WhatsApp groups');
  if (!member || !center) return null;
  const phone = member.person.phone_e164;

  const request = async (groupId: string) => {
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
    <Screen title={t('guide.waTitle')}>
      <Txt variant="small" color="ink2">
        {t('guide.waIntro')}
      </Txt>
      <Card tone="panel">
        <Txt variant="small">{phone ? t('guide.waAdding', { phone: formatPhone(phone) }) : t('guide.waNoPhone')}</Txt>
        <LinkText label={t('guide.waChange')} onPress={() => router.push({ pathname: '/person/[id]', params: { id: member.person.id } })} />
      </Card>
      {error ? <Banner tone="error" message={error} /> : null}
      <Loaded state={state}>
        {(groups) =>
          groups.length === 0 ? (
            <EmptyState icon="logo-whatsapp" title={t('guide.waNone')} />
          ) : (
            <Card>
              {groups.map((g) => (
                <Row key={g.id} gap={space.md} style={{ paddingVertical: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{g.name}</Txt>
                    {g.description ? (
                      <Txt variant="meta" color="muted">
                        {g.description}
                      </Txt>
                    ) : null}
                  </View>
                  {g.request ? (
                    <Txt variant="smallStrong" color={g.request.status === 'declined' ? 'danger' : 'green'}>
                      {t(`guide.wa.${g.request.status}` as 'guide.wa.pending')}
                    </Txt>
                  ) : (
                    <Button label={t('guide.waJoin')} tone="secondary" size="sm" fill={false} onPress={() => request(g.id)} busy={busy === g.id} disabled={!phone} />
                  )}
                </Row>
              ))}
            </Card>
          )
        }
      </Loaded>
      <Txt variant="meta" color="muted">
        {t('guide.waRules')}
      </Txt>
    </Screen>
  );
}
