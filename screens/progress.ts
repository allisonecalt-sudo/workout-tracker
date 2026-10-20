// screens/progress.ts - THE PROGRESS SCREEN (code-shape step 13b, Oct 15 2026), the fourth screen
// module. Moved out of app.ts verbatim; no behaviour change, no version bump.
//
// Owns: renderProgress and every card only Progress draws (Start -> Now, wall-sit trend, back-pain
// chart, Sessions per week, the Program archive with Coming next week / Past weeks), the cycle door
// row (renderCycleDoorRow, cycleDoorSub) and the future/past week-plan lookups the archive uses.
// Imports state / format / week-clock / viz / session-row / cardio-notes and pure modules only -
// NEVER app.ts or another screen. app.ts imports renderProgress (render() switch).
//
// Handlers: Progress binds nothing of its own, so there is no attachProgressHandlers(). Its two
// doors are bound where they already were: #open-cycle by attachCycleHandlers (screens/cycle.ts)
// and #open-rides by attachRidesHandlers (screens/rides.ts); the header's #back-home is the shared
// back button in attachHandlers(). The breakdown folds are native <details>.
//
// Decided (ui-field audit, proved by tsc after the cut): no ui field and no module-level let is
// touched by this screen only - renderProgress reads state/logs and nothing transient - so nothing
// moved out of ui.ts and there are no module-local lets here.

import {
  type CyclePeriod,
  todayCycleStatus,
  periodLogUrgency,
  PLAIN_PHASE_HEADER_LABEL,
} from '../cycle.js';
import {
  type WeekPlan,
  programFutureWeekPlans,
  programFutureWeekPlansAfter,
  programPastWeekPlans,
  programPastWeekPlansBefore,
  type WorkoutId,
  diffWorkout,
  weekPlanTitle,
  PROGRAM,
  planForWeekKey,
} from '../program.js';
import type { LogEntry } from '../types.js';
import { state, cyclePeriodsForLogic, getChronologicalLogs } from '../state.js';
import { ui } from '../ui.js';
import { requestRender } from '../bus.js';
import { escapeHtml, formatMonthDay } from '../format.js';
import { ellipticalRideRecords } from '../cardio-notes.js';
import { rideRate, type RideRecord } from '../ride.js';
import { localIsoDate } from '../dates.js';
import { getWeekPlan, planKeyForLog, weekModel } from '../week-clock.js';
import { SESSIONS_PER_WEEK_TARGET } from '../program-week.js';
import { type WeekRow, buildWeekRows, fullWeeksSummary, shownWeekCount } from '../weeks-grid.js';
import { sessionCounts, sinceTag, workoutsAndRides, rideReadingsLine } from '../number-rules.js';
import { whatGrew, LIGHT_SUFFIX } from '../what-grew.js';

function getFutureWeekPlans(date?: Date): WeekPlan[] {
  return date ? programFutureWeekPlans(date) : programFutureWeekPlansAfter(getWeekPlan());
}

function getPastWeekPlans(date?: Date): WeekPlan[] {
  return date ? programPastWeekPlans(date) : programPastWeekPlansBefore(getWeekPlan());
}

// "Coming next week" — collapsed-by-default <details>. Shows the diff of A/B/C
// from the current week to the next planned week. Invitational, not pushy:
// caption gives her the start date so she can ignore it cleanly if she wants.
// Returns '' if there's no next week encoded yet (i.e. she's on the last
// planned week).
function renderComingNextWeek(): string {
  const current = getWeekPlan();
  const futures = getFutureWeekPlans();
  if (futures.length === 0) return '';

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  // Each future week diffs against its predecessor (Week 5 vs Week 4,
  // Week 6 vs Week 5, etc.). Header label remains "Coming next week"
  // for the immediate next; further weeks just listed below.
  const sections = futures
    .map((wp, idx) => {
      const prev = idx === 0 ? current : futures[idx - 1]!;
      const start = new Date(wp.startsOn + 'T00:00:00');
      const startLabel = `${months[start.getMonth()]} ${start.getDate()}`;

      const blocks = (['A', 'B', 'C'] as WorkoutId[])
        .map((id) => {
          const lines = diffWorkout(prev.workouts[id], wp.workouts[id]);
          if (lines.length === 0) {
            return `
              <div class="next-week-block">
                <div class="next-week-block-title">Workout ${id}</div>
                <div class="next-week-block-empty">unchanged</div>
              </div>`;
          }
          const items = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
          return `
            <div class="next-week-block">
              <div class="next-week-block-title">Workout ${id}</div>
              <ul class="next-week-block-list">${items}</ul>
            </div>`;
        })
        .join('');

      const summaryLabel = idx === 0 ? 'Coming next week' : `Then ${weekPlanTitle(wp)}`;
      const caption = `Diff vs ${weekPlanTitle(prev)}${wp.label ? ` · ${wp.label}` : ''}.`;

      return `
        <details class="next-week-preview" ${idx === 0 ? '' : ''}>
          <summary class="next-week-summary">
            <span class="next-week-summary-label">${summaryLabel}</span>
            <span class="next-week-summary-meta">${weekPlanTitle(wp)} · starts Sat ${startLabel}</span>
            <span class="next-week-chev">▸</span>
          </summary>
          <div class="next-week-body">
            <div class="next-week-caption">${caption}</div>
            <div class="next-week-blocks">${blocks}</div>
          </div>
        </details>
      `;
    })
    .join('');

  return sections;
}

