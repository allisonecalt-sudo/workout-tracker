// screens/postlog.ts - the post-log screen: "Nice. Workout A done." before Save (code-shape
// step 15c, Oct 15 2026). Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: renderPostLog + its helpers (the witness line, the Breaks? chips, the "About N min of
// training" result, the finish-before-start warning, the two Back paths, the finish-time clock
// tick) and attachPostLogHandlers(): the note + wall-sit inputs, the finish-time confirm row,
// the Breaks chips, the after-session body / mood / back & wrist chips and Save. Save calls
// actions.ts (saveCompletedSession) through logCompleteAndHome(), which only this screen uses.
// The feel chips (arm-feel + load chip, move-feel, ride feel) are NOT drawn here: they are the
// workout screen's (renderArmFeel / renderMoveFeel / renderRideFeel inside renderWorkout and
// the ride-numbers card) and move with step 17; post-log only SAVES what they set.
// The tick id and the saving flag are module-local (were ui.postLogTickId / ui.savingLog;
// grep proof: nothing else read them). STAYS in app.ts: resetPostLogFields / enterPostLog (the
// session ending paths call them) and the quit panel; both import the exports below.
// SHARED with the pre-log: field markup is log-fields.ts, workout lookups workout-now.ts: no
// copies, and this screen imports no other screen. One element, one listener, same sequence
// on the post-log page as before; the shared delegates are narrowed by selector.

import { state } from '../state.js';
import { loadLogs } from '../state.js';
import { requestRender } from '../bus.js';
import { bindClick } from '../dom.js';
import { escapeHtml } from '../format.js';
import { combineDateAndClock, formatClock } from '../dates.js';
import { renderActionBar } from '../action-bar.js';
import { painFromFeel } from '../pain-feel.js';
import { workoutHasWallSit } from '../hold-sets.js';
import { trainingMinutes } from '../timing.js';
import type { Workout } from '../program.js';
import {
  getCurrentWorkout,
  effectiveRounds,
  skippedStepsCount,
  reachedWallSit,
  liveWeekDTarget,
  getWeekCount,
} from '../workout-now.js';
import {
  isNowAfterCompletionLaunch,
  shownWeek,
  weekModel,
  gapCountsBackToWeekNum,
  weekHasDFor,
} from '../week-clock.js';
import { saveActiveSession, saveCompletedSession } from '../actions.js';
import { renderBodyChips, renderBackWristControl, renderTimeConfirmBlock } from '../log-fields.js';

// Module-local since step 15c (were ui.postLogTickId / ui.savingLog): only the functions in this
// file touch them.
let postLogTickId: number | null = null;
// v45: one save at a time. The walk lane awaits Google Fit (up to 5 s) before
// saving, and a second tap on "Save & finish" in that window wrote a 2nd row.
let savingLog = false;

// T1 §3.2: the post-log twin — "Finishing · 21:52. Right?" ticks the same way.
function updatePostLogClockLine(): void {
  if (state.herEndConfirmed) return;
  const el = document.getElementById('time-end');
  if (!el) return;
  el.textContent = `Finishing · ${formatClock(new Date().toISOString())}. Right?`;
}

export function beginPostLogClockTick(): void {
  if (postLogTickId === null) {
    postLogTickId = window.setInterval(updatePostLogClockLine, 60_000);
  }
}

export function endPostLogClockTick(): void {
  if (postLogTickId !== null) {
    window.clearInterval(postLogTickId);
    postLogTickId = null;
  }
}

async function logCompleteAndHome(): Promise<void> {
  if (!state.selectedWorkout || savingLog) return;
  savingLog = true;
  try {
    await saveCompletedSession();
  } finally {
    savingLog = false;
  }
}

