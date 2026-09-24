import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { StrokeIcon } from '@/components/stroke-icon';
import { Banner, Button, Pill, Txt, VStack } from '@/components/ui';
import { EventIcon } from '@/features/event-icons';
import { stepIndex, tileColorIndex } from '@/features/event-rules';
import { savePhotos, sharePhoto, shareText } from '@/features/media';
import { albumCountLabel, albumDateLabel, paletteFor } from '@/features/photos';
import { getAlbum, isVideoPath, photoUrls, uploadPhoto, type AlbumDetail, type Photo } from '@/lib/api/photos';
import { AppError, report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

type Data = AlbumDetail & { urls: Record<string, string>; urlError: string | null };

function fileNameFor(p: Photo, i: number): string {
  const ext = /\.([a-z0-9]{2,5})(\?|$)/i.exec(p.storage_path)?.[1]?.toLowerCase() ?? 'jpg';
  return `photo-${i + 1}.${ext}`;
}

function mimeFor(name: string): string {
  const ext = name.split('.').pop() ?? 'jpg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  return 'image/jpeg';
}

/** Photo album (prototype L992–1009) with the full-screen viewer (L1413–1428). */
export default function AlbumScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useApp();
  const state = useLoad(
    async (): Promise<Data> => {
      const album = await getAlbum(id, member?.userId ?? null);
      try {
        return { ...album, urls: await photoUrls(album.items.map((p) => p.storage_path)), urlError: null };
      } catch (err) {
        return { ...album, urls: {}, urlError: report(err, 'load the photos in this album').userMessage };
      }
    },
    [id, member?.userId],
    'load this album',
  );
  return (
    <Screen title={t('photos.title')}>
      <Loaded state={state}>{(d) => <AlbumBody data={d} onRetry={() => void state.reload()} />}</Loaded>
    </Screen>
  );
}

