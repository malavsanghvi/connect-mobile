import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FeatureNotice } from '@/components/feature-notice';
import { ErrorState, Loaded, LoadingState } from '@/components/states';
import { Banner, Button, Card, Chevron, Chip, Row, Txt, VStack } from '@/components/ui';
import { EventIcon } from '@/features/event-icons';
import { PlayGlyph } from '@/features/gyan-ui';
import { loadToday } from '@/lib/api/home';
import { listMedia, mediaPictures } from '@/lib/api/media';
import { report } from '@/lib/errors';
import { formatTimeOfDay } from '@/lib/format';
import { onlyFullyJain } from '@/lib/media-library';
import { useLoad } from '@/lib/use-load';
import { useFeature } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { useMediaActions } from './actions';
import { EmptyLine, FailureBanner, ListCard, MediaRow, Shelf, kindEmpty, useWatch } from './media-ui';

const SHELF = 3;

/**
 * 3L › Look: live darshan, videos, Jain recipes and the event photo albums. Live darshan and Look (videos and
 * recipes) are separate areas of the organization's access levels: a visitor sees live darshan when the
 * organization has it open to the public, and is asked to sign in for the rest; a member below the level an
 * area asks for is told which level it takes.
 */
export function LookSection() {
  const { member } = useApp();
  const darshan = useFeature('darshan');
  const look = useFeature('look');
  return (
    <VStack gap={18}>
      {/* While the answer loads, or when it could not be had, the notice for Look below says so (once). */}
      {darshan.allowed ? <DarshanTile /> : darshan.loading || darshan.error ? null : <FeatureNotice feature="darshan" />}
      {look.allowed && member ? <LookShelves /> : <FeatureNotice feature="look" />}
      {/* The event photo albums are not an area of their own: they stay for every member. */}
      {member ? <PhotosCard /> : null}
    </VStack>
  );
}

/** The live darshan tile (formerly Library): opens the full-screen player (src/app/(app)/darshan.tsx). */
export function DarshanTile() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const today = useLoad(() => (center ? loadToday(center) : Promise.reject(new Error('no center'))), [center?.id], 'load live darshan');
  const darshan = today.data?.darshan ?? null;
  const aarti = today.data?.timings?.aarti ? formatTimeOfDay(today.data.timings.aarti) : null;
  const [openError, setOpenError] = useState<string | null>(null);

  const openDarshan = () => {
    if (!darshan) return;
    setOpenError(null);
    try {
      router.push('/darshan');
    } catch (err) {
      setOpenError(report(err, 'open the live darshan').userMessage);
    }
  };

  if (today.error && !today.data) return <ErrorState error={today.error} onRetry={() => void today.reload()} />;
  if (today.loading && !today.data) return <LoadingState />;
  return (
    <VStack gap={space.sm}>
      <View style={{ height: 196, borderRadius: radii.xxl, backgroundColor: colors.videoTile, alignItems: 'center', justifyContent: 'center' }}>
        {darshan ? (
          <>
            <View style={{ position: 'absolute', top: 12, left: 12, backgroundColor: colors.live, borderRadius: radii.sm, paddingVertical: 3, paddingHorizontal: 8 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.white }}>{t('library.live').toUpperCase()}</Text>
            </View>
            <Text style={{ position: 'absolute', bottom: 12, left: 14, right: 14, fontFamily: fonts.body, fontSize: 13, color: colors.frame }} numberOfLines={1}>
              {aarti ? t('library.darshanCaption', { title: darshan.title, time: aarti }) : darshan.title}
            </Text>
            <Pressable
              onPress={openDarshan}
              accessibilityRole="button"
              accessibilityLabel={t('library.darshanPlay')}
              style={({ pressed }) => ({ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
              <PlayGlyph size={26} />
            </Pressable>
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: space.lg }} accessible>
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.frame }}>{t('library.darshanOffline')}</Text>
            {aarti ? <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.lockMeta }}>{t('library.darshanOfflineSub', { time: aarti })}</Text> : null}
          </View>
        )}
      </View>
      {openError ? <Banner tone="error" message={openError} /> : null}
    </VStack>
  );
}

