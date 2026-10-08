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

## 1.13.0 — 2026-10-08

- **Weaver for organizations that are not Jain.** A chamber of commerce, a community organization and a faith community of
  another tradition each get their own app, laid out and worded from the kind of organization they are: **nothing changes
  for JSH or any Jain community**. Home greets with "Welcome" and the date (no tithi, timings or darshan and puja doors),
  and the tabs follow the kind: Home, Events, Pay, My business for a chamber; Home, Events, Give, Family for a community
  organization; Home, Events, Give, Learn, Family for another faith (Learn shows while its library, religious school or
  learning path is on).
- **Words that fit.** About a hundred lines on the shared screens (the guide, Give and Pay, the store, Ask Niva, listening
  and watching, sign-up, the profile) are written for each kind with no "Jai Jinendra", tithi, puja or Pathshala in them:
  a chamber speaks of businesses, contacts, dues and sponsorships; another faith speaks of a place of worship, devotional
  music and its own religious school; a kind the app has never heard of starts from the neutral words. Where the
  dictionary says "Pathshala" or "Gyan Path" a faith community that names its school and learning path differently sees
  its own names, and a text that points at the Give or Family tab uses the names the kind gives them.
- **Topics and shortcuts of the kind.** Sign-up asks the topics that fit (a chamber: events, networking, volunteering,
  committees), skips "Plan special days" where the kind has none, offers birthdays and anniversaries by calendar date
  where there is no panchang, and a community that has not chosen its Home shortcuts starts with the ones that suit its
  kind (event photos and the guide; for another faith also Learn and podcasts). The administrator's own choice always wins.
- **Labh is its own part of the app.** A labh is offered with a special day only while the Labh module is on (it needs
  Pledges & donations); a chamber, a community organization and another faith never have it. This needs the database
  part that adds the module; until then every Jain community keeps its labh as before.
- A new kind of organization needs no app update to be laid out: the app reads its names, modules and layout from the
  database, and its words can come from there too.

## 1.12.0 — 2026-10-08

- **The app now knows what kind of organization a community is** (a Jain Center, a chamber of commerce, a community
  organization, a faith community of another tradition), and follows it while it is open. This is the groundwork for
  organizations that are not Jain: **nothing changes for JSH or any Jain community**, and an app of this version works
  with a database from before and after the change.
- **Changes show without an update.** What Community Connect or an organization's administrators change (the kind of
  organization, which parts of the app are switched on or off, the Home shortcuts, the access levels, the colours) now
  shows when the app comes back to the front after a short while, every few minutes while it stays open, and when a screen
  is pulled down to refresh. No new version or restart is needed.
- **No flash of the wrong screen.** The app knows its kind of organization from the same read that opens the community,
  and remembers the last answer for each community on the phone, so the right tabs are there on the first frame. A kind of
  organization it has never seen waits on a plain loading screen for its first answer instead of showing a layout that may be wrong.
- **Words and layout come from the organization.** Tabs, the Today card on Home, the special days, the topics asked at
  sign-up and the starting Home shortcuts follow what the organization's kind says; a kind the app does not know yet
  still gets a complete, neutral app.

## 1.11.0 — 2026-10-08

