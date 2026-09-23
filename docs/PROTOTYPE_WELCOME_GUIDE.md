# Prototype spec — "New to JSH" guide

Source: JSH App Prototype artifact › project/Welcome.dc.html (390×844). Read in full (412 lines), together with JSH App Prototype artifact › project/canvas.json for board linkage.

---

# Shared context (all four prototypes)

- **Framework**: each page is a `DCLogic` component (`./support.js`). Template directives: `sc-if value="{{flag}}"` (conditional block), `sc-for list="{{arr}}" as="x"` (repeat). All UI state lives in `this.state`; `renderVals()` maps state → template values and click handlers. `hint-placeholder-*` attributes are design-time hints only.
- **Board graph** (JSH App Prototype artifact › project/canvas.json, project "JSH App Prototype"): `Onboarding` → `Main.dc.html` (guest / go home); `Welcome` ↔ `Main` (back, registrations); `GyanPath` ← `Main` (back); `CommunityDashboard` → `Welcome` ("New to JSH? Start here"). `Main`, `Volunteer`, `AdminPortal` exist but were out of scope.
- **Design tokens** (inline, no CSS vars): bg cream `#FBF7F0`, page frame `#EDE6DA`, primary navy `#1B2C5C`, success green `#1F7A4D`, accent orange `#C9731C` / `#E8892A`, amber ink `#8A4608`, error red `#B3261E`, gold `#F2B632`, muted text `#5E5A52`, borders `#E3D9C8` / `#E8E0D2`. Fonts: Fraunces (display), DM Sans (body), JetBrains Mono (dashboard only). Every board carries a fixed "PROTOTYPE · SAMPLE DATA" badge.
- **Touch targets**: buttons are min 44px; primary CTAs 52–54px, 26px radius.

---

# 2. `Welcome.dc.html` — "New to JSH" guide (390×844)

## 2.1 State model

```js
{ sec: 'hub'|'whatsapp'|'timings'|'links'|'zone'|'volunteer'|'admin'|'membership'|'register'|'ask',
  wa: bool[6], zip: '77494', zipRaw: '77494', zone: -1, zoneGroup: false,
  vol: bool[8], av: [true,false,true], volSent: false, adminTab: 0, memSeen: false,
  topic: 2, askSent: false, compose: null|{to,text}, toast: '' }
```

Header: at hub → back **link** to `Main.dc.html`; inside a section → back **button** to hub. Title map: hub "New to JSH", whatsapp "WhatsApp groups", timings "Timings and visiting", links "Website and links", zone "Your zone", volunteer "Volunteer", admin "Administration", membership "Membership", register "Registrations", ask "Ask a question". Toast overlay auto-hides after 2 400 ms.

## 2.2 Hub screen

- Hero (navy): "Jai Jinendra and welcome" / "Everything you need to get connected with JSH" / "New families start here. Longtime members can use it as the JSH directory." / `Your first steps · {n} of 5 done` with progress bar (`n × 20%`).
- **First steps checklist** (tap → section). Completion rule per step:

| # | Label | Section | Done when |
|---|---|---|---|
| 1 | Join JSH WhatsApp groups | whatsapp | any `wa[i]` true |
| 2 | Find your zone and zone lead | zone | `zone >= 0` |
| 3 | Learn about membership | membership | `memSeen` (set the moment the membership section is opened) |
| 4 | Share your seva interests | volunteer | `volSent` |
| 5 | Ask us anything | ask | `askSent` |

- **Explore JSH** 2-col tiles (9): WhatsApp groups · Timings and visiting · Your zone · Volunteer · Membership · Registrations · Administration · Website and links · Ask a question (each with mark, tint, subtitle, → section).

## 2.3 Sections

### WhatsApp groups
- Copy: "JSH shares news, timings and event updates on WhatsApp. Request to join and an admin adds the mobile number on your profile, usually within a day."
- "Adding: **(713) 555-0142** · Change number" (`#change`).
- Groups (6), each with `Request to join` ↔ `Requested ✓` toggle; toast "Request sent · an admin will add you soon" on request:
  1. JSH Announcements — "Official news and timings · admins only post"
  2. Your zone group — "{Zone} zone · local news and carpools" or "Find your zone first"; **if no zone is set, tapping navigates to the Zone section instead of toggling**
  3. Pathshala parents — class updates and schedules
  4. Youth (YJA and YJP) — Ages 14–30 · events and seva
  5. Seniors — Swadhyay, outings and rides
  6. Volunteers — seva shifts and sign-ups