// v49 · look (Sep 25 2026): "41 min · both rounds · 1 of 3 this week" — every
// value already exists on state/the week count (spec §6 "Post-log sub-lines").
// Round count is an honest preview (the real save recomputes it); the week
// count includes the session about to be saved (+1), since that's the number
// she's about to see on Home the moment she taps Save.
// T1 fix r1 (Sep 27 2026, checker's should #4): the app-time minutes (the
// tap-to-tap clock, from state.startedAt) used to open this line too — once
// she answers the new Finishing "Right?" question, renderTimeResult's own
// "About N min of training" (HER times) shows up a few lines below it,
// contradicting this line's app-time minutes on the same screen (T1's own
// §3: "app time is never shown as workout time again"). Dropped here —
// her confirmed timing is the only duration this screen states now.
function postLogWitnessLine(w: Workout): string {
  const parts: string[] = [];
  // v49 · look fix (Sep 25 2026): the round count has to be the day's EFFECTIVE
  // rounds — Lite, or "Finish here — it still counts" (finishAtRoundOne sets
  // liteDay too) — not the full program's w.rounds. The line was saying "both
  // rounds" on exactly the days she only did one (Opus check).
  const rounds = effectiveRounds(w);
  if (rounds === 2) parts.push(state.currentRound >= 2 ? 'both rounds' : '1 round');
  else if (rounds > 2) parts.push(`${state.currentRound} of ${rounds} rounds`);
  else parts.push('1 round'); // effectiveRounds 1 — e.g. Lite on a 2-round day (C)
  // v54 fix r1 (Sep 27 2026): D is extra, never one of the 3 letters — the
  // checker caught this line still doing `doneLetters.add('D')`, which
  // inflated the count and contradicted the 19:17 decision that D never
  // counts toward 3 of 3. Say what's true instead of a week fraction.
  if (state.selectedWorkout === 'D') {
    parts.push('extra, on top of A/B/C');
    return parts.join(' · ');
  }
  // WK2 (Sep 27 2026): post-launch, "this week" becomes "in Week N" — the
  // completion model's own week, not the calendar's (§2.4 "Post-log line":
  // "1 round · 2 of 3 in Week 5"). Pre-launch (or a mocked earlier date)
  // keeps the original calendar count untouched.
  if (!isNowAfterCompletionLaunch()) {
    parts.push(`${getWeekCount(0) + 1} of 3 this week`);
  } else {
    const shown = shownWeek();
    // WK2 fix r1 (checker's should #1): during a gap, this save actually
    // counts BACKWARD (week.ts rule 3) into the week that just closed — say
    // that truth, consistent with what weekOf will resolve to once saved,
    // not the pending week's own (not-yet-real) count.
    // v61 fix pass (Sep 28 2026, CHECK-v61 should #4): both branches below
    // used to stay at "of 3" after the Home/weekly-review line (weekCountLine)
    // widened to "of 4" — the same D read those use (weekHasD on the raw
    // logs, week.ts drops D from its own model by design).
    // v61 fix pass 2 (Oct 2 2026): one `weekModel()` call shared by both
    // branches — the gap branch needs `open`/`pending` too now (not just
    // `spans`), for week-d.ts's own window end (see its header).
    const dLogs = loadLogs().filter((l) => l.workout === 'D');
    const model = weekModel();
    const backWeek = gapCountsBackToWeekNum();
    if (backWeek !== null) {
      // WK2 fix r2 (Sep 27 2026, checker's nice #6): "(already 3 of 3)" was
      // hard-coded — true today (a gap only ever exists after a 'three'
      // close, since WK3's "moved on" isn't shipped yet), but it'll be wrong
      // the day a moved-on week (1 or 2 done) exists. Read the real count off
      // the actual closed span instead of assuming it.
      const { spans } = model;
      const lastSpan = spans.length ? spans[spans.length - 1] : null;
      const closedDone = lastSpan ? lastSpan.done.length : 3;
      const closedHasD = weekHasDFor(lastSpan ? { span: lastSpan } : null, model, dLogs);
      parts.push(
        `an extra for Week ${backWeek} (already ${closedDone + (closedHasD ? 1 : 0)} of 4)`
      );
    } else {
      // WK2 fix r1 (Sep 27 2026, checker's should #2): `.done.length + 1`
      // overcounts a REPEAT letter — doing A a second time in a week that
      // already has A showed "2 of 3 in Week 5" here while Home and the Done
      // card (which both count DISTINCT letters, per week.ts's own `done`
      // semantics) correctly stayed at "1 of 3". Count distinct letters the
      // same way everywhere instead of always adding one.
      const doneLetters = new Set<string>(shown.span?.done ?? []);
      if (state.selectedWorkout) doneLetters.add(state.selectedWorkout);
      const hasD = weekHasDFor(liveWeekDTarget(shown), model, dLogs);
      parts.push(`${doneLetters.size + (hasD ? 1 : 0)} of 4 in Week ${shown.key.week}`);
    }
  }
  return parts.join(' · ');
}

