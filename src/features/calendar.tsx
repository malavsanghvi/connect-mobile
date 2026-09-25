import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, Row, Txt, VStack } from '@/components/ui';
import { loadCalendarMonth, loadCalendarRange, type CalendarLayer } from '@/lib/api/calendar';
import { AppError, logError, report } from '@/lib/errors';
import { addDays, formatDay, monthName, parseISODate, toISODate, todayAt, weekdayOf } from '@/lib/format';
import { tithiLabel, tithiShort } from '@/lib/rules';
import { readPref, writePref } from '@/lib/storage';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, components, fonts, radii, space } from '@/theme';

import { buildIcs, orderLayers, toWebcal, virSamvat } from './event-rules';
import { exportTextFile } from './media';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function layerColor(l: CalendarLayer | undefined): string {
  return l?.color && /^#[0-9A-Fa-f]{6}$/.test(l.color) ? l.color : colors.navy;
}

/** "Tuesday, Sep 22" for the selected-day heading. */
function longDay(iso: string): string {
  const p = parseISODate(iso);
  return p ? `${WEEKDAY_LONG[weekdayOf(iso)]}, ${monthName(p.m)} ${p.d}` : '';
}

/** Prototype layer chip: 1.5px border in the layer colour, filled when on, with a colour dot (L190–199). */
function LayerChip({ layer, on, onPress }: { layer: CalendarLayer; on: boolean; onPress: () => void }) {
  const c = layerColor(layer);
  const spec = components.layerChip;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={layer.name}
      accessibilityState={{ checked: on }}
      style={({ pressed }) => ({ minHeight: spec.h, borderRadius: spec.r, borderWidth: spec.borderWidth, borderColor: c, backgroundColor: on ? c : colors.card, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ width: spec.dot, height: spec.dot, borderRadius: spec.dot / 2, backgroundColor: on ? colors.white : c }} />
      <Txt variant="meta" style={{ fontFamily: fonts.bodySemi, color: on ? colors.white : c }}>
        {layer.name}
      </Txt>
    </Pressable>
  );
}

function NavCircle({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={2}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Txt variant="subhead" color="navy" style={{ fontFamily: fonts.body, lineHeight: 22 }}>
        {glyph}
      </Txt>
    </Pressable>
  );
}

