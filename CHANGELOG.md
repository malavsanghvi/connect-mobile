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

## 1.3.0 — 2026-10-01

- First sign-in: two new steps for adults after "Your family". **Your family's special days** adds birthdays,
  anniversaries and other days (the same form as Family › Special days, with a reminder ahead of each one).
  **Join our WhatsApp groups** asks to join the community's groups (the same request as the welcome guide; an
  admin adds the number). Both are optional and skippable. The WhatsApp step is passed over when Communications is
  off or the community has no active group, and children go straight to contact preferences. Both screens are
  still available afterwards (Family › Special days, welcome guide › WhatsApp groups).

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