// "Past weeks" — collapsed-by-default <details>, the mirror of "Coming next
// week". The home screen only ever expands the CURRENT week's workouts; past
// programming is otherwise only reachable through the week-dot strip + Weekly
// Review (session logs), never as expanded exercise blocks. This adds a single
// lightweight collapsed surface so the past program is browsable in the same
// compact diff form — nothing past-week renders expanded by default. Returns ''
// if there are no encoded weeks before the current one.
function renderPastWeeks(): string {
  const past = getPastWeekPlans();
  if (past.length === 0) return '';

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  // Newest past week first. Each week diffs against its own predecessor so the
  // lines read "what changed when this week started".
  const sections = [...past]
    .reverse()
    .map((wp) => {
      const wpIdx = PROGRAM.indexOf(wp);
      const prev = wpIdx > 0 ? PROGRAM[wpIdx - 1]! : null;
      const start = new Date(wp.startsOn + 'T00:00:00');
      const startLabel = `${months[start.getMonth()]} ${start.getDate()}`;

      const blocks = (['A', 'B', 'C'] as WorkoutId[])
        .map((id) => {
          const lines = prev ? diffWorkout(prev.workouts[id], wp.workouts[id]) : [];
          if (lines.length === 0) {
            return `
              <div class="next-week-block">
                <div class="next-week-block-title">Workout ${id}</div>
                <div class="next-week-block-empty">${prev ? 'unchanged' : 'starting point'}</div>
              </div>`;
          }
          const items = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
          return `
            <div class="next-week-block">
              <div class="next-week-block-title">Workout ${id}</div>
              <ul class="next-week-block-list">${items}</ul>
            </div>`;
        })
        .join('');

      const caption = prev
        ? `Diff vs ${weekPlanTitle(prev)}${wp.label ? ` · ${wp.label}` : ''}.`
        : `${wp.label ? `${wp.label}. ` : ''}The starting week.`;

      return `
        <details class="next-week-preview">
          <summary class="next-week-summary">
            <span class="next-week-summary-label">${weekPlanTitle(wp)}</span>
            <span class="next-week-summary-meta">started Sat ${startLabel}</span>
            <span class="next-week-chev">▸</span>
          </summary>
          <div class="next-week-body">
            <div class="next-week-caption">${caption}</div>
            <div class="next-week-blocks">${blocks}</div>
          </div>
        </details>
      `;
    })
    .join('');

  // One outer collapsed wrapper so the whole past-program section is a single
  // quiet line until tapped (it never auto-expands).
  return `
    <details class="past-weeks-wrap">
      <summary class="next-week-summary">
        <span class="next-week-summary-label">Past weeks</span>
        <span class="next-week-summary-meta">${past.length} earlier week${past.length === 1 ? '' : 's'} · tap to browse</span>
        <span class="next-week-chev">▸</span>
      </summary>
      <div class="past-weeks-body">${sections}</div>
    </details>
  `;
}

// ---------- v64 (Oct 20 2026): Progress, redesigned ----------
//
// Top to bottom: the hero + weeks grid ("Am I keeping it up?"), What grew, Body check, More.
// Her Q1 (Oct 20 11:24): weeks you showed up leads; what got stronger sits below it.
// Rules (reference/progress-and-dataviz-ux.md): one number one home, every number says its
// basis, no chart under 5 points, honest scales, no red, no streaks.

const CELL_TARGET = SESSIONS_PER_WEEK_TARGET;