// T1 §3.2: "Breaks?": None · ~5 · ~15 · ~30+, data-break = 0/5/15/30.
// Same toggle-again-to-clear shape as the 1-10 body chips (attachHandlers'
// [data-body-chip] block) — untouched/cleared reads back as null, never 0;
// "None" is its own explicit tap that means a real, confirmed zero.
function renderBreakChips(value: number | null): string {
  // T1 fix r1 (Sep 27 2026, checker's nice #3): "~5 min"/"~15 min" wrapped
  // onto two lines in the 4-column grid at 412px — "min" is redundant next
  // to the "Breaks?" label right above, so it's dropped instead of shrinking
  // the tap-target font.
  const chips: { label: string; mins: number }[] = [
    { label: 'None', mins: 0 },
    { label: '~5', mins: 5 },
    { label: '~15', mins: 15 },
    { label: '~30+', mins: 30 },
  ];
  const row = chips
    .map((c) => {
      const on = value === c.mins;
      return `<button class="timing-break-chip${on ? ' timing-break-chip-on' : ''}" type="button" data-break="${c.mins}" aria-pressed="${on ? 'true' : 'false'}">${c.label}</button>`;
    })
    .join('');
  return `
    <div class="field timing-break-field">
      <span class="label-text">Breaks?</span>
      <div class="timing-break-row" id="break-chips">${row}</div>
    </div>`;
}

// T1 §3.2: "only when both are confirmed: `About 45 min of training`,
// rounded to 5." Reads state directly (not formatWorkoutTime — that's T2's
// universal "about N min" string; this card's own wording is its own).
function renderTimeResult(): string {
  if (!state.herStartConfirmed || !state.herEndConfirmed) return '';
  const minutes = trainingMinutes({
    herStartAt: state.herStartAt,
    herStartConfirmed: state.herStartConfirmed,
    herEndAt: state.herEndAt,
    herEndConfirmed: state.herEndConfirmed,
    breakMinutes: state.breakMinutes,
  });
  if (minutes === null) return '';
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  return `<p class="timing-result" id="time-result">About ${rounded} min of training</p>`;
}

// T1 §3.2: "If the finish is before the start: an inline ... Save still
// works (never block a save)." herStartAt is always set by this screen
// (beginExercises() finalized it) — only herEndConfirmed gates this, so the
// warning appears the moment she answers the finish question, before Save.
function finishBeforeStartWarning(): string {
  if (!state.herEndConfirmed || !state.herStartAt || !state.herEndAt) return '';
  const backwards = new Date(state.herEndAt).getTime() < new Date(state.herStartAt).getTime();
  return backwards
    ? `<p class="timing-warning" id="time-warning">Finish is before the start — check the times.</p>`
    : '';
}

