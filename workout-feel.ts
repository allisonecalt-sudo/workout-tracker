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
import { canonicalMoveName, MOVE_FEEL_VALUES } from './move-feel.js';
import { ARM_FEEL_STEPS, currentSteppedMoves } from './workout-now.js';

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

// v58 (Sep 28 2026) — the SAME chip, generalized to every move that stepped
// this week (never curl/row — renderArmFeel above still owns those). Gating
// is the same "after the last set (or after the timer/ride ends)" rule
// renderArmFeel already proved (CHIP AFTER THE LAST SET, v54): a hold waits
// for holdRan, a cardio lane waits for laneRan && timerIdle, a multi-set
// reps move reuses the exact same setsDoneFor + "Set N done" mechanism
// (data-mark-set is already keyed by exercise NAME, not curl/row-specific —
// no new tap handler needed for that half). A main-phase move that repeats
// across rounds only asks on its LAST round (`isLastRoundOrNA`) — asking the
// same question every round would be noise, and there's no per-round
// boundary here the way curl/row's "2 sets, one screen" already has one.
export function renderMoveFeel(
  ex: Exercise,
  gate: { hold: boolean; ready: boolean; isLastRoundOrNA: boolean }
): string {
  if (ARM_FEEL_STEPS[ex.name]) return ''; // curl/row keep arm_feel, unmigrated
  if (!gate.isLastRoundOrNA) return '';
  const stepped = currentSteppedMoves().find((s) => s.name === canonicalMoveName(ex.name));
  if (!stepped) return '';
  if (!gate.ready) return '';
  const total = multiSetCount(ex.reps);
  const done = Math.min(state.setsDoneFor[ex.name] ?? 0, total);
  if (!gate.hold && total > 1 && done < total) {
    return `
      <div class="move-feel move-feel-sets" role="group" aria-label="Sets">
        <span class="move-feel-label">Set ${done + 1} of ${total}</span>
        <button class="arm-set-btn" type="button" data-mark-set="${escapeHtml(ex.name)}">Set ${done + 1} done</button>
      </div>`;
  }
  const current = state.moveFeel[stepped.slug];
  const chips = MOVE_FEEL_VALUES.map((v) => {
    const on = current === v;
    const label = v === 'easy' ? 'Easy' : v === 'right' ? 'Right' : 'Hard';
    return `<button class="arm-chip${on ? ' arm-chip-on' : ''}" type="button" data-move-feel-slug="${stepped.slug}" data-move-feel="${v}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }).join('');
  return `
    <div class="move-feel" role="group" aria-label="How did it feel?">
      <span class="move-feel-label">Stepped this week — how did it feel?</span>
      <div class="arm-feel-chips">${chips}</div>
    </div>`;
}

// code-shape step 17c-2: the default arm load (moved verbatim from app.ts) - beginExercises (the workout screen)
// and resetState (session-resume.ts) both start a session on it.
// v55: the LOAD half of one saved "curl=easy@2kg" part, for one step key.
// null when that key isn't in the string, or carries no "@load" at all
// (every row saved before v55).
function armFeelLoad(s: string | null | undefined, key: 'curl' | 'row'): ArmLoad | null {
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
