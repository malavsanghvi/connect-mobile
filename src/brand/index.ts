/**
 * The Weaver brand kit, as the app reads it.
 *
 * `tokens.json` next to this file is a verbatim copy of connect-crm's `brand/tokens.json`, the brand kit's source of
 * truth (colours, type, radii, spacing). Never edit the copy: when the kit changes, copy the new file over it (see
 * docs/BRAND_CONFORMANCE.md, "Keeping it current"). `src/theme.ts` builds the app's palette, faces and radii from these
 * functions, and `src/brand/__tests__/brand-conformance.test.ts` fails when the copy lacks a token the theme reads.
 *
 * Tenant branding (a community's own name, logo and colours, applied by `applyPalette` in the theme) is a layer above the
 * kit and is not handled here: this module is Weaver's own identity.
 */
import tokens from './tokens.json';

type RawToken = { name: string; value: string };

/** The interface colours of the kit. The `mark-*` colours belong to the logo only and are left out on purpose. */
export const BRAND_COLOR_NAMES = [
  'navy',
  'navy-hover',
  'navy-50',
  'navy-100',
  'navy-200',
  'navy-300',
  'saffron',
  'saffron-strong',
  'saffron-50',
  'saffron-200',
  'gold',
  'brown',
  'brown-900',
  'canvas',
  'ground',
  'track',
  'line',
  'line-soft',
  'line-input',
  'line-control',
  'ink',
  'ink-2',
  'muted',
  'faint',
  'white',
  'success',
  'success-50',
  'danger',
  'danger-50',
  'warning',
  'warning-50',
  'warning-200',
  'warning-ink',
] as const;
export type BrandColorName = (typeof BRAND_COLOR_NAMES)[number];

export const BRAND_RADIUS_NAMES = ['radius-pill', 'radius-card', 'radius-tile', 'radius-logo-tile', 'radius-chip', 'radius-field', 'radius-tag'] as const;
export type BrandRadiusName = (typeof BRAND_RADIUS_NAMES)[number];

export const BRAND_SPACING_NAMES = ['gutter', 'gap', 'card-pad', 'tap-target', 'control-primary', 'control-compact', 'control-dense'] as const;
export type BrandSpacingName = (typeof BRAND_SPACING_NAMES)[number];

export const BRAND_FONT_ROLES = ['display', 'sans', 'mono'] as const;
export type BrandFontRole = (typeof BRAND_FONT_ROLES)[number];

const byName = (list: readonly RawToken[]): Map<string, string> => new Map(list.map((t) => [t.name, t.value]));
const colorTokens = byName(tokens.color.tokens);
const radiusTokens = byName(tokens.radius.tokens);
const spacingTokens = byName(tokens.spacing.tokens);
const families: Record<string, string> = tokens.type.families;

/** A kit token the app needs but the vendored copy lacks is a defect of the copy: say which one. */
function need(map: Map<string, string>, kind: string, name: string): string {
  const value = map.get(name);
  if (value === undefined) throw new Error(`The brand kit copy (src/brand/tokens.json) has no ${kind} "${name}". Copy connect-crm's brand/tokens.json over it.`);
  return value;
}

/** A kit colour as "#rrggbb" (the kit writes them in lower case), `{name}` references followed. */
export function brandColor(name: BrandColorName): string {
  const value = need(colorTokens, 'colour', name);
  const ref = /^\{(.+)\}$/.exec(value);
  return ref ? need(colorTokens, 'colour', ref[1]) : value;
}

/** A kit radius in px. */
export function brandRadius(name: BrandRadiusName): number {
  return Number.parseFloat(need(radiusTokens, 'radius', name));
}

/** A kit spacing value in px. */
export function brandSpace(name: BrandSpacingName): number {
  return Number.parseFloat(need(spacingTokens, 'spacing', name));
}

/** The kit's font stack for a role, split into its names, e.g. ['Bricolage Grotesque', 'Hanken Grotesk', 'ui-sans-serif', ...]. */
function stack(role: BrandFontRole): string[] {
  const raw = families[role];
  if (!raw) throw new Error(`The brand kit copy (src/brand/tokens.json) has no font family "${role}". Copy connect-crm's brand/tokens.json over it.`);
  return raw.split(',').map((part) => part.trim().replace(/^"|"$/g, ''));
}

/** The face a role is set in: "Bricolage Grotesque" for display, "Hanken Grotesk" for text, "JetBrains Mono" for identifiers. */
export function brandFace(role: BrandFontRole): string {
  return stack(role)[0];
}

/** What follows the face in the kit's stack, as CSS: used on the web, where a face that has not loaded falls back by name. */
export function brandFallbackCss(role: BrandFontRole): string {
  return stack(role)
    .slice(1)
    .map((name) => (/\s/.test(name) ? `"${name}"` : name))
    .join(', ');
}

export const BRAND_TYPE_STYLE_NAMES = ['hero', 'heading', 'heading-sm', 'wordmark', 'descriptor', 'ai-tag', 'caption', 'identifier'] as const;
export type BrandTypeStyleName = (typeof BRAND_TYPE_STYLE_NAMES)[number];

type RawTypeStyle = { name: string; fontSize?: string; fontWeight?: number; letterSpacing?: string; lineHeight?: number };
const typeStyles = new Map<string, RawTypeStyle>((tokens.type.groups as { styles: RawTypeStyle[] }[]).flatMap((g) => g.styles).map((s) => [s.name, s]));

/** A kit type style: its size in px, its weight, its line height as a multiple of the size (1 when the kit sets none) and its letter-spacing in em (0 when the kit sets none). */
export function brandTypeStyle(name: BrandTypeStyleName): { fontSize: number; fontWeight: number; lineHeight: number; letterSpacingEm: number } {
  const s = typeStyles.get(name);
  if (!s || s.fontSize === undefined || s.fontWeight === undefined) throw new Error(`The brand kit copy (src/brand/tokens.json) has no type style "${name}". Copy connect-crm's brand/tokens.json over it.`);
  return { fontSize: Number.parseFloat(s.fontSize), fontWeight: s.fontWeight, lineHeight: s.lineHeight ?? 1, letterSpacingEm: s.letterSpacing ? Number.parseFloat(s.letterSpacing) : 0 };
}

/** The words Weaver is introduced with, set word for word as the brand book gives them (Logo: name and descriptor). */
export const WEAVER_NAME = 'Weaver';
export const WEAVER_DESCRIPTOR = 'Community management platform';
