// screens/rides.ts - THE RIDES PAGE ("Your rides"), the first screen module
// (code-shape step 8, Oct 14 2026: the pilot that sets the template - see
// screens/README.md). Moved out of app.ts verbatim; no behaviour change.
//
// Owns: the page's render functions, its click handlers, and its own transient
// state (the module-local lets below). Imports state/bus/pure modules only -
// NEVER app.ts. app.ts imports renderRides (render() switch), renderRidesDoorRow
// (Progress's one door row), attachRidesHandlers (attachHandlers(), same slot as
// before) and ridesVsDelta (the __wt test hook).

import { state, getChronologicalLogs } from '../state.js';
import { requestRender, requestScrollRestore } from '../bus.js';
import { bindClick } from '../dom.js';
import { escapeHtml, formatMmSs, formatMonthDay } from '../format.js';
import { ellipticalRideRecords } from '../cardio-notes.js';
import { localIsoDate } from '../dates.js';
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
  rideTotals,
  weekRideAggregate,
  weeklyRideRows,
  hasRideNumbers,
  PROJECTION_LABEL,
  type RideRecord,
  type RideRate,
  type BestRide,
  type RideTotals,
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
// v57 (Sep 28 2026) — the chart's "per ride · per week" toggle (task spec
// item 3). Same reset-on-open rule as ridesWindow above — always 'perRide'
// the moment the page opens.
let ridesChartMode: 'perRide' | 'perWeek' = 'perRide';
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

function ridesDoorSub(rides: RideRecord[]): string {
  if (rides.length === 0) return 'No rides yet';
  const latest = rides[rides.length - 1]!;
  const rate = rideRate(latest);
  return rate.kcalPerMin !== null
    ? `${formatMonthDay(latest.date)} · ${rate.kcalPerMin} kcal/min`
    : `${formatMonthDay(latest.date)} · no numbers`;
}

