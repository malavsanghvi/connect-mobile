import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Card, Txt } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors } from '@/theme';

/** Niva assistant — placeholder until answers can come only from center-approved content with sources. */
export default function NivaScreen() {
  const t = useT();
  return (
    <Screen title={t('niva.title')}>
      <Card tone="panel" style={{ alignItems: 'center' }}>
        <Icon name="chatbubble-ellipses-outline" size={40} color={colors.saffron} />
        <Txt variant="headline" color="navy" center>
          {t('niva.comingSoon')}
        </Txt>
        <Txt variant="small" color="ink2" center>
          {t('niva.body')}
        </Txt>
      </Card>
    </Screen>
  );
}
