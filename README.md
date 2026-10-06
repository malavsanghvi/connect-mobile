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
                    recurring, gyan path (+ homework), pachchakhan, person, special days, member card,
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
  (`app.my_modules`). Tabs, Home rows and tiles, drawer entries, Give / Events / Jain Way
  segments and guide sections of a switched-off module are hidden, and a deep link to
  one shows "{module} isn't offered by {center} right now". If `app.my_modules` is
  missing or fails, everything is shown and the reason is logged once.
- **Home** (`src/app/(app)/(tabs)/index.tsx`): six Netflix-style **rows** of big tiles
  (`src/features/home-rails.tsx`, the scrolling row itself in `src/features/home-rail.tsx`), each
  scrolling sideways with no scrollbar, the next tile peeking in at the right edge and a sliver of the
  previous one at the left once it has moved (a row with a single tile fills the width instead). 1 **Today at
  {center}** (same height and content; beside My Jain Way the card is 24 px narrower and its three timings have
  4 px of side padding instead of 8, so each time keeps the room for its words the old card gave it) beside
  **My Jain Way** (the navy progress card of the My Jain Way tab, `src/features/jain-way-progress.tsx`; it opens
  that tab; a guest sees Today alone), 2 **Plan a special day** (the household's days from today to the same day
  two calendar months on, in the community's time zone, hidden with none; it loads when Home does and keeps its last
  answer, and the rows under it are drawn invisible, for at most 1.2 s, until it knows, so it never pushes them down
  once they have been seen), 3 **Events** (a poster each, flyer or designed, in date order with the family's RSVP status
  as a chip; an adult's Confirm tile, "Still coming?", comes first; a tap does what the chip says: Confirm opens the
  confirmation, Going / Waitlisted / You attended the tickets, RSVP / Not going / closed the event page), 4 **Giving
  opportunities**, 5 **Life@{center}** (the guide's features and Special days), 6 **Learn & listen** (Continue
  learning, which reads a light summary of Gyan Path and stays as "Gyan Path · Every level done", opening the goals,
  when every goal is finished; My playlist, Podcasts, Recipes, Photos). Above the first row only the deactivated notice
  and the urgent alerts; between rows 1 and 2 the other alerts, today's lunch times and feedback requested (so none of
  them pushes Today down; the "Still coming?" pop-up opens by itself 24 hours before an event). Which rows and
  tiles show is pure and unit-tested (`src/lib/home-rails.ts`): the community's modules, its Home shortcuts
  (`centers.rules.home.shortcuts`; each is a tile of Learn & listen), the access levels (a tile the person
  may not use is left out, not shown locked), and, for a guest, only Today, the public events and the
  guide tiles. A row loads only as it nears the screen (Plan a special day when Home does), shows its own
  plain-English error with Try again, and is left out when it has nothing to show and nothing wrong: a row whose
  every load failed keeps its title and says so. Known limitations: Tab stops on every tile of every row (the arrow keys
  also move within a row, but a row is not a single Tab stop), and a notice that loads late (feedback, lunch times) can
  still push rows 2 and below down by its own height.
