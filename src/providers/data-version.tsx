import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type DataVersion = { version: number; invalidate: () => void };

const DataVersionContext = createContext<DataVersion>({ version: 0, invalidate: () => {} });

/**
 * Bumped after every successful write so every mounted screen reloads its
 * data (e.g. Home reflects an RSVP made on the event screen).
 */
export function DataVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  return (
    <DataVersionContext.Provider value={{ version, invalidate: () => setVersion((v) => v + 1) }}>
      {children}
    </DataVersionContext.Provider>
  );
}

export function useDataVersion(): DataVersion {
  return useContext(DataVersionContext);
}

/**
 * While `frozen`, what is inside keeps seeing the version it saw last, so it
 * does not reload after writes made elsewhere; the moment `frozen` ends it
 * catches up, once. Home's rails use it while another screen is on top of
 * Home: a like or a playlist change over there no longer reloads every rail
 * behind it, and the rails are fresh when the member comes back.
 * `invalidate` is still the real one.
 */
export function FreezeDataVersion({ frozen, children }: { frozen: boolean; children: ReactNode }) {
  const real = useDataVersion();
  const [seen, setSeen] = useState(real.version);
  if (!frozen && seen !== real.version) setSeen(real.version);
  const value = useMemo(() => ({ version: seen, invalidate: real.invalidate }), [seen, real.invalidate]);
  return <DataVersionContext.Provider value={value}>{children}</DataVersionContext.Provider>;
}
