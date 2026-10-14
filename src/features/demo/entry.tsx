import { View } from 'react-native';

import { Button, SectionTitle, Txt } from '@/components/ui';
import { useDemo } from '@/providers/demo';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * "Try the demo" on "Find your community", under the join-code area: a person can look around the app as a family, a volunteer or a
 * teacher without installing anything or having a community. Not shown when this build has no demo address configured.
 */
export function DemoEntry() {
  const t = useT();
  const demo = useDemo();
  if (!demo.available) return null;
  return (
    <View style={{ gap: space.sm }}>
      <SectionTitle>{t('demo.entryTitle')}</SectionTitle>
      <Txt variant="small" color="ink2">
        {t('demo.entryBody')}
      </Txt>
      <Button label={t('demo.entryButton')} accessibilityHint={t('demo.entryHint')} onPress={demo.openChooser} />
    </View>
  );
}
