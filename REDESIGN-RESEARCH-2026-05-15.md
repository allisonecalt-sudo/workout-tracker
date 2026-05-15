# Workout-Tracker — UX/UI Redesign Research

**Date:** Fri May 15, 2026, ~14:30 JDT
**For:** Allison
**From:** Design-research agent (third pass today — after AUDIT, VISUAL-EXERCISE-RESEARCH, and the consolidated UX fix ship)
**Bar:** A senior-product-designer's deck. Substantive, opinionated, concrete. No code in this run — recommendations only.

> Allison's ask, verbatim: _"make an agent who fiest will do endless research on workout apps, then review this conversation, then review who i am what i need and what im looking fo rnad then it will give the ux ui updates for htapp, and also i want to see a more modenr looking app"_

---

## Reading Map

- §A — Operator portrait (who she is, what she values)
- §B — Current-state assessment (what works, what looks dated)
- §C — Research findings (8 stealable moves from 2025-2026 fitness apps)
- §D — Three redesign directions to choose from (the A/B/C decision)
- §E — Component-by-component redesign proposals (direction-agnostic)
- §F — Navigation map ("I can't move around" — fixed)
- §G — Implementation sequencing (4 ship groups, ≤1 session each)
- §H — Decision questions for Allison
- §I — Sources / references

---

## §A — Operator Portrait

> One-page synthesis of who Allison is in 2026 and how she actually uses this app. Source: `CLAUDE.md` + `synthesis/patterns-analysis.md` (Live Edge) + `self/health.md` + `workout.md` + `journey/workout-log.md`.

### Who she is

- **32. Jerusalem. OT clinician + builder-operator + AI-mastery practitioner.** Three axes (May 13, 2026 audit, primary order): (1) operating software for her life, (2) capability push (clinical earning + skill development — ~₪8,820 banked in 2 months from שעות נוספות alone), (3) AI-mastery training surface. The workout app sits inside axis 1 — it's life infrastructure, not a product to ship.
- **Pattern-recognition machine. Builds through friction, not planning.** _"Architects by collision."_ Doesn't pre-plan. Starts messy. The May 2 workout-tracker existed because three prior exercise declarations (March 18, 19, 23) all failed at the rest→active transition; the tool itself became the initiation. That pattern is now **Confirmed Baseline** (Live Edge, May 8).
- **Builder + Caretaker + Connector + Poet** in rotation. This app is Builder-mode output for Caretaker-mode self-care. The Poet shows up in the one-word log field — _"good start," "Proud," "Happy reminder that knnee left hurts a l."_
- **Tandem-architecture is non-negotiable.** Anything that lives somewhere Claude can't read or write breaks the model. localStorage-first → Supabase mirror = correct shape. No paper logs. No locked dashboards.

### What she values aesthetically

- **Calm > gamified.** No streak fire-emojis. No "you crushed it!" No motivational language. The current week-banner copy _"Three rotating sessions. Show up 3x/week."_ is the correct register — declarative, low-affect, factual.
- **Dark > light.** Every system she keeps is dark — Linear-style. The current `#1a1f1c` near-black + sage `#8fbc8f` accent is on-axis.
- **Dense > whitespacey when she's actively scanning, but spacious when she's resting in a screen.** Home page = scan multiple workouts at once. Mid-workout = one big number plus one big button.
- **Voice-fluent.** She talks fast, processes by talking, uses voice-to-text mid-walk. Anything that requires precise tapping is a tax on her dominant mode.
- **Information-density tolerance is HIGH.** She built a 13-screen budget app. She doesn't bounce off charts; she bounces off chrome. Per `feedback_minimal_changes.md` and the May 11-13 system-cleanup arc: **subtraction is the default direction**, never addition. _"What does this retire?"_

### Body context — TODAY (Fri May 15, 2026)

- **Right wrist: CLEARED for daily active use** (Lisa Cohen, May 10). Brace at work only. "Crazy improving."
- **Left wrist: quiet but unconfirmed.** Self-tracking says 0/10 across 5 sessions. No PT-level statement on the left side yet.
- **Forearm plank: CLEARED today** (May 15). Forearms yes, palms still no. Week-3 progression slots a 15-sec plank into Workout A as the heel-tap replacement.
- **Back: better than baseline.** September 2025 floor still respected. Pain readings 2→1→0→1→0 across 5 sessions, monotonic-ish improvement.
- **Mounjaro lean-mass concern** is the medical _why_ strength training is non-optional. Strength = drug-pairing requirement, not aesthetic.
- **Crohn's: 4-month healthy streak.** Not a current constraint.
- **Goal for summer:** _"agile + strong for summer hikes and moving"_ (apartment move expected). Slow build.

### Operating mode mid-workout

- **Phone-on-shelf.** Sweaty hands. 3 feet from face. Sometimes mid-walk. Sometimes lying on the floor with the phone propped against a knee.
- **2-second glance window.** She looks up, gets oriented, looks back at the exercise.
- **Hands-free is the standard.** No grip required. No swipe gestures that demand a confident fingertip on a sweaty hand. Big tap targets.
- **One primary action per screen.** The May 15 Done · Next promotion was correct. Quit demoted to a header text-link was correct.

### What she's said today about THIS app

> _"the timer should be better in general"_ (May 15 audit trigger)
> _"explanations are hard for me to read… I always have to watch the video"_ (visual-research trigger)
> _"I can't move around"_ (navigation pain — the immediate trigger for this redesign pass)
> _"I do want to obviously improve… keep it slow… go a little bit harder but always think about times and strains"_ (week-3 regroup, body-state framing)
> _"i want to see a more modenr looking app"_ (this brief)

What she has NOT said but is implied by the journey-log + Supabase data:

- The history view is a list, not a story. She has 5 sessions of capacity-before/after data, wrist trends, back trends, and one-word entries — and the current app shows zero charts. She built a 13-screen budget app with sparklines; she'd appreciate the same here.
- The week-dot strip is locked to today's calendar week. She just told us she wants to step through past weeks. That's a navigation gap, not a styling gap.
- The visual layer (just shipped today, Group 3M-R in `FIXES-2026-05-15-CONSOLIDATED.md`) is good but it's bolted on top of a layout that wasn't designed around it. The exercise screen now has 4 cards stacked vertically (name+reps card, visual card, tempo card, how-to card, then the Done button). That's a lot of cards. Modern apps merge these into a single, layered hero unit.

### What she will likely reject

- **Streaks and gamification.** "5-day streak 🔥" is the wrong vibe. Calendar dots colored by workout = good. Confetti = bad.
- **Motivational language.** "You've got this!" "Crush your goals!" Anything Apple Fitness+ would say in their celebratory motion design — strip it.
- **Coach-led, instructor-forward layouts.** Peloton/Centr/Future — the whole "premium content library" pattern doesn't fit. She's the coach. The app is the tool.
- **Bottom tab bar with 5 icons.** She has 3 screens she navigates to (home, history, history-detail) plus 2 transient (pre-log, workout, post-log). A tab bar would create real estate she doesn't need to fill.
- **Anything that hides data behind a tap when the data is the point.** Capacity-before-vs-after deltas. Wall-sit progress. Back-pain trend. These should be visible, not buried.

---

## §B — Current-State Assessment

> Looking at the actual May 15 ship (after the consolidated agent landed). Screenshots: `after-consolidated-01..09`.

### What works (don't break)