/** Layered calendar: Jain tithi, Pathshala, events, school districts (prototype L186–236). */
export function CalendarView() {
  const t = useT();
  const { center } = useApp();
  const { toast } = useFeedback();
  const [today] = useState(() => todayAt(center?.time_zone));
  const start = parseISODate(today) ?? { y: 2026, m: 1, d: 1 };
  const [ym, setYm] = useState({ y: start.y, m: start.m });
  const [selected, setSelected] = useState(today);
  const [hidden, setHidden] = useState<string[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<CalendarLayer[] | null>(null);

  useEffect(() => {
    let alive = true;
    readPref<string[] | null>('calendarHiddenLayers', null).then((v) => {
      if (alive) setHidden(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const state = useLoad(() => (center ? loadCalendarMonth(center, ym.y, ym.m) : Promise.reject(new Error('no center'))), [center?.id, ym.y, ym.m], 'load the calendar');

  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : <LoadingState />;
  const { layers, items, tithis } = state.data;
  const { main, schools } = orderLayers(layers);
  const hiddenIds = hidden ?? layers.filter((l) => !l.default_on).map((l) => l.id);
  const visibleLayers = layers.filter((l) => !hiddenIds.includes(l.id));
  const tithiLayerOn = layers.some((l) => l.kind === 'tithi' && !hiddenIds.includes(l.id)) || !layers.some((l) => l.kind === 'tithi');
  const toggleLayer = (id: string) => {
    const next = hiddenIds.includes(id) ? hiddenIds.filter((x) => x !== id) : [...hiddenIds, id];
    setHidden(next);
    writePref('calendarHiddenLayers', next).catch((err: unknown) => logError('saving calendar layers on this device', err));
  };

  const first = toISODate(ym.y, ym.m, 1);
  const offset = weekdayOf(first);
  const daysInMonth = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
  const last = toISODate(ym.y, ym.m, daysInMonth);
  const cells: (string | null)[] = [...Array.from({ length: offset }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => toISODate(ym.y, ym.m, i + 1))];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const itemsOn = (date: string) => items.filter((it) => date === it.date && visibleLayers.some((l) => l.id === it.layerId));
  const selectedItems = itemsOn(selected);
  const selTithi = tithis[selected];
  const move = (delta: number) => {
    const m0 = ym.m - 1 + delta;
    const y = ym.y + Math.floor(m0 / 12);
    const m = (((m0 % 12) + 12) % 12) + 1;
    setYm({ y, m });
    setSelected(toISODate(y, m, 1));
  };
  const jainMonths = [tithis[first]?.month_name, tithis[last]?.month_name, ...Object.values(tithis).map((x) => x.month_name)].filter((v, i, a): v is string => !!v && a.indexOf(v) === i);
  const monthPair = jainMonths.length > 1 ? `${jainMonths[0]} – ${jainMonths[jainMonths.length - 1]}` : (jainMonths[0] ?? '');
  const samvat = virSamvat(last, tithis[last]?.month_name ?? null);
  const jainLine = [monthPair, samvat ? t('calendar.virSamvat', { year: samvat }) : null].filter(Boolean).join(' · ');

  const saveFile = async (chosen: CalendarLayer[]) => {
    if (!center) return;
    setSheet(null);
    setExporting(true);
    setExportError(null);
    try {
      const to = addDays(today, 365);
      const range = await loadCalendarRange(center, today, to);
      const ids = new Set(chosen.map((l) => l.id));
      const byId = new Map(range.layers.map((l) => [l.id, l]));
      const icsItems = range.items
        .filter((it) => ids.has(it.layerId))
        .map((it, i) => ({ uid: `${it.layerId}-${it.date}-${i}@community-connect`, date: it.date, title: it.title, description: it.sub, calendar: byId.get(it.layerId)?.name ?? '' }));
      if (icsItems.length === 0) throw new AppError(t('calendar.nothingToAdd'), 'no calendar items in range');
      const name = t('calendar.fileName', { center: center.short_name || center.name });
      const ics = buildIcs(name, icsItems, new Date());
      await exportTextFile(ics, `${name.replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'calendar'}.ics`, 'text/calendar', 'com.apple.ical.ics');
      toast(t('calendar.exported'));
    } catch (err) {
      setExportError(report(err, 'add these calendars to your phone').userMessage);
    } finally {
      setExporting(false);
    }
  };

  const addToPhone = () => {
    setExportError(null);
    if (visibleLayers.length === 0) return setExportError(t('calendar.noneSelected'));
    const feeds = visibleLayers.filter((l) => !!l.source_url);
    if (feeds.length) setSheet(feeds);
    else void saveFile(visibleLayers);
  };

  return (
    <VStack gap={space.md}>
      {layers.length ? (
        <VStack gap={space.sm}>
          <Txt variant="eyebrow" color="muted">
            {t('calendar.showCalendars')}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {main.map((l) => (
              <LayerChip key={l.id} layer={l} on={!hiddenIds.includes(l.id)} onPress={() => toggleLayer(l.id)} />
            ))}
          </View>
          {schools.length ? (
            <>
              <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body, paddingTop: 2 }}>
                {t('calendar.schoolCalendars')}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                {schools.map((l) => (
                  <LayerChip key={l.id} layer={l} on={!hiddenIds.includes(l.id)} onPress={() => toggleLayer(l.id)} />
                ))}
              </View>
            </>
          ) : null}
        </VStack>
      ) : null}
      <Card hero style={{ paddingTop: space.md, paddingHorizontal: space.sm, paddingBottom: 10 }}>
        <Row style={{ paddingHorizontal: space.xs }}>
          <NavCircle label={t('calendar.prevMonth')} glyph={'‹'} onPress={() => move(-1)} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt variant="subhead" style={{ fontFamily: fonts.displayBold }} accessibilityRole="header">{`${monthName(ym.m, true)} ${ym.y}`}</Txt>
            {jainLine ? (
              <Txt variant="caption" color="brown" style={{ fontFamily: fonts.bodySemi }}>
                {jainLine}
              </Txt>
            ) : null}
          </View>
          <NavCircle label={t('calendar.nextMonth')} glyph={'›'} onPress={() => move(1)} />
        </Row>
        <Row gap={0}>
          {DOW.map((d, i) => (
            <Txt key={`${d}${i}`} variant="fine" color="faint" center style={{ flex: 1, fontFamily: fonts.bodyBold }}>
              {d}
            </Txt>
          ))}
        </Row>
        <View style={{ gap: 2 }}>
          {weeks.map((week, wi) => (
            <Row key={wi} gap={2}>
              {week.map((date, di) => {
                if (!date) return <View key={di} style={{ flex: 1, minHeight: 58 }} />;
                const isSel = date === selected;
                const isToday = date === today;
                const dots = [...new Set(itemsOn(date).map((it) => it.layerId))].slice(0, 4);
                const tithi = tithis[date];
                return (
                  <Pressable
                    key={date}
                    onPress={() => setSelected(date)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSel }}
                    accessibilityLabel={`${formatDay(date)}${tithi ? `, ${tithiLabel(tithi)}` : ''}${dots.length ? `, ${dots.length} item(s)` : ''}`}
                    style={{
                      flex: 1,
                      minHeight: 58,
                      borderRadius: radii.md,
                      alignItems: 'center',
                      paddingTop: 4,
                      paddingBottom: 3,
                      gap: 1,
                      backgroundColor: isSel ? colors.navy : isToday ? colors.brownTint : 'transparent',
                      borderWidth: isToday && !isSel ? 1.5 : 0,
                      borderColor: colors.saffron,
                    }}>
                    <Txt variant="small" color={isSel ? 'white' : 'ink'} style={{ fontFamily: isSel || isToday ? fonts.bodyBold : fonts.body }}>
                      {String(parseISODate(date)?.d ?? '')}
                    </Txt>
                    <View style={{ height: 11 }}>
                      {tithi && tithiLayerOn ? (
                        <Txt variant="fine" color={isSel ? 'onNavy' : 'brown'} style={{ fontSize: 9, lineHeight: 11, fontFamily: fonts.bodySemi }} numberOfLines={1}>
                          {tithiShort(tithi)}
                        </Txt>
                      ) : null}
                    </View>
                    <Row gap={2} style={{ height: 6 }}>
                      {dots.map((id) => (
                        <View key={id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: layerColor(layers.find((l) => l.id === id)) }} />
                      ))}
                    </Row>
                  </Pressable>
                );
              })}
            </Row>
          ))}
        </View>
      </Card>
      <Row style={{ justifyContent: 'space-between' }} align="baseline" gap={space.sm}>
        <Txt variant="section" style={{ flexShrink: 1 }}>
          {longDay(selected)}
        </Txt>
        {selTithi && tithiLayerOn ? (
          <Txt variant="caption" color="brown" style={{ fontFamily: fonts.bodySemi, flexShrink: 1, textAlign: 'right' }}>
            {`${tithiLabel(selTithi)}${selTithi.is_parva ? ` · ${t('calendar.parva')}` : ''}`}
          </Txt>
        ) : null}
      </Row>
      {selectedItems.length === 0 ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed2, backgroundColor: colors.card, borderRadius: radii.card, padding: 14 }}>
          <Txt variant="meta" color="faint" center>
            {t('calendar.nothing')}
          </Txt>
        </View>
      ) : (
        <VStack gap={space.sm}>
          {selectedItems.map((it, i) => {
            const layer = layers.find((l) => l.id === it.layerId);
            return (
              <View key={`${it.title}-${i}`} style={{ flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.card, paddingVertical: 10, paddingHorizontal: space.md }}>
                <View style={{ width: 4, borderRadius: 2, backgroundColor: layerColor(layer) }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="smallStrong">{it.title}</Txt>
                  <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                    {[it.sub, layer?.name].filter(Boolean).join(' · ')}
                  </Txt>
                  {it.notes ? (
                    <Txt variant="caption" color="ink2" style={{ fontFamily: fonts.body }} numberOfLines={4}>
                      {it.notes}
                    </Txt>
                  ) : null}
                  {it.link ? <EntryLink url={it.link} /> : null}
                </View>
              </View>
            );
          })}
        </VStack>
      )}
      {exportError ? <Banner tone="error" message={exportError} /> : null}
      <Button label={exporting ? t('calendar.addingToPhone') : t('calendar.addToPhone')} tone="secondary" size="card" busy={exporting} onPress={addToPhone} />
      <Txt variant="fine" color="faint" center>
        {t('calendar.disclaimer')}
      </Txt>
      {sheet ? <FeedSheet feeds={sheet} onClose={() => setSheet(null)} onSaveFile={() => void saveFile(visibleLayers)} /> : null}
    </VStack>
  );
}

