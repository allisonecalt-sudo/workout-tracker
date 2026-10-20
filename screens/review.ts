// screens/review.ts - THE WEEKLY REVIEW SCREEN (code-shape step 13c, Oct 15 2026), the fifth screen
// module. Moved out of app.ts verbatim; no behaviour change, no version bump.
//
// Owns: renderWeeklyReview (the plain week and the week-by-week pager, the title for a live,
// past, held or Sick week, the session list with the D ride as a normal row, "Your usual", "What
// was measured" in words), the helpers only it uses (computeWeekTotals and its types, the
// week-session lookups) and its two click handlers (attachReviewHandlers: the < > week arrows).
// v64: the totals card, the "vs previous week" box and the week-by-week grid are gone (the grid
// lives on Progress as the weeks grid; the rows come from weeks-grid.ts).
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
import type { LogEntry } from '../types.js';
import { ui } from '../ui.js';
import { requestRender } from '../bus.js';
import { bindClick } from '../dom.js';
import { loadLogs } from '../state.js';
import { escapeHtml, formatWeekRange } from '../format.js';
import { shownSessionCount } from '../number-rules.js';
import { buildWeekRows, usualWeekCount } from '../weeks-grid.js';
import { honestWallSitLogs } from '../viz.js';
import { formatWeekdayDate } from '../dates.js';
import {
  getProgramWeek,
  weekModel,
  isNowAfterCompletionLaunch,
  saturdayForOffset,
  firstProgramSaturday,
} from '../week-clock.js';
import { sessionsAttributedTo } from '../program-week.js';
import { logsNewestFirst, renderSessionRow } from '../session-row.js';

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

// v64 (Oct 20 2026): "What was measured" in words, one line, over everything the page lists
// (A/B/C and the D ride): "wall sit 45 s · pain-free 1 of 2 · wrist 1". Capacity is not shown
// here (her Q6: the default-5 readings are untrustworthy; it stays in Session detail and on
// the Cycle page). Each part appears only when there is something real to say.
function measuredWords(listed: LogEntry[]): string {
  const parts: string[] = [];
  const totals = computeWeekTotals(listed.map((log) => ({ log })));
  if (totals.trainingKnownCount > 0) {
    const partial =
      totals.trainingKnownCount < totals.count
        ? ` (${totals.trainingKnownCount} of ${totals.count} sessions)`
        : '';
    parts.push(`time ${formatWorkoutMinutesTotal(totals.trainingMinSum)}${partial}`);
  }
  // Honest wall sits only (viz.ts: a pre-Sep 24 row saved the PRESCRIBED hold, not a reading).
  const walls = honestWallSitLogs(listed).map((l) => l.wallSitSec);
  if (walls.length > 0) parts.push(`wall sit ${Math.max(...walls)} s`);
  const back = listed.map((l) => l.backPain).filter((v): v is number => v !== null);
  if (back.length > 0)
    parts.push(`pain-free ${back.filter((v) => v === 0).length} of ${back.length}`);
  const wrist = [...listed]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => l.wristPain)
    .filter((v): v is number => typeof v === 'number');
  if (wrist.length > 0) {
    const first = wrist[0]!;
    const last = wrist[wrist.length - 1]!;
    parts.push(first === last ? `wrist ${last}` : `wrist ${first} → ${last}`);
  }
  return parts.join(' · ');
}

// v64: "Your usual: 3 a week · this week: 3" - the rolling median of the last 4 normal weeks
// (weeks-grid.ts), only once 4 exist; "that week" on a past page. One line, no arrows: a
// one-week delta on numbers this small is noise, and "down" was good news for back pain.
function usualLine(pageOffset: number, shownCount: number, isLiveOpen: boolean): string {
  const usual = usualWeekCount(buildWeekRows(loadLogs()), pageOffset);
  if (usual === null) return '';
  const shown = Number.isInteger(usual) ? String(usual) : usual.toFixed(1);
  return `<p class="review-usual">Your usual: ${shown} a week · ${isLiveOpen ? 'this week' : 'that week'}: ${shownCount}</p>`;
}

export function renderWeeklyReview(): string {
  const offset = ui.viewedWeekOffset;
  const view = reviewWeekViewAt(offset);
  const canGoBack = reviewCanGoBack(offset);

  const sessions = view.sessions;
  const totals = computeWeekTotals(sessions);

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

  const newestFirst = logsNewestFirst();
  // v64: the D ride is a normal row in the list (it was a session), in date order with the
  // A/B/C rows - no separate "D · ... · extra ride" line.
  const listed = [...sessions.map((s) => s.log), ...view.extraSessions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const sessionRows = listed.map((l) => renderSessionRow(l, newestFirst)).join('');

  // Empty state — single subtle line, no nudge.
  if (sessions.length === 0) {
    // v54 fix r3 (Sep 27 2026): "No sessions this week." above a D ride she did
    // contradicts itself - when D rows exist the line names what is still open.
    const emptyLine = view.skippedLabel
      ? 'Held the slot — doesn’t count.'
      : view.extraSessions.length > 0
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
      ${
        view.extraSessions.length > 0
          ? `<div class="card weekly-review-sessions session-list">${sessionRows}</div>`
          : ''
      }
    `;
  }

  const measured = measuredWords(listed);

  return `
    ${header}
    ${subtitle}
    <div class="card weekly-review-sessions session-list">
      ${sessionRows}
    </div>
    ${usualLine(offset, reviewShownCount, view.isLiveOpen)}
    ${
      measured
        ? `<p class="review-measured"><span class="review-measured-lbl">What was measured</span> ${escapeHtml(measured)}</p>`
        : ''
    }
    ${view.isLiveOpen ? '<p class="weekly-review-open">Week still open.</p>' : ''}
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