- **Register for Pathshala in the app.** An adult of the family registers several learners at once: children, and adults
  for the adult classes, themselves included. Choose who is joining (with their age on the term's cut-off date), a level
  for each (the suggested one first, with the reason), then check the fee line by line exactly as your community priced
  it (level fee, sibling discount, family cap, late fee) and **Register**. A child who is not on your family yet can be
  added in the same registration: the office adds them first and the registration keeps its time. Another adult learner
  agrees to the waiver in their own app; until then they have no seat and nothing is charged.
- **Pay later or pay now, as your community chose.** In a "pay later" term the fee is added to your family's pledges,
  each due on its own date (**Pay now** is optional). In a "pay when registering" term the Pay sheet opens at once, seats
  are held while you pay (with a countdown) and, when the term allows it, **Pay at the office instead** holds them for
  the office window. If the fee or a seat changed since you looked, you are shown the new lines before anything is saved,
  and a registration that was sent twice is never made twice.
- **Where each learner stands.** Jain Way › 3L › Learn says Registered, Seat held until …, Seat offered: pay by …,
  Waitlist, Waiting for membership, for the waiver or for the Pathshala office, and adults see the fee with **Pay**
  (children never see fees). Home shows "Pay to keep Riya's seat · 5 h left" while a seat is held. Pathshala
  notifications open the right screen.
- A community whose portal is not updated yet keeps the simple request form.
- A gift to a Pathshala campaign is recorded as an ordinary gift, never as a Pathshala fee.

## 1.10.0 — 2026-10-08

- **The app is now called Weaver.** Everything the app says about itself (Settings › About, the lock screen, permission
  and reminder messages, the calendar file) says Weaver instead of Community Connect. The new W logo is in the app icon,
  the Android adaptive icon, the splash screen and the web tab icon. The over-the-air update changes the words;
  **the name and icon on the phone's home screen, the splash screen and the Android notification settings change only
  with the next full app build**, because the phone fixes them when the app is installed. The web tab icon changes with
  the next web deploy.

## 1.9.5 — 2026-10-08

- **Fixed for good: "Watch live darshan" and "Do puja" on the Welcome screen open their screens.** The cause was in how
  the app is built: it rewrote the code that hands the chosen screen over so the screen was always empty (first a blank
  page, then nothing happening). The hand-over is now built so that cannot happen.
- **Fixed: coming back to the event after signing in, and reopening an event link after switching community.** Both used
  the same hand-over and would have failed the same way (an error right after signing in, or after switching community
  from a flyer's link).

## 1.9.4 — 2026-10-08

- **Fixed again: "Watch live darshan" and "Do puja" on the Welcome screen now really open their screens.** In 1.9.3 the
  app asked too early, while it was still switching into guest mode, and the request was silently dropped. It now waits a
  moment, checks that the screen opened and asks again if it did not; if it still cannot, you stay on Home.


## 1.9.3 — 2026-10-08

- **Fixed: "Watch live darshan" and "Do puja" on the Welcome screen now open their screens.** 1.9.2 stopped the blank
  page but waited for a signal that never arrived, so you stayed on Home. The app now just tries again for a few seconds
  until the screen opens; if it still cannot, you stay on Home.

## 1.9.2 — 2026-10-08

- **Fixed: "Watch live darshan" and "Do puja" on the Welcome screen led to a blank page** on the web app. The screen is
  now opened a moment after you enter guest mode, once the app is ready for it, and tried again if it is not; if it still
  cannot open you stay on Home instead of seeing a blank page. The same two buttons on Home were never affected.

## 1.9.1 — 2026-10-07

- **Niva is in the bottom bar.** The floating Niva button that sat over the cards is gone. Niva is now the sixth item of
  the bottom bar, after Family, wherever the bar shows; tap it to open the chat (its suggested questions are there), and
  it is highlighted while the chat is open. It shows for the same people as before: not for a visitor, and not below the
  access level your organization sets for Ask Niva.
- **Smaller cards on Home.** Event posters are now thumbnails, about three and a half across on a phone instead of two and a
  half (a lone event is no longer a screenful). Events without a flyer keep the date, name and venue in smaller type; the
  time is on the event itself. Giving opportunities are compact cards, with no empty gap above the amount, so the next one
  peeks in. The Special days row is unchanged.


## 1.9.0 — 2026-10-07

- **Choose your organization.** The first screen for a new install now has a dropdown of the organizations, so you no
  longer need to search or have a join code. Until an organization is live, the ones still being set up are listed too
  (marked **Sandbox**); once one is live, only live organizations are listed, with no change needed.
- **One web address per organization.** On the web app, `jsh.weaverams.org` opens JSH directly and
  `app.weaverams.org` shows the list of organizations; choosing one goes to its own address. **Switch community** on an
  organization's address goes back to that list. Phones and any other address work exactly as before.
- Members sign in once per address (the browser keeps the sign-in per website).

## 1.8.0 — 2026-10-06

- **Homework.** When your community sets homework on a Gyan Path level, it shows under the lesson's first step, on the
  goal map and on the level-complete screen, with its due date, points and status. Open it to read what to do and answer
  with a photo from your library, a voice note (up to 10 minutes), a written answer, or all three; save a draft, then
  **Hand in**. Every part is uploaded as you add it; one that fails says so and offers **Try again** (unless the file
  can't be used for homework, and then it says why), and nothing is handed in until every part is in. A level's points
  now say when they are waiting for homework your teacher has to accept.
- **A parent's OK.** When the homework asks for it, a child's own hand-in waits for a parent: adults see **Needs your OK**
  on Home and a homework line under each child on Family, read the answer, and send it to the teacher or back to the
  child with a note. A parent can also do the homework for a younger child from the same screen.
- **The teacher's answer.** Accepted homework shows its points (with a little celebration for the learner, the first
  time); homework sent back shows the teacher's note and **Edit and hand in again**. Homework your community has closed
  stays readable but can't be changed. Pushes about homework open the right screen.
- **Attach a file** and **Take a photo** arrive with the next app build (they need a new install, not only an update).
- Until the community's portal is updated, nothing about homework is shown.

## 1.7.0 — 2026-10-03

- **Choose how to pay.** When your community takes cards and PayPal, the Pay sheet lists both and you choose. Card shows
  that Apple Pay and Google Pay appear on the card page when your phone supports them; PayPal shows Venmo when PayPal
  offers it. Zelle, check, cash and the other ways to give are under **Other ways to give**. As before, the app never
  marks anything paid: the provider confirms it, and if it can't be confirmed in time the sheet says so honestly.
- **Zelle: copy the address, then say you sent it.** Zelle now shows the address with a **Copy** button (on a phone it
  opens the share sheet, whose Copy puts it on your clipboard), the name to look for in your bank app and the memo to write.
  After you send it in your bank app, tap **I sent it**: the amount, the date, the confirmation number (asked for, never
  required), the name your bank shows, and the pledges it is for. Reporting a Zelle is for adults only.
- **Your Zelle reports** are listed on Give with a **Reported** chip, and a **Reported** chip also appears on the pledges
  they name. A report is **never counted as given**, in any total or statement, until the treasurer matches it at the
  bank, and then it gets a receipt. If it isn't on the bank statement after the community's window (10 days to start
  with), it says **Not seen at the bank** and you are told. A report that is still waiting can be withdrawn.
- In a sandbox, Zelle never shows the real address: it says "Sandbox: no real money moves" and offers **Report a test
  payment**.
- Problems are said in plain English next to what you did ("Could not send your report — ..."), with **Try again**.
- Until the community's portal is updated, the app keeps the Pay sheet and How to give exactly as before (one online
  provider, Zelle as plain instructions, no reports).

## 1.6.9 — 2026-10-03

- **A new Home, in rows.** Every row slides sideways with the next tile peeking in, and a sliver of the previous one once
  you swipe. There are no scrollbars and nothing moves by itself. In order:
  - **Today at JSH** (the timings, Watch live darshan, Do puja) with **My Jain Way** beside it: today's progress, your
    points and streak. Tap it for the full list.
  - **Plan a special day**: a tile for each special day in the next two months, with Plan a labh. The row is hidden when
    there are none.
  - **Events**: poster tiles with your family's RSVP status under each (RSVP, Going, Waitlisted, Not going, and so on).
    Events in date order; one that needs your confirmation comes first.
  - **Giving opportunities**: a tile for each one, with View and sponsor.
  - **Life@JSH**: New here?, WhatsApp groups, Your zone, Timings, Volunteering, Who's who and Special days.
  - **Learn & listen**: Continue learning, My playlist, Podcasts, Recipes and Photos.
- This replaces the round shortcut buttons, the Up next card, the rotating Giving card, the Plan a special day card and
  the My JSH card. Feedback requests and today's lunch times sit just under the first row; only urgent alerts stay above
  Today.
- A tile you can't use (the community turned it off, or it needs a membership level you don't have) is left out. If a row
  can't load, it says so with **Try again**.