// One small square per week. Full = filled, partial = outlined with its count, Sick/Break =
// grey and labelled, this week = marked "now". The number or letter inside carries the
// meaning, never the colour alone. A tap opens that week's review.
function renderWeekCell(r: WeekRow): string {
  const shown = shownWeekCount(r);
  const target = r.displayTarget ?? CELL_TARGET;
  const weekName =
    r.weekNum > 0 ? `Week ${r.weekNum}${r.round > 1 ? ` (round ${r.round})` : ''}` : '';
  let cls = 'wk-cell';
  let inner = '';
  let aria = '';
  if (r.skipped) {
    cls += ' wk-skip';
    inner = `<span class="wk-n">${r.skipLabel === 'Sick' ? 'S' : 'Br'}</span>`;
    aria = `${r.skipLabel ?? 'Held'} week, not counted`;
  } else if (r.held) {
    cls += ' wk-skip';
    inner = '<span class="wk-n">–</span>';
    aria = `${weekName}, held, not counted`;
  } else {
    const full = r.value >= CELL_TARGET;
    cls += full ? ' wk-full' : ' wk-partial';
    if (r.isCurrent) cls += ' wk-now';
    // v64.1: a partial week shows count/target ("3/4") so it never reads like a full one by its
    // number alone; a full week keeps just its number with the filled style.
    inner =
      `<span class="wk-n">${full ? shown : `${shown}/${target}`}</span>` +
      (r.isCurrent ? '<span class="wk-now-tag">now</span>' : '');
    aria = `${weekName}, ${shown} of ${target}${full ? ', a full week' : ''}${r.isCurrent ? ', this week' : ''}`;
  }
  if (r.offset === null) {
    return `<span class="${cls}" role="img" aria-label="${escapeHtml(aria)}" title="${escapeHtml(aria)}">${inner}</span>`;
  }
  return `<button class="${cls}" type="button" data-week-offset="${r.offset}" aria-label="${escapeHtml(aria)}" title="${escapeHtml(aria)}">${inner}</button>`;
}

function renderWeeksHeroCard(logs: LogEntry[]): string {
  const first = logs[0];
  if (!first) return '';
  const rows = buildWeekRows(logs);
  const { judged, full } = fullWeeksSummary(rows);
  // Her words: a zero is a gentle empty state, never "0 full weeks" (guide §2).
  const hero =
    full > 0
      ? `<div class="progress-stat-big weeks-hero"><span class="weeks-hero-num">${full}</span> <span class="start-now-unit">full ${full === 1 ? 'week' : 'weeks'}</span></div>`
      : `<p class="progress-card-empty weeks-hero-empty">${
          judged === 0
            ? 'The first week is in progress.'
            : 'A full week (A, B and C) will count here.'
        }</p>`;
  const rounds = [...new Set(rows.map((r) => r.round))];
  const grid = rounds
    .map(
      (n) => `
      <div class="wk-round">
        <div class="wk-round-label">Round ${n}</div>
        <div class="wk-cells">${rows
          .filter((r) => r.round === n)
          .map(renderWeekCell)
          .join('')}</div>
      </div>`
    )
    .join('');
  return `
    <div class="card progress-card weeks-card" aria-label="Weeks you showed up: ${full} full ${full === 1 ? 'week' : 'weeks'}">
      <div class="progress-card-label">Weeks you showed up</div>
      ${hero}
      <div class="weeks-hero-sub">since ${escapeHtml(formatMonthDay(first.date))} · ${escapeHtml(workoutsAndRides(sessionCounts(logs)))}</div>
      <div class="wk-grid">${grid}</div>
      <p class="wk-legend">Filled: A, B and C done (number) · outlined: sessions so far / week · S sick · Br break</p>
    </div>`;
}

// v64 fix: a ride in a light-restart program week (the plan's own label says "light") or in
// the first week back after a Sick week is not a step back; Progress says so quietly.
function isLightWeekLog(l: LogEntry): boolean {
  const key = planKeyForLog(l);
  if (key === null) return false;
  if (/light/i.test(planForWeekKey(key).plan.label ?? '')) return true;
  const { spans, open } = weekModel();
  const all = open ? [...spans, open] : spans;
  const i = all.findIndex((s) => s.key.round === key.round && s.key.week === key.week);
  return i > 0 && all[i - 1]!.how === 'sick';
}

function renderWhatGrewCard(logs: LogEntry[]): string {
  const grew = whatGrew(logs, isLightWeekLog);
  if (grew.rows.length === 0) return '';
  const rows = grew.rows
    .map(
      (r) =>
        `<div class="start-now-row"><span class="start-now-lbl">${escapeHtml(r.label)}</span><span class="start-now-val"><span class="nw">${escapeHtml(r.value)}</span>${sinceTag(r.since)}${r.lightLatest ? `<span class="grew-light">· ${LIGHT_SUFFIX}</span>` : ''}</span></div>`
    )
    .join('');
  return `
    <div class="card progress-card grew-card">
      <div class="progress-card-label">What grew</div>
      ${rows}
      ${grew.words ? `<p class="progress-card-meta grew-words">${escapeHtml(grew.words)}</p>` : ''}
      ${grew.restartNote ? `<p class="progress-card-meta grew-restart">${escapeHtml(grew.restartNote)}</p>` : ''}
    </div>`;
}

