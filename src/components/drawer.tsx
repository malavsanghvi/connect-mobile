import { useRouter, type Href } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { myVolunteerEvents } from '@/lib/api/volunteer';
import { fullName } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, space, touch } from '@/theme';

import { Icon, type IconName } from './icon';
import { IconButton, Row, Txt } from './ui';

type DrawerContextValue = { open: () => void; close: () => void };

const DrawerContext = createContext<DrawerContextValue>({ open: () => {}, close: () => {} });

export function useDrawer(): DrawerContextValue {
  return useContext(DrawerContext);
}

function Item({ icon, title, sub, onPress }: { icon: IconName; title: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.navyTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={colors.navy} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {sub ? (
          <Txt variant="meta" color="muted">
            {sub}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Left drawer (prototype §2.31). Lives in the (app) layout so every screen's menu button can open it. */
export function DrawerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { center, member, guest, setGuest } = useApp();
  const volunteer = useLoad(() => (center && member ? myVolunteerEvents(center.id) : Promise.resolve([])), [center?.id, member?.userId], 'check your volunteer roles');

  const go = (href: Href) => {
    setVisible(false);
    router.push(href);
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
          <View accessibilityViewIsModal style={{ width: 304, maxWidth: '86%', backgroundColor: colors.ground, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.md }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.xs }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="headline" color="navy" accessibilityRole="header" style={{ flex: 1 }}>
                  {center?.name ?? ''}
                </Txt>
                <IconButton icon="close" label={t('common.close')} onPress={() => setVisible(false)} />
              </Row>
              <Txt variant="meta" color="muted">
                {identity}
              </Txt>
              <View style={{ height: space.md }} />
              <Item icon="calendar-outline" title={t('drawer.calendar')} sub={t('drawer.calendarSub')} onPress={() => go({ pathname: '/events', params: { view: 'calendar' } })} />
              {member ? <Item icon="school-outline" title={t('drawer.pathshala')} sub={t('drawer.pathshalaSub')} onPress={() => go({ pathname: '/jain-way', params: { tab: 'learn' } })} /> : null}
              {member?.isAdult ? <Item icon="receipt-outline" title={t('drawer.donations')} sub={t('drawer.donationsSub')} onPress={() => go('/pledges')} /> : null}
              <Item icon="storefront-outline" title={t('drawer.store')} sub={t('drawer.storeSub')} onPress={() => go('/store')} />
              <Item icon="ticket-outline" title={t('drawer.rsvp')} sub={t('drawer.rsvpSub')} onPress={() => go('/events')} />
              <Item icon="compass-outline" title={t('drawer.guide')} sub={t('drawer.guideSub')} onPress={() => go('/guide')} />
              {member ? <Item icon="chatbubble-ellipses-outline" title={t('drawer.niva')} sub={t('drawer.nivaSub')} onPress={() => go('/niva')} /> : null}
              {volunteer.data && volunteer.data.length > 0 ? (
                <Item icon="scan-outline" title={t('drawer.volunteer')} sub={t('drawer.volunteerSub', { n: volunteer.data.length })} onPress={() => go('/volunteer')} />
              ) : null}
              <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: space.sm }} />
              {member ? (
                <Item icon="settings-outline" title={t('drawer.settings')} sub={t('drawer.settingsSub')} onPress={() => go('/settings')} />
              ) : guest ? (
                <Item
                  icon="log-in-outline"
                  title={t('drawer.signIn')}
                  sub={t('drawer.signInSub')}
                  onPress={() => {
                    setVisible(false);
                    setGuest(false);
                  }}
                />
              ) : null}
              <Txt variant="fine" color="faint" style={{ marginTop: space.md }}>
                {t('drawer.version', { version: '1.0.0' })}
              </Txt>
            </ScrollView>
          </View>
          <Pressable style={{ flex: 1, backgroundColor: colors.scrimLight, minWidth: touch.min }} onPress={() => setVisible(false)} accessibilityRole="button" accessibilityLabel={t('common.close')} />
        </View>
      </Modal>
    </DrawerContext.Provider>
  );
}
