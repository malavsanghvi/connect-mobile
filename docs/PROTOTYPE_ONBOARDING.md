# Prototype spec — Member sign-in & onboarding

Source: JSH App Prototype artifact › project/Onboarding.dc.html (390×844). Read in full (274 lines), together with JSH App Prototype artifact › project/canvas.json for board linkage.

---

# Shared context (all four prototypes)

- **Framework**: each page is a `DCLogic` component (`./support.js`). Template directives: `sc-if value="{{flag}}"` (conditional block), `sc-for list="{{arr}}" as="x"` (repeat). All UI state lives in `this.state`; `renderVals()` maps state → template values and click handlers. `hint-placeholder-*` attributes are design-time hints only.
- **Board graph** (JSH App Prototype artifact › project/canvas.json, project "JSH App Prototype"): `Onboarding` → `Main.dc.html` (guest / go home); `Welcome` ↔ `Main` (back, registrations); `GyanPath` ← `Main` (back); `CommunityDashboard` → `Welcome` ("New to JSH? Start here"). `Main`, `Volunteer`, `AdminPortal` exist but were out of scope.
- **Design tokens** (inline, no CSS vars): bg cream `#FBF7F0`, page frame `#EDE6DA`, primary navy `#1B2C5C`, success green `#1F7A4D`, accent orange `#C9731C` / `#E8892A`, amber ink `#8A4608`, error red `#B3261E`, gold `#F2B632`, muted text `#5E5A52`, borders `#E3D9C8` / `#E8E0D2`. Fonts: Fraunces (display), DM Sans (body), JetBrains Mono (dashboard only). Every board carries a fixed "PROTOTYPE · SAMPLE DATA" badge.
- **Touch targets**: buttons are min 44px; primary CTAs 52–54px, 26px radius.

---

# 1. `Onboarding.dc.html` — Member sign-in & onboarding (390×844)

## 1.1 State model

```js
{ step: 0..6, gender: 0, emails: 1|2, editIdx: 2, extra: 0,
  ch: [false,true,true,true], time: 2, lang: 0,
  topics: [true,false,true,false,false,true], skipped: false, paper: null|true|false }
```

## 1.2 Chrome (steps 1–5 only, `showTop = step>0 && step<6`)

- **Back** button → `step = max(0, step-1)`.
- Label `Step {step} of 5`.
- **Skip for now** — visible only on steps 3–5 (`canSkip`). Jumps straight to step 6 with `skipped = true`.
- Progress bar width `= step × 20%` (20/40/60/80/100).

## 1.3 Screens in order

| Step | Screen | Content / fields | Actions |
|---|---|---|---|
| 0 | **Welcome** | JSH logo, "Jai Jinendra", headline "Welcome to the Jain Society of Houston", subtitle "Events, giving, learning and your family's membership, all in one place." | `Continue with email` → step 1 · `Continue with mobile number` → step 1 (same screen in prototype) · link `Just visiting? Explore as a guest` → `Main.dc.html` |
| 1 | **Sign in** (OTP) | `Email` (`type=email`, sample `priya.shah@example.com`) · `6-digit code we sent you` (`type=text`, sample `482 917`, 22px letter-spaced) · "Didn't get it? **Resend in 0:42**" (`#resend`) · checkbox `Use Face ID next time` (default checked) | `Verify` → step 2 |
| 2 | **Is this your family?** | "We matched your email to the JSH membership records." Card: family name `Shah family`, badge `LIFE MEMBERS`, member rows (initial avatar, name, relationship) | `Yes, that's us` → step 3 · `This isn't my family · start a new profile` → step 3 (prototype does not fork; production must) |
| 3 | **About you** | `First name` / `Last name` (2-col) · `Date of birth` (text, `03 / 14 / 1985`) · `Gender` chips single-select: Female / Male / Prefer not to say · `Profession` · `Employer (optional · checks for donation matching)` placeholder "Company name" · `Mobile` (`type=tel`, `(713) 555-0142`) · `Emails` list (addr + tag; `Primary`, and `Work` once added) · `+ Add another email` (adds `priya@work-example.com` · Work; max 2 in prototype) | `Continue` → step 4 |
| 4 | **Your family** | "Check each person's details. Adults can get their own login later." One card per member: avatar initial, name, summary `rel · age · gender[ · job]`, `Edit`/`Done` toggle (only one card open at a time, `editIdx`; Dev Shah open by default). Open card fields: `Relationship`, `Date of birth`, `Gender`; **adult only**: `Profession`, `Mobile`, `Email`; **child only**: note "School grade and Pathshala level can be added from the Learn tab." | `+ Add family member` → appends "New family member" (summary "Add their details", treated as adult, auto-opened) · `Looks right` → step 5 |
| 5 | **How should we reach you?** | `Contact me by (choose any)` multi-select: Phone call / Text · SMS / WhatsApp / Email (default SMS+WhatsApp+Email) · `Best time to call` single: Morning / Afternoon / Evening (default Evening) · `App language` single: English / ગુજરાતી / हिन्दी (default English) · `Interested in` multi: Events / Pathshala / Volunteering / Youth programs / Seniors / Giving opportunities (default Events, Volunteering, Giving opportunities) · **Documents and mail** (required radio): "Digital only, no physical mail" (everything by email/app; saves paper & postage) vs "Also send physical mail" (year-end statements & notices by post) · footer "Your details update your JSH membership record and are used only by JSH." | `Finish` → step 6. Gated: while `paper === null` the card border is orange `#C9731C`, button is grey `#8A93AE` labelled `Choose documents and mail to finish`, and `finish()` returns without advancing. |
| 6 | **Done** | ✓ avatar, "You're all set, Priya", `doneLine`, checklist card: `✓ Signed in with Face ID enabled` · `✓ {famCount} family members confirmed` · `✓ Contact by {channels joined by ", " or "no channel yet"}` · `✓ {paperSummary}` | `Go to home` → `Main.dc.html` |

