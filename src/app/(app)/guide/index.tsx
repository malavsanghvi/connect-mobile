import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Loaded } from '@/components/states';
import { Card, Chevron, ListRow, ProgressBar, Row, Txt, VStack } from '@/components/ui';
import { FIRST_STEP_KEYS, type FirstSteps } from '@/features/guide';
import { GuideScreen, Mark, guideFlagKey, useCommunity, useGuideFlag, type Tint } from '@/features/guide-ui';
import { pickTranslation, type StringKey } from '@/i18n';
import { listGuideSections, loadFirstStepFacts } from '@/lib/api/guide';
import { isGuideSectionVisible } from '@/lib/modules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useModules } from '@/providers/modules';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

type Section = 'whatsapp' | 'timings' | 'zones' | 'volunteer' | 'membership' | 'registrations' | 'admin' | 'links' | 'ask';

const HREF: Record<Section, Href> = {
  whatsapp: '/guide/whatsapp',
  timings: '/guide/timings',
  zones: '/guide/zones',
  volunteer: '/guide/volunteer',
  membership: '/guide/membership',
  registrations: '/guide/registrations',
  admin: '/guide/admin',
  links: '/guide/links',
  ask: '/guide/ask',
};

const TILES: { key: string; section: Section; mark: string; tint: Tint }[] = [
  { key: 'whatsapp', section: 'whatsapp', mark: 'WA', tint: 'green' },
  { key: 'timings', section: 'timings', mark: 'TM', tint: 'navy' },
  { key: 'zone', section: 'zones', mark: 'ZN', tint: 'brown' },
  { key: 'volunteer', section: 'volunteer', mark: 'VO', tint: 'green' },
  { key: 'membership', section: 'membership', mark: 'MB', tint: 'brown' },
  { key: 'registrations', section: 'registrations', mark: 'RG', tint: 'navy' },
  { key: 'admin', section: 'admin', mark: 'AD', tint: 'navy' },
  { key: 'links', section: 'links', mark: 'WB', tint: 'green' },
  { key: 'ask', section: 'ask', mark: '?', tint: 'brown' },
];

const STEP_SECTION: Record<keyof FirstSteps, Section> = { whatsapp: 'whatsapp', zone: 'zones', membership: 'membership', volunteer: 'volunteer', ask: 'ask' };

/**
 * "New to {center}" hub (Welcome.dc.html): navy hero with the first-steps
 * progress, the 5-step checklist, the 9 Explore tiles, then any extra pages
 * the center wrote (guide_sections). Open to guests. Steps and tiles of
 * switched-off modules (WhatsApp/ask: comms, volunteer: volunteers,
 * membership, extra pages: content) are left out.
 */