| Element                                                                             | Why it works                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark palette (`--bg #1a1f1c`, `--accent #8fbc8f` sage)                              | On-axis with her aesthetic. Calm. Not monastic — there are three accent dot colors (A=green, B=blue, C=purple) that carry workout identity without shouting.                            |
| Week-dot strip (post-fix, Sat-Fri anchored)                                         | The single most stealable component in the app. Glanceable, no chrome, action-attached (tap → history-detail).                                                                          |
| Today's-pick chip with `border: 2px solid var(--accent)` + 80% opacity on non-picks | The right way to surface a recommendation without telling. Hierarchy through opacity, not banners.                                                                                      |
| Done · Next promoted; Quit demoted to header text-link                              | Single-primary-action discipline. Hold-to-skip on rest screen is accident-proof.                                                                                                        |
| One-word log field                                                                  | Tiny field, enormous information density per character. _"Happy reminder that knnee left hurts a l"_ logged a positive emotional state AND a body signal in one truncated string. Keep. |
| Multi-frame how-to card                                                             | Do/Avoid green-check / orange-X is correct. The pattern is good.                                                                                                                        |
| Local-first + Supabase mirror                                                       | Architecture-correct for tandem. No change needed.                                                                                                                                      |
| Capacity slider with anchor labels ("1 — depleted · 5 — baseline · 10 — strong")    | Anchors solve the "what does 7 mean?" problem cleanly.                                                                                                                                  |
| Pre-log wrist banner                                                                | Status truth, no paternalism. "Wrist: cleared by Lisa Cohen (May 10). Stop if anything pings." Correct register.                                                                        |

### What feels DATED (the brief)

| Concern                                       | Specific call-out                                                                                                                                                                                         | Why it reads as "circa 2020"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Typography hierarchy**                      | `h1` 28px / `h2` 22px / `h3` 18px UPPERCASE / `exercise-name` 30px — all sans-serif at body weight 600-700. No variable font. No optical sizing. Letter-spacing only applied to ALL-CAPS labels.          | Modern reference points (Linear, Stripe, Apple Liquid Glass) lean into variable fonts (Inter Variable, SF Pro, sohne-var), tighter letter-spacing on large display (-0.025 to -0.03em), and a wider type ramp (12 / 14 / 16 / 18 / 22 / 32 / 56). The current 18-22-28-30 ramp is compressed; nothing is _small enough to be a label_ and nothing is _large enough to be a moment_.                                                                                                                                                                                                          |
| **Card / button shape / shadow / radius**     | `--radius: 14px`, `--radius-lg: 22px`, `box-shadow: 0 4px 16px rgba(0,0,0,0.3)`. Cards are filled `bg-elev` (`#232a26`) rectangles. Buttons are filled blocks.                                            | 2025-2026 norms have moved to **fewer drop shadows, more border-only cards** (1px subtle separator color), tighter radii on small chrome (8-10px), and looser radii on hero surfaces (20-28px). The current "everything is a card with a shadow" pattern reads as Material Design circa 2018. Linear, Things 3, Stripe all sit closer to _flat surfaces + 1px separators + the occasional 28px hero card_.                                                                                                                                                                                   |
| **Motion**                                    | Single `@keyframes pulse` on the pre-countdown number. `transition: width 0.3s` on the progress bar. `stroke-dashoffset 0.4s linear` on the rest ring. Total motion footprint: 3 transitions.             | Modern apps lean into **spring-physics** transitions (Framer Motion, SwiftUI springs, CSS spring() in 2025+). Page transitions, button press, capacity-slider thumb, exercise advance — all opportunities for natural rebound. The current app has zero between-screen motion; screens snap.                                                                                                                                                                                                                                                                                                 |
| **Color — green-on-near-black**               | `--accent #8fbc8f` is THE one accent color, applied to: pick-badge, completed-bar fill, primary button, range value, ring-foreground, capacity slider thumb, week-dot-A, stat-numbers, sync-synced state. | One accent doing 9 jobs flattens hierarchy. Linear's 2025 design refresh **cut accent color use further** (monochrome black/white with even fewer bold colors) — but compensated with a _contrast variable_. Apple's Liquid Glass and Peloton's redesign both **reserve a saturated accent for one role only** (Peloton: critical actions; Apple: liquid-glass-active state) and use grayscale + opacity for everything else. The current app over-uses sage; the redesign should reserve sage for two things (primary action, in-progress state) and let everything else live in grayscale. |
| **Information density**                       | The exercise screen stacks 4-5 cards vertically: name+reps card → visual card → (optional tempo card) → how-to card → Done button. Below-the-fold scroll on a 390×844 viewport.                           | Modern in-workout screens compress this into a single layered hero: video/image as the background or large foreground, exercise name + reps overlaid, how-to expander floats below as a single utility line. See: Apple Fitness+ in-class overlay (workout intensity, exertion, music, exit — all in one floating bar), Nike Training Club in-set screen (figure animation + name + rep counter, single screen no scroll).                                                                                                                                                                   |
| **Today's-pick differentiation**              | Border + opacity is correct, but subtle. On a quick glance, the three workout cards read as equal.                                                                                                        | Lean harder: TODAY'S PICK badge inside the card is good; the non-picks should also drop in visual weight (smaller type, dimmer background, less padding) — not just opacity.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Week-dot strip — single static row**        | Right now: 7 dots, today's calendar week only. No way to step back.                                                                                                                                       | Modern apps make this **pannable** (horizontal scroll, swipe gesture) OR **expandable** (tap to open month grid). Pannable is the minimum bar; GitHub-contribution-style year grid is the stretch.                                                                                                                                                                                                                                                                                                                                                                                           |
| **History — list with no charts**             | Recent rows are textual: `cap 5→5 · wall 0s · back 0`. No trend lines, no visualization.                                                                                                                  | Wall-sit duration is the _one_ explicit benchmark Allison set ("track the time held"). It's perfect sparkline material. Capacity-before-vs-after Δ is exactly the signal her data shows (net energy-positive most sessions). Both should be visible without tapping into a session.                                                                                                                                                                                                                                                                                                          |
| **No haptic / animation completion feedback** | When you tap Done · Next, the screen swaps. No "yes, registered" affordance. Pure HTML/CSS.                                                                                                               | Cheap win: a brief checkmark fade-in (200ms), accent flash on the button before swap, and a `navigator.vibrate(8)` pulse on mobile. Doesn't require a framework.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Capacity slider — plain HTML range**        | `<input type="range">` styled via `accent-color`. Works, but it's a slim grey track with a dot.                                                                                                           | One of the most-touched controls in the app. Modern apps express capacity through tactile UI: stepped pills, a 1-10 row of touchable circles with a connecting line, or a curved arc. Even a `<input type="range">` with a custom thumb (larger, glow on focus, snap-to-tick on release) would feel more modern.                                                                                                                                                                                                                                                                             |

### Subjective: what makes a 2025 app feel 2025

After ~15 fitness and adjacent-app reference points:

1. **One accent color, used sparingly.** Not "the brand color everywhere."
2. **Variable typography** with at least one moment of large display type.
3. **Spring-based motion.** Things snap with a slight overshoot.
4. **Border-1px separators** over drop shadows.
5. **Big text + small data.** A 56px number sitting above a 12px label — not 22px / 14px.
6. **Glanceability is layered, not flat.** The most important thing on screen is 2× bigger than the second-most-important thing.
7. **No motivational language.** The app says what is, not how to feel about it.
8. **History is a chart, not a list.** Even if the chart is one sparkline.

The current app gets 1, 4 (partly), and 7. The gap is 2, 3, 5, 6, 8.

---

## §C — Research Findings — 8 Stealable Moves

> Cross-app design moves observed across the references in §I. Each: what it is, why it works, can-she-build-it-on-the-TS-on-GH-Pages stack?

### 1. The "single layered hero" exercise screen — Apple Fitness+, Nike Training Club, Peloton in-class

**What:** One screen, one visual element fills the upper 50-60%, exercise name overlays on it (or sits immediately below), rep count is _prominent_ (44-72px), all secondary info (form notes, how-to, tempo) collapsed to a single utility row that opens on tap.

