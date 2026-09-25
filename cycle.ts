// cycle.ts — capacity & cycle: the phase math (Sep 25 2026)
//
// WHAT: pure logic only (no DOM, no fetch — same discipline as progression.ts
// §7) for turning a list of logged period starts into (a) the phase a given
// session date fell in, and (b) the "before -> after capacity, by phase"
// comparison the Progress card shows. app.ts does the reading from
// Supabase/localStorage and the SVG/HTML rendering; everything decided here
// is exercised by tests/cycle.test.ts without a browser.
//
// WHY: her words tonight (Sep 25 2026, 04:01): "I also want capacity analysis
// in progress before and after and period what phase and then comparing
// capacity and phase" -> (04:02) "you have all past cycle info" — the go to
// use what's already logged in self/health/reproductive.md (now seeded into
// the cycle_periods table) rather than wait for new logging.
//
// REGISTER (app-building-guide.md §1-2 + her Sep 25 ask): neutral. No "PMS
// made you weak", no verdicts. "Pre-period", never PMS. Small n said plainly
// ("not enough yet") instead of averaging 1-2 readings into a fake number.

export type CyclePeriod = {
  startDate: string; // ISO date, e.g. '2026-09-01'
  source?: string | null;
  note?: string | null;
};

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export type PhaseResult = {
  phase: CyclePhase;
  cycleDay: number; // 1-indexed from this cycle's own start
  cycleLength: number; // known (past cycle) or estimated (current/open cycle)
  nextStart: string; // ISO date — known or estimated
  estimated: boolean; // true only for the current/open cycle (no logged next start yet)
  // Last 7 days before nextStart (known or estimated) — her ask: expose this
  // window under its own name, "not PMS" (app-building-guide register rule).
  // A day past due (estimated nextStart already gone by) still counts as
  // pre-period — the wait for a late period is the same window, not a new one.
  prePeriod: boolean;
};

// ---------------------------------------------------------------------------
// Phase boundaries (her spec, Sep 25 2026 04:02 exchange)
// ---------------------------------------------------------------------------
// menstrual   = cycle day 1-5
// luteal      = the 14 days before the next start... minus the 2 days the
//               ovulatory window (below) also claims, since ovulatory is the
//               more specific label for those two days (biology: ovulation
//               sits right at the follicular/luteal boundary, ~14 days before
//               the next period — the two windows are DEFINED to overlap
//               there; ovulatory wins the overlap so every day has exactly
//               one phase).
// ovulatory   = the 3 days centred on (next start - 14)
// follicular  = whatever is left between menstrual and ovulatory
//
// Expressed as "days until the next start" (d = nextStart - date, so d=1 is
// the day right before the next period):
//   d in [13,15]  -> ovulatory (centred on d=14)
//   d in [1,12]   -> luteal (14 days before next start, less the 2 days
//                    ovulatory already took: d=13 and d=14)
//   d <= 0        -> luteal too (period is late — still "not menstrual yet",
//                    closest real label is late luteal; see phaseForDate)
//   otherwise     -> follicular (after day 5, before ovulatory starts)
const MENSTRUAL_DAYS = 5;
const OVULATION_OFFSET_DAYS = 14; // "next start - 14"
const OVULATORY_WINDOW_DAYS = 3; // centred on the offset above -> ±1 day
const PRE_PERIOD_DAYS = 7; // "last 7 days before the next start"
const MEDIAN_CYCLES = 6; // her spec: "median of her last 6 cycle lengths"

// v48 cutover (Sep 24 2026): before this date, an untouched capacity slider
// saved its default (5), not null — the v48 "touched" flags didn't exist yet.
// A logged 5 before this date is therefore ambiguous (chosen, or never
// touched) and is excluded from every average below, per her honest-data ask.
export const V48_CUTOFF_DATE = '2026-09-24';
const UNTOUCHED_DEFAULT = 5;

// v50 mood ship date — mood_before/mood_after didn't exist before this, so
// there's no data to average until sessions accumulate past it. The v51
// card's "tracking started" quiet line (app.ts) reads this instead of a
// second hardcoded date drifting out of sync with this one.
export const MOOD_TRACKING_START_DATE = '2026-09-25';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toMs(dateISO: string): number {
  return new Date(dateISO + 'T00:00:00').getTime();
}

