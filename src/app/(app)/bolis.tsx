import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Card, Row, SectionTitle, Stat, Txt, VStack } from '@/components/ui';
import { boliStatusText } from '@/features/bolis';
import { isBoliOpen, listBolis } from '@/lib/api/bolis';
import { formatCents, formatDateTime } from '@/lib/format';
import { boliStatus } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/** Bolis list (prototype §2.9): digital pledging and in-person bolis. Adults only. */
export default function BolisScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const { invalidate } = useDataVersion();
  const tz = center?.time_zone ?? null;
  const state = useLoad(async () => ({ bolis: center ? await listBolis(center.id) : [], now: new Date() }), [center?.id], 'load bolis');

  if (!member?.isAdult) {
    return (
      <Screen title={t('bolis.title')}>
        <LockedState />
      </Screen>
    );
  }

  return (
    <Screen title={t('bolis.title')} onRefresh={async () => invalidate()}>
      <Loaded state={state}>
        {({ bolis, now }) => {
          const digital = bolis.filter((b) => b.kind === 'digital');
          const hall = bolis.filter((b) => b.kind === 'in_person' && b.status !== 'settled' && b.status !== 'closed');
          return (
            <VStack gap={space.lg}>
              <SectionTitle>{t('bolis.inApp')}</SectionTitle>
              <Txt variant="small" color="muted">
                {t('bolis.inAppBody')}
              </Txt>
              {digital.length === 0 ? <EmptyState icon="ribbon-outline" title={t('bolis.noneDigital')} /> : null}
              {digital.map((b) => {
                const open = isBoliOpen(b, b.summary, now);
                const status = boliStatus({ mineCents: b.summary?.mineCents, topCents: b.summary?.topCents, entries: b.summary?.entries ?? 0, closed: !open });
                const closes = b.summary?.closesAt ?? b.closes_at;
                return (
                  <Card key={b.id} onPress={() => router.push({ pathname: '/boli/[id]', params: { id: b.id } })} accessibilityLabel={`${b.name}. ${boliStatusText(t, status)}`}>
                    <Txt variant="cardTitle">{b.name}</Txt>
                    {b.eventName ? (
                      <Txt variant="meta" color="muted">
                        {b.eventName}
                      </Txt>
                    ) : null}
                    <Row gap={space.md}>
                      <Stat label={t('bolis.floor')} value={formatCents(b.floor_cents)} />
                      <Stat label={t('bolis.topPledge')} value={b.summary?.topCents ? formatCents(b.summary.topCents) : '—'} color="brown" />
                      <Stat label={t('bolis.closes')} value={closes ? formatDateTime(closes, tz) : '—'} />
                    </Row>
                    <Txt variant="smallStrong" color={status === 'mine_top' ? 'green' : status === 'pledged_more' ? 'danger' : 'brown'}>
                      {boliStatusText(t, status)}
                    </Txt>
                  </Card>
                );
              })}

              <SectionTitle>{t('bolis.inPerson')}</SectionTitle>
              <Txt variant="small" color="muted">
                {t('bolis.inPersonBody')}
              </Txt>
              {hall.length === 0 ? <EmptyState icon="people-outline" title={t('bolis.noneHall')} /> : null}
              {hall.map((b) => (
                <Card key={b.id} tone="dashed" onPress={() => router.push({ pathname: '/boli/[id]', params: { id: b.id } })} accessibilityLabel={b.name}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">{b.name}</Txt>
                      <Txt variant="meta" color="muted">
                        {[b.eventName, b.opens_at ? t('bolis.calledAbout', { time: formatDateTime(b.opens_at, tz) }) : null].filter(Boolean).join(' · ')}
                      </Txt>
                    </View>
                    <Txt variant="smallStrong" color="navy">
                      {t('bolis.about')}
                    </Txt>
                  </Row>
                </Card>
              ))}
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
