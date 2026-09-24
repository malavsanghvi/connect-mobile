/**
 * Design tokens lifted from the member-app prototypes (Main.dc.html and friends;
 * connect-crm/docs/parity/v-visual-system.md §1 and §3.2) and
 * connect-crm/docs/ARCHITECTURE.md. Never hard-code a colour in a screen —
 * add it here. The chosen community's brand colours are layered on top at
 * run time (applyPalette below) without touching screens.
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
  dashed2: '#D5CBB8',
  toggleOff: '#CFC8BA',
  /** Onboarding progress track. */
  track: '#EDE3D2',
  starEmpty: '#E3DCCF',

  // Ink
  ink: '#1E1C18',
  ink2: '#3D3A33',
  muted: '#5E5A52',
  faint: '#8A8478',

  // Navy (primary)
  navy: '#1B2C5C',
  navyHover: '#0F1B3D',
  navyTint: '#EEF1F8',
  navyTint2: '#E6E9F3',
  navyBorder: '#B8C2DD',
  onNavy: '#C9D1EA',
  navyPanel: '#33467A',
  navyPanel2: '#26396E',
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
  flame2: '#D9731A',
  badge: '#E8892A',
  gold: '#F2B632',

  // Green (success, lunch, recurring)
  green: '#1F7A4D',
  greenDark: '#14502F',
  greenDark2: '#2E5D43',
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
  album: '#4B3A66',

  // Media / misc
  black: '#111111',
  white: '#FFFFFF',
  lock: '#1C2433',
  lockText: '#D6DCE8',
  lockMeta: '#9AA4B8',
  notif: '#F2F2F4',
  /** Member dialogs. */
  scrim: 'rgba(20,18,14,0.55)',
  /** Pay sheet and admin modal. */
  scrimSheet: 'rgba(20,18,14,0.5)',
  /** Drawer. */
  scrimLight: 'rgba(20,18,14,0.45)',
  /** Niva popover. */
  scrimFaint: 'rgba(20,18,14,0.35)',

  // Photos (Events › Photos, album, full-screen viewer — Main.dc.html L992, L1413)
  viewerBg: '#0B0A08',
  viewerButton: '#26231C',
  viewerText: '#F4EFE6',
  viewerMeta: '#B8B0A2',
  videoBadge: '#16140F',

  // Volunteer check-in board (Volunteer.dc.html, dark)
  volBg: '#16140F',
  volPanel: '#26231C',
  volBorder: '#4A443A',
  volGold: '#D7A15F',
  volOnGold: '#1E1508',
  volText: '#F4EFE6',
  volMuted: '#B8B0A2',
  volViewfinder: '#0B0A08',
  volScanLine: '#E0533F',

  // Special days: anniversary ink (Main.dc.html KT)
  anniversary: '#9C1B5E',

  // My Jain Way / Gyan Path (Main.dc.html L669, L704; GyanPath.dc.html)
  celebrateBg: '#FFF8EC',
  celebrateBorder: '#F2D29B',
  videoTile: '#16140F',
  /** Gyan Path: locked node, boss node, unfilled lesson bar. */
  nodeLocked: '#E3DCCF',
  nodeRingDone: '#CFE6DC',
  nodeRingCurrent: '#FFE3BF',
  checkGrey: '#B9AE99',
  checkGreyShadow: '#9A8F7A',
  skipShadow: '#6B7390',
  starOff: '#3A4B80',
  treasureInk: '#3A2A06',
  wrongInk: '#8C1D18',
} as const;

export type ColorName = keyof typeof colors;

// The default palette, kept so switching from a branded community back to one
// without brand colours restores it.
const defaultColors: Record<string, string> = { ...colors };

/**
 * Theme the app from the chosen community's brand kit (centers.branding
 * colours; src/lib/community.ts brandPalette). Screens read `colors` while
 * rendering, so the next render — the root remounts per community — uses
 * the new values. Only keys present in `palette` change.
 */
export function applyPalette(palette: Record<string, string>): void {
  const target = colors as unknown as Record<string, string>;
  for (const key of Object.keys(defaultColors)) target[key] = palette[key] ?? defaultColors[key];
}

