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
2. **Choose a demo community** (step 1, `DemoCommunityStepView`): the communities from `GET /api/demo/choices`, faith-based first.
   Tapping one opens it **at once as a guest** (no sign-in, no person asked for). The app does this through its normal community path:
   the demo provider's `slug` is what `communityToOpen` returns first, so `loadCenter(slug)` and every guest read is scoped to that
   community, and `AppProvider` reports `guest: true` (the app's existing guest mode: Home with the public events and the guest sign-in
   card, the guide, alerts, the store, per the community's access levels).
3. **Be someone in the demo** (step 2, `DemoPersonStepView`): from the guest strip, from any "Sign in" button in the guest app
   (`setGuest(false)` opens the people instead of the real sign-in), or from "Switch person". The people of the community being looked
   at come in two sections, **Community roles** first and **Non-profit operational roles** second, each a large card (role, name, one
   sentence). A portal that sends no `area` gets one plain list. **Start** calls `POST /api/demo/session`, stores the tokens with
   `supabase.auth.setSession` (the same client and storage as a normal sign-in), asks the database who the person is
   (`demo_session_state`: role, name, community, seconds left) and opens that community.
4. **Banner** (`src/features/demo/banner.tsx`, drawn by the root layout above the navigator, so on every screen):
   - guest: "Demo community · Looking around as a guest" · **Be someone in the demo** · **Leave the demo**;
   - person: "Demo · Teacher · 1 h 42 min left" · **Switch person** · **Look around as a guest** · **Leave the demo**.
5. **Leave the demo** (guest or person) goes back to "Find your community". For a person it tells the database (`demo_leave`), signs out
   on this device and forgets the demo. **Look around as a guest** does the same sign-out and keeps the community as a guest.

## Where the state lives

`src/providers/demo.tsx` (`DemoProvider`, above `AppProvider`) holds it; `useDemo()` is how the app knows:

| Field | Meaning |
| --- | --- |
| `mode` | `'off'`, `'guest'` (looking around, no sign-in) or `'person'` (signed in as a demo person) |
| `guest` / `active` | `mode === 'guest'` / `mode === 'person'` |
| `slug` | the community the demo opens (the guest's, or the person's from `demo_session_state`); `AppProvider` opens it whatever the address or the saved community |
| `chooser` | `'community'` (step 1), `'person'` (step 2) or `null` |
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
  cannot be opened as a guest and is left out of step 1 ("not open to guests yet"); a person without `area` is shown in a plain list. A 503
  `{ ok: false, error, code: 'failed' }` is shown with the portal's `error` and Try again.
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

## OTA or native build

JavaScript only: a new route, screens, strings and provider, no new native module or permission, `runtimeVersion` stays `3`. It ships over
the air to installed phones (with `EXPO_PUBLIC_DEMO_URL` set in the EAS environment), and in the web build with the normal deploy. No new
APK is needed.

## Tests

`src/lib/__tests__/demo.test.ts` (rules, parsing, wording), `demo-api.test.ts` (the portal calls and the two database calls, with `fetch`
and the client mocked), `src/providers/__tests__/demo-provider.test.tsx` (guest, person, switching between them, leaving, the minute check,
expiry, reload), `src/features/__tests__/demo-ui.test.tsx` (the entry, both steps in every state, the banner, the limits).
