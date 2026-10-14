# Brand conformance: the member app against the Weaver brand kit

The Weaver brand kit lives in connect-crm (`brand/`: the brand book, `tokens.json`, the logo files, the 42 icons and the Logo, Button,
AI tag and Control guides). This page records how the member app compared with it on 2026-10-14 (release 1.19.1), what was fixed and
how each decision was settled. The owner said "go with your recommendations" on 2026-10-14, and the kit's second version (connect-crm
commit `2b758c1f`) then supplied the tokens that were still missing; the app is on it. Tenant branding (a community's own name, logo
and colours, applied by `applyPalette` in `src/theme.ts`) is the community's identity inside its own screens and is not replaced; the
kit governs Weaver's own chrome: the product name, the mark, buttons, type and the colours of the app itself.

**Where the kit lives here.** `src/brand/tokens.json` is a verbatim copy of connect-crm `brand/tokens.json` (version 2, synced
2026-10-14, `2b758c1f`). `src/brand/index.ts` reads it, `src/theme.ts` builds the palette, faces, radii and control sizes from it, and
`assets/brand/` holds the official mark files unchanged (`weaver-mark.svg`, `weaver-mark-512.png`, `weaver-mark-on-white-1024.png`),
the three rasters rendered from the master SVG (`splash-mark.png`, `splash-mark-on-tile.png`, `favicon-64.png`) and the kit's 42 icon
files (`icons/`). Fonts are in `assets/fonts/` with their licence files.

**Keeping it current.** When the kit changes, copy `brand/tokens.json`, `brand/icons/` and any new logo file over the copies here and
run `pnpm test`: `src/brand/__tests__/brand-conformance.test.ts` fails if the copy lacks a token the theme reads, if a colour literal
appears in `src/` outside the theme module (the allowlist there is three files, each with its reason), if a user-facing string says
"Community Connect", if `app.json` uses a colour that is not in the kit, if a drawing in `StrokeIcon` differs from the kit's SVG, or
if a hand-written tap target is under 48.

## At a glance

| | Result |
| --- | --- |
| Colours | The theme has 108 colours: 39 come straight from the kit, 3 are mixed from the kit's navy, 14 are the module tag colours (now the navy family), 52 are app-only (the kit has no token). About 90% of the colour references in screens are on kit colours. Colour literals outside `src/theme.ts`: 31 before (39 counting comments), 29 now, all in tenant-branding code (`community.ts`, `template.ts`) and the web focus ring. |
| Fonts | Fraunces and DM Sans (6 faces) replaced by the kit's Bricolage Grotesque (display, 600 and 700), Hanken Grotesk (text, 400 to 700) and JetBrains Mono (identifiers, 500), bundled with the app. Every `fonts.*` reference goes through the theme; no family literal exists anywhere else. |
| Logo and images | Icon, splash, favicon, adaptive icon and notification icon now use the official mark; the two Weaver-owned screens that had no mark (Find your community, Setup) show the lockup. The retired lotus artwork is deleted. |
| Styling | Buttons (ghost, pressed, gold on navy, accent; all 52px), fields (radius 12, 3:1 border, 16px text, 52px), tags (radius 8), the 48px tap target, all 42 kit icons in `StrokeIcon`, `Icon` mapping the names the kit covers, card radius 16, module tags in navy, the AI tag on Niva and the focus ring follow the kit. |
| Voice | No "Community Connect" in any user-facing string. No exclamation marks or "coming soon" in English. Greetings come from the community's own configured word, not a faith word. The `weaver://` link scheme is added beside the older two. |
| Decisions | All 12 decided and applied. One kit rule is not applied yet, the 14.5px minimum text on a touch surface (see Open). |

## Colours

