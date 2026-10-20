// screens/rides.ts - THE RIDES PAGE ("Your rides"), the first screen module
// (code-shape step 8, Oct 14 2026: the pilot that sets the template - see
// screens/README.md). Moved out of app.ts verbatim; no behaviour change.
//
// Owns: the page's render functions, its click handlers, and its own transient
// state (the module-local lets below). Imports state/bus/pure modules only -
// NEVER app.ts. app.ts imports renderRides (render() switch), attachRidesHandlers
// (attachHandlers(), same slot as before) and ridesVsDelta (the __wt test hook).
// (Progress's one door row to this page, renderRidesDoorRow + ridesDoorSub, moved into
// screens/progress.ts in step 13b: a screen never imports another screen.)

import { state, getChronologicalLogs, loadWalks } from '../state.js';
import { requestRender, requestScrollRestore } from '../bus.js';
import { bindClick } from '../dom.js';
import { escapeHtml, formatMmSs, formatMonthDay } from '../format.js';
import { ellipticalRideRecords, weekCardioMinutes } from '../cardio-notes.js';
import { rideReadingsLine } from '../number-rules.js';
import { getProgramWeek, weekModel } from '../week-clock.js';
import { attributeSessionsToWeeks, sessionsAttributedTo } from '../program-week.js';
import { COMPLETION_WEEKS_FROM, LEGACY_LAST_CLOSED_WEEK_INSTANT, type WeekKey } from '../week.js';
import { weekWindowFor, type DWeekTarget } from '../week-d.js';
import { barChartSvg, type ChartBar } from '../chart.js';
import {
  isPlausibleRideRate,
  rideRate,
  projectedKcal,
  projectedKm,
  usualKcalPerMin,
  bestRide,
  weekRideAggregate,
  weeklyRideRows,
  hasRideNumbers,
  PROJECTION_LABEL,
  type RideRecord,
  type RideRate,
  type BestRide,
  type ProjectionWindow,
  type WeeklyRideRow,
} from '../ride.js';
import type { LogEntry } from '../types.js';

// THE RIDES PAGE (Sep 27 2026) — same transient, module-level shape as the
// cycle page's own fields just above. `ridesWindow` is the hero's 3-chip
// toggle ("per 10 min · 30 min · hour", her 23:16-23:20 ask); it resets to
// 'tenMin' every time the page opens, same reset-on-open rule as
// cycleCompareMetric. `ridesSelectedChartId` is which bar she last tapped (a
// RideRecord id) — null means no readout is showing yet.
let ridesWindow: ProjectionWindow = 'tenMin';
let ridesSelectedChartId: string | null = null;
let progressScrollForRides = 0;
// v58 fix pass (Sep 28 2026), nice-items list item 3: "per-week bar tap
// shows that week's readout" — the per-week chart's own tapped bar, keyed
// the same way chart.ts's `id` already keys a per-week bar
// (`${round}-${week}`, weeklyRideRows' own weekKeyStr shape). Same
// reset-on-open/reset-on-mode-switch rule as ridesSelectedChartId.
let ridesSelectedWeekChartKey: string | null = null;

// ---------- THE RIDES PAGE (Sep 27 2026) ----------
//
// Replaces plan items R1+R2 per her amendments (Sep 26 2026, 23:16-23:20):
// "Also I want elliptical data page" · "Elliptical calories per min, 10 min,
// 30, hour I can toggle. Kph, anything that you can think of." One door on
// Progress ("🚴 Your rides ›", same door pattern as "🌙 Your cycle" just
// above), one way back ("‹ Progress") — no second entry point, unlike the
// cycle page's Home row, since nothing else on Home shows a ride number.

