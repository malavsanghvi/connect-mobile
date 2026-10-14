/**
 * Guards for the Weaver brand kit (docs/BRAND_CONFORMANCE.md). They fail when:
 *  - a colour literal appears in src/ outside the theme module and the small allowlist below;
 *  - a user-facing string says "Community Connect" (the product is "Weaver");
 *  - the vendored brand kit copy (src/brand/tokens.json) lacks a token the theme reads;
 * and keep the app's native colours, images and the web focus ring on the kit.
 */
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import { en } from '../../i18n/en';
import { colors, fonts, BRAND_COLOR_MAP, displayTracking, radii, space } from '../../theme';
import {
  BRAND_COLOR_NAMES,
  BRAND_FONT_ROLES,
  BRAND_RADIUS_NAMES,
  BRAND_SPACING_NAMES,
  BRAND_TYPE_STYLE_NAMES,
  brandColor,
  brandFace,
  brandFallbackCss,
  brandRadius,
  brandSpace,
  brandTypeStyle,
  WEAVER_DESCRIPTOR,
  WEAVER_NAME,
} from '../index';
import { brandFontAssets } from '../fonts';

const repo = path.join(__dirname, '..', '..', '..');
const srcDir = path.join(repo, 'src');
const rel = (file: string) => path.relative(repo, file).split(path.sep).join('/');

/** Every source file under a directory, except tests and the generated database types. */
function sourceFiles(dir: string, exts: RegExp): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...sourceFiles(full, exts));
    } else if (exts.test(entry.name) && entry.name !== 'database.types.ts') {
      out.push(full);
    }
  }
  return out;
}

/** The text with block and line comments removed (comments may name colours and the old product name freely). */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const COLOUR_LITERAL = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|\brgba?\s*\(|\bhsla?\s*\(/g;

/**
 * The files allowed to hold colour literals. Keep this short: every entry says why.
 * Everything else reads colours from `colors` in src/theme.ts.
 */
const COLOUR_LITERAL_ALLOWLIST: Record<string, string> = {
  'src/theme.ts': 'the theme module: the colours the kit has no token for, the album palettes, and the mixes derived from the kit',
  'src/lib/community.ts': "tenant branding: mixing a community's own primary colour with black and white (brandPalette), and checking #RRGGBB input",
  'src/lib/template.ts': "tenant branding: the 'cool' and 'plain' surfaces a community's member-app template can choose (not Weaver's own chrome)",
};

describe('brand conformance: colours', () => {
  it('keeps colour literals out of src/ (outside the theme module and the allowlist)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir, /\.(ts|tsx)$/)) {
      if (rel(file) in COLOUR_LITERAL_ALLOWLIST) continue;
      const found = withoutComments(fs.readFileSync(file, 'utf8')).match(COLOUR_LITERAL);
      if (found) offenders.push(`${rel(file)}: ${[...new Set(found)].join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every allowlisted file real (a stale entry hides nothing and should go)', () => {
    for (const file of Object.keys(COLOUR_LITERAL_ALLOWLIST)) expect(fs.existsSync(path.join(repo, file))).toBe(true);
  });

  it("keeps the web stylesheet's colours on the kit (the focus ring is the kit's navy)", () => {
    const kit = new Set(BRAND_COLOR_NAMES.map((name) => brandColor(name).toLowerCase()));
    for (const file of sourceFiles(srcDir, /\.css$/)) {
      const found = withoutComments(fs.readFileSync(file, 'utf8')).match(COLOUR_LITERAL) ?? [];
      for (const colour of found) expect([rel(file), kit.has(colour.toLowerCase())]).toEqual([rel(file), true]);
    }
    expect(fs.readFileSync(path.join(srcDir, 'global.css'), 'utf8')).toContain(`outline: 2px solid ${brandColor('navy')}`);
  });

  it('paints the app from the kit where the kit has a colour: every mapped theme colour equals its kit token', () => {
    for (const [key, name] of Object.entries(BRAND_COLOR_MAP)) {
      expect([key, (colors as Record<string, string>)[key]]).toEqual([key, brandColor(name)]);
    }
    expect(colors.navy).toBe('#2b2a8a');
    expect(colors.ground).toBe('#fffaf5');
  });

  it("keeps the native colours (app.json) on the kit: splash, status and notification colours are the kit's", () => {
    const kit = new Set(BRAND_COLOR_NAMES.map((name) => brandColor(name).toLowerCase()));
    const found: string[] = [];
    const walk = (value: unknown, where: string) => {
      if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)) found.push(`${where}=${value}`);
      else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
      else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${where}.${k}`);
    };
    walk(JSON.parse(fs.readFileSync(path.join(repo, 'app.json'), 'utf8')), 'app.json');
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((entry) => !kit.has(entry.split('=')[1].toLowerCase()))).toEqual([]);
  });

  it('meets the contrast the kit promises for the pairs the app uses most (WCAG, 4.5:1 for text)', () => {
    const lum = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const pairs: [string, string, string][] = [
      ['ink', 'ground', 'body text'],
      ['ink', 'card', 'body text on cards'],
      ['muted', 'ground', 'supporting text'],
      ['muted', 'card', 'supporting text on cards'],
      ['white', 'navy', 'primary button label'],
      ['onNavy', 'navy', 'body text on a navy card'],
      ['navy', 'navyTint', 'navy text on its tint'],
      ['brown', 'card', 'accent text'],
      ['brownDark', 'brownTint', 'text in an amber callout'],
      ['white', 'brown', 'brown button label'],
      ['danger', 'dangerTint', 'error text'],
      ['white', 'green', 'success button label'],
    ];
    const low = pairs.filter(([fg, bg]) => ratio((colors as Record<string, string>)[fg], (colors as Record<string, string>)[bg]) < 4.5).map(([fg, bg, what]) => `${fg} on ${bg} (${what})`);
    expect(low).toEqual([]);
  });
});

