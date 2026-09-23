# Prototype spec — Gyan Path (learning)

Source: JSH App Prototype artifact › project/GyanPath.dc.html (390×844). Read in full (308 lines), together with JSH App Prototype artifact › project/canvas.json for board linkage.

---

# Shared context (all four prototypes)

- **Framework**: each page is a `DCLogic` component (`./support.js`). Template directives: `sc-if value="{{flag}}"` (conditional block), `sc-for list="{{arr}}" as="x"` (repeat). All UI state lives in `this.state`; `renderVals()` maps state → template values and click handlers. `hint-placeholder-*` attributes are design-time hints only.
- **Board graph** (JSH App Prototype artifact › project/canvas.json, project "JSH App Prototype"): `Onboarding` → `Main.dc.html` (guest / go home); `Welcome` ↔ `Main` (back, registrations); `GyanPath` ← `Main` (back); `CommunityDashboard` → `Welcome` ("New to JSH? Start here"). `Main`, `Volunteer`, `AdminPortal` exist but were out of scope.
- **Design tokens** (inline, no CSS vars): bg cream `#FBF7F0`, page frame `#EDE6DA`, primary navy `#1B2C5C`, success green `#1F7A4D`, accent orange `#C9731C` / `#E8892A`, amber ink `#8A4608`, error red `#B3261E`, gold `#F2B632`, muted text `#5E5A52`, borders `#E3D9C8` / `#E8E0D2`. Fonts: Fraunces (display), DM Sans (body), JetBrains Mono (dashboard only). Every board carries a fixed "PROTOTYPE · SAMPLE DATA" badge.
- **Touch targets**: buttons are min 44px; primary CTAs 52–54px, 26px radius.

---

# 3. `GyanPath.dc.html` — Learning path (390×844)

## 3.1 State model

```js
{ screen: 'goals'|'map'|'lesson'|'done', goal: 0, daily: 1,
  done: [4, 9, 0, 0],                 // levels completed per goal
  stars: [[3,3,2,3],[3,3,3,2,3,3,2,3,3],[],[]],  // stars per completed level
  step: 0, pick: -1, checked: false, wrong: 0, audio: false, mic: 0|1|2,
  points: 1255, streak: 11, earned: 0, toast: '' }
```

Header: back = link to `Main.dc.html` on goals; else button (map → goals, lesson/done → map). Title = "Gyan Path" or goal name. Always-visible chips: 🔥 `streak` (days) and ★ `points` (locale-formatted). Toast auto-hides after 1 800 ms.

## 3.2 Screen: Goals

- Hero: "Gyan Path · Jai Jinendra, Priya" / "Pick a goal. We'll guide you one small level at a time." / "Short daily levels with listening, quizzes and recitation. **A Pathshala teacher signs off your final level. Points and streak are shared with My Jain Way.**"
- **MY DAILY GOAL** single-select: 5 min Casual / 10 min Regular / 15 min Serious (default 10 min).
- **LEARNING GOALS** cards: mark, name, optional `FOR YOU` badge (`rec`; card border uses the goal tint), subtitle, progress bar `round(done/levels×100)%`, progress text:
  - `done = 0` → "Not started · already know it? Take a quick check to skip ahead" (placement test implied, not built)
  - `0 < done < N` → "Level {done+1} of {N} · {done} done"
  - `done ≥ N` → "Completed · all levels done"
  - tap → map for that goal.
