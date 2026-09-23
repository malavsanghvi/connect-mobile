import { useEffect, useRef, useState } from 'react';

import { useDataVersion } from '@/providers/data-version';

import { AppError, report } from './errors';

type Result<T> = { key: string; data?: T; error?: AppError };

export type LoadState<T> = {
  data: T | undefined;
  error: AppError | null;
  /** True until a result exists for the current inputs (previous data is kept meanwhile). */
  loading: boolean;
  reload: () => Promise<void>;
};

/**
 * Load data for a screen. `deps` must be serialisable (ids, flags). Reloads
 * when deps change and after any write (DataVersionProvider). Errors are
 * converted to plain English with `action` ("load your events").
 */
export function useLoad<T>(loader: () => Promise<T>, deps: readonly unknown[], action: string): LoadState<T> {
  const { version } = useDataVersion();
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