describe('brand conformance: the vendored kit has what the theme reads', () => {
  it('has every interface colour as #rrggbb', () => {
    for (const name of BRAND_COLOR_NAMES) expect([name, brandColor(name)]).toEqual([name, expect.stringMatching(/^#[0-9a-f]{6}$/)]);
  });

  it('has the radii, spacing, type styles and font families the theme reads', () => {
    for (const name of BRAND_RADIUS_NAMES) expect(brandRadius(name)).toBeGreaterThan(0);
    for (const name of BRAND_SPACING_NAMES) expect(brandSpace(name)).toBeGreaterThan(0);
    for (const name of BRAND_TYPE_STYLE_NAMES) expect(brandTypeStyle(name).fontSize).toBeGreaterThan(0);
    for (const role of BRAND_FONT_ROLES) expect(brandFace(role).length).toBeGreaterThan(0);
    expect(displayTracking.hero).toBeLessThan(0);
    expect(radii.round).toBe(brandRadius('radius-pill'));
    expect(radii.sheet).toBe(brandRadius('radius-card'));
    expect(space.gutter).toBe(brandSpace('gutter'));
  });

  it("names the kit's two faces: Bricolage Grotesque for display, Hanken Grotesk for text", () => {
    expect(brandFace('display')).toBe('Bricolage Grotesque');
    expect(brandFace('sans')).toBe('Hanken Grotesk');
    expect(brandFallbackCss('sans')).toContain('system-ui');
  });

  it('bundles a font file for every family the theme names', () => {
    const bundled = Object.keys(brandFontAssets);
    for (const family of Object.values(fonts)) expect([family, bundled]).toEqual([family, expect.arrayContaining([family.split(',')[0]])]);
    for (const [name, file] of Object.entries(brandFontAssets)) expect([name, file]).toEqual([name, expect.anything()]);
    const faces = fs.readdirSync(path.join(repo, 'assets', 'fonts')).filter((f) => f.endsWith('.ttf'));
    expect(faces.sort()).toEqual(bundled.map((name) => `${name}.ttf`).sort());
  });

  it('keeps the lockup words as the brand book gives them', () => {
    expect(WEAVER_NAME).toBe('Weaver');
    expect(WEAVER_DESCRIPTOR).toBe('Community management platform');
  });
});

describe('brand conformance: images', () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(repo, 'app.json'), 'utf8')) as { expo: Record<string, unknown> };

  it('points app.json at image files that exist', () => {
    const paths: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string' && /^\.\/assets\/.+\.(png|jpg|webp|svg)$/.test(value)) paths.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(appJson.expo);
    expect(paths.length).toBeGreaterThan(5);
    expect(paths.filter((p) => !fs.existsSync(path.join(repo, p)))).toEqual([]);
  });

  it("uses the kit's mark on white, unchanged, as the app icon", () => {
    expect(appJson.expo.icon).toBe('./assets/brand/weaver-mark-on-white-1024.png');
    const png = fs.readFileSync(path.join(repo, 'assets/brand/weaver-mark-on-white-1024.png'));
    expect(png.readUInt32BE(16)).toBe(1024); // PNG header: width
    expect(png.readUInt32BE(20)).toBe(1024); // height
  });

  it('keeps the master mark (assets/brand/weaver-mark.svg) and no second Weaver mark in the repo', () => {
    expect(fs.readFileSync(path.join(repo, 'assets/brand/weaver-mark.svg'), 'utf8')).toContain('<title>Weaver</title>');
    expect(fs.existsSync(path.join(repo, 'assets/source'))).toBe(false);
  });
});