// Wrist dots - ONLY at 5+ readings (under that the numbers say it), on a fixed 0-10 scale
// (never stretched min-to-max), position not colour, no red.
function renderWristDots(values: number[]): string {
  const W = 320;
  const H = 44;
  const PAD_X = 10;
  const PAD_Y = 6;
  const y = (v: number): number =>
    PAD_Y + (1 - Math.min(10, Math.max(0, v)) / 10) * (H - 2 * PAD_Y);
  const step = values.length > 1 ? (W - 2 * PAD_X) / (values.length - 1) : 0;
  const dots = values
    .map(
      (v, i) =>
        `<circle cx="${(PAD_X + i * step).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="var(--accent-progress)" />`
    )
    .join('');
  const label = `Wrist, last ${values.length} readings: ${values.join(', ')} (0 to 10, lower is better)`;
  return `
    <svg class="wrist-dots" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">
      <title>${escapeHtml(label)}</title>
      <line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--hair-strong)" stroke-width="1" />
      ${dots}
    </svg>`;
}

// Q5 (her "just go"): wrist AND back together, in words. The wrist is the live recovery; its
// Sep 25 "scale mix-up" question is still open, so the card says the readings are as logged.
function renderBodyCheckCard(logs: LogEntry[]): string {
  const wrist = logs.map((l) => l.wristPain).filter((v): v is number => typeof v === 'number');
  const back = logs.map((l) => l.backPain).filter((v): v is number => v !== null);
  if (wrist.length === 0 && back.length === 0) return '';
  const lines: string[] = [];
  if (wrist.length > 0) {
    const lastN = wrist.slice(-4);
    // v64.1: each value part never breaks mid-value (nowrap); the line wraps BETWEEN parts.
    const tail =
      lastN.length > 1
        ? ` · <span class="nw">last ${lastN.length}: ${lastN.join(' → ')}</span>`
        : '';
    lines.push(
      `<div class="body-line"><span class="body-lbl">Wrist:</span> <span class="body-val"><span class="nw">latest ${wrist[wrist.length - 1]}</span>${tail} <span class="body-note">(readings as logged)</span></span></div>`
    );
  }
  if (back.length > 0) {
    const painFree = back.filter((v) => v === 0).length;
    lines.push(
      `<div class="body-line"><span class="body-lbl">Back:</span> <span class="body-val"><span class="nw">pain-free ${painFree} of ${back.length}</span></span></div>`
    );
  }
  return `
    <div class="card progress-card body-card">
      <div class="progress-card-label">Body check</div>
      ${lines.join('')}
      ${
        wrist.length >= 5
          ? `<div class="wrist-dots-wrap"><div class="wrist-dots-caption">Wrist, last ${Math.min(12, wrist.length)}</div>${renderWristDots(wrist.slice(-12))}</div>`
          : ''
      }
      <p class="progress-card-meta">0 is no pain; lower is better.</p>
    </div>`;
}

// (Moved here from screens/rides.ts, step 13b: it is Progress's door, drawn on Progress.)
function ridesDoorSub(rides: RideRecord[]): string {
  if (rides.length === 0) return 'No rides yet';
  const latest = rides[rides.length - 1]!;
  const rate = rideRate(latest);
  return rate.kcalPerMin !== null
    ? `${formatMonthDay(latest.date)} · ${rate.kcalPerMin} kcal/min`
    : // v62.3 F7: "no numbers" only when the ride has none of time, km, kcal or level.
      `${formatMonthDay(latest.date)} · ${rideReadingsLine(latest) ?? 'no numbers'}`;
}

// The one row that opens the page - a row inside the More group (v64).
function renderRidesDoorRow(logs: LogEntry[]): string {
  const rides = ellipticalRideRecords(logs);
  return `
      <button class="door-row rides-door" id="open-rides" type="button">
        <span class="rides-door-text">
          <span class="rides-door-title">🚴 Your rides</span>
          <span class="rides-door-sub">${escapeHtml(ridesDoorSub(rides))}</span>
        </span>
        <span class="door-chev" aria-hidden="true">›</span>
      </button>`;
}

