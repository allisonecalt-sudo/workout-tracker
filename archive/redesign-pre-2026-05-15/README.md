# Pre-redesign snapshot — 2026-05-15

Snapshot taken before the D-1 "Calm Tool Minimalism" redesign landed.

## What's in here

- `styles.before-redesign.css` — full copy of `styles.css` as it stood on May 15, 2026 around 14:25 JDT, after the consolidated UX ship earlier in the day. Last commit before this branch was `03ffad2` on the second-brain repo; on workout-tracker repo it was the consolidated agent landing (Group 3M-R) tag-equivalent.
- `index.before-redesign.html` — the index.html before any font-family / theme-color tweaks for the redesign.

## What changed in the redesign (Ship 1, D-1)

Direction: **D-1 Calm Tool Minimalism** (Things-3 / Linear-2025 axis). See `REDESIGN-RESEARCH-2026-05-15.md` §D-1 for the full rationale.

Headline changes vs the snapshot:

1. **Typography scale rebuilt** — new ramp 11 / 13 / 15 / 17 / 22 / 32 / 44 (label · meta · small · body · sub-heading · heading · display). Display sizes get tighter letter-spacing (-0.02em). Labels get small-caps + 1.5px letter-spacing. The 28/22/18/30 pile-up is gone.
2. **Type face** — kept the system stack as the primary (already on-axis for performance + a-11-y); added Inter as a high-quality progressive enhancement via `@font-face` later if Allison wants — for Ship 1 we stay with system-ui to avoid network cost.
3. **Color tokens split into roles** — the single `--accent` (sage) used to do 9 jobs. Now:
   - `--accent` — primary action button + active timer ring ONLY (the "saturated sage" role)
   - `--accent-progress` — sync-good, completed-bar fill, week-dot A (muted sage)
   - `--accent-do` — Do cues in how-to (the trusted-action sage)
   - `--accent-warn` — back/wrist warning banner amber (was `--warn`, now role-named)
   - `--accent-rest` — rest screen tinted blue-gray, separates rest from "this is doing something" (NEW)
   - `--text-dim-2` — even-dimmer label color, lets us drop opacity hacks
4. **Workout dots desaturated** — A=`#7a9070` sage, B=`#7088a0` steel, C=`#8a7a8e` mauve. Less shouty.
5. **No drop shadows on cards.** `.card`, `.workout-card`, `.exercise-visual`, `.how-to-card` all switched from `box-shadow: 0 4px 16px rgba(0,0,0,0.3)` to `border: 1px solid rgba(255,255,255,0.06)`. Hero / picked cards get a slightly brighter border.
6. **Radii adjusted** — small chrome (chips, inputs) tightens to 10px; cards stay 14px; hero / picked workout card goes to 20px.
7. **Stat numbers grow** — `.stat-number` from 28px → 40px (big-number-small-label hierarchy from §C move 8).
8. **Letter-spacing audit** — display type pulled tighter (-0.5px → -0.02em). All-caps labels keep the 1.5px tracking (Things 3 / Linear convention).

## What did NOT change

- Layout structure. No DOM rewrites this ship. The hero in-workout collapse is Ship 2 (deferred).
- Motion. Almost no animation changes this ship. Spring-physics is Ship 5 (deferred).
- Charts. No sparklines added this ship. That's Ship 4 (deferred).
- Data. WORKOUTS / EXERCISE_HOWTO / EXERCISE_VISUALS — all locked, untouched.
- AppScreen type. Same 6 screens. No new routes.
- Supabase. Zero schema changes.

## How to restore the pre-redesign look

```bash
cd c:/Users/allis/Documents/workout-tracker
cp archive/redesign-pre-2026-05-15/styles.before-redesign.css styles.css
cp archive/redesign-pre-2026-05-15/index.before-redesign.html index.html
npm run build
git add styles.css index.html && git commit -m "revert: pre-redesign styles"
```

Or the one-shot revert path: `git revert <ship-commit-sha>` against the branch merge to main.

## Why archive instead of delete

Per `feedback_archive_never_delete.md` — Allison's brain rule: "i dont want things to disappear just be archived nicely so i can pull when needed... so i can go back and look at it one day." If future-Allison wants to remember what the May 15 mid-day version looked like (the one with sage-everywhere and drop-shadowed cards), this folder is the door.