// The one row that opens the page — lives on Progress, both the empty and
// normal states (same placement rule as renderCycleDoorRow).
export function renderRidesDoorRow(logs: LogEntry[]): string {
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

// Week + month totals — "week" is the SAME open completion week every other
// screen in the app now uses (week.ts's weekModel(), her own rule "once all
// three are done then it can go to the next week"), never a second, new
// meaning of "week" the plan's whole §2 fought to remove. "Month" is the
// plain calendar month to date — the app has no other "month" concept yet
// to collide with.
function renderRidesTotalsCard(rides: RideRecord[]): string {
  // v54 fix r3 (Sep 27 2026), checker's must #1 (round 3 — r2's own fix
  // above introduced this): a date-only filter double-counts the CLOSING
  // session itself whenever a week closes on a Sat/Sun (her normal swing
  // rhythm) — week.ts opens the next span at the closing session's own
  // timestamp (weekendAnchorDay branch of closeOpen()), and `date >= since`
  // then matches that same session's own date, so Saturday's B reads as
  // "This week" for the week it just closed OUT of, on top of counting
  // (correctly) toward the week it closed. Fix: A/B/C are counted by
  // MEMBERSHIP in the open span's own `sessions` (a brand-new span starts
  // with sessions: [], so the closing ride isn't in it) — only D (never one
  // of the three, so it has no membership to check; see r2's comment below)
  // stays date-based. In a gap (no span open yet), membership/since both
  // fall back to the last CLOSED span, same source r2 already used for
  // `since` alone.
  const model = weekModel();
  const { open, spans } = model;
  const activeSpan = open ?? (spans.length ? spans[spans.length - 1]! : null);
  // v61.1 fix 2 (Oct 2 2026, CHECK-v61.1.md must #1's grep sweep): `since`
  // used to be JUST `activeSpan.openedAt`, unbounded — the same event-to-
  // event window week-d.ts replaced everywhere else in the v61 fix passes
  // (see its own header). Two of the same gap bugs applied here: a D logged
  // before `openedAt` (her real Sep 28 order, D first then A) dropped out of
  // "This week" even though the other D-counting screens already moved it
  // in, and — with no upper bound at all — a D logged after a weekday close
  // would have stayed counted in "This week" forever instead of moving to
  // the next week once one opens. Route through the SAME window
  // weekHasDFor/getExtraDSessionsForTarget use: `open` when a week is live,
  // else the last CLOSED span (mid-gap — matches the membership fallback
  // already below), else the pre-model edge `since` already fell back to.
  const activeTarget: DWeekTarget | null = open
    ? { kind: 'open' }
    : activeSpan
      ? { kind: 'span', key: activeSpan.key }
      : null;
  const activeWindow = activeTarget ? weekWindowFor(activeTarget, model) : null;
  const since = activeWindow ? activeWindow.start : new Date(COMPLETION_WEEKS_FROM.at).getTime();
  const until = activeWindow ? activeWindow.end : null;
  const openIds = new Set((activeSpan?.sessions ?? []).map((s) => s.id));
  // v54 fix r2 (Sep 27 2026), checker's must #2: "This week" was filtered by
  // weekModel().open.sessions — but week.ts excludes 'D' from the completion
  // model ON PURPOSE (D is extra, never one of the three; see
  // buildWeeklyTargetRows above). That made a D ride real Sun Sep 27 2026 —
  // her own data, 42 rows -> 43 after saving it — read "This week 0 rides"
  // while "This month" already said 4. D still isn't session-membership
  // eligible (it never joins a span's `sessions`), so it stays on the
  // window-based date rule above; A/B/C use the r3 membership rule above
  // instead.
  const weekRides = rides.filter((r) => {
    if (openIds.has(r.id)) return true;
    if (r.workout !== 'D') return false;
    const t = new Date(r.date).getTime();
    return t >= since && (until === null || t < until);
  });
  const monthPrefix = localIsoDate(new Date()).slice(0, 7);
  // v55 (Sep 27 2026) — CHECK N4 (round 2): `r.date` is a UTC ISO timestamp;
  // slicing it straight gave the UTC month, one off from the local one for a
  // ride logged after local midnight but before UTC midnight (or the reverse
  // near local midnight in Israel, UTC+2/+3). Read the month off the LOCAL
  // date, same as monthPrefix itself.
  const monthRides = rides.filter(
    (r) => localIsoDate(new Date(r.date)).slice(0, 7) === monthPrefix
  );
  const row = (label: string, t: RideTotals): string => `
    <div class="rides-totals-row">
      <span class="rides-totals-lbl">${escapeHtml(label)}</span>
      <span class="rides-totals-val">${t.rides} ${t.rides === 1 ? 'ride' : 'rides'} · ${t.minutes} min · ${t.km} km · ${t.kcal} kcal</span>
    </div>`;
  return `
    <div class="card progress-card rides-totals-card">
      <div class="progress-card-label">Totals</div>
      ${row('This week', rideTotals(weekRides))}
      ${row('This month', rideTotals(monthRides))}
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

function renderRidesWeekVsCard(rows: WeeklyRideRow[]): string {
  if (rows.length === 0) {
    return `
      <div class="card progress-card rides-vs-card">
        <div class="progress-card-label">This week vs last week</div>
        <p class="progress-card-empty">Shows once your first week's worth of rides has run.</p>
      </div>`;
  }
  const thisWeek = rows[0] as WeeklyRideRow;
  const lastWeek = rows[1] ?? null;
  // v58 fix pass, same list item: "one empty-week style for both cards" — a
  // week with 0 rides reads as a single "—" here too, the exact rule
  // renderWeekTableRow already applies to the table right below this card,
  // rather than a real 0 sitting next to a dash on the very next metric row
  // (minutes/km/kcal are genuinely 0 for a no-ride week; the avgs are
  // already null there — the two used to disagree inside one card).
  const thisEmpty = thisWeek.rides === 0;
  const lastEmpty = lastWeek === null || lastWeek.rides === 0;
  const numRow = (
    label: string,
    a: number | null,
    b: number | null | undefined,
    decimals: number,
    suffix = ''
  ): string => {
    const aStr = !thisEmpty && a !== null ? `${a}${suffix}` : '—';
    const bStr = !lastEmpty && b !== null && b !== undefined ? `${b}${suffix}` : '—';
    const delta =
      !thisEmpty && !lastEmpty && a !== null && b !== null && b !== undefined
        ? ridesVsDelta(a, b, decimals)
        : '—';
    return `
    <div class="rides-vs-row">
      <span class="rides-vs-lbl">${escapeHtml(label)}</span>
      <span class="rides-vs-val">${aStr}</span>
      <span class="rides-vs-val">${bStr}</span>
      <span class="rides-vs-delta">${delta}</span>
    </div>`;
  };
  // v57 fix pass (Sep 28 2026), CHECK-v57 S3: the full week names ("R2 ·
  // Week 6 (so far)") don't fit a 52px grid column — they used to sit
  // straight in the header row and either overlapped the metric-name column
  // or wrapped to 3 lines. Now they get their own full-width line, and the
  // header row underneath carries only short column labels aligned to the
  // same 4 columns every data row uses (styles.css .rides-vs-header).
  const thisLabel = `${weekRowLabel(thisWeek.key)}${thisWeek.isOpen ? ' (so far)' : ''}`;
  const lastLabel = lastWeek ? weekRowLabel(lastWeek.key) : null;
  return `
    <div class="card progress-card rides-vs-card">
      <div class="progress-card-label">This week vs last week</div>
      <div class="rides-vs-names">${escapeHtml(thisLabel)}${lastLabel ? ` vs ${escapeHtml(lastLabel)}` : ''}</div>
      <div class="rides-vs-header">
        <span class="rides-vs-lbl"></span>
        <span class="rides-vs-val">This</span>
        <span class="rides-vs-val">Last</span>
        <span class="rides-vs-delta">Δ</span>
      </div>
      ${numRow('Rides', thisWeek.rides, lastWeek?.rides, 0)}
      ${numRow('Minutes', thisWeek.minutes, lastWeek?.minutes, 0)}
      ${numRow('Km', thisWeek.km, lastWeek?.km, 2)}
      ${numRow('Kcal', thisWeek.kcal, lastWeek?.kcal, 1)}
      ${numRow('Kcal/min', thisWeek.avgKcalPerMin, lastWeek?.avgKcalPerMin, 1)}
      ${numRow('Km/h', thisWeek.avgKmh, lastWeek?.avgKmh, 1)}
      ${numRow('Level', thisWeek.avgLevel, lastWeek?.avgLevel, 1)}
    </div>`;
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

function renderRidesWeekTableCard(rows: WeeklyRideRow[]): string {
  if (rows.length === 0) {
    return `
      <div class="card progress-card rides-week-table-card">
        <div class="progress-card-label">Week by week</div>
        <p class="progress-card-empty">Shows once a week's worth of rides has run.</p>
      </div>`;
  }
  return `
    <div class="card progress-card rides-week-table-card">
      <div class="progress-card-label">Week by week</div>
      <div class="rides-week-table">${rows.map(renderWeekTableRow).join('')}</div>
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

// v57 (Sep 28 2026) — the "per ride · per week" toggle (task spec item 3).
// Shared chip markup so both chart modes render the same on/off look as
// every other toggle on this page (.rides-toggle-chip).
function renderRidesChartModeToggle(): string {
  const chip = (mode: 'perRide' | 'perWeek', label: string): string =>
    `<button class="rides-toggle-chip${ridesChartMode === mode ? ' is-on' : ''}" data-rides-chart-mode="${mode}" type="button" aria-pressed="${ridesChartMode === mode}">${label}</button>`;
  return `<div class="rides-toggle-row" id="rides-chart-mode-row">${chip('perRide', 'Per ride')}${chip('perWeek', 'Per week')}</div>`;
}

// ONE big bar chart (chart.ts, no library). "Per ride" — up to the last 10
// rides that have numbers, the latest highlighted, short dates under every
// bar, a tap opens the one-line readout above. Rides with no numbers aren't
// charted (§4.2/§4.5: nothing to plot). "Per week" (v57, task spec item 3) —
// one bar per week from the SAME `weekRows` the table above uses, plotting
// TOTAL MINUTES (her own cardio-gap number, not kcal/min — see the caption).
// v58 fix pass (Sep 28 2026): a tap now opens that week's own one-line
// readout too, same mechanism as "per ride" — she asked for the numbers
// "so that I can like really see the data", and per-week bars were the one
// place on this page a tap read out nothing at all.
function renderRidesChartCard(rides: RideRecord[], weekRows: WeeklyRideRow[]): string {
  const toggle = renderRidesChartModeToggle();
  if (ridesChartMode === 'perWeek') {
    if (weekRows.length === 0) {
      return `
        <div class="card progress-card rides-chart-card">
          <div class="progress-card-label">Rides</div>
          ${toggle}
          <p class="progress-card-empty">Shows once a week's worth of rides has run.</p>
        </div>`;
    }
    // v57 fix pass (CHECK-v57 S1): the table/vs-card read `weekRows`
    // newest-first (row 0 = the latest week — that's what "this week vs
    // last week" needs), but a chart reads oldest -> newest, left to right,
    // same as the per-ride chart just below — pass the newest-first rows
    // through unchanged and this bar chart draws right-to-left in time.
    // Reverse ONLY for the chart's own bar order.
    const chartWeekRows = [...weekRows].reverse();
    const bars: ChartBar[] = chartWeekRows.map((row) => ({
      id: `${row.key.round}-${row.key.week}`,
      value: row.minutes,
      label: `W${row.key.week}`,
      highlighted: row.isOpen,
      sublabel: row.rides > 0 ? `${row.rides}x` : undefined,
    }));
    // v57 fix pass (CHECK-v57 S2): every bar gets its own minutes label, not
    // just the highlighted/open one — she shouldn't have to cross-reference
    // the table below to read W5's total off the chart.
    const svg = barChartSvg(bars, {
      ariaLabel: 'Total minutes ridden, by week',
      labelAllBars: true,
    });
    const selectedWeek = ridesSelectedWeekChartKey
      ? weekRows.find((row) => `${row.key.round}-${row.key.week}` === ridesSelectedWeekChartKey)
      : null;
    return `
      <div class="card progress-card rides-chart-card">
        <div class="progress-card-label">Rides</div>
        ${toggle}
        <div class="rides-chart-wrap" id="rides-chart">${svg}</div>
        <div class="rides-chart-readout" id="rides-chart-readout">${selectedWeek ? renderWeekReadoutLine(selectedWeek) : ''}</div>
        <p class="rides-chart-caption">Total minutes ridden that week — the cardio-time gap, not the rate.</p>
      </div>`;
  }
  const eligible = rides.filter(hasRideNumbers);
  if (eligible.length < 2) {
    return `
      <div class="card progress-card rides-chart-card">
        <div class="progress-card-label">Rides</div>
        ${toggle}
        <p class="progress-card-empty">The chart starts at your 2nd ride with numbers.</p>
      </div>`;
  }
  const last10 = eligible.slice(-10);
  const bars: ChartBar[] = last10.map((r, i) => ({
    id: r.id,
    value: rideRate(r).kcalPerMin ?? 0,
    label: shortChartDate(r.date),
    highlighted: i === last10.length - 1,
    // v54 fix r1 (Sep 27 2026), checker's should #3: "L5" under the bar — the
    // level trend, without a second chart. null level (no reading that ride)
    // just leaves the bar with no sublabel, same as any other missing field.
    sublabel: r.level !== null ? `L${r.level}` : undefined,
  }));
  const svg = barChartSvg(bars, { ariaLabel: 'Calories a minute, by ride' });
  const selected = ridesSelectedChartId ? rides.find((r) => r.id === ridesSelectedChartId) : null;
  return `
    <div class="card progress-card rides-chart-card">
      <div class="progress-card-label">Rides</div>
      ${toggle}
      <div class="rides-chart-wrap" id="rides-chart">${svg}</div>
      <div class="rides-chart-readout" id="rides-chart-readout">${selected ? renderRideReadoutLine(selected) : ''}</div>
    </div>`;
}

// The plain list — date · workout letter · min · km · kcal · level, newest
// first. A ride excluded from rates (§4.2's rule: kcal 0 or missing time)
// still gets its own row — "no numbers", never hidden (the archive rule:
// don't disappear, just say honestly there's nothing to read here). v54 fix
// r3 (Sep 27 2026), checker's nice #1: an implausible rate (e.g. a 1s ride
// the app timer started ahead of the machine — see ride.ts's
// isPlausibleRideRate) reads the same "no numbers" here as a genuinely
// missing one — the row still lists (nothing hidden), it just isn't shown a
// rate nobody would trust for best/usual either.
function renderRidesListCard(rides: RideRecord[]): string {
  const rows = [...rides]
    .reverse()
    .map((r) => {
      const left = `${formatMonthDay(r.date)} · ${r.workout}`;
      if (!isPlausibleRideRate(r)) {
        return `
          <div class="rides-list-row">
            <span class="rides-list-left">${escapeHtml(left)}</span>
            <span class="rides-list-nonum">no numbers</span>
          </div>`;
      }
      const timeStr = r.timeSec !== null ? formatMmSs(r.timeSec) : '—';
      const kmStr = r.km !== null ? `${r.km} km` : '—';
      const kcalStr = r.kcal !== null ? `${r.kcal} kcal` : '—';
      const levelStr = r.level !== null ? `L${r.level}` : '—';
      return `
        <div class="rides-list-row">
          <span class="rides-list-left">${escapeHtml(left)}</span>
          <span class="rides-list-right">${escapeHtml(`${timeStr} · ${kmStr} · ${kcalStr} · ${levelStr}`)}</span>
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
      ${renderRidesHeroCard(latest, latestRate)}
      ${renderRidesUsualBestCard(usualKcalPerMin(rides), bestRide(rides), eligibleCount)}
      ${renderRidesTotalsCard(rides)}
      ${renderRidesWeekVsCard(combinedWeekRows)}
      ${renderRidesWeekTableCard(combinedWeekRows)}
      ${renderRidesChartCard(rides, combinedWeekRows)}
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
    ridesChartMode = 'perRide';
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
  // v57 (Sep 28 2026) — the chart's "per ride · per week" toggle.
  document.querySelectorAll<HTMLButtonElement>('button[data-rides-chart-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset['ridesChartMode'] as 'perRide' | 'perWeek' | undefined;
      if (mode) {
        ridesChartMode = mode;
        ridesSelectedChartId = null;
        ridesSelectedWeekChartKey = null;
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
  if (ridesChartMode === 'perRide') {
    document
      .querySelectorAll<SVGGElement>('#rides-chart [data-ride-id]')
      .forEach((el: SVGGElement) => {
        const open = (): void => {
          const id = el.dataset['rideId'];
          if (!id) return;
          ridesSelectedChartId = id;
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
  } else {
    document
      .querySelectorAll<SVGGElement>('#rides-chart [data-ride-id]')
      .forEach((el: SVGGElement) => {
        const open = (): void => {
          const key = el.dataset['rideId'];
          if (!key) return;
          ridesSelectedWeekChartKey = key;
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
  }
}
