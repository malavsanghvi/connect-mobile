import { Platform, Share } from 'react-native';

import { AppError } from './errors';

/**
 * "Copy" for a short piece of text (the community's Zelle address). The app has no native clipboard module and this
 * release is JavaScript only, so:
 *   - on the web the browser's own clipboard is used (with the old textarea way for browsers that block the new one);
 *   - on a phone the share sheet opens with the text, and its Copy action puts it on the clipboard.
 * Returns what happened, so the caller says only what is true: 'copied' (it is on the clipboard), 'shared' (the share
 * sheet was used), 'dismissed' (the member closed the sheet). Throws a plain-English AppError when it cannot.
 */
export type CopyResult = 'copied' | 'shared' | 'dismissed';

type WebClipboard = { writeText?: (text: string) => Promise<void> };

function copyWithTextarea(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}

const FAILED = "We couldn't copy it from here. Press and hold the text to copy it yourself.";

export async function copyText(text: string): Promise<CopyResult> {
  if (Platform.OS === 'web') {
    const clip = typeof navigator === 'undefined' ? undefined : (navigator as unknown as { clipboard?: WebClipboard }).clipboard;
    if (clip?.writeText) {
      try {
        await clip.writeText(text);
        return 'copied';
      } catch {
        // Blocked (not a secure page, or no permission): try the older way before giving up.
      }
    }
    if (copyWithTextarea(text)) return 'copied';
    throw new AppError(FAILED, 'web clipboard unavailable');
  }
  try {
    const res = await Share.share({ message: text });
    return res.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch (err) {
    throw new AppError(FAILED, err instanceof Error ? err.message : String(err));
  }
}