/** Videos and recipes, newest first, three of each with "See all". */
function LookShelves() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const actions = useMediaActions();
  const watch = useWatch();
  const [fullyJain, setFullyJain] = useState(false);
  const media = useLoad(() => (center ? listMedia(center.id, ['video', 'recipe'], { sort: 'recent' }) : Promise.resolve([])), [center?.id], 'load videos and recipes');
  const all = media.data ?? [];
  const videos = all.filter((i) => i.kind === 'video');
  const recipesAll = all.filter((i) => i.kind === 'recipe');
  const recipes = fullyJain ? onlyFullyJain(recipesAll) : recipesAll;
  const shown = [...videos.slice(0, SHELF), ...recipes.slice(0, SHELF)];
  const pictures = useLoad(() => mediaPictures(shown), [shown.map((i) => i.id).join(',')], 'load the pictures');
  const pic = (id: string) => pictures.data?.[id] ?? null;

  return (
    <Loaded state={media}>
      {() => (
        <VStack gap={18}>
          <FailureBanner failure={actions.failure} />
          {watch.error ? <Banner tone="error" message={watch.error} /> : null}
          {pictures.error ? <ErrorState error={pictures.error} onRetry={() => void pictures.reload()} /> : null}

          <Shelf
            title={t('media.kinds.video')}
            onSeeAll={videos.length ? () => router.push({ pathname: '/media/[kind]', params: { kind: 'video' } }) : undefined}
            seeAllLabel={t('threeL.seeAll', { n: videos.length })}>
            {videos.length === 0 ? (
              <EmptyLine text={kindEmpty(t, 'video')} />
            ) : (
              <ListCard>
                {videos.slice(0, SHELF).map((v, i, list) => (
                  <MediaRow key={v.id} item={v} actions={actions} watch={watch} picture={pic(v.id)} last={i === list.length - 1} />
                ))}
              </ListCard>
            )}
          </Shelf>

          <Shelf
            title={t('threeL.recipes')}
            onSeeAll={recipesAll.length ? () => router.push({ pathname: '/media/[kind]', params: { kind: 'recipe' } }) : undefined}
            seeAllLabel={t('threeL.seeAll', { n: recipesAll.length })}>
            {recipesAll.length === 0 ? (
              <EmptyLine text={kindEmpty(t, 'recipe')} />
            ) : (
              <>
                <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                  <Chip label={t('media.fullyJainOnly')} selected={fullyJain} onPress={() => setFullyJain(!fullyJain)} tone="brown" />
                  <Button label={t('threeL.surpriseRecipe')} tone="outlineBrown" size="sm" icon="shuffle" fill={false} onPress={() => router.push('/recipe/random')} />
                </Row>
                {recipes.length === 0 ? (
                  <EmptyLine text={t('media.noFullyJain')} />
                ) : (
                  <ListCard>
                    {recipes.slice(0, SHELF).map((r, i, list) => (
                      <MediaRow key={r.id} item={r} actions={actions} picture={pic(r.id)} last={i === list.length - 1} />
                    ))}
                  </ListCard>
                )}
              </>
            )}
          </Shelf>
        </VStack>
      )}
    </Loaded>
  );
}

/** Events › Photos. */
function PhotosCard() {
  const t = useT();
  const router = useRouter();
  const title = t('threeL.photosTitle');
  return (
    <Card onPress={() => router.push({ pathname: '/events', params: { view: 'photos' } })} accessibilityLabel={`${title}. ${t('threeL.photosSub')}`} style={{ paddingVertical: 14 }}>
      <Row gap={space.md}>
        <View style={{ width: 44, height: 44, borderRadius: radii.card, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}>
          <EventIcon name="photo" size={22} color={colors.brown} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{title}</Txt>
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {t('threeL.photosSub')}
          </Txt>
        </View>
        <Chevron />
      </Row>
    </Card>
  );
}
