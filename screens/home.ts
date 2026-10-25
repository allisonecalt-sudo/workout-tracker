// screens/home.ts - code-shape step 16 (Oct 15 2026): the Home screen, moved out of app.ts verbatim.
//
// WHAT: renderHome and everything only Home uses: the week card + its day dots (legacy and
// completion model), the closed-week peek ("‹ Week 4"), the Done card, the Up-next hero and the
// chips, the "Since May: N full weeks" line (v64; was the Start -> Now card), the left-open workout card (markup only), the header's week title
// and version tag, and the Home door/week-card handlers.
// WHY: app.ts was one 16k-line file; Home is the screen she opens most, so a Home fix should
// read one file. No behaviour change, no version bump.
// DECIDED (proof in the step-16 hand-off):
//  - ui.viewingLastClosedWeek stays in ui.ts: resetState() in session-resume.ts clears it, so it has a
//    writer outside Home. ui.viewedWeekOffset stays: Weekly review writes it too. ui.staleSnapshot
//    stays: actions.ts reads it. ui.detailOpenedAtScroll stays (screens/history.ts reads it back).
//  - The shared [data-detail] click (day dots, Sessions rows, Done card) stays in app.ts: it
//    serves Home, Weekly review and Sessions, so it cannot live in one screen.
//  - Handlers that need app.ts-only code stay in app.ts: the Up-next/chip tap (startWorkout), the
//    left-open card buttons (applyActiveSnapshot), the walk Start/Done/Cancel row (it redraws the
//    live line through app.ts's updateWalkLiveLine).
//  - The Home bindings sat interleaved with other screens' bindings in attachHandlers(), so they
//    are four functions called at their original spots (binding ORDER is unchanged).
// NEXT: step 17 (the workout screen).

import { periodLogUrgency } from '../cycle.js';
import {
  canMoveOn as weekCanMoveOn,
  COMPLETION_WEEKS_FROM,
  LEGACY_LAST_CLOSED_WEEK_INSTANT,
  type WeekSpan,
} from '../week.js';
import {
  weekCountLine,
  weekLeftWords,
  weekTargetForD,
  weekWindowFor,
  type DWeekTarget,
} from '../week-d.js';
import {
  planForWeekKey,
  noPlanLine,
  type WorkoutId,
  type AnyWorkoutId,
  type Workout,
} from '../program.js';
import type { ActiveSessionSnapshot } from '../state.js';
import type { LogEntry, StoredWeekMove, LastDone } from '../types.js';
import { ui } from '../ui.js';
import { moveOnWithoutIt, undoWeekMove } from '../actions.js';
import {
  LAST_DONE_KEY,
  state,
  loadLogs,
  loadWeekMoves,
  getChronologicalLogs,
  loadWalks,
  cyclePeriodsForLogic,
} from '../state.js';
import { escapeHtml, formatWeekRange } from '../format.js';
import { sinceFullWeeksLine } from '../number-rules.js';
import { rideLevel, rideKm, rideTimeSec } from '../cardio-notes.js';
import { buildWeekRows, fullWeeksSummary } from '../weeks-grid.js';
import { formatDate, formatWeekdayDate, localIsoDate, formatDateLong } from '../dates.js';
import { requestRender } from '../bus.js';
import { activeWalkStart, walkLiveText, walkStepMinutes } from '../walk.js';
import { bindClick } from '../dom.js';
import { APP_VERSION, BUILD_DATE } from '../version.js';
import { syncIndicatorText } from '../sync.js';
import {
  getProgramWeek,
  getTodaysPick,
  saturdayForOffset,
  homeWeekOffset,
  getViewedProgramWeek,
  isNowAfterCompletionLaunch,
  weekModel,
  shownWeek,
  gapCountsBackToWeekNum,
  weekSubLabel,
  getWeekPlan,
  weekHasDFor,
} from '../week-clock.js';
import {
  SESSIONS_PER_WEEK_TARGET,
  calendarSaturdayMs,
  attributeSessionsToWeeks,
  sessionsAttributedTo,
} from '../program-week.js';
import {
  getWorkoutById,
  getWorkoutD,
  tonightNames,
  workoutMinutesLabel,
  lastCardioLane,
  liveWeekDTarget,
  getWeekCount,
} from '../workout-now.js';

// WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.6 "Small ones": before the launch,
// unchanged (the calendar Sat-Fri week). At/after it, since the completion
// model's own week start — the OPEN span's openedAt, or (no span has closed
// yet, the "shouldn't happen" edge week.ts's own comment names) the launch
// instant itself — never "today's calendar Saturday", which the completion
// model has already replaced for "now" (same reasoning as isNowAfterCompletionLaunch).
//
// v61.1 fix 3 (Oct 2 2026, CHECK-v61.1.md check 2's nice): `since` used to
// be the raw `open.openedAt` — the exact event-to-event window week-d.ts
// replaced everywhere else (see its own header). A walk logged on the
// anchor day BEFORE the session that opens the week (the same class of gap
// week-d.ts exists to close for D) dropped out of "this week" even though
// it falls on the week's own calendar day. Routed through the SAME window
// weekWindowFor/weekTargetForD give every other D/ride/walk attribution.
function walksThisWeek(): number {
  if (!isNowAfterCompletionLaunch()) {
    const weekStart = saturdayForOffset(0).getTime();
    return loadWalks().filter((w) => new Date(w.date).getTime() >= weekStart).length;
  }
  const model = weekModel();
  const { open, spans } = model;
  const target: DWeekTarget | null = open
    ? { kind: 'open' }
    : spans.length
      ? { kind: 'span', key: spans[spans.length - 1]!.key }
      : null;
  const win = target ? weekWindowFor(target, model) : null;
  const since = win ? win.start : new Date(COMPLETION_WEEKS_FROM.at).getTime();
  return loadWalks().filter((w) => new Date(w.date).getTime() >= since).length;
}

