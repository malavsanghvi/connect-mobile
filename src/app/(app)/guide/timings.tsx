import { View } from 'react-native';

import { Markdownish } from '@/components/markdown';
import { Loaded } from '@/components/states';
import { Banner, Button, Card, Row, Txt } from '@/components/ui';
import { directionsUrl, parseTimingsTable, readCenterContact, telUrl } from '@/features/guide';
import { GuideFootnote, GuideScreen, openExternal } from '@/features/guide-ui';
import { pickTranslation } from '@/i18n';
import { getGuideSection, todayTimings } from '@/lib/api/guide';
import { formatTimeOfDay, todayAt } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useSettings } from '@/providers/settings';
import { colors, space } from '@/theme';

/**
 * Timings and visiting (Welcome.dc.html secTimings): timing rows, address
 * card with Directions and Call the office. Rows come from today's
 * daily_timings plus the center's "timings" guide page (a | What | When |
 * table); the address and phone come from the center's settings.
 */
export default function TimingsScreen() {
  const { t, language } = useSettings();
  const { center } = useApp();
  const { toast } = useFeedback();
  const today = todayAt(center?.time_zone);
  const state = useLoad(
    async () => {
      if (!center) return { page: null, daily: null };
      const [page, daily] = await Promise.all([getGuideSection(center.id, 'timings'), todayTimings(center.id, today)]);
      return { page, daily };
    },
    [center?.id, today],
    'load the timings',
  );
  const contact = readCenterContact(center);
  const maps = directionsUrl(contact);
  const tel = telUrl(contact.phone);
  const open = (url: string, action: string) => void openExternal(url, action, (msg) => toast(msg, 'error'));

  return (
    <GuideScreen title={t('guide.timingsTitle')}>
      <Loaded state={state}>
        {({ page, daily }) => {
          const tr = page ? pickTranslation({ title: page.title, body_md: page.body_md }, page.translations, language) : null;
          const parsed = tr ? parseTimingsTable(tr.body_md) : { rows: [], note: '' };
          const rows = [
            ...(daily?.temple_open || daily?.temple_close
              ? [{ what: t('guide.derasarToday'), when: [formatTimeOfDay(daily.temple_open), formatTimeOfDay(daily.temple_close)].filter(Boolean).join(' – ') }]
              : []),
            ...(daily?.aarti ? [{ what: t('guide.aartiToday'), when: formatTimeOfDay(daily.aarti) }] : []),
            ...parsed.rows,
          ];
          return (
            <>
              {rows.length ? (
                <Card style={{ paddingVertical: 6, gap: 0 }}>
                  {rows.map((r, i) => (
                    <Row key={`${r.what}-${i}`} gap={10} style={{ justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}>
                      <Txt variant="small" color="ink2" style={{ flexShrink: 1 }}>
                        {r.what}
                      </Txt>
                      <Txt variant="smallStrong" style={{ textAlign: 'right', flexShrink: 1 }}>
                        {r.when}
                      </Txt>
                    </Row>
                  ))}
                </Card>
              ) : (
                <Banner tone="info" message={t('guide.timingsNone')} />
              )}
              {parsed.note ? <Markdownish source={parsed.note} /> : null}
            </>
          );
        }}
      </Loaded>

      <Card>
        {contact.placeName || center?.name ? <Txt variant="bodyStrong">{contact.placeName ?? center?.name ?? ''}</Txt> : null}
        {contact.address ? (
          <Txt variant="small" color="ink2" selectable>
            {contact.address}
          </Txt>
        ) : (
          <Txt variant="small" color="muted">
            {t('guide.addressNone')}
          </Txt>
        )}
        {contact.addressNote ? (
          <Txt variant="meta" color="muted">
            {contact.addressNote}
          </Txt>
        ) : null}
        {maps || tel ? (
          <View style={{ flexDirection: 'row', gap: space.sm, paddingTop: 6 }}>
            {maps ? (
              <View style={{ flex: 1 }}>
                <Button label={t('guide.directions')} size="sm" onPress={() => open(maps, t('guide.openMaps'))} />
              </View>
            ) : null}
            {tel ? (
              <View style={{ flex: 1 }}>
                <Button label={t('guide.callOffice')} tone="secondary" size="sm" onPress={() => open(tel, t('guide.openPhone'))} />
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>
      <GuideFootnote>{t('guide.timingsFootnote')}</GuideFootnote>
    </GuideScreen>
  );
}