- **Learning with family**: Anya · Learn Navkar Mantra · Level 5 of 9; Dev · Learn Logassa sutra · Level 7 of 10 (children's progress visible to the parent).
- Footnote: "Level order, sutra text and audio would come from JSH Pathshala and may differ by tradition."

**Goal catalogue (sample content)**

| Goal | Levels | Est. | Chapters (start idx) | Treasure (0-based idx → reward) |
|---|---|---|---|---|
| Learn Samayik (FOR YOU) | 12 | ~3 weeks | 0 Foundations · 4 Sutras of Samayik · 9 Perform Samayik | 3 → Foundations badge; 7 → Logassa badge + 50 bonus points |
| Learn Navkar Mantra | 9 | ~1 week | 0 Five Parameshthis · 5 The Chulika | 4 → Panch Parameshthi badge |
| Learn Logassa sutra | 10 | ~2 weeks | 0 The 24 Tirthankars · 6 Recite Logassa | 4 → Chovisi badge |
| Learn Pratikraman | 15 | ~6 weeks | 0 Why Pratikraman · 5 The Six Avashyaks · 11 Perform | 4 → First steps badge; 10 → Six Avashyaks badge |

Goal subtitles: Samayik "48 minutes of equanimity · 12 levels · about 3 weeks"; Navkar "The first sutra every Jain learns · 9 levels · about 1 week"; Logassa "Praise of the 24 Tirthankars · 10 levels · about 2 weeks"; Pratikraman "Daily reflection and forgiveness · 15 levels · about 6 weeks". Goal tints / map backgrounds: Samayik `#1B2C5C` / `#E9ECF5`; Navkar `#C9731C` / `#FBF1E3`; Logassa `#5B4B8A` / `#EFEBF6`; Pratikraman `#7A2E1F` / `#F6ECE9`.

Level names — Samayik: What is Samayik · Navkar Mantra · Panchindiya sutra · Khamasamana · Iriyavahiyam sutra · Tassa Uttari sutra · Annattha sutra · Logassa sutra · Karemi Bhante · Samayik vidhi, step by step · Completing Samayik (parvani) · Perform with your teacher. Navkar: Arihant · Siddha · Acharya · Upadhyay · Sadhu and Sadhvi · Eso Panch Namukkaro · Savva Pavappanasano · Mangalanam cha Savvesim · Recite the full Navkar. Logassa: Who are the Tirthankars · Rishabhdev to Chandraprabh · Suvidhinath to Anantnath · Dharmanath to Naminath · Neminath, Parshvanath, Mahavir · Meaning of Logassa · Verses 1 and 2 · Verses 3 and 4 · Verses 5 to 7 · Recite Logassa in kayotsarg. Pratikraman: Why we do Pratikraman · Devasi, Raisi, Pakkhi, Chaumasi, Samvatsari · Michchhami Dukkadam · Before you begin · Samayik first · Chauvisattho · Vandan · Pratikraman · Kayotsarg · Pachchakhan · Vandittu sutra · Evening Pratikraman · Morning Pratikraman · Pakkhi Pratikraman · Perform with the Sangh.

## 3.3 Screen: Map (Duolingo-style path)

- Sticky header: current chapter title (with "CHAPTER N · " stripped) + " · {5|10|15} min a day", green progress bar and `done/total`.
- **Layout algorithm**: x cycles `[195, 280, 195, 110]` by `i % 4`; y starts 90; a chapter header (44px tall) is inserted where `chapter.at === i` and adds 72px; node size 84 (current) / 76 (boss = last level) / 66 (others); node column is 120px wide at `left = x − 60`; y advances 150 after the current node else 132; map height = y + 40. Two SVG polylines through node centres `(x, y + size/2)`: all nodes (grey dotted) and done-through-current (green dotted).
- **Node states**: done = green, ✓, star row `★×stars ☆×(3−stars)`; current = orange, pulsing ring, larger, number, white label chip; locked = grey, number, or ◆ for treasure levels, ♛ for the boss level (rounded-square). Locked treasure labels append " · treasure".
- **Tap rules**: done → toast "Replay level N anytime to earn more stars"; current → start lesson (resets lesson state); locked → toast "Finish level {done+1} to unlock this one" (**strict sequential unlock**).
- Bottom CTA: "Play level {done+1}: {name}" or, when complete, "Goal complete · choose another" (→ goals).

## 3.4 Screen: Lesson (4 fixed steps: learn → quiz → quiz → recite)

- Progress bar `= (step + (checked || step is learn ? 1 : 0)) × 25%`, label `{step+1} / 4`; kind label `LEARN · LEVEL N` / `QUICK QUIZ` / `RECITE`.
- **Learn**: level name, meaning paragraph, audio toggle (`Listen to the recitation` ↔ `Playing recitation · 0:42`, play/pause icon), dashed placeholder "SUTRA TEXT, LINE BY LINE — [Gujarati, Devanagari and transliteration, with word meanings, supplied by JSH Pathshala]". Primary `Continue` → step 1.
- **Quiz** (×2): question + 3 options. Selecting is allowed only before checking. Primary is `Check` (grey/disabled while nothing picked; no-op) → sets `checked`, increments `wrong` if incorrect; correct option turns green, wrong pick turns red; feedback "Correct! Well done." / "Not quite. The right answer is highlighted in green." Then `Continue` → next step (one attempt per question).
- **Recite**: "Now recite {level name minus ' sutra'} aloud"; "Listen once more, then tap the microphone and recite. We'll check your pace and pronunciation."; mic button state machine 0 "Tap to start" (orange) → 1 "Listening… tap to stop" (red, pulsing) → 2 "Clear recitation · steady pace" (green) with feedback "Anumodana! Your recitation matched the reference audio well." Primary: while `mic < 2` it is grey `Skip recitation for now`; after recording, green `Continue`. Either finishes the level.
- Lesson content: only "Iriyavahiyam sutra" has authored content (meaning: "Iriyavahiyam asks forgiveness for any harm caused to living beings while moving about, such as walking, so that we begin Samayik with a clear mind." + 2 questions: "What does Iriyavahiyam ask forgiveness for?" → "Harm caused to living beings while moving"; "In the Samayik vidhi, which sutra comes right after Iriyavahiyam?" → "Tassa Uttari sutra"); every other level uses a generic placeholder lesson ("Learn the meaning, listen to the recitation and practice line by line. Content for this level comes from JSH Pathshala.") with 2 meta questions (content source → "JSH Pathshala teachers"; what earns more stars → "Answering correctly and reciting clearly").

## 3.5 Screen: Level complete

"LEVEL {n} COMPLETE", level title, 3 large stars (gold vs dim), tiles `+{pts} JSH points` / `{streak} day streak` / `{accuracy}`; optional "Treasure unlocked: {reward}"; next line "Next up: level {n+1} · {name}" or "You completed {goal}. Your teacher sign-off is next."; CTA `Next level` (→ lesson) or `Choose a new goal` (→ goals); `Back to my path`.

## 3.6 Scoring rules (from `finish()`)

- `earnedStars = max(1, 3 − wrong)` → 3/2/1 for 0/1/2 wrong answers.
- **Skipping recitation caps stars at 2**: `stars = mic < 2 ? min(earnedStars, 2) : earnedStars`.
- `points = 10 + stars × 10` → 20 / 30 / 40 per level.
- `accuracy = (2 − min(2, wrong)) / 2` → 100 / 50 / 0 %.
- `done[goal] = min(total, done[goal] + 1)`; streak 11 → 12 on the first completion (i.e. one increment per day).
- Treasure at level index k unlocks when that level is completed (`chest[doneN − 1]`).
- Replaying completed levels can raise stars (toast says so; replay flow itself not built).

## 3.7 Data entities implied

- `LearningGoal {id, name, mark, tint, description, est_duration, levels[], chapters[{start_index, title, color}], treasures{level_index: reward}, recommended: bool}`.
- `Level {index, name, meaning, sutra_text (gu/hi/translit + word meanings), audio_url (~0:42), questions[{text, options[3], answer_idx}], is_boss}`.
- `LearnerProgress {member_id, goal_id, levels_done, stars_per_level[], daily_goal_minutes ∈ {5,10,15}}`.
- `LevelAttempt {goal_id, level_index, wrong_count, recitation_done: bool, stars, points, accuracy, completed_at}`.
- `Wallet {points_total, streak_days}` — shared with "My Jain Way".
- `TeacherSignoff {member_id, goal_id, teacher_id, signed_at}` — required after the final level.
- `FamilyLearningView {child_name, goal, level_of_total}`.

## 3.8 Business rules

1. Levels unlock strictly in order; the last level of each goal is the "boss"/performance level and requires a **Pathshala teacher sign-off**.
2. Each level = learn + 2-question quiz + recitation; recitation is optional but skipping limits the reward to 2 stars; minimum 1 star always awarded.
3. Points (20–40 per level) and streak feed the community-wide "My Jain Way" wallet; treasure badges/bonus points at fixed levels (e.g. "+50 bonus points").
4. Content (order, text, audio) is supplied by JSH Pathshala and may vary by tradition.
5. Placement/"quick check to skip ahead" is promised for unstarted goals.
6. Parents see children's goal/level progress.
