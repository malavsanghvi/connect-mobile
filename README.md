# Connect — member app

The member app of **Connect**, a multi-tenant platform for Jain communities.
Families use it for events and RSVPs (tickets, lunch times), giving (opportunities,
pledges, bolis, recurring gifts), My Jain Way (practices, Gyan Path, Saathi,
pachchakhan library), their family record and member cards, the center guide, the
Satvik Store and — for volunteers — event check-in. The Jain Society of Houston
(JSH) is tenant #1.

It is one of three apps on a single Supabase backend:

| Repo | Role |
|---|---|
| connect-crm | System of record; **owns the database** (migrations, RLS, RPCs, generated types) |
| connect-admin | Operations console |
| **connect-mobile** (this repo) | Member app — Expo (React Native) + expo-router + Supabase |

Platform conventions (Supabase client, env vars, RPCs, integer cents, error rule,
design tokens): **`connect-crm/docs/ARCHITECTURE.md`**. Screen-by-screen source of
truth: `docs/PROTOTYPE_SPEC.md`, `docs/PROTOTYPE_ONBOARDING.md`,
`docs/PROTOTYPE_WELCOME_GUIDE.md`, `docs/PROTOTYPE_GYAN_PATH.md`.

## Setup

```bash
pnpm install
cp .env.example .env.local      # fill in the values below
pnpm start                      # then i / a / w
```

The app uses native modules (camera, secure storage, notifications, biometrics), so
use a development build for iOS/Android (`npx expo run:ios`, `npx expo run:android`
or `eas build --profile development`). Expo Go works for most screens; push
notifications need a development build.

If the Supabase variables are missing the app shows a setup screen listing them —
it never falls back to sample data.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon / publishable key (RLS protects data). Never a service-role key. |
| `EXPO_PUBLIC_CENTER_SLUG` | no | Center to open, resolved from `app.centers.slug`. Default `jsh`. |
| `EXPO_PUBLIC_COMMUNITY_DASHBOARD_URL` | no | Public community dashboard linked from the menu. `centers.branding.dashboard_url` wins; hidden when neither is set. |

For EAS builds set them as EAS environment variables.

### Android on a phone (EAS)

One-time, from the repo folder on your own computer (needs an Expo account):

```bash
npx eas-cli login
npx eas-cli init                 # creates the EAS project and writes extra.eas.projectId into app.json
```

Set the three `EXPO_PUBLIC_*` values above as EAS environment variables (expo.dev › project ›
Environment variables) for the environments you build. Then:

```bash
npx eas-cli build --platform android --profile development   # dev build (APK) with push, camera, Face ID
npx eas-cli build --platform android --profile preview       # installable APK for testers
```

Open the build link on the phone to install the APK (allow installs from your browser when
asked). For the development profile run `pnpm start` and open the app to connect. The
`production` profile builds an app bundle for Google Play; submitting needs a Play Console
account and a service-account key (`submit.production.android`).

### Supabase auth settings this app expects

- **Email OTP**: the email template must include the 6-digit code (`{{ .Token }}`),
  not only a magic link. OTP length 6.
- **Phone OTP**: an SMS provider must be configured for "Continue with mobile number".
- **Push**: builds need an EAS `projectId` (`extra.eas.projectId`) to register Expo
  push tokens in `app.push_devices`; without it Settings explains why push is off.


### Over-the-air updates (EAS Update)

Changes to screens, text and logic (JavaScript, images) reach installed phones without a reinstall.
Changes to native parts still need a new build: a new native library, a permission, the icon, the
app name, or an Expo SDK upgrade.

`runtimeVersion` in `app.json` is a fixed string (currently `"3"`). An update is only offered to installed
builds with the same value. **Whenever you make a native change, bump it** (`"2"` to `"3"`) in the
same commit, so an older installed app never receives JavaScript that needs native code it lacks.

