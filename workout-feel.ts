// workout-feel.ts - the Easy / Right / Hard chips and the LOAD chip on the workout step (code-shape step 17a-0, Oct 15 2026).
// Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the arm-feel chips (curl / prone row) + the 1 kg / 2 kg load chips + the pace rule line,
// the generalized move-feel chip (renderMoveFeel), the "Set N done" count (multiSetCount), and the
// value guards (isArmFeel / isArmLoad / heavierArmLoad) that BOTH these renderers and app.ts's
// resume-snapshot sanitizers use.
// WHY: screens/workout.ts (17a) renders the step and binds the chips, and app.ts's sanitizers
// still need the guards, so the strings and guards live below both. Strings out, no DOM writes.
// RULE: shared layer - never imports app.ts or a screen (tests/import-graph.test.ts, default-deny).

import type { Exercise } from './program.js';
import {
  state,
  PACE_RULE_SEEN_KEY,
  type ArmFeel,
  type ArmLoad,
  type ArmLoadState,
} from './state.js';
import type { LogEntry } from './types.js';
import { escapeHtml } from './format.js';
import { feelMoveFor, MOVE_FEEL_VALUES, slugFor, type SteppedMove } from './move-feel.js';
import { ARM_FEEL_STEPS, getCurrentWorkout } from './workout-now.js';

// ---------- v48 · P5 (Sep 24 2026): arm feel + the LOAD CHIP ----------
// The 2 kg trigger was her Jul 3 buy-bigger ask, and the app logs no arm reps
// (assumptions, 19). One optional tap on the two 1 kg moves — inside her
// 2-tap line — read her feel.
//
// v55 (Sep 27 2026): the old "Ask Lisa about 2 kg?" card is RETIRED — her
// rule 8e, "Get rid of Lisa. I decide based on pain" (Sep 26 23:15), and she
// has 2 kg now (20:08). The LOAD CHIP replaces it: she picks 1 kg or 2 kg
// herself, every set, no question asked.
// ARM_FEEL_STEPS (the two 1 kg moves -> curl / row) lives in workout-now.ts (step 15a).
export const ARM_FEEL_VALUES: readonly ArmFeel[] = ['easy', 'right', 'hard'];

export const ARM_LOAD_VALUES: readonly ArmLoad[] = ['1kg', '2kg'];

export function isArmFeel(v: unknown): v is ArmFeel {
  return typeof v === 'string' && (ARM_FEEL_VALUES as readonly string[]).includes(v);
}

export function isArmLoad(v: unknown): v is ArmLoad {
  return v === '1kg' || v === '2kg';
}

// v55 · fix r1: the heavier of two loads (or the one that's set, if only one
// is) — armLoadMax's own update rule. '2kg' always wins over '1kg'.
export function heavierArmLoad(
  a: ArmLoad | undefined,
  b: ArmLoad | undefined
): ArmLoad | undefined {
  if (a === '2kg' || b === '2kg') return '2kg';
  return a ?? b;
}

// v54 (Sep 27 2026) — how many sets a move's own `reps` text says ("2 sets ·
// 12 reps", "2 sets · 12 reps each side"). An "N sets" / "N ×" / "N x" count
// anywhere in the string; anything else (no match, or N <= 1) is a
// single-set move and unaffected — same "single-set holds don't change"
// convention as F1's own wall-lean-sets spec (PLAN-2026-09-26.md §7 F1),
// applied here to the Easy/Right/Hard chip instead of a timer.
// v58 fix pass (Sep 28 2026, checker's should #3): used to anchor the count
// to the very START of the string (`^`), so "12 reps · 2 sets each round"
// (hip hinge's own reps text — the count sits AFTER the reps number, not
// before it) never matched at all and read as single-set. The chip then
// showed the instant round 2's step appeared, before either set was done,
// instead of waiting for "Set 2 done" the way curl/row's own 2-set moves
// already do. Searching anywhere (dropping the `^`) finds "2 sets" wherever
// it sits; "sets?"/×/x still can't false-match a hold's "2-sec hold" or a
// tempo's "3-1-3" (no digit-then-whitespace-then-s/x there).
export function multiSetCount(reps: string | undefined): number {
  const m = /(\d+)\s*(?:sets?|[×x])\b/i.exec((reps ?? '').trim());
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 1 ? n : 1;
}

