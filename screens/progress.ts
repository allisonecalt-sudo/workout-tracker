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
  ROUNDS,
} from '../program.js';
import type { LogEntry } from '../types.js';
import { cyclePeriodsForLogic, getChronologicalLogs } from '../state.js';
import { escapeHtml, formatMonthDay } from '../format.js';
import { rideLevel, rideKm, rideTimeSec, ellipticalRideRecords } from '../cardio-notes.js';
import { rideRate, type RideRecord } from '../ride.js';
import { localIsoDate } from '../dates.js';
import { getWeekPlan } from '../week-clock.js';
import { SESSIONS_PER_WEEK_TARGET } from '../program-week.js';
import { type WeekRow, buildWeekRows, fullWeeksSummary } from '../weeks-grid.js';
import { honestWallSitLogs } from '../viz.js';
import { BACK_PAIN_STOP_AT } from '../session-row.js';
import {
  perWeekFillPct,
  sessionCounts,
  dRideTag,
  sinceTag,
  levelForLength,
  rideReadingsLine,
} from '../number-rules.js';

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

// Bar chart for back pain — categorical (0-10), bar per session.
// v48 · P6 (Sep 24 2026): a pain-free session gets a faint tick instead of
// nothing (the chart only witnessed the bad days — uxui progress 2/5), and a
// bar is amber only at her 3/10 stop line.
// v51 · fix (Sep 25 2026, look-check sev 3): H was 140 against a yMax of 10
// while her real back-pain values sit mostly at 0-2 — about 100px of empty
// dark space sat above a few short bars, uneven next to the wall-sit card's
// compact ≤64px treatment (her "remove the big empty chart area" ask,
// applied there in v51 already). Same cap here, same PAD as the wall-sit
// sparkline, so both cards read at the same height.
function renderProgressBarChart(
  values: number[],
  opts: { ariaLabel: string; yMax: number }
): string {
  if (values.length === 0) return '';
  const W = 320;
  const H = 64;
  const PAD_L = 8;
  const PAD_R = 8;
  const PAD_T = 6;
  const PAD_B = 6;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Bar geometry: target 4px wide, 2px gap. If too many sessions, the bar
  // shrinks but we keep at least 1px wide.
  const slot = innerW / values.length;
  const barW = Math.max(1, Math.min(4, slot - 2));

  const bars = values
    .map((v, i) => {
      const x = PAD_L + i * slot + (slot - barW) / 2;
      if (v <= 0) {
        return `<rect class="pain-tick" x="${x.toFixed(1)}" y="${(PAD_T + innerH - 2).toFixed(1)}" width="${barW.toFixed(1)}" height="2"
              fill="var(--text-dim-2)" opacity="0.6" rx="1" />`;
      }
      const ratio = Math.min(1, v / opts.yMax);
      const h = ratio * innerH;
      const y = PAD_T + innerH - h;
      const fill = v >= BACK_PAIN_STOP_AT ? 'var(--accent-warn)' : 'var(--text-dim)';
      return `<rect class="pain-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
              fill="${fill}" rx="1" />`;
    })
    .join('');

  return `
    <svg class="progress-chart progress-chart-bar" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         role="img" aria-label="${escapeHtml(opts.ariaLabel)}">
      <title>${escapeHtml(opts.ariaLabel)}</title>
      ${bars}
    </svg>
  `;
}

