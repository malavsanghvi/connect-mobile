import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { sendAnumodana } from '@/lib/api/jainway';
import { logError, report } from '@/lib/errors';
import { communityName, pointRules } from '@/lib/learning';
import { familyCircleRecipient, NOTIFICATION_ACTIONS, NOTIFICATION_CATEGORIES, notificationTarget } from '@/lib/notification-routes';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';

/**
 * Opens the right screen when a push notification is tapped (routes live in
 * src/lib/notification-routes.ts) and handles the family-circle inline
 * "Send anumodana" button. Mounted once inside the signed-in app.
 */
export function NotificationRouter() {
  const router = useRouter();
  const t = useT();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const anumodanaPoints = pointRules(center?.rules).anumodana;
  const handled = useRef(new Set<string>());
  const ctx = useRef({ center, member, t, toast, invalidate, router });
  useEffect(() => {
    ctx.current = { center, member, t, toast, invalidate, router };
  });

  // Inline buttons on family-circle notifications (static titles; the name is in the body).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const setUp = async () => {
      await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.familyCelebrate, [
        { identifier: NOTIFICATION_ACTIONS.sendAnumodana, buttonTitle: t('saathi.sendCta', { points: anumodanaPoints }), options: { opensAppToForeground: true } },
      ]);
      await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.familySupport, [
        { identifier: NOTIFICATION_ACTIONS.encourage, buttonTitle: t('saathi.encourage'), options: { opensAppToForeground: true } },
      ]);
    };
    setUp().catch((err: unknown) => logError('registering family-circle notification buttons', err));
  }, [t, anumodanaPoints]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handle = async (response: Notifications.NotificationResponse) => {
      const id = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handled.current.has(id)) return;
      handled.current.add(id);
      const data = response.notification.request.content.data;
      const { center: c, member: m, t: tr, toast: show, invalidate: inv, router: r } = ctx.current;
      if (response.actionIdentifier === NOTIFICATION_ACTIONS.sendAnumodana) {
        const to = familyCircleRecipient(data);
        if (to && c && m) {
          try {
            const pts = await sendAnumodana(c.id, to.personId, 'celebrate', null);
            inv();
            show(pts > 0 ? tr('saathi.pushSent', { name: to.name, points: pts, center: communityName(c) }) : tr('saathi.sentNoPoints', { name: to.name }));
          } catch (err) {
            show(report(err, 'send anumodana').userMessage, 'error');
          }
        }
      }
      const target = notificationTarget(data);
      if (target) r.push({ pathname: target.pathname, params: target.params } as Href);
      Notifications.clearLastNotificationResponseAsync().catch((err: unknown) => logError('clearing the handled notification', err));
    };
    // Cold start: the tap that launched the app.
    const last = Notifications.getLastNotificationResponse();
    if (last) void handle(last);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => void handle(r));
    return () => sub.remove();
  }, []);

  return null;
}