- **Access levels** (`src/lib/access.ts`; the model is connect-crm `docs/ACCESS_LEVELS.md`):
  each organization sets, for each area (Live darshan, Virtual puja, Listen, Look,
  Learn, Ask Niva, the guide), the lowest level that may use it: public (anyone, not
  signed in), community (signed in and linked to it) or one of the organization's own
  membership levels (Member, Life member…). The app asks `app.feature_access_for_me`
  once the community is known (a signed-in person's first read waits until their link
  to it is known, and is made again when the login is linked at the end of onboarding),
  for a visitor who is not signed in too, and `useFeature(area)` decides what to show:
  Home's "Watch live darshan" and "Do puja" (`src/features/today-doors.tsx`), Welcome ›
  Without signing in (only the doors that lead somewhere here: a stream or an aarti
  time, the Navang puja lesson; `useGuestDoors`), the 3L sections, the Niva button and
  the screens of each area (`ROUTE_FEATURE` in `src/lib/modules.ts`; a library item is
  gated by its own kind, `MediaItemView`). Today's timings are in the portal's list but
  the app does not gate them (public in the database, shown on Home, the darshan
  screens, the day plan and the guide). What is not available gets `FeatureNotice`
  instead: "Sign in to use …" with a Sign in button, or "… is available to Member and
  above. Ask the office about membership.".
  The app only decides what to show; the database itself enforces Live darshan (RLS),
  and for the other areas the app is the only guard until connect-crm B45. The virtual
  puja runs without signing in and records nothing then ("Sign in to earn puja
  points"). If the function is missing (an older portal) the rules from before apply
  (members: everything; visitors: the guide and today's timings) and the reason is
  logged once; if it fails, the screens that need it say so with Try again.
- **Homework** (`src/lib/homework.ts` pure rules, `src/lib/api/homework.ts` calls, `src/features/homework`,
  `src/app/(app)/gyan/homework`; connect-crm migration 0587 and `docs/LEARNING_ASSIGNMENTS_PLAN.md` there): a
  community attaches homework to a Gyan Path level. Its cards (title, due, points, status chip, the note when it was
  sent back) show under the first step of a lesson, on the goal map (level by level) and on the level-complete screen
  (which says a level's points wait when its steps are done but its required homework is not accepted yet); the
  Family tab says "Homework: 1 needs your OK · 2 with the teacher" under each person. The homework screen
  (`/gyan/homework/<assignment>?person=<person>`) has the instructions, the answer as parts (Choose a photo from the
  library; Record a voice note with the lesson's recorder, up to 10 minutes; Write, 2,000 characters; Attach a file is
  shown disabled until the next APK brings the file picker), Save draft and Hand in. A part is uploaded the moment it
  is added (bucket `homework`, `<center>/<person>/<submission>/<id>.<ext>`, 25 MB; the draft is created first so the
  path has a submission) and registered with the draft, so leaving the screen never loses it. The type is checked
  against the bucket's list before anything is sent (photos png, jpeg, webp, heic, heif; voice notes the common audio
  types; files pdf, txt, docx, xlsx, pptx: the old .doc, .xls and .ppt can carry macros and are refused, like a GIF or
  an AVIF, with a plain sentence); a part that fails stays "Not uploaded" with Try again and Remove (a file that can
  never go through has Remove only), and nothing is handed in until every part is uploaded. Statuses: Not
  started, Draft, Needs a parent's OK, With the teacher, Accepted (the points, with confetti the first time this device
  sees it), Sent back (the teacher's note, Edit and hand in again). A child's own hand-in waits for a household adult
  when the assignment asks for it ("A parent will check this before the teacher sees it"): the adult sees the answer
  read-only with "It's ready — send to the teacher" / "Send back to <name>" (a note sheet), finds it on Home as a
  "Needs your OK" strip between rows 1 and 2, and may do the homework for the child from the same screen (no parent
  step then). Whether a parent checks first (`needs_parent`) and who may decide (`can_parent_decide`) are the
  database's word and are never worked out in the app. Closed homework (`assignment.archived: true`, which
  `my_gyan_homework` still lists for a person who answered it) is read-only everywhere: the answer, its status and
  any note under "This homework is closed.", with no editor, no Hand in and no parent buttons, and it never counts as
  something to do, to decide or to wait for. Gating: module `gyan_path` and the Learn area like the rest of Gyan Path;
  a visitor sees nothing; a child only their own. Every write goes through the 0587 functions and every refusal is
  shown as the database said it, with Try again; a failed write loads the answer again so the screen shows where it
  really is. Pushes of type `homework` open the learner's item (`deep_link`, else `assignment_id` with `learner_id`) or
  the homework list; `homework_parent` opens the child's item, or just the app when the child is not named (Home has
  the strip); `homework_review` is for teachers, in the portal (gap 29). A portal without 0587
  (`app.my_gyan_homework` missing) means homework is not offered: every entry point stays hidden and the reason is
  logged once (Schema gaps #31).
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
community open here, the visitor is asked first, like a join link ("Open {community}", with the
sandbox note for a sandbox), since the choice is remembered on the device. Switching restarts the
navigator on its first screen, so `ReopenEventLink` (root layout) opens the link again once the
new community is open. Then a signed-out visitor browses the event as a guest (a members-only
event says "This event is for members" with Sign in, and after signing in the member lands back
on the event); a signed-in account goes through family matching, onboarding and the legal step as
usual (`flyerLinkTarget` in `src/lib/flyer.ts`). Both returns are in
`src/features/return-to-event.tsx`.

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
| 30 | ~~`app.feature_access_for_me(p_center)` (access levels, connect-crm 0586) is not in the generated types yet~~ — the types are copied from connect-crm after 0586 | A typed `supabase.rpc('feature_access_for_me', { p_center })` in `src/lib/api/access.ts`; the jsonb answer is still parsed defensively (`src/lib/access.ts`). Missing RPC (an older portal) → the rules from before access levels (members: everything; visitors: the guide and timings), logged once |
| 31 | Homework (connect-crm 0587: `app.my_gyan_homework`, `save_gyan_submission_draft`, `hand_in_gyan_submission`, `parent_decide_gyan_submission`, bucket `homework`) is not in the generated types yet | One narrow cast per call in `src/lib/api/homework.ts` (nothing else in the app touches these functions); every answer is parsed defensively in `src/lib/homework.ts` (an item with an unknown status is left out and logged, never shown half-read). Missing function (an older portal) → homework is not offered: no cards, strip or lines, logged once; a stale link says "Homework isn't available in {center} yet". "Attach a file" and "Take a photo" wait for the APK with the native pickers (plan F6, H10) |
