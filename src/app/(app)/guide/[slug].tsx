import { useLocalSearchParams } from 'expo-router';

import { Markdownish } from '@/components/markdown';
import { EmptyState, Loaded } from '@/components/states';
import { GuideScreen, useCommunity } from '@/features/guide-ui';
import { pickTranslation } from '@/i18n';
import { getGuideSection } from '@/lib/api/guide';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useSettings } from '@/providers/settings';

/** A page the center wrote for its guide (guide_sections), outside the built-in sections. */
export default function GuideSectionScreen() {
  const { t, language } = useSettings();
  const community = useCommunity();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { center } = useApp();
  const state = useLoad(() => (center ? getGuideSection(center.id, slug) : Promise.resolve(null)), [center?.id, slug], 'load this guide page');
  const tr = state.data ? pickTranslation({ title: state.data.title, body_md: state.data.body_md }, state.data.translations, language) : null;
  return (
    <GuideScreen title={tr?.title ?? t('guide.title', { center: community })}>
      <Loaded state={state}>{(s) => (!s || !tr ? <EmptyState title={t('guide.pageMissing')} /> : <Markdownish source={tr.body_md} />)}</Loaded>
    </GuideScreen>
  );
}