// "24" — just the day-of-month, compact enough that up to 10 of these fit
// under 340px of bars at a readable size (formatMonthDay's "Sep 24" is too
// wide at this density); used ONLY under the chart's bars, never anywhere
// she reads a date as a fact (the tap readout above gives the full date).
// v54 fix r2 (Sep 27 2026), checker's should #4: this used to be "9/24" —
// US month/day order, which nowhere else in the app uses ("Sep 24" is the
// house format) — and it lived at a 13px floor the chart drew below her
// §4.5 "nothing under 15px" rule. Dropping the month (not abbreviating it)
// keeps the label plain digits, so there's no mm/dd-vs-dd/mm reading at all.
function shortChartDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}`;
}

// TOP card: the latest ride, big — her hero number is kcal a minute (§4.2's
// own reasoning, carried over: "the one big number is kcal a minute ... it's
// her own idea"). The 3-chip toggle changes only the projection line under
// it; the hero digit itself never moves (it's what THIS ride was, not a
// projection). A ride with no usable numbers (§4.2's exclusion) says so
// honestly instead of showing a hero built from a guess.
function renderRidesHeroCard(latest: RideRecord, rate: RideRate): string {
  const dateStr = formatMonthDay(latest.date);
  const timeStr = latest.timeSec !== null ? formatMmSs(latest.timeSec) : null;
  if (!rate.rateEligible) {
    return `
      <div class="card progress-card rides-hero-card">
        <div class="progress-card-label">Calories a minute</div>
        <p class="progress-card-empty">No numbers for this ride${timeStr ? ` (${escapeHtml(timeStr)})` : ''} — ${escapeHtml(dateStr)}.</p>
      </div>`;
  }
  const kcalPerMin = rate.kcalPerMin as number;
  const chips = (['tenMin', 'thirtyMin', 'hour'] as ProjectionWindow[])
    .map(
      (w) =>
        `<button class="rides-toggle-chip${ridesWindow === w ? ' is-on' : ''}" data-rides-window="${w}" type="button" aria-pressed="${ridesWindow === w}">${PROJECTION_LABEL[w]}</button>`
    )
    .join('');
  const projKcal = projectedKcal(kcalPerMin, ridesWindow);
  // v55 (Sep 27 2026) — CHECK N1: raw km/timeSec now, not the rounded km/h
  // (see ride.ts's projectedKm comment).
  const projKm =
    latest.km !== null && latest.km > 0 && latest.timeSec !== null && latest.timeSec > 0
      ? projectedKm(latest.km, latest.timeSec, ridesWindow)
      : null;
  const projLine = `= ${projKcal} kcal${projKm !== null ? ` · ${projKm} km` : ''} in ${PROJECTION_LABEL[ridesWindow]}`;
  const subLine = [
    rate.kmh !== null ? `${rate.kmh} km/h` : '',
    rate.paceMinPerKm !== null ? `${rate.paceMinPerKm} min/km` : '',
  ]
    .filter((s) => s !== '')
    .join(' · ');
  const detailLine = [latest.level !== null ? `level ${latest.level}` : '', timeStr ?? '', dateStr]
    .filter((s) => s !== '')
    .join(' · ');
  return `
    <div class="card progress-card rides-hero-card">
      <div class="progress-card-label">Calories a minute</div>
      <div class="progress-stat-big rides-hero-num" id="rides-hero-kcal">${kcalPerMin}</div>
      <div class="rides-toggle-row" id="rides-toggle-row">${chips}</div>
      <div class="rides-proj-line" id="rides-proj-line">${escapeHtml(projLine)}</div>
      ${subLine ? `<div class="rides-sub-line">${escapeHtml(subLine)}</div>` : ''}
      <div class="rides-detail-line">${escapeHtml(detailLine)}</div>
    </div>`;
}

// "Your usual" (median of last 5 rides with numbers) and "Your best" (the
// highest kcal/min on record) — one card, plain numbers, never a verdict
// word (her rule, carried from §4.2: no "harder"/"easier", no arrows).
function renderRidesUsualBestCard(
  usual: number | null,
  best: BestRide | null,
  eligibleCount: number
): string {
  const usualLine =
    usual !== null
      ? `<div class="rides-stat-row"><span class="rides-stat-lbl">Your usual</span><span class="rides-stat-val">${usual} kcal/min</span></div>`
      : `<p class="progress-card-empty">Your usual shows after 5 rides (${Math.min(eligibleCount, 5)} so far).</p>`;
  const bestLine = best
    ? `<div class="rides-stat-row"><span class="rides-stat-lbl">Your best</span><span class="rides-stat-val">${best.kcalPerMin} kcal/min · ${escapeHtml(formatMonthDay(best.ride.date))}</span></div>`
    : `<p class="progress-card-empty">Your best shows after your first ride with numbers.</p>`;
  return `
    <div class="card progress-card rides-usual-best-card">
      ${usualLine}
      ${bestLine}
    </div>`;
}

// v57 (Sep 28 2026) — "Week by week" (her words, Sun Sep 27 22:45): "I want
// week on week comparison with elliptical" · "Also how much time total" ·
// "Also kph". `week` here is ALWAYS week.ts's own model (weekModel(), same
// as renderRidesTotalsCard above) — never a second, new meaning of week.
function weekRowLabel(key: WeekKey): string {
  return key.round > 1 ? `R${key.round} · Week ${key.week}` : `Week ${key.week}`;
}

// "45 min" under an hour, "1:15" (h:mm) at/over an hour — her spec's own
// wording, "total time (mm or h:mm)".
function formatWeekMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// "This week vs last week" — the same seven numbers side by side, PLAIN
// numbers, never an arrow or a verdict word (her rule, carried from §4.2 and
// restated in the task spec: "no arrows of judgment"). A tiny Δ is allowed
// only as a plain signed difference — never colored, never "better/worse".
// v58 fix pass (Sep 28 2026), her nice-items list item 3: "0" not "+0" (a
// real tie read as a false "gain" before), and the Δ matches whatever decimal
// precision the metric ITSELF already carries (ride.ts's own round1/round2)
// instead of every row being force-rounded to 1 decimal — Km at 2 decimals
// used to lose its own last digit in the Δ column. Module-level (not a
// closure inside renderRidesWeekVsCard) so it's directly testable under
// automation, same convention as sessionPayload/patchSessionRequest below.
export function ridesVsDelta(a: number, b: number, decimals: number): string {
  const rounded = Number((a - b).toFixed(decimals));
  if (rounded === 0) return '0';
  return rounded > 0 ? `+${rounded.toFixed(decimals)}` : rounded.toFixed(decimals);
}

// The compact table — last 6 weeks, newest first, the open week marked
// "so far". A week with 0 rides shows a plain "—" (her rule: nothing
// hidden, nothing dressed up).
function renderWeekTableRow(row: WeeklyRideRow): string {
  const label = `${weekRowLabel(row.key)}${row.isOpen ? ' · so far' : ''}`;
  if (row.rides === 0) {
    return `
      <div class="rides-week-row">
        <span class="rides-week-lbl">${escapeHtml(label)}</span>
        <span class="rides-week-empty">—</span>
      </div>`;
  }
  const totals = `${row.rides} ${row.rides === 1 ? 'ride' : 'rides'} · ${formatWeekMinutes(row.minutes)} · ${row.km} km · ${row.kcal} kcal`;
  const avgs = [
    row.avgKcalPerMin !== null ? `${row.avgKcalPerMin} kcal/min` : null,
    row.avgKmh !== null ? `${row.avgKmh} km/h` : null,
    row.avgLevel !== null ? `avg L${row.avgLevel}` : null,
  ]
    .filter((s): s is string => s !== null)
    .join(' · ');
  return `
    <div class="rides-week-row">
      <div class="rides-week-lbl">${escapeHtml(label)}</div>
      <div class="rides-week-totals">${escapeHtml(totals)}</div>
      ${avgs ? `<div class="rides-week-avgs">${escapeHtml(avgs)}</div>` : ''}
    </div>`;
}

// One line under the chart when a bar is tapped — never shown until she taps
// one (the hero above already covers the latest ride; this is deliberately
// quiet until asked for).
function renderRideReadoutLine(r: RideRecord): string {
  const rate = rideRate(r);
  const parts = [
    formatMonthDay(r.date),
    `Workout ${r.workout}`,
    rate.kcalPerMin !== null ? `${rate.kcalPerMin} kcal/min` : '',
    rate.kmh !== null ? `${rate.kmh} km/h` : '',
    r.level !== null ? `level ${r.level}` : '',
    r.timeSec !== null ? formatMmSs(r.timeSec) : '',
  ].filter((s) => s !== '');
  return escapeHtml(parts.join(' · '));
}

// v58 fix pass (Sep 28 2026), nice-items list item 3: the per-week chart's
// own one-line readout, same "never shown until tapped" rule as
// renderRideReadoutLine above — an empty week (0 rides) still reads
// honestly, "—" for every number she didn't get, nothing invented.
function renderWeekReadoutLine(row: WeeklyRideRow): string {
  const label = `${weekRowLabel(row.key)}${row.isOpen ? ' (so far)' : ''}`;
  if (row.rides === 0) return escapeHtml(`${label} · —`);
  const parts = [
    label,
    `${row.rides} ${row.rides === 1 ? 'ride' : 'rides'}`,
    formatWeekMinutes(row.minutes),
    `${row.km} km`,
    `${row.kcal} kcal`,
    row.avgKcalPerMin !== null ? `${row.avgKcalPerMin} kcal/min` : '',
    row.avgKmh !== null ? `${row.avgKmh} km/h` : '',
    row.avgLevel !== null ? `L${row.avgLevel}` : '',
  ].filter((s) => s !== '');
  return escapeHtml(parts.join(' · '));
}

// v64 (her Q3, Oct 20 "just go"): THIS week's cardio minutes lead the Rides page, toward her
// 225-250 (Sep 29: "my goal really seems to be between 225 and 250"). It counts the rides, the
// walk / apartment lane sessions (a hike is one) and her standalone logged walks, and says so.
// "This week" is the SAME open completion week every other screen uses (week.ts), never a new
// meaning of week: A/B/C by membership in the open span, D by week-d.ts's own window.
const GOAL_LOW = 225;
const GOAL_HIGH = 250;

function renderRidesMinutesCard(logs: LogEntry[], latest: RideRecord): string {
  const model = weekModel();
  const { open, spans } = model;
  const activeSpan = open ?? (spans.length ? spans[spans.length - 1]! : null);
  const activeTarget: DWeekTarget | null = open
    ? { kind: 'open' }
    : activeSpan
      ? { kind: 'span', key: activeSpan.key }
      : null;
  const activeWindow = activeTarget ? weekWindowFor(activeTarget, model) : null;
  const since = activeWindow ? activeWindow.start : new Date(COMPLETION_WEEKS_FROM.at).getTime();
  const until = activeWindow ? activeWindow.end : null;
  const inWindow = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return t >= since && (until === null || t < until);
  };
  const openIds = new Set((activeSpan?.sessions ?? []).map((x) => x.id));
  const weekSessions = logs.filter(
    (l) => (l.id !== undefined && openIds.has(l.id)) || (l.workout === 'D' && inWindow(l.date))
  );
  const walks = loadWalks().filter((w) => inWindow(w.date));
  const m = weekCardioMinutes(weekSessions, walks);
  const pct = Math.min(100, Math.round((m.total / GOAL_HIGH) * 100));
  const goalAt = Math.round((GOAL_LOW / GOAL_HIGH) * 100);
  const basis =
    m.total === 0
      ? ''
      : [
          m.rides > 0 ? `rides ${m.rides} min` : '',
          m.other > 0 ? `other cardio ${m.other} min` : '',
        ]
          .filter((p) => p !== '')
          .join(' · ');
  // v64.1: no cardio yet this week (a new week after a break) is never a big "0": one gentle
  // line with the real date of the last ride; the goal line returns once there are minutes.
  if (m.total === 0) {
    return `
    <div class="card progress-card rides-minutes-card">
      <div class="progress-card-label">Cardio minutes</div>
      <p class="rides-minutes-none">No cardio yet this week · last ride ${escapeHtml(formatMonthDay(latest.date))}</p>
    </div>`;
  }
  return `
    <div class="card progress-card rides-minutes-card">
      <div class="progress-card-label">Cardio minutes</div>
      <div class="rides-minutes-line"><span class="progress-stat-big rides-minutes-n">${m.total}</span> <span class="rides-minutes-of">of ${GOAL_LOW}–${GOAL_HIGH} min this week</span></div>
      <div class="rides-minutes-track" role="img" aria-label="${m.total} of ${GOAL_LOW} to ${GOAL_HIGH} minutes"><span class="rides-minutes-fill" style="width:${pct}%"></span><span class="rides-minutes-goal" style="left:${goalAt}%"></span></div>
      ${basis ? `<div class="rides-minutes-basis">${escapeHtml(basis)}</div>` : ''}
    </div>`;
}

// v64: ONE Weeks card (was This week / This month totals, This week vs last week, Week by week
// and the per-week chart - the same weekly numbers four ways). Per-week minutes, rides ONLY (the
// walks and hikes are counted in the number at the top, so this card says which). At 5+ weeks
// it is bars you can tap for that week's numbers; under 5 the numbers themselves (no chart
// under 5 points). A week with no rides yet collapses to one line, "Last ride Sep 28".
function renderRidesWeeksCard(rows: WeeklyRideRow[], latest: RideRecord): string {
  const emptyOpen = rows[0] !== undefined && rows[0].isOpen && rows[0].rides === 0;
  const shown = emptyOpen ? rows.slice(1) : rows;
  const lastRide = emptyOpen
    ? `<p class="rides-last-ride">Last ride ${escapeHtml(formatMonthDay(latest.date))}</p>`
    : '';
  const caption = `<p class="rides-chart-caption">Rides only. Walks and hikes count in the number at the top, not here.</p>`;
  if (shown.length === 0) {
    return `
      <div class="card progress-card rides-weeks-card">
        <div class="progress-card-label">Weeks · rides only</div>
        ${lastRide || '<p class="progress-card-empty">Shows once a week\'s worth of rides has run.</p>'}
      </div>`;
  }
  if (shown.length < 5) {
    return `
      <div class="card progress-card rides-weeks-card">
        <div class="progress-card-label">Weeks · rides only</div>
        ${lastRide}
        <div class="rides-week-table">${shown.map(renderWeekTableRow).join('')}</div>
        ${caption}
      </div>`;
  }
  // A chart reads oldest -> newest, left to right.
  const chartRows = [...shown].reverse();
  const bars: ChartBar[] = chartRows.map((row) => ({
    id: `${row.key.round}-${row.key.week}`,
    value: row.minutes,
    label: `W${row.key.week}`,
    highlighted: row.isOpen,
    sublabel: row.rides > 0 ? `${row.rides}x` : undefined,
  }));
  const svg = barChartSvg(bars, { ariaLabel: 'Ride minutes, by week', labelAllBars: true });
  const selected = ridesSelectedWeekChartKey
    ? shown.find((row) => `${row.key.round}-${row.key.week}` === ridesSelectedWeekChartKey)
    : null;
  return `
    <div class="card progress-card rides-weeks-card">
      <div class="progress-card-label">Weeks · rides only</div>
      ${lastRide}
      <div class="rides-chart-wrap" id="rides-weeks-chart">${svg}</div>
      <div class="rides-chart-readout" id="rides-weeks-readout">${selected ? renderWeekReadoutLine(selected) : ''}</div>
      ${caption}
    </div>`;
}

// v64: the per-ride kcal/min chart. Words first: while the rides are about the same the bars
// would tell no story (four bars between 5.9 and 6.4), so one plain line says it. The bars come
// once they really differ (a spread of more than 15% of the highest).
const RIDE_BARS_DIFFER = 0.15;

function trimNum(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function renderRidesPerRideCard(rides: RideRecord[]): string {
  const eligible = rides.filter(hasRideNumbers);
  if (eligible.length < 2) {
    return `
      <div class="card progress-card rides-chart-card">
        <div class="progress-card-label">Calories a minute, by ride</div>
        <p class="progress-card-empty">The chart starts at your 2nd ride with numbers.</p>
      </div>`;
  }
  const last10 = eligible.slice(-10);
  const rates = last10.map((r) => rideRate(r).kcalPerMin ?? 0);
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  if (hi <= 0 || (hi - lo) / hi <= RIDE_BARS_DIFFER) {
    const range = lo === hi ? `${trimNum(lo)}` : `${trimNum(lo)}–${trimNum(hi)}`;
    return `
      <div class="card progress-card rides-chart-card">
        <div class="progress-card-label">Calories a minute, by ride</div>
        <p class="rides-same-words">about the same each ride: ${range} kcal/min</p>
      </div>`;
  }
  const bars: ChartBar[] = last10.map((r, i) => ({
    id: r.id,
    value: rideRate(r).kcalPerMin ?? 0,
    label: shortChartDate(r.date),
    highlighted: i === last10.length - 1,
    // v54 fix r1: "L5" under the bar - the level trend, without a second chart.
    sublabel: r.level !== null ? `L${r.level}` : undefined,
  }));
  const svg = barChartSvg(bars, { ariaLabel: 'Calories a minute, by ride' });
  const selected = ridesSelectedChartId ? rides.find((r) => r.id === ridesSelectedChartId) : null;
  return `
    <div class="card progress-card rides-chart-card">
      <div class="progress-card-label">Calories a minute, by ride</div>
      <div class="rides-chart-wrap" id="rides-chart">${svg}</div>
      <div class="rides-chart-readout" id="rides-chart-readout">${selected ? renderRideReadoutLine(selected) : ''}</div>
    </div>`;
}

// The plain list — date · workout letter · min · km · kcal · level, newest
// first. A ride excluded from rates (§4.2's rule: kcal 0 or missing time)
// still gets its own row, never hidden (the archive rule: don't disappear).
// v62.3 F7: it reads "no numbers" only when it has none of time, km, kcal or
// level; a ride with some readings shows them, "—" for each missing one
// (v54 fix r3's implausible-rate ride is the same: its row lists what the
// console gave, it just isn't trusted for best/usual's rates).
function renderRidesListCard(rides: RideRecord[]): string {
  const rows = [...rides]
    .reverse()
    .map((r) => {
      const left = `${formatMonthDay(r.date)} · ${r.workout}`;
      // v62.3 F7: "no numbers" only for a ride with none of time, km, kcal or
      // level. A ride that is out of the rates (no console time, or an
      // implausible one) but HAS readings shows them, "—" for each missing.
      const readings = rideReadingsLine(r);
      if (readings === null) {
        return `
          <div class="rides-list-row">
            <span class="rides-list-left">${escapeHtml(left)}</span>
            <span class="rides-list-nonum">no numbers</span>
          </div>`;
      }
      return `
        <div class="rides-list-row">
          <span class="rides-list-left">${escapeHtml(left)}</span>
          <span class="rides-list-right">${escapeHtml(readings)}</span>
        </div>`;
    })
    .join('');
  return `
    <div class="card progress-card rides-list-card">
      <div class="progress-card-label">All rides</div>
      <div class="rides-list">${rows}</div>
    </div>`;
}

// v57 fix pass (Sep 28 2026) — CHECK-v57 M1: rides dated before
// COMPLETION_WEEKS_FROM never get a weekOf membership (week.ts's HISTORY
// rule: "every session dated before it is filtered out before the walk
// runs"), and weeklyRideRows' date-range fallback only ever checks the spans
// weekModel() itself produced (post-launch only) — so her real Week 4 rides
// (Sep 24 A / Sep 25 C / Sep 26 B) were silently dropped: "this week vs last
// week" read empty on her phone the whole time Week 5 was still open, even
// though the Totals card right above it counted all 4 of her rides that
// month (CHECK-v57-2026-09-28.md M1). Fix: reuse the SAME legacy attribution
// the app already shows for "‹ Week 4" (attributeSessionsToWeeks +
// LEGACY_LAST_CLOSED_WEEK_INSTANT — legacyLastClosedWeekPeek's own pairing,
// see its comment) instead of inventing a second meaning of "week" here.
// One pinned legacy row, always the calendar week that closed the night
// before the real launch — never "whatever today happens to be minus a
// week" (same fixed-instant reasoning LEGACY_LAST_CLOSED_WEEK_INSTANT's own
// comment already gives). Null when nothing landed there (a break/sick week
// per SKIPPED_WEEKS, or she just didn't ride that week) — no point showing a
// permanent empty legacy row once real week.ts history exists on its own.
// v58 fix pass (Sep 28 2026, checker's should #5): spec item 3 (v57 N5) asked
// to exclude any ride that already has a week.ts `weekOf` membership — a
// ride the completion model already counts in a real span/pending week
// should never ALSO double-count into the legacy row, which exists only to
// backfill the rides from BEFORE week.ts history starts. That filter was
// skipped in the v57 commit with no note; added here (`weekOf` is the same
// map every other card on the Rides screen already reads for "This week").
function legacyWeek4RideRow(
  logs: LogEntry[],
  rides: RideRecord[],
  weekOf: ReadonlyMap<string, WeekKey>
): WeeklyRideRow | null {
  const legacyWeek = getProgramWeek(LEGACY_LAST_CLOSED_WEEK_INSTANT);
  if (legacyWeek.skippedLabel) return null;
  const attribution = attributeSessionsToWeeks(logs);
  const legacyLogIds = new Set(
    sessionsAttributedTo(logs, legacyWeek.start, attribution)
      .map((l) => l.id)
      .filter((id): id is string => !!id)
  );
  const legacyRides = rides.filter((r) => legacyLogIds.has(r.id) && !weekOf.has(r.id));
  if (legacyRides.length === 0) return null;
  return {
    key: { round: legacyWeek.round, week: legacyWeek.num },
    isOpen: false,
    ...weekRideAggregate(legacyRides),
  };
}

export function renderRides(): string {
  const logs = getChronologicalLogs(); // oldest → newest, by date
  const rides = ellipticalRideRecords(logs);
  const header = `
    <div class="screen-header">
      <h2>Your rides</h2>
      <button class="quit-link" id="back-from-rides" type="button">‹ Progress</button>
    </div>`;

  if (rides.length === 0) {
    return `
      ${header}
      <p class="progress-empty">Ride data shows here once you've ridden the elliptical.</p>`;
  }

  const latest = rides[rides.length - 1]!;
  const latestRate = rideRate(latest);
  // v54 fix r3: matches usualKcalPerMin's own gate (isPlausibleRideRate) so
  // "so far" counts the same rides the median actually will.
  const eligibleCount = rides.filter(isPlausibleRideRate).length;
  // v57 (Sep 28 2026) — "Week by week": the SAME weekModel() every other
  // card on this page already reads for "This week"/"This month" (never a
  // second meaning of week). `weekRows` feeds the vs-block, the table, AND
  // the chart's "per week" mode — one computation, three views of it.
  // v61.1 fix 3 (Oct 2 2026, CHECK-v61.1.md check 2's must #1): `pending` now
  // goes through too — weeklyRideRows' own D fallback (ride.ts) needs the
  // full week-d.ts model to resolve a mid-gap D the same way every other
  // D-counting call site already does.
  const { spans, open, pending, weekOf } = weekModel();
  const weekRows = weeklyRideRows(rides, weekOf, spans, open, pending, 6);
  // v57 fix pass (CHECK-v57 M1): the legacy row is always the OLDEST of the
  // two kinds of week (week.ts weeks come after it, her own real Week 4
  // never overlaps a weekModel span), so it goes at the END of the
  // newest-first list — capped at the same 6-week window weeklyRideRows
  // already enforces for its own rows.
  const legacyRow = legacyWeek4RideRow(logs, rides, weekOf);
  const combinedWeekRows = legacyRow ? [...weekRows, legacyRow].slice(0, 6) : weekRows;

  return `
    ${header}
    <div class="progress-screen rides-screen">
      ${renderRidesMinutesCard(logs, latest)}
      ${renderRidesHeroCard(latest, latestRate)}
      ${renderRidesUsualBestCard(usualKcalPerMin(rides), bestRide(rides), eligibleCount)}
      ${renderRidesWeeksCard(combinedWeekRows, latest)}
      ${renderRidesPerRideCard(rides)}
      ${renderRidesListCard(rides)}
    </div>`;
}

