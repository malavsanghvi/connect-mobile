import { createContext, useContext, useState, type ReactNode } from 'react';

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