export default function GuideHubScreen() {
  const { t, language } = useSettings();
  const router = useRouter();
  const { center, member } = useApp();
  const community = useCommunity();
  const { map } = useModules();
  const sectionOn = (section: Section) => isGuideSectionVisible(map, section);
  const stepKeys = FIRST_STEP_KEYS.filter((k) => sectionOn(STEP_SECTION[k]));
  const tiles = TILES.filter((tile) => sectionOn(tile.section));
  const pagesOn = isGuideSectionVisible(map, 'pages');
  const facts = useLoad(() => (member ? loadFirstStepFacts(member.person.id) : Promise.resolve({ whatsapp: false, volunteer: false, ask: false })), [member?.person.id], 'check your first steps');
  const sections = useLoad(() => (center && pagesOn ? listGuideSections(center.id) : Promise.resolve([])), [center?.id, pagesOn], 'load the guide');
  const [zoneFlag] = useGuideFlag(guideFlagKey(member?.person.id, 'zone'));
  const [memFlag] = useGuideFlag(guideFlagKey(member?.person.id, 'membership'));

  const steps: FirstSteps = {
    whatsapp: !!facts.data?.whatsapp,
    zone: zoneFlag || !!member?.household?.zone_id,
    membership: memFlag,
    volunteer: !!facts.data?.volunteer,
    ask: !!facts.data?.ask,
  };
  const done = stepKeys.filter((k) => steps[k]).length;
  // Pages with their own native section are not repeated in "More from {center}".
  const extraPages = (sections.data ?? []).filter((s) => !s.is_checklist && !['timings', 'links', 'membership'].includes(s.slug));

  return (
    <GuideScreen title={t('guide.title', { center: community })}>
      <View style={{ backgroundColor: colors.navy, borderRadius: radii.pill, paddingVertical: 18, paddingHorizontal: space.gutter, gap: 10 }}>
        <Txt variant="meta" color="onNavy">
          {t('guide.heroEyebrow')}
        </Txt>
        <Txt variant="display" color="white" style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 29 }} accessibilityRole="header">
          {t('guide.heroTitle', { center: community })}
        </Txt>
        <Txt variant="meta" color="onNavy">
          {t('guide.heroBody', { center: community })}
        </Txt>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="meta" color="white" style={{ fontFamily: fonts.bodySemi }}>
            {t('guide.firstSteps')}
          </Txt>
          <Txt variant="meta" color="white" style={{ fontFamily: fonts.bodySemi }}>
            {t('guide.stepsDone', { n: done, total: stepKeys.length })}
          </Txt>
        </Row>
        <ProgressBar value={stepKeys.length ? done / stepKeys.length : 1} color={colors.onNavyGreen} track={colors.navyPanel} label={t('guide.stepsDone', { n: done, total: stepKeys.length })} />
      </View>

      {facts.error ? (
        <Pressable onPress={() => void facts.reload()} accessibilityRole="button">
          <Txt variant="meta" color="danger">
            {`${t('guide.stepsError')} · ${t('common.retry')}`}
          </Txt>
        </Pressable>
      ) : null}

      <Card style={{ paddingVertical: 4, paddingHorizontal: 14, gap: 0 }}>
        {stepKeys.map((k, i) => {
          const ok = steps[k];
          const label = t(`guide.step.${k}` as StringKey, { center: community });
          return (
            <Pressable
              key={k}
              onPress={() => router.push(HREF[STEP_SECTION[k]])}
              accessibilityRole="button"
              accessibilityLabel={ok ? `${label}, ${t('guide.stepDone')}` : label}
              style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6, borderBottomWidth: i < stepKeys.length - 1 ? 1 : 0, borderBottomColor: colors.divider, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.green, backgroundColor: ok ? colors.green : colors.card, alignItems: 'center', justifyContent: 'center' }}>
                {ok ? (
                  <Txt variant="caption" color="white" style={{ fontFamily: fonts.bodyBold }}>
                    ✓
                  </Txt>
                ) : null}
              </View>
              <Txt variant="body" color={ok ? 'faint' : 'ink'} style={{ flex: 1, fontFamily: fonts.bodyMedium }}>
                {label}
              </Txt>
              <Chevron />
            </Pressable>
          );
        })}
      </Card>

      <Txt variant="section" style={{ paddingTop: 4 }}>
        {t('guide.explore', { center: community })}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((tile) => {
          const label = t(`guide.tile.${tile.key}` as StringKey);
          const sub = t(`guide.tile.${tile.key}Sub` as StringKey);
          return (
            <Pressable
              key={tile.key}
              onPress={() => router.push(HREF[tile.section])}
              accessibilityRole="button"
              accessibilityLabel={`${label}. ${sub}`}
              style={({ pressed }) => ({
                flexBasis: '47%',
                flexGrow: 1,
                minHeight: 104,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radii.xl,
                padding: 14,
                gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}>
              <Mark text={tile.mark} tint={tile.tint} />
              <Txt variant="bodyStrong">{label}</Txt>
              <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                {sub}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {sections.error || extraPages.length > 0 ? (
        <VStack gap={space.sm}>
          <Txt variant="section" style={{ paddingTop: 4 }}>
            {t('guide.morePages', { center: community })}
          </Txt>
          <Loaded state={sections}>
            {() => (
              <Card>
                {extraPages.map((s) => {
                  const tr = pickTranslation({ title: s.title, body_md: s.body_md }, s.translations, language);
                  return <ListRow key={s.id} title={tr.title} onPress={() => router.push({ pathname: '/guide/[slug]', params: { slug: s.slug } })} />;
                })}
              </Card>
            )}
          </Loaded>
        </VStack>
      ) : null}

      {!member ? (
        <Txt variant="meta" color="muted" center style={{ minHeight: touch.min }}>
          {t('guide.guestNote')}
        </Txt>
      ) : null}
    </GuideScreen>
  );
}
