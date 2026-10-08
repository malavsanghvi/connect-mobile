import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { loadModuleSettings, type ModuleSettings } from '@/lib/api/modules';
import { mergeModuleMap } from '@/lib/categories';
import { ALL_ON, anyModuleOn, isModuleOn, type ModuleKey, type ModuleMap } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { useCategory } from '@/providers/category';
import { useDataVersion } from '@/providers/data-version';
import { useForegroundTick } from '@/providers/foreground';

export type ModulesValue = {
  map: ModuleMap;
  /** Labels from the database (`app.modules.label`), when it gave them. */
  labels: ModuleSettings['labels'];
  isOn: (key: ModuleKey) => boolean;
  anyOn: (keys: readonly ModuleKey[] | ModuleKey | null | undefined) => boolean;
};

const allOn: ModulesValue = { map: ALL_ON, labels: {}, isOn: () => true, anyOn: () => true };

const ModulesContext = createContext<ModulesValue>(allOn);

/** The value for a map: `allOn` itself for an empty one, so a Jain community keeps the very same object it always had. */
function valueFor(map: ModuleMap, labels: ModulesValue['labels']): ModulesValue {
  if (Object.keys(map).length === 0 && Object.keys(labels).length === 0) return allOn;
  return { map, labels, isOn: (k) => isModuleOn(map, k), anyOn: (keys) => anyModuleOn(map, keys) };
}

/**
 * Loads `app.my_modules` with the center (again after sign-in, after any write, and when the app comes back to the
 * foreground, so a switch made in the portal shows up without a restart). Until the first answer — and whenever it can't
 * be read — the modules are the kind of organization's defaults: everything on for a Jain Center, and for any other kind
 * the modules it does not have (or has off until switched on) stay off, so a chamber of commerce never flashes Bolis.
 */
export function ModulesProvider({ children }: { children: ReactNode }) {
  const { center, session } = useApp();
  const { version } = useDataVersion();
  const tick = useForegroundTick();
  const { moduleDefaults, moduleLabels } = useCategory();
  const centerId = center?.id ?? null;
  const key = `${centerId ?? ''}#${session?.user.id ?? ''}#${version}#${tick}`;
  const [settings, setSettings] = useState<{ centerId: string; value: ModuleSettings } | null>(null);

  useEffect(() => {
    if (!centerId) return;
    let active = true;
    // loadModuleSettings never rejects (it logs and falls back to "all on").
    void loadModuleSettings(centerId).then((value) => {
      // The same answer again (a foreground refresh that found nothing new) changes nothing and redraws nothing.
      if (active) setSettings((prev) => (prev && prev.centerId === centerId && JSON.stringify(prev.value) === JSON.stringify(value) ? prev : { centerId, value }));
    });
    return () => {
      active = false;
    };
    // `key` includes the user and the data version, so the list refreshes after sign-in and writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = settings && settings.centerId === centerId ? settings.value : null;
  const value = useMemo(
    () => valueFor(mergeModuleMap(moduleDefaults, current?.map ?? null), { ...current?.labels, ...moduleLabels }),
    [moduleDefaults, moduleLabels, current],
  );

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModules(): ModulesValue {
  return useContext(ModulesContext);
}

/** Is this module switched on for the member's community? */
export function useModule(key: ModuleKey): boolean {
  return useModules().isOn(key);
}