**Runtime 3 (v1.6.0) needs a new build.** It adds expo-speech-recognition (the Gyan Path voice practice
listens on the phone), expo-speech (text-to-speech) and expo-haptics, with the speech-recognition and
microphone permissions. Phones on a runtime 2 build keep running 1.5.x and get no further updates until
the new APK is installed; after that, JavaScript updates reach them over the air again. A development
build must be rebuilt too (`eas build --profile development`), or the lesson screen fails to load the
speech-recognition module.
(The automatic `fingerprint` policy was tried and rejected: EAS computes it on Linux and the
CLI on your PC, and the two never match, which fails the build.)

Each build profile listens to its own channel (`development`, `preview`, `production`). To ship a
JavaScript-only change to the testers' APK (built with `--profile preview`):

```bash
npx eas-cli update --channel preview --environment preview --message "what changed"
```

Phones fetch it in the background: close the app fully and open it again (sometimes twice) to
load it. Builds made before OTA was set up have no updater; install one fresh build first.

## Scripts

| Command | What it does |
|---|---|
| `pnpm start` / `pnpm ios` / `pnpm android` / `pnpm web` | Dev server |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | `expo lint` (includes the React Compiler rules) |
| `pnpm test` | Jest (jest-expo) unit tests for the pure helpers |
| `pnpm exec expo export --platform web` | Production web bundle in `dist/` |

## Project layout

```
src/app/            expo-router routes
  (auth)/           welcome, sign-in (email / mobile OTP)
  (onboarding)/     family match → about you → your family → contact & mail → done
  (app)/(tabs)/     Home · Events · Give · Jain Way · Family
  (app)/…           event RSVP / tickets / confirm, survey, opportunity, pledges, bolis,
                    recurring, gyan path, pachchakhan, person, special days, member card,
                    settings, preferences, legal, guide (+ zones, WhatsApp, ask), store,
                    cart, volunteer (scanner), niva
src/lib/            supabase client, env, storage, errors, format + rules (pure), api/*
src/providers/      app session/center/member, settings (language, text size), feedback
                    (toast, confirm, payment notice), push, cart, data version
src/components/     UI primitives, screen shell, drawer, states, QR
src/features/       larger screen sections (home, jain way, calendar, onboarding forms)
src/i18n/           en (complete), gu, hi (all keys, English fallback)
```

## Rules the code follows

- Every failure is shown to the member in plain English with a retry; technical detail
  is logged (`src/lib/errors.ts`).
- Money, RSVPs, bolis and pledges are **adults only** (18+ or unknown date of birth,
  mirroring `app.i_am_adult`); children see "Ask a parent". RLS enforces the same.
- Money is integer cents; formatted only at the edge.
- Bolis always say **pledge**, never "bid".
- **Payments are not live**: there is no payment edge function yet, so every Pay
  button says "Online payment is being set up — your pledge is saved and you can pay
  at the office or by Zelle." Nothing pretends to succeed.
- The member-card QR encodes the permanent Connect member number. Rotating signed
  tokens are a later edge function (see `src/app/(app)/member-card.tsx`).
- Organization IDs (`external_ids` kinds `org_member`, `org_household`) are shown
  exactly as issued (leading zeros kept), labelled from
  `centers.rules.identifiers.org_member_label` / `org_household_label`.
- **Modules** (`src/lib/modules.ts`): the community can switch modules off
  (`app.my_modules`). Tabs, Home cards, drawer entries, Give / Events / Jain Way
  segments and guide sections of a switched-off module are hidden, and a deep link to
  one shows "{module} isn't offered by {center} right now". If `app.my_modules` is
  missing or fails, everything is shown and the reason is logged once.
- **Traceability** (`src/lib/request-context.ts`): every PostgREST request sends
  `x-client-app` (`member`, or `kiosk` while the volunteer board is in kiosk mode), a
  fresh `x-request-id` and `x-client-screen` (the current route). Writes the member
  asked for with a reason (cancel an RSVP, deactivate / delete / reactivate the
  account) also send `x-audit-reason` via `withAuditReason()`.

## Per-center builds

`app.json` uses the placeholder identifiers `org.connectplatform.member` (iOS
`bundleIdentifier` and Android `package`) and the app name "Connect". Each center
that publishes its own store build changes these (and the icons/splash, which are
still the scaffold placeholders) plus `EXPO_PUBLIC_CENTER_SLUG`.

