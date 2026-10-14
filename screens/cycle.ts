// screens/cycle.ts - THE "YOUR CYCLE" PAGE (v51, Sep 25 2026), the third screen module
// (code-shape step 12c, Oct 14 2026). Moved out of app.ts verbatim; no behaviour change,
// no version bump.
//
// Owns: the page's render functions (Cards A / B / C, the info fold, the "Period started
// today" log row), the session adapters that feed cycle.ts's pure math, its click handlers,
// and its own transient state (the module-local lets below). Imports state / ui / bus / dom /
// format / actions / pure modules only - NEVER app.ts or another screen. app.ts imports
// renderCycle (render() switch) and attachCycleHandlers (attachHandlers(), same slot as before).
//
// Decided (ui-field audit, proved by grep over every .ts file before the move):
//  - cycleReturnTo, cycleCompareMetric, progressScrollForCycle were read and written ONLY by
//    renderCycle / its cards / attachCycleHandlers -> module-local `let`s here, and removed
//    from ui.ts. The scroll restore on "back" goes through bus.requestScrollRestore (it was a
//    direct write to ui.pendingScrollRestore, which the registered sink still performs).
//  - cycleUndoStartDate / cycleUndoCreated / cycleUndoTimer STAY in ui: actions.ts's
//    logPeriodStart / undoPeriodStart own the 10 s undo window, and Settings' quiet row reads them.
//  - Progress's door row (renderCycleDoorRow, cycleDoorSub) is Progress's, not this page's:
//    it stays in app.ts until Progress moves. Home's "Period started?" door likewise.
//  - attachCycleHandlers keeps its whole body, including the bindings for the doors that open
//    the page (#open-cycle on Progress, #home-open-cycle on Home) and Settings' quiet row
//    (#settings-cycle-today / -undo): same single group, same position, same order as before.
//
// Next: when Progress moves, its door row imports nothing from here (it only needs
// cyclePeriodsForLogic from state.ts).

import {
  excludedUntouchedCount,
  todayCycleStatus,
  periodLogUrgency,
  buildPlainPhaseTable,
  buildPlainMoodPhaseTable,
  buildPlainBackPhaseTable,
  buildPlainWristPhaseTable,
  isComparable,
  cycleSummaryLine,
  PLAIN_PHASE_LABEL,
  PLAIN_PHASE_HEADER_LABEL,
  MOOD_TRACKING_START_DATE,
  type CyclePeriod,
  type CapacitySession,
  type MoodSession,
  type BackSession,
  type WristSession,
  type TodayCycleStatus,
  type PlainPhaseTableRow,
  type CycleMetric,
} from '../cycle.js';
import { state, getChronologicalLogs, cyclePeriodsForLogic } from '../state.js';
import { ui } from '../ui.js';
import { requestRender, requestScrollRestore } from '../bus.js';
import { bindClick } from '../dom.js';
import { escapeHtml, formatMonthDay } from '../format.js';
import { localIsoDate } from '../dates.js';
import { logPeriodStart, undoPeriodStart } from '../actions.js';
import type { LogEntry } from '../types.js';

// v51 · cycle page (Sep 25 2026) - see renderCycle's own comment for why.
// `cycleReturnTo` says which door she came in by (the Progress row, or the
// Home "Period started?" row - see SPEC-cycle-page.md §2.1, §3), so the back
// button and its scroll restore match. `cycleCompareMetric` is Card C's own
// selected chip; it resets to 'body' every time the page is (re-)opened
// (§2.1). Module-local since step 12c (was ui.cycleReturnTo / ui.cycleCompareMetric /
// ui.progressScrollForCycle).
let cycleReturnTo: 'progress' | 'home' = 'progress';
let cycleCompareMetric: CycleMetric = 'body';
let progressScrollForCycle = 0;

