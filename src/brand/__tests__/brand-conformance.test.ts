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
import { brandPalette } from '../../lib/community';
import { colors, fonts, BRAND_COLOR_MAP, displayTracking, radii, space, touch } from '../../theme';
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
    pairs.push(
      ['white', 'saffron', 'white label on the accent (saffron-strong, 4.7:1)'],
      ['saffron', 'card', 'accent text on white'],
      ['faint', 'card', 'placeholder and idle text on cards (5.2:1)'],
      ['faint', 'ground', 'placeholder and idle text on the page'],
      ['faint', 'panel', 'idle text on a panel'],
      ['warning', 'card', 'warning icon and text on white (5.9:1)'],
      ['warning', 'warningTint', 'warning icon on its tint (5.5:1)'],
      ['warningInk', 'warningTint', 'warning text (8.6:1)'],
    );
    const low = pairs.filter(([fg, bg]) => ratio((colors as Record<string, string>)[fg], (colors as Record<string, string>)[bg]) < 4.5).map(([fg, bg, what]) => `${fg} on ${bg} (${what})`);
    expect(low).toEqual([]);
    // What tells a control from the page (an input's border, a switch that is off) needs 3:1 (WCAG 1.4.11).
    for (const bg of ['card', 'ground'] as const) expect(ratio(colors.borderControl, colors[bg])).toBeGreaterThanOrEqual(3);
  });

  it('keeps the tap target at the kit\'s 48 and every tappable minimum on it', () => {
    expect(touch.min).toBe(brandSpace('tap-target'));
    expect(touch.min).toBe(48);
    // A hand-written minimum under 48 on a pressable or a button would undo it (a badge or an input may be any height).
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir, /\.(ts|tsx)$/)) {
      withoutComments(fs.readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (/min(Height|Width): (3\d|4[0-7])\b/.test(line) && /Pressable|pressed|<Button|onPress/.test(line)) offenders.push(`${rel(file)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
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

  it("names the kit's three faces: Bricolage Grotesque for display, Hanken Grotesk for text, JetBrains Mono for identifiers", () => {
    expect(brandFace('display')).toBe('Bricolage Grotesque');
    expect(brandFace('sans')).toBe('Hanken Grotesk');
    expect(brandFace('mono')).toBe('JetBrains Mono');
    expect(brandFallbackCss('sans')).toContain('system-ui');
    expect(brandFallbackCss('mono')).toContain('monospace');
    expect(fonts.mono).toContain('JetBrainsMono_500Medium');
    expect(brandTypeStyle('identifier')).toMatchObject({ fontSize: 13.5, fontWeight: 500 });
  });

  it("reads the kit's v2 tokens: strong accent, control border, faint, warning, field and tag radii, control sizes", () => {
    expect(brandColor('saffron-strong')).toBe('#c2501c');
    expect(brandColor('line-control')).toBe('#85889e');
    expect(brandColor('faint')).toBe('#666b86');
    expect(brandColor('warning-ink')).toBe('#6d3b07');
    expect(radii.field).toBe(brandRadius('radius-field'));
    expect(radii.tag).toBe(brandRadius('radius-tag'));
    expect(touch.cta).toBe(brandSpace('control-primary'));
    expect([brandSpace('control-primary'), brandSpace('control-compact'), brandSpace('control-dense')]).toEqual([52, 40, 36]);
    // The temporary stand-ins are gone: the theme names the kit's tokens.
    expect(fs.readFileSync(path.join(srcDir, 'theme.ts'), 'utf8')).not.toMatch(/TEMP_|TODO\(brand-tokens\)/);
  });

  it('keeps module tags and tiles to one hue, navy: the colours that had a hue per module are the navy family, a community primary included', () => {
    for (const key of ['purple', 'store', 'maroon', 'album'] as const) expect([key, colors[key]]).toEqual([key, colors.navy]);
    expect(colors.purpleTint).toBe(colors.navyTint);
    expect(colors.storeTint).toBe(colors.navyTint);
    const own = brandPalette({ colors: { primary: '#0A3D2E' } });
    expect(own.purple).toBe('#0A3D2E');
    expect(own.storeTint).toBe(own.navyTint);
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

describe('brand conformance: icons', () => {
  it("draws the kit's 42 icons with the kit's own shapes (assets/brand/icons are the kit's files), element for element", () => {
    // The JSX (Path, Circle, Rect, strokeWidth={n}) read as the SVG the kit ships.
    const source = fs
      .readFileSync(path.join(srcDir, 'components', 'stroke-icon.tsx'), 'utf8')
      .replace(/<Path/g, '<path')
      .replace(/<Circle/g, '<circle')
      .replace(/<Rect/g, '<rect')
      .replace(/strokeWidth=\{([\d.]+)\}/g, 'stroke-width="$1"')
      .replace(/\s+/g, ' ');
    const files = fs.readdirSync(path.join(repo, 'assets', 'brand', 'icons')).filter((f) => f.endsWith('.svg'));
    expect(files).toHaveLength(42);
    const missing: string[] = [];
    for (const file of files) {
      const svg = fs.readFileSync(path.join(repo, 'assets', 'brand', 'icons', file), 'utf8');
      for (const [, tag, attrs] of svg.matchAll(/<(path|circle|rect)\s+([^>]*?)\s*\/>/g)) {
        if (!source.includes(`<${tag} ${attrs.replace(/\s+/g, ' ')} />`)) missing.push(`${file}: <${tag} ${attrs}>`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('sets identifiers (member, household and pledge numbers) in the kit\'s mono face, in the lines that show them', () => {
    const read = (file: string) => fs.readFileSync(path.join(srcDir, file), 'utf8');
    expect(read('components/ui.tsx')).toMatch(/identifier: \{ fontFamily: fonts\.mono/);
    expect(read('components/ui.tsx')).toMatch(/<Text style=\{\{ fontFamily: fonts\.mono \}\}>/);
    for (const file of ['app/(app)/member-card.tsx', 'app/(app)/(tabs)/family.tsx', 'app/(app)/person/[id].tsx', 'app/(app)/pledges.tsx', 'app/(app)/zelle-report.tsx', 'app/(app)/event/[id]/tickets.tsx']) {
      expect([file, read(file).includes('<Ident>')]).toEqual([file, true]);
    }
  });

  it('asks the kit for a drawing before an Ionicon (Icon maps the names the kit covers)', () => {
    const icon = fs.readFileSync(path.join(srcDir, 'components', 'icon.tsx'), 'utf8');
    for (const name of ['checkmark', 'close', "'ticket-outline'", "'card-outline'"]) expect(icon).toContain(`${name}:`);
  });
});

describe('brand conformance: links', () => {
  it('opens the Weaver scheme and still the two older ones, so links already printed keep working', () => {
    const scheme = (JSON.parse(fs.readFileSync(path.join(repo, 'app.json'), 'utf8')) as { expo: { scheme: string[] } }).expo.scheme;
    expect(scheme).toEqual(expect.arrayContaining(['weaver', 'communityconnect', 'connect']));
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

  it('has no exclamation marks in the English copy', () => {
    expect(Object.entries(en).filter(([, value]) => value.includes('!')).map(([key]) => key)).toEqual([]);
  });

  it('promises nothing it has no date for ("coming soon")', () => {
    expect(Object.entries(en).filter(([, value]) => /coming soon/i.test(value)).map(([key]) => key)).toEqual([]);
    expect(en).not.toHaveProperty('tickets.wallet');
  });

  it("greets in the community's own word, never a faith word by default: the greeting strings take {greeting}", () => {
    for (const key of ['guide.composeDefault', 'guide.leadDefault', 'niva.greeting'] as const) {
      expect([key, en[key]]).toEqual([key, expect.stringContaining('{greeting}')]);
    }
    const everyone = Object.entries(en).filter(([key]) => /^(welcome|community|setup|signin)\./.test(key) || key === 'niva.greeting' || key.startsWith('guide.compose') || key === 'guide.leadDefault');
    expect(everyone.filter(([, value]) => /jinendra|jai |anumodana/i.test(value)).map(([key]) => key)).toEqual([]);
  });

  it('keeps the old working name "Connect" out of the screens (a feature is named for what it is)', () => {
    expect(Object.entries(en).filter(([, value]) => /\bConnect\b/.test(value)).map(([key]) => key)).toEqual([]);
  });

  it('marks Niva with the kit\'s AI tag: the chat, the drawer row and the guide tile', () => {
    const read = (file: string) => fs.readFileSync(path.join(srcDir, file), 'utf8');
    expect(read('app/(app)/niva.tsx')).toContain('<AiLine label="Niva"');
    expect(read('components/drawer.tsx')).toContain('<AiTag label="Niva"');
    expect(read('app/(app)/guide/index.tsx')).toContain('<AiTag label="Niva"');
  });
});
