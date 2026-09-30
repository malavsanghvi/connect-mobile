import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, View } from 'react-native';

import { StrokeIcon } from '@/components/stroke-icon';
import { Button, Txt } from '@/components/ui';
import type { FeedbackHome } from '@/lib/api/home';
import { rememberPopupDismissed } from '@/lib/api/surveys';
import { todayAt } from '@/lib/format';
import { communityName } from '@/lib/learning';
import { pointsLine } from '@/lib/survey-popup';
import type { LoadState } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import { useConfirmPopup } from './confirm-popup';

/**
 * "How was <event>?" — asks for feedback when the member opens the app (Home)
 * after an event they RSVPd to or attended. One question, the points it earns
 * (when the survey gives any), "Share feedback" and a close button.
 *
 * Whether it shows is decided in loadFeedbackHome / src/lib/survey-popup.ts:
 * an open, unanswered event survey, on the day it opened and the two days
 * after, at most once per local day. Closing it (either button, or sharing)
 * is remembered on the device for the rest of the day; the Home "Feedback
 * requested" card stays until the survey closes, and the server's day 1 / day 2
 * reminder pushes carry on.
 *
 * It belongs to Home: it never sits over another screen, and it waits for the
 * RSVP confirm pop-up when both are due. It is worked out again when the member
 * comes back to Home or the app from the background.
 */
export function SurveyPopup({ state }: { state: LoadState<FeedbackHome> }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { center } = useApp();
  const { open: confirmOpen } = useConfirmPopup();
  const tz = center?.time_zone ?? null;
  // Pop-ups closed in this session, by the local day they were closed. This is what keeps one closed if this
  // device could not save the choice; the saved choice is what keeps it closed after the app restarts.
  const [closed, setClosed] = useState<Record<string, string>>({});

  const reloadRef = useRef(state.reload);
  const wasHome = useRef(pathname === '/');
  useEffect(() => {
    reloadRef.current = state.reload;
  });
  useEffect(() => {
    const onHome = pathname === '/';
    if (onHome && !wasHome.current) void reloadRef.current();
    wasHome.current = onHome;
  }, [pathname]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void reloadRef.current();
    });
    return () => sub.remove();
  }, []);

  const pick = state.data?.popup ?? null;
  const today = state.data?.today ?? '';
  const closedOn = pick ? closed[pick.survey.id] : undefined;
  const visible = !!pick && !(closedOn !== undefined && closedOn >= today) && pathname === '/' && !confirmOpen;

  const close = (surveyId: string) => {
    const day = todayAt(tz, new Date());
    setClosed((prev) => ({ ...prev, [surveyId]: day }));
    // Logs its own failure and never rejects.
    void rememberPopupDismissed(surveyId, day);
  };
  const share = () => {
    if (!pick) return;
    const id = pick.survey.id;
    close(id);
    router.push({ pathname: '/survey/[id]', params: { id } });
  };

  const earn = pick ? pointsLine(t, 'earn', pick.survey.reward_points, communityName(center)) : null;
  const title = pick ? (pick.eventName ? t('home.feedbackTitle', { event: pick.eventName }) : pick.survey.title) : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => pick && close(pick.survey.id)}>
      <View style={{ flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: space.gutter }}>
        {pick ? (
          <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 480, maxHeight: '90%', backgroundColor: colors.card, borderRadius: radii.cta, overflow: 'hidden' }}>
            <ScrollView bounces={false}>
              <View style={{ backgroundColor: colors.purple, paddingVertical: 18, paddingHorizontal: space.gutter, gap: 4 }}>
                <Pressable
                  onPress={() => close(pick.survey.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('notif.closePopup')}
                  style={{ position: 'absolute', top: space.xs, right: space.xs, width: touch.min, height: touch.min, borderRadius: touch.min / 2, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.purpleDark, alignItems: 'center', justifyContent: 'center' }}>
                    <StrokeIcon name="close" size={16} color={colors.white} strokeWidth={2} />
                  </View>
                </Pressable>
                <Txt variant="eyebrow" color="onPurple" style={{ fontFamily: fonts.bodySemi, paddingRight: touch.min }}>
                  {t('home.feedbackRequested')}
                </Txt>
                <Txt variant="title" color="white" style={{ fontFamily: fonts.display, paddingRight: touch.min }} accessibilityRole="header">
                  {title}
                </Txt>
                <Txt variant="meta" color="onPurple">
                  {t('home.feedbackMeta')}
                </Txt>
              </View>
              <View style={{ paddingTop: 18, paddingHorizontal: space.gutter, paddingBottom: space.gutter, gap: space.md }}>
                <Txt variant="body">{pick.survey.description?.trim() || t('home.feedbackBody')}</Txt>
                {earn ? (
                  <View style={{ alignSelf: 'flex-start', backgroundColor: colors.purpleTint, borderRadius: radii.card, paddingVertical: 6, paddingHorizontal: 10 }}>
                    <Txt variant="meta" color="purpleDark" style={{ fontFamily: fonts.bodySemi }}>
                      {earn}
                    </Txt>
                  </View>
                ) : null}
                <Button label={t('home.shareFeedback')} tone="purple" onPress={share} />
                <Pressable onPress={() => close(pick.survey.id)} accessibilityRole="button" accessibilityLabel={t('survey.popupNotNow')} style={({ pressed }) => ({ minHeight: touch.min, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                  <Txt variant="smallStrong" color="muted">
                    {t('survey.popupNotNow')}
                  </Txt>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