// v48 · P6 (Sep 24 2026): "Start → Now" — DECISIONS §2 #5 (Gemini, taken):
// "elliptical level first → latest, km first → latest, wall sit first → latest,
// and '40 sessions'. That's movement with no verdict (guide §2)." Rows only
// where there's data; a latest below the first shows plainly, never coloured.
function renderStartNowCard(logs: LogEntry[]): string {
  const first = logs[0];
  if (!first) return '';
  const pair = (vals: number[], unit: string): string => {
    const a = vals[0];
    const b = vals[vals.length - 1];
    if (a === undefined || b === undefined) return '';
    return vals.length === 1
      ? `<span class="sn-last">${a}</span>${unit}`
      : `<span class="sn-first">${a}</span> → <span class="sn-last">${b}</span>${unit}`;
  };
  const rows: [string, string][] = [];
  // v51 · her ask: "look at ux ui and everything presentation" — one
  // combined elliptical line ("level 5 → 7 · 0.72 km in 10 min") replaces
  // the old two separate "Elliptical level" / "Elliptical km" rows. Level
  // shows the trend (first ride → latest, a setting she steps herself); km
  // and time are the LATEST ride only (a distance/duration trend across
  // wildly different session lengths isn't a meaningful "→"). With exactly
  // one ride logged ever, there's nothing to compare yet — just say when it
  // was (her literal words: "first ride Sep 24").
  const rides = logs.filter((l) => rideLevel(l) !== null || rideKm(l) !== null);
  if (rides.length === 1) {
    rows.push(['Elliptical', `first ride ${formatMonthDay(rides[0]!.date)}`]);
  } else if (rides.length > 1) {
    const firstRide = rides[0]!;
    const lastRide = rides[rides.length - 1]!;
    const firstLevel = rideLevel(firstRide);
    const lastLevel = rideLevel(lastRide);
    // v62.3 F5: each end names its own ride length ("level 5 for 10 min →
    // level 3 for 12 min"), so the separate "in N min" after the km goes (it
    // stays only when there is no level part to carry the length).
    const levelPart =
      firstLevel !== null && lastLevel !== null
        ? `${levelForLength(firstLevel, rideTimeSec(firstRide))} → ${levelForLength(lastLevel, rideTimeSec(lastRide))}`
        : '';
    const lastKm = rideKm(lastRide);
    const lastTimeSec = rideTimeSec(lastRide);
    const distPart = [
      lastKm !== null ? `${lastKm} km` : '',
      !levelPart && lastTimeSec !== null ? `in ${Math.round(lastTimeSec / 60)} min` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const val = [levelPart, distPart].filter(Boolean).join(' · ');
    // v62.3 F4: this row's own "since" - the first ride, not the first session.
    if (val) rows.push(['Elliptical', `${val}${sinceTag(rides[0]!.date)}`]);
  }
  // v49 · look fix (Sep 25 2026): honestWallSitLogs() — was every wallSitSec>0,
  // including pre-v45 rows that saved the week's PRESCRIBED hold, not a real
  // measurement (Home's own Start → Now card already excluded them; Progress's
  // didn't, so the two disagreed on the same number — Opus check).
  const honestWalls = honestWallSitLogs(logs);
  const walls = honestWalls.map((l) => l.wallSitSec);
  // v62.3 F4: its own "since" - the first honest wall sit.
  if (walls.length)
    rows.push(['Wall sit', `${pair(walls, ' s')}${sinceTag(honestWalls[0]!.date)}`]);
  // v62.3 F3: the same A/B/C count + "+N ride(s)" tag Home's card shows.
  const sessionCount = sessionCounts(logs);
  return `
    <div class="card progress-card start-now-card">
      <div class="progress-card-label">Start → Now</div>
      <div class="progress-stat-big start-now-hero">${sessionCount.sessions} <span class="start-now-unit">session${sessionCount.sessions === 1 ? '' : 's'}</span>${sessionCount.dRides > 0 ? ` <span class="sn-extra">${dRideTag(sessionCount.dRides)}</span>` : ''}</div>
      <div class="start-now-since">${sinceTag(first.date)}</div>
      ${rows
        .map(
          ([label, val]) =>
            `<div class="start-now-row"><span class="start-now-lbl">${label}</span><span class="start-now-val">${val}</span></div>`
        )
        .join('')}
    </div>`;
}

function renderWallSitTrendCard(logs: LogEntry[]): string {
  // Wall-sit values only come from workouts that include a wall sit (A).
  // v49 · look fix (Sep 25 2026): honestWallSitLogs() — was every wallSitSec>0,
  // chronological, including pre-v45 rows that saved the week's PRESCRIBED
  // hold, not a real measurement. That's why this card used to show "33 → 45"
  // and "best 48 s" while Home's own card (already honest) said "44 → 45" for
  // the same person — two cards, same name, different numbers (Opus check).
  const wallLogs = honestWallSitLogs(logs);
  const wallSits = wallLogs.map((l) => l.wallSitSec);

  if (wallSits.length < 2) {
    if (wallSits.length === 1) {
      const only = wallSits[0] ?? 0;
      return `
        <div class="card progress-card">
          <div class="progress-card-label">Wall sit · seconds held</div>
          <div class="progress-stat-big">${only} s</div>
          <p class="progress-card-empty">One value logged — chart appears after 2+ wall-sit sessions.</p>
        </div>
      `;
    }
    return '';
  }

  const last = wallSits[wallSits.length - 1] ?? 0;
  const maxVal = Math.max(...wallSits);

  // v51 · her ask: "remove the big empty chart area" — a compact sparkline
  // (≤80px, was 220px) with the numbers said in words ("best 45 s · latest
  // 43 s") replaces the old axis'd line chart + "+Ns since <date>" meta.
  const sparkline = renderWallSitSparkline(
    wallSits,
    `Wall sit trend: ${wallSits.length} sessions, latest ${last}, best ${maxVal}`
  );

  // v48 · P6 (Sep 24 2026): the hero is the LATEST hold, "best" sits quiet in
  // the meta — "a hero you're not at is a misreport" (DECISIONS §5, fail-loud).
  return `
    <div class="card progress-card wall-sit-card">
      <div class="progress-card-label">Wall sit · seconds held</div>
      <div class="progress-stat-big">${last} s</div>
      <div class="progress-sparkline-wrap">${sparkline}</div>
      <div class="progress-card-meta">best ${maxVal} s · latest ${last} s</div>
    </div>
  `;
}

// v51 · Progress's Wall-sit card — a quiet, compact trend line (≤80px tall,
// bigger than the row-level renderSparkline above): no axis, no guide, no
// round-boundaries. The card's own words ("best X s · latest Y s") carry the
// numbers, so the picture only needs to say "the shape of it".
function renderWallSitSparkline(values: number[], ariaLabel: string): string {
  if (values.length < 2) return '';
  const W = 320;
  const H = 64;
  const PAD = 6;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = innerW / (values.length - 1);
  const yFor = (v: number): number => PAD + (1 - (v - min) / span) * innerH;
  const pts = values.map((v, i) => [PAD + i * stepX, yFor(v)] as [number, number]);
  const path = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const lastPt = pts[pts.length - 1]!;
  return `
    <svg class="progress-sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         role="img" aria-label="${escapeHtml(ariaLabel)}">
      <title>${escapeHtml(ariaLabel)}</title>
      <path d="${path}" fill="none" stroke="var(--accent-progress)" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${lastPt[0].toFixed(1)}" cy="${lastPt[1].toFixed(1)}" r="4" fill="var(--accent-progress)" />
    </svg>`;
}

function renderBackPainTrendCard(allLogs: LogEntry[]): string {
  // Skip sessions with no back-pain reading (v32 after-the-fact logs).
  const logs = allLogs.filter((l) => l.backPain !== null);
  if (logs.length < 2) return '';

  const values = logs.map((l) => l.backPain ?? 0); // filtered above; ?? only narrows the type
  const positive = values.filter((v) => v > 0);
  const painFree = values.length - positive.length;
  const avg = positive.length ? positive.reduce((a, b) => a + b, 0) / positive.length : 0;

  // Pain scale max is 10 per the post-log chips.
  const chart = renderProgressBarChart(values, {
    ariaLabel:
      positive.length === 0
        ? `Back pain: no pain logged across ${logs.length} sessions`
        : `Back pain: ${positive.length} of ${logs.length} sessions with pain, avg ${avg.toFixed(1)}`,
    yMax: 10,
  });

  // v48 · P6 (Sep 24 2026): the pain-free days are witnessed first
  // ("Pain-free 24 of 30 · avg 1.8 when it hurt", DECISIONS §5).
  const metaLine =
    positive.length === 0
      ? `Pain-free ${painFree} of ${values.length}`
      : `Pain-free ${painFree} of ${values.length} · avg ${avg.toFixed(1)} when it hurt`;

  return `
    <div class="card progress-card">
      <div class="progress-card-label">Back pain · 0–10</div>
      <div class="progress-chart-wrap progress-chart-wrap-bar">${chart}</div>
      <div class="progress-card-meta">${metaLine}</div>
    </div>
  `;
}

// One sessions-per-week row. v48 · P6 (Sep 24 2026): HTML, not SVG — the
// "n / 3" sits OUTSIDE the track so a full bar stays readable (her wins were
// the unreadable rows, 1.25:1), and a held week is its label + "—": no track,
// no number (break weeks were scored "0 / 3" — uxui progress 3/5 ×2).
function renderPerWeekRow(r: WeekRow): string {
  if (r.skipped || r.held) {
    return `<div class="spw-row spw-row-skipped"><span class="spw-label">${escapeHtml(r.label)}</span><span class="spw-skip">—</span></div>`;
  }
  const suffix = r.suffix ? ` · ${escapeHtml(r.suffix)}` : '';
  // v61 fix pass (must #3): displayValue/displayTarget override the shown
  // count on a completion-model row (D counted in, "/ 4").
  // v62.3 F1: the bar fills from the SAME two numbers as that label (it used
  // to stay on A/B/C over 3, so "3 / 4" drew 2/3).
  const shownValue = r.displayValue ?? r.value;
  const shownTarget = r.displayTarget ?? SESSIONS_PER_WEEK_TARGET;
  const pct = perWeekFillPct(shownValue, shownTarget);
  return `
    <div class="spw-row${r.isCurrent ? ' spw-row-current' : ''}">
      <span class="spw-label">${escapeHtml(r.label)}</span>
      <span class="spw-track"><span class="spw-fill" style="width:${pct}%"></span></span>
      <span class="spw-count">${shownValue} / ${shownTarget}${suffix}</span>
    </div>`;
}

function renderSessionsPerWeekCard(logs: LogEntry[]): string {
  // v64: the rows are built once, in weeks-grid.ts (Home's "Since May" line and the
  // Weekly review read the same ones). This card has no cell for a Sick week the
  // completion clock paused for, so it leaves those out as before.
  const rows = buildWeekRows(logs).filter((r) => !(r.skipped && r.offset === null));

  if (rows.length === 0) return '';

  // v46: only COMPLETED program weeks are counted. Break and sick weeks were
  // never a target and the week in progress isn't over. v48 · fix r1: the line
  // is a plain count of full weeks — no "target", no "of N" verdict.
  const { judged, full: hits } = fullWeeksSummary(rows);
  // A zero is a gentle empty state, not "0 full weeks" (guide §2: no guilt).
  const scoreLine =
    judged === 0
      ? 'The first week is in progress.'
      : hits === 0
        ? // v61 fix pass 3 (Oct 2 2026, CHECK-v61.md round 3 nice): "full
          // week" in THIS card still means A/B/C met (`hits` above never
          // counts D) — a 3-of-4 week already counts as full here, so "(4 of
          // 4)" overpromised what actually triggers it. This empty state
          // never actually shows for her (14 full weeks).
          'A full week (A, B and C) will count here.'
        : `<strong>${hits}</strong> full ${hits === 1 ? 'week' : 'weeks'}`;

  // v48 · P6 (Sep 24 2026): the current round's weeks open; each older round
  // folds into one closed row — her Aug 30 words: Round 1 is "a closed
  // chapter" (archived, still one tap away). WK4: the current round is
  // whichever round the LAST row belongs to (chronological), so a completion
  // row (always the true "now" once one exists) decides it the same way the
  // old calendar walk's own last row used to.
  const currentRound = rows[rows.length - 1]!.round;
  const older = ROUNDS.filter((r) => r.num < currentRound)
    .map((r) => {
      const roundRows = rows.filter((row) => row.round === r.num);
      if (roundRows.length === 0) return '';
      const training = roundRows.filter((row) => !row.skipped).length;
      return `
        <details class="spw-older">
          <summary class="spw-older-summary">Round ${r.num} · ${training} wks <span class="spw-older-chev" aria-hidden="true">▸</span></summary>
          <div class="spw-rows">${roundRows.map(renderPerWeekRow).join('')}</div>
        </details>`;
    })
    .join('');
  const current = rows.filter((r) => r.round === currentRound);

  return `
    <div class="card progress-card spw-card" aria-label="Sessions per week: ${hits} full ${hits === 1 ? 'week' : 'weeks'}">
      <div class="progress-card-label">Sessions per week</div>
      <div class="spw-rows">${current.map(renderPerWeekRow).join('')}</div>
      ${older}
      <div class="progress-card-meta">
        ${scoreLine}
      </div>
    </div>
  `;
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

// The one row that opens the page — lives on Progress, both the empty and
// normal states (same placement rule as renderCycleDoorRow).
function renderRidesDoorRow(logs: LogEntry[]): string {
  const rides = ellipticalRideRecords(logs);
  return `
    <div class="card progress-card">
      <button class="door-row rides-door" id="open-rides" type="button">
        <span class="rides-door-text">
          <span class="rides-door-title">🚴 Your rides</span>
          <span class="rides-door-sub">${escapeHtml(ridesDoorSub(rides))}</span>
        </span>
        <span class="door-chev" aria-hidden="true">›</span>
      </button>
    </div>`;
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

// The one row that replaces the whole old card on Progress — navigation,
// never sage (sage marks the primary action; this is a door). Same position
// in both the empty and normal Progress states (spec §1).
function renderCycleDoorRow(): string {
  const periods = cyclePeriodsForLogic();
  const todayISO = localIsoDate(new Date());
  return `
    <div class="card progress-card">
      <button class="door-row cycle-door" id="open-cycle" type="button">
        <span class="cycle-door-text">
          <span class="cycle-door-title">🌙 Your cycle</span>
          <span class="cycle-door-sub">${escapeHtml(cycleDoorSub(periods, todayISO))}</span>
        </span>
        <span class="door-chev" aria-hidden="true">›</span>
      </button>
    </div>`;
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

export function renderProgress(): string {
  const logs = getChronologicalLogs(); // oldest → newest, by date
  const count = logs.length;

  // v48 · P6 (Sep 24 2026): the "Exercise breakdown" card (94 rows repeating
  // three numbers — uxui progress 3/5) became these three chips.
  const byWorkout: Record<WorkoutId, number> = { A: 0, B: 0, C: 0 };
  // v54 (Sep 27 2026): D is extra, never one of the three — it counts in
  // cardio minutes/totals (the Rides page, via ellipticalRideRecords, which
  // reads cardioLane not workout letter) but never in this A/B/C breakdown.
  for (const l of logs) if (l.workout !== 'D') byWorkout[l.workout] += 1;
  const subtitle =
    count > 0
      ? `<div class="progress-subtitle">${(['A', 'B', 'C'] as WorkoutId[])
          .map((id) => `<span class="progress-chip">${id} ${byWorkout[id]}</span>`)
          .join('')}</div>`
      : '';

  const header = `
    <div class="screen-header">
      <h2>Progress</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>`;

  // Empty state — fewer than 2 sessions. v51: the door to "Your cycle" still
  // shows (it can start from just a logged period, no sessions needed for
  // the "Period started today" tap itself).
  if (count < 2) {
    return `
      ${header}
      ${subtitle}
      <p class="progress-empty">Progress shows once you have 2+ sessions logged.</p>
      ${renderCycleDoorRow()}
      ${renderRidesDoorRow(logs)}
      ${renderProgramArchive()}
    `;
  }

  // v48 · P6: the OLD capacity chart is gone — it charted untouched defaults
  // (6 of 8 Round-2 after-readings were the invented 5; the real mean change
  // was 0.00 over 24 pairs). DECISIONS §2 #6. v51: "Your cycle" moved off
  // this screen onto its own page (renderCycle) — this is just the one door
  // row to it now (spec §1).
  return `
    ${header}
    ${subtitle}
    <div class="progress-screen">
      ${renderStartNowCard(logs)}
      ${renderCycleDoorRow()}
      ${renderRidesDoorRow(logs)}
      ${renderWallSitTrendCard(logs)}
      ${renderBackPainTrendCard(logs)}
      ${renderSessionsPerWeekCard(logs)}
    </div>
    ${renderProgramArchive()}
  `;
}

// v48 · P4 (Sep 24 2026): "Coming next week" + "Past weeks" moved here from
// home, as-is (P6 restyles) — the program's past and next stay one tap from
// Progress (her archive rule: "just be archived nicely so i can pull when
// needed"), off the front door.
function renderProgramArchive(): string {
  const inner = `${renderComingNextWeek()}${renderPastWeeks()}`;
  if (!inner.trim()) return '';
  return `
    <div class="program-archive">
      <h3 class="program-archive-label">Program</h3>
      ${inner}
    </div>`;
}
