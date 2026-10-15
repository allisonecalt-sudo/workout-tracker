// workout-parts.ts - render strings every workout sub-view shares (code-shape step 17a-0, Oct 15 2026).
// Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the pieces the exercise step, the rest screen, the round break, the cool-down list and
// the elliptical step all draw: the Back + Done pair (renderStepNav), the one progress line + bar
// (renderProgressLine and its step count / phase label), the Pause and List header buttons, the
// m:ss countdown face, and the stretch pairing the cool-down list and the phase chip both read.
// WHY: 17a moves the exercise step into screens/workout.ts, but the lane and overlay renderers
// (17b / 17c) still draw these same strings from app.ts, and a screen cannot import app.ts - so
// they live below both. Strings out, no DOM writes.
// RULE: shared layer - never imports app.ts or a screen (tests/import-graph.test.ts, default-deny).

import { state } from './state.js';
import type { Exercise, Workout } from './program.js';
import { reachedCount, flattenSteps } from './step-list.js';
import { renderActionBar } from './action-bar.js';
import { effectiveRounds, toStepWorkout, canGoBack, currentStepKey } from './workout-now.js';

// The big countdown face. Holds are all under a minute so they keep reading as
// bare seconds; the apartment-cardio timer runs 10-25 minutes, where a raw
// "600" reads as nonsense — those show as m:ss.
export function formatTimerDisplay(sec: number): string {
  if (sec < 60) return String(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// The Back + Done pair under every step (v47), pinned since v48. v53 fix
// (CHECK M4): Back used to hide on the very first step ("nothing behind
// her") — it now always shows; from step 1 specifically it goes to the
// pre-log instead of a step further back (see goBack). `quiet` = Done in the
// Back style (v48: a timed hold before it has run — the sage belongs to
// Start timer then; one sage per screen). Still tappable either way: she may
// have used her own clock.
export function renderStepNav(doneLabel: string, quiet = false): string {
  const back = canGoBack()
    ? `<button class="btn-large btn-back" id="step-back" type="button" aria-label="Back one step">‹ Back</button>`
    : '';
  return renderActionBar(`
    <div class="step-nav">
      ${back}
      <button class="btn-large ${quiet ? 'btn-back btn-done-quiet' : 'btn-primary'}" id="next" type="button">${doneLabel}</button>
    </div>
  `);
}

// v48 (Sep 24 2026): ONE count for the whole workout, replacing the round pill +
// "Exercise N of M" (which restarted at 1 in every phase and every round) + the
// in-card phase label — three counters, none of which said how far along she
// was. Total = warm-up + main × rounds + upper back + 1 (the cool-down list is
// one step).
// v50 · jump list (Sep 25 2026): the numerator is step-list.ts's reachedCount
// (every step marked done, plus the one she's currently viewing if it isn't
// done yet) — "count completed steps, not position" per her spec. On a plain
// forward walk this is numerically identical to the old position count (every
// step up to "here" really was done in order), so nothing on an untouched
// List sheet changes; it only diverges once she jumps BACK to view an
// already-finished step out of order, where it correctly stops claiming
// credit for a position she's since revisited rather than newly reached.
// Cool-down is still always the full bar — it's one step, always last,
// whether or not everything before it got done (finishAtRoundOne can reach it
// early on purpose).
function workoutStepPosition(w: Workout): { index: number; total: number } {
  const warm = w.warmup.length;
  const main = w.main.length;
  const rounds = effectiveRounds(w);
  const upper = w.upperBack?.length ?? 0;
  // v55 (Sep 27 2026) — CHECK round1/2/3 N1: the trailing "+1" stood for the
  // cool-down step, so a workout with none (Workout D: warmup:[ride], main:[],
  // cooldown:[]) still counted a step that never happens — "Warm-up · 1 of 2"
  // on a genuinely one-step ride. Only add it when there's a real cool-down
  // to reach.
  const hasCooldown = (w.cooldown ?? []).length > 0;
  const total = warm + main * rounds + upper + (hasCooldown ? 1 : 0);
  if (state.currentPhase === 'cooldown') {
    return { index: total, total };
  }
  const movable = flattenSteps(toStepWorkout(w), rounds);
  const index = reachedCount(movable, state.completedSteps, currentStepKey());
  return { index: Math.max(1, Math.min(total, index)), total };
}

function phaseLabelFor(w: Workout): string {
  const base =
    // v55 (Sep 27 2026) — CHECK N1/N3: Workout D's one step is the ride
    // itself, not a "Warm-up" leading up to something else. "Ride · 1 of 1".
    w.id === 'D' && state.currentPhase === 'warmup'
      ? 'Ride'
      : state.currentPhase === 'main'
        ? `Main · Round ${state.currentRound} of ${effectiveRounds(w)}`
        : state.currentPhase === 'warmup'
          ? 'Warm-up'
          : state.currentPhase === 'upperBack'
            ? 'Upper back'
            : cooldownChipLabel(w);
  return `${base}${state.liteDay ? ' · lite' : ''}`;
}

// v48 · P7 (Sep 24 2026): the cool-down chip counts HER rows — "Stretch · 11",
// not "Stretch · 18 stretches" (a number that overstated the hill at the end of
// a workout, and said "stretch" twice — uxui cooldown). An empty list keeps the
// plain phase name rather than print "Stretch · 0".
function cooldownChipLabel(w: Workout): string {
  const n = groupStretchPairs(w.cooldown ?? []).length;
  return n > 0 ? `Stretch · ${n}` : 'Cool-down';
}

// The one progress line + the one bar (v48). `.round-indicator` stays on the
// left label — the resume tests key on it.
export function renderProgressLine(w: Workout): string {
  const { index, total } = workoutStepPosition(w);
  // v48 · P8 (Sep 24 2026): no "23 of 23" on the cool-down. It's always the
  // last step, so the number only repeats the full bar. The list's own live
  // line ("~13 min · 5 of 11") is the one count on that screen (DECISIONS §2:
  // "one quiet count").
  const count =
    state.currentPhase === 'cooldown' ? '' : `<span class="step-count">${index} of ${total}</span>`;
  return `
    <div class="step-progress">
      <span class="round-indicator">${phaseLabelFor(w)}</span>
      ${count}
    </div>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: ${(index / total) * 100}%"></div>
    </div>`;
}

// Cool-down = stretches. Allison's call (2026-06-06): show the whole block as
// ONE scrollable list — name + cue per row — instead of stepping through each
// stretch as its own screen. No per-stretch video, no per-stretch timer; the
// reps text already carries the hold time and the notes carry the cue. Real
// (non-stretch) exercises keep their stepped screens + videos.
//
// v48 · P7 (Sep 24 2026): her 18 stretches as 11 tick-off rows. The list is
// HER routine — "i dont do yur stretches i do this" (May 29) — so all 18 stay
// in the data; only the right/left pairs fold into one "each side" row. It was
// 2.9 screens and 547 words under a "No timer" line with "45 sec" on every row
// (uxui cooldown 4/5; walk-in-her-shoes: "rows I tick off, and ~13 min · 5 of
// 18"). Cues sit behind a closed ▸; the one sage stays Done · Finish.
export type StretchGroup = {
  key: string;
  name: string;
  eachSide: boolean;
  cue: string | null;
  items: Exercise[];
};

// "Wrist extension — right" / "— left" → one "Wrist extension" group; the two
// hip-flexor rows ("Hip flexor — right knee in, left leg dangles" / "— left
// knee in, …") → "Hip flexor". The side word right after " — " is the marker.
// Singles pass through in order. A placeholder cue ("Your usual neck
// stretch.") says nothing on a list she already knows, so it becomes null.
export function groupStretchPairs(stretches: Exercise[]): StretchGroup[] {
  const groups: StretchGroup[] = [];
  const byStem = new Map<string, StretchGroup>();
  for (const s of stretches) {
    const m = s.name.match(/^(.+?) — (?:right|left)\b/i);
    const stem = m?.[1];
    if (stem) {
      const existing = byStem.get(stem);
      if (existing) {
        existing.items.push(s);
        existing.eachSide = true;
        continue;
      }
    }
    const notes = s.notes?.trim() ?? '';
    const g: StretchGroup = {
      key: stem ?? s.name,
      name: stem ?? s.name,
      // A single entry can still be "each side" by its own reps (the Week 1-4
      // "Figure-4 stretch · 45 sec each side").
      eachSide: /each side/i.test(s.reps ?? ''),
      cue: notes === '' || /^Your usual .* stretch\.$/.test(notes) ? null : notes,
      items: [s],
    };
    groups.push(g);
    if (stem) byStem.set(stem, g);
  }
  return groups;
}

// Pause control — a quiet button in every workout sub-view's header, left of
// Quit (v46). It was a fixed pill at the bottom-left, which sat on top of
// Start timer and the setup steps on the elliptical screen (UI audit Sep 24).
// Nothing while paused: the overlay's Resume is the only control then.
export function renderPauseButton(): string {
  if (state.pausedAt !== null) return '';
  return `<button class="pause-inline" id="pause-toggle" type="button" aria-label="Pause workout">⏸ Pause</button>`;
}

// v50 · jump list (Sep 25 2026) — a quiet button beside Pause, same look (ink,
// not sage — this is wayfinding, not the one primary action per step). Her
// words: "I dont always do the workouts in [order]" → "2" = the exercises
// inside a workout. Opens renderStepListSheet below.
export function renderListButton(): string {
  if (state.pausedAt !== null) return '';
  // Icon only (not "☰ List") — with Pause + Quit already in this row, the
  // full word pushed "Workout A" onto two lines at 412px and broke the fold
  // on the elliptical first-ride screen (P8 sweep caught it). The aria-label
  // still says the whole thing.
  return `<button class="pause-inline step-list-open-btn" id="step-list-open" type="button" aria-label="List every step">☰</button>`;
}
