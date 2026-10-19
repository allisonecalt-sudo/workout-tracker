// screens/prelog.ts - the pre-log screen: "Workout A" before Start (code-shape step 15b,
// Oct 15 2026). Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: renderPreLog + its helpers (the week label, the "What's in it" overview, the
// wrist + back safety line, the live one-line "stepped this week" fit, the start-time
// clock tick) and attachPreLogHandlers(): the start-time confirm row, the "-before" body /
// mood / back & wrist chips, and the Lite-day toggle. The ticking interval id is
// module-local (was ui.preLogTickId; grep proof: only the two tick functions touched it).
// STAYS in app.ts: the Start button's binding (#begin -> beginExercises, the workout's own
// setup) and #back-home (shared with weekly review): both sit before attachPreLogHandlers()
// in attachHandlers(), exactly where they were.
// SHARED with the post-log (screens/postlog.ts, 15c): the field markup is log-fields.ts, the
// workout lookups are workout-now.ts, combineDateAndClock is dates.ts: no copies, and this
// screen imports no other screen.
// BINDING ORDER: one element, one listener, same sequence on the pre-log page as before; the
// shared delegates are narrowed by selector ([data-time-chip="start"], the "-before" groups)
// so each element still gets exactly one listener.

import { state } from '../state.js';
import { requestRender } from '../bus.js';
import { bindClick } from '../dom.js';
import { escapeHtml } from '../format.js';
import { formatClock, formatWeekdayDate, combineDateAndClock } from '../dates.js';
import { renderActionBar } from '../action-bar.js';
import { painFromFeel } from '../pain-feel.js';
import { steppedLineText, steppedLineFor, type SteppedMove } from '../move-feel.js';
import { planForWeekKey, type Exercise, type Workout, type Phase } from '../program.js';
import {
  getProgramWeek,
  getViewedProgramWeek,
  homeWeekOffset,
  isNowAfterCompletionLaunch,
  shownWeek,
  gapCountsBackToWeekNum,
  getWeekPlan,
} from '../week-clock.js';
import { renderBodyChips, renderBackWristControl, renderTimeConfirmBlock } from '../log-fields.js';
import {
  currentSteppedMoves,
  displayName,
  getCurrentWorkout,
  lastCardioLane,
  tonightNames,
  workoutMinutesLabel,
} from '../workout-now.js';

// Module-local since step 15b (was ui.preLogTickId): only the two tick functions below touch it.
let preLogTickId: number | null = null;

// T1 (Sep 27 2026), PLAN-2026-09-26.md §3.1: "the clock is the time the
// pre-log opened, and it updates each minute until she touches it." Same
// shape as updateWalkLiveLine/walkTickId above — a direct textContent patch
// on its own id, never a full render() (a re-render mid-typing elsewhere on
// the screen would be its own kind of bug). A no-op once she's confirmed/
// fixed it (herStartConfirmed) or the element isn't on screen any more.
function updatePreLogClockLine(): void {
  if (state.herStartConfirmed) return;
  const el = document.getElementById('time-start');
  if (!el) return;
  el.textContent = `Starting the workout · ${formatClock(new Date().toISOString())}. Right?`;
}

export function beginPreLogClockTick(): void {
  if (preLogTickId === null) {
    preLogTickId = window.setInterval(updatePreLogClockLine, 60_000);
  }
}

export function endPreLogClockTick(): void {
  if (preLogTickId !== null) {
    window.clearInterval(preLogTickId);
    preLogTickId = null;
  }
}

// Moves that put pressure on the palms or the grip — where the one wrist + back
// line belongs (DECISIONS §5: the amber box was 58 words, the same every
// session, and shown on C too, where none of these moves exist).
const WRIST_BACK_MOVES: readonly string[] = [
  'Bird dog (legs only)',
  'Wall lean (wrist on-ramp)',
  '1 kg biceps curl',
  'Prone row (bodyweight)',
  'Bodyweight hip hinge',
];

function workoutNeedsWristLine(w: Workout): boolean {
  return [...w.warmup, ...w.main, ...(w.upperBack ?? [])].some((ex) =>
    WRIST_BACK_MOVES.includes(ex.name)
  );
}

