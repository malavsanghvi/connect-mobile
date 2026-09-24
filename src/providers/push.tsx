import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { notificationPath } from '@/features/notification-route';

import { report } from '@/lib/errors';
import { registerPushDevice, unregisterPushDevice, type PushStatus } from '@/lib/push';
import { readPref, writePref } from '@/lib/storage';

import { useApp } from './app';

type PushState = PushStatus | { state: 'error'; reason: string } | { state: 'off' } | { state: 'checking' };

type PushContextValue = { status: PushState; setEnabled: (on: boolean) => Promise<void> };

const PushContext = createContext<PushContextValue>({ status: { state: 'checking' }, setEnabled: async () => {} });

/** Registers this phone in app.push_devices once a member is signed in (Settings has the master switch). */
export function PushProvider({ children }: { children: ReactNode }) {
  const { member, center } = useApp();
  const [status, setStatus] = useState<PushState>({ state: 'checking' });
  const userId = member?.userId ?? null;
  const centerId = center?.id ?? null;

  useEffect(() => {
    if (!userId || !centerId) return;
    let alive = true;
    (async (): Promise<PushState> => {
      const enabled = await readPref<boolean>('pushEnabled', true);
      if (!enabled) return { state: 'off' };
      try {
        return await registerPushDevice(userId, centerId, { prompt: true });
      } catch (err) {
        return { state: 'error', reason: report(err, 'register this phone for notifications').userMessage };
      }
    })().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, [userId, centerId]);

  // Tapping a notification opens what it is about (special day → Birthday labh, or data.path).
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = notificationPath(response.notification.request.content.data);
      if (path) router.push(path as Href);
    });
    return () => sub.remove();
  }, [router]);

  const setEnabled = async (on: boolean) => {
    if (!userId || !centerId) return;
    if (on) {
      await writePref('pushEnabled', true);
      try {
        setStatus(await registerPushDevice(userId, centerId, { prompt: true }));
      } catch (err) {
        setStatus({ state: 'error', reason: report(err, 'register this phone for notifications').userMessage });
      }
    } else {
      if (status.state === 'registered') await unregisterPushDevice(status.token);
      await writePref('pushEnabled', false);
      setStatus({ state: 'off' });
    }
  };

  return <PushContext.Provider value={{ status, setEnabled }}>{children}</PushContext.Provider>;
}

export function usePush(): PushContextValue {
  return useContext(PushContext);
}
