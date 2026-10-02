import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Txt } from '@/components/ui';
import { darshanDoorVisible } from '@/lib/darshan';
import { useFeature } from '@/providers/access';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { PujaEntry } from './puja/puja-entry';

/**
 * The two doors on Home's Today card, "Watch live darshan" and "Do puja": each shows for a visitor who is not
 * signed in and for a member alike, as long as the organization's access level for that area lets them in
 * (Settings › Access levels in the portal; both are open to the public unless the organization says otherwise).
 * They open the full-screen /darshan and /puja, which work without signing in.
 *
 * `hasStream` and `aarti` come from Today's load (the Today card has them already): the darshan door is left out
 * for a community with no stream and no aarti time. The puja door checks for its own lesson (PujaEntry).
 */
export function TodayDoors({ hasStream, aarti }: { hasStream: boolean; aarti: string | null }) {
  return (
    <>
      <DarshanDoor hasStream={hasStream} aarti={aarti} />
      <PujaEntry />
    </>
  );
}

/** "Watch live darshan" (with the aarti time when there is one): straight to the live darshan screen. */
function DarshanDoor({ hasStream, aarti }: { hasStream: boolean; aarti: string | null }) {
  const t = useT();
  const router = useRouter();
  const access = useFeature('darshan');
  if (!darshanDoorVisible(access.allowed, hasStream, aarti)) return null;
  return (
    <Pressable
      onPress={() => router.push('/darshan')}
      accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: touch.min, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.ground, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.md, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live }} />
      <Txt variant="small" color="navy" style={{ fontFamily: fonts.bodyMedium }}>
        {aarti ? t('home.watchDarshanAarti', { time: aarti }) : t('home.watchDarshan')}
      </Txt>
    </Pressable>
  );
}
