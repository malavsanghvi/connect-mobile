import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { loadModuleSettings, type ModuleSettings } from '@/lib/api/modules';
import { ALL_ON, anyModuleOn, isModuleOn, type ModuleKey, type ModuleMap } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';

export type ModulesValue = {
  map: ModuleMap;
  /** Labels from the database (`app.modules.label`), when it gave them. */
  labels: ModuleSettings['labels'];
  isOn: (key: ModuleKey) => boolean;
  anyOn: (keys: readonly ModuleKey[] | ModuleKey | null | undefined) => boolean;
};

const allOn: ModulesValue = { map: ALL_ON, labels: {}, isOn: () => true, anyOn: () => true };

const ModulesContext = createContext<ModulesValue>(allOn);

/**
 * Loads `app.my_modules` with the center (again after sign-in and after any
 * write, so a switch made in the portal shows up on the next refresh). Until
 * the first answer — and whenever it can't be read — everything is on.
 */
export function ModulesProvider({ children }: { children: ReactNode }) {
  const { center, session } = useApp();
  const { version } = useDataVersion();
  const centerId = center?.id ?? null;
  const key = `${centerId ?? ''}#${session?.user.id ?? ''}#${version}`;
  const [settings, setSettings] = useState<{ centerId: string; value: ModuleSettings } | null>(null);

  useEffect(() => {
    if (!centerId) return;
    let active = true;
    // loadModuleSettings never rejects (it logs and falls back to "all on").
    void loadModuleSettings(centerId).then((value) => {
      if (active) setSettings({ centerId, value });
    });
    return () => {
      active = false;
    };
    // `key` includes the user and the data version, so the list refreshes after sign-in and writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = settings && settings.centerId === centerId ? settings.value : null;
  const map = current?.map ?? ALL_ON;
  const value: ModulesValue = current
    ? { map, labels: current.labels, isOn: (k) => isModuleOn(map, k), anyOn: (keys) => anyModuleOn(map, keys) }
    : allOn;

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModules(): ModulesValue {
  return useContext(ModulesContext);
}

/** Is this module switched on for the member's community? */
export function useModule(key: ModuleKey): boolean {
  return useModules().isOn(key);
}
