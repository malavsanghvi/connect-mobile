import { useLocalSearchParams } from 'expo-router';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Card, Txt } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors } from '@/theme';

/** Niva assistant — placeholder until answers can come only from center-approved content with sources. */
export default function NivaScreen() {
  const t = useT();
  // A suggested question from the Niva button; the chat (a later task) will send it.
  const { q } = useLocalSearchParams<{ q?: string }>();
  return (
    <Screen title={t('niva.title')} niva={false}>
      {q ? (
        <Card tone="amber">
          <Txt variant="bodyStrong" color="brownDark">
            {q}
          </Txt>
        </Card>
      ) : null}
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
