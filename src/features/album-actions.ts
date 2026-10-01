import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';

import { getAlbum, photoUrls, uploadPhoto, type AlbumSummary } from '@/lib/api/photos';
import { onlineAlbumUrl } from '@/lib/album-open';
import { AppError, report } from '@/lib/errors';
import { photoFileName } from '@/lib/photo-files';
import { sizedPhotoUrl } from '@/lib/photo-size';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';

import { savePhotos, shareText } from './media';

export type AlbumBusy = 'share' | 'download' | 'upload';

/**
 * Share, Download and Add yours for one album, used by the album card on Events › Photos (the actions live on the card,
 * so the album itself opens straight away). Every failure is said in plain English on the card; nothing fails silently.
 */
export function useAlbumActions(a: AlbumSummary, dateLabel: string) {
  const t = useT();
  const { center, member } = useApp();
  const { toast, confirm } = useFeedback();
  const { invalidate } = useDataVersion();
  const [busy, setBusy] = useState<AlbumBusy | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const online = onlineAlbumUrl(a);

  /** The album that lives online (Google Photos): there is nothing of ours to download, so this is where Download goes too. */
  const openOnline = async () => {
    const url = online ?? a.album.external_url;
    if (!url) return;
    setError(null);
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      setError(report(err, 'open the full album').userMessage);
    }
  };

  const share = async () => {
    setBusy('share');
    setError(null);
    try {
      await shareText(t('photos.shareAlbumText', { album: a.album.title, date: dateLabel, center: center?.short_name || center?.name || '' }), a.album.external_url);
    } catch (err) {
      setError(report(err, 'share this album').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    if (online) return openOnline();
    setBusy('download');
    setError(null);
    try {
      const album = await getAlbum(a.album.id, member?.userId ?? null);
      const urls = await photoUrls(album.items.map((p) => p.storage_path));
      const items = album.items.filter((p) => p.status === 'approved' && urls[p.storage_path]).map((p, i) => ({ url: sizedPhotoUrl(urls[p.storage_path], 'save') ?? urls[p.storage_path], fileName: photoFileName(p.storage_path, i) }));
      if (items.length === 0) throw new AppError(t('photos.loadFailed'), 'no downloadable photos');
      const n = await savePhotos(items);
      toast(t('photos.downloadStarted', { n }));
    } catch (err) {
      setError(report(err, 'download this album').userMessage);
    } finally {
      setBusy(null);
    }
  };

  const upload = async () => {
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
      for (const asset of picked.assets) {
        setProgress(t('photos.uploading', { n: done + 1, total: picked.assets.length }));
        await uploadPhoto({ centerId: center.id, albumId: a.album.id, userId: member.userId, uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType, containsChildren: !noChildren });
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

  return { busy, progress, error, online, canAdd: !!member, share, download, upload, openOnline };
}