**Why it works:** Mid-set, attention is divided. The screen has to compete with the user's body. Forcing the eye through 4 stacked cards loses to 1 layered hero every time.

**Buildable here? YES.** Pure CSS. The current `exercise-visual` and `exercise-display` cards already exist — they just need to be merged into a single layered surface with the visual on top, name+reps in front of the visual or directly below, and how-to demoted to a 36px utility row at the bottom.

### 2. Reserve the accent color for one role — Peloton's "saturated neon red for actions only" + Linear's "cut color further" 2025 refresh

**What:** Pick one role (most commonly: primary action button + in-progress timer). Everything else — borders, icons, dots, subtle UI — lives in grayscale or `accent-dim` at 40-60% opacity.

**Why it works:** When the eye sees the accent, it knows what it means. Right now, sage means "this is the picked workout" AND "this is the primary button" AND "this is the stat number" AND "this is the sync status" AND "this is the timer" AND "this is workout A's dot." The signal is diluted to noise.

**Buildable? YES.** CSS variable refactor. Add `--accent-text` (a desaturated sage for text), `--accent-active` (current sage, reserved for active state + primary button), keep `--accent-dim` for hover. Stat-numbers move to `--text` (warm white). Workout A dot stays sage but loses the saturated quality of the primary button (use `--accent-dim` for the dot).

### 3. The pannable week strip / month grid — Things 3 calendar, Strava weekly heatmap, GitHub contribution graph

**What:** Horizontal-scroll strip of weeks (`overflow-x: auto` with `scroll-snap-type: x mandatory`). Each week is a 7-dot column. Default view is current week; pan left to see prior weeks. Tap-and-hold for month grid.

**Why it works:** Directly fixes "I can't move around." Past weeks become a swipe, not a navigation event. The month grid (GitHub-style heatmap) gives 8-12 weeks at once for the "am I still showing up?" question.

**Buildable? YES, two-stage.** Stage 1: change the week-dots row from `display: flex` to a `scroll-snap` container with N weeks pre-rendered (start with 8). Stage 2 (optional): a separate "year view" route that renders the full GitHub-grid layout — ~52 weeks × 7 days = 364 cells × 24px = small and fast.

### 4. The capacity-before/after Δ as a glanceable badge — Headspace mood, Caliber readiness

**What:** Each session in the history list gets a small badge: `5→8 (+3)` rendered in green-tint, `7→5 (−2)` in red-tint, `5→5 (=)` in gray. The Δ is the _story_ of the session.

**Why it works:** Allison's own Supabase data shows the headline pattern: workouts are net energy-positive (3 of 3 measured sessions: 9→10, 5→10, 5→5). She is doing the math in her head looking at the textual "cap 5→5." A colored badge does it for her.

**Buildable? YES.** Pure HTML/CSS — calc Δ in `renderHistory()` and render with a class. ~15 lines of code, but a doc-only ask.

### 5. The sparkline on the exercise itself — Hevy exercise history pop-down, Fitbod muscle-group recovery indicator

**What:** Wall-sit screen shows a tiny 60×20px inline sparkline of the last 5-10 wall-sit durations. The line points up if she's progressing, flat if she's holding, down if she's slipping.

**Why it works:** Wall sit is the _one_ explicit benchmark she set (`workout.md`: "this is your weekly progress benchmark — track the time held"). The data exists in Supabase. The app currently never shows it back to her. The sparkline is the smallest possible answer to "am I getting stronger at this?"

**Buildable? YES.** SVG polyline, no library needed. The query is `loadLogs().filter(l => l.workout === 'A' && l.wallSitSec > 0).slice(0, 10).map(l => l.wallSitSec)`. Render once during workout. ~30 lines of code.

### 6. The "weekly review" Sunday-evening screen — Strava weekly summary, Peloton "your week," Things 3 "Today" with weekly anchor

**What:** A dedicated route surfaced once per week (typically Sunday evening or Saturday — for Allison, Friday afternoon as week-end, then Saturday-start). Shows: sessions completed vs target, one-word entries listed, capacity trend mini-chart, back-pain trend mini-chart, one open question.

**Why it works:** Matches the weekly-review pattern Allison already does manually in `journey/workout-log.md`. Currently that's a chat-with-Claude ritual. Surfacing it inside the app turns it into a self-serve check-in. The May 13 `WEEK-3-REGROUP-2026-05-15.md` doc is _exactly_ what this screen should produce automatically — Allison shouldn't have to ask Claude to run a weekly regroup if the app can show her 80% of it.

**Buildable? YES.** A new `weekly-review` screen route. Queries existing localStorage + Supabase data. No new schema. The "one open question" can be hand-curated for now and AI-generated later.

### 7. Hold-to-confirm for destructive actions — already done; extend the pattern

**What:** The May 15 ship added hold-to-skip-rest. Extend the pattern to: quit-workout, delete-session, reset-data.

**Why it works:** Allison has tendinitis; fat-finger taps happen. Hold-to-confirm is accident-proof without being annoying — a 500ms hold is shorter than reading a confirm dialog.

**Buildable? YES.** `wireHoldToSkip` is already factored out. Apply to two more buttons.

### 8. Big number / small label hierarchy — Linear, Stripe Dashboard, Things 3, Spotify Wrapped

**What:** When showing a stat, the number is 2-3× bigger than the label. The label is small-caps, dim. Example: `28 sessions` becomes `28` at 56px above `total sessions` at 11px small-caps. Or `42m` at 32px above `this week` at 11px.

**Why it works:** Big number = the thing that matters. Small label = the context. Reading order: number first, label second. Most apps invert this (label above, number same-size below) and it reads as "data table." Big-number-small-label reads as "dashboard."

**Buildable? YES.** Already partly in place (`.stat-number` 28px, `.stat-label` 12px). Push it further — make stat numbers 48-56px on the home screen.

### Bonus — what NOT to steal

- **Glassmorphism / Apple Liquid Glass.** Visually current, but per Apple's own beta feedback: "menu legibility issues, distracting glossy nature, low contrast over blurred backgrounds." Wrong fit for sweaty-hands mid-set. Don't.
- **3D anatomy renders (Fitbod).** Already evaluated in VISUAL-EXERCISE-RESEARCH §3 — overkill for solo TS-on-GH-Pages stack.
- **Coach-chat interface (Future, Caliber, Bloom).** The system architecture is wrong — she's the coach. A chat UI inside the app conflicts with the "talk to Claude in the dedicated brain" workflow.
- **Bottom tab bar (Strava, Peloton).** Fills space she doesn't need to fill. Home is the hub; everything is one tap away.
- **Streak fire emojis (Duolingo and 80% of habit apps).** Will be rejected. Per `feedback_morning_checkin_style.md` + the no-paternalism rule.

---

## §D — Three Redesign Directions

> Three coherent visual languages to choose from. Each is internally consistent; mixing them produces incoherence. Pick exactly one.

---

### D-1 — "Calm Tool Minimalism" (Things 3 / Linear 2025 axis)

**Vibe in one line:** A task manager that happens to be about exercise. Generous whitespace, no chrome, big quiet type.

**What changes:**