// ---------- v50 · Capacity & cycle card (Sep 25 2026) ----------
//
// Her words (04:01-04:02): "I also want capacity analysis in progress before
// and after and period what phase and then comparing capacity and phase" ->
// "you have all past cycle info". The v48 · P6 capacity chart above was
// pulled because it charted untouched slider defaults as if she'd chosen
// them (DECISIONS §2 #6) — this card reuses that lesson: cycle.ts's
// honestBefore/honestAfter drop every ambiguous pre-v48 "5" before anything
// here sees it, and a phase with under 3 honest sessions shows "not enough
// yet" rather than an average of 1-2. Register: neutral, no PMS, no verdicts
// (app-building-guide.md §1-2 + her Sep 25 ask) — the one optional line is a
// question, never a statement.
// l.date is NOT reliably a plain 'YYYY-MM-DD': a just-saved, not-yet-synced
// row holds the full ISO datetime it was saved with (`completedAt`), while a
// row that's round-tripped through Supabase's `date` column comes back plain
// — both shapes coexist on a real phone. cycle.ts's day math needs the plain
// form, so every date crosses through localIsoDate(new Date(...)) here, the
// same normalization the walk-date and export paths already use elsewhere in
// this file — her LOCAL calendar day, not the UTC one a raw slice would give.
function capacitySessionsFrom(logs: LogEntry[]): CapacitySession[] {
  return logs.map((l) => ({
    date: localIsoDate(new Date(l.date)),
    capacityBefore: l.capacityBefore,
    capacityAfter: l.capacityAfter,
  }));
}

// v50 · mood: same normalization as capacitySessionsFrom above — same reason.
function moodSessionsFrom(logs: LogEntry[]): MoodSession[] {
  return logs.map((l) => ({
    date: localIsoDate(new Date(l.date)),
    moodBefore: l.moodBefore ?? null,
    moodAfter: l.moodAfter ?? null,
  }));
}

// v51: same normalization, back & wrist before -> after.
function backSessionsFrom(logs: LogEntry[]): BackSession[] {
  return logs.map((l) => ({
    date: localIsoDate(new Date(l.date)),
    backBefore: l.backPainBefore ?? null,
    backAfter: l.backPain,
  }));
}

function wristSessionsFrom(logs: LogEntry[]): WristSession[] {
  return logs.map((l) => ({
    date: localIsoDate(new Date(l.date)),
    wristBefore: l.wristPainBefore ?? null,
    wristAfter: l.wristPain ?? null,
  }));
}

// ---------- v51 · "Your cycle" page (Sep 25 2026) — its own screen ----------
//
// See renderCycle's own comment for her words on why. Was the "Capacity &
// cycle" Progress card (jargon 4-phase table + dot/slope chart) -> the
// v51-progress-plain "Your cycle" card (Gemini's review, plain phases, still
// one dense card) -> now its own page, reached by a single door row on
// Progress. Full spec:
// second-brain/self/health/workout-app-audit-2026-09-24/cycle-page-v51/
// SPEC-cycle-page.md. Same underlying math throughout (cycle.ts's honest
// readings, MIN_PHASE_N gate) — only the picture keeps getting plainer.
// Card A's subline once today is placed in a phase (spec §2.3) — no "~", no
// "next one"; the header right above already names the phase in words.
function cycleCardASubline(status: TodayCycleStatus): string {
  if (status.plainPhase === 'on-period') return `day ${status.cycleDay} of your period`;
  if (status.overdue) return `day ${status.cycleDay} · period due any day`;
  return `day ${status.cycleDay} · period expected around ${formatMonthDay(status.nextStart)}`;
}

// Card A — Today (always shown). The two non-normal states (§2.5) share its
// shell; the normal state's header/subline come from today's real phase.
function renderCycleCardA(
  periods: CyclePeriod[],
  todayISO: string,
  status: TodayCycleStatus | null
): string {
  let header: string;
  let subline: string;
  if (periods.length === 0) {
    header = 'No period logged yet';
    subline = 'Phases show here once a start is logged.';
  } else if (!status) {
    header = 'Not placed yet';
    subline = 'Phases show once 2 period starts are logged.';
  } else {
    header = PLAIN_PHASE_HEADER_LABEL[status.plainPhase];
    subline = cycleCardASubline(status);
  }
  return `
    <div class="card progress-card cycle-card-a">
      <div class="cc2-header">${escapeHtml(header)}</div>
      <div class="cc2-subline">${escapeHtml(subline)}</div>
      ${renderCycleLogRow(periods, todayISO)}
    </div>`;
}

