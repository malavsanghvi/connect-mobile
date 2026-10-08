import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { FOREGROUND_REFRESH_MS, PERIODIC_REFRESH_MS, refreshDue } from '@/lib/foreground';

const ForegroundContext = createContext(0);

/**
 * A number that goes up when the app should re-read what administrators can change (see src/lib/foreground.ts): when the app
 * comes back to the foreground after a while, and every few minutes while it stays open. Providers put it in the key of
 * their load, the way they already do the data version, so a change made in the portal shows without a restart or an update.
 */
export function ForegroundProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const lastAt = useRef<number | null>(null);

  useEffect(() => {
    lastAt.current = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;
    const bump = () => {
      lastAt.current = Date.now();
      setTick((n) => n + 1);
    };
    const start = () => {
      if (timer === null) timer = setInterval(bump, PERIODIC_REFRESH_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stop();
        return;
      }
      start();
      if (refreshDue(lastAt.current, Date.now(), FOREGROUND_REFRESH_MS)) bump();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, []);

  return <ForegroundContext.Provider value={tick}>{children}</ForegroundContext.Provider>;
}

/** Goes up whenever the app should re-read community settings (see ForegroundProvider). */
export function useForegroundTick(): number {
  return useContext(ForegroundContext);
}