/**
 * Album palettes (Main.dc.html L1759): each album gets one, deterministically,
 * so its hero band and placeholder tiles stay the same colour while photos load.
 */
export const albumPalettes = [
  { band: '#8A4608', tiles: ['#B8742C', '#D9A15B', '#7A2E1F', '#C98A3E'] },
  { band: '#1B2C5C', tiles: ['#34487E', '#5C6FA3', '#1B2C5C', '#7D8DB8'] },
  { band: '#2F5D50', tiles: ['#3E7566', '#6E9E8F', '#2F5D50', '#A5C4B8'] },
  { band: '#5E3106', tiles: ['#7A4A1C', '#A8763F', '#5E3106', '#C9A06B'] },
  { band: '#7A2E1F', tiles: ['#A64532', '#D27A4F', '#7A2E1F', '#E3A15E'] },
  { band: '#4B3A66', tiles: ['#6A5890', '#9585B5', '#4B3A66', '#B9ABD3'] },
] as const;

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
  check: 7,
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
  cart: 28,
  fab: 30,
  round: 999,
} as const;

export const space = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  cardY: 14,
  cardX: 16,
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
  fab: 60,
  drawerRow: 64,
} as const;

/** Type scale (px, before the user's text-size multiplier). */
export const type = {
  clock: 84,
  onboardingHero: 34,
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
  tithi: 9,
} as const;

/** Letter-spacing in px at the size used (em × size). */
export const tracking = {
  /** 0.06em at 12px. */
  eyebrow: 0.72,
  label: 0.48,
  badge: 0.8,
  /** 0.02em at 17px (home header, first line). */
  wordmark: 0.34,
  /** 0.14em at 11px (home header, second line). */
  wordmarkSub: 1.54,
  /** Code inputs: em, multiply by the font size. */
  code: 0.2,
} as const;

/** Shadows (prototype box-shadows translated to RN; elevation for Android). */
export const shadows = {
  fab: { shadowColor: '#8A4608', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8 },
  cart: { shadowColor: '#2F5D50', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8 },
  menu: { shadowColor: '#14120E', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 15, elevation: 10 },
  drawer: { shadowColor: '#14120E', shadowOffset: { width: 8, height: 0 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 16 },
  /** Gyan Path sticky strip (0 4px 14px rgba(20,18,14,0.08)). */
  strip: { shadowColor: '#14120E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 7, elevation: 3 },
} as const;

/** Component specs lifted from Main.dc.html (sizes in px). */
export const components = {
  header: { padTop: 16, padX: 20, padBottom: 12, gap: 12, iconButton: 44, iconSize: 20, iconStroke: 2, markHeight: 46 },
  tabBar: { height: 76, padBottom: 8, iconSize: 22, iconStroke: 1.8, labelSize: 12, gap: 4 },
  button: { borderWidth: 1, cta: { h: 52, r: 26, size: 16 }, secondary: { h: 48, r: 26, size: 15 }, inCard: { h: 46, r: 22, size: 14 }, pill: { h: 44, r: 20, size: 13 } },
  chip: { h: 44, r: 20, size: 14 },
  layerChip: { h: 40, r: 18, size: 13, borderWidth: 1.5, dot: 10 },
  input: { h: 48, r: 12, size: 15, borderWidth: 1, labelSize: 13 },
  signInInput: { h: 52, r: 14, size: 16 },
  card: { r: 18, padY: 14, padX: 16, hero: { r: 20, pad: 16 } },
  segmented: { trackR: 14, trackPad: 4, gap: 4, itemR: 10, h: 44, size: 14 },
  toggle: { w: 46, h: 28, knob: 22 },
  checkbox: { size: 24, r: 6, borderWidth: 2 },
  toast: { top: 76, x: 20, r: 14, padY: 12, padX: 14, size: 14 },
  dialog: { r: 24, padY: 22, padX: 20, gap: 12, titleSize: 22, bodySize: 14, bodyLine: 1.55 },
  drawer: { width: 304, edgeR: 24, markHeight: 52, nameSize: 19, rowH: 64, rowR: 14, tile: 44, tileR: 12, iconSize: 22 },
  fab: { h: 60, r: 30, right: 16, bottom: 92, size: 15 },
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
