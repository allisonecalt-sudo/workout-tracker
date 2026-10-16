// screens/review.ts - THE WEEKLY REVIEW SCREEN (code-shape step 13c, Oct 15 2026), the fifth screen
// module. Moved out of app.ts verbatim; no behaviour change, no version bump.
//
// Owns: renderWeeklyReview (the plain week and the week-by-week pager, the title for a live,
// past, held or Sick week, the totals / delta cards, the session list), the helpers only it uses
// (computeWeekTotals and its types, the week-session lookups, the delta renderers, the 3-per-week
// target grid) and its two click handlers (attachReviewHandlers: the < > week arrows).
// Imports state / ui / bus / dom / format / week-clock / session-row / pure modules only -
// NEVER app.ts or another screen. app.ts imports renderWeeklyReview (render() switch),
// attachReviewHandlers (attachHandlers(), same slot as before) and computeWeekTotals (the
// __wtComputeWeekTotals test hook).
//
// Decided (ui-field audit): the page's one transient field, ui.viewedWeekOffset, is ALSO set by
// Home's week card (#open-weekly-review) and by resetState, so it stays in ui. No module-local lets.

import { trainingMinutes, formatWorkoutMinutesTotal } from '../timing.js';
import { type WeekSpan, LEGACY_LAST_CLOSED_WEEK_INSTANT } from '../week.js';
import { type DWeekTarget, type DWeekModel, weekWindowFor } from '../week-d.js';
import { type WorkoutId, PROGRAM_START_DATE } from '../program.js';
import type { LogEntry } from '../types.js';
import { ui } from '../ui.js';
import { requestRender } from '../bus.js';
import { bindClick } from '../dom.js';
import { loadLogs } from '../state.js';
import { escapeHtml, formatMonthDay, formatWeekRange } from '../format.js';
import { shownSessionCount } from '../number-rules.js';
import { formatDate, formatWeekdayDate } from '../dates.js';
import {
  getProgramWeek,
  weekModel,
  isNowAfterCompletionLaunch,
  saturdayForOffset,
  firstProgramSaturday,
} from '../week-clock.js';
import { attributeSessionsToWeeks, sessionsAttributedTo } from '../program-week.js';
import {
  formatRowDate,
  logsNewestFirst,
  renderSessionRow,
  BACK_PAIN_STOP_AT,
} from '../session-row.js';

type WeeklyTargetRow = {
  saturday: Date;
  weekNum: number;
  round: number;
  skippedLabel: string | null; // e.g. 'Sick' — week holds its slot but doesn't count
  workouts: ('A' | 'B' | 'C')[]; // in order completed (chronological)
  logs: (LogEntry | null)[]; // parallel to workouts, for click→detail
  isCurrentWeek: boolean;
};

function buildWeeklyTargetRows(logsIn: LogEntry[]): WeeklyTargetRow[] {
  // v54 (Sep 27 2026): this is the 3-PER-WEEK view (her "its 3 a week" rule)
  // — D is extra, never one of the three, so it's excluded before any
  // attribution/slot math the same way sessionsForWeekModel excludes it from
  // the completion model.
  const logs = logsIn.filter((l): l is LogEntry & { workout: WorkoutId } => l.workout !== 'D');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  const daysSinceSat = (todayDow + 1) % 7;
  const thisSaturday = new Date(today);
  thisSaturday.setDate(today.getDate() - daysSinceSat);
  thisSaturday.setHours(0, 0, 0, 0);

  const programStart = new Date(PROGRAM_START_DATE + 'T00:00:00');

  // Walk back from this Saturday to the Saturday on/before programStart.
  const rows: WeeklyTargetRow[] = [];
  const cursor = new Date(thisSaturday);
  // Swing-aware (v42): attribution computed once, shared by every row.
  const attribution = attributeSessionsToWeeks(logs);
  while (cursor.getTime() >= programStart.getTime() - 6 * 24 * 60 * 60 * 1000) {
    const weekStart = new Date(cursor);

    // Sessions COUNTED toward this week (chronological — oldest first)
    const weekLogs = sessionsAttributedTo(logs, weekStart, attribution).slice(0, 3); // cap at 3 for the 3-slot view

    const pw = getProgramWeek(weekStart);
    rows.push({
      saturday: new Date(weekStart),
      weekNum: pw.num,
      round: pw.round,
      skippedLabel: pw.skippedLabel,
      // v54: safe — `logs` (above) already excludes D, so nothing in
      // weekLogs (derived from it) is ever 'D'; this is a type-only
      // narrowing, not a second filter (a second filter here would
      // desync `workouts` from the parallel `logs` array below).
      workouts: weekLogs.map((l) => l.workout as 'A' | 'B' | 'C'),
      logs: weekLogs,
      isCurrentWeek: weekStart.getTime() === thisSaturday.getTime(),
    });

    cursor.setDate(cursor.getDate() - 7);
  }

  return rows;
}

