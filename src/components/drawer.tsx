import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { myVolunteerEvents } from '@/lib/api/volunteer';
import { report } from '@/lib/errors';
import { fullName } from '@/lib/format';
import { isDrawerEntryVisible, type DrawerEntry } from '@/lib/modules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';
import { colors, components, fonts, shadows, space, touch } from '@/theme';

import { CenterMark, useBranding } from './brand';
import { StrokeIcon, type StrokeIconName } from './stroke-icon';
import { Chevron, IconButton, Row, Txt } from './ui';

type DrawerContextValue = { open: () => void; close: () => void };

const DrawerContext = createContext<DrawerContextValue>({ open: () => {}, close: () => {} });

export function useDrawer(): DrawerContextValue {
  return useContext(DrawerContext);
}

type Tint = 'brown' | 'navy' | 'green' | 'grey';

// Read at render time, so the community's brand colours apply.
const tints = (): Record<Tint, string> => ({ brown: colors.brownTint, navy: colors.navyTint, green: colors.greenTint, grey: colors.chip });

/** Main drawer row (prototype Main L1355): 64px, 44px tinted tile, 16/600 title, 12 muted sub, › chevron. */
function Item({ glyph, tint, iconColor = colors.navy, title, sub, onPress }: { glyph: StrokeIconName; tint: Tint; iconColor?: string; title: string; sub?: string; onPress: () => void }) {
  const d = components.drawer;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: d.rowH, paddingVertical: space.sm, paddingHorizontal: 10, borderRadius: d.rowR, backgroundColor: pressed ? colors.panel : 'transparent' })}>
      <View style={{ width: d.tile, height: d.tile, borderRadius: d.tileR, backgroundColor: tints()[tint], alignItems: 'center', justifyContent: 'center' }}>
        <StrokeIcon name={glyph} size={d.iconSize} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="section">{title}</Txt>
        {sub ? (
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {sub}
          </Txt>
        ) : null}
      </View>
      <Chevron />
    </Pressable>
  );
}

