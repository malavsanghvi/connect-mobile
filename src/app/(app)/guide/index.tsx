import { useRouter } from 'expo-router';

import { Icon, type IconName } from '@/components/icon';
import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Card, Divider, ListRow, SectionTitle, Txt } from '@/components/ui';
import { pickTranslation } from '@/i18n';
import { listGuideSections } from '@/lib/api/guide';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useSettings } from '@/providers/settings';
import { colors } from '@/theme';

/** New-to-center guide (docs/PROTOTYPE_WELCOME_GUIDE.md): center pages + zone finder, WhatsApp, ask a question. Open to guests. */
export default function GuideScreen() {
  const { t, language } = useSettings();
  const router = useRouter();
  const { center, member } = useApp();
  const state = useLoad(() => (center ? listGuideSections(center.id) : Promise.resolve([])), [center?.id], 'load the guide');
  const tools: { icon: IconName; title: string; sub: string; href: '/guide/zones' | '/guide/whatsapp' | '/guide/ask'; needsMember: boolean }[] = [
    { icon: 'location-outline', title: t('guide.zoneTitle'), sub: t('guide.zoneSub'), href: '/guide/zones', needsMember: false },
    { icon: 'logo-whatsapp', title: t('guide.waTitle'), sub: t('guide.waSub'), href: '/guide/whatsapp', needsMember: true },
    { icon: 'chatbubble-ellipses-outline', title: t('guide.askTitle'), sub: t('guide.askSub'), href: '/guide/ask', needsMember: true },
  ];
  return (
    <Screen title={t('guide.title')} tabBar={false}>
      <Card tone="navy">
        <Txt variant="title" color="white" accessibilityRole="header">
          {t('guide.heroTitle')}
        </Txt>
        <Txt variant="small" color="onNavy">
          {t('guide.heroBody', { center: center?.name ?? '' })}
        </Txt>
      </Card>
      <SectionTitle>{t('guide.getConnected')}</SectionTitle>
      <Card>
        {tools
          .filter((x) => member || !x.needsMember)
          .map((x) => (
            <ListRow key={x.href} title={x.title} subtitle={x.sub} onPress={() => router.push(x.href)} left={<Icon name={x.icon} size={22} color={colors.navy} />} />
          ))}
      </Card>
      <SectionTitle>{t('guide.explore')}</SectionTitle>
      <Loaded state={state}>
        {(sections) =>
          sections.length === 0 ? (
            <EmptyState icon="compass-outline" title={t('guide.noSections')} />
          ) : (
            <Card>
              {sections.map((s) => {
                const tr = pickTranslation({ title: s.title, body_md: s.body_md }, s.translations, language);
                return (
                  <ListRow
                    key={s.id}
                    title={tr.title}
                    subtitle={s.is_checklist ? t('guide.firstSteps') : null}
                    onPress={() => router.push({ pathname: '/guide/[slug]', params: { slug: s.slug } })}
                  />
                );
              })}
            </Card>
          )
        }
      </Loaded>
      {!member ? (
        <>
          <Divider />
          <Txt variant="meta" color="muted">
            {t('guide.guestNote')}
          </Txt>
        </>
      ) : null}
    </Screen>
  );
}