// v51 · exported (Sep 25 2026): the plain-words layer below needs "how many
// days between today and the predicted start" for the period-log button's
// quiet/primary window — same day math, no new logic.
export function daysBetween(aISO: string, bISO: string): number {
  return Math.round((toMs(bISO) - toMs(aISO)) / MS_PER_DAY);
}

// v50 · fix (Sep 25 2026): the old version parsed `dateISO` at LOCAL midnight
// (toMs, above — no 'Z' suffix, so JS reads it in the runtime's timezone) but
// read the result back with toISOString(), which is always UTC. In Jerusalem
// (UTC+2/+3) any whole-day offset came out ONE DAY EARLY — the estimated
// next start, every estimated phase, and prePeriod all shifted a day early.
// Fixed by never touching real (locale-dependent) time at all: treat
// `dateISO` as a bare calendar date and do the whole add in one UTC frame,
// so the function's output can't depend on the runtime's timezone. Also
// rounds a fractional estimate (her median can be e.g. 27.5) to a whole day
// first — a next start needs to land ON a day, not floor to whichever side
// the leftover half-day's UTC conversion happened to fall on.
// v51 · exported: same reason as daysBetween above — nextStartEstimateISO needs it.
export function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + Math.round(days)));
  return dt.toISOString().slice(0, 10);
}

function sortStarts(periods: CyclePeriod[]): string[] {
  return [...new Set(periods.map((p) => p.startDate))].sort();
}

/** Consecutive gaps (days) between logged starts, chronological. */
export function cycleLengths(periods: CyclePeriod[]): number[] {
  const starts = sortStarts(periods);
  const out: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    out.push(daysBetween(starts[i - 1]!, starts[i]!));
  }
  return out;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Median of (up to) her last N cycle lengths — used only to estimate the
 *  CURRENT (open) cycle's next start. Null when there isn't even one logged
 *  cycle length yet (fewer than 2 period starts total). */
export function medianCycleLength(
  periods: CyclePeriod[],
  maxCycles: number = MEDIAN_CYCLES
): number | null {
  const lengths = cycleLengths(periods);
  return median(lengths.slice(-maxCycles));
}

/** Which phase a session date falls in, given the logged period starts.
 *  Returns null when the date is before her first logged start (nothing to
 *  attribute it to) or when it's inside the current/open cycle but there's
 *  no cycle-length history yet to estimate a next start from. */
export function phaseForDate(dateISO: string, periods: CyclePeriod[]): PhaseResult | null {
  const starts = sortStarts(periods);
  if (starts.length === 0) return null;

  // The latest start on/before this date — the cycle it belongs to.
  let start: string | null = null;
  let next: string | null = null;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]! <= dateISO) {
      start = starts[i]!;
      next = starts[i + 1] ?? null;
    } else {
      break;
    }
  }
  if (start === null) return null; // date is before any logged period

  let cycleLength: number;
  let nextStart: string;
  let estimated: boolean;
  if (next !== null) {
    cycleLength = daysBetween(start, next);
    nextStart = next;
    estimated = false;
  } else {
    const est = medianCycleLength(periods);
    if (est === null) return null; // only one start ever logged — nothing to estimate from
    cycleLength = est;
    nextStart = addDays(start, est);
    estimated = true;
  }

  const cycleDay = daysBetween(start, dateISO) + 1;
  const d = daysBetween(dateISO, nextStart); // days until next start; <=0 means overdue

  let phase: CyclePhase;
  if (cycleDay <= MENSTRUAL_DAYS) {
    phase = 'menstrual';
  } else if (d >= OVULATION_OFFSET_DAYS - 1 && d <= OVULATION_OFFSET_DAYS + 1) {
    // centred on OVULATION_OFFSET_DAYS, window width OVULATORY_WINDOW_DAYS (3 -> ±1)
    void OVULATORY_WINDOW_DAYS; // documents the width the two literals above encode
    phase = 'ovulatory';
  } else if (d <= OVULATION_OFFSET_DAYS - 2) {
    // the 14-day luteal window, minus the 2 days (13,14) ovulatory already took;
    // d<=0 (a late period) still reads as luteal — see module doc above.
    phase = 'luteal';
  } else {
    phase = 'follicular';
  }

  return {
    phase,
    cycleDay,
    cycleLength,
    nextStart,
    estimated,
    prePeriod: d <= PRE_PERIOD_DAYS,
  };
}