export function renderPostLog(): string {
  const w = getCurrentWorkout();
  if (!w) return '';
  // v48 · P5 (Sep 24 2026) — every field is one tap or skippable, and Save is
  // pinned (her walk: "the body slider starts at 5 again. The keyboard covers
  // Save while I type my word"). Untouched still saves null (v46).
  // Wall sit only on a workout that has one — on C it asked a question she
  // can't answer (uxui post-log 3/5). Pre-filled from the timer.
  const wallSitField =
    workoutHasWallSit(w) && (state.stoppedEarlyAt === null || reachedWallSit(w))
      ? `<label class="field">
        <span class="label-text">${state.wallSitSec > 0 ? `Wall sit ${state.wallSitSec} s (tap to adjust)` : 'Wall sit (s)'}</span>
        <input type="number" id="wallsit" min="0" max="600" inputmode="numeric" value="${state.wallSitSec > 0 ? state.wallSitSec : ''}" />
      </label>`
      : '';
  // Back & wrist: ONE combined control (DECISIONS §5 — 34 of 39 rows are 0,
  // and a truthful 0 used to take a drag away and back).
  // v49 · engine fix (Sep 25 2026): the Sep 24 build gave wrist its OWN
  // Fine/Something row — a normal clean session went from 1 tap (Fine) to 2
  // (Back Fine + Wrist Fine), which the commit message wrongly called
  // "same tap cost either way" (spec §6: "Back & wrist: Fine · Back ·
  // Wrist" is ONE control). Fine now writes both back=0 and wrist=0 in one
  // tap; Back/Wrist each open their own 1-10 row (2 taps), same as before.
  // #back-fine/#back-some/#wrist-some keep their ids so the already-shipped
  // tests (tests/screens/*.spec.ts) still hold.
  // v51 (Sep 25 2026): markup now comes from the shared renderBackWristControl
  // (same component the pre-log reading uses) — ids/groups passed in exactly
  // as before, so the rendered HTML is unchanged.
  const backSome = state.backSomethingOpen || (state.backPainTouched && state.backPain > 0);
  const wristSome = state.wristSomethingOpen || (state.wristPainTouched && state.wristPain > 0);
  const backWristAfter = renderBackWristControl({
    fineId: 'back-fine',
    backSomeId: 'back-some',
    wristSomeId: 'wrist-some',
    backChipGroup: 'back',
    wristChipGroup: 'wrist',
    backValue: state.backPain,
    backTouched: state.backPainTouched,
    backOpen: backSome,
    wristValue: state.wristPain,
    wristTouched: state.wristPainTouched,
    wristOpen: wristSome,
  });
  // v48 · fix r1 (Sep 24 2026): a stopped session is not called "done", and its
  // Back goes to the step she stopped on, not to stretches she never reached.
  // Still counts, no verdict.
  const stopped = state.stoppedEarlyAt !== null;
  // v48 · final (Sep 25 2026): "Logged what you did" claimed a save before
  // Save was tapped — if she backed out, nothing was stored. Say what IS true.
  const title = stopped ? `Stopped early · Workout ${w.id}` : `Nice. Workout ${w.id} done.`;
  // v54 fix r1 (Sep 27 2026): D has no cooldown (warmup: [ellipticalStep(30)],
  // main: [], cooldown: []) — "‹ Back to the stretches" used to open an empty
  // cool-down screen ("~1 min · 0 of 0"). D's only step is the ride itself, so
  // the way back is to the ride-numbers screen (backToStretches special-cases
  // w.id === 'D' the same way).
  const backLink = stopped
    ? `<button class="back-link postlog-back" id="back-to-workout" type="button">‹ Back to the workout</button>`
    : w.id === 'D'
      ? `<button class="back-link postlog-back" id="back-to-stretches" type="button">‹ Back to the ride</button>`
      : `<button class="back-link postlog-back" id="back-to-stretches" type="button">‹ Back to the stretches</button>`;
  // v49 · look (Sep 25 2026): the witness line — spec §5 frame 5, "41 min ·
  // both rounds · 1 of 3 this week", movement with no verdict (guide §2).
  // Never shown on a stopped session: its duration and round count are both
  // honest-but-partial, and the title already says "Stopped early".
  const witnessLine = stopped ? '' : postLogWitnessLine(w);
  // v50 · jump list (Sep 25 2026): plain, no verdict — "the log screen says so
  // plainly ('2 moves skipped')" per her spec. Session still saves either way.
  const skippedCount = skippedStepsCount(w);
  const skippedLine =
    skippedCount > 0
      ? `<p class="postlog-skipped">${skippedCount} move${skippedCount === 1 ? '' : 's'} skipped</p>`
      : '';
  // v48 · final (Sep 25 2026): the way back lives at the top now. At the
  // bottom it sat exactly where Done · Finish was tapped a moment earlier, so
  // a double or slow second tap bounced her back to the stretches.
  return `
    <div class="postlog-top">${backLink}</div>
    <h2>${title}</h2>
    ${witnessLine ? `<p class="postlog-witness">${escapeHtml(witnessLine)}</p>` : ''}
    ${skippedLine}
    <p class="subtitle">Quick log — or just Save.</p>

    <div class="card timing-card">
      ${renderTimeConfirmBlock({
        kind: 'end',
        label: 'Finishing',
        at: state.herEndAt,
        confirmed: state.herEndConfirmed,
        editingOpen: state.herEndEditingOpen,
      })}
      ${renderBreakChips(state.breakMinutes)}
      ${finishBeforeStartWarning()}
      ${renderTimeResult()}
    </div>

    <div class="card postlog-card">
      ${renderBodyChips('cap-after', state.capacityAfter, state.capacityAfterTouched, 'Your BODY now, not your mood')}
      ${renderBodyChips('mood-after', state.moodAfter, state.moodAfterTouched, 'Mood', '1 irritable · 10 happy / calm')}

      ${wallSitField}

      ${backWristAfter}

      <label class="field note-field">
        <span class="label-text">Anything about today? (optional)</span>
        <textarea id="session-note" rows="3" maxlength="500" dir="auto" enterkeyhint="done" placeholder="Knee fine, stopped the elliptical early…">${escapeHtml(state.sessionNote)}</textarea>
      </label>
    </div>

    ${renderActionBar(`
      <button class="btn-large btn-primary" id="save-log" type="button">Save</button>
    `)}
  `;
}

