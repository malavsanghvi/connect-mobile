import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/states';
import { Card, Chip, ChipGroup, IconButton, Row, Txt, VStack } from '@/components/ui';
import { loadCalendarMonth, type CalendarLayer } from '@/lib/api/calendar';
import { formatDay, monthName, parseISODate, toISODate, todayAt, weekdayOf } from '@/lib/format';
import { tithiLabel, tithiShort } from '@/lib/rules';
import { readPref, writePref } from '@/lib/storage';
import { logError } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function layerColor(l: CalendarLayer): string {
  return l.color && /^#[0-9A-Fa-f]{6}$/.test(l.color) ? l.color : colors.navy;
}

/** Layered calendar: Jain tithi, Pathshala, events, school districts (prototype §2.2 Calendar). */
export function CalendarView() {
  const t = useT();
  const { center } = useApp();
  const [today] = useState(() => todayAt(center?.time_zone));
  const start = parseISODate(today) ?? { y: 2026, m: 1, d: 1 };
  const [ym, setYm] = useState({ y: start.y, m: start.m });
  const [selected, setSelected] = useState(today);
  const [hidden, setHidden] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    readPref<string[] | null>('calendarHiddenLayers', null).then((v) => alive && setHidden(v));
    return () => {
      alive = false;
    };
  }, []);

  const state = useLoad(() => (center ? loadCalendarMonth(center, ym.y, ym.m) : Promise.reject(new Error('no center'))), [center?.id, ym.y, ym.m], 'load the calendar');

  if (state.data === undefined) return state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : <LoadingState />;
  const { layers, items, tithis } = state.data;
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
  const cells: (string | null)[] = [...Array.from({ length: offset }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => toISODate(ym.y, ym.m, i + 1))];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const itemsOn = (date: string) => items.filter((it) => date === it.date && visibleLayers.some((l) => l.id === it.layerId));
  const selectedItems = itemsOn(selected);
  const selTithi = tithis[selected];
  const move = (delta: number) => {
    const m0 = ym.m - 1 + delta;
    const y = ym.y + Math.floor(m0 / 12);
    const m = ((m0 % 12) + 12) % 12 + 1;
    setYm({ y, m });
    setSelected(toISODate(y, m, 1));
  };
  const monthTithis = Object.values(tithis);
  const jainMonths = [...new Set(monthTithis.map((x) => x.month_name))].join(' – ');

  return (
    <VStack gap={space.md}>
      {layers.length ? (
        <VStack gap={space.xs}>
          <Txt variant="eyebrow" color="muted">
            {t('calendar.showCalendars')}
          </Txt>
          <ChipGroup>
            {layers.map((l) => (
              <Chip key={l.id} label={l.name} selected={!hiddenIds.includes(l.id)} onPress={() => toggleLayer(l.id)} />
            ))}
          </ChipGroup>
        </VStack>
      ) : null}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" label={t('calendar.prevMonth')} onPress={() => move(-1)} />
          <View style={{ alignItems: 'center' }}>
            <Txt variant="headline" color="navy" accessibilityRole="header">{`${monthName(ym.m, true)} ${ym.y}`}</Txt>
            {jainMonths ? (
              <Txt variant="meta" color="muted">
                {jainMonths}
              </Txt>
            ) : null}
          </View>
          <IconButton icon="chevron-forward" label={t('calendar.nextMonth')} onPress={() => move(1)} />
        </Row>
        <Row gap={4}>
          {DOW.map((d, i) => (
            <Txt key={`${d}${i}`} variant="caption" color="muted" center style={{ flex: 1 }}>
              {d}
            </Txt>
          ))}
        </Row>
        {weeks.map((week, wi) => (
          <Row key={wi} gap={4}>
            {week.map((date, di) => {
              if (!date) return <View key={di} style={{ flex: 1, minHeight: touch.min + 12 }} />;
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
                    minHeight: touch.min + 12,
                    borderRadius: radii.md,
                    alignItems: 'center',
                    paddingVertical: 4,
                    backgroundColor: isSel ? colors.navy : isToday ? colors.brownTint : 'transparent',
                    borderWidth: isToday && !isSel ? 1.5 : 0,
                    borderColor: colors.saffron,
                  }}>
                  <Txt variant="smallStrong" color={isSel ? 'white' : 'ink'}>
                    {String(parseISODate(date)?.d ?? '')}
                  </Txt>
                  {tithi && tithiLayerOn ? (
                    <Txt variant="fine" color={isSel ? 'onNavy' : 'muted'} style={{ fontSize: 9 }} numberOfLines={1}>
                      {tithiShort(tithi)}
                    </Txt>
                  ) : null}
                  <Row gap={2}>
                    {dots.map((id) => (
                      <View key={id} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: layerColor(layers.find((l) => l.id === id) as CalendarLayer) }} />
                    ))}
                  </Row>
                </Pressable>
              );
            })}
          </Row>
        ))}
      </Card>
      <VStack gap={space.sm}>
        <Txt variant="headline" color="navy">
          {formatDay(selected)}
        </Txt>
        {selTithi ? (
          <Txt variant="meta" color="muted">
            {tithiLabel(selTithi)}
            {selTithi.is_parva ? ` · ${t('calendar.parva')}` : ''}
          </Txt>
        ) : null}
        {selectedItems.length === 0 ? (
          <Txt variant="small" color="muted">
            {t('calendar.nothing')}
          </Txt>
        ) : (
          selectedItems.map((it, i) => {
            const layer = layers.find((l) => l.id === it.layerId);
            return (
              <Card key={`${it.title}-${i}`} padded={false} style={{ flexDirection: 'row', overflow: 'hidden' }}>
                <View style={{ width: 4, backgroundColor: layer ? layerColor(layer) : colors.navy }} />
                <View style={{ padding: space.md, flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong">{it.title}</Txt>
                  <Txt variant="meta" color="muted">
                    {[it.sub, layer?.name].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
              </Card>
            );
          })
        )}
      </VStack>
      <Txt variant="fine" color="muted">
        {t('calendar.disclaimer')}
      </Txt>
    </VStack>
  );
}
