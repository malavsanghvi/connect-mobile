import { View } from 'react-native';

import { envStatus } from '@/lib/env';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

import { FullScreen } from './full-screen';
import { Icon } from './icon';
import { Card, Row, Txt } from './ui';

/** Shown instead of the app when the backend is not configured — never mock data. */
export function SetupScreen() {
  const t = useT();
  const vars = envStatus();
  return (
    <FullScreen>
      <Txt variant="eyebrow" color="brown">
        {t('setup.eyebrow')}
      </Txt>
      <Txt variant="display" color="navy" accessibilityRole="header">
        {t('setup.title')}
      </Txt>
      <Txt variant="body" color="ink2">
        {t('setup.body')}
      </Txt>
      <Card>
        {vars.map((v) => (
          <Row key={v.name} align="flex-start" gap={space.md} style={{ paddingVertical: space.sm }}>
            <Icon name={v.present ? 'checkmark-circle' : v.required ? 'close-circle' : 'ellipse-outline'} size={22} color={v.present ? colors.green : v.required ? colors.danger : colors.faint} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="smallStrong" selectable>
                {v.name}
              </Txt>
              <Txt variant="meta" color="muted">
                {v.present ? t('setup.present') : v.required ? t('setup.missing') : t('setup.optional')} · {v.purpose}
              </Txt>
            </View>
          </Row>
        ))}
      </Card>
      <View style={{ backgroundColor: colors.panel, borderRadius: radii.card, padding: space.lg, gap: space.sm }}>
        <Txt variant="smallStrong">{t('setup.howTitle')}</Txt>
        <Txt variant="meta" color="ink2" selectable>
          {t('setup.how')}
        </Txt>
      </View>
    </FullScreen>
  );
}