// ---------------------------------------------------------------------------
// Honest-data capacity readings
// ---------------------------------------------------------------------------

export type CapacitySession = {
  date: string;
  capacityBefore: number | null;
  capacityAfter: number | null;
};

/** null out a reading that can't be trusted: never-answered (already null),
 *  or a pre-v48 exact 5 (the untouched slider default before "touched" flags
 *  existed — v48 · P6 DECISIONS §2 #6 is the reason the old capacity chart
 *  was pulled in the first place; this is the honest replacement). */
function honestReading(dateISO: string, value: number | null): number | null {
  if (value === null) return null;
  if (dateISO < V48_CUTOFF_DATE && value === UNTOUCHED_DEFAULT) return null;
  return value;
}

export function honestBefore(s: CapacitySession): number | null {
  return honestReading(s.date, s.capacityBefore);
}

export function honestAfter(s: CapacitySession): number | null {
  return honestReading(s.date, s.capacityAfter);
}

/** How many pre-v48 exact-5 readings got excluded as ambiguous — the quiet
 *  line's count ("5s before Sep 24 left out - some were the untouched slider"). */
export function excludedUntouchedCount(sessions: CapacitySession[]): number {
  let n = 0;
  for (const s of sessions) {
    if (s.date < V48_CUTOFF_DATE && s.capacityBefore === UNTOUCHED_DEFAULT) n++;
    if (s.date < V48_CUTOFF_DATE && s.capacityAfter === UNTOUCHED_DEFAULT) n++;
  }
  return n;
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export const MIN_PHASE_N = 3;

// ---------------------------------------------------------------------------
// Mood (v50, Sep 25 2026) — her words (04:45): "and then another 1-10 thing I
// can do is mood 1 being irritable to being happy and or calm". Same phase
// math, same n<3 gating, same per-column gating, same avgChange formula as
// capacity — but no honest-reading cutoff: mood_before/mood_after didn't
// exist before v50, so there's no pre-v48 ambiguous-default class of row to
// exclude (there is no pre-v50 mood data at all).
// ---------------------------------------------------------------------------

export type MoodSession = {
  date: string;
  moodBefore: number | null;
  moodAfter: number | null;
};

// ---------------------------------------------------------------------------
// The one optional question line
// ---------------------------------------------------------------------------

export type CapacityMetric = 'before' | 'after';

export type PrePeriodComparison = {
  metric: CapacityMetric;
  prePeriodN: number;
  restN: number;
  prePeriodAvg: number;
  restAvg: number;
  diff: number; // restAvg - prePeriodAvg; positive = pre-period runs LOWER
};

/** null unless both sides clear MIN_PHASE_N — same "never judge a small n"
 *  rule as the phase table. */
export function prePeriodVsRest(
  sessions: CapacitySession[],
  periods: CyclePeriod[],
  metric: CapacityMetric
): PrePeriodComparison | null {
  const pre: number[] = [];
  const rest: number[] = [];
  for (const s of sessions) {
    const info = phaseForDate(s.date, periods);
    if (!info) continue;
    const v = metric === 'before' ? honestBefore(s) : honestAfter(s);
    if (v === null) continue;
    (info.prePeriod ? pre : rest).push(v);
  }
  if (pre.length < MIN_PHASE_N || rest.length < MIN_PHASE_N) return null;
  const prePeriodAvg = avg(pre);
  const restAvg = avg(rest);
  return {
    metric,
    prePeriodN: pre.length,
    restN: rest.length,
    prePeriodAvg,
    restAvg,
    diff: restAvg - prePeriodAvg,
  };
}

// ---------------------------------------------------------------------------
// Plain-words layer (v51, Sep 25 2026) — her words: "the period part is so
// confusing" -> "show gemini get some help". Gemini reviewed the v50 card
// (jargon table, dot chart, legend, "17 pre-Sep-24 '5' readings" footnote —
// see self/health/workout-app-audit-2026-09-24/screens-v50/capacity-cycle-
// card-v50.png) and Claude decided what to take. Nothing below is new MATH —
// it's the same phaseForDate/prePeriod fields, MIN_PHASE_N gate and
// honestBefore/After readings above, read into the 4 names she actually
// thinks in instead of menstrual/follicular/ovulatory/luteal. app.ts does
// all display formatting (dates, "X workouts") — this stays DOM/format-free,
// same discipline as the rest of the file.
// ---------------------------------------------------------------------------

export type PlainPhase = 'on-period' | 'week-after' | 'mid-cycle' | 'week-before';

export const PLAIN_PHASE_ORDER: PlainPhase[] = [
  'on-period',
  'week-after',
  'mid-cycle',
  'week-before',
];

// Compact label — used for the "Compare" list rows (spec: "On your period" ·
// "Week after period" · "Mid-cycle" · "Week before period", no "your" on the
// last one there).
export const PLAIN_PHASE_LABEL: Record<PlainPhase, string> = {
  'on-period': 'On your period',
  'week-after': 'Week after period',
  'mid-cycle': 'Mid-cycle',
  'week-before': 'Week before period',
};

// The big TODAY header reads "Week before YOUR period" (her exact spec
// wording differs from the compact list on this one row only).
export const PLAIN_PHASE_HEADER_LABEL: Record<PlainPhase, string> = {
  ...PLAIN_PHASE_LABEL,
  'week-before': 'Week before your period',
};

/** Which of the 4 plain-words phases a technical PhaseResult maps to. Her
 *  spec (Sep 25 2026): menstrual -> "on your period"; the last 7 days before
 *  the (known or estimated) next start -> "week before period" (this wins
 *  over follicular/luteal/ovulatory — a late period is still "week before",
 *  see PhaseResult.prePeriod's own doc comment); follicular (after the
 *  period, before ovulation) -> "week after period"; everything else
 *  (ovulatory, and luteal days that aren't yet in the pre-period week) ->
 *  "mid-cycle". */
export function plainPhaseFor(info: PhaseResult): PlainPhase {
  if (info.phase === 'menstrual') return 'on-period';
  if (info.prePeriod) return 'week-before';
  if (info.phase === 'follicular') return 'week-after';
  return 'mid-cycle';
}

/** The latest logged start plus her median cycle length — the same estimate
 *  phaseForDate computes internally for an open cycle, exposed on its own so
 *  the period-log button (below) can compare "today" to it without needing a
 *  session logged on that day. Null when there's no median yet (fewer than 2
 *  starts logged, ever). */
export function nextStartEstimateISO(periods: CyclePeriod[]): string | null {
  const starts = sortStarts(periods);
  if (starts.length === 0) return null;
  const latest = starts[starts.length - 1]!;
  const est = medianCycleLength(periods);
  if (est === null) return null;
  return addDays(latest, est);
}

export type PeriodLogUrgency = 'quiet' | 'primary';

/** her spec (Sep 25 2026): the "Period started today" button is the sage
 *  PRIMARY action only in the window from 3 days before the predicted start
 *  through 7 days after it (a late period is still an open window, not a
 *  missed one — capped so the button doesn't stay sage all month once a
 *  prediction goes stale). Quiet/outline the rest of the month, and quiet
 *  whenever there's no estimate yet to compare against. Logging a start
 *  moves `latest`, so the window closes on its own the moment she taps —
 *  no separate "already logged" branch needed here. */
export function periodLogUrgency(periods: CyclePeriod[], todayISO: string): PeriodLogUrgency {
  const next = nextStartEstimateISO(periods);
  if (next === null) return 'quiet';
  const daysUntil = daysBetween(todayISO, next); // positive = still ahead of the prediction
  return daysUntil <= 3 && daysUntil >= -7 ? 'primary' : 'quiet';
}

export type TodayCycleStatus = {
  plainPhase: PlainPhase;
  cycleDay: number;
  nextStart: string; // ISO — app.ts formats it for display
  // The predicted start has passed and nothing new is logged. app.ts uses
  // this to say "due any day" instead of a stale "next one ~<past date>".
  overdue: boolean;
};

/** Where she is TODAY, in the plain vocabulary — null only when today is
 *  before her very first logged start, or inside the open cycle with no
 *  median yet (same null cases as phaseForDate itself). */
export function todayCycleStatus(
  periods: CyclePeriod[],
  todayISO: string
): TodayCycleStatus | null {
  const info = phaseForDate(todayISO, periods);
  if (!info) return null;
  return {
    plainPhase: plainPhaseFor(info),
    cycleDay: info.cycleDay,
    nextStart: info.nextStart,
    overdue: info.phase !== 'menstrual' && daysBetween(todayISO, info.nextStart) <= 0,
  };
}

export type PlainPhaseTableRow = {
  plainPhase: PlainPhase;
  n: number; // sessions in this plain phase with at least one honest reading
  avgBefore: number | null; // null unless >= MIN_PHASE_N honest before-readings
  avgAfter: number | null; // null unless >= MIN_PHASE_N honest after-readings
};

/** Same shared-generic pattern the back/wrist/mood plain builders below all
 *  call into — bucketed into the 4 PLAIN phases, same MIN_PHASE_N gate per
 *  column (v51 · fix Sep 25 2026: this used to point at buildPhaseTableGeneric,
 *  the technical-bucket version, which §6 of the cycle-page spec deleted). */
function buildPlainPhaseTableGeneric<S extends { date: string }>(
  sessions: S[],
  periods: CyclePeriod[],
  before: (s: S) => number | null,
  after: (s: S) => number | null
): PlainPhaseTableRow[] {
  const buckets = new Map<PlainPhase, S[]>();
  for (const pp of PLAIN_PHASE_ORDER) buckets.set(pp, []);
  for (const s of sessions) {
    const info = phaseForDate(s.date, periods);
    if (!info) continue;
    if (before(s) === null && after(s) === null) continue;
    buckets.get(plainPhaseFor(info))!.push(s);
  }
  return PLAIN_PHASE_ORDER.map((pp) => {
    const inPhase = buckets.get(pp)!;
    const n = inPhase.length;
    const befores = inPhase.map(before).filter((v): v is number => v !== null);
    const afters = inPhase.map(after).filter((v): v is number => v !== null);
    return {
      plainPhase: pp,
      n,
      avgBefore: befores.length >= MIN_PHASE_N ? avg(befores) : null,
      avgAfter: afters.length >= MIN_PHASE_N ? avg(afters) : null,
    };
  });
}

/** The "Your cycle" card's Compare list + current-phase numbers — capacity. */
export function buildPlainPhaseTable(
  sessions: CapacitySession[],
  periods: CyclePeriod[]
): PlainPhaseTableRow[] {
  return buildPlainPhaseTableGeneric(sessions, periods, honestBefore, honestAfter);
}

/** Same, for mood — no honest-reading cutoff (mood didn't exist pre-v50). */
export function buildPlainMoodPhaseTable(
  sessions: MoodSession[],
  periods: CyclePeriod[]
): PlainPhaseTableRow[] {
  return buildPlainPhaseTableGeneric(
    sessions,
    periods,
    (s) => s.moodBefore,
    (s) => s.moodAfter
  );
}

// ---------------------------------------------------------------------------
// Back & wrist before -> after (v51, Sep 25 2026) — her follow-up ask: "and
// all metrics bf workout have after as well". Same shared generic + same
// MIN_PHASE_N gate as capacity/mood — no honest-reading cutoff (the BEFORE
// half of back/wrist didn't exist before v51, so there's no ambiguous
// pre-cutoff default to exclude, same reasoning as mood above).
// ---------------------------------------------------------------------------

export type BackSession = {
  date: string;
  backBefore: number | null;
  backAfter: number | null;
};

export type WristSession = {
  date: string;
  wristBefore: number | null;
  wristAfter: number | null;
};

/** Same, for back pain before -> after. */
export function buildPlainBackPhaseTable(
  sessions: BackSession[],
  periods: CyclePeriod[]
): PlainPhaseTableRow[] {
  return buildPlainPhaseTableGeneric(
    sessions,
    periods,
    (s) => s.backBefore,
    (s) => s.backAfter
  );
}

/** Same, for wrist pain before -> after. */
export function buildPlainWristPhaseTable(
  sessions: WristSession[],
  periods: CyclePeriod[]
): PlainPhaseTableRow[] {
  return buildPlainPhaseTableGeneric(
    sessions,
    periods,
    (s) => s.wristBefore,
    (s) => s.wristAfter
  );
}

/** The one optional question line, in plain words — same gate as
 *  prePeriodVsRest's own (>=1 point, n>=3 both sides, before checked first).
 *  Only the wording changes: no "n=", no decimal, no "luteal" anywhere. */
export function plainQuestionLine(
  sessions: CapacitySession[],
  periods: CyclePeriod[]
): string | null {
  for (const metric of ['before', 'after'] as const) {
    const cmp = prePeriodVsRest(sessions, periods, metric);
    if (cmp && Math.abs(cmp.diff) >= 1) {
      const label = metric === 'before' ? 'Body before workouts' : 'Body after workouts';
      const direction = cmp.diff > 0 ? 'lower' : 'higher';
      const points = Math.round(Math.abs(cmp.diff));
      const amount = `${points} point${points === 1 ? '' : 's'}`;
      return `${label} runs about ${amount} ${direction} in the week before your period (${cmp.prePeriodN} vs ${cmp.restN} workouts). Does that match how it feels?`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The cycle page (v51, Sep 25 2026) — her ask moved "Your cycle" onto its own
// screen; app.ts's renderCycle carries her words on why. Card C on the new
// page ("Compare phases") lets her switch which metric the table shows;
// `isComparable` decides whether a metric earns a chip (>=2 phases with both
// averages), and `cycleSummaryLine` is the one sentence under the table when
// Body is selected — see SPEC-cycle-page.md §2.3 and §2.4.
// ---------------------------------------------------------------------------

export type CycleMetric = 'body' | 'mood' | 'back' | 'wrist';

/** A metric is worth its own chip once at least 2 phases have both a before
 *  and an after average (MIN_PHASE_N already gates each average itself —
 *  this only asks "how many of the 4 rows cleared that gate"). */
export function isComparable(rows: PlainPhaseTableRow[]): boolean {
  return rows.filter((r) => r.avgBefore !== null && r.avgAfter !== null).length >= 2;
}

/** The one sentence under Card C's table, shown only when Body is the
 *  selected metric (app.ts's job to gate on that — this stays metric-blind,
 *  always reading capacity). Checked in order: her existing pre-period
 *  question line first (it's a real, felt gap); otherwise, once all 4
 *  phases have both averages, a plain "looks about the same" line IF every
 *  before and every after sits within 1 point of each other — never a
 *  verdict, and never spoken at all when the picture is mixed. */
export function cycleSummaryLine(
  sessions: CapacitySession[],
  periods: CyclePeriod[]
): string | null {
  const question = plainQuestionLine(sessions, periods);
  if (question !== null) return question;

  const rows = buildPlainPhaseTable(sessions, periods);
  if (rows.some((r) => r.avgBefore === null || r.avgAfter === null)) return null;

  const befores = rows.map((r) => r.avgBefore as number);
  const afters = rows.map((r) => r.avgAfter as number);
  const beforeSpread = Math.max(...befores) - Math.min(...befores);
  const afterSpread = Math.max(...afters) - Math.min(...afters);
  if (beforeSpread >= 1 || afterSpread >= 1) return null;

  const all = [...befores, ...afters];
  const lo = Math.min(...all).toFixed(1);
  const hi = Math.max(...all).toFixed(1);
  return `So far, body numbers look about the same in every phase — all between ${lo} and ${hi}.`;
}
