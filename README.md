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

### Supabase auth settings this app expects

- **Email OTP**: the email template must include the 6-digit code (`{{ .Token }}`),
  not only a magic link. OTP length 6.
- **Phone OTP**: an SMS provider must be configured for "Continue with mobile number".
- **Push**: builds need an EAS `projectId` (`extra.eas.projectId`) to register Expo
  push tokens in `app.push_devices`; without it Settings explains why push is off.

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
| 13 | Survey audience targeting isn't enforced by RLS; anonymous answers can't be marked "responded" | Shows all open surveys (event feedback via `surveys.event_id`); anonymous answers remembered on the device |
| 14 | `opportunities.quantity_taken` isn't updated when a member pledges; no member-readable campaign progress | Shows quantity from the row as-is |
| 15 | No sales-tax rate; no gift-pack price in the schema; generated Insert type requires `store_orders.order_number` though a trigger issues it | No tax computed (said so at checkout); gift price from `centers.rules.store.gift_pack_cents` if set; typed cast for `order_number` |
| 16 | No per-member calendar layer selection | Stored on the device |
| 17 | No reminder table (hall bolis, pachchakhan) | Local notifications on the device |
| 18 | `statements.storage_path` but no member download path (bucket / signed URL) | "Ask the office for a copy" |
| 19 | No payment edge function; no recurring-gift subscription path | Honest notice on every Pay / new recurring gift |
| 20 | No rotating member-QR token or Wallet pass function | QR = member number; Wallet buttons disabled "coming soon" |
| 21 | Sign-out-everywhere / account deactivation needs a server-side session revoke | App sets `accounts.status` and signs out this device |
| 22 | `zones` has no lead name / family count | Zone lead messaged through the zone inbox |
| 23 | `eligibility_snapshots.reasons`, `gyan_steps.quiz` and `content_items.metadata` jsonb shapes are unspecified | Parsed defensively (strings or `{label, ok}`; `{questions:[{question, options, answer}]}`; `metadata.when` / `metadata.what`) |
| 24 | Expertise tag vocabulary isn't center configuration | Prototype's nine tags in the profile screen |
| 25 | ~~No storage bucket for Gyan Path recitations~~ — done in connect-crm 0172 | Uploads to bucket `recordings` at `{center}/{person}/{step}-{ts}.m4a`; the child, their parents and teachers can read; kept 90 days |
| 26 | Niva has no answering backend (approved-content retrieval + model edge function) | Chat saves each question to `niva_conversations` as `unanswered` (portal "Unanswered questions") and says answers are coming; staff answers with `sources` render when present |
| 27 | No sender for family-circle pushes (saathi_feed milestones / behind) | App routes `data.type = 'family_circle'` taps to the Saathi tab and handles the "Send anumodana" button (`src/lib/notification-routes.ts`) |
| 28 | Recitation "clear recitation · steady pace" scoring needs speech analysis | Recording is saved for the teacher; no automatic pace/pronunciation verdict is claimed |
| 25 | A person in several households | App uses the household they are primary in |
| 24 | `app.my_modules(p_center)` is not in the generated types yet (wave 2, schema stream) | Hand-typed call in `src/lib/api/modules.ts`; missing RPC → everything on, logged once |
