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

## 1.6.0 — 2026-10-01 · needs a new build (runtime 3)

- **Gyan Path lessons are interactive.** Each step has its own screen:
  - **Cards** to swipe through (read steps, and practice steps with their own done button, e.g. "I sat calmly for 5
    minutes"). The dots, "Card 2 of 3" and the Next button follow your swipe on the web too; with a screen reader only the
    card on screen is read, and Next and Back say which card you are on. A card picture that can't load says so, with
    Retry (a picture from the community's own library gets a fresh link first, so one tap is enough).
  - **Five quiz types:** pick one (a wrong first pick gets one more try, then the "why"), true or false, put in order
    (tap to arrange), match the pairs (tap left, then right) and pick the missing word. With a screen reader, match says
    which column a word is in and what each tap did; in put in order a placed item stays in the list, greyed out, so the
    focus doesn't jump away.
  - **Learn Puja · Navang puja of Mahavir Swami:** the photo of the murti at our derasar (it replaces the drawing), with
    glowing spots. *Learn* shows one touch at a time with what to do and why ("Puja 3 of 9"); *Practice* asks for every
    touch in order — a wrong touch shakes and the right spot glows. Practise as often as you like, but **Continue comes
    only after a good try** (no more wrong touches than the lesson allows, 2 unless it says otherwise); after a try with
    more, Practise again is the main button. A touch goes to the nearest spot still to be touched, so on a small phone
    the shikha you just touched no longer takes a touch meant for the forehead (in Learn and in Practice). With a screen
    reader, Practice reads the spots row by row, left to right, not in the answer order. If the picture can't be shown,
    the spots become a list of buttons, so the step can still be done.
  - **Screen readers** (VoiceOver and TalkBack) hear each result as it appears: a line or say it all, a practice try's
    points, the Navang notes and the match-the-pairs notes.
  - **Navkar Mantra out loud:** listen to each line (the phone reads it in Hindi, or in English letters when it has no
    Hindi voice), say it back while the phone listens, see the words to practise in red, then say it all. Listening uses
    the phone's own speech recognition and asks for the microphone first, in plain English; the app keeps only the score.
    **Say it all is fair:** the ways phones often write the words (ऐसो or ऐसे, सब, लोये, "5" for पंच) count as right, and
    leaving out whole lines is not a pass. A pass earns stars by how much you said (up to 3); continuing without speaking,
    or without a pass, is 1 star and still finishes the step (not every phone can listen). **Android 12 and below:** say
    it all keeps listening through the pauses between lines until you tap the microphone to finish, and a phone that is
    briefly busy between lines keeps what it already heard. On the **web**, a blocked microphone says to allow it with
    the icon in the browser's address bar. If the phone doesn't stop when you tap the microphone to finish, it stops by
    itself a few seconds later instead of staying on "Listening…".
- **Points for every activity.** "+10 points" when you finish a step for the first time, and each good practice try (Navang
  practice, Navkar say it all) earns more, up to 10 tries a day per activity ("+3 points · 4 of 10 today"; after that:
  "Today's practice points are done — keep practising!"). When the community sets the daily limit to 0, tries earn no
  points and there is no counter. A try sent again after a lost connection counts once. Finishing a level shows the points
  it actually paid, with its bonus and treasure, and never fewer stars for a step than you already had. Confetti and a
  small buzz on right, wrong and complete (no confetti or bouncing with Reduce Motion on).
- New native parts (speech recognition, text-to-speech, haptics) and the speech-recognition permission: **runtime 3**, so
  this release needs the new Android build; JavaScript updates then reach it over the air again.

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
