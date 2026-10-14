# Brand conformance: the member app against the Weaver brand kit

The Weaver brand kit lives in connect-crm (`brand/`: the brand book, `tokens.json`, the logo files, the icon set and the Logo,
Button and AI tag guides). This page records how the member app compared with it on 2026-10-14 (release 1.19.1), what was fixed,
and what is left for the owner to decide. Tenant branding (a community's own name, logo and colours, applied by `applyPalette` in
`src/theme.ts`) is the community's identity inside its own screens and is not replaced; the kit governs Weaver's own chrome: the
product name, the mark, buttons, type and the colours of the app itself.

**Where the kit lives here.** `src/brand/tokens.json` is a verbatim copy of connect-crm `brand/tokens.json` (synced 2026-10-13,
from `feat/site-mission@07571b4`). `src/brand/index.ts` reads it, `src/theme.ts` builds the palette, faces and radii from it, and
`assets/brand/` holds the official mark files unchanged (`weaver-mark.svg`, `weaver-mark-512.png`,
`weaver-mark-on-white-1024.png`) plus the three rasters rendered from the master SVG (`splash-mark.png`,
`splash-mark-on-tile.png`, `favicon-64.png`). Fonts are in `assets/fonts/` with their licence files.

**Keeping it current.** When the kit changes, copy `brand/tokens.json` (and any new logo file) over the copies here and run
`pnpm test`: `src/brand/__tests__/brand-conformance.test.ts` fails if the copy lacks a token the theme reads, if a colour literal
appears in `src/` outside the theme module (the allowlist there is three files, each with its reason), if a user-facing string says
"Community Connect", if `app.json` uses a colour that is not in the kit, or if an image `app.json` names is missing.

## At a glance

| | Result |
| --- | --- |
| Colours | The theme has 103 colours: 31 now come straight from the kit, 3 are mixed from the kit's navy, 69 are app-only (the kit has no token). 81% of the colour references in screens are on kit colours. Colour literals outside `src/theme.ts`: 31 before (39 counting comments), 29 now, all in tenant-branding code (`community.ts`, `template.ts`) and the web focus ring. |
| Fonts | Fraunces and DM Sans (6 faces) replaced by the kit's Bricolage Grotesque (display, 600 and 700) and Hanken Grotesk (text, 400 to 700), bundled with the app. Every `fonts.*` reference (320) goes through the theme; no family literal exists anywhere else. |
| Logo and images | Icon, splash, favicon, adaptive icon and notification icon now use the official mark; the two Weaver-owned screens that had no mark (Find your community, Setup) show the lockup. The retired lotus artwork is deleted. |
| Styling | Buttons, tab bar and icon strokes aligned (details below); six items need a decision (cards, targets, icons, on-navy buttons, AI tag, accent). |
| Voice | No "Community Connect" in any user-facing string. 28 exclamation marks and 5 "coming soon" lines fixed in English. |
| Owner decisions | 12, below. |

## Colours

