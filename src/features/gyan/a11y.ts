import type { RefObject } from 'react';
import { AccessibilityInfo, Platform, type View } from 'react-native';

/**
 * Say a line that is also shown in a live region that stays on screen
 * (accessibilityLiveRegion on a view that is already mounted, such as the
 * card deck's "Card 2 of 3"). TalkBack and browsers read changes to such a
 * region themselves; VoiceOver doesn't, so only iOS is told here (Android
 * would otherwise hear it twice).
 */
export function announceIos(text: string): void {
  if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);
}

/**
 * Say a line on iOS and Android (the web has no announcer). For a note that
 * appears on screen as well, give the note `webLiveRegion`: TalkBack often
 * says nothing for a live region that has only just appeared, so the phone is
 * told here and only browsers read the region. `queue`: a line that follows
 * another (a try's points after its result) waits for it on iOS instead of
 * cutting it off (Android has no such option and just says it).
 */
export function announce(text: string, opts?: { queue?: boolean }): void {
  if (!text || Platform.OS === 'web') return;
  if (opts?.queue) AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  else AccessibilityInfo.announceForAccessibility(text);
}

/** The live region for a note that announce() already says on a phone: only browsers read it, so nobody hears it twice. */
export const webLiveRegion: 'polite' | 'none' = Platform.OS === 'web' ? 'polite' : 'none';

/**
 * Move the screen reader to a view, for when the control that was pressed
 * has just gone (VoiceOver and TalkBack would otherwise drop to the top of
 * the screen). It reads the view, so no announce() is needed as well. After
 * a moment, so the view is on screen first; returns a cancel for effects.
 * Nothing on the web, where focus stays on the page.
 */
export function focusSoon(ref: RefObject<View | null>, delayMs = 300): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const timer = setTimeout(() => {
    if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
  }, delayMs);
  return () => clearTimeout(timer);
}
