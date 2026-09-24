import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, ProgressBar, Txt } from '@/components/ui';
import { GyanHeaderChips } from '@/features/gyan-header';
import { Button3D } from '@/features/gyan-ui';
import { goalProgress, isLevelDone, loadGyan, type GyanData, type GyanGoal } from '@/lib/api/gyan';
import { logError } from '@/lib/errors';
import { currentChapter, levelStars, mapLayout, tintBackground } from '@/lib/learning';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, shadows, space } from '@/theme';

/** Gyan Path map for one goal (GyanPath.dc.html L71–96): zigzag levels that unlock strictly in order. */
export default function GyanGoalScreen() {
  const t = useT();
  const router = useRouter();
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const { center, member } = useApp();
  const state = useLoad(() => (center && member ? loadGyan(center, [member.person.id]) : Promise.reject(new Error('not signed in'))), [center?.id, member?.person.id], 'load Gyan Path');
  const goal = state.data?.goals.find((x) => x.id === goalId) ?? null;
  const p = goal && member && state.data ? goalProgress(goal, state.data.progress, member.person.id) : null;

  const play = () => {
    if (!goal || !p) return;
    if (p.complete || !p.currentLevel) router.dismissTo('/gyan');
    else router.push({ pathname: '/gyan/[goalId]/level/[levelId]', params: { goalId: goal.id, levelId: p.currentLevel.id } });
  };

  return (
    <Screen
      title={goal?.name ?? t('learn.gyanPath')}
      tabBar={false}
      niva={false}
      scroll={false}
      headerRight={<GyanHeaderChips />}
      contentStyle={{ flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, maxWidth: undefined }}
      footer={
        goal && p && goal.levels.length > 0 ? (
          <Button3D
            label={p.complete || !p.currentLevel ? t('learn.goalCompleteCta') : t('learn.play', { level: p.levelsDone + 1, name: p.currentLevel.name })}
            bg={colors.saffron}
            edge={colors.brown}
            onPress={play}
          />
        ) : undefined
      }>
      <Loaded state={state}>{(g) => (goal && member ? <GoalMap data={g} goal={goal} personId={member.person.id} /> : <EmptyState title={t('learn.goalMissing')} />)}</Loaded>
    </Screen>
  );
}

function GoalMap({ data, goal, personId }: { data: GyanData; goal: GyanGoal; personId: string }) {
  const t = useT();
  const router = useRouter();
  const { member } = useApp();
  const { toast } = useFeedback();
  const [width, setWidth] = useState(360);
  const p = goalProgress(goal, data.progress, personId);
  const total = goal.levels.length;
  const current = p.levelsDone;
  const tint = goal.tint ?? colors.navy;
  const { items, height } = mapLayout(goal.levels, current, width);
  const last = goal.levels[total - 1];
  const signoff = last ? data.signoffs.find((s) => s.level_id === last.id && s.person_id === personId) : undefined;
  const chapter = currentChapter(goal.levels, current);
  const minutes = member?.person.gyan_daily_minutes ?? 10;
  const chapterColors = [tint, colors.purple, colors.green, colors.brownDark].filter((c, i, a) => a.indexOf(c) === i);
  const centers = items.filter((i) => i.kind === 'node').map((n) => (n.kind === 'node' ? `${n.x},${n.y + n.size / 2}` : ''));
  const doneCenters = centers.slice(0, Math.min(current + 1, centers.length));

  const open = (index: number) => {
    const level = goal.levels[index];
    if (index > current) {
      toast(t('learn.locked', { level: current + 1 }), 'info');
      return;
    }
    if (index < current) toast(t('learn.replay', { level: index + 1 }), 'info');
    router.push({ pathname: '/gyan/[goalId]/level/[levelId]', params: { goalId: goal.id, levelId: level.id } });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: tintBackground(goal.tint) }} stickyHeaderIndices={[0]} contentContainerStyle={{ paddingBottom: space.xl }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <View style={[{ backgroundColor: colors.card, borderRadius: radii.row, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: space.md }, shadows.strip]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
              {chapter ? t('learn.mapStrip', { chapter, min: minutes }) : t('learn.mapStripNoChapter', { min: minutes })}
            </Txt>
            <ProgressBar value={total ? current / total : 0} color={colors.green} track={colors.divider} height={8} label={t('learn.progress', { done: current, n: total })} />
          </View>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy }}>{`${current}/${total}`}</Text>
        </View>
      </View>
      <View style={{ maxWidth: 480, width: '100%', alignSelf: 'center' }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {p.complete ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <Banner
              tone={signoff?.status === 'approved' ? 'success' : 'info'}
              message={signoff?.status === 'approved' ? t('learn.signedOff') : signoff?.status === 'needs_work' ? t('learn.needsWork') : signoff ? t('learn.signoffRequested') : t('learn.goalDoneSignoff')}
            />
          </View>
        ) : null}
        {total === 0 ? (
          <View style={{ padding: 16 }}>
            <EmptyState title={t('learn.noLevels')} />
          </View>
        ) : (
          <View style={{ height, marginTop: 8 }}>
            <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
              <Polyline points={centers.join(' ')} fill="none" stroke={colors.dashed2} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 14" />
              {doneCenters.length > 1 ? <Polyline points={doneCenters.join(' ')} fill="none" stroke={colors.green} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 16" /> : null}
            </Svg>
            {items.map((it) =>
              it.kind === 'chapter' ? (
                <View
                  key={`ch-${it.y}`}
                  style={{ position: 'absolute', left: 20, right: 20, top: it.y, height: 44, borderRadius: radii.card, backgroundColor: chapterColors[it.chapterIndex % chapterColors.length], alignItems: 'center', justifyContent: 'center' }}
                  accessibilityRole="header">
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.5, color: colors.white }}>{it.label.toUpperCase()}</Text>
                </View>
              ) : (
                <MapNode
                  key={goal.levels[it.index].id}
                  x={it.x}
                  y={it.y}
                  size={it.size}
                  index={it.index}
                  name={goal.levels[it.index].name}
                  treasure={!!goal.levels[it.index].treasure}
                  boss={it.index === total - 1}
                  done={isLevelDone(goal.levels[it.index], data.progress, personId)}
                  current={it.index === current}
                  locked={it.index > current}
                  stars={levelStars(goal.levels[it.index].steps.map((s) => data.progress.find((pr) => pr.person_id === personId && pr.step_id === s.id)?.stars ?? 0))}
                  onPress={() => open(it.index)}
                />
              ),
            )}
          </View>
        )}
        <Txt variant="fine" color="muted" center style={{ paddingHorizontal: 20 }}>
          {t('learn.contentNote')}
        </Txt>
      </View>
    </ScrollView>
  );
}