function AlbumBody({ data, onRetry }: { data: Data; onRetry: () => void }) {
  const t = useT();
  const { center, member } = useApp();
  const { toast, confirm } = useFeedback();
  const { invalidate } = useDataVersion();
  const [viewer, setViewer] = useState<number | null>(null);
  const [busy, setBusy] = useState<'share' | 'download' | 'upload' | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pal = paletteFor(data.album.id);
  const tz = center?.time_zone ?? null;
  const date = albumDateLabel(data, tz);
  const count = albumCountLabel(t, data.photos, data.videos);
  const visible = data.items;

  const doShare = async () => {
    setBusy('share');
    setError(null);
    try {
      await shareText(t('photos.shareAlbumText', { album: data.album.title, date, center: center?.short_name || center?.name || '' }), data.album.external_url);
    } catch (err) {
      setError(report(err, 'share this album').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const doDownload = async () => {
    if (data.album.external_url && visible.length === 0) {
      try {
        await WebBrowser.openBrowserAsync(data.album.external_url);
      } catch (err) {
        setError(report(err, 'open the full album').userMessage);
      }
      return;
    }
    setBusy('download');
    setError(null);
    try {
      const items = visible
        .filter((p) => p.status === 'approved' && data.urls[p.storage_path])
        .map((p, i) => ({ url: data.urls[p.storage_path], fileName: fileNameFor(p, i) }));
      if (items.length === 0) throw new AppError(t('photos.loadFailed'), 'no downloadable photos');
      const n = await savePhotos(items);
      toast(t('photos.downloadStarted', { n }));
    } catch (err) {
      setError(report(err, 'download this album').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const doUpload = async () => {
    if (!member || !center) return;
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new AppError(t('photos.pickDenied'), `image picker permission ${perm.status}`);
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.85 });
      if (picked.canceled || picked.assets.length === 0) return;
      // Unsure means "yes": photos with children are only shown to families who agreed.
      const noChildren = await confirm({ title: t('photos.childrenQuestion'), body: t('photos.childrenBody'), confirmLabel: t('photos.childrenNo'), cancelLabel: t('photos.childrenYes'), tone: 'primary' });
      setBusy('upload');
      let done = 0;
      for (const a of picked.assets) {
        setProgress(t('photos.uploading', { n: done + 1, total: picked.assets.length }));
        await uploadPhoto({ centerId: center.id, albumId: data.album.id, userId: member.userId, uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, containsChildren: !noChildren });
        done += 1;
      }
      invalidate();
      toast(done === 1 ? t('photos.uploadedOne') : t('photos.uploaded', { n: done }));
    } catch (err) {
      setError(`${t('photos.uploadFailed')} ${report(err, 'add your photos').userMessage}`);
      invalidate();
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <VStack gap={14}>
      <View style={{ borderRadius: radii.xxl, backgroundColor: pal.band, padding: 18, gap: 4 }}>
        <Txt variant="title" color="white" style={{ fontFamily: fonts.display }} accessibilityRole="header">
          {data.album.title}
        </Txt>
        <Txt variant="meta" color="viewerText">
          {`${date} · ${count}`}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <AlbumAction label={t('photos.share')} onPress={doShare} busy={busy === 'share'} disabled={!!busy} />
        <AlbumAction label={t('photos.download')} onPress={doDownload} busy={busy === 'download'} disabled={!!busy} />
        <AlbumAction label={t('photos.addYours')} onPress={doUpload} busy={busy === 'upload'} disabled={!!busy || !member} filled />
      </View>
      {progress ? (
        <Txt variant="meta" color="muted" accessibilityLiveRegion="polite">
          {progress}
        </Txt>
      ) : null}
      {error ? <Banner tone="error" message={error} /> : null}
      {data.urlError ? <Banner tone="error" message={data.urlError} action={{ label: t('common.retry'), onPress: onRetry }} /> : null}
      {visible.length === 0 ? (
        <EmptyState icon="images-outline" title={t('photos.emptyAlbum')} body={t('photos.emptyAlbumBody')} action={data.album.external_url ? { label: t('photos.openExternal'), onPress: () => void WebBrowser.openBrowserAsync(data.album.external_url as string).catch((err: unknown) => setError(report(err, 'open the full album').userMessage)) } : undefined} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {visible.map((p, i) => {
            const uri = data.urls[p.storage_path];
            const video = isVideoPath(p.storage_path);
            return (
              <Pressable
                key={p.id}
                onPress={() => setViewer(i)}
                accessibilityRole="button"
                accessibilityLabel={t('photos.openPhoto', { n: i + 1, total: visible.length })}
                style={({ pressed }) => ({ width: '32.4%', height: 112, borderRadius: radii.xs, backgroundColor: pal.tiles[tileColorIndex(i)], overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                {uri && !video ? <Image source={{ uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : <EventIcon name="photo" size={20} color={colors.white} />}
                {video ? (
                  <View style={{ position: 'absolute', right: 6, bottom: 5, backgroundColor: colors.videoBadge, borderRadius: radii.xs, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Txt variant="badge" color="white">
                      {t('photos.video')}
                    </Txt>
                  </View>
                ) : null}
                {p.status === 'pending' ? (
                  <View style={{ position: 'absolute', left: 4, top: 4 }}>
                    <Pill label={t('photos.inReview')} tone="amber" />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
      {viewer !== null ? <Viewer data={data} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} /> : null}
    </VStack>
  );
}

function AlbumAction({ label, onPress, busy, disabled, filled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; filled?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Button label={label} onPress={onPress} busy={busy} disabled={disabled} tone={filled ? 'primary' : 'secondary'} size="sm" style={{ borderRadius: radii.card, paddingHorizontal: space.xs }} />
    </View>
  );
}

/** Full-screen dark viewer: close, "1 of 90", photo, ‹ Prev · Share · Save · Next ›. */
function Viewer({ data, index, onIndex, onClose }: { data: Data; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const t = useT();
  const { toast } = useFeedback();
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = data.items.length;
  const p = data.items[index];
  const uri = p ? data.urls[p.storage_path] : undefined;
  const video = p ? isVideoPath(p.storage_path) : false;
  const pal = paletteFor(data.album.id);
  const name = p ? fileNameFor(p, index) : 'photo.jpg';

  const run = async (kind: 'share' | 'save') => {
    if (!uri) return setError(t('photos.loadFailed'));
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'share') await sharePhoto(uri, name, mimeFor(name));
      else {
        await savePhotos([{ url: uri, fileName: name }]);
        toast(t('photos.saved'));
      }
    } catch (err) {
      setError(report(err, kind === 'share' ? 'share this photo' : 'save this photo').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const go = (delta: -1 | 1) => {
    setError(null);
    onIndex(stepIndex(index, delta, total));
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.viewerBg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: 18, paddingHorizontal: space.lg, paddingBottom: 10 }}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('photos.closeViewer')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.viewerButton, alignItems: 'center', justifyContent: 'center' }}>
            <StrokeIcon name="close" size={16} color={colors.white} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Txt variant="smallStrong" color="viewerText" numberOfLines={1}>
              {data.album.title}
            </Txt>
            <Txt variant="caption" color="viewerMeta" style={{ fontFamily: fonts.body }} accessibilityLiveRegion="polite">
              {t('photos.viewerPos', { n: index + 1, total })}
            </Txt>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md }}>
          <View style={{ width: '100%', height: Math.min(480, height * 0.6), borderRadius: radii.md, backgroundColor: pal.tiles[tileColorIndex(index)], overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
            {uri && !video ? (
              <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" accessibilityLabel={p?.caption ?? t('photos.viewerPos', { n: index + 1, total })} />
            ) : video && uri ? (
              <>
                <EventIcon name="photo" size={44} color={colors.white} />
                <Button label={t('photos.playVideo')} tone="light" size="sm" fill={false} onPress={() => void WebBrowser.openBrowserAsync(uri).catch((err: unknown) => setError(report(err, 'play this video').userMessage))} />
                <Txt variant="caption" color="white">
                  {t('photos.videoNote')}
                </Txt>
              </>
            ) : (
              <>
                <EventIcon name="photo" size={44} color={colors.white} />
                <Txt variant="meta" color="white">
                  {t('photos.loadFailed')}
                </Txt>
              </>
            )}
          </View>
          {p?.caption ? (
            <Txt variant="meta" color="viewerText" center style={{ marginTop: space.sm }}>
              {p.caption}
            </Txt>
          ) : null}
          {error ? (
            <View style={{ marginTop: space.sm, alignSelf: 'stretch' }}>
              <Banner tone="error" message={error} />
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, paddingTop: space.lg, paddingHorizontal: space.lg, paddingBottom: 36 }}>
          <ViewerButton label={t('photos.prev')} onPress={() => go(-1)} disabled={index === 0} />
          <ViewerButton label={t('photos.share')} onPress={() => void run('share')} busy={busy === 'share'} disabled={!!busy} />
          <ViewerButton label={t('photos.save')} onPress={() => void run('save')} busy={busy === 'save'} disabled={!!busy} />
          <ViewerButton label={t('photos.next')} onPress={() => go(1)} disabled={index >= total - 1} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ViewerButton({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: radii.card, backgroundColor: colors.viewerButton, alignItems: 'center', justifyContent: 'center', opacity: disabled && !busy ? 0.45 : pressed ? 0.8 : 1 })}>
      <Txt variant="smallStrong" color="white">
        {busy ? '…' : label}
      </Txt>
    </Pressable>
  );
}
