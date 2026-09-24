import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/screen';
import { Banner, Button, Card, TextField, Txt } from '@/components/ui';
import { logError, report } from '@/lib/errors';
import { readPref, writePref } from '@/lib/storage';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

/** The community's short name ("JSH"), never the product name. */
export function useCommunity(): string {
  const { center } = useApp();
  return center?.short_name || center?.name || '';
}

/**
 * Welcome.dc.html is a separate full-screen flow: back button + Fraunces 22
 * navy title, no tab bar and no Niva button.
 */
export function GuideScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Screen title={title} tabBar={false} niva={false}>
      {children}
    </Screen>
  );
}

/** Intro paragraph under the header (14px ink2, 1.5 line height). */
export function GuideIntro({ children }: { children: string }) {
  return (
    <Txt variant="small" color="ink2" style={{ lineHeight: 21 }}>
      {children}
    </Txt>
  );
}

export function GuideFootnote({ children }: { children: string }) {
  return (
    <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
      {children}
    </Txt>
  );
}

/** Guests see the guide; the parts that write to a member record ask them to sign in. */
export function SignInFirst() {
  const t = useT();
  const { setGuest } = useApp();
  return (
    <Card tone="panel">
      <Txt variant="small">{t('guide.signInFirst')}</Txt>
      <Button label={t('common.signIn')} size="md" onPress={() => setGuest(false)} />
    </Card>
  );
}

export type Tint = 'green' | 'navy' | 'brown';

export const tileTints: Record<Tint, { bg: string; fg: string }> = {
  green: { bg: colors.greenTint, fg: colors.green },
  navy: { bg: colors.navyTint, fg: colors.navy },
  brown: { bg: colors.brownTint, fg: colors.brown },
};

/** 36px (or 40px) rounded mark with 1–2 letters, as on the guide tiles and link rows. */
export function Mark({ text, tint, size = 36 }: { text: string; tint: Tint; size?: number }) {
  const c = tileTints[tint];
  return (
    <View style={{ width: size, height: size, borderRadius: size >= 40 ? radii.lg : radii.md, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
      <Txt variant="smallStrong" style={{ color: c.fg, fontSize: 15 }}>
        {text}
      </Txt>
    </View>
  );
}

/**
 * Bottom-sheet compose (Welcome.dc.html composeOpen): "Message {to}",
 * Cancel pill, message box, sharing note, Send. `onSend` throws on failure;
 * the sheet stays open and shows the error.
 */
export function ComposeSheet({ to, initialText, visible, onClose, onSend }: { to: string; initialText: string; visible: boolean; onClose: () => void; onSend: (text: string) => Promise<void> }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? <ComposeBody key={`${to}|${initialText}`} to={to} initialText={initialText} onClose={onClose} onSend={onSend} /> : null}
    </Modal>
  );
}

function ComposeBody({ to, initialText, onClose, onSend }: { to: string; initialText: string; onClose: () => void; onSend: (text: string) => Promise<void> }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!text.trim()) return setError(t('guide.messageEmpty'));
    setBusy(true);
    setError(null);
    try {
      await onSend(text.trim());
    } catch (err) {
      setError(report(err, 'send your message').userMessage);
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.scrimSheet, justifyContent: 'flex-end' }}>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={t('common.cancel')} />
      <View accessibilityViewIsModal style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, paddingHorizontal: space.gutter, paddingTop: space.gutter, paddingBottom: Math.max(34, insets.bottom + space.md), gap: space.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
          <Txt variant="cardTitle" style={{ flex: 1 }} accessibilityRole="header">
            {t('guide.composeTitle', { to })}
          </Txt>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={{ minHeight: touch.min, justifyContent: 'center' }}>
            <View style={{ backgroundColor: colors.chip, borderRadius: radii.xxl, minHeight: 36, paddingHorizontal: 14, justifyContent: 'center' }}>
              <Txt variant="small">{t('common.cancel')}</Txt>
            </View>
          </Pressable>
        </View>
        <TextField label={t('guide.composeLabel')} value={text} onChangeText={setText} multiline />
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {t('guide.composeNote')}
        </Txt>
        {error ? <Banner tone="error" message={error} /> : null}
        <Button label={t('guide.send')} onPress={send} busy={busy} />
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * A first-step flag remembered on this device (zone found, membership read):
 * the database has no column for them. Re-read whenever the screen regains
 * focus so the hub reflects what the member just did.
 */
export function useGuideFlag(key: string | null): [boolean, () => void] {
  const [value, setValue] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!key) return;
      let alive = true;
      readPref<boolean>(key, false).then((v) => alive && setValue(v));
      return () => {
        alive = false;
      };
    }, [key]),
  );
  const mark = () => {
    if (!key) return;
    setValue(true);
    writePref(key, true).catch((err: unknown) => logError(`remembering guide step "${key}" on this device`, err));
  };
  return [value, mark];
}

export const guideFlagKey = (personId: string | undefined, step: 'zone' | 'membership') => (personId ? `guide.${step}.${personId}` : null);

/** Open a web link in the in-app browser, or a tel:/maps link in the system app; failures are shown, not swallowed. */
export async function openExternal(url: string, action: string, onError: (message: string) => void): Promise<void> {
  try {
    if (/^https?:\/\//i.test(url)) await WebBrowser.openBrowserAsync(url);
    else await Linking.openURL(url);
  } catch (err) {
    onError(report(err, action).userMessage);
  }
}
