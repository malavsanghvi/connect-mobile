# Member app — prototype spec (source: JSH App Prototype › Main.dc.html, Sep 2026)

**Source:** JSH App Prototype artifact › project/Main.dc.html (2,309 lines, 267,113 bytes). A single-file prototype: a 390×844 phone frame of declarative HTML (`<sc-if>` / `<sc-for>` template tags bound to `{{…}}` values) plus one JS class `Component extends DCLogic` whose `_rv()` derives every bound value from `this.state`. All names, dates and amounts are labelled sample data; the persona is **Priya Shah**, primary adult of the **Shah family** (life members), on **Tue, Sep 22, 2026 (Bhadarva sud 11)**.

Sibling files referenced by `href` but not part of this file: `Welcome.dc.html` (JSH guide/directory), `Onboarding.dc.html` (family onboarding), `GyanPath.dc.html` (learning path), `CommunityDashboard.dc.html`, `support.js`. Logo asset: `/_blob/a1dd82e9a84c0fed764dfa5f9c43fad9`.

---

## 1. App shell and navigation model

### 1.1 Routing state
Navigation is a small state machine, not a router:

| State key | Values | Meaning |
|---|---|---|
| `tab` | `home` · `events` · `give` · `learn` · `family` | Bottom-nav tab |
| `view` | `''` (tab root) · `card` · `event` · `tickets` · `confirm` · `feedback` · `album` · `opp` · `paid` · `bolis` · `boli` · `hall` · `pledges` · `recurring` · `recsetup` · `days` · `labh` · `person` · `store` · `cart` · `settings` · `legal` · `sync` · `myway` · `pach` · `niva` | Pushed screen inside the tab |
| `evTab` | 0 Upcoming · 1 Calendar · 2 Photos | Events sub-tab |
| `jwTab` | 0 Today · 1 Learn · 2 Saathi · 3 Library | My Jain Way sub-tab |
| `pop` | `''` · `push` · `inapp` · `fbpush` · `famcel` · `famhelp` · `lunchpush` · `daypush` | Full-screen notification mocks / in-app popup |
| `sheet` | bool | Payment bottom sheet |
| `cf` | `''` · `deactivate` · `delete` · `signout` | Confirm dialog |
| `menu` | bool | Left drawer |
| `fab` | bool | Niva FAB quick-menu open |
| `photo` | −1 or index | Photo viewer (only meaningful when `view==='album'`) |
| `kid` | bool | "Preview as Dev (14)" — child access mode |
| `popToast` | string | Green toast at top (auto-clears after 2.0–2.6 s) |

**Initial state of note:** `pop: 'push'` — the prototype *opens on the RSVP push-notification lock-screen mock*; `rsvpDone: true`, `confirm: ''`, `going: [true, true, false, true]` (Priya, Rahul, Anya going; Dev not), `tab: 'home'`.

### 1.2 Header (always present)
- Left: **hamburger** (`openMenu`) when `view === ''`; **back** (`back`) when a view is pushed.
- Centre: on Home root, logo + "JAIN SOCIETY / OF HOUSTON" wordmark; otherwise the screen title (Fraunces 22/600 navy).
- Right: **member-card QR button** (`openCard` → `view:'card'`), always.
- Red "PROTOTYPE · SAMPLE DATA" pill pinned top-centre.

**Title map:** tabs → `home:'JSH', events:'Events', give:'Give', learn:'My Jain Way', family:'Family'`. Views → `card:'Member card', event:'RSVP', tickets:'Your tickets', opp:'Sponsor', paid:'Thank you', confirm:'Confirm attendance', feedback:'Event feedback', days:'Special days', labh:'Birthday labh', recurring:'Recurring giving', recsetup:'New recurring gift', settings:'Settings', legal: 'Privacy policy'|'Terms of use', store:'Satvik Store', cart:'Your order', sync:'Saving', album:'Photo album', pledges:'Family pledges', person:'Profile', hall:'In-person boli', bolis:'Bolis', boli:'Make a pledge', pach:'Pachchakhan', myway:'My Jain Way', niva:'JSH Niva'`.

**Back rule:** `boli`/`hall` → `bolis`; `recsetup` → `recurring`; `labh` → `days`; everything else → tab root (`view:''`). Tab stays as-is.

### 1.3 Bottom nav (76 px, 5 equal columns)
Home · Events · Give · **Jain Way** (tab key `learn`) · Family. Active colour `#1B2C5C`, inactive `#8A8478`. Tapping sets `tab` and clears `view`.

### 1.4 Overlays (z-order top to bottom)
Photo viewer → push-mock screens → in-app popup → confirm dialog → pay sheet → drawer → Niva FAB menu → cart bar → toast. **FAB visibility rule** (`showFab`): hidden when drawer open, any `pop` set, any `cf` set, `sheet` open, `photo ≥ 0`, or `view ∈ {settings, legal, niva, sync, store, cart, card}`.

### 1.5 Child (kid) mode
When `kid === true`, `renderVals()` post-processes: `askConfirm`, `isPush`, `isInApp` forced off; if `(view==='' && tab==='give')` or `view ∈ {cart, event, tickets, confirm, opp, bolis, boli, pledges, paid, sync}` → all those screen flags are cleared and **`isLocked` = true** (the "Ask a parent" screen renders instead). Also hidden for kids: Saathi help card (`showHelp`), birthday-labh card, home lunch card. Drawer identity line becomes "Dev Shah · Shah family".

---

## 2. Screen inventory (navigation order)