function loadLastDone(): LastDone | null {
  try {
    const raw = localStorage.getItem(LAST_DONE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    const o = v as { id?: unknown; firsts?: unknown; back?: unknown };
    if (typeof o.id !== 'string' || !Array.isArray(o.firsts)) return null;
    const strings = (a: unknown[]): string[] => a.filter((f): f is string => typeof f === 'string');
    return {
      id: o.id,
      firsts: strings(o.firsts),
      back: Array.isArray(o.back) ? strings(o.back) : [],
    };
  } catch {
    return null;
  }
}

function renderStaleSessionCard(snap: ActiveSessionSnapshot): string {
  const when = snap.startedAt
    ? `${formatDateLong(snap.startedAt)} at ${formatTime(snap.startedAt)}`
    : 'earlier';
  return `
    <div class="stale-card" id="stale-session-card" role="region" aria-label="Unfinished workout">
      <div class="stale-card-title">Workout ${snap.selectedWorkout} was left open</div>
      <div class="stale-card-sub">You started it ${when} and never tapped Done. Did you do it?</div>
      <div class="btn-row stale-card-row">
        <button class="btn btn-primary" id="stale-finished" type="button">Yes, I did it</button>
        <button class="btn" id="stale-discard" type="button">No, throw it away</button>
      </div>
      <button class="quit-link stale-card-continue" id="stale-continue" type="button">Keep going where I left off</button>
    </div>
  `;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Week dots (group 2J): one entry per weekday. Color is the workout letter.
type WeekDotInfo = {
  letter: string;
  logId: string | null;
  date: Date;
  workout: AnyWorkoutId | null;
};

// (v48 · P6, Sep 24 2026: swungOutOfWeek() retired — its one reader, the
// "Sat counted for last week" note on the Week-by-week summary, is gone; home's
// week line names the swing in words.)

// WK2 fix r1 (Sep 27 2026, must #2): the offset-based dots every existing
// caller reads, factored out so lastClosedWeekForPeek's legacy fallback below
// can ask for a FIXED Saturday instead of "however many weeks back from
// whatever today is" (see weekDotsForSaturday's own comment for why that
// distinction matters).
function weekDotsForSaturday(
  saturday: Date,
  withSwingSaturday = false,
  attributed = false
): WeekDotInfo[] {
  const logs = loadLogs();
  // Allison's week = Sat..Fri (Shabbat-anchored). See memory
  // `reference_week_definition.md`. Saturday is index 0; Friday is index 6.
  const dotLabels = ['S', 'S', 'M', 'T', 'W', 'T', 'F'];
  // Her idea (Sep 26): "show 8 days … like two Saturday" — on a swing Saturday
  // the week gets its 8th day, tonight, and only sessions that COUNT for that
  // week get a dot (the first Saturday's session may have swung to the week
  // before it).
  if (withSwingSaturday) dotLabels.push('S');
  const attribution = withSwingSaturday || attributed ? attributeSessionsToWeeks(logs) : null;

  return dotLabels.map((label, i) => {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    const hit = logs.find((l) => {
      const t = new Date(l.date).getTime();
      if (attribution && attribution.get(l) !== saturday.getTime()) return false;
      return t >= start.getTime() && t <= end.getTime();
    });
    return {
      letter: label,
      logId: hit?.id ?? null,
      date: d,
      workout: hit?.workout ?? null,
    };
  });
}

function getWeekDots(offset = 0, withSwingSaturday = false, attributed = false): WeekDotInfo[] {
  return weekDotsForSaturday(saturdayForOffset(offset), withSwingSaturday, attributed);
}

// WK2 (Sep 27 2026): factored out of renderHome's pre-launch branch so the
// "‹ Week 4" peek (§8c amendment) can reuse the exact same OLD-model dots
// when there's no COMPLETION-model week closed yet to peek at (see
// lastClosedWeekForPeek below) — the very first time she'd ever tap it.
function renderLegacyWeekDots(weekDots: WeekDotInfo[]): string {
  return weekDots
    .map((d) => {
      const isToday = localIsoDate(d.date) === localIsoDate(new Date());
      const cls =
        (d.workout ? `dot dot-${d.workout}` : 'dot dot-empty') + (isToday ? ' is-today' : '');
      const clickAttr = d.logId ? `data-detail="${escapeHtml(d.logId)}"` : '';
      return `
        <button class="week-dot ${cls}" ${clickAttr} type="button" ${d.logId ? '' : 'tabindex="-1"'} aria-label="${d.letter} ${formatDate(d.date.toISOString())}${d.workout ? ` workout ${d.workout}` : ' no workout'}">
          <span class="week-dot-label">${d.letter}</span>
          <span class="week-dot-bubble">${d.workout ?? ''}</span>
        </button>
      `;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// THE COMPLETION-BASED WEEK MODEL (WK2, Sep 27 2026) — week.ts, wired in.
// PLAN-2026-09-26.md §2: "once all three are done then it can go to the next
// week" (her 21:28), amended 23:14-23:16 to anchor a week's start to a
// Saturday/Sunday. WK1 built week.ts as a pure, tested module; this is the
// UI seam (Home, pre-log, post-log only — WK2's scope). Everything BEFORE
// COMPLETION_WEEKS_FROM keeps reading through attributeSessionsToWeeks /
// homeWeekOffset exactly as it always has (untouched, on purpose — the
// weekly-review pager, Progress weeks, Settings and the saved-session plan
// lookup are WK4's job, not this one's). "Now" is always after the launch
// instant (2026-09-26T22:30, already past), so Home/pre-log/post-log — which
// only ever show the CURRENT moment — read the new model exclusively.
// ---------------------------------------------------------------------------

/** The move (if any) she made TODAY — drives §2.4's moved-note under the
 * header. Date-driven on purpose: the note (and its Undo) stops appearing
 * once local midnight passes, with no timer to leak or clear. */
function todaysWeekMove(): StoredWeekMove | null {
  const today = localIsoDate(new Date());
  // WK3 fix r1: a pending Undo tombstone is not "today's move" — it's the
  // opposite (a move being un-done). Skipping it here means the moved-note +
  // its own Undo button both disappear the instant she taps Undo, not just
  // once the real DELETE eventually confirms.
  return loadWeekMoves().find((m) => !m.deleted && localIsoDate(new Date(m.at)) === today) ?? null;
}

/** What "‹ Week 4" (§8c amendment) peeks at: a plain weekNum + rendered dots
 * + count line, from WHICHEVER model actually closed that week. */
type WeekPeek = { weekNum: number; dotsHtml: string; countText: string };

/** The legacy calendar/swing model's own last completed week — always Week 4
 * (the fixed instant above), never "whatever today happens to be minus a
 * week". See LEGACY_LAST_CLOSED_WEEK_INSTANT's own comment. */
function legacyLastClosedWeekPeek(): WeekPeek | null {
  const legacyWeek = getProgramWeek(LEGACY_LAST_CLOSED_WEEK_INSTANT);
  // A break/sick week isn't a "Week N" worth peeking at this way — Sessions/
  // Progress (WK4) are where those already live.
  if (legacyWeek.skippedLabel) return null;
  const logs = loadLogs();
  const attribution = attributeSessionsToWeeks(logs);
  const legacyCount = sessionsAttributedTo(logs, legacyWeek.start, attribution).length;
  return {
    weekNum: legacyWeek.num,
    dotsHtml: renderLegacyWeekDots(weekDotsForSaturday(legacyWeek.start, true, true)),
    countText: `${legacyCount} of 3${legacyCount >= SESSIONS_PER_WEEK_TARGET ? ' ✓' : ''}`,
  };
}

/** The most recently CLOSED week to peek at — the completion model's own
 * last closed span once one exists, OR (the very first time she'd ever tap
 * this — her literal ask, 23:08, was made on exactly this state: Week 5 just
 * opened, nothing of Week 5's has closed yet) the OLD calendar/swing model's
 * last completed week, i.e. Week 4, closed the night before the real launch.
 * That fallback only ever matters until the FIRST new week closes; after
 * that, spans is never empty again and this always reads the new model. */
function lastClosedWeekForPeek(): WeekPeek | null {
  const model = weekModel();
  const { spans } = model;
  const lastSpan = spans.length ? (spans[spans.length - 1] ?? null) : null;
  if (lastSpan) {
    const dLogs = loadLogs().filter((l) => l.workout === 'D');
    // v61 fix pass 3 (Oct 2 2026, CHECK-v61.md round 3 must #1): the peek's
    // own dot strip now shares `lastSpan`'s exact window with the count
    // line below it — see completionWeekDots' own header.
    const lastSpanTarget: DWeekTarget = { kind: 'span', key: lastSpan.key };
    const lastSpanWindow = weekWindowFor(lastSpanTarget, model);
    return {
      weekNum: lastSpan.key.week,
      dotsHtml: renderCompletionWeekDots(completionWeekDots(lastSpan, dLogs, lastSpanWindow)),
      countText: weekCountLine({ span: lastSpan }, weekHasDFor({ span: lastSpan }, model, dLogs)),
    };
  }
  return legacyLastClosedWeekPeek();
}

/** The {kind:'open'|'pending'} target for whichever week is LIVE right now
 * (never a specific past span — that's always `{span: ...}` at its own call
 * site) — `shown.span` set means an open week exists; `shown.pending` set
 * (mid-gap, nothing open yet) means the pending week itself owns any D from
 * its own anchor forward (week-d.ts's whole point — see its header). Both
 * null (the "shouldn't happen" launch-fallback week.ts's own comment names)
 * falls through to `weekHasDFor(null, ...)` → false, same as always. */

type CompletionWeekDot =
  | {
      kind: 'day';
      date: Date;
      workout: AnyWorkoutId | null;
      logId: string | null;
      isToday: boolean;
      // WK2 fix r1 (Sep 27 2026, checker's should #4): how many sessions
      // landed on this day — 1 in the ordinary case, 2+ on a repeat day (a
      // Lite make-up, or "log what I did" logged after the fact alongside a
      // same-day session). `workout`/`logId` still name the FIRST one
      // chronologically (unchanged tap target); this is only the honest count.
      sessionCount: number;
      // v61 (Sep 28 2026), spec item b: "the week strip shows a D dot on the
      // day D was done — distinct from the A/B/C dot" (the v54 spec asked for
      // it; it wasn't showing — week.ts drops D from `span.sessions` on
      // purpose, so this reads the raw D logs given to completionWeekDots
      // separately, never from `span` itself).
      hasD: boolean;
      dLogId: string | null;
    }
  | { kind: 'fold' };

/** One column per day since the shown week opened (§2.4's week strip,
 * generalised for the Sat/Sun-anchor amendment — her own "show 8 days" ask
 * becomes "exactly as long as the week"). WK2 fix r1 (Sep 27 2026, checker's
 * should #4): a week running past 10 days used to just CUT the earliest
 * columns — including session days, which could make the count read "1 of 3"
 * with no dot anywhere to back it up. Now it keeps every day that has a
 * session PLUS the most recent 7 days, and folds any empty run in between
 * into a single "…" column (§2.4's original shape) instead of dropping real
 * session days silently.
 *
 * `window` (Oct 2 2026, v61 fix pass 3, CHECK-v61.md round 3 must #1, fix
 * (b)): the SAME `[start, end)` week-d.ts's `weekHasD`/`weekCountLine` use
 * for the "N of 4" count — passed by the caller (built via `weekWindowFor`
 * from whichever `DWeekTarget` this span is) rather than recomputed from
 * `span.openedAt` alone, so the dot strip can never disagree with the count
 * about which week a D belongs to. Two things changed because of it:
 *   - a D only lights up a day's dot when it falls INSIDE this window, not
 *     merely on the same calendar day — a Sat/Sun close can put two weeks'
 *     own columns on the exact same calendar day (see week-d.ts's header),
 *     and only one of them owns any given D.
 *   - for a CLOSED span (`window.end` non-null), the strip stops at the
 *     window's own end day, not "today" — it used to keep running past the
 *     week's own close and pick up days that already belong to the NEXT
 *     week. An OPEN/PENDING span's window is unbounded (`end: null`), so
 *     those still run to today exactly as before. */
function completionWeekDots(
  span: WeekSpan,
  dLogs: readonly LogEntry[] = [],
  window: { start: number; end: number | null } | null = null
): CompletionWeekDot[] {
  const win = window ?? { start: new Date(span.openedAt).getTime(), end: null };
  const toMidnight = (ms: number): Date => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const openedMid = toMidnight(win.start);
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // A closed span's strip never runs past its own window's end day. `end`
  // is exclusive, but it is NOT always midnight-aligned — a Sat/Sun close's
  // own prev-close clamp (weekWindowFor's own header) can leave `end` sitting
  // at the close's own mid-day instant (e.g. Saturday 12:00), not that day's
  // midnight. That calendar day still belongs PARTLY to this window (00:00
  // up to the close), so it has to stay a real column — only drop it
  // entirely when `end` lands exactly ON that day's own midnight (the
  // ordinary anchor-floored case, where the day truly has nothing before
  // the next week starts).
  const lastDayMid =
    win.end === null
      ? todayMid
      : (() => {
          const endMid = toMidnight(win.end);
          const endIsExactlyMidnight = endMid.getTime() === win.end;
          const candidate = endIsExactlyMidnight
            ? (() => {
                const d = new Date(endMid);
                d.setDate(d.getDate() - 1);
                return d;
              })()
            : endMid;
          return candidate.getTime() < todayMid.getTime() ? candidate : todayMid;
        })();
  const totalDays = Math.max(
    1,
    Math.round((lastDayMid.getTime() - openedMid.getTime()) / 86_400_000) + 1
  );

  const inWindow = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return t >= win.start && (win.end === null || t < win.end);
  };

  const dayCol = (i: number): { i: number; col: CompletionWeekDot; hasSession: boolean } => {
    const d = new Date(openedMid);
    d.setDate(d.getDate() + i);
    const sameDay = (iso: string): boolean => {
      const sd = new Date(iso);
      return (
        sd.getFullYear() === d.getFullYear() &&
        sd.getMonth() === d.getMonth() &&
        sd.getDate() === d.getDate()
      );
    };
    const hits = span.sessions.filter((s) => sameDay(s.date));
    const dHits = dLogs.filter((l) => sameDay(l.date) && inWindow(l.date));
    const first = hits[0];
    return {
      i,
      hasSession: hits.length > 0 || dHits.length > 0,
      col: {
        kind: 'day',
        date: d,
        workout: first?.workout ?? null,
        logId: first?.id ?? null,
        isToday: d.getTime() === todayMid.getTime(),
        sessionCount: hits.length,
        hasD: dHits.length > 0,
        dLogId: dHits[0]?.id ?? null,
      },
    };
  };

  if (totalDays <= 10) {
    const cols: CompletionWeekDot[] = [];
    for (let i = 0; i < totalDays; i++) cols.push(dayCol(i).col);
    return cols;
  }

  const keepFromIdx = totalDays - 7; // the most recent 7 days are always kept
  const cols: CompletionWeekDot[] = [];
  let pendingFold = false;
  for (let i = 0; i < totalDays; i++) {
    const day = dayCol(i);
    if (day.hasSession || i >= keepFromIdx) {
      if (pendingFold) {
        cols.push({ kind: 'fold' });
        pendingFold = false;
      }
      cols.push(day.col);
    } else {
      pendingFold = true;
    }
  }
  return cols;
}

const COMPLETION_DOT_WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function renderCompletionWeekDots(cols: CompletionWeekDot[]): string {
  return cols
    .map((c) => {
      if (c.kind === 'fold') {
        // A different class than the real day columns on purpose (never
        // `.week-dot` — every existing `.week-card .week-dot` count assumes
        // one entry per REAL day; a fold marker isn't one).
        return `
        <span class="week-fold-col" aria-hidden="true">
          <span class="week-dot-label">…</span>
        </span>
      `;
      }
      const letter = COMPLETION_DOT_WEEKDAY_LETTERS[c.date.getDay()];
      const cls =
        (c.workout ? `dot dot-${c.workout}` : 'dot dot-empty') + (c.isToday ? ' is-today' : '');
      const clickAttr = c.logId ? `data-detail="${escapeHtml(c.logId)}"` : '';
      // WK2 fix r1 (should #4): a small "2" badge when a second session landed
      // the same day — an honest count, not a second tap target.
      const countBadge =
        c.sessionCount >= 2
          ? `<span class="week-dot-count" aria-hidden="true">${c.sessionCount}</span>`
          : '';
      // v61 (Sep 28 2026), spec item b: a small D dot, distinct from the
      // A/B/C bubble above it — the v54 spec asked for this and it never
      // rendered (week.ts drops D from `span.sessions`, the only thing this
      // function used to read).
      const dDot = c.hasD
        ? `<span class="week-dot-d" data-detail-d="${c.dLogId ? escapeHtml(c.dLogId) : ''}" aria-hidden="true">D</span>`
        : '';
      return `
        <button class="week-dot ${cls}" ${clickAttr} type="button" ${c.logId ? '' : 'tabindex="-1"'} aria-label="${letter} ${formatDate(c.date.toISOString())}${c.workout ? ` workout ${c.workout}` : ' no workout'}${c.sessionCount >= 2 ? `, ${c.sessionCount} sessions` : ''}${c.hasD ? ', plus Workout D' : ''}">
          <span class="week-dot-label">${letter}</span>
          <span class="week-dot-bubble">${c.workout ?? ''}</span>
          ${countBadge}
          ${dDot}
        </button>
      `;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// HOME (v48 · P4, Sep 24 2026). Her words today: "look at home ux ui and make
// it better i feel like its a bit all over the place". DECISIONS-v48 §1 Q1-Q3,
// §2 #1-2 #8, §5 Home rows. One next action (the "Up next" hero — the only
// sage on the screen), B/C one chip away, ONE honest week line, a one-row walk,
// two quiet doors. Home used to be 14,025 px expanded with five doors to the
// same 39 rows (uxui home 4/5); everything that left is one tap from where it
// now lives (Weekly review › Week by week, Settings › Gear, Progress › Program).
// ---------------------------------------------------------------------------

// The header's one line: the week she's in. When the loaded plan is a
// different week (e.g. mid-round, before that week's row is encoded), say so
// — fail-loud (ux.md #10: the banner said Week 5 while pre-log said Week 4).
// R2W5 shipped Sep 26 2026, so this no longer fires on a plain Saturday — only
// on a genuinely un-encoded week, or (via preLaunchPlanDate) a swing Saturday whose
// NEXT week exists but hasn't been approved yet. Returns HTML: the plan note
// is a smaller span so the title stays on one line.
// WK2 (Sep 27 2026), §2.4 "Home header": plain "Week N" — no "Round 2 ·" (it
// moves to Sessions/Progress/Settings, WK4's job) and no "· Week N's plan"
// fail-loud suffix (a repeat now gets its own quiet second line, see
// weekSubLabel/planForWeekKey below — the title itself never lies about which
// week she's in, which was her whole complaint: 21:32 "it says week 5 on top
// … I'm in week 4").
// WK2 fix r1 (Sep 27 2026, checker's should #5): this used to return the
// PEEKED week's number while "‹ Week 4" was open, while the Up-next hero and
// the chips right underneath kept offering the LIVE week's workout — the same
// "says week X on top" mismatch her 21:32 words named, just re-created by the
// peek feature itself (shot 04). The page title is what she reads as "the
// week I'm in"; a peek is a read-only LOOK at a past week, so it changes only
// the week CARD's own head (renderHome's weekCardHeadText), never this H1.
function homeWeekTitle(): string {
  if (!isNowAfterCompletionLaunch()) {
    // Pre-launch (or a test mocking an earlier date): the original calendar
    // + swing logic, byte-for-byte, so every existing mockDate() test before
    // Sep 26 2026 22:30 still sees exactly what it always has.
    const week = homeWeekOffset() === 1 ? getViewedProgramWeek(1) : getProgramWeek();
    if (week.skippedLabel) return `${week.skippedLabel} week`;
    const title = `${week.round > 1 ? `Round ${week.round} · ` : ''}Week ${week.num}`;
    const plan = getWeekPlan();
    const planRound = plan.round ?? 1;
    if (plan.weekNum === week.num && planRound === week.round) return title;
    const planName = `${planRound !== week.round && planRound > 1 ? `R${planRound} · ` : ''}Week ${plan.weekNum}`;
    return `${title}<span class="h1-plan"> · ${planName}'s plan</span>`;
  }
  return `Week ${shownWeek().key.week}`;
}

// "v48 · Sep 24 · 21:40" — the year stays in Settings › About (DECISIONS Q1:
// her Jul 1 rule "put time stamp too … across all apps", on one line).
function homeVersionTag(): string {
  return `${APP_VERSION} · ${BUILD_DATE.replace(/,\s*\d{4}/, '')}`;
}

// The hero's cardio line: the lane she used last time + this workout's minutes
// (walk-in-her-shoes: "A says 'cardio optional' → 'Today: elliptical 10 min'").
function heroCardioLine(w: Workout): string {
  const step = w.warmup.find((e) => e.name === 'Outdoor walk');
  if (!step) return '';
  const minutes = walkStepMinutes(step);
  const lane = lastCardioLane();
  return lane ? `Cardio: ${lane} ${minutes} min` : `Cardio: ${minutes} min, your pick`;
}

// v55 (Sep 27 2026) — her words: "exercise B has a lot of upper body, is it
// only glutes?" (Sep 27 20:30). The old label was just the workout's first
// word ("Glutes"), which undersold the upper-back block A and B BOTH carry
// (UPPER_BACK_W7 etc.) — a fixed short label per letter instead, so the chip
// itself says what's really in there.
const WORKOUT_SHORT_LABEL: Record<AnyWorkoutId, string> = {
  A: 'Lower + back',
  B: 'Glutes + back',
  C: 'Cardio',
  D: 'Cardio 30', // matches renderWorkoutDChip's own hardcoded "D · Cardio 30"
};

// "B · Glutes + back" — the letter and its fixed short label.
function workoutChipLabel(w: Workout): string {
  return `${w.id} · ${WORKOUT_SHORT_LABEL[w.id]}`;
}

function renderWorkoutChips(exclude: WorkoutId | null, lead = 'or do'): string {
  return renderWorkoutChipsFor(
    (['A', 'B', 'C'] as WorkoutId[]).filter((id) => id !== exclude),
    lead
  );
}

// WK2 (Sep 27 2026), §2.4 "the chips = the OTHER MISSING letters" — an
// explicit id list, not an exclude-one-letter filter: with 2 of 3 already
// done, the chips must show NOTHING (not re-offer an already-done letter),
// which renderWorkoutChips(exclude) can't express. Empty list = no row at
// all, not an empty lead.
function renderWorkoutChipsFor(ids: WorkoutId[], lead = 'or do'): string {
  if (ids.length === 0) return '';
  const chips = ids
    .map((id) => {
      const w = getWorkoutById(id);
      return `<button class="btn-chip home-chip" data-workout="${id}" type="button" aria-label="Start Workout ${id} · ${escapeHtml(w.name)}">${escapeHtml(workoutChipLabel(w))}</button>`;
    })
    .join('');
  return `<div class="home-chips"><span class="home-chips-lead">${escapeHtml(lead)}</span>${chips}</div>`;
}

// v54 (Sep 27 2026) — Workout D's own chip, "D · Cardio 30". Deliberately
// separate from renderWorkoutChipsFor: that function's ids are always the
// week's still-MISSING A/B/C letters (it goes empty once all three are
// done) — D is never missing, never done, never counted toward the week's
// "3 of 3", and never excluded from the row the way a just-completed A/B/C
// letter is. It's extra, every day, including a day she's already done
// another workout on (her words: "it can also be if it needs to be"). A
// small standalone row under the real chips, not folded into their "or do"
// lead, so it never reads as a 4th thing still owed this week.
// v61 (Sep 28 2026), spec item a — her words looking at her first D: "D
// should be gone now cuz I just did it... have an option of two, cuz I
// might do two in one day." The spec's own literal ask is "disabled, not
// offered again that day" (implemented here exactly) — flagged as an open
// tension with the SAME sentence's "option of two" (a disabled chip is,
// today, the only door to D on Home): worth asking her which she actually
// wants before this goes further, not silently resolved either way.
function renderWorkoutDChip(dDoneToday: boolean): string {
  const w = getWorkoutD();
  // v54 fix (Sep 27 2026): deliberately NOT .home-chips/.home-chip — those
  // classes are what dozens of existing tests (and §2.4's own spec) use to
  // count "the other missing A/B/C letters"; reusing them here made D read
  // as a 4th missing letter to every one of those locators. Its own classes,
  // same visual weight via their own CSS.
  if (dDoneToday) {
    return `
      <div class="home-chips-d">
        <button class="btn-chip home-chip-d home-chip-d-done" type="button" disabled aria-label="Workout D already done today">D ✓ today</button>
      </div>`;
  }
  return `
    <div class="home-chips-d">
      <button class="btn-chip home-chip-d" data-workout="D" type="button" aria-label="Start Workout D · ${escapeHtml(w.name)}">D · Cardio 30</button>
    </div>`;
}

// v63 item 4 (Oct 19 2026): the card stays ONE Start button; a separate quiet link under it opens a sheet that
// lists the workout's moves (screens/movesheet.ts binds [data-preview-list]); a name there opens the move preview.
function renderPreviewLink(id: WorkoutId): string {
  return `<button class="preview-link" id="home-preview-moves" type="button" data-preview-list="${id}">👁 Preview the moves</button>`;
}

// The "Up next" hero — the ONE sage thing on home. The whole card is the tap
// target (→ pre-log), so Home → working out stays 2 taps (guide §1).
function renderUpNextHero(id: WorkoutId): string {
  const w = getWorkoutById(id);
  const fresh = tonightNames(w, id, 'new');
  // v48 · fix r1: moves she's done before (Round 1) come back — named as such.
  const back = tonightNames(w, id, 'back');
  const cardio = heroCardioLine(w);
  const rounds = `${w.rounds} round${w.rounds === 1 ? '' : 's'}`;
  return `
    <button class="workout-card workout-card-pick home-hero" data-workout="${id}" type="button">
      <span class="hero-label">Up next</span>
      <span class="hero-title">Workout ${id}</span>
      <span class="hero-line">${escapeHtml(`${WORKOUT_SHORT_LABEL[id]} · ${rounds} · ${workoutMinutesLabel(w)}`)}</span>
      ${fresh.length ? `<span class="hero-line hero-new">New tonight: ${escapeHtml(fresh.join(' · '))}</span>` : ''}
      ${back.length ? `<span class="hero-line hero-back">Again tonight: ${escapeHtml(back.join(' · '))}</span>` : ''}
      ${cardio ? `<span class="hero-line">${escapeHtml(cardio)}</span>` : ''}
      <span class="hero-start" aria-hidden="true">Start</span>
    </button>`;
}

// After Save, until midnight: the win is witnessed instead of the next workout
// lighting up minutes later (uxui post-log 4/5). Not sage — nothing to do here.
// WK2 (Sep 27 2026): `weekLines` replaces the old single weekCount/weekLabel
// pair — the completion model's closing save needs TWO lines ("Week 5 done ·
// 3 of 3 ✓" then "Week 6 starts now", §2.4's Done card spec), not one.
function renderDoneTodayCard(log: LogEntry, weekLines: string[]): string {
  const lastDone = loadLastDone();
  const firsts = lastDone && lastDone.id === log.id ? lastDone.firsts : [];
  const km =
    typeof log.ellipticalKm === 'number' && log.ellipticalKm > 0 ? `${log.ellipticalKm} km` : '';
  // v61 fix pass 3 (Oct 2 2026, CHECK-v61.md round 3 nice): on a D (ride)
  // session, `rideLine` below already shows this same km as part of its own
  // "30 min · 2.2 km · … · L3" line — the plain "Elliptical · 2.2 km"
  // fallback used to repeat it right underneath. Skip the fallback for D;
  // the "Firsts: first elliptical ride · 2.2 km" line (her actual first-ever
  // ride) is untouched, that's a different, intentional km mention.
  const firstsLine = firsts.length
    ? `Firsts: ${[...firsts, ...(km ? [km] : [])].join(' · ')}`
    : km && log.workout !== 'D'
      ? `Elliptical · ${km}`
      : '';
  // v48 · fix r1 (Sep 24 2026): returning moves get their own honest word —
  // "Back: 1 kg biceps curl · prone row (bodyweight)" — never "Firsts".
  const back = lastDone && lastDone.id === log.id ? (lastDone.back ?? []) : [];
  // v48 · final (Sep 25 2026): "Back:" for returning moves sat one screen after
  // her back-pain check ("Back: Fine") and read like a pain report. "Again".
  const backLine = back.length ? `Again: ${back.join(' · ')}` : '';
  // v53 (Sep 26 2026): tappable, same door as a Sessions row or a week dot —
  // opens today's own Session screen, where Edit lives (her ask: "there have
  // to be an easy way to enter the data"). A div (like open-weekly-review
  // below it), so it needs its own keydown for Enter/Space — see attachHandlers.
  const detailAttrs = log.id
    ? ` data-detail="${escapeHtml(log.id)}" role="button" tabindex="0" aria-label="Open today's session"`
    : '';
  const weekLinesHtml = weekLines
    .map((l) => `<div class="home-done-line">${escapeHtml(l)}</div>`)
    .join('');
  // v55 (Sep 27 2026) — CHECK N3: the D Done card read flat (just the title +
  // "0 of 3 in Week 5 · A, B and C left", no ride data at all). A real ride
  // line — same numbers the rides page shows — same as firstsLine's km above.
  const rideMin = (() => {
    const s = rideTimeSec(log);
    return s !== null ? Math.round(s / 60) : null;
  })();
  const rideLine =
    log.workout === 'D'
      ? [
          rideMin !== null ? `${rideMin} min` : '',
          rideKm(log) !== null ? `${rideKm(log)} km` : '',
          typeof log.ellipticalKcal === 'number' ? `${log.ellipticalKcal} kcal` : '',
          rideLevel(log) !== null ? `L${rideLevel(log)}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  return `
    <div class="card home-done-card" id="home-done-card"${detailAttrs}>
      <div class="home-done-title">Done ✓ · Workout ${log.workout}</div>
      ${weekLinesHtml}
      ${rideLine ? `<div class="home-done-ride" dir="auto">${escapeHtml(rideLine)}</div>` : ''}
      ${firstsLine ? `<div class="home-done-firsts" dir="auto">${escapeHtml(firstsLine)}</div>` : ''}
      ${backLine ? `<div class="home-done-back" dir="auto">${escapeHtml(backLine)}</div>` : ''}
    </div>`;
}

// WK2 (Sep 27 2026), §2.4 Done card + post-log's missing-letters phrasing:
// "B and C left" / "C left" / "" (nothing missing). Shared by weekCountLine
// and the Done-card lines below so the join rule (comma + "and") lives once.
// v64 (Q2): "After the sick week · Week 6 opens with whichever you do first". '' when the
// week before was not a held (Sick / Break) one.
function afterBreakLine(weekNum: number, held: string | null): string {
  if (held === null) return '';
  const words = held === 'Break' ? 'the break' : `the ${held.toLowerCase()} week`;
  return `<div class="week-after-break" id="week-after-break">After ${words} · Week ${weekNum} opens with whichever you do first</div>`;
}

function joinMissingLetters(missing: readonly string[]): string {
  if (missing.length === 0) return '';
  if (missing.length === 1) return missing[0] as string;
  return `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
}

export function renderHome(): string {
  const logs = loadLogs();
  // v51 · cycle page §3: a conditional door, first in the list, only in the
  // ~20-day-a-month window around a predicted start — never logs anything
  // itself (a mis-tap on Home must not write a period start; the sage
  // button waits on the page).
  const homeCycleDoorRow =
    periodLogUrgency(cyclePeriodsForLogic(), localIsoDate(new Date())) === 'primary'
      ? `<button class="door-row" id="home-open-cycle" type="button">
           <span>🌙 Period started?</span><span class="door-chev" aria-hidden="true">›</span>
         </button>`
      : '';
  // Newest by DATE (writeLogs keeps unsynced rows first, not newest first).
  const lastLog = [...logs].sort((a, b) => b.date.localeCompare(a.date))[0];
  const doneToday =
    lastLog && localIsoDate(new Date(lastLog.date)) === localIsoDate(new Date()) ? lastLog : null;
  // v61 (Sep 28 2026), spec item a: independent of `doneToday` (the LATEST
  // log, whichever workout) — she can do D and then A the same day (her own
  // words: "have an option of two"), so this asks the whole day's logs, not
  // just the most recent one.
  const todayIso = localIsoDate(new Date());
  const dDoneToday = logs.some(
    (l) => l.workout === 'D' && localIsoDate(new Date(l.date)) === todayIso
  );
  const weekWalks = walksThisWeek();
  const walkStartedAt = activeWalkStart();

  // WK2 (Sep 27 2026): everything week-shaped branches ONCE, here, on
  // whether "now" is at/after the real completion-model launch (see
  // isNowAfterCompletionLaunch's own comment — pre-launch keeps the
  // original calendar+swing model byte-for-byte, still exercised by dozens
  // of mockDate() tests). Both branches fill the SAME handful of variables
  // the template below reads, so the markup itself never forks.
  let pick: WorkoutId;
  let subLineHtml: string;
  let weekCardHeadText: string;
  let dotsHtml: string;
  let weekLineText: string;
  let saturdayNote: string;
  let doneCardLines: string[];
  let chipsHtml: string;
  let weekNavLinkHtml: string;
  // WK3 (Sep 27 2026): the "Move on without it" button + its moved-note
  // (§2.4). Both stay '' pre-launch — the old calendar model has no
  // completion week to move on FROM.
  let moveOnHtml = '';
  let movedNoteHtml = '';
  // v64 (Oct 20 2026, her Q2 via "just go"): after a Sick/Break week, ONE quiet line on
  // the week card - the fresh start named, no empty-circle judging. '' otherwise.
  let afterBreakHtml = '';

  if (!isNowAfterCompletionLaunch()) {
    // ---- PRE-LAUNCH: the original calendar + Saturday-swing model, untouched ----
    // Sep 26 2026: on a swing Saturday home shows LAST week (see homeWeekOffset) —
    // its number, its 8 days (Sat → tonight), its count.
    const homeOffset = homeWeekOffset();
    const week = homeOffset === 1 ? getViewedProgramWeek(1) : getProgramWeek();
    const weekRange = formatWeekRange(week.start, homeOffset === 1 ? new Date() : week.end);
    const weekCount = getWeekCount(homeOffset);
    pick = getTodaysPick();
    const weekDots = getWeekDots(homeOffset, homeOffset === 1, true);

    // DECISIONS Q2 — the Saturday swing in WORDS, every day (not only on
    // Saturdays): "0 of 3 this week · Sat's C went to Week 3 · 39 total".
    const thisSaturday = saturdayForOffset(0);
    const attribution = attributeSessionsToWeeks(logs);
    const swungLogs = logs
      .filter(
        (l) =>
          calendarSaturdayMs(l.date) === thisSaturday.getTime() &&
          attribution.get(l) !== thisSaturday.getTime()
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    const lastWeek = getViewedProgramWeek(1);
    const lastWeekCount = getWeekCount(1);
    const lastWeekTitle = lastWeek.skippedLabel
      ? `the ${lastWeek.skippedLabel.toLowerCase()} week`
      : `Week ${lastWeek.num}`;
    const swingWords =
      swungLogs.length > 0
        ? ` · Sat's ${swungLogs.map((l) => l.workout).join(' + ')} went to ${lastWeekTitle}`
        : '';
    const swingMissing =
      homeOffset === 1
        ? (['A', 'B', 'C'] as const).filter(
            (w) =>
              !sessionsAttributedTo(logs, saturdayForOffset(1), attribution).some(
                (l) => l.workout === w
              )
          )
        : [];
    weekLineText =
      homeOffset === 1
        ? `${weekCount} of 3 · ${swingMissing.join(' + ')} left — tonight counts for Week ${week.num}`
        : `${weekCount} of 3 this week${swingWords}`;
    saturdayNote =
      homeOffset === 0 &&
      new Date().getDay() === 6 &&
      swungLogs.length === 0 &&
      weekCount === 0 &&
      lastWeekCount > 0 &&
      lastWeekCount < SESSIONS_PER_WEEK_TARGET
        ? `<p class="swing-note">Last week's at ${lastWeekCount} — today's session will count for it.</p>`
        : '';
    subLineHtml = '';
    if (homeOffset === 0 && weekCount === 0) {
      afterBreakHtml = afterBreakLine(week.num, getViewedProgramWeek(1).skippedLabel);
    }
    weekCardHeadText = escapeHtml(
      `${homeOffset === 1 ? `Week ${week.num}` : 'This week'} · ${weekRange}`
    );
    dotsHtml = renderLegacyWeekDots(weekDots);
    doneCardLines = doneToday
      ? attribution.get(doneToday) === saturdayForOffset(1).getTime()
        ? [`${getWeekCount(1)} of 3 in Week ${lastWeek.num}`]
        : [`${weekCount} of 3 this week`]
      : [];
    chipsHtml = doneToday
      ? attribution.get(doneToday) !== saturdayForOffset(0).getTime()
        ? renderWorkoutChips(null, `Week ${week.num}`)
        : // v54: type-only guard — this pre-launch branch never actually sees
          // a 'D' row (D didn't exist before the completion-model launch),
          // but renderWorkoutChips' exclude param is WorkoutId-only.
          renderWorkoutChips(doneToday.workout === 'D' ? null : doneToday.workout)
      : renderWorkoutChips(pick);
    weekNavLinkHtml = '';
  } else {
    // ---- WK2: the completion-based week model ----
    const model = weekModel();
    const shown = shownWeek();
    const planInfo = planForWeekKey(shown.key);
    const peek = ui.viewingLastClosedWeek ? lastClosedWeekForPeek() : null;

    pick = shown.span ? (shown.span.missing[0] as WorkoutId) : 'A';
    // v61 (Sep 28 2026), spec item d/b: D logs, read once for both the week
    // strip's own dot (completionWeekDots) and the "of 4" counting below —
    // week.ts drops D from its model entirely (its own header comment), so
    // both readers go straight to the raw logs instead.
    const dLogs = logs.filter((l) => l.workout === 'D');

    if (peek) {
      // Peeking at "‹ Week N" — a read-only look, so no "since/opens" or
      // repeat sub-line (those describe the LIVE week, not a closed one).
      subLineHtml = '';
      weekCardHeadText = escapeHtml(`Week ${peek.weekNum}`);
      dotsHtml = peek.dotsHtml;
      weekLineText = peek.countText;
    } else {
      subLineHtml =
        `<div class="week-sub-line" id="week-sub">${escapeHtml(weekSubLabel(shown))}</div>` +
        (planInfo.noPlanForRound !== null
          ? // v62.1: a round with no plan rows yet - say so (fail loud), not "same moves"
            `<div class="week-sub-line week-sub-noplan" id="no-plan-note">${escapeHtml(noPlanLine(planInfo.noPlanForRound))}</div>`
          : planInfo.repeatsWeek !== null
            ? `<div class="week-sub-line week-sub-repeat">Same moves as Week ${planInfo.repeatsWeek}</div>`
            : '');
      weekCardHeadText = escapeHtml(`Week ${shown.key.week}`);
      // v61 fix pass 2 (Oct 2 2026, CHECK-v61.md round 2 must #1, repro 1):
      // mid-gap, with nothing of A/B/C logged yet, `shown.span` is null — no
      // real WeekSpan exists to hand completionWeekDots a day-range from.
      // But a D CAN already belong to the pending week (week-d.ts's own
      // point — see its header): once one does, show the same day-strip a
      // real span would, built from the pending week's own anchor day, so
      // her D dot still has somewhere to land instead of waiting for A/B/C
      // to open the week before it can render at all.
      const pendingHasD =
        !shown.span && shown.pending ? weekHasDFor({ pending: true }, model, dLogs) : false;
      // v61 fix pass 3 (Oct 2 2026, CHECK-v61.md round 3 must #1): the live
      // strip (open or pending) shares its window with the "N of 4" count
      // below — see completionWeekDots' own header. Both are unbounded
      // (`end: null`), so the strip still runs to today exactly as before;
      // only the per-day D attribution changes.
      dotsHtml = shown.span
        ? renderCompletionWeekDots(
            completionWeekDots(shown.span, dLogs, weekWindowFor({ kind: 'open' }, model))
          )
        : pendingHasD && shown.pending
          ? renderCompletionWeekDots(
              completionWeekDots(
                {
                  key: shown.pending.key,
                  openedAt: shown.pending.opensAt,
                  closedAt: null,
                  how: null,
                  sessions: [],
                  done: [],
                  missing: ['A', 'B', 'C'],
                },
                dLogs,
                weekWindowFor({ kind: 'pending' }, model)
              )
            )
          : '';
      const openHasD = weekHasDFor(liveWeekDTarget(shown), model, dLogs);
      weekLineText = weekCountLine(shown, openHasD);
      if (shown.span && shown.span.done.length === 0 && !openHasD) {
        // The week before the one that opened (a calendar week back from its start).
        const before = new Date(shown.span.openedAt);
        before.setDate(before.getDate() - 7);
        afterBreakHtml = afterBreakLine(shown.key.week, getProgramWeek(before).skippedLabel);
      }
    }
    saturdayNote = '';

    // WK3 (Sep 27 2026), §2.4: the quiet "Move on without it" button — only
    // on the LIVE week (never while peeking at a closed one), only when
    // week.ts's own canMoveOn says so (1-2 done, open 8+ days). The app
    // never moves on by itself — this only ever renders a button; the write
    // happens on her explicit tap (moveOnWithoutIt, bound below).
    if (!peek && shown.span && weekCanMoveOn(shown.span, new Date())) {
      moveOnHtml =
        `<button class="week-move-on-btn" id="week-move-on" type="button">` +
        `Move on to Week ${shown.key.week + 1} without ${joinMissingLetters(shown.span.missing)}</button>`;
    }
    // The moved-note is about "today" specifically, independent of whether
    // she's peeking at an older week right now — it stops matching on its
    // own once local midnight passes (todaysWeekMove is date-driven, not a
    // timer, §2.4's "for the rest of that day").
    const todaysMove = todaysWeekMove();
    // WK3 fix r1 (checker nice): a move dated today that week.ts itself
    // ignored (stale, or a 0-done move — see week.ts's move branch) closed
    // NOTHING — showing "Week 99 closed at N of 3 · Undo" for it would be
    // pure fiction. Only show the note when it matches a real 'moved_on'
    // span for that same key.
    const todaysMoveSpan = todaysMove
      ? (model.spans.find(
          (s) =>
            s.how === 'moved_on' &&
            s.key.round === todaysMove.round &&
            s.key.week === todaysMove.week
        ) ?? null)
      : null;
    if (todaysMove && todaysMoveSpan) {
      const doneCount = 3 - todaysMove.missing.length;
      movedNoteHtml =
        `<div class="week-moved-note" id="week-moved-note">Week ${todaysMove.week} closed at ${doneCount} of 3 · ` +
        `<button class="week-undo-btn" id="week-undo" type="button">Undo</button></div>`;
    }

    // Did TODAY'S save close its own week? (its week resolves to a CLOSED
    // span, not the currently open/pending one.)
    const doneTodayWeekKey = doneToday?.id ? (model.weekOf.get(doneToday.id) ?? null) : null;
    let doneTodayClosedSpan = doneTodayWeekKey
      ? (model.spans.find(
          (s) => s.key.round === doneTodayWeekKey.round && s.key.week === doneTodayWeekKey.week
        ) ?? null)
      : null;
    // v61 fix pass 2 (Oct 2 2026, CHECK-v61.md round 2 must #1, repro 3): D
    // is invisible to `weekOf` (week.ts drops it on purpose — her rule,
    // unchanged), so the check above never finds it, even when THIS D's own
    // calendar window (week-d.ts) already belongs to an already-closed
    // week — "C closes then D the same day" fell through to the generic
    // `else` below and read "0 of 4 in Week 6", talking about a week she
    // hasn't reached yet instead of the one this D actually landed in. A D
    // that lands in the OPEN or PENDING week's own window (the ordinary
    // case) still correctly falls through unchanged.
    if (!doneTodayClosedSpan && doneToday?.workout === 'D') {
      const dTarget = weekTargetForD(doneToday.date, model);
      doneTodayClosedSpan =
        dTarget?.kind === 'span'
          ? (model.spans.find(
              (s) => s.key.round === dTarget.key.round && s.key.week === dTarget.key.week
            ) ?? null)
          : null;
    }

    // WK2 fix r1 (Sep 27 2026, checker's nice #1): a session saved BEFORE the
    // real launch instant is invisible to the completion model — week.ts
    // filters it out entirely, so `doneTodayWeekKey`/`doneTodayClosedSpan`
    // are both null for it, same as "nothing closed yet". Checked live: her
    // Sat Sep 26 22:14 B (which closed the OLD model's Week 4) read "0 of 3
    // in Week 5" here between 22:30 and midnight — a week that session never
    // touched. The OLD model's own last-completed-week line is the honest
    // read for a pre-launch doneToday, not the new model's "0 of 3".
    const doneTodayPreLaunch =
      !!doneToday &&
      new Date(doneToday.date).getTime() < new Date(COMPLETION_WEEKS_FROM.at).getTime();

    if (!doneToday) {
      doneCardLines = [];
    } else if (doneTodayPreLaunch) {
      // `homeWeekOffset()`/`getViewedProgramWeek(offset)` are "now"-relative
      // (an OFFSET FROM TODAY) — wrong here, because "now" being past the
      // launch instant says nothing about which OLD-model week doneToday's
      // OWN date actually swung into. Ask attributeSessionsToWeeks directly
      // for the week THAT session was attributed to, whatever "now" is.
      const attribution = attributeSessionsToWeeks(logs);
      const weekMs = attribution.get(doneToday) ?? calendarSaturdayMs(doneToday.date);
      const legacyWeek = getProgramWeek(new Date(weekMs));
      const legacyCount = sessionsAttributedTo(logs, new Date(weekMs), attribution).length;
      // WK2 fix r2 (Sep 27 2026, checker's nice #1): the doneTodayClosedSpan
      // branch below already says "Week N starts now"/"opens ..." — this is
      // the SAME real moment (her Sat Sep 26 B closed the OLD model's Week 4
      // AND opened the new model's Week 5 in the same instant), so it deserves
      // the same second line, not a card that stops at "done".
      const nextLine = shown.span
        ? `Week ${shown.key.week} starts now`
        : shown.pending
          ? `Week ${shown.key.week} opens ${formatWeekdayDate(shown.pending.opensAt)}`
          : '';
      doneCardLines = [
        `Week ${legacyWeek.num} done · ${legacyCount} of 3${legacyCount >= SESSIONS_PER_WEEK_TARGET ? ' ✓' : ''}`,
        ...(nextLine ? [nextLine] : []),
      ];
    } else if (doneTodayClosedSpan) {
      const nextLine = shown.span
        ? `Week ${shown.key.week} starts now`
        : shown.pending
          ? `Week ${shown.key.week} opens ${formatWeekdayDate(shown.pending.opensAt)}`
          : '';
      // v61 (Sep 28 2026), spec item d: A/B/C alone still closes the week
      // (week.ts's own rule, untouched) — but the Done card's own line now
      // says "of 4", and whether D rode inside this closing week too.
      const closedHasD = weekHasDFor({ span: doneTodayClosedSpan }, model, dLogs);
      doneCardLines = [
        `Week ${doneTodayClosedSpan.key.week} done · ${closedHasD ? '4 of 4 ✓' : '3 of 4 · D optional'}`,
        ...(nextLine ? [nextLine] : []),
      ];
    } else {
      const doneAbc = shown.span?.done.length ?? 0;
      const openHasD = weekHasDFor(liveWeekDTarget(shown), model, dLogs);
      const done = doneAbc + (openHasD ? 1 : 0);
      const missing = shown.span?.missing ?? (['A', 'B', 'C'] as const);
      doneCardLines = [
        `${done} of 4 in Week ${shown.key.week}${missing.length ? ` · ${weekLeftWords(missing, openHasD, done)}` : ''}`,
      ];
    }

    // §2.4: "the chips = the other missing letters" — not "the other two
    // letters" (renderWorkoutChips' old exclude-one-letter shape would
    // re-offer an already-done letter once only 1 remains). Her words 21:18
    // "I need b back for 5": once a save CLOSES a week, the next one's chips
    // lead with its number and offer all three instead.
    const missingForChips: WorkoutId[] = shown.span
      ? [...shown.span.missing]
      : (['A', 'B', 'C'] as WorkoutId[]);
    // WK2 fix r2 (Sep 27 2026, checker's should #2): the chip lead used to
    // always name the SHOWN week's number, even mid-gap — where a tap right
    // now would actually count backward as an extra rep into the week that
    // just closed (week.ts rule 3), not open the shown week at all. Lead with
    // gapCountsBackToWeekNum() during a gap, same truth pre-log/post-log
    // already say; outside a gap it's null and this is unchanged.
    const chipsWeekLead = `Week ${gapCountsBackToWeekNum() ?? shown.key.week} ·`;
    chipsHtml = doneToday
      ? doneTodayClosedSpan || doneTodayPreLaunch
        ? renderWorkoutChips(null, chipsWeekLead)
        : renderWorkoutChipsFor(missingForChips) // no letter singled out as hero right now
      : renderWorkoutChipsFor(missingForChips.slice(1)); // pick (missing[0]) is the hero already

    // §8c amendment: "‹ Week 4" / "Week 5 ›" — a plain, visible peek at the
    // last closed week, never touching what a session counts toward or trains.
    const peekTarget = ui.viewingLastClosedWeek ? peek : lastClosedWeekForPeek();
    weekNavLinkHtml = peekTarget
      ? ui.viewingLastClosedWeek
        ? `<button class="week-nav-link" id="week-nav-forward" type="button">Week ${shown.key.week} ›</button>`
        : `<button class="week-nav-link" id="week-nav-back" type="button">‹ Week ${peekTarget.weekNum}</button>`
      : '';
  }

  // The walk row (DECISIONS §4, slow walking): one row, no paragraph.
  const walkTrail = [
    weekWalks > 0 ? `${weekWalks} this week` : '',
    ui.stepsToday !== null ? `${ui.stepsToday.toLocaleString('en-US')} steps today` : '',
  ]
    .filter((s) => s !== '')
    .join(' · ');
  const walkRow = walkStartedAt
    ? `<div class="walk-row">
         <span class="walk-text"><span id="walk-live">${walkLiveText(walkStartedAt)}</span></span>
         <div class="walk-btn-group">
           <button class="walk-log-btn walk-log-btn-active" id="finish-walk" type="button">■ Done</button>
           <button class="walk-cancel-btn" id="cancel-walk" type="button">Cancel</button>
         </div>
       </div>`
    : `<div class="walk-row">
         <button class="walk-log-btn" id="log-walk-start" type="button">🚶 Start a walk</button>
         <span class="walk-text">${walkTrail}</span>
       </div>`;

  return `
    <div class="home-header">
      <div class="home-header-title">
        <h1 id="week-title">${homeWeekTitle()}</h1>
        <span class="app-version" aria-label="Build version">${homeVersionTag()}</span>
      </div>
      <button class="settings-icon-btn" id="open-settings" type="button" aria-label="Open settings" title="Settings">
        <span class="settings-icon-glyph" aria-hidden="true">⚙</span>
      </button>
    </div>
    ${subLineHtml}
    ${movedNoteHtml}
    <div id="sync-indicator" class="sync-indicator sync-${state.syncStatus}">${syncIndicatorText()}</div>
    ${ui.staleSnapshot ? renderStaleSessionCard(ui.staleSnapshot) : ''}

    ${doneToday ? renderDoneTodayCard(doneToday, doneCardLines) : renderUpNextHero(pick) + renderPreviewLink(pick)}
    ${chipsHtml}
    ${renderWorkoutDChip(dDoneToday)}

    <div class="card week-card" id="open-weekly-review" role="button" tabindex="0" aria-label="Open weekly review for this week">
      <div class="week-card-head">
        <span class="week-card-range">${weekCardHeadText}</span>
        <span class="week-card-chev" aria-hidden="true">›</span>
      </div>
      <div class="week-dots" id="week-strip">${dotsHtml}</div>
      <div class="week-line" id="week-count">${weekLineText}</div>
      ${afterBreakHtml}
      ${moveOnHtml}
      ${saturdayNote}
      ${weekNavLinkHtml}
    </div>

    ${renderHomeSinceLine(logs)}

    <div class="card walk-card">${walkRow}</div>

    <div class="home-doors">
      ${homeCycleDoorRow}
      <button class="door-row" id="open-progress-link" type="button">
        <span>📈 Progress</span><span class="door-chev" aria-hidden="true">›</span>
      </button>
      <button class="door-row" id="view-history" type="button">
        <span>🗂 Sessions</span><span class="door-chev" aria-hidden="true">›</span>
      </button>
    </div>
  `;
}

// v64 (Oct 20 2026, her Q4 via "just go"): Home's job is the one next action, so the full
// Start -> Now card is gone. ONE line in its place; it opens Progress, where "What grew"
// holds the first -> now rows. The count is the very one Progress leads with (weeks-grid.ts).
function renderHomeSinceLine(logs: LogEntry[]): string {
  const first = getChronologicalLogs()[0];
  if (logs.length === 0 || !first) return '';
  const { full } = fullWeeksSummary(buildWeekRows(logs));
  return `
    <div class="home-since">
      <button class="door-row" id="home-since-line" type="button">
        <span>${escapeHtml(sinceFullWeeksLine(first.date, full))}</span><span class="door-chev" aria-hidden="true">›</span>
      </button>
    </div>`;
}

export function attachHomeHandlers(): void {
  bindClick('view-history', () => {
    state.screen = 'history';
    requestRender();
  });
}

export function attachHomeHandlers2(): void {
  // Ship 6: Settings entry from home header.
  bindClick('open-settings', () => {
    ui.settingsDataOpen = false; // v48 · P6: the Data fold opens closed
    state.screen = 'settings';
    requestRender();
  });
}

export function attachHomeHandlers3(): void {
  // Ship 4: open weekly-review screen. v48 · P4 (Sep 24 2026): home only ever
  // shows THIS week now, so it opens this week (offset 0). The whole week card is the one door to Weekly review (the
  // separate "📊 Weekly review" row is gone). It's a div (the day dots inside
  // are buttons), so Enter/Space open it too.
  const openWeeklyReview = (): void => {
    ui.viewedWeekOffset = 0;
    ui.reviewBackTo = 'home';
    state.screen = 'weekly-review';
    requestRender();
  };
  bindClick('open-weekly-review', openWeeklyReview);
  document.getElementById('open-weekly-review')?.addEventListener('keydown', (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openWeeklyReview();
    }
  });

  // WK2 (Sep 27 2026), §8c amendment: "‹ Week 4" peeks at the last closed
  // week on Home's own week card; "Week 5 ›" returns. A plain view toggle —
  // never touches what a session counts toward or trains. Raw listener (not
  // bindClick), same reason as the [data-detail] dots just above: this sits
  // INSIDE .week-card, whose own click opens Weekly review — without
  // stopPropagation a tap here would fire both.
  document.getElementById('week-nav-back')?.addEventListener('click', (e) => {
    e.stopPropagation();
    ui.viewingLastClosedWeek = true;
    requestRender();
  });
  document.getElementById('week-nav-forward')?.addEventListener('click', (e) => {
    e.stopPropagation();
    ui.viewingLastClosedWeek = false;
    requestRender();
  });

  // WK3 (Sep 27 2026), §2.4: "Move on without it" — quiet, explicit, her own
  // tap only (the app never moves on by itself). Raw listener + stopPropagation
  // for the same reason week-nav-back/forward need it: this button sits
  // INSIDE .week-card, whose own click opens Weekly review.
  document.getElementById('week-move-on')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const shown = shownWeek();
    if (!shown.span) return; // button only ever renders when shown.span exists (canMoveOn needs it)
    moveOnWithoutIt(shown.key, shown.span.missing);
  });
  // #week-undo sits under the header (outside .week-card), so a plain
  // bindClick is enough — no propagation to stop.
  bindClick('week-undo', () => {
    const move = todaysWeekMove();
    if (move) undoWeekMove(move);
  });

  // Ship 5: Progress screen — full-history longitudinal view, from home's door.
  // (v48 · P6: the Session screen's "📈 View progress" link and the Exercise
  // breakdown toggle are gone with what they opened.)
  bindClick('open-progress-link', () => {
    state.screen = 'progress';
    requestRender();
  });
  // v64: the one "Since May: N full weeks" line opens the same Progress.
  bindClick('home-since-line', () => {
    state.screen = 'progress';
    requestRender();
  });
}

export function attachHomeHandlers4(): void {
  // The Done card (home-done-card) is a div, same reason open-weekly-review
  // needs its own keydown below — Enter/Space don't click a non-button by
  // default.
  document.getElementById('home-done-card')?.addEventListener('keydown', (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  });
}
