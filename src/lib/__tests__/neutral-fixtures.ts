import { MODULE_KEYS, type ModuleKey } from '../modules';

/**
 * What `app.category_profile` answers for the platform's categories that are not a Jain Center, as connect-crm 0594 (terms,
 * module matrix), 0600 (labels, wording packs), 0624 (the member-app template) and 0741 (Labh follows Bolis) seed them. The audit
 * of src/lib/__tests__/neutral-words.test.ts resolves the app's words for each of these, the way the app does.
 */

type Availability = 'default_on' | 'default_off' | 'not_available';

function modules(over: Partial<Record<ModuleKey, [Availability, string | null]>>): Record<string, { availability: Availability; label: string | null }> {
  const out: Record<string, { availability: Availability; label: string | null }> = {};
  for (const key of MODULE_KEYS) {
    const [availability, label] = over[key] ?? ['default_on', null];
    out[key] = { availability, label };
  }
  return out;
}

/** "Faith community" (key faith_other): a house of worship with no kind of its own yet. Wording pack 'faith'. */
export function faithOtherPayload(): unknown {
  return {
    category: {
      key: 'faith_other',
      label: 'Faith community',
      faith_based: true,
      uses_tradition: false,
      path_label: null,
      terms: {
        greeting: 'Welcome',
        practice_tab: 'Learn',
        give_tab: 'Give',
        family_tab: 'Family',
        store: 'Store',
        school: 'Religious school',
        learning: 'Learning path',
        place: 'place of worship',
        assistant_context: 'a faith community',
      },
    },
    modules: modules({
      bolis: ['not_available', null],
      jain_way: ['not_available', null],
      labh: ['not_available', null],
      pathshala: ['default_off', 'Religious school'],
      gyan_path: ['default_off', 'Learning path'],
      store: ['default_off', 'Store'],
      niva: ['default_off', null],
    }),
    paths: [],
    default_path: null,
    template: {
      version: 1,
      home: { rows: ['today', 'events', 'giving', 'life', 'learn'] },
      tabs: [{ key: 'index' }, { key: 'events' }, { key: 'give' }, { key: 'jain-way', label: null }, { key: 'family' }],
      widgets: { today: { variant: 'service_times' } },
    },
  };
}

/** The same community with the demo's modules on (a Religious school, a store and Niva), as the demo community runs. */
export function faithDemoPayload(): unknown {
  const p = faithOtherPayload() as { modules: Record<string, { availability: Availability; label: string | null }> };
  return {
    ...p,
    modules: {
      ...p.modules,
      pathshala: { availability: 'default_on', label: 'Religious school' },
      gyan_path: { availability: 'default_on', label: 'Learning path' },
      store: { availability: 'default_on', label: 'Store' },
      niva: { availability: 'default_on', label: null },
    },
  };
}

/** "Community organization" (key nonprofit_secular): a club or association that is not a house of worship. Wording pack 'neutral'. */
export function communityPayload(): unknown {
  return {
    category: {
      key: 'nonprofit_secular',
      label: 'Community organization',
      faith_based: false,
      uses_tradition: false,
      path_label: null,
      terms: {
        greeting: 'Welcome',
        practice_tab: null,
        give_tab: 'Give',
        family_tab: 'Family',
        store: 'Store',
        school: null,
        learning: null,
        place: 'office',
        assistant_context: 'a community organization',
      },
    },
    modules: modules({
      bolis: ['not_available', null],
      jain_way: ['not_available', null],
      labh: ['not_available', null],
      pathshala: ['not_available', null],
      gyan_path: ['not_available', null],
      store: ['default_off', 'Store'],
      niva: ['default_off', null],
    }),
    paths: [],
    default_path: null,
    template: {
      version: 1,
      home: { rows: ['today', 'events', 'giving', 'life', 'learn'] },
      tabs: [{ key: 'index' }, { key: 'events' }, { key: 'give' }, { key: 'jain-way', hidden: true }, { key: 'family' }],
      widgets: { today: { variant: 'basic' } },
    },
  };
}

/** "Chamber of commerce" (key chamber_of_commerce): its own words for Give and Family. Wording pack 'chamber'. */
export function chamberPayload(): unknown {
  return {
    category: {
      key: 'chamber_of_commerce',
      label: 'Chamber of commerce',
      faith_based: false,
      uses_tradition: false,
      path_label: null,
      terms: {
        greeting: 'Welcome',
        practice_tab: null,
        give_tab: 'Pay',
        family_tab: 'My business',
        store: 'Store',
        school: null,
        learning: null,
        place: 'office',
        assistant_context: 'a chamber of commerce',
      },
    },
    modules: modules({
      bolis: ['not_available', null],
      jain_way: ['not_available', null],
      labh: ['not_available', null],
      pathshala: ['not_available', null],
      gyan_path: ['not_available', null],
      giving: ['default_on', 'Dues & payments'],
      store: ['default_off', 'Store'],
      niva: ['default_off', null],
    }),
    paths: [],
    default_path: null,
    template: null,
  };
}

/**
 * A faith the platform has no entry for yet, with words of its own for the school and the learning path: what a new experience
 * brings as data (here a gurdwara). Its terms must replace the category's, wherever the app says "school" or "learning path".
 */
export function gurdwaraPayload(): unknown {
  const p = faithOtherPayload() as { category: Record<string, unknown>; modules: unknown };
  return {
    ...p,
    category: {
      ...p.category,
      key: 'sikh_gurdwara',
      label: 'Gurdwara',
      terms: {
        greeting: 'Sat Sri Akal',
        practice_tab: 'Seva',
        give_tab: 'Daswandh',
        family_tab: 'Sangat',
        store: 'Langar store',
        school: 'Punjabi school',
        learning: 'Gurbani path',
        place: 'gurdwara',
        assistant_context: 'a Sikh community',
      },
    },
  };
}
