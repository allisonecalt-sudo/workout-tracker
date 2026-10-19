// workout-breaks.ts - the render strings for the workout screen's break sub-views (code-shape
// step 17c-1, Oct 16 2026). Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the rest screen (countdown ring), the round-1 floor ("Round 1 done"), the cool-down
// list (stretch rows, the honest time estimates) and the full-screen Paused overlay. They share
// one header (Pause / List / Quit) and the same progress line with the exercise step.
// WHY: screens/workout.ts (17c) owns the handlers and the state machine; the strings are kept
// out of it so the screen file stays readable. Strings out, no DOM writes.
// RULE: shared layer - never imports app.ts or a screen (tests/import-graph.test.ts, default-deny).

import { state, getRestSec } from './state.js';
import type { Exercise, Workout } from './program.js';
import { escapeHtml } from './format.js';
import { renderActionBar } from './action-bar.js';
import { HOLD_TO_SKIP_MS } from './dom.js';
import {
  renderStepNav,
  renderProgressLine,
  renderPauseButton,
  renderListButton,
  groupStretchPairs,
  type StretchGroup,
} from './workout-parts.js';
import { renderExerciseSetup } from './workout-cards.js';
import { renderStretchFeel } from './workout-feel.js';
import { rawCurrentExercise, displayName } from './workout-now.js';

// Group 2H: rest screen now leads with a large countdown ring/arc; Skip is a
// hold-to-confirm button.
export function renderRestScreen(w: Workout): string {
  // Ship 6: read user-configured rest length (default 60).
  const total = getRestSec();
  const remaining = state.timerSeconds;
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  // SVG ring (radius 90, circumference ~565)
  const r = 90;
  const C = 2 * Math.PI * r;
  const offset = C * (1 - pct);
  // v48 (Sep 24 2026): one line saying what comes next (uxui rest 3/5 — the
  // ring said how long, never what for). The index already points at it.
  const next = rawCurrentExercise();
  const roundStart =
    state.currentPhase === 'main' && state.currentExerciseIndex === 0 && state.currentRound > 1;
  const nextLine = next
    ? roundStart
      ? `Next · Round ${state.currentRound} · ${displayName(next)}`
      : `Next · ${displayName(next)}${next.reps ? ` · ${next.reps}` : ''}`
    : '';
  return `
    <div class="screen-header">
      <h2>Workout ${w.id}</h2>
      <div class="screen-header-actions">
        ${renderPauseButton()}
        ${renderListButton()}
        <button class="quit-link" id="quit" type="button">× Quit workout</button>
      </div>
    </div>
    ${renderProgressLine(w)}
    <div class="card rest-card">
      <div class="rest-ring-wrap">
        <svg class="rest-ring" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="${r}" class="rest-ring-bg"></circle>
          <circle cx="100" cy="100" r="${r}" class="rest-ring-fg"
            stroke-dasharray="${C}" stroke-dashoffset="${offset}"
            transform="rotate(-90 100 100)"></circle>
        </svg>
        <div class="rest-ring-label">
          <div class="rest-ring-num">${remaining}</div>
          <div class="rest-ring-sub">rest</div>
        </div>
      </div>
      <p class="exercise-notes">Breathe. Sip water if you have it.</p>
      ${nextLine ? `<p class="rest-next">${escapeHtml(nextLine)}</p>` : ''}
      <button class="btn-ghost hold-to-skip" id="skip-rest" type="button" data-hold-ms="${HOLD_TO_SKIP_MS}">
        <span class="hold-fill"></span>
        <span class="hold-label">Hold to skip rest</span>
      </button>
      <button class="back-link" id="step-back" type="button" aria-label="Back to the exercise you just did">‹ Back</button>
    </div>
  `;
}

// v48 (Sep 24 2026) — the round-1 floor. Between round 1's last move and round
// 2: rest if she wants it, go on, or stop here with a session that still counts.
// Your words for Lite: one round, "still counts". One sage (Start round 2).
export function renderRoundBreak(w: Workout): string {
  const first = w.main[0];
  return `
    <div class="screen-header">
      <h2>Workout ${w.id}</h2>
      <div class="screen-header-actions">
        ${renderPauseButton()}
        ${renderListButton()}
        <button class="quit-link" id="quit" type="button">× Quit workout</button>
      </div>
    </div>
    ${renderProgressLine(w)}
    <div class="card round-break-card">
      <h2 class="round-break-title">Round 1 done ✓</h2>
      ${first ? `<p class="round-break-next">Next · Round 2 · ${escapeHtml(displayName(first))}</p>` : ''}
      <button class="back-link round-break-finish" id="finish-here" type="button">Finish here — it still counts</button>
    </div>
    ${renderActionBar(`
      <div class="step-nav">
        <button class="btn-large btn-back" id="step-back" type="button" aria-label="Back to round 1's last move">‹ Back</button>
        <button class="btn-large btn-primary" id="start-round-2" type="button">Start round 2</button>
      </div>`)}
  `;
}

// Seconds one entry asks for: durationSec, else the number in "45 sec"/"60 sec";
// null for a count ("8 breaths").
function stretchHoldSec(s: Exercise): number | null {
  if (typeof s.durationSec === 'number' && s.durationSec > 0) return s.durationSec;
  const m = (s.reps ?? '').match(/(\d+)\s*sec/i);
  return m ? Number(m[1]) : null;
}