- Footer rule: "Groups follow JSH's WhatsApp guidelines: announcements only, no forwards."

### Timings and visiting (read-only)
| What | When |
|---|---|
| Derasar | 7:30 AM – 6:00 PM daily |
| Aarti | 12:30 PM and 4:30 PM |
| Snatra puja | Sundays 9:30 AM |
| Pathshala | Sundays 10:00 AM – 12:00 PM |
| Bhojanshala | Sundays 12:15 PM · festival days |
| Swadhyay | Wednesdays 7:30 PM (Zoom) |
| Office | Sat–Sun 10:00 AM – 2:00 PM |

Location card: Jain Center of Houston, 3905 Arc St, Houston, TX 77063; parking note (main lot + overflow across the street on festival days); "Please remove leather items before entering the derasar." Buttons `Directions`, `Call the office` (no handlers). Footnote: timings are sample; festival days follow the event calendar.

### Website and links (read-only, all `href="#link"`)
JSH website (jain-houston.org · news, calendar, forms) · YouTube (pravachans, events, live darshan) · Facebook · Instagram · Event photo albums (in-app) · JSH Constitution and bylaws (membership, voting, governance).

### Your zone
- Copy: "Greater Houston is divided into zones. Each zone has a lead who welcomes new families, shares local news and organizes carpools and home events."
- `Your ZIP code` (`inputmode=numeric`, controlled via `onChange` → `zipRaw`) + `Find my zone`.
- **Lookup rule**: `ZONES.findIndex(z => z.zips.includes(zip.trim()))`; **if not found, defaults to Central (index 6)**.
- Zone card (when set): "YOUR ZONE", `{name} zone`, `{areas} · about {fam} JSH families`, lead row "[Zone lead name] · {name} lead · replies within a day", `Message lead` (opens compose to "{name} zone lead" prefilled "Jai Jinendra! We are the Shah family, new to the {name} zone. We would love to connect with families nearby."), `Join zone WhatsApp` → sets `zoneGroup=true` **and** `wa[1]=true` (so hub step 1 also completes), toast "Request sent to join the {name} zone group"; label becomes `Group requested ✓`.
- "All zones" list — direct pick sets `zone`.

**Zone reference data**

| Zone | Areas | Families | ZIPs |
|---|---|---|---|
| North | Spring, The Woodlands, Conroe | 140 | 77379 77380 77381 77382 77388 77389 77373 |
| Northwest | Cypress, Jersey Village, Tomball | 165 | 77433 77429 77095 77070 77375 |
| West | Katy, Fulshear, Energy Corridor | 210 | 77494 77450 77493 77441 77084 77079 |
| Southwest | Sugar Land, Missouri City, Stafford, Richmond | 260 | 77479 77478 77459 77477 77498 77406 77407 |
| South | Pearland, Clear Lake, League City | 120 | 77584 77581 77546 77573 77598 77062 |
| Northeast | Humble, Kingwood, Atascocita | 70 | 77346 77339 77345 77396 77338 |
| Central (fallback) | Bellaire, Galleria, Medical Center, Downtown | 95 | 77401 77081 77002 77005 77025 77063 77056 |

### Volunteer (seva interests)
- Copy: "Seva is at the heart of JSH. Pick the groups that interest you and the right coordinator will reach out."
- Multi-select groups (8): Bhojanshala and kitchen (cooking, serving, cleanup) · Pathshala teaching · Events and decoration (setup, rangoli, stage, flowers) · Derasar and puja seva · Tech and media (livestream, photos, app, website) · Youth mentoring (YJA/YJP) · Seniors care (rides, companionship) · Parking and security (festival days, large events).
- `When can you help?` multi-select: Weekends / Weekday evenings / Festivals (default Weekends + Festivals).
- Submit button: `Send interest in N group(s)` or, with none selected, grey `Select at least one group`; `sendVol` no-ops when empty. **Validation: ≥1 group required; availability is not validated.**
- Sent state: "Thank you for offering seva" — "Your interest in {names, comma-joined} was sent to the coordinators. They will contact you by WhatsApp or email." + `Update my interests` (resets to form, selections retained).

### Administration
- Segmented tabs: **Executive Committee** / **Trustees**. Each row: mark, role, "[Name from JSH] · area", `Message` → compose to "the {role}" prefilled "Jai Jinendra! ".
- EC roles: President · Vice President · Secretary · Treasurer (Finance and donations) · Religious coordinator (Pujas and festivals) · Pathshala coordinator · Technology officer (App, website, livestream) · Membership coordinator (Memberships and records).
- Trustees: Chair, Board of Trustees · Trustee (Temple construction) · Trustee (Finance and investments) · Trustee (Facilities).
- Footer: "Names and terms are maintained by the JSH office and update after each election." → implies an office-maintained `office_holders` table with term dates.