| Item | Brand kit says | The app did | Status |
| --- | --- | --- | --- |
| Primary (`navy`) | Indigo `#2b2a8a`: headings, primary buttons, bands | `#1B2C5C` dark navy | Fixed: `colors.navy` is the kit's navy; its hover, tints, border and on-navy text are the kit's `navy-hover`, `navy-50`, `navy-100`, `navy-300`, `navy-200`. A community's own primary still replaces it. |
| Lighter and disabled indigos | Not in the kit | Three hand-picked blues | Fixed: mixed from the kit's navy with the same formula `brandPalette` uses for a community's primary (`navyPanel`, `navyPanel2`, `navyDisabled`). |
| Text | `ink #1e1d5c`, `ink-2 #33325f`, `muted #555a79`, then `faint #666b86` for hints, placeholders, timestamps | Warm near-black `#1E1C18`, warm greys, and a `faint` `#8A8478` at 3.7:1 on white | Fixed: all four are the kit's; `faint` is 5.2:1 on white (idle tab labels, placeholders, fine print, disabled text). |
| Surfaces | `canvas #fffaf5` page, `white` cards, quiet `ground`/`track` | `#FBF7F0` cream page, `#F6EFE3` panels | Fixed: page is `canvas`, cards `white`, panels and chips `track`. |
| Borders and dividers | `line`, `line-soft`; a control is outlined in `line-control` (3.5:1); `line-input` only inside a picture | Five warm beige values; every input at 1.4:1 | Fixed: `border`, `divider`, `dividerLight`, `frame` are the kit's; `borderControl` (fields, selects, the chat box, the off state of a switch) is `line-control`. |
| Success, warning, error | `success`, `warning`, `danger` with their `-50` tints, `warning-200` and `warning-ink`, always beside words | Success and error equal to the kit; warnings were the ember tints | Fixed: `warning`, `warningTint`, `warningBorder`, `warningInk` are the kit's (warning banners: tint, 1px border, `warning` icon, `warning-ink` text; amber pills and cards). |
| Ember, gold and tints | `brown #a8400d`, `brown-900`, `gold #ffb82a`, tints `saffron-50` and `saffron-200` | `#8A4608`, `#5E3106`, `#F2B632`, `#FBEBD7`, `#EFCFA6` | Fixed (`brown`, `brownDark`, `brownText`, `brownTint`, `brownBorder`, `onBrown`, `gold`). White on `brown` is 6.1:1. |
| Sunrise and the accent role | `saffron #ff7640` is decoration and never carries white text; `saffron-strong #c2501c` is the orange to read or tap (white on it 4.7:1; pressed is `brown`) | `#C9731C` (3.5:1 with white) for the community accent role, used 29 times, about eight with a white label or glyph | Fixed (decision 1): the accent role is `saffron-strong` (a community's accent still replaces it); the kit's plain saffron is used only in the AI tag's gradient. The role also colours borders, halos and bars (decoration); a split into two roles is a later refinement. |
| Module colours | Tags and tiles for the parts of a product are one hue: `navy` on `navy-50`, or white on `navy` | Purple (feedback, Pathshala, Saathi), store green, maroon, brown and green drawer and guide tiles | Fixed (decision 2): `purple`, `store`, `maroon` and `album` and their tints are the navy family under their old names (a community's primary too: `MODULE_TAG_COLORS` in `lib/community.ts`); drawer and guide tiles are navy on `navy-50`. Left on purpose: brown for giving's ember accent text, the anniversary ink, the album hero palettes, and the content colours below. |
| Colours the kit lacks | n/a | 52 theme colours: dashed borders, the deeper greens, the live red, flame, chandan (puja), the volunteer board and photo viewer's dark surfaces, Gyan Path, scrims | Kept in `appOnly` in `src/theme.ts`, grouped and commented; chandan and the Gyan Path set are module-owned and stay outside the kit. |
| `mark-*` colours | Logo only | Not used in the interface | Conforms. |
| Shadows | Tinted with indigo | Warm black `#14120E` | Fixed: menu, drawer, cart and strip shadows use the kit's navy. |
| Light and dark | The kit has one light theme | Light only (`userInterfaceStyle: light`) | Conforms; neither side has a dark theme. |
| Native colours (`app.json`) | Kit values | `#FBF7F0`, `#1B2C5C` for background, primary colour, splash, web theme colour, notification tint | Fixed: `#fffaf5` and `#2b2a8a`. The adaptive icon's white background is the kit's `white`. Needs a native build (below). |
| Tenant layers | Not replaced | `community.ts` (a community's colours), `template.ts` (the "cool" and "plain" surfaces a member-app template can pick) | Left alone, on purpose; they are the only code besides the theme allowed to hold colour literals. |

## Fonts

| Item | Brand kit says | The app did | Status |
| --- | --- | --- | --- |
| Display | Bricolage Grotesque, weights 600 to 700, tracked tight (hero -0.03em, heading -0.015em, heading-sm -0.01em) | Fraunces 500 and 600, untracked | Fixed: `fonts.display` is Bricolage 600, `fonts.displayBold` 700; the `hero`, `onboardingHero`, `display` and `title` text variants carry the kit's tracking. |
| Text | Hanken Grotesk, 400 to 700 | DM Sans 400 to 700 | Fixed (400, 500, 600, 700). Weight 500 (26 uses) is not a kit weight; kept. |
| Identifiers | JetBrains Mono for identifiers only (receipt, pledge, household and member numbers, codes, payer references): `identifier` 13.5px, line 1.4, weight 500; never running text, headings, buttons or amounts | Identifiers set in the text face | Fixed (decision 11): `fonts.mono`, a `Txt` variant `identifier` and an `Ident` inline component; member and household numbers on Family, the member card, a person's page and the Zelle report, and pledge numbers on Pledges and in a ticket's pledge line, are in the mono face. The join-code field (the sign-in and community finder, being changed on another branch) and pledge numbers inside translated sentences ("for pledge ...") stay in the text face until a later pass. |
| Buttons | Label weight 700 | 600 | Fixed. |
| How they load | Served by Google Fonts | `@expo-google-fonts` packages through `useFonts` | Fixed: static TTFs bundled in `assets/fonts` (SIL OFL, licences beside them) and registered in the root layout, so a phone and the web build set the same type with no font request. They are bundle assets, so an over-the-air update carries them. |
| Fallbacks | System sans (mono: `ui-monospace, SFMono-Regular, Menlo`) | Native: the system font if loading fails (logged). Web: the browser's default serif | Fixed on the web: the kit's own stack follows each face. Native unchanged. |
| Large text | n/a | Settings text size 1.15 and 1.30 scale every `Txt` | Conforms; unchanged. |
| Optical size axis | Load Bricolage with `opsz` | Static instances cannot carry it | Decision 11: static fonts kept. |
| Type scale | `caption` 14.5px is the smallest text on a touch surface; 11 to 13px labels are for dense desktop tables | A mobile scale: meta 13, caption 12, fine 11, badge 10, tithi 9 | Open (see below). |

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

| Item | Brand kit says | The app did | Status |
| --- | --- | --- | --- |
| Primary button | Pill, `control-primary` 52px for every button on a phone, navy fill, white label, hover `navy-hover`, weight 700 | Pill; 52px for the main size but 48 for the smaller ones; weight 600; pressed fades to 85% | Fixed: every `Button` size is 52px (they differ in label size and padding), weight 700, pressed is `navy-hover`. |
| Ghost button | White fill, 2px border of navy at 20%, navy text, border navy on hover | `secondary`: white, 1px solid navy | Fixed: `secondary` is the kit's ghost (the border is navy mixed 80% to white; navy when pressed). |
| On-navy buttons | `gold` fill with navy label; `ghostOnNavy` | White "light" tone on a navy card | Fixed (decision 7): the `gold` tone (a lighter gold when pressed) for the action on the Gyan Path celebration card. `light` stays for the photo viewer's dark tile, which is not a navy ground. |
| Accent button | `saffron-strong` fill, white label, `brown` when pressed; for the rare warm action, never a second primary | None | The `accent` tone exists; no screen uses it yet. |
| Other outlined and filled tones | Not in the kit | Green, brown, purple, store, maroon and black tones | Left; purple, store and maroon are navy now (see colours). |
| Corner radius of buttons and chips | Pill | Radius 26, 22, 20 | Left: the "crisp" member-app template changes these by name, and the shape is already pill-like. |
| Cards | White, 1px `line`, radius 24 (`radius-tile` 16 for small cards), padding 20, no coloured left-border accents | White, 1px border, radius 18, padding 14 and 16; the three left borders are neutral grey | Fixed (decision 5): list cards use the kit's `radius-tile` (`radii.xl` is 16; sheets and dialogs were already 24); mobile padding kept. |
| Fields | `white`, 1px `line-control`, `radius-field` 12, 16px text on a touch surface, `faint` placeholder, `control-primary` 52 tall on a phone | 48px, radius 10 to 14, 15px text, `borderInput` | Fixed: every text field and select is radius 12, a `line-control` border, 16px text, 52px (a compact form field stays at the 48 minimum). The chat box keeps its pill shape. The "crisp" template squares `field` and `tag` too. |
| Tags | `radius-tag` 8, a solid navy with white text or a tint, always words; one hue for the parts of a product | Radius 8 on pills | Fixed: `Pill` uses `radii.tag`; module tags are navy. |
| Chips | Pill | Pill at 48px; grid chips radius 12 | Conforms except the grid cell (kept). |
| Tab bar | Icons stroke 2, idle text `faint` | Stroke 1.8, idle `faint` at 3.7:1 | Fixed: stroke 2; the kit's `faint` is 5.2:1. |
| Icons | 42 stroke icons: 24px grid, stroke 2, round caps | Ten shell icons close but not the kit's; about 40 call sites on Ionicons | Fixed (decision 6): all 42 kit icons are in `StrokeIcon`, element for element (a test compares them with the kit's SVG files, copied to `assets/brand/icons`); `Icon` draws the kit's icon wherever the kit covers the name (tick, close, plus, alert, info, eye, pencil, file, search, calendar, people, ticket, card, book, chevrons); the row chevron is the kit's; success banners and the setup list use the kit's tick. About 50 Ionicons names remain (below). |
| Tap targets | `tap-target` 48px; buttons 52px | 44px minimum, some 36 to 46 | Fixed (decision 4): `touch.min` is the kit's 48 and every tappable minimum reads it (about 50 places, buttons and chips included); a test fails on a hand-written minimum under 48 on a pressable. |
| Focus | 2px solid navy outline, 2px offset (4px on buttons) | Browser default ring on the web build | Fixed in `src/global.css` (keyboard focus only). Not applicable on phones. |
| Gradients | Only the AI tag, the headline underline and the picture wash | None | Conforms; the AI tag adds the first (`gold` to `saffron`, drawn with `react-native-svg`). |
| AI tag and Niva | Every AI capability carries the tag and the human decision; Niva is the tag labelled "Niva", never a colour of its own, and its button is an ordinary one (a `navy-50` tile with an `ink` sparkle, or `navy`) | Niva had no tag; its drawer row was a brown tile with a brown sparkle | Fixed (decision 8): `src/components/ai-tag.tsx` (`AiTag`, `AiLine`). The chat's small print is now an AI line (the tag "Niva" and the existing sentence that names who decides: content the community approved, sources shown); the drawer's Ask Niva row (a navy-50 tile, an ink sparkle) and the guide's Ask Niva tile carry the tag. |
| Spacing | gutter 20, gap 12 | 20 and 12 | Conforms; `space.gutter` reads the kit. |

**Ionicons still in use (about 50 names), waiting for the kit to extend its icon set.** add and remove (the quantity stepper's
pair: the kit has plus but no minus), arrow-down, arrow-up, attach-outline, basket-outline, compass-outline, download,
download-outline, ellipse-outline, finger-print, flame, flame-outline, flower-outline, gift-outline, hand-left-outline,
headset-outline, heart and heart-outline (a like shows its state by fill; the kit's icons are outline only), hourglass-outline,
image-outline, images-outline, key, leaf-outline, link, location-outline, logo-whatsapp, megaphone-outline, mic-outline,
musical-notes-outline, notifications, notifications-outline, open-outline, pause, person-add-outline, play, play-skip-back,
play-skip-forward, qr-code-outline, receipt-outline, refresh, repeat, restaurant-outline, ribbon-outline, save, school-outline
(14 uses), share, share-outline, shuffle, star (a rating shows its state by fill), storefront-outline, swap-horizontal-outline,
swap-vertical, time-outline, trash-outline. When the kit adds one, add its name to `KIT_ICON_FOR` in `src/components/icon.tsx` (and
its shapes to `StrokeIcon`); every use changes at once.

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

On 2026-10-14 the owner said "go with your recommendations". Where a decision needed a token the kit did not have, the app first
used a named temporary one; the kit's second version (`2b758c1f`) has since defined them all and the temporaries are gone.

| # | Decision | Recommendation | State |
| --- | --- | --- | --- |
| 1 | The accent colour (saffron role) | Adopt a strong accent that passes 4.5:1 with white | Decided and applied: the accent role is the kit's `saffron-strong`. |
| 2 | Colours the kit does not have | Module tags navy only; keep chandan and the Gyan Path set module-owned; add a deep success and a dark surface pair | Decided and applied: purple, store green, maroon and album colours are the navy family; the kit did not add a deep success or a dark surface pair, so the deeper greens and the dark surfaces stay in `appOnly`. |
| 3 | The lightest text (`faint`) | One lighter text colour at 4.5:1 | Decided and applied: the kit's `faint` (5.2:1). |
| 4 | Tap targets 48 | Raise to 48 everywhere | Decided and applied. CLAUDE.md says 48. |
| 5 | Card radius | 16 for list cards | Decided and applied; fields take `radius-field` 12 and tags `radius-tag` 8. |
| 6 | Icons | Extend the kit's set, then retire Ionicons | Decided; the kit has 42 and the app uses them where they cover a name; about 50 Ionicons names wait (listed above). |
| 7 | Buttons on navy | `gold` | Decided and applied. |
| 8 | AI tag on Niva | Add it | Decided and applied. |
| 9 | Dark splash | Keep the white-tile variant until seen on a dark-mode phone | Decided: kept. |
| 10 | The old link scheme | Add `weaver://` beside it | Decided and applied (the next native build registers the scheme; the old schemes keep working). |
| 11 | Type details | Keep static fonts; a mono face for identifiers | Decided and applied: static fonts kept; JetBrains Mono for identifiers. |
| 12 | Words | Remove Wallet; neutral greetings from the community's own word; rename "Pathshala Connect" | Decided and applied. |

**Open.** The kit's Control guide and brand book say a caption is `caption` (14.5px) at the smallest on a touch surface, and that
11 to 13px labels belong to dense desktop tables. The app's scale has `meta` 13, `caption` 12, `fine` 11, `badge` 10 and `tithi` 9,
used in tiles, tags and the tab bar. Raising them is one change in `src/theme.ts` but reflows most screens, so it needs a visual pass
over the signed-in screens first; recommended as the next brand pass.

## What ships how

- **Over the air (JavaScript and bundled assets):** the palette and every colour in screens, the three faces (bundled assets), the
  text tracking, buttons (ghost, pressed, gold, accent, 52px), fields, tags, the 48px tap targets, navy module tags, icons, the
  mono identifiers, the AI tag and line, the lockup on Find your community and Setup, the English copy and greetings, the focus
  ring, and the guard test. Phones on runtime "3" pick it up with the usual close-and-reopen.
- **The web build (app.weaverams.org):** the same JavaScript plus the favicon and theme colour; it ships with the normal deploy of
  `main`, not by an update.
- **Needs the next native build (not run here):** the launcher icon, the splash (images and colours), the Android notification icon
  and tint, the `app.json` colours (`backgroundColor`, `primaryColor`), and the new `weaver` link scheme. Until then installed apps
  keep the old icon and splash, do not answer `weaver://` links (the old two still work), and run the new JavaScript fine. No native
  code changed, so `runtimeVersion` stays "3".

## Not checked

Everything on a phone: the new fonts on iOS and Android, the splash and icon, the notification glyph, the pressed colours, the AI
tag's gradient, the 52px buttons and fields and the larger tap targets were not seen on a device. The web build was exported, served
and opened in a browser (fonts load, the stack and tracking apply, the lockup and the focus ring show, and a throwaway preview of the
AI tag, buttons, icons and banners); only the screens that need no sign-in were reachable, so the colours and type on the signed-in
screens were verified by the theme tests and by reading the code, not by looking at each screen.