// "~45 s each side" / "~45 s" — the honest estimate, never a "45 sec" that
// reads like a timer under a "no timer" line. A count ("8 breaths") shows as is.
function stretchRowTime(g: StretchGroup): string {
  const first = g.items[0];
  const sec = first ? stretchHoldSec(first) : null;
  if (sec === null) return first?.reps ?? '';
  return `~${sec} s${g.eachSide ? ' each side' : ''}`;
}

// Whole-list estimate in minutes: each side counts (7 pairs × 2 + 4 singles =
// 18 holds × 45 s = 13.5 min → "~13 min", the figure in DECISIONS §4). Floor,
// not round: an estimate that sits under the truth feels like room, not a debt.
function stretchListMinutes(groups: StretchGroup[]): number {
  let sec = 0;
  for (const g of groups) {
    const sides = g.eachSide ? 2 : 1;
    const each = g.items[0] ? (stretchHoldSec(g.items[0]) ?? 45) : 45;
    sec += each * sides;
  }
  return Math.max(1, Math.floor(sec / 60));
}

// v60 (Sep 28 2026) — F2: no per-stretch tick. Her words (Sep 25 14:54):
// "when I do the stretches I just say I'm done. I don't mark them in the
// app and do it on my own." The row is read-only now (name + time + the
// ▸ how-to toggle) — state.stretchTicks stays in AppState/the resume
// snapshot untouched (nothing writes it any more; harmless dead state,
// simpler than threading its removal through sync/resume too) but nothing
// here reads or renders it either.
function renderStretchRow(g: StretchGroup): string {
  const cueKey = `stretch::${g.key}`;
  const cueOpen = g.cue !== null && state.openSections[cueKey] === true;
  const cueToggle =
    g.cue === null
      ? ''
      : `<button class="stretch-cue-toggle ${cueOpen ? 'is-open' : ''}" data-toggle-section="${escapeHtml(cueKey)}" type="button" aria-expanded="${cueOpen}" aria-label="How to do ${escapeHtml(g.name)}"><span aria-hidden="true">▸</span></button>`;
  const setups = g.items.map((s) => renderExerciseSetup(s)).join('');
  return `
      <li class="stretch-row">
        <div class="stretch-row-head">
          <span class="stretch-name">${escapeHtml(g.name)}</span>
          <span class="stretch-reps">${escapeHtml(stretchRowTime(g))}</span>
          ${cueToggle}
        </div>
        ${cueOpen && g.cue !== null ? `<p class="stretch-cue">${escapeHtml(g.cue)}</p>` : ''}
        ${
          /* v40: cooldown is Exercise[] like every other phase, so a stretch CAN
             carry `setup`. Without this call it would silently never render — a
             trap rather than a live bug (no stretch carries one today), found by
             the v32-v39 consistency audit. Rendering it here means the field
             works everywhere its type is allowed. */ setups
        }
      </li>`;
}

// v60 (Sep 28 2026) — F2: one tap, not eleven. The list stays (names + cues,
// readable), but the only controls are a sage "Done stretching ✓" and a
// quiet "Skip" — both just advance (advanceExercise() already treats the
// whole cool-down as ONE step regardless of what's in it); the app never
// recorded whether she stretched, so there's nothing for either button to
// disagree about. Back stays (renderStepNav's own canGoBack()).
export function renderCooldownList(w: Workout): string {
  const groups = groupStretchPairs(w.cooldown ?? []);
  const rows = groups.map((g) => renderStretchRow(g)).join('');

  return `
    <div class="screen-header">
      <h2>Workout ${w.id}</h2>
      <div class="screen-header-actions">
        ${renderPauseButton()}
        ${renderListButton()}
        <button class="quit-link" id="quit" type="button">× Quit workout</button>
      </div>
    </div>
    ${/* v48: the same one progress line as every step (the list = one step). */ renderProgressLine(w)}
    <p class="subtitle">${
      state.liteDay
        ? 'Lite day — do the stretches you need, skip the rest. Done stretching whenever.'
        : /* v48 · P7: one honest line — the old "No timer" sat over "45 sec"
             on every row (DECISIONS §4). Her Jun 6 call: one list, no timer. */
          'About 45 s each — no timer, go by feel.'
    }</p>
    <p class="stretch-progress" aria-live="polite">~${stretchListMinutes(groups)} min</p>

    <div class="card stretch-card">
      <ul class="stretch-list">${rows}</ul>
    </div>
    ${renderStretchFeel()}
    <button class="back-link cooldown-skip" id="cooldown-skip" type="button">Skip</button>

    ${renderStepNav('Done stretching ✓')}
  `;
}

// Full-screen "Paused" overlay — freezes the workout clock and any countdown
// until she taps Resume. Deliberately unmissable so a step-away can't be left
// silently running.
export function renderPausedOverlay(): string {
  return `
    <div class="paused-overlay" id="paused-overlay">
      <div class="paused-card">
        <div class="paused-icon">⏸</div>
        <div class="paused-title">Paused</div>
        <div class="paused-sub">Workout time is on hold — take as long as you need.</div>
        <button class="btn-large btn-primary" id="pause-resume" type="button">Resume workout</button>
      </div>
    </div>`;
}
