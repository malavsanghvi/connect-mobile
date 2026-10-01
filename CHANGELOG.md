# Releases

Every release gets a version (`version` in `app.json`, kept equal to `package.json`). The version is shown in
**Settings › About** with the build number and, when an over-the-air update is running, the update's short id and
channel, for example `1.1.0 (build 12) · update 4f3a21c0 · preview`.

How a release is made:

1. Bump `version` in `app.json` and `package.json` (minor for features, patch for fixes) and add a section below.
2. **JavaScript-only changes:** publish an update with the version in its message:
   `npx eas-cli update --channel preview --environment preview --message "v1.1.0 · what changed"`.
   The running update carries its own `app.json`, so the phone shows the new version after it restarts.
3. **Native changes** (new native module, permissions, icon, `runtimeVersion` bump): build a new APK
   (`eas build --platform android --profile preview`). Builds auto-increment their build number on Expo's servers.
   Bump `runtimeVersion` when native code changes so an old build never receives JavaScript it cannot run.

## 1.5.3 — 2026-10-01

- Home (web): the row of shortcuts under Today at {center} scrolls sideways with the mouse wheel and shows its scrollbar;
  a mouse could not move it before. Phones swipe it as before.
- Sign-up: when no family is found for your email or mobile number, the screen is titled "Let's set up your family"
  instead of asking "Is this your family?" ("Finding your family" while it looks).

## 1.5.2 — 2026-10-01

- Events › Photos: photos brought in from a Google Photos album (portal › Content › Photos › the album › Import photos from
  Google Photos, then Approve all) show sharp: square tiles in the grid, a large picture in the viewer, a full-size copy when
  you save or share one.

## 1.5.1 — 2026-10-01

- Home: the guide card is now **My JSH** (your community's short name): WhatsApp groups, your zone, timings, volunteering,
  who's who. The same guide card is gone from 3L › Learn.
- 3L › Learn: **Teach at Pathshala** is removed; it is under volunteering in My JSH.

## 1.5.0 — 2026-10-01

- **Saathi is now called Circle** (My Jain Way › Today · 3L · Circle, and the sign-in, notification and encouragement wording).
- **Photo albums open straight away.** On Events › Photos, tapping an album card opens the album itself; an album whose
  photos are in an online album (a Google Photos link) and none in the app opens that online album directly. **Share,
  Download and Add** are on the card, so the extra album screen with the three buttons is gone (the album screen is just the
  photos, with a link to the full online album when there is one). An online-only album says "Online album" instead of "0 photos".

## 1.4.3 — 2026-10-01

- Menu: **Calendar moves below Satvik Store**, so the menu reads My Donations, Pathshala Connect, RSVP, Satvik Store, Calendar.

## 1.4.2 — 2026-10-01

- Menu: **My Donations, Pathshala Connect, RSVP, Satvik Store**, in that order (Calendar stays on top).
- Tapping **Events** (or any tab) on the bottom bar now opens it on its first pane, **Upcoming**; it used to reopen on Photos
  after you had been there. Tapping the tab you are already on brings it back from Photos.
- Events › Photos › an album whose photos are kept in an online album (a Google Photos link) no longer says "No photos in this
  album yet / be the first to add yours": it says the photos are in the online album and offers **Open the full album**.

## 1.4.1 — 2026-10-01

- Give › an opportunity › making it recurring is simpler: **one "Repeat this gift" switch** instead of the Give once / Make
  this recurring pair, then just **how often** in a single row (Weekly, Monthly, ... as the office allows). A sentence under
  it says what will happen ("$21 monthly for ... · first gift Oct 15, 2026 · until I stop · about $252 a year"). The start
  date, how long and card or bank are behind one **Change start date, length or payment method** link, with the usual
  defaults (soonest start, until I stop, card). Editing a gift you already have is unchanged.

## 1.4.0 — 2026-10-01

- **3L — Look, Listen, Learn** replaces the Learn and Library tabs of My Jain Way (Today · 3L · Saathi). Look: live darshan,
  videos, recipes (with a fully Jain filter) and event photos. Listen: My playlist, stavans, podcasts, audio lessons and the
  pachchakhan library. Learn: the Gyan Path, Pathshala and the community guide. Search, a heart on every item (it teaches
  the app what the community likes), and a mini player that keeps playing across screens.
- **Learn → Gyan Path opens your whole path** (the level map) for the goal you are on, with "Play" for the next level.
  (An earlier build of 3L jumped straight into a lesson.) The Learn shortcut on Home still goes straight to your next level.
- **Home shortcuts**: a row of round buttons under "Today at …" that scrolls sideways: Learn (your next level), My playlist
  (plays it; when it is empty, the most-liked stavans), Photos, Recipe (a random fully Jain recipe), Podcast (a random one)
  and **New here** (the welcome guide). The organization chooses which ones and in what order (portal › Settings › Member
  app › Home shortcuts); with nothing chosen, all six show.
- Home: the Photo albums card is gone (Photos is a shortcut and under Events); **the next event / RSVP card now sits above
  the giving card**.
- First sign-in shows only a progress bar (no "Step x of y"); the address step has type-ahead for state, ZIP and city;
  special days ask "Would you like to plan any?" first and let you pick a labh in the form (recorded as a pledge when you
  save); the Saathi family circle lists every family member, including those waiting for approval.
- Video and audio limits until the next store build: videos open in the browser on phones (inline video needs a new build),
  and audio stops when the app goes to the background.

## 1.3.0 — 2026-10-01

- First sign-in: two new steps for adults after "Your family". **Your family's special days** adds birthdays,
  anniversaries and other days (the same form as Family › Special days, with a reminder ahead of each one).
  **Join our WhatsApp groups** asks to join the community's groups (the same request as the welcome guide; an
  admin adds the number). Both are optional and skippable. The WhatsApp step is passed over when Communications is
  off or the community has no active group, and children go straight to contact preferences. Both screens are
  still available afterwards (Family › Special days, welcome guide › WhatsApp groups).
- Family tab (sandbox communities only): **Preview onboarding (nothing is saved)** walks an adult through every
  onboarding screen with each save and request skipped, a banner on each step and an "Exit preview" link.
  "Update family profile (onboarding)" is unchanged and still saves.

## 1.2.0 — 2026-10-01

- Family › Special days: "Plan labh" (the pledge options for the day) shows on every eligible day, not only in the
  two weeks before it. The delete icon stays beside it.
- Give: recurring is an option on each giving opportunity. Where the office has allowed it, the opportunity shows
  "Give once / Make this recurring" with the frequencies the office permits. The separate "Recurring giving" card
  is gone; "Your recurring gifts" (pause, change or stop) sits under Family pledges once you have one.
- Editing a recurring gift no longer has its own list to give towards: what a gift is for does not change from there.

## 1.1.0 — 2026-09-30

- RSVP: donation amounts for people added to an edited RSVP; cancelling a paid pledge asks whether to keep the
  money as credit for the treasurer (no refunds).
- Home: a Photo albums link.
- First sign-in: a home address step, and "A little more about you" (anniversary, dietary needs, emergency contact);
  both editable later from the profile.
- Event feedback: a pop-up after an event you attended or RSVP'd to, with points for answering; tapping the
  reminder notification opens the survey.
- Settings › About shows the version, build and update.

## 1.0.0

- First preview build.