// v48 · P5 (Sep 24 2026): the one screen v47's Back missed — her words: "i need
// to be able to go back". Returns to the cool-down list; nothing is logged.
function backToStretches(): void {
  endPostLogClockTick(); // T1: leaving post-log — the finish-time question isn't showing any more
  state.screen = 'workout';
  // v54 fix r1 (Sep 27 2026): D's cooldown is empty (getWorkoutD: main: [],
  // cooldown: []) — the button read "‹ Back to the ride" for D (see its own
  // comment), so land back on the ride-numbers screen, not an empty cool-down.
  if (state.selectedWorkout === 'D') {
    state.currentPhase = 'warmup';
    state.currentExerciseIndex = 0;
    state.rideNumbersOpen = true;
  } else {
    state.currentPhase = 'cooldown';
    state.currentExerciseIndex = 0;
  }
  state.isResting = false;
  state.roundBreak = false;
  requestRender();
}

// v48 · fix r1 (Sep 24 2026): after "Log what I did" the log's Back returns to
// the step she stopped on — not to stretches she never reached — and undoes the
// stop (marker cleared, Lite back to what it was). logWhatIDid left the phase,
// round and step untouched, so the workout picks up exactly there.
function backToWorkoutFromStop(): void {
  endPostLogClockTick(); // T1: leaving post-log — see backToStretches's own comment
  if (state.stoppedEarlyLitePrev !== null) state.liteDay = state.stoppedEarlyLitePrev;
  state.stoppedEarlyAt = null;
  state.stoppedEarlyLitePrev = null;
  state.screen = 'workout';
  state.isResting = false;
  state.roundBreak = false;
  requestRender();
}