### 2.1 Home (`tab:'home', view:''`)
Vertical stack, gap 16:
1. **Account deactivated banner** (only `acct==='deactivated'`): "Account deactivated / Notifications are paused" + **Reactivate**.
2. **Today at JSH card** (`showToday`): greeting "Jai Jinendra, Shah family", "Today at JSH", "Tue, Sep 22 · Bhadarva sud 11"; 3 tiles **Sunrise 7:14 AM · Navkarsi 8:02 AM · Chauvihar 7:21 PM**; button "● Watch live darshan · Aarti at 4:30 PM" → `goLearn`. Close (×) collapses it to a one-line greeting with "Show Today at JSH".
3. **My Jain Way card** → `openMyWay` (learn/Today): title, `{doneN} of {n} done`, progress bar, flame + `{streak}-day streak · {totalPts} JSH points`, `wayNext` ("Next: {practice} · {time}" or "All practices done today · anumodana!").
4. **Feedback requested card** (`!fb.done`): "FEEDBACK REQUESTED · 2 minutes · anonymous if you like", "How was Paryushan Mahaparva 2026?", **Share feedback** → `openFeedback`.
5. **Lunch card** (`checkedIn && rsvpDone && !kid`, green): "TODAY · TAPASVI BAHUMAN · CHECKED IN 10:42 AM", "Your lunch times", one line per lunch group (names → time), "Reminder 5 minutes before · now serving 12:00 PM slot" → tickets.
6. **Special-day labh card** (`!labhOff && !kid`, amber border): "IN 2 WEEKS · SPECIAL DAY / Tue, Oct 6", "Anya turns 10", copy, **Choose a labh** → `family/labh`, **Not this year** → `labhOff`.
7. **Please-confirm card** (`rsvpDone && confirm===''`, navy border): "PLEASE CONFIRM / Sent Sat 10 AM · 24 hrs before", "Still coming to Tapasvi Bahuman tomorrow?", "{N} people on your RSVP · confirming helps the kitchen plan meals", **Yes, we're coming** (`confirm:'confirmed'`), **Change or cancel** → `events/confirm`.
8. **Satvik Store banner** (dark green) → `openStore`: "JSH SATVIK STORE / Fresh Jain mithai and namkeen, made to order / Order by Thursday for weekend pickup · gift packing available".
9. **New giving opportunity** (amber tint): "Sponsor the Swamivatsalya at Tapasvi Bahuman", "Platinum $5,000 · Gold $2,500 · Silver $1,000", **View and sponsor** → `openOpp0` (give/opp #0).
10. **Upcoming event row**: date block SEP 27, "Tapasvi Bahuman", subtitle varies (`RSVP open · Sun 10 AM` / `{N} attending · Sun 10 AM` / `{N} confirmed · Sun 10 AM` / `You cancelled · RSVP again anytime`); **RSVP** button when not RSVP'd, chevron otherwise → `openTickets` (tickets if done else event).
11. **Guide link** → `Welcome.dc.html`: "New to JSH? Start here / WhatsApp groups, your zone, timings, volunteering, who's who".
12. **PROTOTYPE TOUR panel** (dashed): links/buttons that drive demo state: See the onboarding experience (`Onboarding.dc.html`); Preview as Dev (14) · child access / Back to adult view (`toggleKid`); RSVP reminder · phone notification (`demoPush`); RSVP reminder · in-app pop-up (`demoInApp`); Special day reminder · 2 weeks before (`demoDayPush`); Simulate check-in at the event / Reset check-in (`demoCheckin`); Lunch reminder · 5 minutes before (`demoLunchPush`); Family celebration · notification (`demoCelebPush`); Event feedback request · notification (`demoFbPush`); Support a family member · notification (`demoHelpPush`); Start RSVP from scratch (`demoRsvpReset`).
13. Footer note "Prototype · all names, dates and amounts are sample data".

### 2.2 Events tab (`tab:'events', view:''`)
Segmented control **Upcoming | Calendar | Photos**.

**Upcoming (`evTab 0`)**
- Event cards (88 px colour band with white date chip, Fraunces name, place line, status line):
  - Tapasvi Bahuman & Swamivatsalya · Sun, Sep 27 · Stafford Center · 10 AM · band `#7A2E1F` · status derived from RSVP state (`RSVP open` / `{N} attending · tickets ready` / `{N} confirmed · tickets ready` / `RSVP cancelled · seats released`) → opens `tickets` if RSVP'd else `event`.
  - Youth garba night · Sat, Oct 10 · Jain Center · 7 PM · band `#2F5D50` · "RSVP open" → `event`.
  - Diwali puja & new year · Sun, Nov 8 · Derasar · 6 PM · band `#1B2C5C` · "RSVP opens Oct 15" (grey) → `event`.
- **Past event photos** row: "{albumCount} albums · latest: Mahavir Janma Vanchan" → `evTab 2`.
- **Feedback row** (purple tint): "Share feedback on a recent event" / "Feedback sent · thank you" + "Paryushan Mahaparva 2026 · you attended" → `feedback`.

**Calendar (`evTab 1`)**
- "SHOW CALENDARS" layer chips (toggle): **Jain tithi** `#C9731C`, **Pathshala** `#5B4B8A`, **JSH events** `#7A2E1F`. "School calendars": **Katy ISD** `#1F7A4D`, **Fort Bend ISD** `#1B5E9C`, **Cy-Fair ISD** `#9C1B5E`, **Houston ISD** `#5E5A52`. Defaults on: jain, path, ev, katy.
- Month card: ‹ › nav (clamped **Sep–Nov 2026**), "{Month} 2026", Jain month line e.g. "Bhadarva – Aso · Vir Samvat 2552", DOW row S M T W T F S, 6×7 grid (row 6 dropped if empty). Cell = day number, tithi short label (`Sud 11`, `Vad 3`, `Punam`, `Amas`; only when jain layer on), up to 4 colour dots. Selected day: navy bg, white text. Today (Sep 22): `#FBEBD7` bg + `1.5px solid #C9731C` ring.
- Selected-day panel: weekday/date title + long tithi; item cards with 4 px colour bar, title, "sub · Layer label"; empty state "Nothing on the selected calendars this day".
- **Add these calendars to my phone** (unwired). Disclaimer about panchang/ISD sync.

**Photos (`evTab 2`)** — 2-column album grid: mosaic of 3 palette swatches, name, date, "{photos} photos · {videos} videos" → `album` view.

### 2.3 Event detail / RSVP (`view:'event'`)
- Band `#7A2E1F` "Tapasvi Bahuman & Swamivatsalya"; "Sun, Sep 27 · 10:00 AM – 2:00 PM / Stafford Center · Directions".
- **Who's coming?** — one checkbox row per household member (name + tag). Dashed placeholders **+ Add guest** and **Senior / assistance** (static, unwired).
- **Commit a donation (Optional)** — segmented **None | Per person | Lump sum**. Per person amounts `$3 $5 $7`; lump sum `$10 $25 $50 Other` (Other reveals `$` number input, default 101). Math line "$X × N people" or "One amount for the family", total. Then **Pay now | Add as pledge**.
- CTA: "Select who is coming" (0 selected) / "RSVP N people[ · commit $T]" / "Update RSVP · N people…" when already RSVP'd → `submitRsvp`.

### 2.4 Tickets (`view:'tickets'`)
- Green "You're all set" banner: "{N} tickets added · attendance confirmed | we will ask you to confirm 24 hours before".
- **Donation committed** card (if `commit`): "Donation committed · $T", "{how} · {id} · paid, receipt emailed | open pledge on your account", **Pay now** if unpaid → pay sheet (`payCtx:'rsvpLater'`).
- One ticket row per going member (QR glyph, name, "Ticket · Tapasvi Bahuman").
- **Lunch after the program** card: header "Sun, Sep 27 · starts 12:00 PM" or "Checked in at 10:42 AM · Sun, Sep 27". Pending: explanation of slot rules. Ready: one row per lunch group (time, tag `Lunch starts`/`Assigned slot`/`You moved`, names, why), "Dining hall · we'll notify you 5 minutes before each slot · now serving: 12:00 PM slot", and if an "others" group exists: "Missed it or staying for the program? Join any later slot" chips (12:45 PM … 1:45 PM).
- **Add to Apple Wallet** (black, unwired), **Share with family on WhatsApp** (unwired), **Change RSVP** → `event`.

### 2.5 Confirm attendance (`view:'confirm'`)
Band `#7A2E1F`, "Tomorrow · Sun, Sep 27 · 10 AM · Stafford Center"; "Untick anyone who can't come. Please reply by Sat 9 PM."; member checkboxes; CTA "Confirm N people" (or "Select who is coming") → `confirm:'confirmed'`, goes to tickets; **We can't make it · release our seats** → `rsvpDone:false, confirm:'cancelled', commit:null`, home; note "No reply? We send one more nudge at 6 PM. Your tickets stay valid either way."

### 2.6 Photo album (`view:'album'`) and viewer
Band in album colour, name, "{date} · {photos} photos · {videos} videos"; buttons **Share / Download / Add yours** (unwired); 3-column grid of 15 placeholder tiles (every tile where `i % 7 === 4` carries a "VIDEO" badge) → viewer. **Viewer** (full-screen black): close, album name, "{i} of {photos+videos}", 480 px placeholder, **‹ Prev / Share / Save / Next ›** (Share/Save unwired).

### 2.7 Event feedback (`view:'feedback'`)
Band `#5B4B8A` "EVENT FEEDBACK · SEP 8–16 / Paryushan Mahaparva 2026". Form: overall 1–5 stars; "Rate each part" — **Program and pravachan · Food and bhojanshala · Organization and check-in · Venue and parking**, each **Poor/Fair/Good/Great/Superb**; NPS 0–10 ("Not likely … Very likely"); "What did you attend?" multi-chips **Pratikraman · Pravachan · Kids program · Bhojanshala · Samvatsari**; optional textarea; **Submit anonymously** toggle with explanatory note; submit button (disabled grey until stars chosen). Done state: green "Thank you for your feedback" + anonymity note.

### 2.8 Give tab (`tab:'give', view:''`)
1. Navy hero: "Your family's giving in 2026 / **$1,240** / Tax statement ready in January".
2. **Bolis** row (amber): "3 open for pledges · 2 in-person only" → `bolis`.
3. **Open opportunities** — 3 cards (name, "From $…", sub, progress bar): Swamivatsalya sponsorship (55%), Diwali aarti & pujans (25%), New temple construction (41%) → `opp`.
4. **Recurring giving** row: "{active} active · ${yearly} a year" → `recurring`.
5. **Family pledges** card: tiles "Open balance · {n} open / ${open}" and "Paid in 2026 / ${paid}"; **See all pledges · open and closed** → `pledges`.
6. **Pay open balance · $X** (if any open) → pay sheet (`payCtx:'pledges'`, all open ids).

### 2.9 Bolis list (`view:'bolis'`)
- "Pledge in the app" — "Pledge at or above the floor until the cutoff. The highest pledge receives the labh." Cards: name, event, **Floor / Top pledge / Closes** triple, status line → `boli` (sets `bid` to current minimum).
- "In-person only" — "Called live in the hall. The labh is recorded in your pledges after the event." Rows (dashed): name, when, **About** → `hall`, **Remind me / Reminder set** toggle.

### 2.10 Boli pledge (`view:'boli'`)
Band `#8A4608`: name, event, "Pledging closes {cutoff} · {left} left". Explainer card: 96×72 video thumb with duration (`playInfo` toggles "Playing explainer video…"), "WHAT IS THIS BOLI?", text, **Read more / Show less**. Stats **Floor / Top pledge / Pledges**. Status banner (green/red/amber). "Your pledge" stepper **− $bid +**, "Minimum right now $min · steps of $21". CTA **Pledge $bid**. Demo link "simulate another family pledging more". Note "You'll be notified if another family pledges more. If you receive the labh, pay your pledge anytime."

### 2.11 In-person boli (`view:'hall'`)
Band `#5E3106` "IN-PERSON ONLY", name, when; same explainer card; note "This boli is called live in the hall. Be present to take part; the highest pledge receives the labh and is added to that family's pledges."; **Remind me before it is called / Reminder set · tap to remove**.

### 2.12 Opportunity (`view:'opp'`)
Band `#8A4608` name; description; availability card ("{slots}" + "Live availability" + progress). Then by `kind`:
- `tier` — "Choose a sponsorship level", 3 columns: Platinum $5,000 · Gold $2,500 · Silver $1,000.
- `amount` — "Choose an amount", 2 columns: $10,000 · $25,000 · $50,000 · Other (→ "Your amount" input, default 5000).
- `multi` — "Choose the pujans your family will take": 8 checkbox rows (amount, "Fixed boli" or "Already taken by another family" disabled), footer "{n} pujans selected / $total".
Checkbox "Show our family's name with this seva" (checked, unbound). **Commit $X as a pledge** → `oppPledge`; **Pay $X now** → pay sheet (`payCtx:''`). Footnote "Pledges appear in Family pledges · pay anytime · tax receipt on payment".

### 2.13 Thank you (`view:'paid'`)
Big green ✓, "Anumodana!", "Your $X gift is received. A tax receipt is on its way to your email.", **Back to Give**.

### 2.14 Family pledges (`view:'pledges'`)
Year chips **All years · 2026 · 2025 · 2024**; tiles "Open balance $X / {n} open" and "Paid · all years | Paid in {year} $Y / {closed} closed overall"; filter **All | Open | Closed**; per-year group header (chevron expand — only collapsible in All-years mode — year in Fraunces 22, "{n} pledges · pledged $A · paid $B", right button "Statement in Jan" (2026) or "{year} tax statement ↓" (toast "emailed to priya.shah@example.com")); pledge rows: checkbox (open only), name, sub, "By {who} · {date} · {id}", amount, status pill "Open"/"Paid {date}"; empty state "No pledges match this filter"; CTA "Pay N pledges · $S" / "Select open pledges to pay" (grey when none); footer "Shows pledges by all adult family members. Members under 18 don't see pledges."

### 2.15 Recurring giving (`view:'recurring'`)
Green tile "Recurring giving this year / $Y / {a} active of {n}"; rows: purpose, "{Freq} · since {start} · {pay}", amount, Active/Paused, **Pause/Resume**, **Edit** (unwired); **Set up a recurring gift** → `recsetup`.

### 2.16 New recurring gift (`view:'recsetup'`)
"Give towards" (6 purpose cards with sub-line) · "Amount each time" $11 $21 $51 $108 Other (custom input default 75) · "How often" Monthly / Quarterly / Yearly / On family special days · "Starting" Oct 1, 2026 / Oct 15, 2026 / Next special day · "For how long" Until I stop / 12 gifts / Through 2027 · "Pay with" Visa ···· 4417 / Bank account (ACH) · summary sentence ("$51 monthly for Jeevdaya · first gift Oct 1, 2026 · until I stop · about $612 a year[ (7 family special days)]") · **Start recurring gift** · "Pause, change or stop anytime · receipts after each gift".

### 2.17 My Jain Way (`tab:'learn'`; `view:'myway'` forces the Today pane without sub-tabs)
Sticky segmented control **Today | Learn | Saathi | Library** (red dot on Saathi while `!helpDone || anuSent.length < 2`).

**Today**
- Navy hero: "Today · Bhadarva sud 11", "{done} of {n} done" (Fraunces 26), right: "JSH points {total} / +{today} today", progress bar, flame row "{streak}-day streak" + sub ("Best streak: 21 days · keep going tomorrow" / "Finish today's practices to make it N days"), 7-circle week row (S M T W T F S; first two days ticked, today ticked only when all done).
- Day-complete banner (green): "Day complete · anumodana! / Streak extended to N days · +20 completion bonus".
- "Your standing this month · Private to you": per category "Top X%" bar + "{n} practices in your Jain Way · {done} done today".
- "Reminders arrive 10 minutes before each practice."
- Practice rows (sorted by time): tick circle, name, "{time} · {category}", "+{pts}" pill, bell icon.
- **+ Add or remove practices / Done adding** → catalog list of all 10 practices with Add/Added toggles.

**Learn**
- Gyan Path card → `GyanPath.dc.html`: badge "5", "GYAN PATH · LEVEL 5 OF 12", "Learn Samayik · Iriyavahiyam sutra", "Continue your path · 10 min today".
- "Pathshala" card: "Dev · Level 3 — Enrolled — Sundays 10:00 AM · attendance by QR at class"; "Anya · Level 1 · Complete enrollment (#enroll)".
- "Listen and learn": Navkar Mantra, explained (Jainism 1 · 6 min); Why we do Pratikraman (Jainism 3 · 11 min); Gujarati reading, lesson 4 (Gujarati 1 · 9 min).

**Saathi**
- Intro "Celebrate each other's progress… Anumodana earns you 5 points, support earns 3."
- **Family circle** card: 4 members (initial avatar, name, status, goal line, progress bar).
- **Celebration cards** (amber): "CELEBRATE · {when}", tag, headline, others line, **Send anumodana · +5 points / Anumodana sent ✓**.
- **Be Dev's Saathi** card (purple, adults only): "Dev hasn't practiced Logassa for 3 days", rationale, 3 selectable message templates, **Send · +3 points**, **Practice together tonight**; sent state shows confirmation copy.

**Library**
- Live darshan player (LIVE badge, "Derasar camera · Aarti at 4:30 PM").
- **Pachchakhan library** — 9 rows (name, when) → `pach`.
- JSH guide and directory link → `Welcome.dc.html`.

### 2.18 Pachchakhan detail (`view:'pach'`)
Navy band (name, when), description, "Sutra" card with placeholder "[Pachchakhan sutra text, supplied and reviewed by JSH Pathshala]", **Listen to the recitation** (unwired), **Remind me today / Reminder set · tap to remove**, note "For guidance on your own tapasya, please consult a guruji or Pathshala teacher."

### 2.19 JSH Niva chat (`view:'niva'`)
Chat bubbles (assistant left/white, user right/navy), "Source: …" line under sourced answers, "Try asking" chips (unasked questions only), input "Ask in English, Gujarati or Hindi" + send (input unwired; chips drive the conversation), footer "Niva answers from JSH-approved content and shows its sources. Doctrinal questions are referred to Pathshala teachers."

**Niva FAB** (bottom-right, saffron): "Niva"/"Close"; open state shows a 290 px card "Ask JSH Niva / Timings, events, bolis, membership and practices", first 3 QA chips, **Open chat**.

### 2.20 Family tab (`tab:'family', view:''`)
1. **Special days** preview (amber; first 2 rows "title — when") → `days`.
2. Member list: initial avatar, name, "{tag} · {id}", **Profile** → `person`, **QR** → `card`. Link "Update family profile (onboarding)" → `Onboarding.dc.html`.
3. **Voting eligibility · In good standing** (green): ✓ Life membership over 180 days · ✓ Maintenance fees paid through 2025 · ✓ No prior-year pledges outstanding.
4. Note: "Contact, language and notification preferences are set per person. Tap Profile next to any family member."
5. "JSH guide, help and requests" → `Welcome.dc.html`; "Sign out" (plain text, unwired here).

### 2.21 Person profile (`view:'person'`)
- Navy header: initial, name, "{rel} · {age} · {id}", **QR** → card.
- **Details**: Date of birth, Relationship (text inputs, unbound), Gender chips **Female / Male / Prefer not to say**; adults also: Profession, Mobile, Emails list (tags Primary / Work), **+ Add another email**.
- Adults: **How to reach {first}** multi-select **Phone call / Text / SMS / WhatsApp / Email**; "Best time to call" **Morning / Afternoon / Evening**; "App language" **English / ગુજરાતી / हिन्दी**.
- Adults: **Notifications for {first}** toggles: Events and reminders · Giving opportunities and bolis · Pathshala updates · Daily temple timings.
- Children: note "Messages about {first} go to parents. Members under 18 can view events, learn and use My Jain Way; RSVPs, bolis and pledges are managed by adult family members."
- Adults: **Community connections** — toggle "Open to questions from new members" (sub: verified members who joined in the last 12 months), channels **In-app message / WhatsApp / Phone call**, note "Mobile number and email stay hidden until {first} replies."; toggle "Share my expertise" → 9 expertise tags, "One-line headline" input, "Visible to" **All verified members / New members only**, disclaimer "Guidance is shared in a personal capacity and isn't endorsed by JSH. You can pause your listing anytime."
- **Interests** chips: Events · Pathshala · Volunteering · Youth programs · Seniors · Giving opportunities.
- **Save changes** → "✓ Saved to JSH record" (any pref change resets to unsaved).

### 2.22 Special days (`view:'days'`)
Intro copy; rows: month/day tile tinted by kind, title, sub, reminder line ("Reminder sent · 2 weeks before" if ≤14 days else "Reminder 2 weeks before · {when}"), **Plan labh** button when `inDays ≤ 14`. **+ Add a special day / Close** reveals form: Whose (Priya/Rahul/Dev/Anya/Someone else) · Occasion (Birthday/Anniversary/Birth tithi/Punyatithi/Other) · Remember it by (Calendar date/Jain tithi — switches the date field label/default "Nov 20" ↔ "Kartak sud 12") · Remind me (1 week/2 weeks/1 month) · **Save special day** (appends row "{who}'s {type} · … · added by you", toast).

### 2.23 Birthday labh (`view:'labh'`)
Band `#8A4608` "TUE, OCT 6 · {tithi}" / "Anya's 10th birthday" / "Choose one or more ways to mark the day"; 6 checkbox options with amounts; "{n} labhs selected / $total"; "Dedication (shown at the derasar and to the Pathshala class)" input default "In honor of Anya Shah's 10th birthday"; toggle **Repeat every year on her birthday** ("Adds a yearly recurring commitment, reminded 2 weeks before"); **Commit $T as a pledge** (grey if 0) → `labhPledge`; **Pay $T now** → pay sheet.

### 2.24 Member card (`view:'card'`)
Navy card: "JAIN SOCIETY OF HOUSTON", member name (Fraunces 24), "{tag} · {id}", white QR panel (21×21 module grid, 189 px, deterministic per member), "Refreshes every 30 seconds · works offline"; member pill switcher (Priya/Rahul/Dev/Anya); **Add family cards to Apple Wallet** (unwired).

### 2.25 Satvik Store (`view:'store'`)
Hero `#2F5D50`: "JSH Satvik Store / Made to order in the Jain Center kitchen. No onion, garlic or root vegetables. / Order by Thu 9 PM · pickup Sat or Sun". Category chips **All / Mithai / Namkeen / Meals**. Item cards: 72 px colour thumb, name, desc, price; **Add to order** → becomes **− qty +** plus **Gift pack +$2.99 / Gift packed ✓** toggle. Floating **cart bar** ("View order · N items / $total") when `cartCount > 0` → `cart`.

### 2.26 Your order (`view:'cart'`)
Lines "{name} × {q} / $line", "$unit each[ + gift packing $2.99 each]", −/+ and gift toggle; **+ Add more items**; "Gift card message (optional)" input when any gift; **Pickup at Jain Center** options: Sat, Sep 26 · 11 AM – 1 PM / Sat, Sep 26 · 5 – 7 PM / Sun, Sep 27 · after Tapasvi Bahuman; totals "Items (N)", "Gift packing (G × $2.99)", "Total"; **Pay $T with Apple Pay** → pay sheet (`payCtx:'store'`); "Made fresh for your order · cancel up to 24 hours before pickup".

### 2.27 Settings (`view:'settings'`, via drawer)
Header card: avatar "P", Priya Shah, "priya.shah@example.com · (713) 555-0142", status pill Active/Deactivated.
- **ACCOUNT**: Profile and family → family tab · Sign-in and security ("Email one-time code, change email or mobile", noop) · Face ID sign-in toggle · Signed-in devices ("This iPhone · last used today", noop).
- **NOTIFICATIONS**: Push notifications toggle ("Master switch for all alerts") · Quiet hours toggle ("No alerts 9 PM – 7 AM, except event-day reminders") · Notification topics ("Set per person in each profile") → family.
- **APP PREFERENCES**: Language (English/ગુજરાતી/हिन्दी) · Text size (Standard/Large/Largest) · Appearance (Light/Dark/System; default System).
- **PRIVACY**: Use location for daily timings toggle · Share anonymous usage data toggle · Show my family in the member directory toggle ("Name and zone only, visible to members") · Download my data (toast "export will be emailed within 24 hours") · Privacy policy → legal · Terms of use → legal.
- **PAYMENTS**: Saved payment methods ("Visa ···· 4417 · Apple Pay", noop) · Receipts and tax statements ("Emailed to priya.shah@example.com") → pledges.
- **SUPPORT**: Help and FAQs · Contact JSH · Report a problem · About this app ("Version 1.0.0 (build 42) · open-source licenses") — all noop.
- **ACCOUNT STATUS**: explanatory copy + **Deactivate account** (or "Your account is deactivated…" + **Reactivate account**); **Delete app account** (red text).
- **Sign out**.
Each destructive action opens the **confirm dialog** (title/body/CTA colour vary; see rules).

### 2.28 Legal (`view:'legal'`, `legal: 'privacy'|'terms'`)
"Last updated [date] · draft for JSH review"; 5 section cards (see §3.25 for section headings); footer "[Final text to be approved by the JSH Executive Committee and legal counsel]".

### 2.29 Saving / sync (`view:'sync'`)
Logo, title ("Saving your RSVP", etc.), "Please keep the app open"; step rows with state icon (✓ done green / … current amber / pending grey); on completion green "Saved to your JSH account" + result text + CTA (e.g. "See your tickets"); prototype note: "each step is a Neon CRM API call: household lookup, event registration, pledge on the household account, payment recorded against the pledge (which then syncs to QuickBooks), and Neon's email receipt."

### 2.30 Locked (`isLocked`, kid mode)
Lock icon, "Ask a parent", "RSVPs, bolis, donations and pledges are managed by adult family members. You can still see events, learn, and keep up your Jain Way.", **Back to Home**.

### 2.31 Drawer menu (`menu`)
304 px panel: logo, close, "Jain Society of Houston", identity line "Priya Shah · Shah family · Life members" (or Dev in kid mode). Items: **Calendar** ("Tithi, Pathshala, events and school dates") → events/Calendar · **Pathshala Connect** ("Classes, attendance and teachers") → learn/Learn · **My Donations** ("Pledges, payments and receipts") → pledges · **Satvik Store** → store · **RSVP** ("Upcoming events and your tickets") → events/Upcoming. Links: **Community dashboard** → `CommunityDashboard.dc.html`, **New to JSH guide and help** → `Welcome.dc.html`. Footer: **Settings** ("Account, privacy and app preferences"), "JSH app · version 1.0.0".

### 2.32 Payment sheet (`sheet`)
Bottom sheet: "Pay" + Cancel; rows **To** Jain Society of Houston · **For** `{payFor}` · **Card** Visa ···· 4417 · **Total** `{payAmount}`; **Confirm with Face ID** → `confirmPay` (branches on `payCtx`, see §4.6).

### 2.33 Confirm dialog (`cf`)
Centered modal: title, body, coloured primary (red delete / brown deactivate / navy sign-out), **Cancel**.

### 2.34 Notification mocks (lock-screen style, `pop`)
All share: dark `#1C2433` screen, date line, 84 px clock, JSH notification card (logo, "JSH"/"JSH · Family circle", "now", title, body), footer hint, **Dismiss**.
- `push` — Sat, Sep 26 · 10:00 · "Still coming to Tapasvi Bahuman tomorrow?" / "{N} people on your RSVP. Tap to confirm so the kitchen can plan meals." Actions **Yes, we're coming** (confirms, toast) · **Change or cancel** → confirm view. Tapping card → in-app popup.
- `inapp` — modal with maroon header "TOMORROW · PLEASE CONFIRM / Tapasvi Bahuman & Swamivatsalya / Sun, Sep 27 · 10 AM · Stafford Center", going-member chips, **Yes, we're coming**, **Change or cancel**, **Remind me later**.
- `fbpush` — Thu, Sep 17 · 10:30 · "How was Paryushan Mahaparva?" / "A 2-minute survey helps the event team. You can answer anonymously." → feedback.
- `famcel` — Tue, Sep 22 · 4:10 · "Anya finished Learn Navkar Mantra!" / "All 9 levels done. Send anumodana and celebrate with her." Action **Send anumodana · +5 points**.
- `famhelp` — Tue, Sep 22 · 6:30 · "Dev could use your support" / "He hasn't practiced Logassa for 3 days. You cheered him on before, so a word from you could help." Action **Encourage Dev** → Saathi.
- `lunchpush` — Sun, Sep 27 · clock = 5 min before slot · "Lunch in 5 minutes" / slot + names body → tickets.
- `daypush` — Tue, Sep 22 · 9:00 · "Anya turns 10 in 2 weeks" / "Mark Tue, Oct 6 with a puja, a gift for her Pathshala class or a jeevdaya donation." → labh.

### 2.35 Toast (`popToast`)
Green bar at top 76 px; messages include "✓ Confirmed · N people attending", "Anumodana sent · +5 JSH points", "Encouragement sent to Dev · +3 JSH points", "Invite sent · Gyan Path together at 8:30 PM", "✓ Checked in at 10:42 AM · lunch times assigned", "✓ Special day saved · reminder {x} before", "✓ {year} giving statement emailed to …", "✓ Your data export will be emailed within 24 hours", "✓ Welcome back · your account is active", "✓ Deletion request received · confirmation by email", "✓ Signed out (prototype stays open)", "✓ Feedback sent[ anonymously]".

---

## 3. Data entities (fields and sample values from the JS state)

### 3.1 Household
`name: 'Shah family'`, membership tier `'Life members'`, CRM account (Neon), `givingYtd: 1240` (2026), voting eligibility flags (`lifeMembershipOver180Days`, `maintenanceFeesPaidThrough: 2025`, `noPriorYearPledgesOutstanding`), directory visibility (name + zone only), zone (referenced in guide copy), saved payment methods (`Visa ···· 4417`, `Apple Pay`, `Bank account (ACH)`), primary contact email `priya.shah@example.com`, phone `(713) 555-0142`.

### 3.2 Person (household member)
| Field | Sample |
|---|---|
| `id` | JSH-10421 (Priya), JSH-10422 (Rahul), JSH-10423 (Dev), JSH-10424 (Anya) |
| `name`, `first`, `initial` | Priya Shah … |
| `tag` | 'Primary · Life member', 'Spouse · Life member', 'Child · 14', 'Child · 9' |
| `rel` | Primary / Spouse / Son / Daughter |
| `age` | 41 / 43 / 14 / 9 (`adult = age ≥ 18`) |
| `dob` | 03/14/1985 · 07/02/1983 · 05/09/2012 · 11/21/2016 |
| `job` | Software engineer · Physician · '' · '' |
| `phone` | (713) 555-0142 · (713) 555-0188 |
| `mails[]` | ['priya.shah@example.com','priya@work-example.com'], ['rahul.shah@example.com','rahul@clinic-example.com'], [], [] |
| `prefs.gender` | 0 Female · 1 Male · 2 Prefer not to say |
| `prefs.emails` | number of emails shown (1–2; first tagged Primary, second Work) |
| `prefs.ch[4]` | contact channels [Phone call, Text/SMS, WhatsApp, Email] |
| `prefs.time` | 0 Morning · 1 Afternoon · 2 Evening |
| `prefs.lang` | 0 English · 1 Gujarati · 2 Hindi |
| `prefs.notif[4]` | [Events and reminders, Giving opportunities and bolis, Pathshala updates, Daily temple timings] |
| `prefs.topics[6]` | [Events, Pathshala, Volunteering, Youth programs, Seniors, Giving opportunities] |
| `prefs.nb` | `{on, ch:[In-app message, WhatsApp, Phone call]}` — open to new-member questions (defaults: Priya on/[t,t,f]; Rahul off/[t,f,f]) |
| `prefs.ex` | `{on, tags[9], head, vis}` — expertise listing; tags = Medicine and health · Law · Tax and accounting · Finance and investing · Real estate · Engineering and tech · Education and careers · Business and startups · Arts and music; `vis` 0 All verified members · 1 New members only. Defaults: Priya on, tags Engineering+Education, head 'Software engineer · happy to guide students on tech careers'; Rahul on, Medicine, 'Physician · general health questions and pre-med guidance' |
| Pathshala | Dev: Level 3, Enrolled, Sundays 10:00 AM; Anya: Level 1, enrollment incomplete |

### 3.3 Event
`name`, `when` ('Sun, Sep 27'), `place` ('Stafford Center · 10 AM'), `band` colour, `status`/`statusColor`, full time range ('10:00 AM – 2:00 PM'), venue + directions link, RSVP window ('RSVP open' / 'RSVP opens Oct 15'), lunch service (yes for Tapasvi Bahuman), linked bolis, linked sponsorship opportunity, feedback survey (Paryushan: window Sep 8–16), photo album.

### 3.4 RSVP
`going[4]` per member, `count`, `rsvpDone`, `confirm ∈ {'', 'confirmed', 'cancelled'}`, guests (placeholder), senior/assistance flag (placeholder), donation commitment (`commit`), tickets (one per going member), confirmation-request timing (24 h before; Sat 10 AM; nudge 6 PM), reply-by (Sat 9 PM).

### 3.5 Donation commitment on RSVP (`commit`)
`{ id: 'JSH-PL-24817', total, paid: bool, how: '$5 per person × 3' | 'Family lump sum' }`; inputs `donMode` (0 None, 1 Per person, 2 Lump sum), `donIdx`, `custom`/`customRaw` (default 101), `payNow` (true Pay now / false Add as pledge).

### 3.6 Ticket
Per going member: member name, event, QR, wallet pass; summary "{N} tickets added"; state `attendance confirmed | pending confirmation`.

### 3.7 Check-in and LunchSlot
`checkedIn`, `arriveTime '10:42 AM'`, arrival rank `#87`, `SLOTS = ['12:00 PM','12:15 PM','12:30 PM','12:45 PM','1:00 PM','1:15 PM','1:30 PM','1:45 PM']`, `autoSlot = 3` (12:45 PM), `lateSlot` (−1 = assigned), `AGES [41,43,14,9]`. Lunch group: `{time, tag, names, why, color}`; `nowServing '12:00 PM slot'`.

### 3.8 Giving opportunity
```
{ kind: 'tier'|'multi'|'amount', name, sub, amount (label), pct, slots, desc }
```
- Swamivatsalya sponsorship — tier — 'Tapasvi Bahuman · Sep 27 · Platinum, Gold, Silver' — From $1,000 — 55% — '11 families have sponsored so far'. `TIERS = Platinum 5000 · Gold 2500 · Silver 1000`.
- Diwali aarti & pujans — multi — 'Nov 8 · 8 pujans · choose any' — From $51 — 25% — '2 of 8 pujans already taken'. `PUJ`: Pehli aarti 251 · Mangal divo 151 · Nirvan laddu arpan 501 (taken) · Gautam Swami pujan 251 · Sharda (chopda) pujan 108 · Shanti kalash 108 (taken) · Dhoop pujan 51 · Deepak pujan 51.
- New temple construction — amount — 'Founders Circle · $10K, $25K, $50K or your amount' — From $10K — 41% — '41% of campaign goal'. `BUILD = [10000, 25000, 50000]` + Other.
Detail string stored on pledge: '{Tier} sponsor' | comma-joined pujan names | 'Founders Circle'. Option "Show our family's name with this seva".

### 3.9 Pledge
```
{ id: 'JSH-PL-#####', name, sub, by: 'Priya'|'Rahul', date: 'Sep 12, 2026', amt, paid: '' | 'Apr 12, 2026' }
```
Seed rows: JSH-PL-24650 Paryushan boli · Aarti / Paryushan 2026 / Priya / Sep 12, 2026 / 151 / open · JSH-PL-23011 Derasar construction / Founders Circle campaign / Rahul / Apr 17, 2026 / 500 / open · JSH-PL-22190 Mahavir Janma Kalyanak / General fund / Priya / Apr 10, 2026 / 101 / paid Apr 12, 2026 · JSH-PL-21544 Pathshala annual fund / Pathshala / Priya / Jan 18, 2026 / 108 / paid Jan 18, 2026 · JSH-PL-20873 Diwali boli · Pehli aarti / Diwali 2025 / Rahul / Oct 20, 2025 / 251 / paid Nov 2, 2025 · JSH-PL-20412 Swamivatsalya sponsor / Tapasvi Bahuman 2025 / Priya / Sep 28, 2025 / 251 / paid Oct 1, 2025 · JSH-PL-19105 Paryushan boli · Swapna / Paryushan 2024 / Rahul / Sep 5, 2024 / 501 / paid Sep 30, 2024 · JSH-PL-18377 Derasar land fund / New temple campaign / Priya / Mar 16, 2024 / 1000 / paid Apr 2, 2024. Runtime-added pledges get ids `JSH-PL-{24900 + n}`; RSVP commitment is `JSH-PL-24817`. Derived: `status Open|Paid`, per-year totals, tax statement per year.

### 3.10 Payment
`{ payCtx: ''|'rsvp'|'rsvpLater'|'store'|'pledges', payFor, payAmount, payIds[], method: 'Visa ···· 4417' | 'Apple Pay', auth: 'Face ID' }`; outcome: pledge(s) closed with paid date, tax receipt emailed, sync to QuickBooks via Neon.

### 3.11 Boli (digital)
Static: `{ name, event, floor, cutoff, left }` — Swamivatsalya labh / Tapasvi Bahuman · Sun, Sep 27 / 501 / 'Sat, Sep 26 · 9 PM' / '4 days' · Tapasvi tilak labh / same / 251 / same / '4 days' · Pehli aarti, Diwali / Diwali puja · Sun, Nov 8 / 108 / 'Thu, Nov 5 · 9 PM' / '44 days'. Live: `bolis[i] = { top, count, mine }` (seed: {751,6,0}, {0,0,0}, {151,3,0}); `bid` (seed 772). Explainer `INFO[i] = { len:'1:00', text, more }`. Reminder/outbid notifications.

### 3.12 Hall boli (in-person)
`{ name, when, len, text, more }` — Snatra puja kalash / 'Tapasvi Bahuman · called about 11:30 AM' / '1:10' · Mangal divo / 'Diwali puja · called about 7:00 PM' / '0:40'. `hallRemind[2]`.

### 3.13 Pachchakhan
`{ name, when, what }` ×9: Navkarsi ('48 minutes after sunrise · today 8:02 AM') · Porsi ('One prahar after sunrise · about 10:20 AM today') · Sadh-porsi · Purimaddh ('Midday · about 1:15 PM today') · Ekasana · Biyasana · Ayambil · Upvas · Chauvihar ('Before sunset · today by 7:21 PM'). Plus sutra text and recitation audio (placeholders); `pachRemind[]`.

### 3.14 Practice (ritual) and points
`R = { name, time, m (minute of day), c (category), p (points) }`:
Navkar Mantra on waking 6:45 AM c0 5 · Navkarsi pachchakhan By 8:02 AM c1 10 · Darshan at derasar 8:30 AM c2 10 · Ashtaprakari puja 9:00 AM c2 20 · Samayik (48 min) 6:00 PM c3 20 · Swadhyay reading 6:30 PM c4 10 · Chauvihar Before 7:21 PM c1 15 · Evening pratikraman 7:45 PM c3 25 · Navkarvali (108 mala) 9:30 PM c0 15 · Gyan Path · Learn Samayik (10 min) 8:30 PM c4 20.
`CATS = ['Mantra & jaap','Tapasya & pachchakhan','Darshan & puja','Samayik & pratikraman','Swadhyay & learning']`, `CAT_BASE = [18,27,34,9,41]` (monthly standing baseline top-%). User state: `way[10]` (selected; seed 7 of 10), `done[10]`. Points ledger: base 1240, `todayPts`, completion bonus 20, anumodana 5 each, saathi support 3; streak 11 (best 21). Gyan Path: level 5 of 12, "Learn Samayik · Iriyavahiyam sutra".

### 3.15 Family circle / celebration / saathi
Circle member `{ name, initial, tint, goal, status, stColor, pct }` (You · Rahul 23-day streak · Anya completed Navkar Mantra 9 levels · Dev Logassa level 7 of 10, 3 days behind). Celebration `{ k, when, tag, headline, others }` (anya, rahul). Saathi help: `helpMsgs[3]`, `helpPick`, `helpDone`, `together`, `anuSent[]`.

### 3.16 Lesson
`{ name, sub }` — Navkar Mantra, explained (Jainism 1 · 6 min) · Why we do Pratikraman (Jainism 3 · 11 min) · Gujarati reading, lesson 4 (Gujarati 1 · 9 min).

### 3.17 Niva QA
`{ q, a, src }` ×5 (derasar hours; weekend events; voting eligibility; life membership $501 one-time, EC approval; Ayambil food). `niva[]` = asked indices.

### 3.18 SpecialDay
`{ title, sub, mon, day, inDays, kind }`; `kind` 0 birthday · 1 anniversary · 2 birth tithi · 3 punyatithi · 4 user-added. Seed: Anya's birthday (Oct 6, 14 d) · Late Kantaben Shah · punyatithi (Rahul's mother · Aso vad 6 · Oct 30, 38 d) · Priya's birth tithi (Kartak sud 5 · Gyan Panchami · Nov 13, 52 d) · Priya & Rahul's anniversary (18 years · Dec 5, 74 d) · Priya's birthday (Mar 14, 173 d) · Dev's birthday (Turns 15 · May 9, 229 d) · Rahul's birthday (Jul 2, 283 d). Add-form fields: who, occasion, remember-by (calendar|tithi), date/tithi string, remind (1 week|2 weeks|1 month). Tint by kind: `[{#FBEBD7,#8A4608},{#FBE3E1,#9C1B5E},{#EEF1F8,#1B2C5C},{#EDE6DA,#5E5A52},{#E4F2EA,#1F7A4D}]`.

