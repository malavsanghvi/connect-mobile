import { useLocalSearchParams } from 'expo-router';

import { Markdownish } from '@/components/markdown';
import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Txt } from '@/components/ui';
import { pickTranslation } from '@/i18n';
import { getGuideSection } from '@/lib/api/guide';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useSettings } from '@/providers/settings';

export default function GuideSectionScreen() {
  const { t, language } = useSettings();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { center } = useApp();
  const state = useLoad(() => (center ? getGuideSection(center.id, slug) : Promise.resolve(null)), [center?.id, slug], 'load this guide page');
  return (
    <Screen title={t('guide.title')}>
      <Loaded state={state}>
        {(s) => {
          if (!s) return <EmptyState title={t('guide.pageMissing')} />;
          const tr = pickTranslation({ title: s.title, body_md: s.body_md }, s.translations, language);
          return (
            <>
              <Txt variant="title" color="navy" accessibilityRole="header">
                {tr.title}
              </Txt>
              <Markdownish source={tr.body_md} />
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}
