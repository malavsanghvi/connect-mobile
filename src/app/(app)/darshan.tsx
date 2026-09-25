import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Txt } from '@/components/ui';
import { DarshanPlayer, PLAYS_INLINE } from '@/features/darshan-player';
import { PlayGlyph } from '@/features/gyan-ui';
import { loadToday } from '@/lib/api/home';
import { report } from '@/lib/errors';
import { formatTimeOfDay } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * Live darshan, full screen: the organization's stream (Content › Today &
 * darshan in the portal). On the web the stream's player is embedded; on a
 * phone it opens in the in-app browser.
 */
export default function DarshanScreen() {
  const t = useT();
  const { center } = useApp();
  const today = useLoad(() => (center ? loadToday(center) : Promise.reject(new Error('no center'))), [center?.id], 'load live darshan');
  const darshan = today.data?.darshan ?? null;
  const aarti = today.data?.timings?.aarti ? formatTimeOfDay(today.data.timings.aarti) : null;
  const [openError, setOpenError] = useState<string | null>(null);

  const open = async () => {
    if (!darshan) return;
    setOpenError(null);
    try {
      await WebBrowser.openBrowserAsync(darshan.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
    } catch (err) {
      setOpenError(report(err, 'open the live darshan').userMessage);
    }
  };

  return (
    <Screen title={t('darshan.title')} niva={false} contentStyle={{ flexGrow: 1 }}>
      {today.error && !today.data ? (
        <ErrorState error={today.error} onRetry={() => void today.reload()} />
      ) : today.loading && !today.data ? (
        <LoadingState />
      ) : !darshan ? (
        <View style={{ borderRadius: radii.xxl, backgroundColor: colors.videoTile, padding: space.xl, alignItems: 'center', gap: 4 }}>
          <Txt variant="bodyStrong" style={{ color: colors.frame }}>
            {t('library.darshanOffline')}
          </Txt>
          {aarti ? <Txt variant="small" style={{ color: colors.lockMeta }}>{t('library.darshanOfflineSub', { time: aarti })}</Txt> : null}
        </View>
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Txt variant="section">{darshan.title}</Txt>
            <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
              {[darshan.live ? t('library.live') : null, darshan.schedule, aarti ? t('darshan.aarti', { time: aarti }) : null].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          {PLAYS_INLINE ? (
            <View style={{ width: '100%', aspectRatio: 16 / 9, minHeight: 200 }}>
              <DarshanPlayer url={darshan.url} title={darshan.title} />
            </View>
          ) : (
            <View style={{ height: 240, borderRadius: radii.xxl, backgroundColor: colors.videoTile, alignItems: 'center', justifyContent: 'center' }}>
              <Pressable
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel={t('library.darshanPlay')}
                style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                <PlayGlyph size={30} />
              </Pressable>
            </View>
          )}
          {openError ? <Banner tone="error" message={openError} /> : null}
          <Txt variant="fine" color="faint" center>
            {t('darshan.note')}
          </Txt>
        </>
      )}
    </Screen>
  );
}