## More than one community (one shared app)

A new install opens on **Find your community** (`src/features/community/`): search live
communities by name, city or state (`app.find_community`), or enter a join code / scan a
poster QR code (`communityconnect://join/<code>` or `https://<member web app>/join/<code>`,
`app.community_by_join_code`). Sandboxes are reachable only by code. The choice is kept on
the device and changed in Settings › Switch community (or "Not your community?" on the
welcome screen). `EXPO_PUBLIC_CENTER_SLUG` stays the default: an install that is already
signed in, or opened on a link into one of the app's screens, opens it with no new step.
The app themes itself from the community's brand kit (`centers.branding` colours and logo
files) and shows "Sandbox · test data" over every screen of a sandbox.

## Event flyers

The portal (connect-crm › Events › builder) designs or uploads an event's flyer and stores its
key in `events.flyer_path` (private `content` bucket). The event screen shows it under the title
band (`src/features/event-flyer.tsx`) with **Share** (the system share sheet, so WhatsApp and
Messages work) and **Save** (Photos; a download on the web), plus a full-screen viewer. Links are
signed for an hour (`src/lib/api/flyers.ts`), signed again before Share/Save after 50 minutes,
and once more if Storage refuses an expired link. Guests see the flyer of published public
events (connect-crm 0578); members-only flyers stay private.

The QR code on a flyer opens `https://<member web app>/e/<event id>`, optionally with
`?c=<community web name>` (`src/app/e/[id].tsx`, outside the route guards like `join/[code]`).
The event opens in its own community: the one the link names, otherwise the event's own when the
visitor can read it (`eventLinkCommunity` in `src/lib/api/flyers.ts`). When that isn't the
community open here, a signed-out visitor just switches to it and a signed-in account is asked
first, like a join link. Then a signed-out visitor browses the event as a guest (a members-only
event says "This event is for members" with Sign in, and after signing in the member lands back
on the event: `src/features/return-to-event.tsx`); a signed-in account goes through family
matching, onboarding and the legal step as usual (`flyerLinkTarget` in `src/lib/flyer.ts`).

The QR opens the web app, also on a phone with the app installed: the app declares no iOS
associated domains or Android app links yet (a native release).

## Schema gaps

Found while building against connect-crm migrations 0001–0017; the schema was not
changed. The app works around each one as noted.

