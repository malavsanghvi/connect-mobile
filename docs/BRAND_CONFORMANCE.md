# Brand conformance: the member app against the Weaver brand kit

The Weaver brand kit lives in connect-crm (`brand/`: the brand book, `tokens.json`, the logo files, the icon set and the Logo,
Button and AI tag guides). This page records how the member app compared with it on 2026-10-14 (release 1.19.1), what was fixed,
and how each decision was settled (the owner said "go with your recommendations" on 2026-10-14; the few that wait for new kit tokens use
temporary, named colours, see Decisions). Tenant branding (a community's own name, logo and colours, applied by `applyPalette` in
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
| Colours | The theme has 107 colours: 31 come straight from the kit, 3 are mixed from the kit's navy, 7 are temporary stand-ins for tokens the kit is adding (accent, faint text, control border, warning tint, border and ink, and the switch), 66 are app-only (the kit has no token). About 80% of the colour references in screens are on kit colours. Colour literals outside `src/theme.ts`: 31 before (39 counting comments), 29 now, all in tenant-branding code (`community.ts`, `template.ts`) and the web focus ring. |
| Fonts | Fraunces and DM Sans (6 faces) replaced by the kit's Bricolage Grotesque (display, 600 and 700) and Hanken Grotesk (text, 400 to 700), bundled with the app. Every `fonts.*` reference (about 400) goes through the theme; no family literal exists anywhere else. |
| Logo and images | Icon, splash, favicon, adaptive icon and notification icon now use the official mark; the two Weaver-owned screens that had no mark (Find your community, Setup) show the lockup. The retired lotus artwork is deleted. |
| Styling | Buttons (ghost, pressed, gold on navy), the 48px tap target, kit icons (all 21 in `StrokeIcon`, `Icon` maps the names the kit covers), card radius 16, the AI tag on Niva and the focus ring follow the kit. |
| Voice | No "Community Connect" in any user-facing string. No exclamation marks or "coming soon" in English. Greetings come from the community's own configured word, not a faith word. The `weaver://` link scheme is added beside the older two. |
| Decisions | 12; 9 applied, 3 partly (they wait for new kit tokens: accent, faint text and control border use temporary tokens; module tags navy only, mono face and field and tag radii wait). See Decisions. |

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
| Sunrise (`saffron #ff7640`) and the accent role | A ground; never text; white on it is 2.6:1. The kit is adding a strong accent that passes 4.5:1 with white | `#C9731C` (3.5:1 with white), the community accent role, used 29 times, about eight with a white glyph or label on it | Decision 1: a temporary strong accent (kit saffron darkened, 4.8:1 with white) now; the kit's token replaces it. |
| Lightest text (`faint`) | The kit is adding a faint text colour at 4.5:1 | `#8A8478`, 3.7:1 on white (40 uses: idle tab labels, placeholders, fine print, disabled text) | Decision 3: a temporary `faint` at 4.8:1 on a panel now; the kit's token replaces it. |
| Control border | The kit is adding a control border at 3:1 | `borderInput`, 1.4:1 on white, on every input and switch | Temporary `borderControl` (3.4:1) on inputs and switches now. |
| Warnings | The kit is adding a warning tint and ink | The ember tints | `warningTint`, `warningBorder`, `warningInk` (today the ember values) on warning banners, amber pills and amber cards. |
| Colours the kit lacks | n/a | 66 theme colours: dashed borders, deeper greens, store green, purple, maroon, the live red, flame, chandan (puja), the volunteer board and photo viewer, Gyan Path, scrims | Decision 2. Kept in `appOnly` in `src/theme.ts`, grouped and commented. Module tags navy only (purple, store green, maroon) waits for the kit's table. |
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
| Optical size axis | Load Bricolage with `opsz` | Static instances cannot carry it | Decision 11: static fonts kept. |
| Mono for IDs | The kit has none | IDs are set in the text face; the portal's `globals.css` names JetBrains Mono (and still Fraunces and DM Sans) | Decision 11: JetBrains Mono for identifiers waits for the kit's token and font files. |
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
| Splash | The mark on `canvas`; never the bare mark on `navy`; on dark use a white tile (`radius-logo-tile`, mark about 72%) | Mark on cream; the dark variant put the bare mark on navy | Fixed: light splash on `canvas`; the dark variant is `navy` with the mark on a white tile (both rendered from the master SVG at the kit's ratios, same size and place as before). Needs a native build. Decision 9: kept until seen on a dark-mode phone. |
| Notification icon | Not specified | None set; Android falls back to the launcher icon | Fixed: the white W silhouette (`android-icon-monochrome.png`) and the kit's navy tint. Needs a native build; not seen on a device. |
| Web favicon and tab colour | The same mark file | 64px mark; theme colour `#1B2C5C` | Fixed: `favicon-64.png` rendered from the master SVG; theme colour `#2b2a8a`. The web build makes `favicon.ico` from it. No web manifest is generated and none is required. |
| The mark in the app | Lockup (mark 44px, name 24px, 6px apart, descriptor under it) on "the sign-in page and anything that introduces the product" | No screen showed Weaver's mark (inside a community the community's mark leads, correctly) | Fixed: `WeaverLockup` (in `src/components/brand.tsx`, kit colours, not the theme's) on Find your community and the Setup screen. The community's own screens keep the community's mark. |
| Retired artwork | One mark | `assets/source/mark.svg` and `scripts/make-icons.mjs` still held the old lotus mark | Fixed: both deleted. |
| Stock or placeholder images | None; no faces, mascots or illustrations of people | None. The one photograph is the Navang puja murti used by that feature (`assets/gyan`) | Conforms. |
| "Sample data" labels | On every picture of the product | The app shows no pictures of the product | Not applicable. |

## Styling
## Styling

| Item | Brand kit says | The app did | Status |
| --- | --- | --- | --- |
| Primary button | Pill, 52px, navy fill, white label, hover `navy-hover`, weight 700 | Pill (radius 26 on 52px), navy, weight 600, pressed fades to 85% | Fixed: weight 700 and the pressed colour is `navy-hover`. |
| Ghost button | White fill, 2px border of navy at 20%, navy text, border navy on hover | `secondary`: white, 1px solid navy | Fixed: `secondary` is the kit's ghost (the border is navy mixed 80% to white; navy when pressed). |
| On-navy buttons | `gold` fill with navy label; `ghostOnNavy` | White "light" tone on a navy card | Fixed (decision 7): new `gold` tone (a lighter gold when pressed) for the action on the Gyan Path celebration card. `light` stays for the photo viewer's dark tile, which is not a navy ground. |
| Other outlined and filled tones | Not in the kit | Green, brown, purple, store, maroon and black tones | Left; they follow the colour decisions (module tags navy only: waiting on the kit's table). |
| Corner radius of buttons and chips | Pill | Radius 26, 22, 20 on 52, 48, 48px heights | Left: the "crisp" member-app template changes these by name, and the shape is already pill-like. |
| Cards | White, 1px `line`, radius 24 (`radius-tile` 16 for small cards), padding 20, no coloured left-border accents | White, 1px border, radius 18, padding 14 and 16; the three left borders are neutral grey | Fixed (decision 5): list cards use the kit's `radius-tile` (`radii.xl` is 16; sheets and dialogs were already 24); mobile padding kept. The crisp template still sets `xl` by name. |
| Chips | Pill | Pill at 48px; grid chips radius 12 | Conforms except the grid cell (kept). |
| Inputs | Border `line-input`; a control needs a 3:1 border | 48px, radius 12, `borderInput` (1.4:1 on white) | Colour: temporary `borderControl` (3.4:1) until the kit's control-border token arrives. Radius waits for the kit's `radius-field`. |
| Tab bar | Icons stroke 2 | Stroke 1.8, idle `faint` | Stroke fixed; idle colour uses the new `faint` (see colours). |
| Icons | 21 stroke icons: 24px grid, stroke 2, round caps | Ten shell icons close but not the kit's; about 40 call sites on Ionicons | Fixed (decision 6): all 21 kit icons are in `StrokeIcon` path for path (a test compares them with the kit's SVG files, copied to `assets/brand/icons`); `Icon` draws the kit's icon wherever the kit covers the name (tick, close, calendar, people, ticket, card, book, chevrons); the row chevron is the kit's; success banners and the setup list use the kit's tick. 65 Ionicons names remain (below). |
| Tap targets | `tap-target` 48px; buttons 52px | 44px minimum, some 36 to 46 | Fixed (decision 4): `touch.min` is the kit's 48 and every tappable minimum reads it (about 50 places, buttons and chips included); a test fails on a hand-written minimum under 48 on a pressable. |
| Focus | 2px solid navy outline, 2px offset (4px on buttons) | Browser default ring on the web build | Fixed in `src/global.css` (keyboard focus only). Not applicable on phones. |
| Gradients | Only the AI tag, the headline underline and the picture wash | None | Conforms; the AI tag adds the first (`gold` to `saffron`, drawn with `react-native-svg`). |
| AI tag | Every AI capability carries the tag and the human decision | Niva (chat, drawer, guide tile) had none | Fixed (decision 8): `src/components/ai-tag.tsx` (`AiTag`, `AiLine`). The chat's small print is now an AI line (the tag "Niva" and the existing sentence that names who decides: content the community approved, sources shown); the drawer's Ask Niva row and the guide's Ask Niva tile carry the tag. |
| Spacing | gutter 20, gap 12 | 20 and 12 | Conforms; `space.gutter` reads the kit. |

**Ionicons still in use (65 names), waiting for the kit to extend its icon set.** add, add-circle-outline, alert-circle,
alert-circle-outline, arrow-down, arrow-up, attach-outline, basket-outline, checkmark-circle, checkmark-circle-outline,
compass-outline, create-outline, document-outline, document-text-outline, download, download-outline, ellipse-outline, eye-outline,
finger-print, flame, flame-outline, flower-outline, gift-outline, hand-left-outline, headset-outline, heart, heart-outline,
hourglass-outline, image-outline, images-outline, information-circle, key, leaf-outline, link, location-outline, logo-whatsapp,
megaphone-outline, mic-outline, musical-notes-outline, notifications, notifications-outline, open-outline, pause, person-add-outline,
play, play-skip-back, play-skip-forward, qr-code-outline, receipt-outline, refresh, repeat, restaurant-outline, ribbon-outline, save,
school-outline (14 uses), share, share-outline, shuffle, star, storefront-outline, swap-horizontal-outline, swap-vertical, text,
time-outline, trash-outline. When the kit adds one, add its name to `KIT_ICON_FOR` in `src/components/icon.tsx` (and its paths to
`StrokeIcon`); every use changes at once. The heart of a like (filled or outline shows the state) stays an Ionicon until the kit says
how a state is shown.

## Voice

| Item | Brand kit says | The app did | Status |
| --- | --- | --- | --- |
| Product name | "Weaver", never "Community Connect" | No user-facing string used the old name; two code comments and the setup screen's example address did | Fixed. Links (decision 10): `app.json` now opens `weaver://` besides `connect://` and `communityconnect://`, so posters and QR codes already printed keep working; a test pins all three and the join-link parsing for each. |
| Exclamation marks | None | 31 English strings | Fixed: 28 in the first pass; the three "Jai Jinendra!" greetings now take the community's own greeting (`{greeting}`, from its configured `terms.greeting`: "Welcome" unless the organization sets another; Jain Center's is its own), so none is left (a test allows none). |
| Greeting on the welcome screen | n/a | Every community saw "Jai Jinendra" | Fixed: it shows the community's own greeting. Niva's first line is now "{greeting}. I am Niva, the {center} assistant. Ask me about timings, events and membership." |
| Faith words in generic modules | Speak to every organization | "Anumodana" as the Pathshala fee title, the teacher selection and homework-accepted messages | Fixed: "Thank you", "Selected", "Accepted". "Anumodana" stays inside My Jain Way, Gyan Path, the Navang puja and Saathi: those modules exist only for organizations that have them and it is their word. |
| "Coming soon" | Never without a date | Five lines about missing recordings and audio, and the Wallet pair | Fixed: the recording lines say "No recording yet"; the Wallet button and its note are gone (decision 12a); "Show these codes at the entrance." stays. |
| "Pledge", never "bid" | pledge | Already enforced by a test | Conforms. |
| Emoji | None, ever | None in the app's own copy. Gyan Path read cards show an `emoji` a community's content may carry | Conforms for the app; the content is the community's. |
| Sentence case | Headings and buttons | Feature names are Title Case ("My Store", "My Donations", "My Jain Way", "Gyan Path", "Ask Niva") | Left: they are names. The drawer's "Pathshala Connect" is now "Pathshala" (decision 12c; it is the community's school word and follows its `school` term). |
| Niva | "Niva", not "the bot" | "Niva" throughout | Conforms. |
| Descriptor | "Community management platform", word for word | Not shown | Fixed: the lockup sets it exactly (a test pins it). |
| "Sample data" | On pictures of the product | No pictures of the product | Not applicable. |
| Gujarati and Hindi | n/a | Both spread the English dictionary (only the five tab names differ) | English fixes flow through; nothing else to flag. |