### Membership
| Type | Fee | Description |
|---|---|---|
| Yearly membership | `[$ per year]` | Whole family for one calendar year; renew each January in the app |
| Life membership | `$501 one time` | You and your spouse; reviewed and approved by the Executive Committee |
| Yearly maintenance fee | `[$ per family]` | Upkeep of the Jain Center and derasar; paid by every member family each year |

"Good to know" rules: membership required to register children for Pathshala · life members can vote in JSH elections after one year, and their spouse is also a life member · children roll off a family's life membership at 18 and can apply on their own. `Become a member` (no handler). Footnote: life fee from the website; yearly/maintenance are placeholders.

### Registrations (status-coded list)
| Item | Sub | Status | href |
|---|---|---|---|
| Pathshala enrollment | Classes for ages 5–18 · membership required | Open | Main.dc.html |
| Upcoming event RSVPs | Tapasvi Bahuman, Diwali and more | Open | Main.dc.html |
| Membership application | Yearly or life membership | Open | #membership |
| Youth programs (YJA and YJP) | Convention and local events | Opens Jan | #youth |
| Puja and hall bookings | Snatra puja, family pujas, hall use | Open | #booking |
| Paryushan tapasya registration | For recognition at Tapasvi Bahuman | Closed | #tapasya |

Status styling: Open green / "Opens Jan" amber / Closed grey → enum `open | opens_later(date) | closed`.

### Ask a question
- Copy: "Send your question to the right JSH team. We reply within 3–5 business days. For quick answers, try Niva in the app." (Niva = in-app assistant.)
- `Topic` single-select: Membership / Events / Pathshala / Donations / Temple and pujas / Other (default Pathshala).
- `Your question` textarea (rows 5; sample "We just moved to Katy. How do we register our 9-year-old for Pathshala this year?").
- Checkbox `Reply by WhatsApp as well as email` (default checked).
- `Send question` → sent card: "Question sent · **Q-3021**", "Routed to the {team} team. You'll get a reply within 3–5 business days, and can follow it under Help and requests." Routing: `team = topic === 'Other' ? 'JSH office' : topic`. `Ask another question` resets.
- No validation on the textarea in the prototype.

### Compose sheet (bottom overlay, shared by zone lead + admins)
"Message {to}" · `Cancel` · `Message` textarea prefilled · disclosure "Sent through the JSH app. Your mobile and email are shared so they can reply." · `Send` → closes and toasts "Message sent to {to}".

## 2.4 Data entities implied

- `WhatsAppGroup {id, name, description, admins_only_post, requires_zone}`; `GroupJoinRequest {group_id, member_id, mobile, status: requested→added, requested_at}`.
- `Zone {name, areas[], zip_codes[], family_count, lead_member_id}`.
- `VolunteerInterest {member_id, groups[], availability ⊆ {weekends, weekday_evenings, festivals}, submitted_at}` and `SevaGroup {name, description, coordinator}`.
- `OfficeHolder {body: EC|BOT, role, area, name, term}`.
- `MembershipType {name, fee, description}` + rules above.
- `Registration {name, description, status, opens_on?, link, membership_required}`.
- `Question {id (Q-####), topic, text, reply_via_whatsapp, routed_team, sla_days: 3–5, status}`.
- `Message {to (zone lead | office holder), text, shares_contact: true}`.
- `Timing {what, when}`, `Link {name, sub, url}`, `Venue {name, address, notes}`.
- `OnboardingChecklist` (5 flags, derived — not stored separately in prototype).

## 2.5 Business rules

1. WhatsApp joining is **request-based**; an admin adds the mobile on the member's profile within ~a day; groups are announcement-only, no forwards.
2. The zone group cannot be requested until a zone is known (redirect to zone finder).
3. Zone is derived from ZIP; unknown ZIP falls back to Central (production should instead say "not found").
4. Seva interest needs at least one group; coordinators contact via WhatsApp or email.
5. Membership: required for Pathshala; life = member + spouse, EC-approved, $501, voting after one year; children age out at 18.
6. Questions carry a 3–5 business-day SLA and are routed by topic; "Other" → JSH office.
7. Messaging a lead/officer discloses the sender's mobile and email.
8. "Learn about membership" is credited on view, not on any action.