// THE RIDES PAGE (Sep 27 2026) — the one door (Progress -> Your rides), its
// own back button, the toggle chips, and the chart's tap-to-read-out bars.
export function attachRidesHandlers(): void {
  bindClick('open-rides', () => {
    progressScrollForRides = window.scrollY;
    ridesWindow = 'tenMin';
    ridesSelectedChartId = null;
    ridesSelectedWeekChartKey = null;
    state.screen = 'rides';
    requestRender();
  });
  bindClick('back-from-rides', () => {
    requestScrollRestore(progressScrollForRides);
    state.screen = 'progress';
    requestRender();
  });
  document.querySelectorAll<HTMLButtonElement>('button[data-rides-window]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const w = btn.dataset['ridesWindow'] as ProjectionWindow | undefined;
      if (w) {
        ridesWindow = w;
        requestRender();
      }
    });
  });
  // The chart's bars (chart.ts's <g data-ride-id>, one per ride) — a tap or
  // Enter/Space opens the one-line readout under the chart (spec: "tap a bar
  // -> a one-line readout of that ride under the chart"). v58 fix pass (Sep
  // 28 2026), nice-items list item 3: per-week mode's bars now carry the SAME
  // tap -> readout mechanism, keyed by the bar's own id (chart.ts's already-
  // generic `data-ride-id`, which weeklyRideRows' own `${round}-${week}`
  // shape already fills for a per-week bar) — she doesn't have to
  // cross-reference the table below just to read one week's own numbers.
  const bindBars = (selector: string, pick: (id: string) => void): void => {
    document.querySelectorAll<SVGGElement>(`${selector} [data-ride-id]`).forEach((el) => {
      const open = (): void => {
        const id = el.dataset['rideId'];
        if (!id) return;
        pick(id);
        requestRender();
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  };
  bindBars('#rides-chart', (id) => {
    ridesSelectedChartId = id;
  });
  bindBars('#rides-weeks-chart', (id) => {
    ridesSelectedWeekChartKey = id;
  });
}
