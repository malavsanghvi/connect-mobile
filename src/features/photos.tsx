import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Txt } from '@/components/ui';
import type { Translate } from '@/i18n';
import { albumOpenTarget } from '@/lib/album-open';
import { listAlbumPreviews, listAlbums, photoUrls, type AlbumPreview, type AlbumSummary } from '@/lib/api/photos';
import { sizedPhotoUrl } from '@/lib/photo-size';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { albumPalettes, colors, fonts, radii, space, touch } from '@/theme';

import { useAlbumActions } from './album-actions';
import { EventIcon } from './event-icons';
import { albumDate, paletteIndex } from './event-rules';

export function paletteFor(albumId: string) {
  return albumPalettes[paletteIndex(albumId, albumPalettes.length)];
}

/** "86 photos · 4 videos" / "12 photos" / "1 photo". */
export function albumCountLabel(t: Translate, photos: number, videos: number): string {
  if (videos > 0) return t('photos.count', { photos, videos });
  return photos === 1 ? t('photos.countOne') : t('photos.countPhotos', { photos });
}

export function albumDateLabel(s: Pick<AlbumSummary, 'event' | 'album'>, tz: string | null): string {
  return albumDate(s.event?.starts_at, s.event?.ends_at, s.album.created_at, tz);
}

export type AlbumsData = { albums: AlbumSummary[]; urls: Record<string, string>; urlError: string | null };

/** Albums plus signed cover URLs; a storage failure keeps the grid (placeholder tiles) and says so. */
export async function loadAlbumsWithCovers(centerId: string): Promise<AlbumsData> {
  const albums = await listAlbums(centerId);
  try {
    const urls = await photoUrls(albums.flatMap((a) => a.coverPaths));
    return { albums, urls, urlError: null };
  } catch (err) {
    return { albums, urls: {}, urlError: err instanceof Error ? err.message : String(err) };
  }
}

export type AlbumPreviewsData = { albums: AlbumPreview[]; urls: Record<string, string>; urlError: string | null };

/** The newest `limit` albums with the signed link of each one's cover (Home's Photos rail); a storage failure keeps the tiles (without pictures) and says so. */
export async function loadAlbumPreviewsWithCovers(centerId: string, limit: number): Promise<AlbumPreviewsData> {
  const albums = await listAlbumPreviews(centerId, limit);
  try {
    const urls = await photoUrls(albums.flatMap((a) => (a.coverPath ? [a.coverPath] : [])));
    return { albums, urls, urlError: null };
  } catch (err) {
    return { albums, urls: {}, urlError: err instanceof Error ? err.message : String(err) };
  }
}

export function useAlbums() {
  const { center, member } = useApp();
  return useLoad(() => (center && member ? loadAlbumsWithCovers(center.id) : Promise.resolve({ albums: [], urls: {}, urlError: null })), [center?.id, member?.person.id], 'load photo albums');
}

function Tile({ uri, color, style }: { uri?: string; color: string; style: object }) {
  return (
    <View style={[{ backgroundColor: color, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {uri ? <Image source={{ uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}

/**
 * Photos segment: two-column album cards with a three-tile collage (prototype L238–255). Tapping a card opens the album
 * itself, straight to an online album (Google Photos) when that is where its photos are. Share, Download and Add are on
 * the card, so there is no extra screen in between.
 */
export function AlbumGrid() {
  const t = useT();
  const { center, member } = useApp();
  const state = useAlbums();
  const tz = center?.time_zone ?? null;
  if (!member) return <Banner tone="info" message={t('photos.signInForAlbums')} />;
  return (
    <Loaded state={state}>
      {({ albums, urls, urlError }) =>
        albums.length === 0 ? (
          <EmptyState icon="images-outline" title={t('photos.none')} body={t('photos.noneBody')} />
        ) : (
          <View style={{ gap: space.md }}>
            {urlError ? <Banner tone="error" message={urlError} action={{ label: t('common.retry'), onPress: () => void state.reload() }} /> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
              {albums.map((a) => (
                <AlbumCard key={a.album.id} a={a} urls={urls} tz={tz} />
              ))}
            </View>
          </View>
        )
      }
    </Loaded>
  );
}

function AlbumCard({ a, urls, tz }: { a: AlbumSummary; urls: Record<string, string>; tz: string | null }) {
  const t = useT();
  const router = useRouter();
  const pal = paletteFor(a.album.id);
  const [c1, c2, c3] = a.coverPaths.map((p) => sizedPhotoUrl(urls[p], 'thumb'));
  const date = albumDateLabel(a, tz);
  const online = albumOpenTarget(a) === 'online';
  const count = online ? t('photos.onlineCount') : albumCountLabel(t, a.photos, a.videos);
  const actions = useAlbumActions(a, date);
  const open = () => {
    if (online) void actions.openOnline();
    else router.push({ pathname: '/album/[id]', params: { id: a.album.id } });
  };
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, maxWidth: '50%', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, overflow: 'hidden' }}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${a.album.title}. ${date}. ${count}`} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
        <View style={{ height: 120, flexDirection: 'row', gap: 2 }}>
          <Tile uri={c1} color={pal.tiles[0]} style={{ flex: 1 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Tile uri={c2} color={pal.tiles[1]} style={{ flex: 1 }} />
            <Tile uri={c3} color={pal.tiles[3]} style={{ flex: 1 }} />
          </View>
          {!c1 ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', alignItems: 'center', justifyContent: 'center' }}>
              <EventIcon name="photo" size={26} color={colors.white} />
            </View>
          ) : null}
        </View>
        <View style={{ paddingTop: 10, paddingHorizontal: space.md, paddingBottom: space.sm, gap: 2 }}>
          <Txt variant="smallStrong" numberOfLines={2}>
            {a.album.title}
          </Txt>
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {date}
          </Txt>
          <Txt variant="caption" color="brown" style={{ fontFamily: fonts.bodySemi }}>
            {count}
          </Txt>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border }}>
        <CardAction icon="share-outline" label={t('photos.share')} title={a.album.title} onPress={() => void actions.share()} busy={actions.busy === 'share'} disabled={!!actions.busy} />
        <CardAction icon="download-outline" label={t('photos.download')} title={a.album.title} onPress={() => void actions.download()} busy={actions.busy === 'download'} disabled={!!actions.busy} />
        <CardAction icon="add-circle-outline" label={t('photos.addShort')} title={a.album.title} onPress={() => void actions.upload()} busy={actions.busy === 'upload'} disabled={!!actions.busy || !actions.canAdd} primary />
      </View>
      {actions.progress || actions.error ? (
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm, gap: 2 }}>
          {actions.progress ? (
            <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }} accessibilityLiveRegion="polite">
              {actions.progress}
            </Txt>
          ) : null}
          {actions.error ? (
            <Txt variant="caption" color="danger" style={{ fontFamily: fonts.body }} accessibilityLiveRegion="polite">
              {actions.error}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** One of the three small actions on an album card: an icon over a short word. */
function CardAction({ icon, label, title, onPress, busy, disabled, primary }: { icon: IconName; label: string; title: string; onPress: () => void; busy?: boolean; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${title}`}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => ({ flex: 1, minHeight: touch.min, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 1, opacity: disabled && !busy ? 0.4 : pressed ? 0.6 : 1 })}>
      {busy ? <ActivityIndicator size="small" color={colors.navy} /> : <Icon name={icon} size={20} color={primary ? colors.brown : colors.navy} />}
      <Txt variant="fine" color={primary ? 'brown' : 'navy'}>
        {label}
      </Txt>
    </Pressable>
  );
}