### 3.19 Labh option (birthday)
`{ name, sub, a }`: Snatra puja at the derasar 51 · Ashtaprakari puja 108 · Gift for her Pathshala class 151 · Jeevdaya donation 51 · Sponsor Sunday bhojanshala 251 · Sadharmik bhakti 108. State `lbSel[]` (seed [0,2]), `lbRepeat`, dedication text, `labhOff`.

### 3.20 Recurring gift
`{ purpose, amt, freq (0 Monthly·1 Quarterly·2 Yearly·3 On family special days), start, pay, paused }`; seed: Derasar upkeep $21 monthly since Aug 1, 2026 Visa. Setup vocab: purposes `RP` (Jeevdaya · Derasar upkeep · Pathshala · Bhojanshala · New temple construction · Sadharmik bhakti, each with sub), amounts `RA=[11,21,51,108,Other]`, per-year multiplier `RFn=[12,4,1,7]`, starts `RS`, durations `RD`, methods `RPay`.

### 3.21 Album / Photo
`{ name, date, photos, videos, band, pal[4] }` ×6 (Mahavir Janma Vanchan 2026 · Paryushan Mahaparva 2026 · JSH Republic Day performances · Mehta Foundation land gift · Diwali Mahotsav · Tapasvi Bahuman & Bhakti Bhavna). Photo: index, `video` flag.

