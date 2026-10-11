import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/states';
import { Row, Txt } from '@/components/ui';
import { parseTimingsTable } from '@/features/guide';
import { pickTranslation } from '@/i18n';
import { getGuideSection } from '@/lib/api/guide';
import { isGuideSectionVisible } from '@/lib/modules';
import { serviceTimeRows, type ServiceTime } from '@/lib/service-times';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useCategory } from '@/providers/category';
import { useModules } from '@/providers/modules';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * The generic Today widget of the member-app template (widgets.today.variant "service_times", src/lib/template.ts): the
 * community's own times, as the administrator set them up in the guide's "timings" page (a | What | When | table, translated
 * like the guide), under the greeting and the date of the basic Today card. It names no faith and no practice: the words are the
 * community's own and the dictionary's, with the kind of organization's place word (its terms: "office", "church", …).
 *
 * It reads what Life@{community}'s Timings tile opens (guide/timings), which is public like Today's timings, and follows the
 * same module rule: nothing here when the community has the Timings page switched off. A failure to read says so, with Try again.
 */
export function ServiceTimes() {
  const { t, language } = useSettings();
  const router = useRouter();
  const { center } = useApp();
  const { map } = useModules();
  const { profile } = useCategory();
  const on = isGuideSectionVisible(map, 'timings');
  const community = center?.short_name || center?.name || '';
  const state = useLoad(
    async (): Promise<ServiceTime[]> => {
      if (!center || !on) return [];
      const page = await getGuideSection(center.id, 'timings');
      const tr = page ? pickTranslation({ title: page.title, body_md: page.body_md }, page.translations, language) : null;
      return serviceTimeRows(tr ? parseTimingsTable(tr.body_md).rows : []);
    },
    [center?.id, on, language],
    'load the times',
  );
  if (!on) return null;
  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : <LoadingState />;
  const rows = state.data;
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="meta" color="muted">
        {t('home.serviceTimesLead', { place: profile.terms.place })}
      </Txt>
      {rows.length ? (
        <View style={{ backgroundColor: colors.panel, borderRadius: radii.md, paddingHorizontal: space.md }}>
          {rows.map((r, i) => (
            <Row key={`${r.what}-${i}`} gap={space.md} style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}>
              <Txt variant="small" color="ink2" style={{ flexShrink: 1 }}>
                {r.what}
              </Txt>
              <Txt variant="smallStrong" style={{ textAlign: 'right', flexShrink: 1 }}>
                {r.when}
              </Txt>
            </Row>
          ))}
        </View>
      ) : (
        <Txt variant="small" color="muted">
          {t('home.serviceTimesNone', { center: community })}
        </Txt>
      )}
      <Pressable
        onPress={() => router.push('/guide/timings')}
        accessibilityRole="link"
        hitSlop={6}
        style={({ pressed }) => ({ minHeight: 40, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Txt variant="meta" color="navy" style={{ fontFamily: fonts.bodySemi }}>
          {t('home.serviceTimesAll')}
        </Txt>
      </Pressable>
    </View>
  );
}
