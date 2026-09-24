import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Card, Chevron, Segmented, Txt, VStack } from '@/components/ui';
import { CalendarView } from '@/features/calendar';
import { EventIcon } from '@/features/event-icons';
import { compactTime } from '@/features/event-rules';
import { bandFor, eventStatusLine } from '@/features/events';
import { AlbumGrid, useAlbums } from '@/features/photos';
import { loadEventsList } from '@/lib/api/events';
import { formatDate } from '@/lib/format';
import { eventsPanes, pickPane, type EventsPane } from '@/lib/modules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useModule, useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * Events: Upcoming · Calendar · Photos (prototype L158–256). Each segment is
 * its own module (events, calendar, content); switched-off ones are left out.
 */
export default function EventsScreen() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const { invalidate } = useDataVersion();
  const { map } = useModules();
  const visible = eventsPanes(map);
  const view: EventsPane | null = pickPane(params.view, visible, 'upcoming');
  const labels: Record<EventsPane, string> = { upcoming: t('events.upcoming'), calendar: t('events.calendar'), photos: t('events.photos') };

  return (
    <Screen title={t('tab.events')} root onRefresh={async () => invalidate()}>
      {visible.length > 1 && view ? <Segmented label={t('tab.events')} value={view} onChange={(v) => router.setParams({ view: v })} options={visible.map((v) => ({ value: v, label: labels[v] }))} /> : null}
      {view === 'calendar' ? <CalendarView /> : view === 'photos' ? <AlbumGrid /> : view === 'upcoming' ? <UpcomingPane onPhotos={() => router.setParams({ view: 'photos' })} /> : null}
    </Screen>
  );
}

function UpcomingPane({ onPhotos }: { onPhotos: () => void }) {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const tz = center?.time_zone ?? null;
  const state = useLoad(
    async () => ({ ...(await loadEventsList(center?.id ?? '', member?.household?.id ?? null, member?.person.id ?? null)), now: new Date() }),
    [center?.id, member?.household?.id, member?.person.id],
    'load events',
  );
  const albums = useAlbums();
  const photosOn = useModule('content');
  const surveysOn = useModule('surveys');
  const albumList = photosOn ? (albums.data?.albums ?? []) : [];

  return (
    <Loaded state={state}>
      {({ items, feedback, now }) => (
        <VStack gap={space.md}>
          {items.length === 0 ? <EmptyState icon="calendar-outline" title={t('events.none')} body={t('events.noneBody')} /> : null}
          {items.map(({ event, rsvp, count }) => {
            const status = eventStatusLine(t, event, rsvp, count, now, tz);
            const hasTickets = !!rsvp && rsvp.status !== 'cancelled';
            const place = [event.venue, compactTime(event.starts_at, tz)].filter(Boolean).join(' · ');
            return (
              <Card
                key={event.id}
                hero
                padded={false}
                onPress={() => router.push(hasTickets ? { pathname: '/event/[id]/tickets', params: { id: event.id } } : { pathname: '/event/[id]', params: { id: event.id } })}
                accessibilityLabel={`${event.name}. ${formatDate(event.starts_at, tz)}. ${place}. ${status.text}`}
                style={{ overflow: 'hidden', gap: 0 }}>
                <View style={{ height: 88, backgroundColor: bandFor(event.id), paddingVertical: space.md, paddingHorizontal: space.lg, justifyContent: 'flex-end', alignItems: 'flex-start' }}>
                  {event.starts_at ? (
                    <View style={{ backgroundColor: colors.white, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Txt variant="caption" style={{ fontFamily: fonts.bodySemi }}>
                        {formatDate(event.starts_at, tz)}
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
                <View style={{ paddingTop: space.md, paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 4 }}>
                  <Txt variant="headline">{event.name}</Txt>
                  {place ? (
                    <Txt variant="meta" color="muted">
                      {place}
                    </Txt>
                  ) : null}
                  <Txt variant="meta" color={status.tone === 'green' ? 'green' : status.tone === 'brown' ? 'brown' : status.tone === 'navy' ? 'navy' : 'muted'} style={{ fontFamily: fonts.bodySemi }}>
                    {status.text}
                  </Txt>
                </View>
              </Card>
            );
          })}

          {member && albumList.length > 0 ? (
            <Pressable
              onPress={onPhotos}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, paddingVertical: 14, paddingHorizontal: space.lg, opacity: pressed ? 0.9 : 1 })}>
              <View style={{ width: 44, height: 44, borderRadius: radii.lg, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}>
                <EventIcon name="photo" size={22} color={colors.brown} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{t('events.pastPhotos')}</Txt>
                <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                  {albumList.length === 1 ? t('events.pastPhotosSubOne', { name: albumList[0].album.title }) : t('events.pastPhotosSub', { n: albumList.length, name: albumList[0].album.title })}
                </Txt>
              </View>
              <Chevron />
            </Pressable>
          ) : null}
          {member && photosOn && albums.error && !albums.data ? (
            <Txt variant="meta" color="danger">
              {albums.error.userMessage}
            </Txt>
          ) : null}

          {feedback && surveysOn ? (
            <Pressable
              onPress={() => router.push({ pathname: '/survey/[id]', params: { id: feedback.survey.id } })}
              disabled={feedback.sent}
              accessibilityRole="button"
              accessibilityState={{ disabled: feedback.sent }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: colors.purpleBorder, backgroundColor: colors.purpleBg, borderRadius: radii.xl, paddingVertical: 14, paddingHorizontal: space.lg, opacity: pressed ? 0.9 : 1 })}>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{feedback.sent ? t('events.feedbackSent') : t('events.shareFeedbackRecent')}</Txt>
                <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                  {feedback.attended ? t('events.youAttended', { event: feedback.eventName }) : feedback.eventName}
                </Txt>
              </View>
              {feedback.sent ? null : <Chevron />}
            </Pressable>
          ) : null}
        </VStack>
      )}
    </Loaded>
  );
}