// "R2 · Week 4" from the calendar; when the loaded plan is a different week
// it names the plan instead — the same fail-loud as the home header (DECISIONS
// §5). Swing fix (Sep 26 2026): mirrors homeWeekTitle's viewed-week choice, so
// a swing-Saturday pre-log reads last week's label, not the calendar's.
function preLogWeekLabel(): string {
  if (!isNowAfterCompletionLaunch()) {
    // Pre-launch — original logic, untouched (see homeWeekTitle's comment).
    const week = homeWeekOffset() === 1 ? getViewedProgramWeek(1) : getProgramWeek();
    const plan = getWeekPlan();
    const planRound = plan.round ?? 1;
    const round = week.round > 1 ? `R${week.round} · ` : '';
    if (plan.weekNum === week.num && planRound === week.round) return `${round}Week ${week.num}`;
    return `${planRound > 1 ? `R${planRound} · ` : ''}Week ${plan.weekNum}'s plan`;
  }
  // WK2 (Sep 27 2026), §2.4 "Pre-log meta line": "Week 5" plain, or
  // "Week 6 · same moves as Week 5" when PROGRAM has no row for it yet.
  const shown = shownWeek();
  // WK2 fix r1 (checker's should #1): during a gap, the session she's about
  // to start counts BACKWARD (week.ts rule 3) — say that truth, not the
  // pending week's number (see gapCountsBackToWeekNum's own comment).
  const backWeek = gapCountsBackToWeekNum();
  if (backWeek !== null) {
    return `Week ${backWeek} · an extra rep, Week ${shown.key.week} opens ${formatWeekdayDate(shown.pending!.opensAt)}`;
  }
  const planInfo = planForWeekKey(shown.key);
  if (planInfo.noPlanForRound !== null) return `Week ${shown.key.week} · no plan written yet`;
  return planInfo.repeatsWeek === null
    ? `Week ${shown.key.week}`
    : `Week ${shown.key.week} · same moves as Week ${planInfo.repeatsWeek}`;
}

