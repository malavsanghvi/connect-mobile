import { JAIN_INTERESTS } from '../categories';
import { MODULE_KEYS } from '../modules';

/** The six interests of the original app, for readability in the tests. */
export const INTERESTS_FOR_TESTS: string[] = [...JAIN_INTERESTS];

/** What `app.category_profile` answers for a Jain Center (connect-crm 0594: every module default_on, the seeded terms). */
export function jainPayload(): unknown {
  return {
    category: {
      key: 'jain_center',
      label: 'Jain Center',
      faith_based: true,
      uses_tradition: true,
      path_label: 'Which Jain tradition do you follow?',
      terms: {
        greeting: 'Jai Jinendra',
        practice_tab: 'Jain Way',
        give_tab: 'Give',
        family_tab: 'Family',
        store: 'Satvik Store',
        school: 'Pathshala',
        learning: 'Gyan Path',
        place: 'derasar',
        assistant_context: 'a Jain community',
      },
    },
    modules: Object.fromEntries(MODULE_KEYS.map((k) => [k, { availability: 'default_on', label: null }])),
    paths: [
      { key: 'shwetambar', label: 'Shwetambar (not sure which)', parent: null, sort: 10 },
      { key: 'shwetambar_murtipujak', label: 'Murtipujak (Derawasi)', parent: 'shwetambar', sort: 11 },
    ],
    default_path: 'shwetambar_murtipujak',
  };
}

/**
 * A kind of organization the app has never heard of, as the database could describe it: it brings its own terms, module
 * availability and (optionally) words and layout. No app code mentions it.
 */
export function newExperiencePayload(): unknown {
  return {
    category: {
      key: 'swaminarayan_temple',
      label: 'Swaminarayan Temple',
      faith_based: false,
      uses_tradition: false,
      path_label: null,
      terms: {
        greeting: 'Welcome',
        practice_tab: 'Satsang',
        give_tab: 'Offerings',
        family_tab: 'My household',
        store: 'Prasad shop',
        school: null,
        learning: null,
        place: 'mandir',
        assistant_context: 'a temple community',
      },
    },
    modules: {
      bolis: { availability: 'not_available', label: null },
      store: { availability: 'default_off', label: 'Prasad shop' },
      giving: { availability: 'default_on', label: 'Offerings & dues' },
      events: { availability: 'default_on', label: null },
    },
    paths: [],
    default_path: null,
    words: { 'home.todayAt': 'Today here' },
    layout: { interests: ['events', 'volunteering'], shortcuts: ['photos'] },
  };
}
