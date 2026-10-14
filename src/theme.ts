/**
 * The app's design tokens.
 *
 * Weaver's own look comes from the brand kit (connect-crm `brand/`, vendored as src/brand/tokens.json and read through
 * src/brand/index.ts): its colours, its two faces and its radii. Everything the kit does not cover (the colours of the
 * giving, store, learning, photo and check-in screens, lifted from the member-app prototypes: Main.dc.html and friends,
 * connect-crm/docs/parity/v-visual-system.md) stays below as `appOnly`, each group named for what it paints, and is listed
 * in docs/BRAND_CONFORMANCE.md as a decision for the owner. Never hard-code a colour in a screen: add it here (a test fails
 * when a colour literal appears anywhere else).
 *
 * The chosen community's brand colours are layered on top at run time (applyPalette below) without touching screens:
 * a community's own name, logo and colours are its identity inside its own screens and are not replaced by the kit.
 */
import { Platform } from 'react-native';

import { brandColor, brandFace, brandFallbackCss, brandRadius, brandSpace, brandTypeStyle, type BrandColorName, type BrandFontRole } from './brand';
import { mixHex } from './lib/community';

/**
 * Theme colour → the kit colour that paints it. The values come from src/brand/tokens.json; a test (brand-conformance)
 * checks every entry resolves, so a kit file without one of these names fails there rather than on a phone.
 */
export const BRAND_COLOR_MAP = {
  // Surfaces
  ground: 'canvas',
  frame: 'line',
  card: 'white',
  panel: 'track',
  divider: 'line-soft',
  dividerLight: 'line-soft',
  chip: 'track',

  // Borders
  border: 'line',
  borderInput: 'line-input',
  /** Onboarding and bar progress tracks. */
  track: 'track',

  // Ink
  ink: 'ink',
  ink2: 'ink-2',
  muted: 'muted',

  // Navy (indigo, primary)
  navy: 'navy',
  navyHover: 'navy-hover',
  navyTint: 'navy-50',
  navyTint2: 'navy-100',
  navyBorder: 'navy-300',
  onNavy: 'navy-200',

  // Ember and the warm tints (giving, bolis)
  brown: 'brown',
  brownDark: 'brown-900',
  brownText: 'brown-900',
  brownTint: 'saffron-50',
  brownBorder: 'saffron-200',
  onBrown: 'saffron-50',
  gold: 'gold',

  // Success and error
  green: 'success',
  greenTint: 'success-50',
  danger: 'danger',
  dangerTint: 'danger-50',

  white: 'white',
} as const satisfies Record<string, BrandColorName>;

const kitColors = Object.fromEntries(Object.entries(BRAND_COLOR_MAP).map(([key, name]) => [key, brandColor(name)])) as { [K in keyof typeof BRAND_COLOR_MAP]: string };

// The lighter and disabled indigos: the same mixes `brandPalette` (lib/community.ts) applies to a community's own primary, so
// Weaver's default navy and a community's navy are built the same way.
const indigo = brandColor('navy');
const paper = brandColor('white');
const derivedFromKit = {
  navyPanel: mixHex(indigo, paper, 0.12),
  navyPanel2: mixHex(indigo, paper, 0.06),
  navyDisabled: mixHex(indigo, paper, 0.45),
};

/**
 * Colours the brand kit has no token for: each group paints one part of the app (the owner decides, in
 * docs/BRAND_CONFORMANCE.md "Owner decisions", whether the kit grows to cover them or they are recoloured).
 */
const appOnly = {
  // Neutrals the kit lacks: placeholder and idle text, dashed borders, switches, empty stars.
  faint: '#8A8478',
  dashed: '#B9AE99',
  dashed2: '#D5CBB8',
  toggleOff: '#CFC8BA',
  starEmpty: '#E3DCCF',

  // The community accent (a community's accent colour replaces it) and the flame of the streak badge. The kit's saffron is a
  // ground that takes ink, but these carry white glyphs and labels (3:1 or less on the kit's orange), so they stay as they were.
  saffron: '#C9731C',
  flame: '#F2A03D',
  flame2: '#D9731A',
  badge: '#E8892A',

  // Green (the deeper greens of lunch, recurring and success pills)
  greenDark: '#14502F',
  greenDark2: '#2E5D43',
  greenBorder: '#B7DCC6',
  onNavyGreen: '#7FD1A4',

  // Store green
  store: '#2F5D50',
  storeLight: '#3E7566',
  onStore: '#CFE6DC',
  storeTint: '#E8F1ED',

  // Red / maroon
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
  /** Niva popover, pickers. */
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
  /**
   * Navang puja: chandan (sandalwood mixed with kesar), the colour of the puja itself. Every spot on the murti
   * picture uses only these: a place still to touch, the one to touch now, and a place already touched. Never
   * a community brand colour (brandPalette does not map these keys), so the puja looks the same everywhere.
   */
  chandan: '#E8A33D',
  chandanDeep: '#9A5B12',
  /** The pressed-edge of a chandan button (Button3D). */
  chandanEdge: '#6B3E0B',
  chandanTint: '#FCEFD8',
  /** Navang puja: a place still to touch (a chandan ring over a pale chandan fill). */
  spotFill: 'rgba(252,239,216,0.75)',
} as const;

export const colors = { ...kitColors, ...derivedFromKit, ...appOnly };

export type ColorName = keyof typeof colors;

