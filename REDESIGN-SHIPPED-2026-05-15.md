# Workout-Tracker Redesign — Shipped 2026-05-15

**Branch merged:** `redesign-2026-05-15` → `main`
**Commits on main:** `8da942a` (archive snapshot), `39154ba` (Ship 1 redesign), `d79e4a8` (badge-wrap polish)
**Live URL:** https://allisonecalt-sudo.github.io/workout-tracker/
**Tests:** 17 of 17 green (14 existing + 3 new)
**Author:** Lead-developer agent (autonomous run per `feedback_lead_developer_autonomy.md`, full delegation per Allison's 14:25 JDT message _"send agent to make deison and do what think is best"_)

---

## Decision — D-1 Calm Tool Minimalism

Picked **D-1** (Things-3 / Linear-2025 axis) out of the three candidate directions in `REDESIGN-RESEARCH-2026-05-15.md`.

**Why D-1, three sentences:** D-1 was the research's recommended pick (effort M, fits one focused session, lowest risk), and it maps cleanly onto Allison's existing toolset — Things 3, Linear, Stripe checkout, the budget app — so the visual language already reads as native to her, not as a new aesthetic she has to learn. D-2 (Apple Fitness+ layered hero) was the higher-payoff option but it carries a motion budget that risks the gamified register she rejects, and it requires a hero-layout rewrite that's a separate ship. D-3 (Quiet Dashboard) is appealing data-forward but the redesign brief was "more modern looking" not "show me more numbers" — and D-1 leaves D-3's sparkline moves wide open as a future Phase-2 (Ship 4).

The decision was implementation-only — no scope expansion. Direction was picked at 14:30 JDT, Ship 1 went out at ~14:40 JDT, polish + live verification ~14:50 JDT.

---

## What shipped — Ship 1: Typography + Color + Flat Surfaces

### Typography

| Old                                          | New                                                                                                | Why                                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 28 / 22 / 18 / 30px ramp (compressed)        | 11 / 13 / 15 / 17 / 22 / 32 / 44px (label · meta · small · body · sub-heading · heading · display) | Nothing was small enough to be a label; nothing large enough to be a moment. New ramp gives 7 sizes with clear roles.     |
| `letter-spacing: -0.5px` on h1 (mixed units) | `-0.025em` display / `-0.02em` heading / `1.5px` on small-caps                                     | Variable-em on display; pixel on labels (Things 3 / Linear convention). Looks intentional, not accidental.                |
| `font-weight: 700` everywhere                | 500–600 across the ramp                                                                            | Lighter weights at large sizes read calm, not shouty.                                                                     |
| `font-family: system stack`                  | Same system stack + Inter in the list (progressive enhancement)                                    | Kept system for performance / a11y. Inter is in the stack so if her phone already has it, it's used; no @font-face fetch. |
| Stat numbers 28px                            | 40px (phone) / 56px (tablet)                                                                       | Big-number / small-label hierarchy from research §C move 8. Dashboard read, not data-table read.                          |

### Color — single accent split into role-named tokens

The pre-redesign sheet had `--accent` (#8fbc8f sage) doing nine jobs at once. New tokens, each named after its single role:

```
--accent          PRIMARY ACTION + active timer ONLY  (#8fbc8f, kept)
--accent-progress sync-good, completed-bar fill, week-dot-A  (#7a9b7a, muted)
--accent-do       "Do" cues in how-to                  (#8fbc8f, trusted)
--accent-warn     back/wrist warning banner            (#e6b450 amber)
--accent-danger   destructive / quit                   (#d97757)
--accent-rest     rest screen — distinct from work     (#6c8a9b blue-gray, NEW)
```

The `--accent-rest` token is the headline new role. Pre-redesign, the rest-screen ring used the same sage as the Done · Next button, which made the rest screen read as "another action to take." Now the rest ring is blue-gray and the eye learns: sage = tap this, blue-gray = breathe.

Workout identity dots desaturated: `--dot-a #7a9070` sage / `--dot-b #7088a0` steel / `--dot-c #8a7a8e` mauve. Less shouty, three distinct hues for the three workouts without competing with `--accent`.

Also introduced `--text-dim-2: #767368` for tertiary text (labels, small-caps) — the pre-redesign sheet had only `--text` and `--text-dim`, so there was no way to make a label feel quieter than meta. Now there are three steps of text weight.

### Cards — flat surfaces + 1px borders, no drop shadow

```
Old: box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
New: border: 1px solid rgba(255, 255, 255, 0.06);
```

The "everything-is-a-card-with-a-shadow" Material-Design-2018 look is gone. Cards now read as flat surfaces separated by a subtle border. The hero / picked-workout card gets a slightly brighter border (`rgba(255, 255, 255, 0.12)`) for elevation-by-stroke, and the today's-pick card uses a 1px sage border at 20px radius — hierarchy through shape and stroke, not through fill.

Three new border tokens:

- `--border` — subtle separator
- `--border-strong` — hero / picked card / hover
- `--border-divider` — hairline between rows in history list

### Radii

| Element                      | Old  | New         |
| ---------------------------- | ---- | ----------- |
| Inputs, chips, small buttons | 14px | 10px        |
| Default cards                | 14px | 14px (kept) |
| Hero / picked workout card   | 14px | 20px        |

Tighter on small chrome, looser on heroes — the Linear 2025 / Stripe 2025 convention.

---

## What's deferred

The research proposed six ship groups; this run was Ship 1 only. Realistic effort estimates for each:

| Ship                                    | Scope                                                                                                                                                                | Effort                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Ship 2 — In-workout layout collapse** | Merge name+reps+visual cards into a single hero unit. Tempo bar inline with reps. How-to + watch-video collapsed to a single utility row with a bottom-sheet on tap. | ~1 session. Higher visual impact than Ship 1 but requires DOM restructuring and test updates.                   |
| **Ship 3 — Navigation expansion**       | Pannable 8-week strip on home + history. Long-press → month grid view. Settings + Weekly-review routes (new screens).                                                | ~1.5 sessions. Adds two screens to the `AppScreen` union — Allison needs to greenlight which one to ship first. |
| **Ship 4 — Charts + sparklines**        | Wall-sit sparkline on Workout A exercise screen. Three trend charts on a new Progress route. Δ-coded capacity badges in history rows. GitHub-style year-grid.        | ~1 session. Pure additive; SVG polylines, no library.                                                           |
| **Ship 5 — Motion + polish**            | Spring-physics screen transitions. Press-scale on buttons. Save-confirmation overlay on post-log. Hold-to-confirm extended to quit + delete + reset.                 | ~0.5 session. Mostly CSS keyframes + cubic-bezier curves.                                                       |
| **Ship 6 — Optional / nice-to-have**    | Tappable 1-10 circles instead of `<input type="range">`. Placeholder rotation on one-word field. Custom radial-gradient backgrounds per workout (D-2 territory).     | ~0.5 session each. Easy wins.                                                                                   |

I did NOT touch any of these in this run. Half-shipping any of them would be worse than shipping Ship 1 cleanly.

---

## Screenshots — what changed

All saved to `c:\Users\allis\Documents\workout-tracker\after-redesign-*.png` on a 390×844 mobile viewport.

| File                                              | What it shows                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `after-redesign-01-home.png`                      | Home with seeded history. New 40px stat numbers ("4 OF 3 THIS WEEK" / "10 TOTAL SESSIONS"). Desaturated workout dots (A=sage, B=steel). Today's pick (C) has sage 1px border + 20px radius + "TODAY'S PICK" pin badge at top-left. Non-picked cards (A, B) have 1px hairline border, no shadow, "3 rounds" / "2 rounds" badges sit cleanly at top-right. |
| `after-redesign-02-prelog.png`                    | Pre-log. Amber-tinted warning banner (calm status, not panic). Capacity slider with anchor labels "1 — depleted / 5 — baseline / 10 — strong". Single big sage "Start" button. Header "× Back" demoted to a text-link.                                                                                                                                   |
| `after-redesign-03-workout-walk.png`              | First warmup exercise (10-min outdoor walk, Workout C). New 32px exercise name, label-tracked phase indicator "WARM-UP", flat exercise visual card with 1px border. How-to expander default-open this week.                                                                                                                                              |
| `after-redesign-04-workout-main-exercise.png`     | Main-phase exercise (glute bridges, Workout C round 1/2). Multi-frame Do/Avoid how-to renders with new card borders. Done · Next stays the single sage primary.                                                                                                                                                                                          |
| `after-redesign-05-rest-screen.png`               | Rest screen — **blue-gray ring** (was sage). The eye now reads "this is breathing, not doing." Number switched to `var(--text)` warm white at 64px, lighter weight. Hold-to-skip ghost button with sage progress fill.                                                                                                                                   |
| `after-redesign-06-workout-bodyweight-squats.png` | First main exercise, Workout A. New flat card surfaces. Exercise visual + multi-frame how-to render cleanly side-by-side without drop shadows.                                                                                                                                                                                                           |
| `after-redesign-07-history-list.png`              | History list. Hairline `--border-divider` between rows. Workout badges now outlined-not-filled (uppercase small-caps with 1.5px tracking). One-word entries italic + dim.                                                                                                                                                                                |
| `after-redesign-08-history-detail.png`            | Session detail. New small-caps labels at 11px with 1.5px tracking sit quietly above values. Hairline dividers between rows.                                                                                                                                                                                                                              |
| `after-redesign-09-live-home.png`                 | Same home but pulled from **production** (`https://allisonecalt-sudo.github.io/workout-tracker/`) — confirms the redesign is live on GH Pages, not just local. Pre-polish version; the production deploy of the polish commit may take 60–90 sec to land after this report is written.                                                                   |

---

## Breaking changes — what Allison will notice

**Visual** (intentional):

- Everything is calmer. No more sage-everything; the green is now ONLY on the Done · Next button and the active timer.
- The rest screen now reads as "pause / breathe" because it's blue-gray, not sage.
- Stats are big — the "2 of 3 this week" number is 40px now (was 28px).
- Today's pick has a sage outline + bigger radius + "TODAY'S PICK" pin badge above the title. The other two cards are dimmer and tighter.
- Cards no longer have a soft glow under them. Flat surfaces, 1px borders.
- Warning banner is amber-tinted, not orange. Reads as status, not panic.

**Behavioral**: zero. No DOM structure changes, no `AppScreen` changes, no logic touched. The state machine, persistence, sync, audio, timer subsystem, hold-to-skip, week-nav prev/next — all unchanged.

**Data**: zero. WORKOUTS, EXERCISE_HOWTO, EXERCISE_VISUALS, Supabase schema all untouched. Week 3 content (squats 10→12, glute bridges 10→12, wall sit 30s, forearm plank 1×15s) is intact.

**Tests**: 17/17 still green. The 3 new tests lock in the visual contract — if a future change brings back drop shadows or collapses the role tokens back to a single `--accent`, one of those tests fails loudly.

---

## Risk + rollback

**Risk:** Low. This is a CSS-only ship (plus 3 added Playwright tests and one archive folder). Zero behavior change. The audit-fix scope (timer rewrite, sync robustness, dead-code purge from `AUDIT-2026-05-15.md`) is completely untouched and remains pending for a separate session.

**Rollback paths:**

1. **One-command revert (preferred):**

   ```bash
   cd c:/Users/allis/Documents/workout-tracker
   git revert --no-edit d79e4a8 39154ba 8da942a
   git push origin main
   ```

   This reverts the polish, the Ship 1 redesign, and the archive snapshot — restoring the May 15 mid-day consolidated-ship version exactly.

2. **Surgical revert (CSS only, keep archive):**

   ```bash
   cd c:/Users/allis/Documents/workout-tracker
   cp archive/redesign-pre-2026-05-15/styles.before-redesign.css styles.css
   git add styles.css && git commit -m "revert: pre-redesign styles only" && git push
   ```

   Keeps the archive folder + the new tests (which would then start failing — drop them).

3. **Selective revert (keep typography, drop color split):** Not currently a single-command path. Would require hand-editing styles.css to bring back the old `--accent` everywhere while keeping the new font sizes. ~5 minutes if she asks.

---

## Decision questions for Allison

Three small open calls. None are blockers — all defaults shipped, but if she wants any of these flipped, it's a 1-line change.

1. **Picked-card badge placement.** I moved "TODAY'S PICK" from top-right to top-left so the "2 rounds" badge has the right side to itself. If she prefers the badge on the right and the rounds-label gone (since the picked card is also the only one that needs both signals), say the word and it's a `left: auto; right: 12px;` flip + remove the rounds badge from the picked card.
2. **`--accent-rest` (blue-gray).** This is the one purely-new color in the palette. If she doesn't love it, the safe fallback is `--text-dim` (gray) — quieter still, but the ring loses identity. Or restore sage (and the rest screen reads like an action again). Show-and-tell call.
3. **Inter font progressive enhancement.** The font stack now lists `'Inter'` before `'Segoe UI'`. If her phone has Inter installed (some do), it'll pick it up automatically. If we want a guaranteed Inter render (1 network call, ~17KB woff2 for the variable font), that's a one-line `@import` or a `<link>` in `index.html`. Default: stay system, ship-as-is. Upgrade: drop it in next Ship.

---

## Build / test / deploy log (for future-Allison archaeology)

```
Branch:        redesign-2026-05-15 (created from main)
Build:         npm run build → tsc → dist/app.js (no change vs pre)
Lint:          npm run lint → 0 errors
Format check:  npx prettier --check → all good after one re-format pass
Tests:         npx playwright test --reporter=line → 17 passed (11.4s)
Pre-commit:    husky hook ran prettier --check; bounced once on REDESIGN-RESEARCH md, fixed
Commits:       8da942a archive: snapshot styles + index.html before D-1 redesign
               39154ba redesign(Ship 1): D-1 Calm Tool Minimalism — typography + color refactor
               d79e4a8 redesign(Ship 1 polish): fix workout-card badge wrap + picked-card layout
Merge:         redesign-2026-05-15 → main (no-ff)
Push:          61d1892..445b04a then 445b04a..d79e4a8
CI:            success on 25915666130 (2m43s)
Deploy:        GH Pages auto-deploy on push to main; verified live with the new CSS
               at ~14:48 JDT via curl on styles.css and a Playwright MCP screenshot
               of the production URL.
```

---

## Pre-existing untracked files NOT touched by this run

These were sitting untracked in the workout-tracker repo at the start of this agent run; they're not part of the redesign and I left them alone:

- `HOWTO-CONTENT-2026-05-15.md` — earlier today's how-to content build report
- `REDESIGN-RESEARCH-2026-05-15.md` — the research doc that scoped this run
- `after-howto-*.png` — earlier today's how-to screenshots

If she wants those committed separately, that's a `git add && git commit` she or a follow-up agent can do.
