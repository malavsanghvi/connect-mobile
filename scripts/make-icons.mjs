/**
 * Regenerates the Community Connect app icon, adaptive icon layers, favicon
 * and splash image from the vector mark below. Renders with Playwright's
 * Chromium (not a project dependency; run with a global install):
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=$(npm root -g) node scripts/make-icons.mjs
 *
 * Mark: a saffron lotus over a cream water line on a navy (#1B2C5C) square.
 * The community's own logo is tenant branding and never appears here.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAVY = '#1B2C5C';
const CREAM = '#FBF7F0';

// One petal: base at the origin, pointing up, 300 units tall.
const PETAL = 'M0,0 C82,-80 82,-215 0,-300 C-82,-215 -82,-80 0,0 Z';

/** Lotus glyph in a 1024 box. `mono` draws a single-colour silhouette. */
function lotus({ mono = false, water = true } = {}) {
  const fill = (c) => (mono ? '#FFFFFF' : c);
  const petals = [
    { r: -64, s: 0.7, c: '#C9731C' },
    { r: 64, s: 0.7, c: '#C9731C' },
    { r: -32, s: 0.9, c: '#E8892A' },
    { r: 32, s: 0.9, c: '#E8892A' },
    { r: 0, s: 1.08, c: '#F2B632' },
  ]
    .map(
      (p) =>
        `<path d="${PETAL}" transform="translate(512 700) rotate(${p.r}) scale(${p.s})" fill="${fill(p.c)}" stroke="${mono ? 'none' : NAVY}" stroke-width="${mono ? 0 : 16}" stroke-linejoin="round"/>`,
    )
    .join('');
  const line = water ? `<path d="M340 748 Q512 796 684 748" fill="none" stroke="${mono ? '#FFFFFF' : CREAM}" stroke-width="26" stroke-linecap="round"/>` : '';
  return `${petals}${line}`;
}

function svg({ size, background, inset = 1, radius = 0, mono = false, water = true }) {
  // `inset` scales the glyph around the centre (adaptive-icon safe zone).
  const glyph = `<g transform="translate(512 512) scale(${1.5 * inset}) translate(-512 -566)">${lotus({ mono, water })}</g>`;
  const bg = background ? `<rect width="1024" height="1024" rx="${radius}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${bg}${glyph}</svg>`;
}

const outputs = [
  { file: 'assets/images/icon.png', size: 1024, svg: svg({ size: 1024, background: NAVY }) },
  { file: 'assets/images/favicon.png', size: 48, svg: svg({ size: 48, background: NAVY, radius: 224 }) },
  { file: 'assets/images/splash-icon.png', size: 512, svg: svg({ size: 512, background: NAVY, radius: 224 }) },
  { file: 'assets/images/android-icon-foreground.png', size: 512, svg: svg({ size: 512, inset: 0.62 }) },
  { file: 'assets/images/android-icon-background.png', size: 512, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${NAVY}"/></svg>` },
  { file: 'assets/images/android-icon-monochrome.png', size: 432, svg: svg({ size: 432, inset: 0.62, mono: true }) },
];

writeFileSync(join(root, 'assets/source/mark.svg'), svg({ size: 1024, background: NAVY, radius: 224 }) + '\n');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const o of outputs) {
  await page.setViewportSize({ width: o.size, height: o.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${o.svg}</body></html>`);
  await page.locator('svg').screenshot({ path: join(root, o.file), omitBackground: true });
  console.log(`wrote ${o.file} (${o.size}px)`);
}
await browser.close();