## Decisions

On 2026-10-14 the owner said "go with your recommendations". Where a decision needed a token the kit does not have yet, the app uses
a clearly named temporary one (the `TEMP_*` block in `src/theme.ts`, each marked `TODO(brand-tokens)`) and swaps it when connect-crm
`brand/tokens.json` gains the real one.

| # | Decision | Recommendation | State |
| --- | --- | --- | --- |
| 1 | The accent colour (saffron role) | Adopt a strong accent that passes 4.5:1 with white, so white glyphs and labels stay legible | Temporary token `TEMP_ACCENT_STRONG` (kit saffron darkened to 4.8:1 with white) in place now; waits for the kit's accent token. Community accents still replace it. |
| 2 | Colours the kit does not have (69) | Add a deep success and a dark surface pair to the kit; keep chandan and the Gyan Path set module-owned; module tags navy only | Waiting for the kit's table (module tags navy only recolours purple, store green and maroon). Nothing changed yet. |
| 3 | The lightest text (`faint`) | One lighter text colour at 4.5:1 | Temporary `TEMP_FAINT_TEXT` (4.8:1 on a panel) in place; waits for the kit's token. |
| 4 | Tap targets 48 | Raise to 48 everywhere | Done (see Styling). CLAUDE.md now says 48. |
| 5 | Card radius | 16 for list cards | Done. Input and tag radii wait for the kit's `radius-field` and `radius-tag`. |
| 6 | Icons | Extend the kit's set, then retire Ionicons | Done for the shell and every screen touched: kit icons in place, `Icon` maps what the kit covers; 65 names listed above wait for the kit to extend its set. |
| 7 | Buttons on navy | `gold` | Done. |
| 8 | AI tag on Niva | Add it | Done. |
| 9 | Dark splash | Keep the white-tile variant until seen on a dark-mode phone | Kept. |
| 10 | The old link scheme | Add `weaver://` beside it | Done (needs the next native build to register the scheme on installed apps; the old schemes keep working). |
| 11 | Type details | Keep static fonts; the kit adds a mono face for identifiers | Static fonts kept. JetBrains Mono for identifiers waits for the kit's token and the font files. |
| 12 | Words | Remove Wallet; neutral greetings from the community's own word; rename "Pathshala Connect" | Done. |