/** Secondary drawer row (Community dashboard, guide): grey tile, 15/500 label, no chevron. */
function MinorItem({ glyph, title, sub, onPress, role = 'button' }: { glyph: StrokeIconName; title: string; sub?: string; onPress: () => void; role?: 'button' | 'link' }) {
  const d = components.drawer;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingVertical: space.sm, paddingHorizontal: 10, borderRadius: d.rowR, backgroundColor: pressed ? colors.panel : 'transparent' })}>
      <View style={{ width: d.tile, height: d.tile, borderRadius: d.tileR, backgroundColor: tints().grey, alignItems: 'center', justifyContent: 'center' }}>
        <StrokeIcon name={glyph} size={d.iconSize} color={colors.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="body" style={{ fontFamily: fonts.bodyMedium }}>
          {title}
        </Txt>
        {sub ? (
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
            {sub}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Left drawer (prototype Main L1344–1395). Lives in the (app) layout so every screen's menu button can open it. */
export function DrawerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();
  const t = useT();
  const feedback = useFeedback();
  const insets = useSafeAreaInsets();
  const { center, member, guest, setGuest } = useApp();
  const brand = useBranding();
  const { map } = useModules();
  const on = (entry: DrawerEntry) => isDrawerEntryVisible(map, entry);
  const volunteerOn = on('volunteer');
  const volunteer = useLoad(() => (center && member && volunteerOn ? myVolunteerEvents(center.id) : Promise.resolve([])), [center?.id, member?.userId, volunteerOn], 'check your volunteer roles');
  const community = center?.short_name || center?.name || '';
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const d = components.drawer;

  const go = (href: Href) => {
    setVisible(false);
    router.push(href);
  };

  const openDashboard = async () => {
    if (!brand.dashboardUrl) return;
    setVisible(false);
    try {
      await WebBrowser.openBrowserAsync(brand.dashboardUrl);
    } catch (err) {
      feedback.toast(report(err, t('drawer.dashboardError')).userMessage, 'error');
    }
  };

  const identity = member
    ? [fullName(member.person), member.household?.display_name, member.membership?.status === 'active' && member.membership.tier !== 'community' ? t(`tier.${member.membership.tier}`) : null]
        .filter(Boolean)
        .join(' · ')
    : t('drawer.guest');

  return (
    <DrawerContext.Provider value={{ open: () => setVisible(true), close: () => setVisible(false) }}>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View
            accessibilityViewIsModal
            style={[
              { width: d.width, maxWidth: '86%', backgroundColor: colors.ground, borderTopRightRadius: d.edgeR, borderBottomRightRadius: d.edgeR, paddingTop: insets.top, paddingBottom: insets.bottom, zIndex: 1 },
              shadows.drawer,
            ]}>
            <View style={{ paddingTop: 22, paddingHorizontal: 18, paddingBottom: space.lg, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Row align="flex-start" style={{ justifyContent: 'space-between' }}>
                <CenterMark size={d.markHeight} maxWidth={180} />
                <IconButton glyph="close" variant="outline" size={40} iconSize={16} color={colors.muted} label={t('common.close')} onPress={() => setVisible(false)} />
              </Row>
              <View>
                <Txt variant="headline" accessibilityRole="header" style={{ fontFamily: fonts.displayBold }}>
                  {center?.name ?? ''}
                </Txt>
                <Txt variant="meta" color="muted">
                  {identity}
                </Txt>
              </View>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 10, paddingHorizontal: space.sm }}>
              <View style={{ gap: 2 }}>
                {on('calendar') ? <Item glyph="calendar-dots" tint="brown" iconColor={colors.brown} title={t('drawer.calendar')} sub={t('drawer.calendarSub')} onPress={() => go({ pathname: '/events', params: { view: 'calendar' } })} /> : null}
                {member && on('pathshala') ? <Item glyph="book" tint="navy" title={t('drawer.pathshala')} sub={t('drawer.pathshalaSub')} onPress={() => go({ pathname: '/jain-way', params: { tab: 'learn' } })} /> : null}
                {member?.isAdult && on('donations') ? <Item glyph="heart" tint="brown" title={t('drawer.donations')} sub={t('drawer.donationsSub')} onPress={() => go('/pledges')} /> : null}
                {on('store') ? <Item glyph="bag" tint="green" title={t('drawer.store')} sub={t('drawer.storeSub')} onPress={() => go('/store')} /> : null}
                {on('rsvp') ? <Item glyph="calendar-check" tint="navy" title={t('drawer.rsvp')} sub={t('drawer.rsvpSub')} onPress={() => go('/events')} /> : null}
              </View>
              <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 10, marginVertical: 10 }} />
              <View style={{ gap: 2 }}>
                {brand.dashboardUrl && on('dashboard') ? <MinorItem glyph="chart" role="link" title={t('drawer.dashboard')} onPress={() => void openDashboard()} /> : null}
                <MinorItem glyph="info" title={t('drawer.guide', { center: community })} onPress={() => go('/guide')} />
                {volunteerOn && volunteer.data && volunteer.data.length > 0 ? (
                  <MinorItem glyph="scan" title={t('drawer.volunteer')} sub={t('drawer.volunteerSub', { n: volunteer.data.length })} onPress={() => go('/volunteer')} />
                ) : null}
              </View>
              {volunteerOn && volunteer.error ? (
                <View style={{ paddingHorizontal: 10, paddingTop: space.sm }}>
                  <Txt variant="caption" color="danger" style={{ fontFamily: fonts.body }}>
                    {volunteer.error.userMessage}
                  </Txt>
                </View>
              ) : null}
            </ScrollView>
            <View style={{ paddingTop: space.sm, paddingHorizontal: space.sm, paddingBottom: space.xl, borderTopWidth: 1, borderTopColor: colors.border }}>
              {member ? (
                <Item glyph="gear" tint="navy" title={t('drawer.settings')} sub={t('drawer.settingsSub')} onPress={() => go('/settings')} />
              ) : guest ? (
                <Item
                  glyph="sign-in"
                  tint="navy"
                  title={t('drawer.signIn')}
                  sub={t('drawer.signInSub')}
                  onPress={() => {
                    setVisible(false);
                    setGuest(false);
                  }}
                />
              ) : null}
              <Txt variant="fine" color="faint" style={{ paddingTop: space.xxs, paddingHorizontal: space.md }}>
                {t('drawer.version', { version })}
              </Txt>
            </View>
          </View>
          <Pressable style={{ flex: 1, backgroundColor: colors.scrimLight, minWidth: touch.min }} onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        </View>
      </Modal>
    </DrawerContext.Provider>
  );
}
