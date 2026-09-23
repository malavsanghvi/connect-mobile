import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Card, Row, Segmented, Txt, VStack } from '@/components/ui';
import { CalendarView } from '@/features/calendar';
import { bandFor, eventStatusLine } from '@/features/events';
import { loadEventsList } from '@/lib/api/events';
import { formatDate, formatTime, monthShortUpper, parseISODate, zonedParts } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

type View_ = 'upcoming' | 'calendar';

export default function EventsScreen() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const view: View_ = params.view === 'calendar' ? 'calendar' : 'upcoming';
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const tz = center?.time_zone ?? null;
  const state = useLoad(
    async () => ({ ...(await loadEventsList(center?.id ?? '', member?.household?.id ?? null, member?.person.id ?? null)), now: new Date() }),
    [center?.id, member?.household?.id, member?.person.id],
    'load events',
  );

  return (
    <Screen title={t('tab.events')} root onRefresh={async () => invalidate()}>
      <Segmented
        label={t('tab.events')}
        value={view}
        onChange={(v) => router.setParams({ view: v })}
        options={[
          { value: 'upcoming', label: t('events.upcoming') },
          { value: 'calendar', label: t('events.calendar') },
        ]}
      />
      {view === 'calendar' ? (
        <CalendarView />
      ) : (
        <Loaded state={state}>
          {({ items, feedback, now }) => (
            <VStack gap={space.lg}>
              {items.length === 0 ? <EmptyState icon="calendar-outline" title={t('events.none')} body={t('events.noneBody')} /> : null}
              {items.map(({ event, rsvp, count }) => {
                const status = eventStatusLine(t, event, rsvp, count, now, tz);
                const hasTickets = !!rsvp && rsvp.status !== 'cancelled';
                const iso = event.starts_at ? zonedParts(new Date(event.starts_at), tz).iso : null;
                return (
                  <Card
                    key={event.id}
                    padded={false}
                    onPress={() => router.push(hasTickets ? { pathname: '/event/[id]/tickets', params: { id: event.id } } : { pathname: '/event/[id]', params: { id: event.id } })}
                    accessibilityLabel={`${event.name}. ${formatDate(event.starts_at, tz)}. ${status.text}`}
                    style={{ overflow: 'hidden' }}>
                    <View style={{ height: 76, backgroundColor: bandFor(event.id), padding: space.md, justifyContent: 'flex-end' }}>
                      {iso ? (
                        <View style={{ position: 'absolute', top: space.md, left: space.md, backgroundColor: colors.white, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' }}>
                          <Txt variant="badge" color="maroon">
                            {monthShortUpper(iso)}
                          </Txt>
                          <Txt variant="section" color="ink">
                            {String(parseISODate(iso)?.d ?? '')}
                          </Txt>
                        </View>
                      ) : null}
                      {event.status === 'live' ? (
                        <View style={{ position: 'absolute', top: space.md, right: space.md, backgroundColor: colors.live, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Txt variant="badge" color="white">
                            {t('events.live')}
                          </Txt>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ padding: space.lg, gap: 4 }}>
                      <Txt variant="headline">{event.name}</Txt>
                      <Txt variant="meta" color="muted">
                        {[formatDate(event.starts_at, tz), event.venue, formatTime(event.starts_at, tz)].filter(Boolean).join(' · ')}
                      </Txt>
                      <Txt variant="smallStrong" color={status.tone === 'green' ? 'green' : status.tone === 'maroon' ? 'maroon' : status.tone === 'navy' ? 'navy' : 'muted'}>
                        {status.text}
                      </Txt>
                    </View>
                  </Card>
                );
              })}
              {feedback.map(({ survey, eventName }) => (
                <Card key={survey.id} tone="purple" onPress={() => router.push({ pathname: '/survey/[id]', params: { id: survey.id } })} accessibilityLabel={t('events.shareFeedbackOn', { event: eventName })}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong" color="purpleDark">
                        {t('events.shareFeedbackOn', { event: eventName })}
                      </Txt>
                      <Txt variant="meta" color="purple">
                        {survey.title}
                      </Txt>
                    </View>
                  </Row>
                </Card>
              ))}
            </VStack>
          )}
        </Loaded>
      )}
    </Screen>
  );
}