// attachHandlers() calls this where the first post-log row (the note box) used to be bound.
// Every row below is on a post-log-only element, so on every other screen it binds nothing.
export function attachPostLogHandlers(): void {
  // v45: the post-log text is kept as she types, so an app close on that
  // screen doesn't lose it (the resume snapshot carries it).
  // v48 · P5 (Sep 24 2026): the one-word box is gone (filled 0 of 9 since Aug
  // 30; its 40-character cap cut her May 11 entry mid-word) — one note box.
  const noteInput = document.getElementById('session-note') as HTMLTextAreaElement | null;
  noteInput?.addEventListener('input', () => {
    state.sessionNote = noteInput.value;
    saveActiveSession();
  });
  // Enter = "done typing" (the keyboard's Done key): it closes the keyboard so
  // Save is in view — it never saves by itself (a save she didn't choose is a
  // surprise). Shift+Enter still makes a new line.
  noteInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      noteInput.blur();
    }
  });
  // The wall-sit number survives a chip tap's re-render.
  const wallsitInput = document.getElementById('wallsit') as HTMLInputElement | null;
  wallsitInput?.addEventListener('input', () => {
    const raw = parseInt(wallsitInput.value, 10);
    state.wallSitSec = Math.max(0, Math.min(600, Number.isFinite(raw) ? raw : 0));
    saveActiveSession();
  });

  // T1 (Sep 27 2026), §3.1/§3.2: the start/finish confirm row — ✓ Right
  // fixes it at whatever the live clock is showing RIGHT NOW (not the
  // possibly-stale last-tick value); ✎ Fix opens the time box + "N min ago"
  // chips instead. (Step 15b: the start half is in screens/prelog.ts; this is
  // the finish half.)
  const confirmEndNow = (): void => {
    const iso = new Date().toISOString();
    state.herEndAt = iso;
    state.herEndConfirmed = true;
    state.herEndEditingOpen = false;
    endPostLogClockTick();
    requestRender();
  };
  bindClick('time-end-ok', confirmEndNow);
  bindClick('time-end-fix', () => {
    state.herEndEditingOpen = true;
    endPostLogClockTick();
    requestRender();
  });
  // "N min ago" — fixes AND confirms in one tap (§3.1: "Picking a time sets
  // it straight away").
  document.querySelectorAll<HTMLButtonElement>('[data-time-chip="end"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mins = Number(btn.dataset['mins']);
      if (!Number.isFinite(mins)) return;
      const iso = new Date(Date.now() - mins * 60_000).toISOString();
      state.herEndAt = iso;
      state.herEndConfirmed = true;
      state.herEndEditingOpen = false;
      requestRender();
    });
  });
  // The time box itself (native picker) — same "sets it straight away" rule,
  // combined with the candidate's own calendar day (she's fixing a time
  // earlier tonight, not typing a date).
  const timeEndInput = document.getElementById('time-end-input') as HTMLInputElement | null;
  timeEndInput?.addEventListener('change', () => {
    if (!timeEndInput.value) return;
    state.herEndAt = combineDateAndClock(new Date().toISOString(), timeEndInput.value);
    state.herEndConfirmed = true;
    state.herEndEditingOpen = false;
    requestRender();
  });
  // Breaks?: None · ~5 min · ~15 min · ~30+ — tap again clears to null
  // (untouched/unknown), same toggle shape as the 1-10 body chips below.
  // "None" is data-break="0", a real confirmed zero, never the default.
  document.querySelectorAll<HTMLButtonElement>('[data-break]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mins = Number(btn.dataset['break']);
      if (!Number.isFinite(mins)) return;
      const again = btn.getAttribute('aria-pressed') === 'true';
      state.breakMinutes = again ? null : mins;
      requestRender();
    });
  });

  // v48 · P5: the 1-10 body/back chips. Tap = that number; tap the chosen one
  // again = no reading (null), the way an untouched slider saved since v46.
  // v53 (Sep 26 2026): the back/wrist groups are drawn in FEEL (renderBack-
  // WristControl), so `v` here is a FEEL number for those two groups — convert
  // with painFromFeel before it touches state, which stays PAIN throughout
  // (DB columns, the progression flare gate, the cycle page). Body/mood are
  // untouched — they were never inverted. (Step 15b: the "-before" groups are
  // in screens/prelog.ts.)
  document
    .querySelectorAll<HTMLButtonElement>('[data-body-chip]:not([data-body-chip$="-before"])')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = btn.dataset['bodyChip'];
        const v = Number(btn.dataset['value']);
        if (!Number.isFinite(v)) return;
        const again = btn.getAttribute('aria-checked') === 'true';
        if (group === 'cap-after') {
          state.capacityAfter = v;
          state.capacityAfterTouched = !again;
        } else if (group === 'mood-after') {
          state.moodAfter = v;
          state.moodAfterTouched = !again;
        } else if (group === 'back') {
          state.backPain = painFromFeel(v);
          state.backPainTouched = !again;
          state.backSomethingOpen = true;
        } else if (group === 'wrist') {
          state.wristPain = painFromFeel(v);
          state.wristPainTouched = !again;
          state.wristSomethingOpen = true;
        }
        requestRender();
      });
    });
  // Back & wrist: Fine = both 0 (ONE tap; v49 engine fix Sep 25 2026 — this
  // used to be Back's own row only, and wrist had a SEPARATE Fine tap, which
  // doubled the cost of a normal clean session from 1 tap to 2). Tap again =
  // no reading, on both.
  bindClick('back-fine', () => {
    const wasBothFine =
      state.backPainTouched &&
      state.backPain === 0 &&
      state.wristPainTouched &&
      state.wristPain === 0;
    state.backPain = 0;
    state.backPainTouched = !wasBothFine;
    state.backSomethingOpen = false;
    state.wristPain = 0;
    state.wristPainTouched = !wasBothFine;
    state.wristSomethingOpen = false;
    requestRender();
  });
  // Back = open back's 1-10 row, nothing chosen yet; tap again = close it and
  // drop any number picked there. Wrist is untouched by this button.
  bindClick('back-some', () => {
    const open = state.backSomethingOpen || (state.backPainTouched && state.backPain > 0);
    if (open) {
      state.backSomethingOpen = false;
      state.backPainTouched = false;
    } else {
      state.backSomethingOpen = true;
      state.backPainTouched = false; // "Fine" is no longer the answer
    }
    requestRender();
  });
  // Wrist = the same shape as Back, above; Back is untouched by this button.
  bindClick('wrist-some', () => {
    const open = state.wristSomethingOpen || (state.wristPainTouched && state.wristPain > 0);
    if (open) {
      state.wristSomethingOpen = false;
      state.wristPainTouched = false;
    } else {
      state.wristSomethingOpen = true;
      state.wristPainTouched = false;
    }
    requestRender();
  });
  bindClick('back-to-stretches', () => {
    backToStretches();
  });
  bindClick('back-to-workout', () => {
    backToWorkoutFromStop();
  });

  bindClick('save-log', () => {
    const wallsitEl = document.getElementById('wallsit') as HTMLInputElement | null;
    if (wallsitEl) {
      const raw = parseInt(wallsitEl.value, 10);
      state.wallSitSec = Math.max(0, Math.min(600, Number.isFinite(raw) ? raw : 0));
    }
    const noteEl = document.getElementById('session-note') as HTMLTextAreaElement | null;
    if (noteEl) state.sessionNote = noteEl.value;
    void logCompleteAndHome();
  });
}