function MapNode(props: { x: number; y: number; size: number; index: number; name: string; treasure: boolean; boss: boolean; done: boolean; current: boolean; locked: boolean; stars: number; onPress: () => void }) {
  const t = useT();
  const { x, y, size, index, name, treasure, boss, done, current, locked, stars, onPress } = props;
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!current) return;
    let loop: Animated.CompositeAnimation | null = null;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!alive || reduce) return;
        loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }));
        loop.start();
      })
      .catch((err: unknown) => logError('checking reduce-motion for the Gyan Path map', err));
    return () => {
      alive = false;
      loop?.stop();
    };
  }, [current, pulse]);

  const bg = done ? colors.green : current ? colors.badge : boss ? colors.frame : colors.nodeLocked;
  const ring = done ? colors.nodeRingDone : current ? colors.nodeRingCurrent : colors.white;
  const edge = done ? colors.greenDark : current ? colors.brown : colors.checkGrey;
  const fg = done || current ? colors.white : colors.faint;
  const icon = done ? '✓' : current ? String(index + 1) : boss ? '♛' : treasure ? '◆' : String(index + 1);
  const radius = boss ? 22 : size / 2;
  const status = done ? t('learn.done') : current ? t('learn.current') : t('learn.lockedShort');
  const label = `${index + 1}. ${name}${treasure && !done ? ` · ${t('learn.treasureShort')}` : ''}`;
  return (
    <View style={{ position: 'absolute', left: x - 60, top: y, width: 120, alignItems: 'center', gap: 4 }}>
      {current ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: colors.saffron,
            opacity: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.45, 0, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1.33, 1.33] }) }],
          }}
        />
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ disabled: locked }}
        accessibilityLabel={`${t('learn.level', { n: index + 1 })}: ${name}. ${status}${done && stars ? `, ${stars} ★` : ''}`}
        style={{ width: size, height: size + 6, borderRadius: radius, backgroundColor: edge }}>
        {({ pressed }) => (
          <View style={{ width: size, height: size, borderRadius: radius, borderWidth: 4, borderColor: ring, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: pressed ? 3 : 0 }] }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: current ? 26 : 20, color: fg }}>{icon}</Text>
          </View>
        )}
      </Pressable>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, height: 15, letterSpacing: 1, color: colors.gold }} accessibilityElementsHidden>
        {done ? '★★★'.slice(0, stars) + '☆☆☆'.slice(0, 3 - stars) : ''}
      </Text>
      <Text
        style={{ fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 14, textAlign: 'center', color: done || current ? colors.ink : colors.faint, backgroundColor: current ? colors.white : 'transparent', borderRadius: radii.sm, paddingVertical: 2, paddingHorizontal: 6, overflow: 'hidden' }}
        accessibilityElementsHidden>
        {label}
      </Text>
    </View>
  );
}