| Item | Brand kit says | The app did | Status |
| --- | --- | --- | --- |
| Primary (`navy`) | Indigo `#2b2a8a`: headings, primary buttons, bands | `#1B2C5C` dark navy | Fixed: `colors.navy` is the kit's navy; its hover, tints, border and on-navy text are the kit's `navy-hover`, `navy-50`, `navy-100`, `navy-300`, `navy-200`. A community's own primary still replaces it. |
| Lighter and disabled indigos | Not in the kit | Three hand-picked blues | Fixed: mixed from the kit's navy with the same formula `brandPalette` uses for a community's primary (`navyPanel`, `navyPanel2`, `navyDisabled`). |
| Text | `ink #1e1d5c`, `ink-2 #33325f`, `muted #555a79` | Warm near-black `#1E1C18` and warm greys | Fixed. |
| Surfaces | `canvas #fffaf5` page, `white` cards, quiet `ground`/`track` | `#FBF7F0` cream page, `#F6EFE3` panels | Fixed: page is `canvas`, cards `white`, panels and chips `track`. |
| Borders and dividers | `line`, `line-input`, `line-soft` | Five warm beige values | Fixed (`border`, `borderInput`, `divider`, `dividerLight`, `frame`). |
| Success and error | `success #1f7a4d` / `success-50`, `danger #b3261e` / `danger-50` | The same four values | Conforms; now read from the kit so they cannot drift. |
| Ember, gold and tints | `brown #a8400d`, `brown-900`, `gold #ffb82a`, tints `saffron-50` and `saffron-200` | `#8A4608`, `#5E3106`, `#F2B632`, `#FBEBD7`, `#EFCFA6` | Fixed (`brown`, `brownDark`, `brownText`, `brownTint`, `brownBorder`, `onBrown`, `gold`). White on `brown` is 6.1:1. |
| Sunrise (`saffron #ff7640`) | A ground; never text; white on it is 2.6:1 | `#C9731C`, the community accent role, used 29 times, about eight with a white glyph or label on it | Owner decision 1. Left as it was. |
| Colours the kit lacks | n/a | 69 theme colours (19% of references): neutrals (`faint`, `dashed`, `toggleOff`), deeper greens, store green, purple, maroon, the live red, flame, chandan (puja), the volunteer board and photo viewer, Gyan Path, scrims | Owner decisions 2 and 3. Kept in `appOnly` in `src/theme.ts`, grouped and commented. |
| `mark-*` colours | Logo only | Not used in the interface | Conforms. |
| Shadows | Tinted with indigo | Warm black `#14120E` | Fixed: menu, drawer and strip shadows use the kit's navy. |
| Light and dark | The kit has one light theme | Light only (`userInterfaceStyle: light`) | Conforms; neither side has a dark theme. |
| Native colours (`app.json`) | Kit values | `#FBF7F0`, `#1B2C5C` for background, primary colour, splash, web theme colour, notification tint | Fixed: `#fffaf5` and `#2b2a8a`. The adaptive icon's white background is the kit's `white`. Needs a native build (below). |
| Tenant layers | Not replaced | `community.ts` (a community's colours), `template.ts` (the "cool" and "plain" surfaces a member-app template can pick) | Left alone, on purpose; they are the only code besides the theme allowed to hold colour literals. |

## Fonts

| Item | Brand kit says | The app did | Status |
| --- | --- | --- | --- |
| Display | Bricolage Grotesque, weights 600 to 700, tracked tight (hero -0.03em, heading -0.015em, heading-sm -0.01em) | Fraunces 500 and 600, untracked | Fixed: `fonts.display` is Bricolage 600, `fonts.displayBold` 700; the `hero`, `onboardingHero`, `display` and `title` text variants carry the kit's tracking. |
| Text | Hanken Grotesk, 400 to 700 | DM Sans 400 to 700 | Fixed (400, 500, 600, 700). Weight 500 (26 uses) is not a kit weight; kept. |
| Buttons | Label weight 700 | 600 | Fixed. |
| How they load | Served by Google Fonts | `@expo-google-fonts` packages through `useFonts` | Fixed: static TTFs bundled in `assets/fonts` (SIL OFL, licences beside them) and registered in the root layout, so a phone and the web build set the same type with no font request. They are bundle assets, so an over-the-air update carries them. |
| Fallbacks | System sans | Native: the system font if loading fails (logged). Web: the browser's default serif | Fixed on the web: the kit's own stack (`"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif`) follows each face. Native unchanged. |
| Large text | n/a | Settings text size 1.15 and 1.30 scale every `Txt` | Conforms; unchanged. |
| Optical size axis | Load Bricolage with `opsz` | Static instances cannot carry it | Owner decision 11. |
| Mono for IDs | The kit has none | IDs are set in the text face; the portal's `globals.css` names JetBrains Mono (and still Fraunces and DM Sans) | Owner decision 11. |
| Type scale | Web sizes (hero 36 on phones) | A mobile scale (hero 30, body 15) | Left as it was: the kit's sizes are for pages. |

The prototype specs in `docs/PROTOTYPE_*.md` still name Fraunces, DM Sans, `#1B2C5C` and the cream page. They are read-only
references from the clickable prototype and are superseded by this page for tokens. `@expo-google-fonts/dm-sans` and `fraunces`
stay in `package.json` unused (pruning them needs `pnpm install`, which this change did not run): remove them in the next
dependency pass.

## Logo and images

| Item | Brand kit says | The app did | Status |
| --- | --- | --- | --- |
| App icon | `weaver-mark-on-white-1024.png` for app icons | The mark on white at 63% width, a derived copy | Fixed: `app.json` `icon` (and iOS) points at the kit's file, unchanged. Needs a native build. |
| Adaptive icon (Android) | The mark | Foreground, white background and monochrome layers, all the official mark with safe-zone padding (checked: same artwork as the kit's SVG) | Conforms; unchanged. |
| Splash | The mark on `canvas`; never the bare mark on `navy`; on dark use a white tile (`radius-logo-tile`, mark about 72%) | Mark on cream; the dark variant put the bare mark on navy | Fixed: light splash on `canvas`; the dark variant is `navy` with the mark on a white tile (both rendered from the master SVG at the kit's ratios, same size and place as before). Needs a native build. Owner decision 9. |
| Notification icon | Not specified | None set; Android falls back to the launcher icon | Fixed: the white W silhouette (`android-icon-monochrome.png`) and the kit's navy tint. Needs a native build; not seen on a device. |
| Web favicon and tab colour | The same mark file | 64px mark; theme colour `#1B2C5C` | Fixed: `favicon-64.png` rendered from the master SVG; theme colour `#2b2a8a`. The web build makes `favicon.ico` from it. No web manifest is generated and none is required. |
| The mark in the app | Lockup (mark 44px, name 24px, 6px apart, descriptor under it) on "the sign-in page and anything that introduces the product" | No screen showed Weaver's mark (inside a community the community's mark leads, correctly) | Fixed: `WeaverLockup` (in `src/components/brand.tsx`, kit colours, not the theme's) on Find your community and the Setup screen. The community's own screens keep the community's mark. |
| Retired artwork | One mark | `assets/source/mark.svg` and `scripts/make-icons.mjs` still held the old lotus mark | Fixed: both deleted. |
| Stock or placeholder images | None; no faces, mascots or illustrations of people | None. The one photograph is the Navang puja murti used by that feature (`assets/gyan`) | Conforms. |
| "Sample data" labels | On every picture of the product | The app shows no pictures of the product | Not applicable. |

## Styling

| Item | Brand kit says | The app did | Status |
| --- | --- | --- | --- |
| Primary button | Pill, 52px, navy fill, white label, hover `navy-hover`, weight 700 | Pill (radius 26 on 52px), navy, weight 600, pressed fades to 85% | Fixed: weight 700 and the pressed colour is `navy-hover`. |
| Ghost button | White fill, 2px border of navy at 20%, navy text, border navy on hover | `secondary`: white, 1px solid navy | Fixed: `secondary` is the kit's ghost (the border is navy mixed 80% to white; navy when pressed). |
| On-navy buttons | `gold`, and `ghostOnNavy` | White "light" tone on navy cards | Owner decision 7. |
| Other outlined and filled tones | Not in the kit | Green, brown, purple, store, maroon and black tones | Left; they follow the colour decisions. |
| Corner radius of buttons and chips | Pill | Radius 26, 22, 20 on 52, 46, 44px heights | Left: the "crisp" member-app template changes these by name, and the shape is already pill-like. |
| Cards | White, 1px `line`, radius 24, padding 20, no coloured left-border accents | White, 1px border (colour fixed), radius 18, padding 14 and 16; the three left borders are neutral grey | Colour fixed; radius and padding are owner decision 5. |
| Chips | Pill | Pill at 44px; grid chips radius 12 | Conforms except the grid cell (kept). |
| Inputs | Border `line-input` | 48px, radius 12, `borderInput` | Fixed (colour). |
| Tab bar | Icons stroke 2 | Stroke 1.8, idle `faint` | Stroke fixed; idle colour is owner decision 3. |
| Icons | 21 stroke icons: 24px grid, stroke 2, round caps | Ten of the shell's 20 stroke icons were close but not the kit's; about 40 call sites use Ionicons | Fixed: menu, close, home, calendar, heart, book, bag, chart, lock and users now use the kit's paths, stroke 2 (also the event and give icon sets). Ionicons is owner decision 6. |
| Tap targets | `tap-target` 48px; buttons 52px | 44px minimum (this repo's rule); buttons 52px | Owner decision 4. |
| Focus | 2px solid navy outline, 2px offset (4px on buttons) | Browser default ring on the web build | Fixed in `src/global.css` (keyboard focus only). Not applicable on phones. |
| Gradients | Only the AI tag, the headline underline and the picture wash | None | Conforms. |
| AI tag | Every AI capability carries the AI tag and the human decision | Niva (tab, chat, guide "Ask Niva") has no tag | Owner decision 8. |
| Spacing | gutter 20, gap 12 | 20 and 12 | Conforms; `space.gutter` now reads the kit. |

## Voice

| Item | Brand kit says | The app did | Status |
| --- | --- | --- | --- |
| Product name | "Weaver", never "Community Connect" | No user-facing string used the old name; two code comments and the setup screen's example address did | Fixed. The deep-link scheme `communityconnect://` (still in `app.json`) is a link, not a name: owner decision 10. A test keeps the old name out of strings. |
| Exclamation marks | None | 31 English strings | 28 fixed (full stops; "anumodana" kept as a word). Three "Jai Jinendra!" greetings are a community's own greeting: owner decision 12. A test allows exactly those three. |
| "Coming soon" | Never without a date; an unbuilt feature stays off the page | Five "coming soon" lines about missing recordings and audio, and the Wallet pair | The five recording lines now say "No recording yet". The Wallet button and note stay: owner decision 12. |
| "Pledge", never "bid" | pledge | Already enforced by a test | Conforms. |
| Emoji | None, ever | None in the app's own copy. Gyan Path read cards show an `emoji` a community's content may carry | Conforms for the app; the content is the community's. |
| Sentence case | Headings and buttons | Feature names are Title Case ("My Store", "My Donations", "My Jain Way", "Gyan Path", "Ask Niva", "Pathshala Connect") | Left: they are names. Is "Pathshala Connect" still the feature's name? Owner decision 12. |
| Niva | "Niva", not "the bot" | "Niva" throughout | Conforms. |
| Descriptor | "Community management platform", word for word | Not shown | Fixed: the lockup sets it exactly (a test pins it). |
| "Sample data" | On pictures of the product | No pictures of the product | Not applicable. |
| Gujarati and Hindi | n/a | Both spread the English dictionary (only the five tab names differ) | English fixes flow through; nothing else to flag. |

## Owner decisions

1. **The accent colour.** The app's `saffron` role (`#C9731C`; a community's accent colour replaces it) is used 29 times, about
   eight with a white glyph or label on it (the Gyan Path "check" and "next level" buttons, the three recitation microphone
   buttons, the Saathi send button); the rest are borders, fills and halos. The
   kit's saffron `#ff7640` is a ground that takes ink (white on it is 2.6:1). Options: (a) adopt the kit's saffron and give those
   sites an on-accent colour (ink on a light accent, white on a dark one, computed from the accent); (b) use the kit's `brown`
   for accent fills; (c) keep. *Recommend (a): it is the brand's signature colour, and the `onAccent` rule keeps community accents
   legible.*
2. **Colours the kit does not have** (69 theme colours, 19% of references). Purple (feedback, Pathshala, Saathi), store green,
   maroon, the live red, the deeper greens, the volunteer board and photo viewer's dark surfaces, Gyan Path's set and chandan
   (the puja's own colour). Options: grow the kit (a "category colour" set, a dark surface pair, a deep success) or recolour the
   screens to indigo, brown and success. *Recommend: add a deep success and a dark surface pair to the kit, keep chandan and the
   Gyan Path set as module-owned colours outside it, and decide purple, store green and maroon per screen with the design owner.*
3. **The lightest text, `faint` (`#8A8478`, 3.7:1 on white).** Used 40 times: idle tab labels and icons, placeholders, fine
   print, disabled text. The kit's lightest text is `muted` (6.7:1). Options: (a) use `muted` and drop `faint`; (b) add a kit
   token for it. *Recommend (a): it fixes the contrast and the tab bar with one change; hierarchy comes from size and weight.*
4. **Tap targets: 48 or 44.** The kit's `tap-target` is 48px; this repo's rule (CLAUDE.md) is 44px (the platform floor), buttons
   are 52px. *Recommend raising `touch.min` to 48 in one pass (31 files, 60 places read it) and changing the rule.*
5. **Cards: radius 18 and padding 14 and 16, or the kit's 24 and 20.** Both radii 16 (`radius-tile`, "small cards") and 24
   (`radius-card`) are kit-valid; the kit's padding is for web pages. *Recommend 16 for list cards (24 is already used by
   sheets and dialogs) and keep the mobile padding.* The "crisp" template changes radii by name, so this needs a look at that
   template too.
6. **Icons.** The kit has 21; the app uses about 40 Ionicons call sites across about 40 names (info, alert, check circle, eye,
   flame, trash, bell, share, download, play, microphone and more). *Recommend growing the kit's set with those, then retiring
   Ionicons; mixing two stroke styles is the visible drift.*
7. **Buttons on navy cards.** The kit has `gold` and `ghostOnNavy`; the app's on-navy button is white. *Recommend `gold` for the
   one primary action on a navy card.*
8. **The AI tag on Niva.** The kit wants the tag (gold to saffron gradient, "AI" or "Niva", beside the person who decides) on
   every AI capability, and bans a line for a feature that is not built. Niva has none. Adding it is a new component and screen
   change. *Recommend adding `AiTag` above the chat's first message and in the guide's "Ask Niva" tile.*
9. **Dark splash.** The kit forbids the bare mark on navy, so the dark splash is now navy with the mark on a white tile. The app
   is light-only, so a phone may never show it. Options: keep the tile variant, or drop `dark` and use the light splash always.
   *Recommend keeping it until it has been seen on a dark-mode phone.*
10. **The `communityconnect://` link scheme.** It is functional (printed posters and QR codes, `join` links) and is not shown to
    anyone, but it is the old name. Adding `weaver://` beside it is a native change (`scheme` in `app.json`). *Recommend adding
    `weaver://` at the next native build and keeping the old one for as long as printed material exists.*
11. **Type details.** (a) The kit loads Bricolage with its optical-size axis; static instances cannot. The web build could load
    the variable font from Google Fonts as the website does (a font request to a third party). (b) The kit has no monospace face;
    the portal uses JetBrains Mono for IDs and still sets Fraunces and DM Sans in `globals.css`, so the portal itself is behind
    the kit. *Recommend: keep static fonts here; add a mono token to the kit (or say IDs use the text face), and move the portal
    onto the kit's faces.*
12. **Words.** (a) Wallet: "Add to Wallet — coming soon" and its note are a disabled button for a feature that is not built;
    *recommend removing both (or a target quarter).* (b) "Jai Jinendra!" in the compose default, the guide lead and Niva's greeting,
    and "anumodana" in lesson feedback, are one tradition's words on platform screens; community words already exist
    (`terms.greeting`), so *recommend moving them there and keeping the neutral default free of exclamation marks.* (c) Is
    "Pathshala Connect" (the drawer's Pathshala entry) the feature's real name, or the old working name?

## What ships how

- **Over the air (JavaScript and bundled assets):** the palette and every colour in screens, both faces (they are bundled assets),
  the text tracking, buttons, icons, the lockup on Find your community and Setup, the English copy, the focus ring, and the guard
  test. Phones on runtime "3" pick it up with the usual close-and-reopen.
- **The web build (app.weaverams.org):** the same JavaScript plus the favicon and theme colour; it ships with the normal deploy of
  `main`, not by an update.
- **Needs the next native build (not run here):** the launcher icon, the splash (images and colours), the Android notification
  icon and tint, and the `app.json` colours (`backgroundColor`, `primaryColor`). Until then installed apps keep the old icon and
  splash and work fine with the new JavaScript. No native code changed, so `runtimeVersion` stays "3".

## Not checked

Everything on a phone: the new fonts on iOS and Android, the splash and icon, the notification glyph and the pressed colours were
not seen on a device. The web build was exported, served and opened in a browser (fonts load, the stack and tracking apply, the
lockup and the focus ring show); only the screens that need no sign-in were reachable, so the colours and type on the signed-in
screens were verified by the theme tests and by reading the code, not by looking at each screen.