// One "This phase" / "Compare phases" number row — Body, Mood, Back pain or
// Wrist pain, shared by Card B and Card C's chip-less styling (§2.3).
function cycleNowRow(label: string, row: PlainPhaseTableRow | undefined): string {
  if (!row || row.avgBefore === null || row.avgAfter === null) return '';
  return `
    <div class="cc2-now">
      <span class="cc2-now-lbl">${escapeHtml(label)}</span>
      <span class="cc2-now-val">${row.avgBefore.toFixed(1)} → ${row.avgAfter.toFixed(1)}</span>
    </div>`;
}

// Card B — This phase (shown only when `status` is non-null; the caller
// gates that). Body ready unlocks Mood/Back/Wrist; not ready says the gap
// once and stops (spec §2.3 — "never four 'not enough yet's").
function renderCycleCardB(
  currentBody: PlainPhaseTableRow,
  currentMood: PlainPhaseTableRow | undefined,
  currentBack: PlainPhaseTableRow | undefined,
  currentWrist: PlainPhaseTableRow | undefined
): string {
  const bodyReady = currentBody.avgBefore !== null && currentBody.avgAfter !== null;
  let body: string;
  if (!bodyReady) {
    const n = currentBody.n;
    body =
      n === 0
        ? `<div class="cc-quiet">No workouts in this phase yet.</div>`
        : `<div class="cc-quiet">No body numbers for this phase yet — ${n} workout${n === 1 ? '' : 's'} so far, needs 3.</div>`;
  } else {
    const moodReady =
      currentMood && currentMood.avgBefore !== null && currentMood.avgAfter !== null;
    const moodLine = moodReady
      ? cycleNowRow('Mood', currentMood)
      : `<div class="cc-quiet">Mood: started ${formatMonthDay(MOOD_TRACKING_START_DATE)} — shows here after 3 workouts in this phase.</div>`;
    body = `
      <div class="cc2-now">
        <span class="cc2-now-lbl">Body</span>
        <span class="cc2-now-val">${currentBody.avgBefore!.toFixed(1)} → ${currentBody.avgAfter!.toFixed(1)}</span>
      </div>
      <div class="cc2-now-meta">${currentBody.n} workout${currentBody.n === 1 ? '' : 's'}</div>
      ${moodLine}
      ${cycleNowRow('Back pain', currentBack)}
      ${cycleNowRow('Wrist pain', currentWrist)}`;
  }
  return `
    <div class="card progress-card">
      <div class="cc2-compare-label">This phase · before → after</div>
      ${body}
    </div>`;
}

// Card C — Compare phases (shown only when `status` is non-null). The chip
// row only appears once a metric other than Body clears `isComparable`;
// otherwise the table just shows Body (spec §2.3).
function renderCycleCardC(
  status: TodayCycleStatus,
  bodyRows: PlainPhaseTableRow[],
  moodRows: PlainPhaseTableRow[],
  backRows: PlainPhaseTableRow[],
  wristRows: PlainPhaseTableRow[],
  sessions: CapacitySession[],
  periods: CyclePeriod[]
): string {
  const metricRows: Record<CycleMetric, PlainPhaseTableRow[]> = {
    body: bodyRows,
    mood: moodRows,
    back: backRows,
    wrist: wristRows,
  };
  const metricLabel: Record<CycleMetric, string> = {
    body: 'Body',
    mood: 'Mood',
    back: 'Back pain',
    wrist: 'Wrist pain',
  };
  // Fixed order (spec): Body always, then whichever of Mood/Back/Wrist is
  // comparable — never a chip for a metric with fewer than 2 ready phases.
  const comparableMetrics = (['mood', 'back', 'wrist'] as CycleMetric[]).filter((m) =>
    isComparable(metricRows[m])
  );
  const showChips = comparableMetrics.length > 0;
  const chipMetrics: CycleMetric[] = ['body', ...comparableMetrics];
  const selectedMetric: CycleMetric =
    showChips && chipMetrics.includes(cycleCompareMetric) ? cycleCompareMetric : 'body';

  const chipsHtml = showChips
    ? `<div id="cycle-metric-chips" class="cycle-chips">${chipMetrics
        .map(
          (m) =>
            `<button class="cycle-chip${m === selectedMetric ? ' cycle-chip-on' : ''}" data-cycle-metric="${m}" type="button">${escapeHtml(metricLabel[m])}</button>`
        )
        .join('')}</div>`
    : '';

  const rows = metricRows[selectedMetric];
  const hasDash = rows.some((r) => r.avgBefore === null || r.avgAfter === null);
  const tableRows = rows
    .map((r) => {
      const isNow = r.plainPhase === status.plainPhase;
      const before = r.avgBefore !== null ? r.avgBefore.toFixed(1) : '—';
      const after = r.avgAfter !== null ? r.avgAfter.toFixed(1) : '—';
      return `
        <tr${isNow ? ' class="cycle-now" aria-current="true"' : ''}>
          <td>${escapeHtml(PLAIN_PHASE_LABEL[r.plainPhase])}</td>
          <td>${before}</td>
          <td>${after}</td>
          <td>${r.n}</td>
        </tr>`;
    })
    .join('');

  const footnote = hasDash
    ? `<div class="cc-quiet">— means fewer than 3 workouts with a reading so far.</div>`
    : '';
  const summary = selectedMetric === 'body' ? cycleSummaryLine(sessions, periods) : null;
  const summaryHtml = summary ? `<div class="cc-question">${escapeHtml(summary)}</div>` : '';

  // v51 · fix (Sep 25 2026, checker NICE 7): with no chip row, the table only
  // ever shows Body, but the label alone never said so — a tired reader had
  // to infer it from the numbers. Say it once, right in the label.
  const compareLabel = showChips ? 'Compare phases' : 'Compare phases · Body';

  return `
    <div class="card progress-card">
      <div class="cc2-compare-label">${compareLabel}</div>
      ${chipsHtml}
      <table id="cycle-compare" class="cycle-table">
        <thead><tr><th></th><th>Before</th><th>After</th><th>Workouts</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${footnote}
      ${summaryHtml}
    </div>`;
}

