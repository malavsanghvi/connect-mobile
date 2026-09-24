import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Linking, Platform, Share } from 'react-native';

import { AppError, logError } from '@/lib/errors';

/**
 * Share / save helpers for photos, tickets and the calendar export. Each
 * throws an AppError with plain English when the device can't do it; callers
 * show that message. Nothing here claims success it didn't get.
 */

type WebNavigator = {
  share?: (data: { title?: string; text?: string; url?: string; files?: unknown[] }) => Promise<void>;
  canShare?: (data: { files?: unknown[] }) => boolean;
};

function webNavigator(): WebNavigator | null {
  return typeof navigator === 'undefined' ? null : (navigator as unknown as WebNavigator);
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /cancel/i.test(err.message));
}

/** Plain-text share (album, tickets). Returns false when the member closed the sheet. */
export async function shareText(message: string, url?: string | null): Promise<boolean> {
  if (Platform.OS === 'web') {
    const nav = webNavigator();
    if (nav?.share) {
      try {
        await nav.share({ text: message, url: url ?? undefined });
        return true;
      } catch (err) {
        if (isAbort(err)) return false;
        throw new AppError("Sharing didn't work in this browser.", err instanceof Error ? err.message : String(err));
      }
    }
    throw new AppError("This browser can't open a share sheet. Try from the Community Connect app on your phone.", 'navigator.share unavailable');
  }
  const res = await Share.share(url ? { message: `${message}\n${url}`, url } : { message });
  return res.action !== Share.dismissedAction;
}

/** WhatsApp with the text prefilled; falls back to the share sheet when WhatsApp isn't installed. */
export async function shareOnWhatsApp(message: string): Promise<void> {
  const text = encodeURIComponent(message);
  if (Platform.OS === 'web') {
    await Linking.openURL(`https://wa.me/?text=${text}`);
    return;
  }
  const app = `whatsapp://send?text=${text}`;
  if (await Linking.canOpenURL(app)) {
    await Linking.openURL(app);
    return;
  }
  await shareText(message);
}

async function downloadToCache(url: string, fileName: string): Promise<File> {
  const dest = new File(Paths.cache, fileName);
  try {
    if (dest.exists) dest.delete();
    return await File.downloadFileAsync(url, dest, { idempotent: true });
  } catch (err) {
    throw new AppError("The photo couldn't be downloaded. Please check your connection and try again.", err instanceof Error ? err.message : String(err));
  }
}

async function webDownload(blob: Blob, fileName: string): Promise<void> {
  const href = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(href), 30000);
  }
}

async function fetchBlob(url: string): Promise<Blob> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
  } catch (err) {
    throw new AppError("The photo couldn't be downloaded. Please check your connection and try again.", err instanceof Error ? err.message : String(err));
  }
}

/** Share one photo as a file (so it can go to WhatsApp, Messages, AirDrop…). */
export async function sharePhoto(url: string, fileName: string, mimeType: string): Promise<void> {
  if (Platform.OS === 'web') {
    const nav = webNavigator();
    const blob = await fetchBlob(url);
    const FileCtor = (globalThis as { File?: new (parts: Blob[], name: string, opts: { type: string }) => unknown }).File;
    const file = FileCtor ? new FileCtor([blob], fileName, { type: mimeType }) : null;
    if (file && nav?.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
      } catch (err) {
        if (!isAbort(err)) throw new AppError("Sharing didn't work in this browser.", err instanceof Error ? err.message : String(err));
      }
      return;
    }
    throw new AppError("This browser can't share photos. Use Save instead, then share the downloaded file.", 'navigator.share(files) unavailable');
  }
  if (!(await Sharing.isAvailableAsync())) throw new AppError("This device can't share files.", 'expo-sharing unavailable');
  const file = await downloadToCache(url, fileName);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}

/** Save photos to the phone's library (native) or download them (web). Returns how many were saved. */
export async function savePhotos(items: { url: string; fileName: string }[]): Promise<number> {
  if (items.length === 0) return 0;
  if (Platform.OS === 'web') {
    let n = 0;
    for (const it of items) {
      await webDownload(await fetchBlob(it.url), it.fileName);
      n += 1;
    }
    return n;
  }
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (perm.status !== 'granted') throw new AppError("Photo library access is off for Community Connect. Turn it on in your phone's settings to save photos.", `media library permission ${perm.status}`);
  let n = 0;
  for (const it of items) {
    const file = await downloadToCache(it.url, it.fileName);
    try {
      await MediaLibrary.saveToLibraryAsync(file.uri);
      n += 1;
    } catch (err) {
      throw new AppError(n ? `${n} saved, then saving stopped. Please try again for the rest.` : "The photo couldn't be saved to your library.", err instanceof Error ? err.message : String(err));
    } finally {
      try {
        file.delete();
      } catch (err) {
        logError('removing a downloaded photo from the cache (the OS clears it later)', err);
      }
    }
  }
  return n;
}

/** Hand a generated text file (the .ics export) to the share sheet, or download it on the web. */
export async function exportTextFile(text: string, fileName: string, mimeType: string, uti?: string): Promise<void> {
  if (Platform.OS === 'web') {
    await webDownload(new Blob([text], { type: mimeType }), fileName);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new AppError("This device can't share files, so the calendar couldn't be saved.", 'expo-sharing unavailable');
  const file = new File(Paths.cache, fileName);
  try {
    if (file.exists) file.delete();
    file.create();
    file.write(text);
  } catch (err) {
    throw new AppError("The calendar file couldn't be created on this phone.", err instanceof Error ? err.message : String(err));
  }
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: fileName });
}
