import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { demoAllows } from '@/lib/demo';
import { report } from '@/lib/errors';
import { registerPushDevice, unregisterPushDevice, type PushStatus } from '@/lib/push';
import { readPref, writePref } from '@/lib/storage';

import { useApp } from './app';
import { useDemo } from './demo';
import { useT } from './settings';

type PushState = PushStatus | { state: 'error'; reason: string } | { state: 'off' } | { state: 'checking' };

type PushContextValue = { status: PushState; setEnabled: (on: boolean) => Promise<void> };

const PushContext = createContext<PushContextValue>({ status: { state: 'checking' }, setEnabled: async () => {} });

/** Registers this phone in app.push_devices once a member is signed in (Settings has the master switch). */
export function PushProvider({ children }: { children: ReactNode }) {
  const { member, center } = useApp();
  const t = useT();
  // A demo never asks the phone for permission or registers it for push (src/lib/demo.ts DEMO_LIMITED).
  const inDemo = !demoAllows(useDemo().active, 'push');
  const [status, setStatus] = useState<PushState>({ state: 'checking' });
  const userId = member?.userId ?? null;
  const centerId = center?.id ?? null;

  useEffect(() => {
    if (!userId || !centerId || inDemo) return;
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
  }, [userId, centerId, inDemo]);

  // Taps are routed in one place: features/confirm-popup (and components/notification-router for
  // family-circle actions), so a notification never opens two screens.

  const setEnabled = async (on: boolean) => {
    if (!userId || !centerId || inDemo) return;
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

  const shown: PushState = inDemo ? { state: 'unsupported', reason: t('demo.pushOff') } : status;
  return <PushContext.Provider value={{ status: shown, setEnabled }}>{children}</PushContext.Provider>;
}

export function usePush(): PushContextValue {
  return useContext(PushContext);
}