/** A subscribed calendar's link on an entry (a Zoom session, a form): opens in the browser. */
function EntryLink({ url }: { url: string }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    setError(null);
    try {
      await Linking.openURL(url);
    } catch (err) {
      setError(report(err, 'open the link').userMessage);
    }
  };
  return (
    <View style={{ gap: 4, paddingTop: 2 }}>
      <Pressable onPress={() => void open()} accessibilityRole="link" accessibilityLabel={`${t('calendar.openLink')}: ${url}`} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Txt variant="caption" color="navy" style={{ fontFamily: fonts.bodySemi }} numberOfLines={1}>
          {`${t('calendar.openLink')} ›`}
        </Txt>
      </Pressable>
      {error ? <Banner tone="error" message={error} /> : null}
    </View>
  );
}

/** When a chosen calendar has a live ICS feed, offer to subscribe to it as well as saving a file. */
function FeedSheet({ feeds, onClose, onSaveFile }: { feeds: CalendarLayer[]; onClose: () => void; onSaveFile: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const subscribe = async (l: CalendarLayer) => {
    setError(null);
    try {
      await Linking.openURL(toWebcal(l.source_url as string));
    } catch (err) {
      setError(report(err, `subscribe to ${l.name}`).userMessage);
    }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrimSheet }} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View accessibilityViewIsModal style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, padding: space.xl, paddingBottom: space.xl + insets.bottom, gap: space.md }}>
        <Txt variant="title" color="navy" accessibilityRole="header">
          {t('calendar.subscribeTitle')}
        </Txt>
        <Txt variant="small" color="ink2">
          {t('calendar.subscribeBody', { n: feeds.length })}
        </Txt>
        <Txt variant="eyebrow" color="muted">
          {t('calendar.subscribeFeeds')}
        </Txt>
        {feeds.map((l) => (
          <Button key={l.id} label={l.name} tone="secondary" size="md" onPress={() => void subscribe(l)} />
        ))}
        {error ? <Banner tone="error" message={error} /> : null}
        <Button label={t('calendar.saveFile')} onPress={onSaveFile} />
        <Button label={t('common.cancel')} tone="ghost" size="sm" onPress={onClose} />
      </View>
    </Modal>
  );
}