export function renderPreLog(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  // v48 · P5 (Sep 24 2026): one quiet line instead of a subtitle, a counts card
  // and an amber box — her walk: "it asks 'how do you feel?', then the slider
  // says 'your BODY, not your mood' … Start is cut off at the bottom".
  const fresh = tonightNames(w, w.id, 'new');
  // v48 · fix r1: returning moves are "back", not "new" (Round 1 had them).
  const back = tonightNames(w, w.id, 'back');
  const hasCardio = w.warmup.some((e) => e.name === 'Outdoor walk');
  // v54 fix r1 (Sep 27 2026), checker's nice #6: "Week 5" read as though D
  // counted toward the week (it never does — see postLogWitnessLine's own
  // D branch). "Extra" says the true thing here too.
  const meta = [
    w.id === 'D' ? 'Extra' : preLogWeekLabel(),
    fresh.length ? `new tonight: ${fresh.join(' · ')}` : '',
    back.length ? `again: ${back.join(' · ')}` : '',
    hasCardio && lastCardioLane() === 'elliptical' ? 'elliptical' : '',
    workoutMinutesLabel(w),
  ]
    .filter((s) => s !== '')
    .join(' · ');
  // v58 (Sep 28 2026), her spec item 2: "a tiny 'what stepped this week'
  // line ... so she knows which moves will ask." Same stepped-moves list the
  // in-workout chip reads (currentSteppedMoves) — the two can never disagree
  // about which moves ask tonight. Empty when nothing stepped (a repeat
  // week) — no empty line, nothing shown.
  // v59 fix pass (Sep 28 2026, CHECK-v58 round 2 must #R2-S1): the line used
  // to join every stepped move's summary with no cap — on a several-move
  // week (R2·Week4's split squat + hip hinge + wall sit) it wrapped to a
  // second line and pushed the Lite chip's bottom past the action bar (862 vs
  // 826 at 412×915, still 0 scroll). steppedLineText (move-feel.ts) caps what
  // SHOWS to one line's worth of text, "+N more" for the rest — the chip
  // itself (renderMoveFeel, mid-workout) still reads currentSteppedMoves()
  // directly, so every move still gets asked, only the PREVIEW truncates.
  const steppedThisWeek = currentSteppedMoves();
  const steppedLine = steppedLineText(steppedThisWeek);
  // Lite = one round less, never below 1 — the chip says how many rounds today.
  const liteRounds = Math.max(1, w.rounds - 1);
  const liteWord = liteRounds === 1 ? 'one round' : `${liteRounds} rounds`;
  // A low body reading SUGGESTS Lite with a gentle outline; it never switches
  // itself on (agency rule: ask or suggest, never tell).
  const suggestLite = !state.liteDay && state.capacityBeforeTouched && state.capacityBefore <= 3;
  // v54 fix r2 (Sep 27 2026), checker's should #2: D always has one step and
  // one round already (getWorkoutD()) — "Lite — one round, still counts"
  // read as an offer to CUT something D never had two of. No Lite row on D.
  const liteChip =
    w.id === 'D'
      ? ''
      : state.liteDay
        ? `<button class="lite-chip lite-toggle-on" id="lite-toggle" type="button" aria-pressed="true">✓ Lite · ${liteRounds} round${liteRounds === 1 ? '' : 's'} today · tap to undo</button>`
        : `<button class="lite-chip${suggestLite ? ' lite-suggest' : ''}" id="lite-toggle" type="button" aria-pressed="false">🪫 Hard day? Lite — ${liteWord}, still counts</button>`;
  // v51 (Sep 25 2026): the pre-log Back & wrist reading — same "Fine · Back ·
  // Wrist" combined control as post-log (renderBackWristControl), its own ids
  // ("-pre" suffix) and its own state fields (backPainBefore/wristPainBefore)
  // so post-log's ids stay untouched. Her words: "and all metrics bf workout
  // have after as well".
  const backBeforeSome =
    state.backBeforeSomethingOpen || (state.backPainBeforeTouched && state.backPainBefore > 0);
  const wristBeforeSome =
    state.wristBeforeSomethingOpen || (state.wristPainBeforeTouched && state.wristPainBefore > 0);
  const backWristBefore = renderBackWristControl({
    fineId: 'back-fine-pre',
    backSomeId: 'back-some-pre',
    wristSomeId: 'wrist-some-pre',
    backChipGroup: 'back-before',
    wristChipGroup: 'wrist-before',
    backValue: state.backPainBefore,
    backTouched: state.backPainBeforeTouched,
    backOpen: backBeforeSome,
    wristValue: state.wristPainBefore,
    wristTouched: state.wristPainBeforeTouched,
    wristOpen: wristBeforeSome,
  });
  return `
    <div class="screen-header prelog-header">
      <div class="prelog-title">
        <h2>Workout ${w.id}</h2>
        <span class="subtitle-inline">${escapeHtml(w.name)}</span>
      </div>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>
    ${renderTimeConfirmBlock({
      kind: 'start',
      label: 'Starting the workout',
      at: state.herStartAt,
      confirmed: state.herStartConfirmed,
      editingOpen: state.herStartEditingOpen,
    })}
    <p class="prelog-meta">${escapeHtml(meta)}</p>
    ${steppedLine ? `<p class="prelog-stepped" id="prelog-stepped">${escapeHtml(steppedLine)}</p>` : ''}

    ${renderWorkoutOverview(w)}

    <div class="card body-card">
      ${renderBodyChips('cap-before', state.capacityBefore, state.capacityBeforeTouched, 'Your BODY right now, not your mood')}
      ${renderBodyChips('mood-before', state.moodBefore, state.moodBeforeTouched, 'Mood', '1 irritable · 10 happy / calm')}
      ${backWristBefore}
    </div>

    ${liteChip}

    ${workoutNeedsWristLine(w) ? `<p class="safety-line">Wrist + back: pressure fine — back off if it is sharp, climbing, or still there tomorrow.</p>` : ''}

    ${renderActionBar(`<button class="btn-large btn-primary" id="begin" type="button">Start</button>`)}
  `;
}