- **Type:** Inter Variable, optical sizing on. Display sizes 32 / 44 / 56 with -0.02em letter-spacing. Body 15-17px. Labels 11px small-caps with 1.5px letter-spacing.
- **Color:** Reserve sage `#8fbc8f` ONLY for the primary action button + the active timer ring. Everything else moves to grayscale + opacity. Workout A/B/C dots become muted: A=`#7a9070` (desaturated sage), B=`#7088a0` (steel), C=`#8a7a8e` (mauve). The picked card is highlighted by a single 1px sage border, no fill change.
- **Shape:** No drop shadows. Cards are flat surfaces separated by `1px solid rgba(255,255,255,0.06)`. Radii pull back: 8px for inputs, 14px for cards (kept), 24px for the hero unit.
- **Motion:** Spring-physics on screen transitions (300ms, mild overshoot). Buttons get a tiny scale-press (0.98 → 1.0 on release). Stat numbers count up from 0 on first paint.
- **Navigation:** Home stays the hub. Pannable week-strip is the primary navigation surface. Long-press on any week-dot opens the month grid.
- **Density:** Home becomes a single scrollable column with the week strip pinned to the top. Workout pick cards are slimmer (less padding, less border). The hero unit on home is a single big number: `Week 3 · 2 of 3` at 44px.

**What stays:** Dark palette. Sage as the accent. No gamification. Voice-fluent. The whole `EXERCISE_HOWTO` system. The Done · Next discipline.

**ASCII mockup — home (D-1):**

```
+--------------------------------------+
|                                      |
|  Workout Tracker                     |
|  three sessions, three a week        |
|                                      |
|  ◀  W1   W2   W3 •   ─               |
|     · · ·  · ·   A  ·                |
|                                      |
|  ┌────────────────────────────────┐  |
|  │                                │  |
|  │   2                            │  |
|  │   of 3 this week               │  |
|  │                                │  |
|  │   ▁▂▃▅█  ← capacity trend     │  |
|  │                                │  |
|  └────────────────────────────────┘  |
|                                      |
|  TODAY                               |
|                                      |
|  ┌────────────────────────────────┐  |
|  │ C · Walk + Core         today  │  |
|  │ 25-min walk, 2-round block     │  |
|  └────────────────────────────────┘  |
|                                      |
|  ─  A · Lower Body         3 rounds  |
|  ─  B · Glutes + Mobility  3 rounds  |
|                                      |
|  RECENT                              |
|  May 14 · B · 7m12s · 5→5  =        |
|  May 11 · A · 6m10s · 5→10 +5  ↑    |
|  May 8  · C · 18m49s· 9→10 +1  ↑    |
|                                      |
+--------------------------------------+
```

**ASCII mockup — in-workout (D-1):**

```
+--------------------------------------+
| Workout A                  × quit    |
|                                      |
| Main · Round 1 of 3 · Ex 1 of 6      |
| ████░░░░░░░░░░░░░░░░  16%            |
|                                      |
|  ╭──────────────────────────────╮   |
|  │                              │   |
|  │   [exercise visual,          │   |
|  │    fills card]               │   |
|  │                              │   |
|  ╰──────────────────────────────╯   |
|                                      |
|  Bodyweight squats                   |
|  12 reps  ·  3-1-3 tempo             |
|                                      |
|  ━━━ ━ ━━━                           |
|                                      |
|  ▸ how to do it       ▸ watch video  |
|                                      |
|                                      |
|  ┌──────────────────────────────┐   |
|  │       Done · Next            │   |
|  └──────────────────────────────┘   |
+--------------------------------------+
```

**Effort:** **M.** ~3 sessions of work. Typography + color refactor first (1 sess), then layout collapse for in-workout (1 sess), then weekly review screen + month grid (1 sess).

**Risk:** Could feel cold / institutional if executed too purely. Things 3 risks the same — some users find it precious. Mitigation: keep one warm note — e.g., the one-word log field rendered as a handwritten-italic blockquote in history.

---

### D-2 — "Apple Fitness+ Layered Hero" (cinematic, motion-forward)

**Vibe in one line:** Like an Apple Watch workout screen, but for her three home routines.

**What changes:**

- **Type:** SF Pro / Inter, heavy weights on display (700), light weights on labels (400). Numbers in tabular-nums always. Numeric display 64-96px in-workout.
- **Color:** Same dark base, but introduce subtle radial gradients per workout (A = sage→graphite gradient corner, B = steel-blue→graphite, C = mauve→graphite). Visual identity per workout strengthens without adding a 2nd accent.
- **Shape:** Hero cards 28-32px radius, smaller cards 12px. No drop shadows; subtle 1px inner-border `inset 0 0 0 1px rgba(255,255,255,0.06)` for elevation. Glassmorphism explicitly avoided (legibility risk).
- **Motion:** Heavy. Every screen swap is a spring fade-and-slide (220ms). The capacity slider thumb has a "magnetic snap" to integer ticks. The rest ring counts down with a subtle accent-glow pulse at the 10-sec mark. Done · Next press triggers a 400ms checkmark overlay before the screen advances.
- **Navigation:** Home + a horizontal swipe between three "tabs" inline-on-home: This Week / Recent / Progress. Each tab is full-bleed.
- **In-workout:** Single hero unit fills 60% of the viewport. Visual is the background (slightly dimmed with a black-to-transparent gradient overlay so text stays legible). Exercise name + reps in 32-44px on top of the gradient. Rest screen is a near-fullscreen ring with the seconds count at 96px center.

**What stays:** Dark palette. Sage as primary action. No gamification. The data model. Done · Next discipline.

**ASCII mockup — home (D-2):**

```
+--------------------------------------+
|                                      |
| Workout Tracker         synced ✓     |
|                                      |
| ╭──────────────────────────────────╮ |
| │                                  │ |
| │           2 of 3                 │ |
| │      sessions this week          │ |
| │                                  │ |
| │  s  s  m  t  w  t  f             │ |
| │  ·  ·  A  ·  ·  B  · ←           │ |
| │                                  │ |
| ╰──────────────────────────────────╯ |
|                                      |
| ╭──────────────────────────────────╮ |
| │ TODAY'S PICK                     │ |
| │                                  │ |
| │ C                                │ |
| │ Walk + Core                      │ |
| │ 25-min walk, 2-round block       │ |
| │                                  │ |
| │           [  start  ]            │ |
| ╰──────────────────────────────────╯ |
|                                      |
|  This Week    Recent    Progress     |
|  ──────────                          |
|  May 14 · B  ◯ → ◯  ─                |
|  May 11 · A  ◯ → ●  ↑                |
|  May 8  · C  ◯ → ●  ↑                |
|                                      |
+--------------------------------------+
```

**ASCII mockup — in-workout (D-2):**

```
+--------------------------------------+
| Workout A           round 1/3  ×    |
|                                      |
| ╭──────────────────────────────────╮ |
| │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ |
| │░░░░░░░░░ exercise visual ░░░░░░░│ |
| │░░░░░░░░░ fills hero card  ░░░░░░│ |
| │░░░░░░░░░ with gradient    ░░░░░░│ |
| │░░░░░░░░░ overlay          ░░░░░░│ |
| │░░░░                          ░░░│ |
| │░░░░ Bodyweight squats        ░░░│ |
| │░░░░ 12 reps · 3-1-3          ░░░│ |
| ╰──────────────────────────────────╯ |
|                                      |
|  ▸ form          ▸ watch how         |
|                                      |
|                                      |
|                                      |
| ┌────────────────────────────────┐   |
| │        Done · Next             │   |
| └────────────────────────────────┘   |
+--------------------------------------+
```

**Effort:** **L.** ~5-6 sessions. Spring-physics library or hand-rolled animation, gradient generation per workout, hero-layout rebuild, swipe-gesture handling, plus all of D-1's gains.

**Risk:** Motion can feel performative if overdone. "Workout tracker that puts on a show" risks the gamified register Allison rejects. Mitigation: keep motion _subtle_ — overshoot ≤8%, durations ≤220ms, no bouncing physics. Apple Fitness+ actually does this restraint well; Peloton does it badly.

---

### D-3 — "Quiet Dashboard" (Stripe / Linear analytics axis)

**Vibe in one line:** Stripe dashboard, but for one human's body. Data-forward, very few cards, lots of small numbers and sparklines.

**What changes:**

