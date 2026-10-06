import { useEffect, useRef, useState } from 'react';

import { useDataVersion } from '@/providers/data-version';

import { AppError, report } from './errors';

type Result<T> = { key: string; data?: T; error?: AppError };

export type LoadOptions = {
  /**
   * Ignore writes made elsewhere (the data version) while true, and catch up once when it turns false: the rule
   * FreezeDataVersion gives a whole screen, for one load. Left out, the load follows every write (the default).
   */
  frozen?: boolean;
};

/**
 * The data version a load keys on, and the version it has seen. Following writes (`frozen` undefined): the live
 * version. Frozen: the version it had seen. Unfrozen again: the live version, which it has now seen (the catch-up).
 */
export function versionFor(live: number, seen: number, frozen: boolean | undefined): { version: number; seen: number } {
  if (frozen === undefined) return { version: live, seen };
  return frozen ? { version: seen, seen } : { version: live, seen: live };
}

export type LoadState<T> = {
  data: T | undefined;
  error: AppError | null;
  /** True until a result exists for the current inputs (previous data is kept meanwhile). */
  loading: boolean;
  reload: () => Promise<void>;
};

/**
 * Load data for a screen. `deps` must be serialisable (ids, flags). Reloads
 * when deps change and after any write (DataVersionProvider), unless
 * `options.frozen` says to ignore writes for a while. Errors are
 * converted to plain English with `action` ("load your events").
 */
export function useLoad<T>(loader: () => Promise<T>, deps: readonly unknown[], action: string, options?: LoadOptions): LoadState<T> {
  const { version: live } = useDataVersion();
  const [seen, setSeen] = useState(live);
  const { version, seen: nowSeen } = versionFor(live, seen, options?.frozen);
  if (nowSeen !== seen) setSeen(nowSeen);
  const key = `${JSON.stringify(deps)}#${version}`;
  const loaderRef = useRef(loader);
  const keyRef = useRef(key);
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    loaderRef.current = loader;
    keyRef.current = key;
  });

  useEffect(() => {
    let active = true;
    loaderRef
      .current()
      .then((data) => {
        if (active) setResult({ key, data });
      })
      .catch((err: unknown) => {
        const appErr = report(err, action);
        if (active) setResult((prev) => ({ key, data: prev?.data, error: appErr }));
      });
    return () => {
      active = false;
    };
  }, [key, action]);

  const reload = async () => {
    const k = keyRef.current;
    try {
      const data = await loaderRef.current();
      setResult({ key: k, data });
    } catch (err) {
      const appErr = report(err, action);
      setResult((prev) => ({ key: k, data: prev?.data, error: appErr }));
    }
  };

  const current = result && result.key === key ? result : null;
  return {
    data: result?.data,
    error: current?.error ?? null,
    loading: !current,
    reload,
  };
}