Also waiting on the kit: a control border (temporary `TEMP_CONTROL_BORDER`, 3.4:1, used on inputs and switches), a warning tint and
ink (the `warningTint`, `warningBorder` and `warningInk` theme colours alias the ember tints today and are used by warning banners,
amber pills and amber cards).

## What ships how

- **Over the air (JavaScript and bundled assets):** the palette and every colour in screens, both faces (bundled assets), the text
  tracking, buttons (ghost, pressed, gold), the 48px tap targets, icons, the AI tag and line, the lockup on Find your community and
  Setup, the English copy and greetings, the focus ring, and the guard test. Phones on runtime "3" pick it up with the usual
  close-and-reopen.
- **The web build (app.weaverams.org):** the same JavaScript plus the favicon and theme colour; it ships with the normal deploy of
  `main`, not by an update.
- **Needs the next native build (not run here):** the launcher icon, the splash (images and colours), the Android notification icon
  and tint, the `app.json` colours (`backgroundColor`, `primaryColor`), and the new `weaver` link scheme. Until then installed apps
  keep the old icon and splash, do not answer `weaver://` links (the old two still work), and run the new JavaScript fine. No native
  code changed, so `runtimeVersion` stays "3".

## Not checked

Everything on a phone: the new fonts on iOS and Android, the splash and icon, the notification glyph, the pressed colours, the AI
tag's gradient and the larger tap targets were not seen on a device. The web build was exported, served and opened in a browser
(fonts load, the stack and tracking apply, the lockup and the focus ring show); only the screens that need no sign-in were reachable,
so the colours and type on the signed-in screens were verified by the theme tests and by reading the code, not by looking at each
screen.
