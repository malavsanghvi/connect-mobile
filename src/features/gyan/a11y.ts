import { AccessibilityInfo, Platform } from 'react-native';

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
