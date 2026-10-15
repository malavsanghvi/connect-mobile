# Try the demo (member app)

A person can try the member app without installing anything: open https://app.weaverams.org (or https://app.weaverams.org/demo) in a
phone or desktop browser, or the native app, press **Try the demo**, and use the real app. Nothing in a demo is real; the demo
communities start over every night. The portal side (the endpoints, the limits, the kill switch) is connect-crm
`docs/DEMO_SIGNIN.md` and `docs/MEMBER_APP_DEMO.md`; this page is the app side.

## The flow

1. **Entry.** "Find your community" shows "Just looking? See the app as a family, a volunteer or a teacher. Nothing real is sent." and a
   **Try the demo** button under the join-code area. The button exists only when the build has a demo address (below). The route `/demo`
   (`src/app/demo.tsx`) is the same entry: `https://app.weaverams.org/demo` and `connect://demo` open the demo communities directly. (The
   chooser itself is drawn by the root layout, not by the route, because it has to appear before any community is chosen, when no
   navigator exists yet; the route only makes `/demo` a real address and sends anyone past the chooser on to the app.)
2. **Choose a demo community, and start in one tap** (step 1, `DemoCommunityStepView`): the communities from `GET /api/demo/choices`,
   faith-based first, each a card with **one main button, "Start as a community member"** (owner request 2026-10-15: "directly drop the
   user on the demo mobile app's home page ... assume as if they have logged in"). One tap:
   - picks the family's main adult of that community **from the portal's list, by area then by role, never by name or id**
     (`familyPerson` in `src/lib/demo.ts`: the person whose `area` is `community`, an "Adult" role before any other role of that area,
     else the first the portal lists; a portal that sends no areas is read by the role "Community member" alone). Today that is the
     portal's "Community member · Adult" (household Patni in the faith demo);
   - starts that person with the very same call as choosing them in the list (`demo.start(id)`: `POST /api/demo/session`, then
     `supabase.auth.setSession`, then `demo_session_state`), so the state is the same: `mode: 'person'`, `active: true`, `guest: false`,
     banner "Demo · Community member · Adult · 1 h 59 min left". There is no guest step and no person list in between;
   - lands on the app's Home signed in as that person: the real family Home (greeting, the Family tab with the household and the
     children, events, giving, learning), because from there on it is the ordinary app for a linked member of the community
     (`AppProvider` opens the community the database names; nothing says "guest").
   The card says who that is (the portal's sentence about the person) and shows "Starting the demo…" while it works. If the start fails,
   the reason is shown above the list **in the portal's own words** (or the app's, when it sent none) with **Try again** (`retryStart`, the
   same person again); a person or community that is not on the list gets no Try again, the cards are the way on.
   Two **quiet actions** sit under the button on the same card (a community with no family to start as keeps "Look around as a guest"
   as its main button):
   - **Look around as a guest** (`demo.enterGuest`): opens the community **at once as a guest**, no sign-in. The app does this through its
     normal community path: the demo provider's `slug` is what `communityToOpen` returns first, so `loadCenter(slug)` and every guest read
     is scoped to that community, and `AppProvider` reports `guest: true` (the app's existing guest mode: Home with the public events and
     the guest sign-in card, the guide, alerts, the store, per the community's access levels);
   - **Choose someone else** (`demo.openPeople(slug)`): the people of that community (step 3). Back returns to the communities.
3. **Be someone in the demo** (step 2, `DemoPersonStepView`): from "Choose someone else", from the guest strip, from any "Sign in" button
   in the guest app (`setGuest(false)` opens the people instead of the real sign-in), or from "Switch person". Over a running demo it is
   drawn **over** it, so Back returns to the screen the visitor was on; with no demo running yet ("Choose someone else") it takes the
   screen like step 1 (`peopleOf` names the community). The people of the community being looked
   at come in two sections, **Community roles** first and **Non-profit operational roles** second, each a large card (role, name, one
   sentence). A portal that sends no `area` gets one plain list. **Start** calls `POST /api/demo/session`, stores the tokens with
   `supabase.auth.setSession` (the same client and storage as a normal sign-in), asks the database who the person is
   (`demo_session_state`: role, name, community, seconds left) and opens that community.
4. **Banner** (`src/features/demo/banner.tsx`, drawn by the root layout above the navigator, so on every screen):
   - guest: "Demo community · Looking around as a guest" · **Be someone in the demo** · **Leave the demo**;
   - person: "Demo · Teacher · 1 h 42 min left" · **Switch person** · **Look around as a guest** · **Leave the demo**.
5. **Leave the demo** (guest or person) goes back to "Find your community". For a person it tells the database (`demo_leave`), signs out
   on this device and forgets the demo. **Look around as a guest** does the same sign-out and keeps the community as a guest.

## Deep links that start straight away

These start a demo with no tap and no chooser. The same query works on the web (`https://app.weaverams.org/demo?...`) and in the app
(`connect://demo?...`, also `weaver://demo?...`), both when the app is opened by the link and when it is already running.

| Link | Starts as |
| --- | --- |
| `/demo?as=family` | the family person (`familyPerson`) of the **first** demo community that has one (faith-based first, as the portal sorts them) |
| `/demo?as=family&community=<web name>` | the family person of the demo community with that web name (`slug` in `GET /api/demo/choices`) |
| `/demo?persona=<id>` | exactly that person: an `id` from `GET /api/demo/choices` (the portal's `/demo` page links to this). Wins over `as=family` when both are there |
| `/demo` or `/demo?as=<anything else>` | nobody: the demo communities (step 1), as before |

How it behaves (`runLink` / `openLink` in `src/providers/demo.tsx`; the reading of the link is `parseDemoLink` in `src/lib/demo.ts`):

- **While it starts** the provider reports `ready: true, starting: true, chooser: null`, so the root layout shows "Starting the demo…"
  (`FullScreenLoading`) and `AppProvider` holds the community back: no other screen flashes first. On success the app is on the Home
  of the demo community, signed in, exactly as after the one-tap button.
- **Unknown id, or any failure** (the portal says `unknown_person`, the hourly limit, the demo switched off, the portal or the list not
  answering, a community that is not on the list, a community with no family to start as) falls back to step 1 with the plain sentence
  above the list (`startError`; the portal's own sentence when it sent one) and Try again where it can help (`canRetry`:
  `canRetryStart(code)`). An id that cannot be an id (not letters, digits, `-`, `_`, at most 80) never reaches the portal: it is "that
  person is not available. Choose someone else."
- **The address is cleaned** once the start has settled (`forgetDemoLink` in `src/lib/demo-address.ts`, web only): the history entry is
  replaced by `/` when the demo started and by `/demo` when it did not, so no id lingers in the address bar or the history, and a reload
  keeps the demo (the saved sign-in) instead of starting it again. On a phone there is no address bar, so nothing is done.
- **A real sign-in on the device is never replaced by a link.** Starting would sign that person out without asking, so a link over a real
  sign-in only opens step 1, which shows the usual "You are signed in on this device. Opening the demo signs you out here" warning; the
  one-tap button is then a deliberate choice. A demo that was already running (a reload with the link in the address) is replaced by
  the link's person, the one before ending first.
- **Notices stay.** "The demo ended. Start again any time." and "The demo was switched off ..." still show when step 1 comes back; the
  limit and switched-off sentences of the portal show as the start error.
- A build with no demo address (`EXPO_PUBLIC_DEMO_URL` / `EXPO_PUBLIC_PORTAL_URL`) ignores these links.

## Where the state lives

`src/providers/demo.tsx` (`DemoProvider`, above `AppProvider`) holds it; `useDemo()` is how the app knows:

| Field | Meaning |
| --- | --- |
| `mode` | `'off'`, `'guest'` (looking around, no sign-in) or `'person'` (signed in as a demo person) |
| `guest` / `active` | `mode === 'guest'` / `mode === 'person'` |
| `slug` | the community the demo opens (the guest's, or the person's from `demo_session_state`); `AppProvider` opens it whatever the address or the saved community |
| `chooser` | `'community'` (step 1), `'person'` (step 2) or `null` |
| `peopleOf` | with no demo running yet, the community whose people step 2 lists (set by `openPeople`, from "Choose someone else") |
| `starting` | a person is being started (a tap, a link, Try again): the app opens no community meanwhile |
| `startError`, `canRetry` | why the latest start did not happen, in plain words, and whether `retryStart()` can help |
| `info`, `secondsLeft` | the demo person's role, name, community, and the time left |
| `notice` | `'ended'` / `'off'`: why step 1 is showing a sentence |

It is saved on the device (`connect.demo` for a person, `connect.demoGuest` for a guest) next to the session storage the Supabase
client already uses, so a **page reload or an app restart keeps the demo**. After a reload the saved sign-in is a demo person's when its
address is on `demo.weaverams.org` or its `app_metadata.demo` is true (the portal's own test), and the database confirms it.

The community is never written as the device's chosen community (`connect.community`), and on `app.weaverams.org` the app does not go to a
community's own address for a demo (those sub-domains do not exist for demo communities, and a sign-in does not follow a change of
address): when the demo ends, the device is as it was before.

## Checking a running demo person

Every minute, and when the app comes back to the foreground, `app.demo_session_state()` is asked. `ok` updates the time left (the
server's seconds are added to the device clock, so the two clocks never need to agree). `expired`, `off`, `unknown` or `not_demo`, or the
Supabase client signing the login out because its token can no longer be refreshed, ends the demo: the device signs out and step 1 comes
back with "The demo ended. Start again any time." (or "The demo was switched off ..."). A check that cannot be answered (offline) does not
end the demo; it ends when the device clock says the time is up (plus half a minute).

A demo sign-out is always `signOut({ scope: 'local' })`. Supabase's default signs the login out **everywhere**, and a demo person is shared
by every visitor who chose them, so that would end other people's demos.

## What a demo person cannot do

`DEMO_LIMITED` in `src/lib/demo.ts` is the list; `demoAllows(demoActive, action)` is the question. In a demo these are left out or
switched off, each with a plain sentence:

| Action | Where |
| --- | --- |
| `changeContact` (email, phone, password) | Settings › Security row; the contact fields of the profile (`person/[id]`) |
| `deleteAccount`, `deactivateAccount` | Settings › Account status |
| `dataRequest` ("Download my data") | Settings › Privacy |
| `push` | no permission prompt and no registration (`PushProvider`); the Settings switch is off with a reason |
| `sendMessage` | Settings › Contact / Report; the Send button of "Ask a question"; and `sendToInbox` refuses (`refuseMessageInDemo`), whichever screen asked |
| `switchCommunity` | Settings; "Switch community" anywhere else leaves the demo |

The database refuses real messages from a demo community and keeps payments in test mode; these are the app's own layer so that screens say
so instead of failing. Everything else (RSVPs, pledges, the store, learning, check-in for the volunteer person) works as for any member.

## Configuration

| Where | What |
| --- | --- |
| `EXPO_PUBLIC_DEMO_URL` | the portal that runs the demo (`https://admin.weaverams.org`); falls back to `EXPO_PUBLIC_PORTAL_URL`; with neither, **no button and no `/demo`** |
| `.github/workflows/deploy.yml` | sets it for the web build: repository variable `DEMO_URL`, else `PORTAL_URL`, else `https://admin.weaverams.org` |
| EAS | set `EXPO_PUBLIC_DEMO_URL` as an EAS environment variable (`preview`, `production`) **before** publishing an update or building: it is inlined when the JavaScript is bundled |

The portal calls carry no sign-in and no custom header (a plain GET and a JSON POST), so the browser build can make them from
`https://app.weaverams.org` under the portal's CORS rule (it must allow that origin, `content-type`, and `localhost` for development).

## The portal contract the app reads

The source of truth is connect-crm `docs/MEMBER_APP_DEMO.md`; what the app reads of it:

- `GET {demo}/api/demo/choices` → `{ ok, enabled, message?, communities: [ { kind: 'faith' | 'neutral', id, slug, name, people: [ { id, role, name, story, area: 'community' | 'operations' } ] } ] }`.
  `message` is the portal's own sentence when the demo is switched off or nothing is set up; the app shows it. A community without `slug`
  cannot be opened as a guest or have its people listed (the two quiet actions are left off its card), but it is still shown when it has a
  family person to start as; a community with neither is left out of step 1 ("not open to guests yet"). A person without `area` is shown
  in a plain list. The family person ("Start as a community member", `?as=family`) is the one whose `area` is `community` (an "Adult"
  role first); the app does not know any name or id. A 503 `{ ok: false, error, code: 'failed' }` is shown with the portal's `error` and Try again.
- `POST {demo}/api/demo/session` with `{ persona }` → `{ ok: true, session: { access_token, refresh_token, ... }, demo: { ends_at, role, name, community } }`
  or `{ ok: false, error, code }` where `code` is `off` (503), `limit` (429), `unknown_person` (404/400) or `failed`. The portal's `error`
  ("Could not start the demo — you have started a lot of demos in the last hour. ...") is shown **as it is**, because it is the wording
  of the portal's web flow; the app's own words (`startFailureMessage`) are used only when there is none, and for "could not reach the demo"
  and "the answer was not what we expected". A gateway's error body (no `ok: false`) is never shown.
- A guest look around works because the portal opens a demo community to guests while the demo is on (migration 0816). If that is not
  deployed yet, or the demo is switched off meanwhile, the guest community fails to open and the app says so in plain words with Try again
  and "Leave the demo" (the same screen as any community that cannot be opened), never a blank screen.
- Database: `app.demo_session_state()` (`state`: `ok`, `expired`, `off`, `unknown`, `not_demo`; with `ok`: `seconds_left`, `role`, `name`,
  `center_name`, `center_slug`) and `app.demo_leave()`. Both are in connect-crm migration 0679 and already in `database.types.ts`.

## Neutral words (1.20.1)

The demo communities are not Jain Centers, so the app speaks neutrally in them: **no Jain word, and no word of any one tradition, on any
screen** (owner, 2026-10-15). A faith community ("Sunrise Worship Center (Demo)", category `faith_other`: "Faith community") reads
"Welcome", "Learn", "Religious school" (or, as the demo has it, "Learning Center"), "Learning path" and "place of worship", never "Jai Jinendra", "My Jain Way", "Pathshala",
"Gyan Path", "derasar", "bolis", "labh", "tithi", "stavans" or "pachchakhan". It holds in the guest look-around and for every demo person
(the family adult, the center administrator, the treasurer, membership, an event lead, a teacher), in English, Gujarati and Hindi. How:
README "The words of each kind of organization"; `src/i18n/categories/neutral.ts`, `faith.ts`, `src/lib/wording.ts`. The demo
chooser's own words (`src/i18n/demo.ts`) never named a tradition.

What the app does not need from the database: the words are bundled, keyed by the profile's facts (`faith_based`) or its `wording_pack`.
`category_profile` may send `words` (a dictionary key to English text) or `layout.tradition_content` to say more for one category; it does
not have to. What the database must keep true for the demo to look right: `centers.tradition = 'other'` and no Jain library rows for the
demo communities (the Gyan Path, practice and panchang libraries are read for a tradition), and the category's `terms` as above.
`src/lib/__tests__/neutral-words.test.ts` and `neutral-code.test.ts` audit every string.

## OTA or native build

JavaScript only: a new route, screens, strings and provider, no new native module or permission, `runtimeVersion` stays `3`. It ships over
the air to installed phones (with `EXPO_PUBLIC_DEMO_URL` set in the EAS environment), and in the web build with the normal deploy. No new
APK is needed.

## Tests

`src/lib/__tests__/demo.test.ts` (rules, parsing, wording; the family person picked by area then role, `?as=family` / `?persona=` links),
`demo-address.test.ts` (cleaning the used link from the address bar), `demo-api.test.ts` (the portal calls and the two database calls, with
`fetch` and the client mocked), `src/providers/__tests__/demo-provider.test.tsx` (guest, person, switching between them, leaving, the
minute check, expiry, reload; the one-tap start, the deep links on a cold start and while running, unknown ids, failures and Try again, a
real sign-in left alone, the address cleaned), `src/features/__tests__/demo-ui.test.tsx` (the entry, both steps in every state, the
chooser screen wired to the provider, the banner, the limits).