- **Type:** Inter Variable. Display 28-44px. Labels 10-11px small-caps in a `--text-dim-2` (#838079) even dimmer than current. Numbers always tabular.
- **Color:** Same dark base. Accent reserved for primary action AND chart fills only. Multi-color encoded into sparklines themselves (capacity trend = sage, back trend = amber, wall-sit trend = blue).
- **Shape:** Borderline-flat. `1px solid rgba(255,255,255,0.06)` separators replace card shadows entirely. Hero element on home is _not_ a card — it's a row of 3 stats with sparklines underneath each.
- **Motion:** Almost none. Spring on press (0.98 scale). No transitions between screens — instant snap, Linear-style. Sparklines animate-in on first paint (200ms left-to-right draw).
- **Navigation:** Home is dense. Top: pannable week strip. Middle: 3-stat row + 3 sparklines. Bottom: workout pick + last 5 sessions condensed to 2 lines each.
- **In-workout:** Compact. Visual is smaller (40% of viewport), data lives below.

**What stays:** Dark palette. No gamification. Voice-fluent.

**ASCII mockup — home (D-3):**

```
+--------------------------------------+
| WORKOUT TRACKER · WEEK 3 · MAY 16-22 |
|                                      |
|  ◀ W1  W2  W3 ← today    →           |
|    ·· · ·  · A · ·                   |
|                                      |
|                                      |
|  SESSIONS  WALL SIT     BACK PAIN    |
|     2         32s          0/10      |
|   of 3      +6 wk-2      −1 wk-2    |
|  ▁▂▃▅█    ▁▁▂▃▅▆       █▆▅▃▂▁       |
|                                      |
|                                      |
|  ─────────────────────────────────   |
|  TODAY                               |
|                                      |
|  C  Walk + Core (cardio day)     →   |
|  25-min walk · 2-round core block    |
|                                      |
|  A  Lower Body                       |
|  B  Glutes + Mobility                |
|                                      |
|  ─────────────────────────────────   |
|  RECENT                              |
|                                      |
|  THU MAY 14  B   7m 12s   5→5  =     |
|  MON MAY 11  A   6m 10s   5→10 +5    |
|  FRI MAY 8   C  18m 49s   9→10 +1    |
|  TUE MAY 5   B   —        6→5  −1    |
|  SAT MAY 2   A   —          —        |
|                                      |
+--------------------------------------+
```

**ASCII mockup — in-workout (D-3):**

```
+--------------------------------------+
| WORKOUT A · MAIN · R1/3 · EX 1/6  ×  |
|                                      |
| ▮▮▮▮▮▮▮▮░░░░░░░░░░░░░░░░░░ 17%       |
|                                      |
|   ╭──────────────────────╮           |
|   │   [exercise visual]  │           |
|   │   smaller, 4:3       │           |
|   ╰──────────────────────╯           |
|                                      |
|   BODYWEIGHT SQUATS                  |
|   12 reps · 3-1-3                    |
|                                      |
|   ━━━ ━ ━━━     down hold up         |
|                                      |
|   ▸ how to do it                     |
|   ▸ watch full video                 |
|                                      |
|  ┌───────────────────────────────┐   |
|  │        DONE · NEXT            │   |
|  └───────────────────────────────┘   |
+--------------------------------------+
```

**Effort:** **S-M.** ~2 sessions. Mostly typography + spacing refactor + 3 sparkline SVGs.

**Risk:** Can feel dry. The data-forward register fits Allison-the-builder; might not fit Allison-the-tired-Friday-afternoon. Mitigation: keep the one-word log field warm — render in italic, larger than other meta-data.

---

### D — Summary table

|                         | D-1 Calm                     | D-2 Apple-layered                 | D-3 Quiet Dashboard     |
| ----------------------- | ---------------------------- | --------------------------------- | ----------------------- |
| Vibe                    | Things 3 of fitness          | Apple Fitness+ home               | Stripe dashboard        |
| Effort                  | M (3 sess)                   | L (5-6 sess)                      | S-M (2 sess)            |
| Risk                    | Could feel cold              | Motion-performative               | Could feel dry          |
| Hero unit               | Big stat block               | Hero visual+text                  | 3-stat row + sparklines |
| Charts?                 | Light (1 sparkline)          | None (motion does the work)       | Heavy (3+ sparklines)   |
| Motion                  | Modest spring                | Heavy spring + overlays           | Almost none             |
| Charts on home          | 1 small                      | 0 (in-progress tabs)              | 3 always-on             |
| What it sacrifices      | Visual richness              | Build time + complexity           | Warmth                  |
| What it gains           | Calm, easy to maintain       | Modern feel, glanceability        | Data legibility, speed  |
| Best fit if she says... | "make it calmer and cleaner" | "make it feel premium and modern" | "show me the numbers"   |

**My read:** D-1 is the right answer. It's closest to the apps she already lives in (Things 3, Linear, Stripe checkout), it respects the no-gamification rule, the effort is right-sized for a tandem-maintained personal app, and it scales gracefully — most of D-3's data moves can be added later as Phase 2 without breaking the language. D-2 is appealing on the demo screen but the motion budget is real, and the Apple-Fitness-Plus register starts to feel "premium content app" which is the wrong category for what this is.

---

## §E — Component-by-Component Redesign Proposals

> Direction-agnostic. Apply the chosen direction's type/color/motion language to each.

### E-1 — Home screen

**Current state:** Workout-Tracker H1, subtitle, week-banner pill, sync indicator, Week N progress card (2/3 stat + total + week-dots), workout picker, last-line, recent workouts list.

**v2 proposal:**

- Title row condenses: small title + week range inline (no separate banner pill).
- Pannable week strip at top, sticky on scroll (8 weeks loaded, current week centered).
- Hero stat block — 3 stats with sparklines underneath each (D-3) OR 1 large stat (D-1) OR an in-progress-tab-bar (D-2). Per chosen direction.
- Workout picker reorders: today's pick comes first and full-width, the other two are smaller cards or rows below.
- "Last line" goes away — replaced by the Δ-coded last-session line inside the first recent row.
- Recent row format: `THU MAY 14 · B · 7m12s · 5→5 =` — date in small caps, workout badge, duration, capacity Δ. Δ rendered with sign + color tint (green/red/gray).

### E-2 — Pre-log (capacity + warning)

**Current:** screen-header, subtitle, capacity slider with anchors, warning banner, Start button.

**v2 proposal:**

- Replace `<input type="range">` with a row of 10 tappable circles (1-10). Selected one fills sage; others are 1px borders. Tap to set. Anchor labels stay below. Reads as more confident than a slim slider.
- Warning banner stays but loses the orange tint — moves to a calm gray-on-`bg-elev` with a small ⓘ icon. Per `feedback_no_capacity_paternalism.md`, the wrist clearance line is _status_, not warning; rendering it as a warning miscategorizes it.
- "Stop if anything pings. Back pain at 3/10 → stop that exercise." stays but in a smaller dim line below the clearance statement.
- Start button stays the primary, full-width.
- Optional D-3 addition: a tiny `Last 5 ratings ▂▃▅▅▇` sparkline next to the capacity scale so she sees her trend before setting today's.

### E-3 — In-workout exercise screen

**Current:** screen-header, round-indicator pill, progress-text, progress-bar, exercise card (name/reps/notes), exercise-visual card, optional tempo card, how-to card, Done · Next.

**v2 proposal — D-1/D-3 variant (single-hero merged):**

```
+-----------------------------------+
| Workout A · Round 1/3      × quit |
| ▰▰░░░░░░░░░░░░░ Exercise 1 of 6   |
|                                   |
|  ╭───────────────────────────╮    |
|  │                           │    |
|  │   [exercise visual,       │    |
|  │    full width, 4:3]       │    |
|  │                           │    |
|  ╰───────────────────────────╯    |
|                                   |
|  Bodyweight squats                |
|  12 reps · 3-1-3 tempo            |
|  Arms crossed. Wall behind        |
|  shoulder if balance wobbly.      |
|                                   |
|  ▸ How to do it      ▸ Watch full |
|                                   |
|                                   |
|  ┌─────────────────────────────┐  |
|  │      Done · Next            │  |
|  └─────────────────────────────┘  |
+-----------------------------------+
```

- Tempo bar (3-1-3) absorbs into the reps line: `12 reps · ━━━ ━ ━━━` — no separate card.
- How-to card collapses to a single utility row of two text-link triggers ("▸ How to do it" + "▸ Watch full"). Tapping either opens a bottom-sheet overlay, not an inline expander, so the screen doesn't reflow.
- Exercise notes become inline below reps, dimmer text. Removes one card.
- Result: 1 hero unit, 1 utility row, 1 button. Fits a 390×844 viewport without scroll.

### E-4 — Rest screen

**Current (May 15 ship):** screen-header, round-indicator, big SVG countdown ring (200px), seconds label, "Breathe. Sip water if you have it.", hold-to-skip button.

**v2 proposal:** Already strong. Two small upgrades:

- Ring grows to 240-260px on phones, 320px on tablets. Per "the timer should be better in general," the ring being the screen's protagonist (not 50% of it) reinforces the rest-is-doing-something framing.
- Seconds label switches to tabular-nums, weight 500 (lighter than current 700). The lighter weight reads as "passing through" instead of "look at me."
- Add a tiny "next: Glute bridges" preview underneath the breathe-cue. Mid-rest she's already mentally cuing the next exercise; show it.
- Remove the "rest" sub-label under the number (the ring + breathe line already communicate context).

### E-5 — Wall-sit timed screen

**Current:** ready / hold label, big 25 number, Start timer button, how-to card below.

**v2 proposal:**

- Merge with E-3's hero layout: visual on top, then "Wall sit · 30 sec hold" line, then either Start-timer button OR (once started) the countdown ring at 200px.
- Add the **wall-sit history sparkline** (move 5) directly below the duration: `last 5: ▁▂▃▅▇ · best 32s · last 25s`. Tiny, dim, but present. Allison's only explicit benchmark.
- During the hold, show a sub-line: `held: 18s` ticking up — so if she drops at 22s and taps Done, the post-log gets the right number (the May 15 auto-fill is already in place; just surface it during the hold so she can see herself negotiating with the goal).
- After timer expires, screen auto-advances to Done · Next with a soft accent flash (200ms) so she knows she completed it.

### E-6 — Post-log

**Current:** H2, subtitle, capacity-after slider, wall-sit number input, back-pain slider, one-word text input, Save button.

**v2 proposal:**

- Same 1-10 tappable circle pattern as E-2 for capacity-after and back-pain.
- Wall-sit input pre-fills from the May 15 capture; format: "Wall sit: **47s** (tap to adjust)" with the number tappable to edit inline.
- One-word field gets a placeholder rotation: cycle through "proud · tired · looser · honest · slow" every 4 seconds on focus — gives her a permission-to-be-blunt cue without being prescriptive.
- Add a tiny capacity-delta preview: as she changes capacity-after, render `5 → 7 = +2` next to it, live.
- Save button stays Done · Next discipline, full-width, primary.
- After save, show a 600ms confirmation overlay: workout letter + duration + capacity Δ. Then back to home. The current "instant snap" loses the moment.

### E-7 — History list + detail

**Current list:** workout badge + date + duration + capacity ratio + wall + back + word + `›` chev.

**v2 list:**

- Row format: `THU MAY 14 · B · 7m12s · 5→5 = · "proud"` — date small-caps, badge color, duration, capacity Δ with color tint, word italic.
- Group by week. Header rows: `WEEK 2 · MAY 9–15 · 2 of 3` (date range + adherence). Empty/missed weeks shown grayed: `WEEK 1 · MAY 2–8 · 3 of 3`.
- Top of history: same pannable strip as home. Tapping a dot in any past week opens that session detail.
- Filter chips: `all · A · B · C` — tappable to filter. Default `all`.

**v2 detail:** keep the current detail-card pattern (it's already solid). Add at the top: a 5-session mini-sparkline for _this exercise's_ wall-sit duration (if A). Add at the bottom: a "delete session" button behind a hold-to-confirm (extends move 7 from §C).

### E-8 — NEW: Weekly review screen

**Why this exists:** Currently the weekly review happens manually in a Claude chat. The May 13 `WEEK-3-REGROUP-2026-05-15.md` doc is 314 lines of synthesis Allison shouldn't have to ask for. ~70% of that synthesis can come from existing data; the rest stays a Claude conversation. The screen should be the data layer of the regroup.

**Layout proposal:**

```
+--------------------------------------+
| Week 2 · May 9–15            × done  |
|                                      |
|  2 of 3 sessions                     |
|  ▰▰▰▱   ─────                       |
|                                      |
|  CAPACITY DELTA                      |
|  +5  · max single jump (May 11 A)    |
|  ▁▂▅▇▅                               |
|                                      |
|  BACK PAIN                           |
|  → 0/10 · trending down              |
|  ▇▅▃▁▁                               |
|                                      |
|  WALL SIT                            |
|  no timed sessions this week         |
|                                      |
|  ONE-WORD LOG                        |
|  May 14 — (none)                     |
|  May 11 — "Happy reminder that       |
|             knnee left hurts a l"    |
|                                      |
|  ─────────────────                   |
|  Open thread → left knee mention,    |
|  May 11. Was it a one-time tweak?    |
|                                      |
|  [  Save reflection note  ]          |
+--------------------------------------+
```

- Renders on demand from `/weekly-review` route OR auto-prompts every Friday evening (`localStorage.lastReviewShownWeek` check).
- The "one open thread" is the AI-assist edge — for v1 it's a hand-curated single question from Claude during the week (saved to a `weekly_questions` table or just a property of `workout_sessions`).
- "Save reflection note" appends a free-text entry to `journey/workout-log.md` (via a tiny Supabase function or — simpler — copies the structured summary to clipboard with a "now paste into Claude" instruction).

### E-9 — NEW: Progress visualization route

**Why this exists:** §C move 5 + move 8 + Allison's actual data depth.

**Layout proposal:**

- **Top:** Year-grid (GitHub-style) — 52 weeks × 7 days. Each cell is 14-16px, colored by workout letter. Empty = `bg-elev-2`.
- **Middle:** Three line charts stacked, each ~120px tall:
  1. **Wall-sit duration** (Workout A only) — sage line over weeks.
  2. **Capacity delta** (after − before) — sage line, zero-axis prominent.
  3. **Back pain** — amber line.
- **Bottom:** Counts: "X sessions · Y weeks · Z avg per week."

Route: `/progress`. Reachable from home (small "📈 Progress" link below "📊 All workouts").

### E-10 — NEW: Settings / preferences

**Why this exists:** Currently nonexistent. As the app grows, a handful of toggles will accumulate.

**v1 contents (≤ 6 toggles):**

- **Week starts on:** Saturday / Sunday / Monday (currently hard-coded Sat). Allison-specific = Sat by default. Per `reference_week_definition.md`.
- **Show how-to by default:** First-time-this-week / Always / Never. Currently the first option, hard-coded.
- **Show progress sparklines:** On / Off. Lets her hide D-3-style charts if she chose D-1.
- **Beep volume:** Off / Soft / Loud.
- **Confirm before quit:** On (default) / Off (her call).
- **Reset all local data:** behind a hold-to-confirm. Useful for the once-a-year clean start.

Route: `/settings`. Reachable via a small gear icon in the home screen-header (top right, next to sync indicator).

---

## §F — Navigation Map

> "I can't move around." Spec the full graph.

### Current navigation graph (May 15)

```
home ↔ pre-log → workout → post-log → home
home → history → history-detail → history
home → history-detail (via week-dot or recent-row)
workout → home (via Quit confirm)
```

5 routes. No way to step weeks. No way to compare exercises across sessions. No settings. No weekly review. No progress view.

### Proposed v2 navigation graph

```
                ┌─────────────┐
                │   home      │ ◀──────────────────────┐
                └─────┬───────┘                        │
            tap pick  │   tap progress / settings / wk │
                      │                                │
        ┌─────────────┼─────────────┬─────────────┐   │
        ▼             ▼             ▼             ▼   │
    pre-log      progress      settings      weekly-review
        │
        ▼
    workout (warmup → main → cooldown, w/ rest interstitials)
        │
        ▼
    post-log
        │
        ▼
    (back to home with a 600ms confirm flash)


    home → history (list, grouped by week, filter chips)
    history → history-detail (single session)
    history-detail → history

    home → progress → (back to home)
    progress → exercise-detail (tap any sparkline)
    exercise-detail → progress

    home → settings → (back to home)
    home → weekly-review → (back to home, may save a reflection)

    pannable week strip on home AND history
    long-press week-dot → month-grid → tap day → history-detail OR exercise-detail
```

### Gesture support

| Transition                     | Gesture                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Home ↔ past weeks              | Horizontal swipe on the week strip (or scroll, snap to week)                                               |
| Home ↔ this exercise's history | Tap the exercise-name on the in-workout screen → exercise-detail bottom sheet                              |
| Home ↔ full history            | Tap the "📊 All workouts" chip OR swipe up from below the recent-list                                      |
| Home ↔ settings                | Tap gear icon (top right, screen-header)                                                                   |
| Home ↔ weekly review           | Tap "Friday review" prompt OR navigate via week-strip context menu                                         |
| In-workout → exit              | Tap × Quit (header) OR swipe-down with `pull-to-quit` (Apple Watch pattern; require 200px pull to trigger) |
| Anywhere → back                | iOS-style left-edge swipe back                                                                             |

All gestures should have tap equivalents. No gesture-only paths — `feedback_no_capacity_paternalism.md` extension: fat fingers, sweaty palms, low-vision states all need tap-discoverable backup.

### Routing implementation note

The current app is single-page, render-by-state. The redesign can stay single-page; add `state.screen` cases for `progress`, `settings`, `weekly-review`, `exercise-detail`. URL hash routing (`#progress`) is a Phase-2 niceties for shareable deep-links.

---

## §G — Implementation Sequencing

> After she picks a direction. Each group ≤ 1 session. First ship most visible, last ship optional polish.

### Ship 1 — Typography + color refactor (most visible)

- Migrate to Inter Variable (or keep system font but adjust ramp).
- New type scale: 11 / 14 / 16 / 22 / 32 / 56.
- Letter-spacing pass: -0.02em on display, 1.5px small-caps on labels.
- CSS variable refactor: `--accent` reserved for primary action + active timer. Workout dots use new color tokens. `--text-dim-2` introduced.
- Remove box-shadows from non-hero cards; introduce 1px separator.
- This single ship will deliver 60% of the "feels modern" impression.

### Ship 2 — In-workout layout collapse

- Merge name+reps+visual cards into single hero unit.
- Tempo bar inline with reps.
- How-to + watch-video collapse to utility row (bottom-sheet on tap).
- Notes inline below reps.
- Done · Next stays full-width primary, no change.
- Verify on 360px, 390px, 768px viewports.

### Ship 3 — Navigation expansion

- Pannable week strip (scroll-snap, 8 weeks pre-rendered).
- Long-press → month grid view.
- Settings route + gear icon.
- Weekly-review route + Friday-evening prompt logic.
- Group history list by week, add filter chips.

### Ship 4 — Charts + sparklines

- Wall-sit sparkline on Workout A exercise screen.
- Three trend charts on the new Progress route.
- Year-grid (GitHub-contribution-style) at the top of Progress.
- Δ-coded capacity badges in history rows.

### Ship 5 — Motion + polish

- Spring-physics screen transitions (or skip per D-3).
- Press-scale on buttons (0.98 → 1.0).
- Save-confirmation overlay on post-log.
- Hold-to-confirm extended to quit + delete + reset.
- `aria-live` on timer for screen-reader announcement.
- Favicon, `<meta description>`, real `<noscript>` (audit §6 L7).

### Ship 6 — Optional / nice-to-have

- Tappable 1-10 circles instead of `<input type="range">`.
- Placeholder rotation on one-word field.
- Custom radial-gradient backgrounds per workout (only if D-2 picked).
- Bottom-sheet pattern for how-to overlay.
- `navigator.vibrate(8)` on press on mobile.

Each ship is mergeable independently. Ship 1 alone would make the app feel meaningfully more current.

---

## §H — Decision Questions for Allison

Five questions she needs to answer before greenlighting.

1. **Direction — D-1, D-2, or D-3?** My read: D-1. But she's the architect.
2. **Charts and visualizations on home — IN or OUT?** D-3 puts them front-and-center; D-1 hides them on a separate Progress route; D-2 buries them in a tab. If charts are IN-home, this redesign is partly about data; if OUT, it's mostly about layout.
3. **Weekly-review screen — build it or skip it?** Adds value only if she'd open it; if Friday-evening regrouping stays a Claude conversation, the screen is just additional surface to maintain.
4. **Settings screen — build it now or defer?** Nothing in the app _requires_ settings today. Building it now creates a place for future toggles to land without one-off code. Defer = perfectly viable.
5. **Anything else surfaced by the research she wants prioritized?** E.g., the wall-sit sparkline (move 5) could be Ship-1-included if she wants the benchmark visible immediately.

Bonus decision (orthogonal to the redesign):

6. **Hand routine — bring back, prune, or fold?** Per `FIXES-2026-05-15-CONSOLIDATED.md` §Q, the code is archived but referenceable. Decision deferred. Worth resolving before Ship 1 so the type system can shed the legacy `HandLog` references if she chooses prune.

---

## §I — References / Sources

### Apps reviewed

- [Apple Fitness+ UX case study (builtformars)](https://builtformars.com/case-studies/using-apple-fitness)
- [Apple Liquid Glass + glassmorphism 2025](https://www.everydayux.net/glassmorphism-apple-liquid-glass-interface-design/)
- [Apple HIG: Workouts](https://developer.apple.com/design/human-interface-guidelines/workouts)
- [Nike Training Club UI design (DesignRush / Dribbble)](https://dribbble.com/tags/nike_training_club)
- [Nike Run Club design analysis (DesignRush)](https://www.designrush.com/best-designs/apps/nike-run-club)
- [Centr review and design analysis (TechRadar)](https://www.techradar.com/health-fitness/fitness-apps/centr-review)
- [Centr review (GymBird)](https://www.gymbird.com/fitness-apps/centr-app-review)
- [Peloton design system case study (Figma)](https://www.figma.com/customers/peloton-speeds-up-design-handoff-by-5x-with-figma/)
- [Peloton UX case study (Sharan Hegde)](https://sharanhegde.com/peloton-interactive-ui-ux-case-study/)
- [Peloton design analysis (DesignRush)](https://www.designrush.com/best-designs/apps/peloton)
- [Strong vs Hevy comparison (RepReturn 2026)](https://repreturn.com/strong-app-vs-hevy/)
- [Strong vs Hevy comparison (GymGod 2026)](https://gymgod.app/blog/strong-vs-hevy)
- [Hevy app overview](https://www.hevyapp.com/features/exercise-library/)
- [Strong App review (Cora 2026)](https://www.corahealth.app/compare/strong)
- [Fitbod UI/UX analysis (UI Narrative)](https://www.uinarrative.com/apps/fitbod)
- [Fitbod review 2025 (GymGod)](https://gymgod.app/blog/fitbod-review)
- [Strava Weekly Heatmap update (Nov 2024)](https://press.strava.com/articles/strava-expands-mapping-tools-with-night-and-weekly-heatmaps)
- [Headspace design philosophy (Blake Crosley)](https://blakecrosley.com/guides/design/headspace)
- [Calm vs Headspace comparison (Mindfulness App)](https://www.themindfulnessapp.com/articles/best-meditation-apps-features-comparison-2025)
- [Mindfulness app design trends 2026 (Big Human)](https://www.bighuman.com/blog/trends-in-mindfulness-app-design)
- [Linear design language (LogRocket)](https://blog.logrocket.com/ux-design/linear-design/)
- [Linear UI redesign Part II (Linear blog)](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Linear "calmer interface" refresh](https://linear.app/now/behind-the-latest-design-refresh)
- [Stripe design system analysis](https://getdesign.md/stripe/design-md)
- [Things 3 design analysis (Cultured Code)](https://culturedcode.com/things/features/)
- [Things 3 vs Todoist 6-month comparison](https://ordinaryintrovert.com/todoist-vs-things-3-i-used-both-for-6-months/)

### Pattern / principle references

- [Nielsen Norman Group — Mobile Usability](https://www.nngroup.com/books/mobile-usability/)
- [Fitness app UX best practices (zfort)](https://www.zfort.com/blog/How-to-Design-a-Fitness-App-UX-UI-Best-Practices-for-Engagement-and-Retention)
- [Dark Mode Design 2025 Best Practices (Muksalcreative)](https://muksalcreative.com/2025/07/26/dark-mode-design-best-practices-2025/)
- [Dark Minimalism rise 2025 (Harzeno on Medium)](https://medium.com/@harzeno/the-rise-of-dark-minimalism-in-2025-50f0e6c23594)
- [Spring physics animation (Maxime Heckel)](https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/)
- [SwiftUI animation masterclass](https://dev.to/sebastienlato/swiftui-animation-masterclass-springs-curves-smooth-motion-3e4o)
- [Framer Motion vs React Spring 2025 (Hooked On UI)](https://hookedonui.com/animating-react-uis-in-2025-framer-motion-12-vs-react-spring-10/)
- [Sparkline reference (CDC COVE)](https://www.cdc.gov/cove/data-visualization-types/sparkline.html)
- [GitHub contribution graph for habit tracker (Michael Ozoemena)](https://medium.com/@the_ozmic/building-a-github-like-contribution-graph-for-a-habit-tracker-app-7655d82ece6d)
- [Fitness data visualization (FitPulse)](https://fitpulse.basalt.cc/blog/visualizing-fitness-data-charts-graphs-tell-your-story-1057)
- [Web Animation Techniques (GSAP + Framer Motion)](https://johal.in/web-animation-techniques-gsap-and-framer-motion-for-smooth-ui-transitions/)
- [Fitness App Design 2025 trends (DesignRush)](https://www.designrush.com/best-designs/apps/trends/fitness-app-design-examples)

### Internal artifacts consulted (read in full)

- `c:\Users\allis\Documents\workout-tracker\AUDIT-2026-05-15.md` (code health audit, 495 lines)
- `c:\Users\allis\Documents\workout-tracker\VISUAL-EXERCISE-RESEARCH-2026-05-15.md` (visual layer design research, 292 lines)
- `c:\Users\allis\Documents\workout-tracker\FIXES-2026-05-15-CONSOLIDATED.md` (May 15 ship report, 96 lines)
- `c:\Users\allis\Documents\second-brain\projects\workout-tracker\WEEK-3-REGROUP-2026-05-15.md` (body state + content programming, 314 lines)
- `c:\Users\allis\Documents\workout-tracker\app.ts` (current implementation, 1700+ lines)
- `c:\Users\allis\Documents\workout-tracker\styles.css` (current stylesheet, 1041 lines)
- `c:\Users\allis\Documents\second-brain\CLAUDE.md` (project instructions + active arcs)
- `c:\Users\allis\Documents\second-brain\synthesis\patterns-analysis.md` (canonical brain manual + Live Edge)
- `c:\Users\allis\Documents\second-brain\self\health.md` (body state, wrist, back, Mounjaro)
- `c:\Users\allis\Documents\second-brain\workout.md` (routine source)
- `c:\Users\allis\Documents\second-brain\journey\workout-log.md` (weekly log)
- Memory files: `feedback_no_capacity_paternalism.md`, `feedback_minimal_changes.md`, `feedback_subtraction_default.md`, `feedback_archive_never_delete.md`, `feedback_morning_checkin_style.md`, `feedback_live_at_4_meaning.md`, `feedback_save_immediately.md`, `system_purpose.md`, `reference_week_definition.md`.

### Screenshots referenced (current state)

- `c:\Users\allis\Documents\workout-tracker\after-consolidated-01-home.png` (home)
- `c:\Users\allis\Documents\workout-tracker\after-consolidated-02-prelog.png` (pre-log)
- `c:\Users\allis\Documents\workout-tracker\after-consolidated-03-workout-walk.png` (workout warmup)
- `c:\Users\allis\Documents\workout-tracker\after-consolidated-04-workout-video-expanded.png` (video expander)
- `c:\Users\allis\Documents\workout-tracker\after-consolidated-05-workout-bodyweight-squats.png` (main exercise)
- `c:\Users\allis\Documents\workout-tracker\after-consolidated-06-rest-screen.png` (rest ring)
- `c:\Users\allis\Documents\workout-tracker\after-consolidated-07-workout-wallsit-ready.png` (wall sit ready)
- `c:\Users\allis\Documents\workout-tracker\after-consolidated-08-history.png` (history list)
- `c:\Users\allis\Documents\workout-tracker\after-consolidated-09-history-detail.png` (session detail)

---

## Executive Summary (~300 words)

The workout-tracker after today's consolidated ship is functionally good and tonally on-axis — dark, calm, sage-accented, no gamification, single-primary-action discipline, hold-to-confirm on destruction, post-fix Sat-Fri week strip, today's-pick chip, multi-frame how-to. What feels dated is not the substance; it's three things: (1) the typography ramp is compressed (nothing is small enough to be a label, nothing large enough to be a moment), (2) drop-shadowed cards everywhere read as Material-Design-2018 — modern reference points (Linear, Things 3, Stripe) have moved to flat surfaces with 1px separators, and (3) the green accent is doing nine jobs at once, which dilutes hierarchy. The redesign moves are mostly visual-language pulls from Linear 2025 (cut color further, big-number-small-label), Things 3 (calm typography, generous whitespace), and selective Apple-Fitness-Plus (single layered hero on the in-workout screen, motion as feedback). Three coherent directions to choose from: **D-1 Calm Tool Minimalism** (Things-3-of-fitness, ~3 sessions, M effort, the recommended pick), **D-2 Apple-Layered** (cinematic, motion-forward, ~5-6 sessions, L effort, higher payoff but higher motion-budget risk), **D-3 Quiet Dashboard** (Stripe-style data-forward, ~2 sessions, S-M effort). The navigation pain "I can't move around" is solved by a pannable 8-week strip plus a settings/progress/weekly-review route. New screens proposed: weekly-review (auto-summary of capacity Δ, back trend, wall-sit, one-word log), progress (year-grid + 3 trend lines), settings (≤6 toggles). Implementation breaks into 6 ship groups, each ≤1 session, with the typography+color refresh delivering ~60% of the "feels modern" impression alone. No code in this run. Decision questions are in §H — the headline is which direction.