- Changed: **Not this year** is no longer on Home (use **Show on Home** under Family › Special days). **Please confirm**
  opens the confirm screen, and the Still coming? pop-up is unchanged. The one-tap random recipe and podcast buttons are
  gone from Home. The community's Home-shortcut order no longer changes the order on Home; which tiles show still follows
  it.
- Continue learning loads a short summary instead of every lesson, and pictures further along a row load as you reach
  them.

## 1.6.8 — 2026-10-02

- **Live darshan and the virtual puja without signing in.** The Welcome screen has a new **Without signing in** section
  with **Watch live darshan** and **Do puja**, and visitors see the same two buttons on Home's Today card. A button shows
  only when the community has something behind it (a stream or an aarti time; the Navang puja lesson). A visitor's puja
  records nothing and ends with **Sign in to earn puja points**.
- **Each community decides who can use each area**: live darshan, the puja, the guide, Listen, Look, Learn and Ask Niva
  (in the portal, Settings › Access levels). Below the level, the app says why. A visitor sees **Sign in to use …** with
  a Sign in button. A member sees "… is available to Life member and above. Ask the office about membership."
- The **Ask Niva** button is hidden when Niva isn't open to you.
- A library item follows the area of what it is (stavans and podcasts are Listen, videos and recipes are Look), whatever
  link opened it.
- If the app can't tell what you can use, it says so with **Try again** instead of guessing. Until the portal update is
  live, the app keeps the rules from before.

## 1.6.7 — 2026-10-02

- **Sign in with a password**, for the demo account that testers and app reviewers use. Under "Send code" on the email
  sign-in screen, **Have a password? Sign in with it** opens an email and password form. Members still sign in with a
  code and have no password, so this opens nothing for them. A wrong pair says plainly that they don't match, and offers
  **Sign in with a code instead**.

## 1.6.6 — 2026-10-02

- **A new Home.** In order:
  - **Today** (sunrise, navkarsi, chauvihar, Watch live darshan, Do puja);
  - the **shortcuts** as a grid;
  - **Up next**;
  - **Giving**;
  - **Plan a special day**;
  - **My Jain Way**.
