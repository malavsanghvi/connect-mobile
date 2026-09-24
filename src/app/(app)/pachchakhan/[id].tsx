import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Band, Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Button, Card, Txt, VStack } from '@/components/ui';
import { pickTranslation } from '@/i18n';
import { getContentItem } from '@/lib/api/jainway';
import { report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useSettings } from '@/providers/settings';
import { colors, space } from '@/theme';

/** Pachchakhan detail (prototype §2.18). Text and audio come from the center's approved content. */
export default function PachchakhanScreen() {
  const { t, language } = useSettings();
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLoad(() => getContentItem(id), [id], 'load this pachchakhan');
  return (
    <Screen title={t('library.pachTitle')}>
      <Loaded state={state}>
        {(item) => {
          const tr = pickTranslation({ title: item.title, body_md: item.body_md ?? '' }, item.translations, language);
          const meta = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? (item.metadata as Record<string, unknown>) : {};
          const listen = async () => {
            if (!item.media_url) return;
            try {
              await WebBrowser.openBrowserAsync(item.media_url);
            } catch (err) {
              report(err, 'play the recitation');
            }
          };
          return (
            <VStack gap={space.lg}>
              <Band color={colors.navy} title={tr.title} subtitle={typeof meta.when === 'string' ? meta.when : undefined} />
              {typeof meta.what === 'string' ? (
                <Txt variant="body" color="ink2">
                  {meta.what}
                </Txt>
              ) : null}
              <Card>
                <Txt variant="eyebrow" color="muted">
                  {t('library.sutra')}
                </Txt>
                <Txt variant="body" selectable>
                  {tr.body_md || t('library.sutraPending')}
                </Txt>
              </Card>
              {item.media_url ? <Button label={t('library.listen')} icon="play-circle-outline" onPress={listen} /> : null}
              <Txt variant="meta" color="muted">
                {t('library.guidance')}
              </Txt>
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
