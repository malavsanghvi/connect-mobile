import { View } from 'react-native';

import { Button, Txt } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * The first-run notice of the usage logger (src/lib/activity-notice.ts): a calm card over the app, once per person and
 * community, and only when the community's recording is on. "Got it" carries on; "Turn off" stops it at once. An overlay in
 * the root navigator (like the legal step), not a native modal, so it never fights another pop-up for the screen.
 */
export function ActivityNoticeCard({ onGotIt, onTurnOff }: { onGotIt: () => void; onTurnOff: () => void }) {
  const t = useT();
  return (
    <View
      testID="activity-notice"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: space.gutter }}>
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 480, backgroundColor: colors.card, borderRadius: radii.cta, padding: space.gutter, gap: space.md }}>
        <Txt variant="title" style={{ fontFamily: fonts.display }} accessibilityRole="header">
          {t('activity.noticeTitle')}
        </Txt>
        <Txt variant="body">{t('activity.noticeBody')}</Txt>
        <View style={{ gap: space.sm }}>
          <Button label={t('activity.noticeGotIt')} onPress={onGotIt} />
          <Button label={t('activity.noticeTurnOff')} tone="secondary" onPress={onTurnOff} />
        </View>
      </View>
    </View>
  );
}