### 3.22 StoreItem / Order
`{ name, desc, price, cat (1 Mithai·2 Namkeen·3 Meals), color }` ×15 (Mohanthal 8.99 … Dal dhokli 8.99 — full list in the source file's `SI` array). Cart: `qty[15]`, `giftQ[15]`, gift-pack fee 2.99/unit, `pickup` index, gift message; order id `JSH-S-1042`.

### 3.23 Calendar
Layers `{ k, label, color }`; `ITEMS['m-d'] = [{ layer, title, sub }]`; tithi `{ short, long, n, sud, mon }` from `tithiOf(m,d)`; era 'Vir Samvat 2552'.

### 3.24 Feedback response
`{ stars 1–5, cats[4] 1–5, nps 0–10, att[] , text, anon, done }` (seed att [Pratikraman, Pravachan, Bhojanshala], anon true).

### 3.25 App settings / account
`st = { face, push, quiet, loc, analytics, dir, lang, text, theme }` (seed: face t, push t, quiet t, loc t, analytics f, dir f, lang 0, text 0, theme 2 System); `acct ∈ {active, deactivated}`; device list; app version 1.0.0 (build 42); legal texts (privacy: What we collect · How we use it · Children · Sharing · Your choices; terms: Using the app · Pledges and payments · Store orders · Community conduct · Changes).

### 3.26 Notification
Types seen: RSVP confirmation (push + in-app), lunch-slot reminder (5 min), special-day reminder (2 weeks), practice reminders (10 min), boli outbid, hall-boli "before it is called", pachchakhan today, family celebration, family support request, event feedback request, statement/export emails. Per-person topic opt-ins; master push switch; quiet hours.

### 3.27 Sync job
`{ syncTitle, syncSteps[], syncAt, syncResult, syncNext (state to apply), syncCta }`.

---

## 4. Business rules visible in the code

### 4.1 Eligibility / access
- **Adult = age ≥ 18.** Under-18 members cannot RSVP, pledge, bid, buy or pay; they can view events, learn, use My Jain Way and see their card. Locked screens show "Ask a parent". Notifications about a child go to parents.
- Pledges list shows pledges by **all adult members**; children never see pledges.
- Voting: life membership held > 180 days, maintenance fees paid through prior year, no prior-year pledges open; ballots go to **both** eligible life-member spouses. Life membership is a one-time **$501**, effective on Executive Committee approval.
- "Open to questions from new members" targets verified members who joined in the last 12 months; contact details hidden until the member replies. Expertise listing is personal capacity, not JSH-endorsed, pausable.

### 4.2 RSVP and confirmation
- RSVP requires ≥ 1 selected member. Donation is optional; `dTotal = perUnit × count` (per person) or `unit` (lump sum; custom amount = `max(0, round(parseFloat))`).
- Submit paths: no donation → sync "Saving your RSVP" (household lookup → register N → email tickets) → tickets. Donation + *Add as pledge* → creates open pledge `JSH-PL-24817` → sync → tickets. Donation + *Pay now* → pay sheet (`rsvp`) → on confirm the pledge is created **and closed** in the same sync ("Recording Visa payment and closing the pledge", "Emailing tickets and tax receipt").
- Confirmation request goes out **24 h before** (Sat 10 AM for a Sun 10 AM event) by push and in-app; reply-by Sat 9 PM; **one more nudge at 6 PM**; tickets remain valid without a reply. "Yes" sets `confirm:'confirmed'`. "We can't make it" cancels the RSVP, releases seats and drops any unpaid commitment.
- Status copy: `{N} attending` before confirmation, `{N} confirmed` after.

### 4.3 Lunch-slot assignment (Tapasvi Bahuman)
- 8 slots every 15 min from **12:00 PM to 1:45 PM**; slot assigned **at check-in** (QR).
- If **any attending member is under 12**, the **whole family** eats together in the 12:00 PM "Lunch starts" slot. Otherwise members **≥ 65** get 12:00 PM ("senior"); everyone else is an "others" group assigned by **arrival time, then RSVP order** (sample: checked in 10:42 AM, #87 by arrival → 12:45 PM).
- The "others" group may **move to any later slot** (12:45 PM onward); choosing the assigned slot again clears the move. Reminder push **5 minutes before** the slot (clock table 11:55, 12:10, … 1:40). "Now serving" shown on tickets and home.
- Home lunch card appears only when checked in, RSVP'd and not a child.

### 4.4 Digital boli (auction-style pledge)
- Pledge at or above the **floor** until the **cutoff**; highest pledge receives the labh.
- Minimum = `floor` if no pledges yet, else `top + $21`. Stepper moves in **$21** steps and cannot go below the minimum. Placing requires `bid ≥ min`; on success `top = bid`, `count += 1`, `mine = bid`, and the stepper pre-advances to `bid + 21`.
- Status: `mine ≥ top` → "Yours is the highest pledge" (green); `mine > 0 && mine < top` → "Another family pledged more · pledge again" (red); `count === 0` → "No pledges yet · floor applies"; else "Open for pledges" (amber). Outbid simulation sets `top = max(top, floor) + 51`.
- Family is notified when outbid; the winning pledge is added to the family's pledges and paid anytime.
- **In-person (hall) bolis** are called live; the app only offers a "remind me before it is called" toggle; the labh is recorded in pledges after the event.

### 4.5 Sponsorship / pujan / campaign pledges
- `tier`: single tier, amount = tier amount. `amount`: fixed $10K/$25K/$50K or custom. `multi`: sum of selected pujans; pujans already taken by another family cannot be selected; each pujan is a fixed boli.
- "Commit as pledge" requires amount > 0; creates an open pledge (id `JSH-PL-{24900+n}`, by Priya, dated today) with the detail line recorded, then sync → Family pledges. "Pay now" → pay sheet → Anumodana screen (no pledge row is written for this path in the prototype).

### 4.6 Payments and pledges ledger
- `confirmPay` branches on `payCtx`: `rsvp` / `rsvpLater` → mark commitment paid, sync, tickets; `store` → clear cart, sync "Placing your order" (send to kitchen, record Visa payment, schedule pickup, email receipt), order `JSH-S-1042`, home; `pledges` → add ids to `paidIds` (paid date = today), sync, back to pledges; `''` → Thank-you screen.
- Open = no paid date. Year grouping uses the **pledge date** year; "Paid in {year}" uses the **paid date** year. Statement: current year "in Jan", prior years emailed on tap. Pay-selected only counts still-open selections; pay-all pays every open pledge.
- Tax receipt on every payment; receipts/statements go to the primary email.
- Every write is modelled as Neon CRM calls (household lookup → registration → pledge → payment → QuickBooks sync → email); prototype advances one step every 750 ms.

### 4.7 Recurring giving
- Create requires amount > 0. Annual estimate = `amt × RFn[freq]` (12 / 4 / 1 / 7 — "7 family special days"). Pause/resume toggles `paused`; only active gifts count toward the yearly total. Receipts after each gift; can be paused, changed or stopped anytime.
- A birthday labh with "Repeat every year" also creates a **yearly** recurring commitment starting on the birthday (Oct 6, 2026), reminded 2 weeks before.

### 4.8 Special days and labh
- Reminder default **2 weeks before**; a day is "soon" when `inDays ≤ 14` (shows *Plan labh*, reminder marked sent). Add-form reminder choices 1 week / 2 weeks / 1 month. Days may be remembered by calendar date or Jain tithi.
- Labh commit requires total > 0; dedication is shown at the derasar and to the Pathshala class; puja scheduled for the date. "Not this year" dismisses the home card for that occasion.

### 4.9 My Jain Way points and streak
- Practices are user-selected from a catalog and ordered by time of day. Ticking one earns its points immediately; completing **all** selected practices earns a **+20** bonus and extends the streak (11 → 12; best 21). Reminders 10 min before each practice.
- Anumodana = **+5** per celebration (once each); Saathi support or "practice together" = **+3** (once). Both practice-together participants get a 10-min reminder (8:30 PM).
- Monthly standing per category: `top% = max(3, CAT_BASE[c] − done×3)`, green when ≤ 20 % else amber; private to the user.
- Saathi tab badge while support is pending or fewer than 2 anumodanas sent. Support prompt is targeted ("you sent anumodana when he finished level 6, so we're asking you first").

### 4.10 Feedback
- Overall star rating is required to submit. Anonymous by default: name/household not stored, only "responded" (to suppress reminders); non-anonymous lets the team follow up. Survey window shown (Sep 8–16); available for ~2 weeks after the event (push on Sep 17).

### 4.11 Satvik Store
- Order cut-off **Thu 9 PM** for **Sat/Sun** pickup; three pickup windows; cancel up to **24 h before pickup**. Gift packing **$2.99 per unit**, cleared when quantity drops to 0; gift message field appears only if any gift. Cart bar only on the store screen with items. All items Jain (no onion, garlic, root vegetables). Categories Mithai / Namkeen / Meals.

### 4.12 Calendar
- Navigable months clamped to Sep–Nov 2026; today = Sep 22. Parva tithis auto-added: 8 (Atham), 14 (Chaudas · pakkhi pratikraman), 15 (Punam/Amas). Pathshala every Sunday 10:00 AM–12:00 PM except Nov 8 (Diwali) and Nov 29 (Thanksgiving). Fixed items: Paryushan Sep 8–15 (Samvatsari Sep 15), Mahavir Janma Vanchan Sep 12, Store pickup Sep 26, Tapasvi Bahuman Sep 27, Youth garba Oct 10, Ayambil Oli Oct 17–25, Pathshala parent meeting Oct 11, Gyan quiz Oct 25, Diwali/Mahavir Nirvan Nov 8, Nutan varsh Nov 9, Gyan Panchami Nov 13; ISD holidays (Oct 9/12/13, Sep 28 early release, Nov 23–27 Thanksgiving). Tithi is a synthetic approximation (56 tithis per 54 days from Sep 15 = Bhadarva sud 4); production must sync the real panchang and each ISD calendar.

### 4.13 Account lifecycle
- **Deactivate**: notifications stop, signed out on all devices; membership, pledges and giving history retained; reactivate by signing in. **Delete**: removes login, preferences and My Jain Way history; JSH keeps membership/pledge/donation records; confirmation email within 30 days. **Sign out**: one-time code needed to sign in again. **Download my data**: emailed within 24 h. Quiet hours 9 PM–7 AM except event-day reminders. Directory listing = name and zone only.

### 4.14 Member card
QR refreshes every 30 s, works offline, one per member, Apple Wallet export; used for event check-in and Pathshala attendance.

### 4.15 Niva assistant
Answers only from JSH-approved content and cites sources; doctrinal questions referred to Pathshala teachers; accepts English/Gujarati/Hindi. Timings referenced: derasar 7:30 AM–6:00 PM, aarti 12:30 PM and 4:30 PM.

### 4.16 Unwired in the prototype (needs real behaviour)
Add guest / Senior assistance; Apple Wallet buttons; WhatsApp share; album Share/Download/Add yours; viewer Share/Save; "Add these calendars to my phone"; pachchakhan recitation audio; recurring **Edit**; Niva free-text input; Family-tab "Sign out"; Settings noop rows (sign-in/security, devices, payment methods, help, contact, report, about); profile text inputs (DOB, relationship, profession, mobile, headline) are display-only; "Show our family's name" checkbox unbound.

---

## 5. Design tokens

### 5.1 Fonts
- **Display:** `'Fraunces', Georgia, serif` — Google Fonts `Fraunces:opsz,wght@9..144,500;9..144,600`; used at weights 500 (hero titles, headlines) and 600 (screen titles, big numbers, year headers).
- **Body/UI:** `'DM Sans', system-ui, sans-serif` — weights 400, 500, 600 (700/800 used inline for emphasis; will synthesize unless added).
- Buttons/inputs inherit `font-family`.

### 5.2 Type scale (px) and roles
84 lock-screen clock · 44 ✓ glyph · 32 bid amount · 30 giving total · 28 thank-you · 26 progress hero · 24 pach/card/store titles · 23 labh title · 22 screen title, year, dialog title · 21 band titles · 20 lunch title, totals · 19 home card headlines · 18 sub-heads/amounts · 17 card titles/stat values · 16 section heads, primary CTA · 15 body/list titles · 14 body, secondary CTA · 13 meta · 12 captions/eyebrows · 11 fine print · 10 badges · 9 calendar tithi. Line-heights 1.3–1.55 for prose. Eyebrow letter-spacing 0.04em / 0.06em / 0.08em / 0.14em; clock −0.02em.

### 5.3 Colour palette (hex)
**Surfaces:** page/app bg `#FBF7F0` · outside-frame bg & neutral tint `#EDE6DA` · card `#FFFFFF` · tinted panel / segmented track `#F6EFE3` · row divider `#F1E8D8` · light divider `#F4EEE3` · neutral chip bg `#F1EEE8`.
**Borders:** card `#E8E0D2` · input/light `#E3D9C8` · dashed `#B9AE99`, `#D5CBB8` · toggle off `#CFC8BA` · star empty `#E3DCCF`.
**Ink:** primary `#1E1C18` · secondary `#3D3A33` · muted `#5E5A52` · faint/inactive `#8A8478` · link hover `#0F1B3D`.
**Navy (primary):** `#1B2C5C` · tints `#EEF1F8`, `#E6E9F3`, selected border `#B8C2DD` · on-navy text `#C9D1EA` · navy panels `#33467A`, `#26396E` · disabled button `#8A93AE`.
**Saffron/brown (giving, bolis):** `#8A4608` · dark `#5E3106` · text `#5E4A33` · tint `#FBEBD7` · border `#EFCFA6` · on-brown text `#F6DDBF` · amber accent `#C9731C` · flame `#F2A03D`, `#D9731A` · badge `#E8892A` · gold `#F2B632`.
**Green (success, lunch, recurring):** `#1F7A4D` · dark text `#14502F`, `#2E5D43` · tint `#E4F2EA` · border `#B7DCC6` · on-navy green `#7FD1A4`.
**Store green:** `#2F5D50` · light `#3E7566` · on-green text `#CFE6DC` · selected bg `#E8F1ED`.
**Red/maroon:** danger `#B3261E` · tint `#FBE3E1` · LIVE `#C0392B` · event maroon `#7A2E1F` · maroon button `#8F4232` · on-maroon text `#F3D6CF`.
**Purple (feedback, Pathshala, Saathi):** `#5B4B8A` · tint `#EFEBF6` · light text `#DCD6EC` · border `#D8CFEA` · bg `#F5F2FA` · dark text `#3D2F63` · album `#4B3A66`.
**Dark/media:** video `#16140F` · viewer bg `#0B0A08` · viewer buttons `#26231C` · viewer text `#F4EFE6` / `#B8B0A2` · black CTA `#111111` · lock-screen `#1C2433` with text `#D6DCE8`, `#9AA4B8` · notification card `#F2F2F4`, meta `#555555` · pay-sheet divider `#EEE`.
**Calendar layers:** Jain `#C9731C` · Pathshala `#5B4B8A` · Events `#7A2E1F` · Katy `#1F7A4D` · Fort Bend `#1B5E9C` · Cy-Fair `#9C1B5E` · Houston `#5E5A52`.
**Album/product swatches:** `#B8742C #D9A15B #C98A3E #34487E #5C6FA3 #7D8DB8 #6E9E8F #A5C4B8 #7A4A1C #A8763F #C9A06B #A64532 #D27A4F #E3A15E #6A5890 #9585B5 #B9ABD3 #D9C7A0 #B89A6A #A67A45 #C47A3A #D6B56E #9C6A34 #BFA276`.
**Scrims:** `rgba(20,18,14,0.55)` dialogs/in-app · `0.5` pay sheet · `0.45` drawer · `0.35` FAB.
**Shadows:** cart bar `0 8px 20px rgba(47,93,80,0.35)` · FAB `0 8px 20px rgba(138,70,8,0.35)` · FAB menu `0 10px 30px rgba(20,18,14,0.25)` · drawer `8px 0 30px rgba(20,18,14,0.2)` · Gyan badge hard shadow `0 4px 0 #8A4608`.

### 5.4 Radii
6 photo tile / RSVP checkbox · 7 pujan/pledge checkbox · 8 status pill, NPS cell, LIVE badge · 9 notification icon · 10 inputs, segmented buttons, calendar cell, date chip · 11 toggle knob · 12 tiles, chips, thumbnails · 14 cards, chip pills, toggle track, tour buttons, dialogs · 16 row cards · 18 cards, chip pills, avatars · 20 major cards, 44 px pills, avatars · 22 46 px pill buttons, FAB card · 24 dialogs, member card, sheet top corners, drawer edge · 26 primary 52 px CTAs, 52 px circles · 28 cart bar · 30 FAB · 40/44 large circles.

### 5.5 Spacing and sizing
- Frame 390×844; header padding `16 20 12`; content padding `4 20 24`; page gutter **20 px**; bottom nav **76 px** (+8 px safe-area padding); store view adds 72 px bottom padding for the cart bar.
- Stack gaps: 16 between home cards; 12–14 within screens; 8 inside cards; 6 between chips/segment buttons; 4 grid gaps for segmented tracks and calendars.
- Card padding `16` (home/big) or `14 16` (standard) or `12 14`; hero bands `18` / `18 20`; list containers `2 16` or `6 16` with row `padding 8 0` + 1 px divider.
- Tap targets: 40 (chips/small), 44 (standard, icon buttons), 46–48 (secondary CTAs), 52 (primary CTAs), 56–60 (list rows, FAB), 64 (drawer rows).
- Controls: toggle 46×28 track / 22 knob; checkboxes 24/26/28 square; stepper 52 (boli) / 44 (store) / 40 (cart); progress bars 5–8 px; segmented track 4 px padding with 10 px inner radius.

---

## 6. Coverage statement
I read **100 % of the file** — all 2,309 lines, in eight contiguous chunks (1–250, 251–500, 501–1000, 1001–1250, 1251–1500, 1501–1750, 1751–2000, 2001–2309) — and the spec above is drawn from both the template markup and the full JS state/derivation logic.