// v48 · P5 (Sep 24 2026): "How did it feel?" on the 1 kg curl and the prone
// row — three small chips, optional; tap selects, tap again clears. Quiet
// (outlined), so Done · Next stays the one sage on the step.
//
// v54 (Sep 27 2026) — CHIP AFTER THE LAST SET. Her Sep 27 reflection: "for
// the good right hard... there's two sets? Maybe I should only do on the
// second time? Should I do both times?" Both curl and the prone row say "2
// sets" in their own reps text, done off ONE screen with no timer between
// them (no Start/Stop boundary the app can see) — so before this, the chip
// simply appeared the instant the step did, with nothing marking "you've
// actually finished both sets" first. Now a multi-set move shows a plain "Set
// X done" tap instead, and the chip itself waits for the LAST one: it never
// asks the question after only set 1. A single-set move (multiSetCount <= 1)
// is unchanged — chip shows immediately, exactly as before.
// v55 (Sep 27 2026) — LOAD CHIP: "1 kg · 2 kg" per SET, her pick by pain
// ("no Lisa approval, I decide based on pain", Sep 26 23:15). Default is
// whatever state.armLoad already holds (set at session start by
// defaultArmLoad — last used, else 1 kg); tapping just selects, never clears.
function renderArmLoadChips(step: 'curl' | 'row'): string {
  const current = state.armLoad[step] ?? '1kg';
  const chips = ARM_LOAD_VALUES.map((load) => {
    const on = current === load;
    const label = load === '1kg' ? '1 kg' : '2 kg';
    return `<button class="arm-load-chip${on ? ' arm-load-chip-on' : ''}" type="button" data-arm-load-step="${step}" data-arm-load="${load}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }).join('');
  return `<div class="arm-load-row" role="group" aria-label="Load">${chips}</div>`;
}

// v55 — the pace rule from training-review v2 item 5, said ONCE (ever, this
// device) right on the step, not repeated every set/session: "Easy twice at
// 15 slow reps + pain gone by morning → try 2 kg on the first set."
// v55 · fix r1 (Sep 27 2026): used to mark itself seen INSIDE render() — so
// it vanished on the very next re-render, including her first tap on a load
// chip, before she'd necessarily read it. Now it only reads the flag here;
// markPaceRuleSeen() (below) sets it, called from the "Set N done" tap —
// same convention as the CHIP AFTER THE LAST SET timing already uses.
// Storage blocked → it just shows every time (never crashes, never blocks).
function renderPaceRuleOnce(): string {
  try {
    if (localStorage.getItem(PACE_RULE_SEEN_KEY) === '1') return '';
  } catch {
    // storage blocked — fall through and show it this render
  }
  return `<p class="arm-load-pace-rule">Easy twice at 15 slow reps + pain gone by morning → try 2 kg on the first set.</p>`;
}

export function markPaceRuleSeen(): void {
  try {
    localStorage.setItem(PACE_RULE_SEEN_KEY, '1');
  } catch {
    // non-fatal — the rule just keeps showing every time
  }
}

export function renderArmFeel(ex: Exercise): string {
  const step = ARM_FEEL_STEPS[ex.name];
  if (!step) return '';
  const total = multiSetCount(ex.reps);
  const done = Math.min(state.setsDoneFor[ex.name] ?? 0, total);
  const loadRow = renderArmLoadChips(step);
  if (total > 1 && done < total) {
    return `
      <div class="arm-feel arm-feel-sets" role="group" aria-label="Sets">
        <span class="arm-feel-label">Set ${done + 1} of ${total}</span>
        ${loadRow}
        ${step === 'curl' ? renderPaceRuleOnce() : ''}
        <button class="arm-set-btn" type="button" data-mark-set="${escapeHtml(ex.name)}">Set ${done + 1} done</button>
      </div>`;
  }
  const current = state.armFeel[step];
  const chips = ARM_FEEL_VALUES.map((v) => {
    const on = current === v;
    const label = v === 'easy' ? 'Easy' : v === 'right' ? 'Right' : 'Hard';
    return `<button class="arm-chip${on ? ' arm-chip-on' : ''}" type="button" data-arm-step="${step}" data-arm-feel="${v}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }).join('');
  return `
    <div class="arm-feel" role="group" aria-label="How did it feel?">
      ${total > 1 ? `<span class="arm-feel-label arm-feel-sets-done">${total} sets ✓</span>` : ''}
      ${loadRow}
      ${step === 'curl' ? renderPaceRuleOnce() : ''}
      <span class="arm-feel-label">How did it feel?</span>
      <div class="arm-feel-chips">${chips}</div>
    </div>`;
}

// v63 item 2 (Oct 19 2026) — "How was this one?  Easy · Right · Hard" on EVERY move page: warm-up, main
// (every round), upper back and the cardio slot (walk / apartment; the elliptical keeps its own ride
// feel). NOT a row per stretch (eleven more rows push that list to ~1615 px, past the 1400 px budget
// tests/screens/mirror-and-cooldown.spec.ts keeps for it): the cool-down gets ONE row, renderStretchFeel. One quiet row; optional; a second tap on the picked one clears it;
// it never blocks Done. It REPLACES v58's rule (only the moves that stepped this week, only on their
// last round) with "every move"; the "Stepped this week" wording is gone. v58's "Set N done" counter (below) and
// v59's wait-for-3-minutes on the walk lane stay. The stepped-move line on the pre-log and the New / Again
// tonight badge stay.
// Saved in the move_feel column exactly as before ("slug=feel@qty", move-feel.ts): the feel is kept
// per MOVE (its slug), so with several rounds the LAST tap on that move wins, and a tap that clears
// it clears it. curl / row keep their own arm feel + load chips (arm_feel, unmigrated).
export function renderFeelRow(slug: string, question = 'How was this one?'): string {
  const current = state.moveFeel[slug];
  const chips = MOVE_FEEL_VALUES.map((v) => {
    const on = current === v;
    const label = v === 'easy' ? 'Easy' : v === 'right' ? 'Right' : 'Hard';
    return `<button class="arm-chip${on ? ' arm-chip-on' : ''}" type="button" data-move-feel-slug="${slug}" data-move-feel="${v}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }).join('');
  return `
    <div class="move-feel" role="group" aria-label="${question}">
      <span class="move-feel-label">${question}</span>
      <div class="arm-feel-chips">${chips}</div>
    </div>`;
}

// The cool-down list gets ONE quiet row at its bottom (not a row per stretch: that list has a 1400 px budget),
// saved in move_feel as `stretches=<feel>`.
export const STRETCHES_SLUG = 'stretches';
export function renderStretchFeel(): string {
  return renderFeelRow(STRETCHES_SLUG, 'How was the stretching?');
}

// v58's "Set N done" counter is back (fix round; it was dropped by mistake - the feel row ADDS to the page,
// it does not replace it): a multi-set move (multiSetCount > 1) shows "Set N of M" + "Set N done" first
// and the feel row waits for the LAST set, exactly the markup and the data-mark-set tap v58 had (the tap
// handler in screens/workout.ts is keyed by exercise NAME). A hold has no set count here.
// v58's other waits are back too (fix round 2): a hold asks only after the hold has run (holdRan), a cardio
// lane only after the lane has run and its timer is idle (laneRan && timerIdle) - `ready` - because a feel
// before doing the move means nothing. Every other move is ready at once.
// The sets count of a generic move is kept PER ROUND (fix round 3): setsDoneFor is per move NAME for the
// whole session, and the counter now shows in every round, so round 1's two taps would have used it up and
// round 2 would show the row at once. Key = name | phase | round (main only), so every round runs
// Set 1 -> Set N -> the row, and a reload mid-round keeps that round's count (setsDoneFor is in the snapshot).
// curl / row keep their own count by name (renderArmFeel, armFeelString): untouched.
export function moveSetsKey(ex: Exercise): string {
  return `${ex.name}|${state.currentPhase}|${state.currentPhase === 'main' ? state.currentRound : 0}`;
}

export function renderMoveFeel(
  ex: Exercise,
  opts: { hold?: boolean; ready?: boolean } = {}
): string {
  if (ARM_FEEL_STEPS[ex.name]) return ''; // curl/row keep arm_feel, unmigrated
  if (opts.ready === false) return '';
  const total = multiSetCount(ex.reps);
  const setsKey = moveSetsKey(ex);
  const done = Math.min(state.setsDoneFor[setsKey] ?? 0, total);
  if (!opts.hold && total > 1 && done < total) {
    return `
      <div class="move-feel move-feel-sets" role="group" aria-label="Sets">
        <span class="move-feel-label">Set ${done + 1} of ${total}</span>
        <button class="arm-set-btn" type="button" data-mark-set="${escapeHtml(setsKey)}">Set ${done + 1} done</button>
      </div>`;
  }
  return renderFeelRow(slugFor(ex.name));
}

// v63 item 3 (Oct 19 2026): the "This hurts" button, under the feel row on every move page. One tap skips
// the move ("Got it, skipped.") and records it as hurt: move_feel `slug=hurt`, counted in steps_skipped.
export function renderThisHurts(): string {
  return `<button class="btn-quiet hurt-btn" id="this-hurts" type="button">This hurts</button>`;
}

// Every move the live workout can ask about (warm-up, main, upper back), each with the slug + qty its save needs: moveFeelString turns state.moveFeel
// into the saved string through THIS list, so a tap on any move is kept (it used to keep only the
// moves that stepped). curl / row take part too (v63 item 3): a hurt there lands in move_feel; their
// Easy / Right / Hard still lives in arm_feel (no row writes it into state.moveFeel for them).
export function currentFeelMoves(): SteppedMove[] {
  const w = getCurrentWorkout();
  if (!w) return [];
  const out = new Map<string, SteppedMove>();
  const add = (m: SteppedMove): void => {
    if (!out.has(m.slug)) out.set(m.slug, m);
  };
  for (const ex of [...w.warmup, ...w.main, ...(w.upperBack ?? [])]) {
    add(feelMoveFor(ex));
  }
  if ((w.cooldown ?? []).length > 0) {
    add({ name: 'Stretches', slug: STRETCHES_SLUG, kind: 'reps', summary: 'stretches' });
  }
  return [...out.values()];
}

// code-shape step 17c-2: the default arm load (moved verbatim from app.ts) - beginExercises (the workout screen)
// and resetState (session-resume.ts) both start a session on it.
// v55: the LOAD half of one saved "curl=easy@2kg" part, for one step key.
// null when that key isn't in the string, or carries no "@load" at all
// (every row saved before v55).
export function armFeelLoad(s: string | null | undefined, key: 'curl' | 'row'): ArmLoad | null {
  if (!s) return null;
  for (const part of s.split(';')) {
    const [k, rest] = part.split('=');
    if (k !== key) continue;
    const m = /@(1kg|2kg)$/.exec(rest ?? '');
    return m ? (m[1] as ArmLoad) : null;
  }
  return null;
}

// v55 — "default = last used, initially 1 kg" (her spec): the newest past
// log that actually recorded a load for this move, newest-first; 1 kg when
// she's never recorded one (a fresh install, or every row predates v55).
function lastUsedArmLoad(logs: LogEntry[], key: 'curl' | 'row'): ArmLoad {
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  for (const l of sorted) {
    const load = armFeelLoad(l.armFeel, key);
    if (load) return load;
  }
  return '1kg';
}

export function defaultArmLoad(logs: LogEntry[]): ArmLoadState {
  return { curl: lastUsedArmLoad(logs, 'curl'), row: lastUsedArmLoad(logs, 'row') };
}