// v59 (Sep 28 2026), CHECK-v58 round 2 must #R2-S1: renderPreLog's own
// #prelog-stepped starts out UNTRIMMED (steppedLineText shows every stepped
// move) — this is the live fit, run once right after the pre-log screen
// mounts (render()'s own post-innerHTML hook). Forces one line (nowrap),
// compares the text's real rendered width (scrollWidth) against the real box
// width (clientWidth — a block <p>'s own width, set by its container,
// unaffected by nowrap), and drops trailing moves — "+N more" for the rest —
// until it actually fits. A character-count budget was tried and dropped
// here on purpose (move-feel.ts's own comment on steppedLineFor): real
// letters vary too much in width to predict this without measuring the real
// font. Always leaves at least one move shown, even if that one alone still
// doesn't fit (the fallback below restores normal wrapping rather than
// clipping it off).
export function fitSteppedLine(stepped: readonly SteppedMove[]): void {
  if (stepped.length === 0) return;
  const el = document.getElementById('prelog-stepped');
  if (!el) return;
  // Fix pass (Sep 28 2026, v59 CHECK nice): the CSSOM `.style` property
  // setter has a real Chromium quirk (verified directly, isolated repro) —
  // after a SECOND touch of `.style` with no attribute read in between
  // (exactly this function's shape: set nowrap, mutate textContent in the
  // loop, unset), neither `.style.whiteSpace = ''` nor
  // `.style.removeProperty(...)` nor even a later `.removeAttribute('style')`
  // actually drops the attribute — Chromium silently leaves a stale
  // `style=""` behind (the golden HTML gate is what caught it). Going
  // through the plain attribute API for BOTH the set and the restore (never
  // touching `.style` itself) sidesteps it and was verified to work.
  const prevStyleAttr = el.getAttribute('style'); // null on a fresh pre-log mount — no inline style yet
  el.setAttribute('style', 'white-space: nowrap');
  let shown = stepped.length;
  while (shown > 1 && el.scrollWidth > el.clientWidth) {
    shown -= 1;
    el.textContent = steppedLineFor(stepped, shown);
  }
  if (prevStyleAttr === null) {
    el.removeAttribute('style');
  } else {
    el.setAttribute('style', prevStyleAttr);
  }
}

// Workout overview — the structure before starting (2026-05-15 18:07: "see the
// structure at a glance"). v48 · P5 (Sep 24 2026): folded into ONE closed row
// "What's in it ▸" — the counts card (4 / 6 / 6 / 18) never said what was new
// tonight, and it pushed Start below the fold. Open, each phase lists its moves.
function renderWorkoutOverview(w: Workout): string {
  const phases: { key: Phase; label: string; emoji: string; items: Exercise[] }[] = [
    { key: 'warmup', label: 'Warm-up', emoji: '🚶', items: w.warmup },
    {
      key: 'main',
      label: `Main · ${w.rounds} round${w.rounds === 1 ? '' : 's'}`,
      emoji: '💪',
      items: w.main,
    },
    ...(w.upperBack?.length
      ? [{ key: 'upperBack' as Phase, label: 'Upper back', emoji: '🔼', items: w.upperBack }]
      : []),
    { key: 'cooldown', label: 'Stretch', emoji: '🧘', items: w.cooldown },
  ];
  const rows = phases
    .map((p) => {
      const count = p.items.length;
      // v46: the warm-up step is a three-way pick now (her Sep 24: "no more
      // walk it could be walk or elliptical") — display only; the key stays.
      // v48 · P3: one helper for it everywhere (displayName).
      // v63 item 4: each name opens the read-only move sheet; the text reads exactly as before.
      const names = p.items
        .map(
          (e, i) =>
            `<span class="move-link" role="button" tabindex="0" data-preview-move="${escapeHtml(`${w.id}|${p.key}|${i}`)}">${escapeHtml(displayName(e))}</span>`
        )
        .join(' · ');
      // v48 · P5: flat inside the one fold — a second tap per phase was a
      // second door to the same list.
      return `
        <div class="overview-phase overview-phase-flat">
          <div class="overview-phase-summary">
            <span class="overview-phase-emoji">${p.emoji}</span>
            <span class="overview-phase-label">${p.label}</span>
            <span class="overview-phase-count">${count}</span>
          </div>
          <div class="overview-phase-items">${names}</div>
        </div>`;
    })
    .join('');
  // The week now lives in the pre-log's one quiet line ("R2 · Week 4 · …").
  return `
    <details class="card overview-card prelog-overview">
      <summary class="prelog-overview-summary">What's in it</summary>
      <div class="overview-phases">${rows}</div>
    </details>
  `;
}