describe('brand conformance: voice', () => {
  /** User-facing English: the dictionary and the string literals in the source (comments and tests excluded). */
  const literals = (text: string): string[] => withoutComments(text).match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
  // "Community Connections" and "the community connected" are plain English; the scheme communityconnect:// has no space or capital.
  const OLD_NAME = { test: (s: string) => /\bcommunity connect\b/i.test(s) || /\bCommunityConnect\b/.test(s) };

  it('never calls the product "Community Connect" (the deep-link scheme communityconnect:// is a link, not a name)', () => {
    const offenders = Object.entries(en).filter(([, value]) => OLD_NAME.test(value)).map(([key]) => key);
    for (const file of sourceFiles(srcDir, /\.(ts|tsx)$/)) {
      if (rel(file) === 'src/i18n/en.ts') continue;
      for (const literal of literals(fs.readFileSync(file, 'utf8'))) if (OLD_NAME.test(literal)) offenders.push(`${rel(file)}: ${literal.slice(0, 80)}`);
    }
    const app = JSON.stringify(JSON.parse(fs.readFileSync(path.join(repo, 'app.json'), 'utf8')));
    if (OLD_NAME.test(app)) offenders.push('app.json');
    expect(offenders).toEqual([]);
  });

  it('writes the product as "Weaver" on the screens that name it', () => {
    expect(en['community.subtitle']).toContain('Weaver');
    expect(en['setup.title']).toContain('Weaver');
    expect(en['drawer.version']).toContain('Weaver');
  });

  it('has no exclamation marks in the English copy, except a community greeting that is spoken as written', () => {
    // "Jai Jinendra!" is the greeting itself, in the community's own voice (docs/BRAND_CONFORMANCE.md, owner decisions).
    const GREETINGS = ['guide.composeDefault', 'guide.leadDefault', 'niva.greeting'];
    const offenders = Object.entries(en).filter(([key, value]) => value.includes('!') && !GREETINGS.includes(key)).map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('promises nothing it has no date for ("coming soon"), except the wallet pass lines awaiting an owner decision', () => {
    // docs/BRAND_CONFORMANCE.md, owner decisions: remove the Wallet button and its note, or give it a target quarter.
    const PENDING = ['tickets.wallet', 'tickets.walletNote'];
    const offenders = Object.entries(en).filter(([key, value]) => /coming soon/i.test(value) && !PENDING.includes(key)).map(([key]) => key);
    expect(offenders).toEqual([]);
  });
});