// 3-per-week target view (replaces the 7-cells-per-week year-grid).
// Allison's words 2026-05-15 15:13 JDT: "i think theres too many sessions"
// + "its 3 a week" + "go back to 3 per week." The year-grid showed 7 cells
// per week which implied a daily target — but she's only doing 3/week. This
// view shows ONE row per week × 3 slot pills, each filled with the workout
// letter she actually did (or empty outline).

// 3-per-week target view. One row per program week × 3 slot pills.
// v48 · P4 (Sep 24 2026): lives at the bottom of Weekly review now, collapsed
// as "Week by week ▸" (DECISIONS Q3 — her Aug 30 "consistency should be
// collapsible"; Weekly review is where looking back lives). One <details>, so
// it's still one tap open.
function renderWeeklyTargetGrid(summaryLabel = 'Consistency'): string {
  const logs = loadLogs();
  const rows = buildWeeklyTargetRows(logs);
  // v48 · P6 (Sep 24 2026): the "N of 3 this week" + swing note that sat on
  // this summary (and again inside it) are gone — in Weekly review the count
  // is the screen's own subtitle, and home's week line carries the swing in
  // words (DECISIONS §2 #2: "One quiet count, not 3-5").

  const rowsHtml = rows
    .map((r) => {
      const rangeLabel = `${r.saturday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      const slots = [0, 1, 2]
        .map((i) => {
          const w = r.workouts[i];
          const log = r.logs[i];
          if (w && log) {
            const cls = `weekly-slot weekly-slot-${w}`;
            const id = log.id ? `data-detail="${escapeHtml(log.id)}"` : '';
            const tooltip = `${formatDate(log.date)} · Workout ${w} · capacity ${log.capacityBefore ?? '—'}→${log.capacityAfter ?? '—'}`;
            return `<button class="${cls}" type="button" ${id} aria-label="${escapeHtml(tooltip)}" title="${escapeHtml(tooltip)}">${w}</button>`;
          }
          return `<div class="weekly-slot weekly-slot-empty" aria-label="open slot"></div>`;
        })
        .join('');
      const cls = r.isCurrentWeek ? 'weekly-row weekly-row-current' : 'weekly-row';
      const label = r.isCurrentWeek
        ? 'This week'
        : r.skippedLabel
          ? `${r.skippedLabel} · ${rangeLabel}`
          : `${r.round > 1 ? `R${r.round} · ` : ''}Wk ${r.weekNum} · ${rangeLabel}`;
      return `
        <div class="${cls}">
          <div class="weekly-row-label">${label}</div>
          <div class="weekly-slots">${slots}</div>
        </div>`;
    })
    .join('');

  // Collapsed by default (her call Aug 30 2026: "consistency should be
  // collapsible and the workouts should be first") — the summary line keeps
  // the one number she cares about visible without the full week list.
  return `
    <details class="consistency-wrap">
      <summary class="next-week-summary">
        <span class="next-week-summary-label">${summaryLabel}</span>
        <span class="next-week-summary-meta">3 per week · since ${formatMonthDay(PROGRAM_START_DATE + 'T00:00:00')}</span>
        <span class="next-week-chev">▸</span>
      </summary>
      <div class="past-weeks-body weekly-target-card">
        <div class="weekly-target-header">
          <h3 class="weekly-target-title">
            Consistency · <span class="weekly-target-sub">3 per week</span>
          </h3>
        </div>
        <div class="weekly-target-rows">${rowsHtml}</div>
      </div>
    </details>
  `;
}

type WeekSession = {
  log: LogEntry;
};

// WK4 (Sep 27 2026): extracted so the completion-model pager (below) can ask
// for a FIXED Saturday (legacySaturdayForOffset) instead of one relative to
// "today" — every pre-launch caller passes saturdayForOffset(offset), same
// today-relative Saturday the pre-WK4 getWeekSessions(offset) always used.
function getWeekSessionsForSaturday(saturday: Date): WeekSession[] {
  // Swing-aware (v42): sessions COUNTED toward this Sat→Fri week, oldest first.
  return sessionsAttributedTo(loadLogs(), saturday).map((log) => ({ log }));
}

// WK4 (Sep 27 2026): the completion model's own sessions for a span — its
// `sessions` are week.ts's minimal SessionLite (id/date/workout only),
// matched back to their full LogEntry by id, in the span's own chronological
// order (WeekSpan's own guarantee).
function getWeekSessionsForSpan(span: WeekSpan): WeekSession[] {
  const byId = new Map(loadLogs().map((l) => [l.id, l] as const));
  return span.sessions
    .map((s) => byId.get(s.id))
    .filter((l): l is LogEntry => !!l)
    .map((log) => ({ log }));
}

// v54 fix r2 (Sep 27 2026), checker's should #1: span.sessions never has a
// 'D' (week.ts drops it from the completion model on purpose, same as
// buildWeeklyTargetRows) — so a D ride that week made the review say "0 of
// 3 · No sessions this week" even though she'd just ridden. D still isn't
// one of the three; this only finds D logs whose DATE falls inside the
// span so the review can list them as an honest extra, same reasoning as
// renderRidesTotalsCard's "This week" fix above.
//
// v61.1 fix 2 (Oct 2 2026, CHECK-v61.1.md must #1): the span-local version of
// this function (v55's own "up to whenever the NEXT span opened, or forever
// for the newest" window) is DELETED — it carried its own D window instead of
// asking week-d.ts for the SAME one Home/Progress/the peek already use
// (weekHasDFor/completionWeekDots, v61 fix passes 2-3), so the review
// disagreed with every other screen about the same D in every gap case. Her
// real rows: r1noD (C Fri, D Sat, nothing else yet) put the Sat D in the
// review's Week 5 forever — `sinceMs` was Week 5's own `openedAt` and
// `untilMs` was `Infinity` since no span had opened after it — while
// Home/Progress/the peek had already moved it to Week 6's open window
// (week-d.ts's anchor-weekend floor). Gap + Sunday opening (C Fri, D Sat, A
// Sun) attributed the Sat D to Week 5 too, since Week 6's own `openedAt` is
// the Sunday A — strictly AFTER the Saturday D — while the other three
// screens already count it in Week 6. One D-window, built by week-d.ts,
// never two that can drift apart: `target` is `{kind:'open'}` for the page
// that's still live (`span.closedAt === null` — the same open/closed test
// `isLiveOpen` below already uses) and `{kind:'span', key}` otherwise; the
// span itself is looked up again by its own KEY inside `model.spans`
// (week-d.ts's own "key-based, not reference-based" note), not by object
// identity, since `model` here is a fresh `weekModel()` call, not the one
// `reviewCompletionPages()` used internally to build `span` in the first
// place — two structurally-identical-but-not-reference-equal results still
// have to agree.
function getExtraDSessionsForTarget(target: DWeekTarget, model: DWeekModel): LogEntry[] {
  const win = weekWindowFor(target, model);
  if (win === null) return [];
  return loadLogs()
    .filter((l) => l.workout === 'D')
    .filter((l) => {
      const t = new Date(l.date).getTime();
      return t >= win.start && (win.end === null || t < win.end);
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

type WeekTotals = {
  count: number;
  // T2 fix r1 (Sep 27 2026, checker's "must"): this used to be `totalSec`,
  // summed straight from `durationSec` — the app's own open/close tap-time,
  // not her training (§3.4's own list names "the weekly review" as a place
  // that must go through the confirmed-timing formatter). It's now the sum of
  // each CONFIRMED session's `trainingMinutes` (timing.ts) only — a session
  // she never confirmed start/finish for contributes nothing here, same rule
  // as the Sessions row and the Session detail's Time row.
  trainingMinSum: number;
  // How many of `count` sessions contributed to trainingMinSum. Less than
  // count → the total is partial and must say so; zero → nothing to show.
  trainingKnownCount: number;
  avgCapBefore: number | null;
  avgCapAfter: number | null;
  maxWallSit: number;
  avgBackPain: number | null; // averaged only over sessions with backPain > 0
};

export function computeWeekTotals(sessions: WeekSession[]): WeekTotals {
  if (sessions.length === 0) {
    return {
      count: 0,
      trainingMinSum: 0,
      trainingKnownCount: 0,
      avgCapBefore: null,
      avgCapAfter: null,
      maxWallSit: 0,
      avgBackPain: null,
    };
  }
  let trainingMinSum = 0;
  // v34 (kept under the new name, T2 fix r1): count how many of the week's
  // sessions actually HAVE a confirmed workout time. A session with no
  // confirmed start/finish contributes nothing, and folding it in as zero
  // minutes would silently under-report a real week's total. Fail-loud rule:
  // say the total is partial, never present a hole as a number.
  let trainingKnownCount = 0;
  let capBeforeSum = 0;
  let capBeforeCount = 0; // v39: before-capacity can be missing on old rows too
  let capAfterSum = 0;
  let capAfterCount = 0; // v32: after-the-fact logs have no after-reading
  let maxWallSit = 0;
  let backPainSum = 0;
  let backPainCount = 0;
  for (const { log } of sessions) {
    const minutes = trainingMinutes(log);
    if (minutes !== null) {
      trainingMinSum += minutes;
      trainingKnownCount += 1;
    }
    if (log.capacityBefore !== null) {
      capBeforeSum += log.capacityBefore;
      capBeforeCount += 1;
    }
    if (log.capacityAfter !== null) {
      capAfterSum += log.capacityAfter;
      capAfterCount += 1;
    }
    if (log.wallSitSec > maxWallSit) maxWallSit = log.wallSitSec;
    if (log.backPain !== null && log.backPain > 0) {
      backPainSum += log.backPain;
      backPainCount += 1;
    }
  }
  return {
    count: sessions.length,
    trainingMinSum,
    trainingKnownCount,
    avgCapBefore: capBeforeCount > 0 ? capBeforeSum / capBeforeCount : null,
    avgCapAfter: capAfterCount > 0 ? capAfterSum / capAfterCount : null,
    maxWallSit,
    avgBackPain: backPainCount > 0 ? backPainSum / backPainCount : null,
  };
}

function formatAvg(n: number | null, digits = 1): string {
  if (n === null) return '—';
  return n.toFixed(digits);
}

// Calmly directional delta. NOT shouty — per agency rule. Show direction with
// muted progress/dim tokens; a "worse" delta gets --text-dim, NOT a warn color.
// v48 · P6 (Sep 24 2026): with its unit — "↓ -22m", "↑ +5s" (a bare "-22" left
// her to guess minutes or seconds; uxui weekly).
function renderDelta(
  curr: number,
  prev: number,
  kind: 'higher-better' | 'lower-better',
  unit = ''
): string {
  const diff = curr - prev;
  if (diff === 0) {
    return `<span class="weekly-review-delta-num delta-same">±0${unit}</span>`;
  }
  const arrow = diff > 0 ? '↑' : '↓';
  const sign = diff > 0 ? '+' : '';
  const isImprovement =
    (kind === 'higher-better' && diff > 0) || (kind === 'lower-better' && diff < 0);
  const cls = isImprovement ? 'delta-up' : 'delta-down';
  return `<span class="weekly-review-delta-num ${cls}">${arrow} ${sign}${diff}${unit}</span>`;
}

function renderDeltaDecimal(
  curr: number | null,
  prev: number | null,
  kind: 'higher-better' | 'lower-better'
): string {
  if (curr === null || prev === null) {
    return `<span class="weekly-review-delta-num delta-same">—</span>`;
  }
  const diff = curr - prev;
  if (Math.abs(diff) < 0.05) {
    return `<span class="weekly-review-delta-num delta-same">±0</span>`;
  }
  const arrow = diff > 0 ? '↑' : '↓';
  const sign = diff > 0 ? '+' : '';
  const isImprovement =
    (kind === 'higher-better' && diff > 0) || (kind === 'lower-better' && diff < 0);
  const cls = isImprovement ? 'delta-up' : 'delta-down';
  return `<span class="weekly-review-delta-num ${cls}">${arrow} ${sign}${diff.toFixed(1)}</span>`;
}

// The review's title in home's words: "This week · R2 · Week 4 · Sep 19–25",
// a past week "R2 · Week 3 · Sep 12–18", a held week "Sick week · Jul 11–17".
// WK4 (Sep 27 2026): extracted onto an explicit Saturday + "is this the live
// page" flag so the same string logic serves both a pre-launch caller
// (saturdayForOffset(offset), offset === 0) and a legacy page reached through
// the post-launch pager (a FIXED Saturday, never "today minus N weeks" — see
// legacySaturdayForOffset — and always past, never the live page).
function weekReviewTitleForSaturday(saturday: Date, isCurrentPage: boolean): string {
  const friday = new Date(saturday);
  friday.setDate(saturday.getDate() + 6);
  const range = formatWeekRange(saturday, friday);
  const pw = getProgramWeek(saturday);
  if (pw.skippedLabel) return `${pw.skippedLabel} week · ${range}`;
  const week = `${pw.round > 1 ? `R${pw.round} · ` : ''}Week ${pw.num}`;
  return isCurrentPage ? `This week · ${week} · ${range}` : `${week} · ${range}`;
}

// WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.4 "Weekly review ‹ ›": "it pages
// through one list: the calendar weeks before the launch, then the program
// weeks." The Saturday of the legacy calendar week `legacyOffset` weeks
// before the last one the OLD swing model ever closed (Week 4, Sat Sep
// 19–Fri Sep 25) — anchored to the FIXED instant LEGACY_LAST_CLOSED_WEEK_INSTANT
// (already a Saturday — see that constant's own comment), never "today minus
// N weeks", which would drift as today does (the same class of bug WK2 fix r1
// already fixed for the home peek). legacyOffset 0 = Week 4 itself.
function legacySaturdayForOffset(legacyOffset: number): Date {
  const anchor = new Date(LEGACY_LAST_CLOSED_WEEK_INSTANT);
  const saturday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  saturday.setDate(saturday.getDate() - legacyOffset * 7);
  return saturday;
}

// WK4 (Sep 27 2026): the pageable completion-model spans, newest-first — the
// live OPEN span first (if one exists), then every CLOSED span, newest to
// oldest. weekModel()'s own invariant (the launch instant always opens Week 1
// immediately) means `open` and `spans` are never BOTH empty once "now" is
// past the launch, so this is never `[]` in real post-launch use.
function reviewCompletionPages(): WeekSpan[] {
  const { spans, open } = weekModel();
  return open ? [open, ...spans.slice().reverse()] : spans.slice().reverse();
}

// "Week 5 · Sep 26 – Oct 1 · 3 of 3" (closed); "Week 6 · Sep 26–Oct 1 · moved
// on at 2 of 3" (moved_on); "Week 7 · since Sat Oct 3" (still open) — §2.4's
// own exact strings. No "This week" prefix (unlike the legacy title above):
// the week number + "since"/range already say which one is current, same as
// Home's own header reads "Week N" plainly.
// v61 (Sep 28 2026), spec item d: "Progress + weekly review show the same
// 'of 4'." `hasD` comes from the SAME getExtraDSessionsForTarget the caller
// already computes for this exact span (reviewWeekViewAt below) — one
// D-detection, never a second one that could disagree with it.
function completionReviewTitle(span: WeekSpan, hasD: boolean): string {
  // No "R{n} ·" prefix — unlike the legacy title below, §2.4's own literal
  // strings ("Week 5 · Sep 26 – Oct 1 · 3 of 3", "since Sep 26") never carry
  // one; Home already dropped "Round 2" the same way (§2.4: "It shows on
  // Sessions, Progress and Settings" — this screen names it in its OWN
  // header line already, via renderWeeklyReview's "R2 · Week 4" legacy pages).
  const week = `Week ${span.key.week}`;
  if (span.closedAt === null) {
    return `${week} · since ${formatWeekdayDate(span.openedAt)}`;
  }
  const range = formatWeekRange(new Date(span.openedAt), new Date(span.closedAt));
  const done = span.done.length + (hasD ? 1 : 0);
  const doneLine =
    span.how === 'moved_on'
      ? `moved on at ${done} of 4`
      : span.missing.length === 0
        ? hasD
          ? '4 of 4 ✓'
          : 'complete · 3 of 4'
        : `${done} of 4`;
  return `${week} · ${range} · ${doneLine}`;
}

// WK4 (Sep 27 2026): the sessions at ANY combined pager offset, legacy or
// completion — used only for the "vs previous week" comparison (the delta
// card reads one offset further back than whatever page is showing).
function reviewSessionsAt(offset: number): WeekSession[] {
  if (!isNowAfterCompletionLaunch()) return getWeekSessionsForSaturday(saturdayForOffset(offset));
  const completionPages = reviewCompletionPages();
  if (offset < completionPages.length) return getWeekSessionsForSpan(completionPages[offset]!);
  return getWeekSessionsForSaturday(legacySaturdayForOffset(offset - completionPages.length));
}

type ReviewWeekView = {
  title: string;
  skippedLabel: string | null;
  sessions: WeekSession[];
  prevSessions: WeekSession[];
  // v61 (Sep 28 2026), spec item d: true only for a completion-model page —
  // a legacy (pre-launch) week has no D concept at all, so it keeps "of 3"
  // (renderWeeklyReview's own Sessions subtitle reads this, not a second
  // isNowAfterCompletionLaunch() check).
  countsD: boolean;
  // v54 fix r2 (Sep 27 2026), checker's should #1: D logs that date inside
  // this week but never count toward `sessions` (see
  // getExtraDSessionsForTarget). Empty pre-launch (D didn't exist yet).
  extraSessions: LogEntry[];
  // True only for the ONE page that's still actually live/open right now —
  // gates the "vs previous week" card vs "Week still open." (see
  // renderWeeklyReview). Pre-launch this is exactly `offset === 0` (the old
  // model's own always-live "this week"); post-launch it's the completion
  // model's live OPEN span specifically — a mid-gap page 0 (the last CLOSED
  // span, week.ts's own "nothing has opened yet" fallback) is a real past
  // week, not a live one, and reads that way.
  isLiveOpen: boolean;
};

// WK4 (Sep 27 2026): the pager's one seam — everything renderWeeklyReview
// draws comes off this view model, so the rest of that function never
// branches on legacy-vs-completion itself.
function reviewWeekViewAt(offset: number): ReviewWeekView {
  if (!isNowAfterCompletionLaunch()) {
    const saturday = saturdayForOffset(offset);
    const pw = getProgramWeek(saturday);
    return {
      title: weekReviewTitleForSaturday(saturday, offset === 0),
      skippedLabel: pw.skippedLabel,
      sessions: getWeekSessionsForSaturday(saturday),
      prevSessions: reviewSessionsAt(offset + 1),
      extraSessions: [], // pre-launch: D didn't exist yet
      countsD: false,
      isLiveOpen: offset === 0,
    };
  }
  const completionPages = reviewCompletionPages();
  if (offset < completionPages.length) {
    const span = completionPages[offset]!;
    // v61.1 fix 2 (Oct 2 2026): one shared window for count AND the review's
    // extra-ride list — see getExtraDSessionsForTarget's own header. A fresh
    // `weekModel()` call here (not the one `reviewCompletionPages()` used
    // internally) is fine: `target` is key-based, never an object-identity
    // check against this `span`.
    const model = weekModel();
    const target: DWeekTarget =
      span.closedAt === null ? { kind: 'open' } : { kind: 'span', key: span.key };
    const extraSessions = getExtraDSessionsForTarget(target, model);
    return {
      title: completionReviewTitle(span, extraSessions.length > 0),
      skippedLabel: null,
      sessions: getWeekSessionsForSpan(span),
      prevSessions: reviewSessionsAt(offset + 1),
      extraSessions,
      countsD: true,
      isLiveOpen: offset === 0 && span.closedAt === null,
    };
  }
  const saturday = legacySaturdayForOffset(offset - completionPages.length);
  const pw = getProgramWeek(saturday);
  return {
    title: weekReviewTitleForSaturday(saturday, false), // always past, once reached from here
    skippedLabel: pw.skippedLabel,
    sessions: getWeekSessionsForSaturday(saturday),
    prevSessions: reviewSessionsAt(offset + 1),
    extraSessions: [], // legacy pre-launch weeks: D didn't exist yet
    countsD: false,
    isLiveOpen: false,
  };
}

// WK4 (Sep 27 2026): the ‹ arrow's stop condition across the combined pager —
// pre-launch, unchanged (the calendar boundary). Post-launch, keep going while
// either another completion page remains, or the next legacy Saturday hasn't
// walked past the program's first week.
function reviewCanGoBack(offset: number): boolean {
  if (!isNowAfterCompletionLaunch()) {
    return saturdayForOffset(offset + 1).getTime() >= firstProgramSaturday().getTime();
  }
  const completionPages = reviewCompletionPages();
  const nextOffset = offset + 1;
  if (nextOffset < completionPages.length) return true;
  return (
    legacySaturdayForOffset(nextOffset - completionPages.length).getTime() >=
    firstProgramSaturday().getTime()
  );
}

// ---------- Ship 4: weekly review (2026-05-15) ----------
//
// A per-week debrief screen, reached from home's week card. The screen respects
// `viewedWeekOffset`; v48 · P6 (Sep 24 2026) moved the ‹ › week arrows here
// from home, so looking back lives on the one screen made for it.
//
// Design rules honored:
//  - No paternalism. No motivational language. The screen reports the week;
//    it doesn't judge it. (`feedback_no_capacity_paternalism.md` + CLAUDE.md
//    agency rule.)
//  - Voice rule: her words appear verbatim, never edited.
//  - All data reads from existing loadLogs(). No new Supabase queries.
//  - D-1 visual tokens only (no new color vars).

export function renderWeeklyReview(): string {
  const offset = ui.viewedWeekOffset;
  const view = reviewWeekViewAt(offset);
  const canGoBack = reviewCanGoBack(offset);

  const sessions = view.sessions;
  const totals = computeWeekTotals(sessions);
  const prev = computeWeekTotals(view.prevSessions);
  // v62.3 F2: the "vs previous week" box counts sessions the way the header
  // does (D counted in on a completion-model week) - both weeks, same rule.
  const prevView = reviewWeekViewAt(offset + 1);
  const prevShownCount = shownSessionCount(
    prev.count,
    prevView.countsD,
    prevView.extraSessions.length
  );

  // The ‹ › arrows sit around the title (moved from home, DECISIONS §5). The
  // live week has nothing after it, so › is hidden — not a dead button.
  const header = `
    <div class="screen-header review-header">
      <div class="review-nav">
        <button class="review-arrow${canGoBack ? '' : ' review-arrow-off'}" id="prev-week" type="button" aria-label="Previous week"${canGoBack ? '' : ' disabled'}>‹</button>
        <h2 class="review-title">${view.title}</h2>
        <button class="review-arrow${offset > 0 ? '' : ' review-arrow-off'}" id="next-week" type="button" aria-label="Next week"${offset > 0 ? '' : ' disabled'}>›</button>
      </div>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>`;

  // A held week (sick / break) is not a miss (her Jul 19 rule): no "of 3"/"of 4".
  // v61 (Sep 28 2026), spec item d: "Progress + weekly review show the same
  // 'of 4'" — a completion-model page counts a D ride into the number shown;
  // the "met" styling still keys on the real A/B/C requirement (3), D never
  // required, exactly as the week itself closes.
  const sessionCountClass = totals.count >= 3 ? 'weekly-review-count-met' : 'weekly-review-count';
  const reviewDenom = view.countsD ? 4 : 3;
  const reviewShownCount = shownSessionCount(totals.count, view.countsD, view.extraSessions.length);
  const subtitle = view.skippedLabel
    ? ''
    : `<div class="weekly-review-subtitle">
        Sessions: <span class="${sessionCountClass}"><strong>${reviewShownCount}</strong> of ${reviewDenom}</span>
      </div>`;

  // v54 fix r2 (Sep 27 2026), checker's should #1: D never counts toward
  // "N of 3" (it isn't one of the three), but a D ride that week is real and
  // hiding it made the page say something untrue ("No sessions this week"
  // right after she rode one). Listed as its own honest extra line, under
  // the count, never folded into it.
  const extraRows = view.extraSessions
    .map(
      (l) => `<div class="weekly-review-extra-row">D · ${formatRowDate(l.date)} · extra ride</div>`
    )
    .join('');

  // Empty state — single subtle line, no nudge.
  if (sessions.length === 0) {
    // v54 fix r3 (Sep 27 2026), checker's should #1 (round 3 — round 2's own
    // fix above only half-closed this): "No sessions this week." directly
    // above a "D · ... · extra ride" line contradicts itself — she DID ride,
    // it just wasn't one of A/B/C. When extraRows is non-empty the line now
    // names what's actually still open (skippedLabel never co-occurs with
    // extraSessions — completion pages always set skippedLabel: null, see
    // reviewWeekViewAt — so this branches cleanly ahead of it).
    const emptyLine = view.skippedLabel
      ? 'Held the slot — doesn’t count.'
      : extraRows
        ? view.isLiveOpen
          ? 'None of A, B, C yet.'
          : 'None of A, B, C that week.'
        : view.isLiveOpen
          ? 'No sessions this week.'
          : 'No sessions that week.';
    return `
      ${header}
      ${subtitle}
      <p class="weekly-review-empty">${emptyLine}</p>
      ${extraRows ? `<div class="weekly-review-extras">${extraRows}</div>` : ''}
      ${renderWeeklyTargetGrid('Week by week')}
    `;
  }

  const newestFirst = logsNewestFirst();
  const sessionRows = sessions.map((s) => renderSessionRow(s.log, newestFirst)).join('');

  // "6.0 → 7.0"; with no after-readings that week, just the before (the
  // Session screen's "7 when after is null" — a hole never drawn as "→ —").
  const capTile =
    totals.avgCapBefore === null && totals.avgCapAfter === null
      ? '—'
      : totals.avgCapAfter === null
        ? formatAvg(totals.avgCapBefore)
        : `${formatAvg(totals.avgCapBefore)} → ${formatAvg(totals.avgCapAfter)}`;
  const painWarn = totals.avgBackPain !== null && totals.avgBackPain >= BACK_PAIN_STOP_AT;
  // v55 (Sep 27 2026) — CHECK N4 (round 1): "TOTAL TIME —" was showing on
  // every week before her confirmed-timing rows existed (T2 removed the old
  // app-time fallback correctly; nothing replaced the tile). Fix per the
  // checker's own words: hide the tile until a week has a confirmed time,
  // rather than show an honest but permanent "—".
  const totalTimeTile =
    totals.trainingKnownCount > 0
      ? `
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${formatWorkoutMinutesTotal(totals.trainingMinSum)}</div>
          <div class="weekly-review-total-lbl">${
            totals.trainingKnownCount < totals.count
              ? `total time · ${totals.trainingKnownCount} of ${totals.count} sessions`
              : 'total time'
          }</div>
        </div>`
      : '';
  // Four tiles, an even grid (v48 · P6: one "Capacity 5.5 → 6.0" tile replaced
  // the two average tiles; back pain always has its tile — "none" when no pain).
  const totalsCard = `
    <div class="card weekly-review-totals">
      <h3>Week totals</h3>
      <div class="weekly-review-totals-grid">
        ${totalTimeTile}
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${capTile}</div>
          <div class="weekly-review-total-lbl">capacity</div>
        </div>
        <div class="weekly-review-total">
          <div class="weekly-review-total-num">${totals.maxWallSit > 0 ? `${totals.maxWallSit}s` : '—'}</div>
          <div class="weekly-review-total-lbl">max wall sit</div>
        </div>
        <div class="weekly-review-total${painWarn ? ' weekly-review-total-warn' : ''}">
          <div class="weekly-review-total-num">${totals.avgBackPain === null ? 'none' : formatAvg(totals.avgBackPain)}</div>
          <div class="weekly-review-total-lbl">${totals.avgBackPain === null ? 'back pain' : 'avg back pain'}</div>
        </div>
      </div>
    </div>
  `;

  // v48 · P6 (Sep 24 2026): "vs previous week" only for a CLOSED week — on a
  // Thursday it showed "↓ -1" for a week she was on track to finish (uxui
  // weekly 4/5). The live week says so in one quiet line instead.
  const deltaCard =
    !view.isLiveOpen && prev.count > 0
      ? `
        <div class="card weekly-review-delta">
          <h3>vs previous week</h3>
          <div class="weekly-review-delta-grid">
            <div class="weekly-review-delta-row">
              <span class="weekly-review-delta-lbl">sessions</span>
              <span class="weekly-review-delta-vals">${prevShownCount} → ${reviewShownCount}</span>
              ${renderDelta(reviewShownCount, prevShownCount, 'higher-better')}
            </div>
            ${
              // T2 fix r1 (Sep 27 2026, checker's "must"): only compare
              // confirmed training minutes, and only when BOTH weeks have at
              // least one confirmed session — no arrow drawn from a week (or
              // two) with nothing confirmed, and never from durationSec again.
              prev.trainingKnownCount > 0 && totals.trainingKnownCount > 0
                ? `<div class="weekly-review-delta-row">
                    <span class="weekly-review-delta-lbl">total time</span>
                    <span class="weekly-review-delta-vals">${formatWorkoutMinutesTotal(prev.trainingMinSum)} → ${formatWorkoutMinutesTotal(totals.trainingMinSum)}</span>
                    ${renderDelta(Math.round(totals.trainingMinSum), Math.round(prev.trainingMinSum), 'higher-better', 'm')}
                  </div>`
                : ''
            }
            ${
              prev.maxWallSit > 0 || totals.maxWallSit > 0
                ? `<div class="weekly-review-delta-row weekly-review-delta-row-emph">
                    <span class="weekly-review-delta-lbl">max wall sit</span>
                    <span class="weekly-review-delta-vals">${prev.maxWallSit}s → ${totals.maxWallSit}s</span>
                    ${renderDelta(totals.maxWallSit, prev.maxWallSit, 'higher-better', 's')}
                  </div>`
                : ''
            }
            ${
              prev.avgBackPain !== null || totals.avgBackPain !== null
                ? `<div class="weekly-review-delta-row">
                    <span class="weekly-review-delta-lbl">avg back pain</span>
                    <span class="weekly-review-delta-vals">${formatAvg(prev.avgBackPain)} → ${formatAvg(totals.avgBackPain)}</span>
                    ${renderDeltaDecimal(totals.avgBackPain, prev.avgBackPain, 'lower-better')}
                  </div>`
                : ''
            }
          </div>
        </div>
      `
      : view.isLiveOpen
        ? '<p class="weekly-review-open">Week still open.</p>'
        : '';

  return `
    ${header}
    ${subtitle}
    <div class="card weekly-review-sessions session-list">
      ${sessionRows}
    </div>
    ${extraRows ? `<div class="weekly-review-extras">${extraRows}</div>` : ''}
    ${totalsCard}
    ${deltaCard}
    ${
      // v48 · P4 (Sep 24 2026): re-homed from home; stays at the bottom, closed.
      renderWeeklyTargetGrid('Week by week')
    }
  `;
}

// The Weekly review's ‹ › week arrows (pulled out of attachHandlers(), step 13c, same slot).
export function attachReviewHandlers(): void {
  // v48 · P6 (Sep 24 2026): the ‹ › week arrows, moved here from home (P4) —
  // stepping back through weeks lives on the screen made for looking back.
  bindClick('prev-week', () => {
    ui.viewedWeekOffset += 1;
    requestRender();
  });
  bindClick('next-week', () => {
    if (ui.viewedWeekOffset > 0) ui.viewedWeekOffset -= 1;
    requestRender();
  });
}
