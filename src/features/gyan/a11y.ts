import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Say a line that is also shown in a live region (accessibilityLiveRegion).
 * TalkBack and browsers read live regions themselves; VoiceOver doesn't, so
 * only iOS is told here (Android would otherwise hear it twice).
 */
export function announceIos(text: string): void {
  if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);
}

/** Say a line that nothing on screen announces (iOS and Android; the web has no announcer). */
export function announce(text: string): void {
  if (text) AccessibilityInfo.announceForAccessibility(text);
}