// Fold D — "ⓘ How these are counted" (shown only when `status` is
// non-null). Fail-loud rule, folded quiet instead of sitting on the face.
function renderCycleInfoFold(excluded: number): string {
  return `
    <details class="cc2-info">
      <summary>ⓘ How these are counted</summary>
      <p>Before → after = the 1–10 you pick before a workout and after it. Each workout counts in the phase of the day you did it, from your logged period dates. On your period = days 1–5. Week before period = the 7 days before the next expected start (a late period stays here). Mid-cycle = the days before that, around ovulation. Week after period = the days in between. The next start is estimated from your usual cycle length (the middle of your last 6). A number shows once a phase has 3 or more workouts with that reading. Untouched sliders don't count${
        excluded > 0
          ? `, and ${excluded} old "5" reading${excluded === 1 ? '' : 's'} from before Sep 24 ${excluded === 1 ? 'is' : 'are'} left out for the same reason.`
          : '.'
      }</p>
    </details>`;
}

// The page itself (spec §2) — her words (Fri Sep 25 2026, 11:56): "Okay
// whatever this is is still insanely confusing and I think it should be on
// its own page not in this page". `cycleReturnTo`/`cycleCompareMetric` are
// set by the doors that open it (attachCycleHandlers) before `state.screen`
// flips.
export function renderCycle(): string {
  const logs = getChronologicalLogs();
  const periods = cyclePeriodsForLogic();
  const todayISO = localIsoDate(new Date());
  const status = todayCycleStatus(periods, todayISO);

  const backLabel = cycleReturnTo === 'progress' ? '‹ Progress' : '‹ Home';
  const header = `
    <div class="screen-header">
      <h2>Your cycle</h2>
      <button class="quit-link" id="back-from-cycle" type="button">${backLabel}</button>
    </div>`;

  const cardA = renderCycleCardA(periods, todayISO, status);

  // §2.5: B, C and D stay hidden until today is placed in a phase.
  if (!status) {
    return `${header}<div class="progress-screen">${cardA}</div>`;
  }

  const sessions = capacitySessionsFrom(logs);
  const moodSessions = moodSessionsFrom(logs);
  const backSessions = backSessionsFrom(logs);
  const wristSessions = wristSessionsFrom(logs);
  const bodyRows = buildPlainPhaseTable(sessions, periods);
  const moodRows = buildPlainMoodPhaseTable(moodSessions, periods);
  const backRows = buildPlainBackPhaseTable(backSessions, periods);
  const wristRows = buildPlainWristPhaseTable(wristSessions, periods);
  const excluded = excludedUntouchedCount(sessions);

  const currentBody = bodyRows.find((r) => r.plainPhase === status.plainPhase)!;
  const currentMood = moodRows.find((r) => r.plainPhase === status.plainPhase);
  const currentBack = backRows.find((r) => r.plainPhase === status.plainPhase);
  const currentWrist = wristRows.find((r) => r.plainPhase === status.plainPhase);

  const cardB = renderCycleCardB(currentBody, currentMood, currentBack, currentWrist);
  const cardC = renderCycleCardC(
    status,
    bodyRows,
    moodRows,
    backRows,
    wristRows,
    sessions,
    periods
  );

  return `
    ${header}
    <div class="progress-screen">
      ${cardA}
      ${cardB}
      ${cardC}
    </div>
    ${renderCycleInfoFold(excluded)}`;
}

