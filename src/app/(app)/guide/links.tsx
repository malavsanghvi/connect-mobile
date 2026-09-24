import { Pressable, View } from 'react-native';

import { Markdownish } from '@/components/markdown';
import { Loaded } from '@/components/states';
import { Banner, Chevron, Txt, VStack } from '@/components/ui';
import { markFor, readCenterContact } from '@/features/guide';
import { GuideScreen, Mark, openExternal } from '@/features/guide-ui';
import { pickTranslation } from '@/i18n';
import { getGuideSection } from '@/lib/api/guide';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useSettings } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

/**
 * Website and links (Welcome.dc.html secLinks): one row per link with a
 * navy mark, name, sub and ›. Links come from the center's settings
 * (branding.website / branding.links); a "links" guide page is shown below.
 */
export default function LinksScreen() {
  const { t, language } = useSettings();
  const { center } = useApp();
  const { toast } = useFeedback();
  const contact = readCenterContact(center);
  const page = useLoad(() => (center ? getGuideSection(center.id, 'links') : Promise.resolve(null)), [center?.id], 'load the links page');

  return (
    <GuideScreen title={t('guide.linksTitle')}>
      <VStack gap={10}>
        {contact.links.map((l) => (
          <Pressable
            key={l.url}
            onPress={() => void openExternal(l.url, t('guide.openLink'), (msg) => toast(msg, 'error'))}
            accessibilityRole="link"
            accessibilityLabel={l.sub ? `${l.label}. ${l.sub}` : l.label}
            style={({ pressed }) => ({ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.8 : 1 })}>
            <Mark text={markFor(l.label)} tint="navy" size={40} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{l.label}</Txt>
              <Txt variant="caption" color="muted">
                {l.sub ?? l.url.replace(/^https?:\/\//i, '')}
              </Txt>
            </View>
            <Chevron />
          </Pressable>
        ))}
      </VStack>
      <Loaded state={page}>
        {(p) => {
          if (!p && contact.links.length === 0) return <Banner tone="info" message={t('guide.linksNone')} />;
          if (!p) return null;
          return <Markdownish source={pickTranslation({ title: p.title, body_md: p.body_md }, p.translations, language).body_md} />;
        }}
      </Loaded>
    </GuideScreen>
  );
}
