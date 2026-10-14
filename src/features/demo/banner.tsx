import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui';
import { timeLeftText } from '@/lib/demo';
import { logError } from '@/lib/errors';
import { useDemo } from '@/providers/demo';
import { useT } from '@/providers/settings';
import { colors, space, touch } from '@/theme';

export type DemoBannerAction = { id: 'bePerson' | 'switchPerson' | 'lookAsGuest' | 'leave'; label: string; hint: string; onPress: () => void };

/**
 * The strip over every screen while a demo runs. Looking around as a guest: "Demo community · Looking around as a guest" with
 * "Be someone in the demo" and "Leave the demo". Signed in as a demo person: "Demo · Teacher · 1 h 42 min left" with "Switch person",
 * "Look around as a guest" and "Leave the demo". It sits above the navigator and takes the top safe area itself, so the screens under
 * it find none left to add. The actions wrap under the words on a narrow screen; each is at least 44 px tall.
 */
export function DemoBannerView({
  text,
  accessibilityLabel,
  actions,
  topInset = 0,
  busy,
  error,
}: {
  text: string;
  accessibilityLabel: string;
  actions: DemoBannerAction[];
  topInset?: number;
  /** The action in progress: it reads "…" and none can be pressed meanwhile. */
  busy?: DemoBannerAction['id'] | null;
  error?: string | null;
}) {
  const t = useT();
  return (
    <View
      testID="demo-banner"
      style={{ backgroundColor: colors.brownTint, borderBottomWidth: 1, borderBottomColor: colors.brownBorder, paddingTop: topInset, paddingHorizontal: space.md }}>
      <View style={{ paddingTop: space.xs }} accessible accessibilityLabel={accessibilityLabel}>
        <Txt variant="smallStrong" color="brownDark">
          {text}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg }}>
        {actions.map((a) => (
          <Pressable
            key={a.id}
            onPress={a.onPress}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            accessibilityHint={a.hint}
            accessibilityState={{ disabled: !!busy, busy: busy === a.id }}
            style={({ pressed }) => ({ minHeight: touch.min, justifyContent: 'center', opacity: busy && busy !== a.id ? 0.5 : pressed ? 0.6 : 1 })}>
            <Txt variant="smallStrong" color="navy" style={{ textDecorationLine: 'underline' }}>
              {busy === a.id && a.id === 'leave' ? t('demo.leaving') : a.label}
            </Txt>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Txt variant="meta" color="danger" accessibilityRole="alert" style={{ paddingBottom: space.xs }}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

/** The banner of the running demo (guest or person), or nothing when there is none. */
export function DemoBanner() {
  const demo = useDemo();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<DemoBannerAction['id'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (demo.mode === 'off') return null;

  // An action that talks to the database: busy while it runs, and a plain sentence if it fails.
  const run = (id: DemoBannerAction['id'], work: () => Promise<void>) => () => {
    setBusy(id);
    setError(null);
    work()
      .catch((err: unknown) => {
        logError('changing the demo', err);
        setError(t('demo.actionFailed'));
      })
      .finally(() => setBusy(null));
  };
  const act = (id: DemoBannerAction['id'], label: string, hint: string, onPress: () => void): DemoBannerAction => ({ id, label, hint, onPress });
  const leave = act('leave', t('demo.leave'), t('demo.leaveHint'), run('leave', demo.leave));

  if (demo.mode === 'guest') {
    return (
      <DemoBannerView
        text={t('demo.guestBanner')}
        accessibilityLabel={t('demo.guestBannerLabel', { community: demo.guestCommunity?.name ?? '' })}
        actions={[act('bePerson', t('demo.bePerson'), t('demo.bePersonHint'), demo.openChooser), leave]}
        topInset={insets.top}
        busy={busy}
        error={error}
      />
    );
  }
  const who = demo.info?.role || demo.info?.name || t('demo.title');
  const left = timeLeftText(demo.secondsLeft);
  return (
    <DemoBannerView
      text={t('demo.banner', { role: who, left })}
      accessibilityLabel={t('demo.bannerLabel', { role: who, left })}
      actions={[
        act('switchPerson', t('demo.switchPerson'), t('demo.switchPersonHint'), demo.openChooser),
        act('lookAsGuest', t('demo.lookAsGuest'), t('demo.lookAsGuestHint'), run('lookAsGuest', demo.toGuest)),
        leave,
      ]}
      topInset={insets.top}
      busy={busy}
      error={error}
    />
  );
}