`doneLine`: skipped → "You can finish your profile anytime from the Family tab." else "Thank you for helping us keep the community connected."
`paperSummary`: null → "Documents and mail: not chosen yet"; true → "Digital-only documents · no physical mail"; false → "Digital documents plus physical mail".

## 1.4 Data entities implied

**Session / Auth**
- `identifier` (email | mobile), `otp_code` (6 digits, displayed as `NNN NNN`), `resend_cooldown_s` (42 shown), `face_id_opt_in: bool`.

**Family** (`Shah family`) — `name`, `membership_status` (`LIFE MEMBERS`), `members[]`.

**FamilyMember** — sample data:

| name | rel | age | dob | gender | job | phone | email |
|---|---|---|---|---|---|---|---|
| Priya Shah | Self | 41 | 03/14/1985 | Female | Software engineer | (713) 555-0142 | priya.shah@example.com |
| Rahul Shah | Spouse | 43 | 07/02/1983 | Male | Physician | (713) 555-0188 | rahul.shah@example.com |
| Dev Shah | Son | 14 | 05/09/2012 | Male | — | — | — |
| Anya Shah | Daughter | 9 | 11/21/2016 | Female | — | — | — |

Plus `isNew: bool` for added rows. Derived: `initial = name[0]`, `adult = isNew || age >= 18`, `child = !isNew && age < 18`.

**Profile ("About you")** — `first_name`, `last_name`, `dob`, `gender ∈ {Female, Male, Prefer not to say}`, `profession`, `employer?`, `mobile`, `emails[] {addr, tag ∈ {Primary, Work}}`.

**ContactPreferences** — `channels ⊆ {phone_call, sms, whatsapp, email}`, `best_time ∈ {morning, afternoon, evening}`, `app_language ∈ {en, gu, hi}`, `interests ⊆ {events, pathshala, volunteering, youth, seniors, giving}`, `paperless: bool (required)`.

**OnboardingRun** — `step`, `skipped`, `completed_at`.

## 1.5 Validation observed

- **Only enforced rule**: Documents & mail choice is mandatory before Finish.
- No `required`, `pattern`, `minlength` or handlers on any input; text inputs are uncontrolled (no `onChange`), so edits are not captured in state. Production needs: email format, 6-digit OTP, DOB format/age derivation, US phone format.
- OTP resend has a visible countdown (42 s) — implies rate-limit on resend.

## 1.6 Business rules visible in code

1. Sign-in is passwordless OTP via email **or** mobile; both paths converge on the same verify screen. Biometric (Face ID) opt-in at first sign-in.
2. **Family match**: email is looked up against JSH membership records; a matched family is shown with its membership tier and the user must confirm or reject. Rejection = "start a new profile" (must not prefill the other family's data in production).
3. **Adult vs child**: threshold is `age >= 18`. Adults carry profession/mobile/email and "can get their own login later"; children have no contact fields and no login — their school grade & Pathshala level are maintained from the Learn tab. A newly added member defaults to the adult form.
4. **Employer** is optional and exists to check corporate donation matching.
5. Multiple emails per person, one tagged Primary.
6. Contact preferences: channel is multi-select, best-call-time, language and interest topics are captured for targeted updates.
7. **Paperless choice is compulsory** and digital-only is nudged ("saves paper and postage for JSH").
8. **Skip** is allowed only after sign-in and family confirmation (steps 3–5); skipping marks the profile incomplete and points the user to the Family tab to finish.
9. Privacy statement: data updates the membership record and is used only by JSH.
10. Guest browsing is allowed without an account.

## 1.7 Prototype gaps to resolve

- Email vs mobile flows render identically; "Yes, that's us" and "This isn't my family" are the same handler.
- Done screen hardcodes "Signed in with Face ID enabled" regardless of the checkbox.
- `Step {step} of 5` uses the raw step index (1–5), fine; but step 2 (family match) should be skipped when no match is found — not modelled.