// "Period started today" tap — hers, one tap, undo-able for CYCLE_UNDO_MS.
// Also lives as a quiet row in Settings (renderCycleSettingsRow below).
function renderCycleLogRow(periods: CyclePeriod[], todayISO: string): string {
  if (ui.cycleUndoStartDate) {
    // v50 · fix (Sep 25 2026): a re-log of an already-logged date has no
    // Undo — there's no new row it created, so an Undo tap must not be able
    // to delete the original.
    if (!ui.cycleUndoCreated) {
      return `
        <div class="cc-log-undo">
          <span>Already logged ${formatMonthDay(ui.cycleUndoStartDate)}.</span>
        </div>`;
    }
    // v51 · her spec: "Logged · Sep 29 ✓ Undo".
    return `
      <div class="cc-log-undo">
        <span>Logged · ${formatMonthDay(ui.cycleUndoStartDate)} ✓</span>
        <button class="cc-log-undo-btn" id="cc-undo" type="button">Undo</button>
      </div>`;
  }
  // v51 · her spec: quiet (outline) most of the month, sage PRIMARY only in
  // the window around a predicted start (periodLogUrgency, cycle.ts).
  // "Started on a different day?" stays folded — no date box sitting on the
  // card — until tapped open.
  const urgent = periodLogUrgency(periods, todayISO) === 'primary';
  return `
    <div class="cc-log-row">
      <button class="cc-log-btn${urgent ? ' cc-log-btn-primary' : ''}" id="cc-log-today" type="button">Period started today</button>
    </div>
    <details class="cc-date-reveal">
      <summary class="cc-quiet">Started on a different day?</summary>
      <div class="cc-date-row">
        <input class="cc-date-input" type="date" id="cc-log-date" max="${todayISO}" />
      </div>
    </details>`;
}

// v50 · cycle: "Period started today" + its date-input alternative + undo —
// wired the same everywhere it appears (Progress card, Settings quiet row).
export function attachCycleHandlers(): void {
  bindClick('cc-log-today', () => {
    logPeriodStart(localIsoDate(new Date()));
  });
  bindClick('cc-undo', () => {
    undoPeriodStart();
  });
  bindClick('settings-cycle-today', () => {
    logPeriodStart(localIsoDate(new Date()));
  });
  bindClick('settings-cycle-undo', () => {
    undoPeriodStart();
  });
  const dateInput = document.getElementById('cc-log-date') as HTMLInputElement | null;
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      const v = dateInput.value;
      if (v) logPeriodStart(v);
      dateInput.value = '';
    });
  }

  // v51 · cycle page: the two doors that open it (Progress's row, Home's
  // conditional row — spec §2.1, §3), its own back button (§2.2), and Card
  // C's metric chips (§2.3).
  bindClick('open-cycle', () => {
    cycleReturnTo = 'progress';
    progressScrollForCycle = window.scrollY;
    cycleCompareMetric = 'body';
    state.screen = 'cycle';
    requestRender();
  });
  bindClick('home-open-cycle', () => {
    cycleReturnTo = 'home';
    cycleCompareMetric = 'body';
    state.screen = 'cycle';
    requestRender();
  });
  bindClick('back-from-cycle', () => {
    if (cycleReturnTo === 'progress') {
      requestScrollRestore(progressScrollForCycle);
      state.screen = 'progress';
    } else {
      state.screen = 'home';
    }
    requestRender();
  });
  document.querySelectorAll<HTMLButtonElement>('button[data-cycle-metric]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset['cycleMetric'] as CycleMetric | undefined;
      if (m) {
        cycleCompareMetric = m;
        requestRender();
      }
    });
  });
}