| # | Gap | What the app does |
|---|---|---|
| 1 | No atomic RSVP RPC (rsvp + attendees + commitment pledge) | Writes in steps; if attendees fail, the new RSVP is marked cancelled |
| 2 | Households can't cancel/update their own open pledges (no update policy) | "We can't make it" leaves the RSVP commitment pledge open and says so |
| 3 | Members can't insert `people` / `household_members` or change a relationship | "Add family member" sends a request to the membership inbox; relationship read-only |
| 4 | `people` has one email (prototype: several, Primary/Work) | One email field |
| 5 | No "best time to call", no `phone_call` channel, no interests column | Interests use `notification_topics`; call time not captured |
| 6 | `households.physical_mail_opt_in` defaults to true, so "not chosen" is invisible | Choice read from `consents` kind `physical_mail` |
| 7 | No onboarding progress / completion record | Linked = onboarded; profile can be finished from Family |
| 8 | `accounts.quiet_hours` int4range can't wrap midnight | Stores `[1260,1860)` for 9 PM–7 AM |
| 9 | `accounts.large_text` is boolean; three text sizes | "Largest" kept on the device |
| 10 | ~~`practices` has no time of day~~ fixed in 0021 (`default_time`) | Sorted by time; Navkarsi/Chauvihar follow `daily_timings`; bell = daily local reminder 10 min before |
| 11 | Completing a Gyan Path step/level awards no points or streak (members can't insert `points_ledger`; 0017 awards a level's points only when a teacher approves a sign-off) | 0018 awards `gyan_steps.points` once per step; the level-complete screen shows exactly those points (0 on a replay) and the level's sign-off points separately |
| 12 | ~~No monthly per-category standings~~ fixed in 0021 (`my_practice_standing`) | "Your standing this month" card; "Too few people yet" when suppressed |
| 13 | ~~Survey audience targeting isn't enforced by RLS; anonymous answers can't be marked "responded"~~ fixed in 0018 (audience in RLS) and 0544 (`survey_completions`, `app.submit_survey`) | Members answer through `submit_survey` (answer + "answered" + points once); answered surveys are not offered again; older device-remembered anonymous answers are still honoured. After an event completes the Home "How was <event>?" pop-up (once a day, first 3 days) and the server's day 1 / day 2 pushes ask for feedback |
| 14 | `opportunities.quantity_taken` isn't updated when a member pledges; no member-readable campaign progress | Shows quantity from the row as-is |
| 15 | No sales-tax rate; no gift-pack price in the schema; generated Insert type requires `store_orders.order_number` though a trigger issues it | No tax computed (said so at checkout); gift price from `centers.rules.store.gift_pack_cents` if set; typed cast for `order_number` |
| 16 | No per-member calendar layer selection | Stored on the device |
| 17 | No reminder table (hall bolis, pachchakhan) | Local notifications on the device |
| 18 | `statements.storage_path` but no member download path (bucket / signed URL) | "Ask the office for a copy" |
| 19 | No payment edge function; no recurring-gift subscription path | Honest notice on every Pay / new recurring gift |
| 20 | No rotating member-QR token or Wallet pass function | QR = member number; Wallet buttons disabled "coming soon" |
| 21 | Sign-out-everywhere / account deactivation needs a server-side session revoke | App sets `accounts.status` and signs out this device |
| 22 | `zones` has no lead name / family count | Zone lead messaged through the zone inbox |
| 23 | `eligibility_snapshots.reasons` and `content_items.metadata` jsonb shapes are unspecified (`gyan_steps.quiz` and `gyan_steps.activity` are specified and checked by connect-crm 0570) | Parsed defensively (strings or `{label, ok}`; `metadata.when` / `metadata.what`); Gyan Path payloads in `src/features/gyan/activity.ts` |
| 24 | Expertise tag vocabulary isn't center configuration | Prototype's nine tags in the profile screen |
| 25 | ~~No storage bucket for Gyan Path recitations~~ — done in connect-crm 0172 | Uploads to bucket `recordings` at `{center}/{person}/{step}-{ts}.m4a`; the child, their parents and teachers can read; kept 90 days |
| 26 | ~~Niva has no answering backend~~ — done in connect-crm 0530/0531 (worker job `niva.answer`); `answer_status` (why a question is unanswered, connect-crm 0572) is not in the copied types yet | `app.niva_ask` saves the question and queues it; the chat shows "Looking that up for you…", polls the row every 3 s while open and in front, and shows the answer with its sources. No answer (status, or 90 s) → the owner's "unable to answer" message with Send to the team (Guide › Ask, question prefilled). `answer_status` is read defensively when present (`src/lib/learning.ts` `nivaPhase`) |
| 27 | No sender for family-circle pushes (saathi_feed milestones / behind) | App routes `data.type = 'family_circle'` taps to the Saathi tab and handles the "Send anumodana" button (`src/lib/notification-routes.ts`) |
| 28 | Recitation "clear recitation · steady pace" scoring needs speech analysis | Recording is saved for the teacher; no automatic pace/pronunciation verdict is claimed |
| 25 | A person in several households | App uses the household they are primary in |
| 24 | `app.my_modules(p_center)` is not in the generated types yet (wave 2, schema stream) | Hand-typed call in `src/lib/api/modules.ts`; missing RPC → everything on, logged once |
| 29 | The push worker (`worker/src/messaging.ts`) sends Expo only `{ message_id, center_id, purpose }`; it does not forward `messages.payload` (`survey_id`, `deep_link`, …) or a `type`, so a tapped push cannot say which survey it is about | App routes `data.type = 'event_survey'` / `'event_survey_reminder'` (or a `deep_link` of `survey/<id>`, with `survey_id`) to the survey (`src/lib/notification-routes.ts`). Until the worker forwards them, a tap only opens the app; the Home pop-up and card still ask for the feedback |