- **Shortcuts** no longer scroll sideways. They sit in a grid that lines up with the cards: 3 to a row on a phone, more on
  wider screens.
- **Up next** is one card instead of four. It holds the RSVP to confirm, today's lunch times, the next event (with RSVP if
  your family hasn't replied) and a special day coming up (Choose a labh, or Not this year).
- **Giving** shows every open opportunity in turn:
  - it moves every 6 seconds;
  - you can swipe, use the ‹ › buttons, or the arrow keys on the web;
  - it pauses while you touch it, and doesn't move on its own with Reduce Motion or a screen reader on.
- **Plan a special day** shows your family's next birthday, anniversary or other day, with **Plan a labh**. With no days
  saved it offers **Add a special day**. Special days stay on Home even where giving is off; they then offer See special
  days instead of a labh.

## 1.6.5 — 2026-10-02

- **Puja spots are chandan.** On the murti photo, in the virtual puja and in the Navang puja lesson:
  - each place still to touch is a chandan ring;
  - the place to touch now glows in chandan;
  - a place already touched fills with chandan, like a tilak applied.

  No green any more. "Do it again" is deep chandan too.

## 1.6.4 — 2026-10-02

- **Virtual puja.** **Do puja** sits under Watch live darshan on Home's Today card. It goes straight to the Navang puja
  of Mahavir Swami on the derasar photo: touch the places in order ("Touch 1 of 13"), and a wrong touch shows the right
  spot. A completed puja is a practice try and earns the usual points (up to the community's daily limit).
- **Learning when you need it.** "Learn the order" is always under the photo. After two wrong touches, or with "I'm not
  sure", the puja offers to teach it step by step, then brings you back to your puja where you left off.
- Also opens from a link: connect://puja (or /puja on the web).

## 1.6.3 — 2026-10-02

- **Ask Niva from more places.** An **Ask Niva** tile on the Guide ("Quick answers, with sources"), an **Ask Niva** item in
  the menu, and a "Try asking Niva first" link at the top of Guide › Ask a question. They show only while the
  community has Niva switched on.
- **Niva's sources are links.** A source that came from the community's website opens in the in-app browser. If it can't
  open, the reason shows under the sources and tapping again retries.
- Questions staff ask in the portal's Niva test box no longer appear in their own Niva history in the app.

## 1.6.2 — 2026-10-02

- **Event flyers.** An event with a flyer shows it on its screen, under the title. Tap it for a full-screen view.
  **Share** sends it to WhatsApp, Messages and other apps; **Save** puts it in your photos, or downloads it on the web.
  If the flyer can't load, the card says so in plain English with **Try again**.
- Guests who aren't signed in see the flyer of events open to guests or the public. Members-only events keep their
  flyer private.
- The QR code on a printed or shared flyer opens that event in the app, in its own community. If you're in another
  community, the app asks before switching, then brings you back to the event. After you sign in, you also return to
  the event.

## 1.6.1 — 2026-10-01

- **Niva shows the answer when it arrives.** After you ask, Niva says "Looking that up for you…" (with a spinner) and
  checks every few seconds while the chat is open and the app is in front. The answer appears as soon as it is ready,
  formatted, with its sources, and its text can be selected and copied. TalkBack and VoiceOver read out each change: looking,
  the answer, or that Niva can't answer. It no longer says "still being set up" the moment a question is saved, and you no
  longer have to leave and reopen the chat to see an answer. Pull down (on a phone), or come back to the chat or the app (on
  the web, the browser tab), to pick up an answer that arrived later.
- **When Niva can't answer** (it found nothing in the approved content, or after a minute and a half without an answer) it
  says: "Currently we are unable to answer your question. Please leave your contact details and we would try to connect as
  soon as possible." **Send to the team** opens Ask a question with your question already filled in. If messages to the
  team are switched off for the community, it says to contact the office instead. If the app couldn't check for the
  answer (no connection), it says so, with **Check again**, rather than saying Niva can't answer.
- **New suggested questions** that the community's approved content can answer: derasar timings, address and parking,
  becoming a member, signing a child up for Pathshala and upcoming events. "Am I eligible to vote?" is gone (Niva never sees
  your own records), and so are the questions about today and this weekend.
- The question box stays at the bottom of the chat, and the chat scrolls to the newest message. Send and the suggestions
  wait while a question is being saved, and the same question sent twice within a few seconds (a double tap) is saved only
  once, so it counts once towards the community's monthly Niva questions; the box keeps your text and says "You've just
  asked that". A question that wasn't saved can be sent again straight away. The box now says "Ask your question in
  English".
- "You are not a member of this community" and "The Niva module is switched off for this community" are shown as they
  are, instead of a general "You don't have permission" message.
- JavaScript only: runtime stays 3, so this reaches the 1.6.0 build over the air.

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
