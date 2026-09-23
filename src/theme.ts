/**
 * Design tokens from the JSH App Prototype (docs/PROTOTYPE_SPEC.md §5) and
 * connect-crm/docs/ARCHITECTURE.md. Never hard-code a colour in a screen —
 * add it here. Tenant branding overrides (centers.branding) can be layered on
 * top later without touching screens.
 */

export const colors = {
  // Surfaces
  ground: '#FBF7F0',
  frame: '#EDE6DA',
  card: '#FFFFFF',
  panel: '#F6EFE3',
  divider: '#F1E8D8',
  dividerLight: '#F4EEE3',
  chip: '#F1EEE8',

  // Borders
  border: '#E8E0D2',
  borderInput: '#E3D9C8',
  dashed: '#B9AE99',
  toggleOff: '#CFC8BA',
  starEmpty: '#E3DCCF',

  // Ink
  ink: '#1E1C18',
  ink2: '#3D3A33',
  muted: '#5E5A52',
  faint: '#8A8478',

  // Navy (primary)
  navy: '#1B2C5C',
  navyTint: '#EEF1F8',
  navyTint2: '#E6E9F3',
  navyBorder: '#B8C2DD',
  onNavy: '#C9D1EA',
  navyPanel: '#33467A',
  navyDisabled: '#8A93AE',

  // Saffron / brown (giving, bolis)
  brown: '#8A4608',
  brownDark: '#5E3106',
  brownText: '#5E4A33',
  brownTint: '#FBEBD7',
  brownBorder: '#EFCFA6',
  onBrown: '#F6DDBF',
  saffron: '#C9731C',
  flame: '#F2A03D',
  badge: '#E8892A',
  gold: '#F2B632',

  // Green (success, lunch, recurring)
  green: '#1F7A4D',
  greenDark: '#14502F',
  greenTint: '#E4F2EA',
  greenBorder: '#B7DCC6',
  onNavyGreen: '#7FD1A4',

  // Store green
  store: '#2F5D50',
  storeLight: '#3E7566',
  onStore: '#CFE6DC',
  storeTint: '#E8F1ED',

  // Red / maroon
  danger: '#B3261E',
  dangerTint: '#FBE3E1',
  live: '#C0392B',
  maroon: '#7A2E1F',
  maroonButton: '#8F4232',
  onMaroon: '#F3D6CF',

  // Purple (feedback, Pathshala, Saathi)
  purple: '#5B4B8A',
  purpleTint: '#EFEBF6',
  onPurple: '#DCD6EC',
  purpleBorder: '#D8CFEA',
  purpleBg: '#F5F2FA',
  purpleDark: '#3D2F63',

  // Media / misc
  black: '#111111',
  white: '#FFFFFF',
  scrim: 'rgba(20,18,14,0.55)',
  scrimLight: 'rgba(20,18,14,0.45)',
} as const;

export type ColorName = keyof typeof colors;

/** Font family names as registered with expo-font in the root layout. */
export const fonts = {
  display: 'Fraunces_500Medium',
  displayBold: 'Fraunces_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemi: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
} as const;

export const radii = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  card: 14,
  row: 16,
  xl: 18,
  xxl: 20,
  pill: 22,
  sheet: 24,
  cta: 26,
  round: 999,
} as const;

export const space = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  gutter: 20,
  xl: 24,
  xxl: 32,
} as const;

/** Minimum touch targets (px). 44 is the platform floor for anything tappable. */
export const touch = {
  min: 44,
  secondary: 48,
  cta: 52,
  row: 56,
} as const;

/** Type scale (px, before the user's text-size multiplier). */
export const type = {
  hero: 30,
  pledgeAmount: 32,
  display: 26,
  title: 22,
  headline: 19,
  subhead: 18,
  cardTitle: 17,
  section: 16,
  body: 15,
  bodySmall: 14,
  meta: 13,
  caption: 12,
  fine: 11,
  badge: 10,
} as const;

/** Text-size setting → multiplier (Settings › Text size). */
export const textScales = {
  standard: 1,
  large: 1.15,
  largest: 1.3,
} as const;

export type TextSize = keyof typeof textScales;

export const layout = {
  maxContentWidth: 640,
  tabBarHeight: 76,
} as const;
