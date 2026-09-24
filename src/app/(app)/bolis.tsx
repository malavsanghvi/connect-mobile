import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Banner, Card, LinkText, Row, Txt, VStack } from '@/components/ui';
import { boliStatusText } from '@/features/bolis';
import { useBoliReminders } from '@/features/give/reminders';
import { isBoliOpen, listBolis } from '@/lib/api/bolis';
import { formatCents, formatTime, formatTimeLeft } from '@/lib/format';
import { boliStatus } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt variant="fine" color="muted">
        {label}
      </Txt>
      <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
        {value}
      </Txt>
    </View>
  );
}

/** Bolis list (prototype Main.dc.html L483–509): digital pledging and in-person bolis. Adults only. */
export default function BolisScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const { invalidate } = useDataVersion();
  const reminders = useBoliReminders();
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
            <VStack gap={space.md}>
              <Txt variant="section" accessibilityRole="header">
                {t('bolis.inApp')}
              </Txt>
              <Txt variant="meta" color="muted" style={{ marginTop: -6 }}>
                {t('bolis.inAppBody')}
              </Txt>
              {digital.length === 0 ? <EmptyState icon="ribbon-outline" title={t('bolis.noneDigital')} /> : null}
              {digital.map((b) => {
                const open = isBoliOpen(b, b.summary, now);
                const status = boliStatus({ mineCents: b.summary?.mineCents, topCents: b.summary?.topCents, entries: b.summary?.entries ?? 0, closed: !open });
                const closes = b.summary?.closesAt ?? b.closes_at;
                const left = formatTimeLeft(closes, now);
                return (
                  <Card key={b.id} onPress={() => router.push({ pathname: '/boli/[id]', params: { id: b.id } })} accessibilityLabel={`${b.name}. ${boliStatusText(t, status)}`}>
                    <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
                      {b.name}
                    </Txt>
                    {b.eventName ? (
                      <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                        {b.eventName}
                      </Txt>
                    ) : null}
                    <Row gap={6}>
                      <MiniStat label={t('bolis.floor')} value={formatCents(b.floor_cents)} />
                      <MiniStat label={t('bolis.topPledge')} value={b.summary?.topCents ? formatCents(b.summary.topCents) : '—'} />
                      <MiniStat label={t('bolis.closes')} value={closes ? left || t('bolis.closed') : '—'} />
                    </Row>
                    <Txt variant="meta" color={status === 'mine_top' ? 'green' : status === 'pledged_more' ? 'danger' : status === 'closed' ? 'muted' : 'brown'} style={{ fontFamily: fonts.bodySemi }}>
                      {boliStatusText(t, status)}
                    </Txt>
                  </Card>
                );
              })}

              <Txt variant="section" accessibilityRole="header" style={{ paddingTop: 6 }}>
                {t('bolis.inPerson')}
              </Txt>
              <Txt variant="meta" color="muted" style={{ marginTop: -6 }}>
                {t('bolis.inPersonBody')}
              </Txt>
              {reminders.error ? <Banner tone="error" message={reminders.error} /> : null}
              {hall.length === 0 ? <EmptyState icon="people-outline" title={t('bolis.noneHall')} /> : null}
              {hall.map((b) => {
                const on = reminders.isSet(b.id);
                return (
                  <View key={b.id} style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed, backgroundColor: colors.ground, borderRadius: radii.xl, paddingVertical: space.cardY, paddingHorizontal: space.cardX, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
                        {b.name}
                      </Txt>
                      <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                        {[b.eventName, b.opens_at ? t('bolis.calledAbout', { time: formatTime(b.opens_at, tz) }) : null].filter(Boolean).join(' · ')}
                      </Txt>
                    </View>
                    <LinkText label={t('bolis.about')} onPress={() => router.push({ pathname: '/boli/[id]', params: { id: b.id } })} />
                    <Pressable
                      onPress={() => void reminders.toggle(b)}
                      disabled={!reminders.ready}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${on ? t('bolis.reminderShort') : t('bolis.remindShort')}: ${b.name}`}
                      style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.navy, backgroundColor: on ? colors.navy : colors.card, borderRadius: radii.xxl, minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                      <Txt variant="meta" color={on ? 'white' : 'navy'} style={{ fontFamily: fonts.bodySemi }}>
                        {on ? t('bolis.reminderShort') : t('bolis.remindShort')}
                      </Txt>
                    </Pressable>
                  </View>
                );
              })}
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