// Progress's own door row sub-line (spec §1) — checked in the order the spec
// lists: the two no-data states first, then the predicted-window states,
// then the two normal-phase states.
function cycleDoorSub(periods: CyclePeriod[], todayISO: string): string {
  if (periods.length === 0) return 'No period logged yet';
  const status = todayCycleStatus(periods, todayISO);
  if (!status) return 'Needs one more logged period';
  if (periodLogUrgency(periods, todayISO) === 'primary') {
    return status.overdue
      ? 'Period due any day · started?'
      : `Period expected around ${formatMonthDay(status.nextStart)} · started?`;
  }
  if (status.plainPhase === 'on-period') return `On your period · day ${status.cycleDay}`;
  return `${PLAIN_PHASE_HEADER_LABEL[status.plainPhase]} · day ${status.cycleDay}`;
}

// The cycle door - a row inside the More group (v64). Navigation, never sage.
function renderCycleDoorRow(): string {
  const periods = cyclePeriodsForLogic();
  const todayISO = localIsoDate(new Date());
  return `
      <button class="door-row cycle-door" id="open-cycle" type="button">
        <span class="cycle-door-text">
          <span class="cycle-door-title">🌙 Your cycle</span>
          <span class="cycle-door-sub">${escapeHtml(cycleDoorSub(periods, todayISO))}</span>
        </span>
        <span class="door-chev" aria-hidden="true">›</span>
      </button>`;
}

// ---------- Ship 5: Progress screen (2026-05-15) ----------
//
// A read-only longitudinal view across her entire history. Reached from home's
// Progress door. The screen reports numbers — it does NOT editorialize.
//
// Design rules honored (CLAUDE.md design rules + memory):
//  - No motivational language. No "you should." No goals beyond the 3/week target.
//  - No paternalism. The system reports state; it never tells.
//  - Voice rule: charts show the data, not Claude's interpretation of it.
//  - Archives untouched. Year-grid + hand-routine archives stay in archive/.
//  - No new external libraries — every chart is hand-built inline SVG.
//  - No new color tokens — only D-1 + cooler-look additions.
//  - v48 · P6 (Sep 24 2026): chart ink is --accent-progress, never the sage
//    that means "the primary action right now" (DECISIONS §5, one sage per screen).

// v64: "More" - the doors, kept apart from the data (Few: navigation rows do not sit between
// data cards). The Program archive is its last row: one tap opens Coming next week / Past weeks.
function renderMoreGroup(logs: LogEntry[]): string {
  const archive = renderProgramArchive();
  return `
    <div class="card progress-card more-card">
      <div class="progress-card-label">More</div>
      <div class="more-list">
        ${renderRidesDoorRow(logs)}
        ${renderCycleDoorRow()}
        ${archive}
      </div>
    </div>`;
}

export function renderProgress(): string {
  const logs = getChronologicalLogs(); // oldest -> newest, by date
  const header = `
    <div class="screen-header">
      <h2>Progress</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>`;

  // Empty state - fewer than 2 sessions. The doors still show (the cycle can start from just
  // a logged period).
  if (logs.length < 2) {
    return `
      ${header}
      <p class="progress-empty">Progress shows once you have 2+ sessions logged.</p>
      ${renderMoreGroup(logs)}
    `;
  }

  return `
    ${header}
    <div class="progress-screen">
      ${renderWeeksHeroCard(logs)}
      ${renderWhatGrewCard(logs)}
      ${renderBodyCheckCard(logs)}
      ${renderMoreGroup(logs)}
    </div>
  `;
}

// A week square on the grid opens that week's review (and "× Back" there returns here).
export function attachProgressHandlers(): void {
  document.querySelectorAll<HTMLButtonElement>('button[data-week-offset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const offset = Number(btn.dataset['weekOffset']);
      if (!Number.isFinite(offset)) return;
      ui.reviewBackScroll = window.scrollY;
      ui.reviewBackTo = 'progress';
      ui.viewedWeekOffset = offset;
      state.screen = 'weekly-review';
      requestRender();
    });
  });
}

// v48 · P4 (Sep 24 2026): "Coming next week" + "Past weeks" moved here from home. v64: the
// archive is the Program row in More (her archive rule: "archived nicely so i can pull when
// needed") - still one tap, still the last thing on the page.
function renderProgramArchive(): string {
  const inner = `${renderComingNextWeek()}${renderPastWeeks()}`;
  if (!inner.trim()) return '';
  return `
      <details class="more-program program-archive">
        <summary class="door-row more-program-summary">
          <span>Program</span><span class="door-chev" aria-hidden="true">›</span>
        </summary>
        <div class="program-archive-body">${inner}</div>
      </details>`;
}
