import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { wordsFor } from '@/i18n/categories';
import {
  categoryModuleLabels,
  categoryModuleMap,
  chooseProfile,
  JAIN_LAYOUT,
  JAIN_PROFILE,
  layoutFor,
  type CategoryLayout,
  type CategoryProfile,
} from '@/lib/categories';
import { loadCategoryProfile, readCachedProfile, writeCachedProfile } from '@/lib/api/category';
import { logError } from '@/lib/errors';
import type { ModuleKey, ModuleMap } from '@/lib/modules';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useForegroundTick } from '@/providers/foreground';
import { WordsProvider } from '@/providers/settings';

export type CategoryValue = {
  /** The kind of organization this community is: what the database last said, else the app's own for that kind. */
  profile: CategoryProfile;
  /** How the app lays it out (tabs, Today, sign-up, interests, Home shortcuts). */
  layout: CategoryLayout;
  /** The modules this kind of organization has off before `my_modules` answers (empty for Jain Center: everything on). */
  moduleDefaults: ModuleMap;
  /** The kind's own names for modules ("Religious school"). */
  moduleLabels: Partial<Record<ModuleKey, string>>;
  /** Where `profile` comes from: the database just now, this device's last answer, or the app's own. */
  source: 'live' | 'cache' | 'builtin';
  /** The layout can be shown: no wait for a kind the app knows, else the device's last answer or the first answer is in. */
  ready: boolean;
};

const JAIN: CategoryValue = {
  profile: JAIN_PROFILE,
  layout: JAIN_LAYOUT,
  moduleDefaults: {},
  moduleLabels: {},
  source: 'builtin',
  ready: true,
};

const CategoryContext = createContext<CategoryValue>(JAIN);

type Held = { centerId: string; profile: CategoryProfile | null };

/**
 * Knows what kind of organization the community is, and lays the app out for it (docs/ORGANIZATION_CATEGORIES_PLAN.md §3.6).
 *
 *  - `centers.category_key` (read with the community) names the kind at once; the app lays out a kind it has built in on the
 *    very first frame, so a chamber of commerce never flashes the Jain tabs.
 *  - `app.category_profile` is read next, and again when the app comes to the foreground, every few minutes, and after any write
 *    (pull to refresh), so a change Community Connect makes (the kind, a module) shows without an update. This device keeps the
 *    last answer for each community, so a cold start has it before the network answers.
 *  - A kind the app has no built-in for waits (`ready` false) for the cached or first live answer instead of guessing; if the
 *    read fails, the generic layout (neutral, complete) is used and the read is tried again later.
 *  - Under it, the words of the kind are laid over the dictionary (WordsProvider), so `useT()` everywhere speaks them.
 *
 * It sits below AppProvider (it needs the community) and above ModulesProvider (the module map starts from the kind's defaults).
 */
export function CategoryProvider({ children }: { children: ReactNode }) {
  const { center } = useApp();
  const { version } = useDataVersion();
  const tick = useForegroundTick();
  const centerId = center?.id ?? null;
  const slug = center?.slug ?? null;
  const hint = center?.category_key ?? null;

  const [cached, setCached] = useState<Held | null>(null);
  const [live, setLive] = useState<Held | null>(null);
  // The community whose first live read has finished (answered or failed): a kind the app does not know stops waiting then.
  const [settled, setSettled] = useState<string | null>(null);

  useEffect(() => {
    if (!centerId || !slug) return;
    let active = true;
    void readCachedProfile(slug).then((profile) => {
      if (active) setCached({ centerId, profile });
    });
    return () => {
      active = false;
    };
  }, [centerId, slug]);

  useEffect(() => {
    if (!centerId) return;
    let active = true;
    // loadCategoryProfile never rejects (it logs and answers "failed" or "missing").
    void loadCategoryProfile(centerId).then((read) => {
      if (!active) return;
      if (read.kind === 'answered') {
        // The same answer again (a foreground refresh that found nothing new) changes nothing and redraws nothing.
        setLive((prev) => (prev && prev.centerId === centerId && JSON.stringify(prev.profile) === JSON.stringify(read.profile) ? prev : { centerId, profile: read.profile }));
        if (slug) writeCachedProfile(slug, read.raw).catch((err: unknown) => logError('remembering the kind of organization on this device (the next start waits for the network)', err));
      }
      setSettled(centerId);
    });
    return () => {
      active = false;
    };
    // `version` reads again after a write (pull to refresh), `tick` when the app returns to the foreground or has been open a while.
  }, [centerId, slug, version, tick]);

  const { profile, source, ready } = chooseProfile({
    hint,
    live: live?.centerId === centerId ? live.profile : null,
    cached: cached?.centerId === centerId ? cached.profile : null,
    settled: !!centerId && settled === centerId,
  });

  const value = useMemo<CategoryValue>(
    () => ({
      profile,
      layout: layoutFor(profile),
      moduleDefaults: categoryModuleMap(profile),
      moduleLabels: categoryModuleLabels(profile),
      source,
      ready,
    }),
    [profile, source, ready],
  );
  const words = useMemo(() => wordsFor(profile), [profile]);

  return (
    <CategoryContext.Provider value={value}>
      <WordsProvider words={words}>{children}</WordsProvider>
    </CategoryContext.Provider>
  );
}

/** The community's kind of organization and how the app is laid out for it (Jain Center's, outside a provider). */
export function useCategory(): CategoryValue {
  return useContext(CategoryContext);
}