// attachHandlers() calls this where the first pre-log row (#time-start-ok) used to be bound.
// Every row below is on a pre-log-only element, so on every other screen it binds nothing.
export function attachPreLogHandlers(): void {
  // T1 (Sep 27 2026), §3.1/§3.2: the start confirm row — ✓ Right fixes it at
  // whatever the live clock is showing RIGHT NOW (not the possibly-stale
  // last-tick value); ✎ Fix opens the time box + "N min ago" chips instead.
  const confirmStartNow = (): void => {
    const iso = new Date().toISOString();
    state.herStartAt = iso;
    state.herStartConfirmed = true;
    state.herStartEditingOpen = false;
    endPreLogClockTick();
    requestRender();
  };
  bindClick('time-start-ok', confirmStartNow);
  bindClick('time-start-fix', () => {
    state.herStartEditingOpen = true;
    endPreLogClockTick(); // she's deciding now — the live "now" line stops moving under her
    requestRender();
  });
  // "N min ago" — fixes AND confirms in one tap (§3.1: "Picking a time sets
  // it straight away").
  document.querySelectorAll<HTMLButtonElement>('[data-time-chip="start"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mins = Number(btn.dataset['mins']);
      if (!Number.isFinite(mins)) return;
      const iso = new Date(Date.now() - mins * 60_000).toISOString();
      state.herStartAt = iso;
      state.herStartConfirmed = true;
      state.herStartEditingOpen = false;
      requestRender();
    });
  });
  // The time box itself (native picker) — same "sets it straight away" rule,
  // combined with the candidate's own calendar day (she's fixing a time
  // earlier tonight, not typing a date).
  const timeStartInput = document.getElementById('time-start-input') as HTMLInputElement | null;
  timeStartInput?.addEventListener('change', () => {
    if (!timeStartInput.value) return;
    state.herStartAt = combineDateAndClock(new Date().toISOString(), timeStartInput.value);
    state.herStartConfirmed = true;
    state.herStartEditingOpen = false;
    requestRender();
  });

  // v48 · P5: the 1-10 body/back chips (the pre-log's "-before" groups). Tap =
  // that number; tap the chosen one again = no reading (null). v53 (Sep 26
  // 2026): the back/wrist groups are drawn in FEEL (renderBackWristControl), so
  // `v` is a FEEL number for those two: convert with painFromFeel before it
  // touches state, which stays PAIN throughout.
  document.querySelectorAll<HTMLButtonElement>('[data-body-chip$="-before"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.dataset['bodyChip'];
      const v = Number(btn.dataset['value']);
      if (!Number.isFinite(v)) return;
      const again = btn.getAttribute('aria-checked') === 'true';
      if (group === 'cap-before') {
        state.capacityBefore = v;
        state.capacityBeforeTouched = !again;
      } else if (group === 'mood-before') {
        state.moodBefore = v;
        state.moodBeforeTouched = !again;
      } else if (group === 'back-before') {
        state.backPainBefore = painFromFeel(v);
        state.backPainBeforeTouched = !again;
        state.backBeforeSomethingOpen = true;
      } else if (group === 'wrist-before') {
        state.wristPainBefore = painFromFeel(v);
        state.wristPainBeforeTouched = !again;
        state.wristBeforeSomethingOpen = true;
      }
      requestRender();
    });
  });
  // v51 (Sep 25 2026): the pre-log twin of the three handlers above — same
  // shape, its own "-pre" ids and its own (Before) state fields.
  bindClick('back-fine-pre', () => {
    const wasBothFine =
      state.backPainBeforeTouched &&
      state.backPainBefore === 0 &&
      state.wristPainBeforeTouched &&
      state.wristPainBefore === 0;
    state.backPainBefore = 0;
    state.backPainBeforeTouched = !wasBothFine;
    state.backBeforeSomethingOpen = false;
    state.wristPainBefore = 0;
    state.wristPainBeforeTouched = !wasBothFine;
    state.wristBeforeSomethingOpen = false;
    requestRender();
  });
  bindClick('back-some-pre', () => {
    const open =
      state.backBeforeSomethingOpen || (state.backPainBeforeTouched && state.backPainBefore > 0);
    if (open) {
      state.backBeforeSomethingOpen = false;
      state.backPainBeforeTouched = false;
    } else {
      state.backBeforeSomethingOpen = true;
      state.backPainBeforeTouched = false; // "Fine" is no longer the answer
    }
    requestRender();
  });
  bindClick('wrist-some-pre', () => {
    const open =
      state.wristBeforeSomethingOpen || (state.wristPainBeforeTouched && state.wristPainBefore > 0);
    if (open) {
      state.wristBeforeSomethingOpen = false;
      state.wristPainBeforeTouched = false;
    } else {
      state.wristBeforeSomethingOpen = true;
      state.wristPainBeforeTouched = false;
    }
    requestRender();
  });

  // Lite-day toggle on pre-log (Allison Jul 12 2026): one round less, streak intact.
  bindClick('lite-toggle', () => {
    state.liteDay = !state.liteDay;
    requestRender();
  });
}