// The default palette, kept so switching from a branded community back to one
// without brand colours restores it.
const defaultColors: Record<string, string> = { ...colors };

// The layers a colour comes from, strongest first: the community's brand kit, the member-app template's theme
// (src/lib/template.ts resolveTheme), the built-in palette above. Each colour takes the first layer that sets it.
let brandLayer: Record<string, string> = {};
let templateLayer: Record<string, string> = {};

function paintColors(): void {
  const target = colors as unknown as Record<string, string>;
  for (const key of Object.keys(defaultColors)) target[key] = brandLayer[key] ?? templateLayer[key] ?? defaultColors[key];
}

/**
 * Theme the app from the chosen community's brand kit (centers.branding
 * colours; src/lib/community.ts brandPalette). Screens read `colors` while
 * rendering, so the next render — the root remounts per community — uses
 * the new values. Only keys present in `palette` change. The brand kit wins
 * over the template's theme (applyTemplateTheme), colour by colour.
 */
export function applyPalette(palette: Record<string, string>): void {
  brandLayer = palette;
  paintColors();
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

/**
 * Font family names as registered with expo-font in the root layout (src/brand/fonts.ts): the kit's display face
 * (Bricolage Grotesque, at the kit's heading weights 600 and 700) and text face (Hanken Grotesk). On the web a face that
 * has not loaded falls back through the kit's own stack rather than the browser's default serif.
 */
const face = (role: BrandFontRole, weight: string): string => {
  const family = `${brandFace(role).replace(/\s+/g, '')}_${weight}`;
  return Platform.OS === 'web' ? `${family}, ${brandFallbackCss(role)}` : family;
};

export const fonts = {
  display: face('display', '600SemiBold'),
  displayBold: face('display', '700Bold'),
  body: face('sans', '400Regular'),
  bodyMedium: face('sans', '500Medium'),
  bodySemi: face('sans', '600SemiBold'),
  bodyBold: face('sans', '700Bold'),
} as const;

export const radii = {
  /** The kit's radius-chip. */
  xs: brandRadius('radius-chip'),
  check: 7,
  sm: 8,
  md: 10,
  lg: 12,
  card: 14,
  /** The kit's radius-tile. */
  row: brandRadius('radius-tile'),
  xl: 18,
  xxl: 20,
  pill: 22,
  /** The kit's radius-card. */
  sheet: brandRadius('radius-card'),
  cta: 26,
  cart: 28,
  /** The kit's radius-pill. */
  round: brandRadius('radius-pill'),
} as const;

const defaultRadii: Record<string, number> = { ...radii };

/**
 * Lay a member-app template's look under the brand kit (src/lib/template.ts resolveTheme): its colours (surface, primary, accent)
 * only where the brand kit sets none, and its corner radii (null: the built-in ones). Like the brand kit, the values are read while
 * rendering, so what is drawn after this call uses them; nothing here is a screen's business. `{ palette: {}, radii: null }` restores
 * the built-in look.
 */
export function applyTemplateTheme(theme: { palette: Record<string, string>; radii: Record<string, number> | null }): void {
  templateLayer = theme.palette;
  paintColors();
  const target = radii as unknown as Record<string, number>;
  for (const key of Object.keys(defaultRadii)) target[key] = theme.radii?.[key] ?? defaultRadii[key];
}

export const space = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  cardY: 14,
  cardX: 16,
  lg: 16,
  /** The kit's gutter. */
  gutter: brandSpace('gutter'),
  xl: 24,
  xxl: 32,
} as const;

/**
 * Minimum touch targets (px). 44 is the platform floor for anything tappable (this repo's rule); the brand kit's
 * `tap-target` is 48 (docs/BRAND_CONFORMANCE.md, owner decision).
 */
export const touch = {
  min: 44,
  secondary: 48,
  cta: 52,
  row: 56,
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

/**
 * The kit's display tracking in em: its `hero` style for the page headline, `heading` for section headings and
 * `heading-sm` for panel headings. Multiply by the font size for px.
 */
export const displayTracking = {
  hero: brandTypeStyle('hero').letterSpacingEm,
  heading: brandTypeStyle('heading').letterSpacingEm,
  headingSm: brandTypeStyle('heading-sm').letterSpacingEm,
} as const;

/** Shadows (prototype box-shadows translated to RN; elevation for Android). The kit's shadows are tinted with its indigo. */
export const shadows = {
  cart: { shadowColor: appOnly.store, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8 },
  menu: { shadowColor: indigo, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 15, elevation: 10 },
  drawer: { shadowColor: indigo, shadowOffset: { width: 8, height: 0 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 16 },
  /** Gyan Path sticky strip (0 4px 14px). */
  strip: { shadowColor: indigo, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 7, elevation: 3 },
} as const;

/** Component specs lifted from Main.dc.html (sizes in px). */
export const components = {
  header: { padTop: 16, padX: 20, padBottom: 12, gap: 12, iconButton: 44, iconSize: 20, iconStroke: 2, markHeight: 46 },
  // The kit's icons are drawn with stroke 2.
  tabBar: { height: 76, padBottom: 8, iconSize: 22, iconStroke: 2, labelSize: 12, gap: 4 },
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
  /** Web only: the whole app (header, tab bar, everything) is boxed to this width and
   * centred, so a wide monitor still reads as a phone screen instead of stretching a
   * mobile layout edge-to-edge. See WebFrame in app/_layout.tsx. */
  webAppWidth: 480,
} as const;
