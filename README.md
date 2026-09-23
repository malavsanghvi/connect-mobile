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

## Per-center builds

`app.json` uses the placeholder identifiers `org.connectplatform.member` (iOS
`bundleIdentifier` and Android `package`) and the app name "Connect". Each center
that publishes its own store build changes these (and the icons/splash, which are
still the scaffold placeholders) plus `EXPO_PUBLIC_CENTER_SLUG`.

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
| 10 | `practices` has no time of day / reminder time | Ordered by `sort_order`; no practice reminders |
| 11 | Completing a Gyan Path step/level awards no points or streak (members can't insert `points_ledger`; 0017 awards a level's points only when a teacher approves a sign-off) | Progress saved in `gyan_progress`; points arrive with the teacher sign-off |
| 12 | No monthly per-category standings data | Section omitted |
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
| 25 | A person in several households | App uses the household they are primary in |
