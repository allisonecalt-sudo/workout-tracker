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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toMs(dateISO: string): number {
  return new Date(dateISO + 'T00:00:00').getTime();
}

function daysBetween(aISO: string, bISO: string): number {
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
function addDays(dateISO: string, days: number): string {
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

export type PhaseTableRow = {
  phase: CyclePhase;
  n: number; // sessions in this phase with at least one honest reading
  avgBefore: number | null;
  avgAfter: number | null;
  avgChange: number | null; // avgAfter - avgBefore (never a separately-averaged per-session delta — see below)
  notEnough: boolean; // n < MIN_PHASE_N (the phase as a whole) — the row is shown but every column can still independently read "-"
};

const PHASE_ORDER: CyclePhase[] = ['menstrual', 'follicular', 'ovulatory', 'luteal'];

/** Shared table-builder: n / avg before / avg after / avg change, one row per
 *  phase. Generic over the session shape so capacity (honest readings, pre-
 *  v48-cutoff exclusion) and mood (no cutoff — the field didn't exist before
 *  v50, so there's no ambiguous default to exclude) share the exact same
 *  gating instead of two hand-written copies drifting apart.
 *
 *  v50 · fix (Sep 25 2026): the phase-level n>=MIN_PHASE_N gate used to be
 *  the ONLY gate — Before, After and Δ were then each averaged over
 *  whatever subset of that n happened to have a before/after/paired
 *  reading, so After or Δ could still be an average of 1-2 (her spec
 *  forbids this), and because Δ was its own separately-averaged
 *  per-session change (not avgAfter-avgBefore), a row could show "after is
 *  higher" while Δ read negative — self-contradictory. Now: Before and
 *  After are each gated on their OWN count (>= MIN_PHASE_N honest readings
 *  of that kind), and Δ is always avgAfter-avgBefore, so the row can never
 *  contradict itself and never quietly averages 1-2. */
function buildPhaseTableGeneric<S extends { date: string }>(
  sessions: S[],
  periods: CyclePeriod[],
  before: (s: S) => number | null,
  after: (s: S) => number | null
): PhaseTableRow[] {
  const byPhase = new Map<CyclePhase, S[]>();
  for (const phase of PHASE_ORDER) byPhase.set(phase, []);
  for (const s of sessions) {
    const info = phaseForDate(s.date, periods);
    if (!info) continue;
    if (before(s) === null && after(s) === null) continue;
    byPhase.get(info.phase)!.push(s);
  }
  return PHASE_ORDER.map((phase) => {
    const inPhase = byPhase.get(phase)!;
    const n = inPhase.length;
    const befores = inPhase.map(before).filter((v): v is number => v !== null);
    const afters = inPhase.map(after).filter((v): v is number => v !== null);
    const avgBefore = befores.length >= MIN_PHASE_N ? avg(befores) : null;
    const avgAfter = afters.length >= MIN_PHASE_N ? avg(afters) : null;
    return {
      phase,
      n,
      avgBefore,
      avgAfter,
      avgChange: avgBefore !== null && avgAfter !== null ? avgAfter - avgBefore : null,
      notEnough: n < MIN_PHASE_N,
    };
  });
}

/** The Progress card's small table: n / avg before / avg after / avg change,
 *  one row per phase. */
export function buildPhaseTable(
  sessions: CapacitySession[],
  periods: CyclePeriod[]
): PhaseTableRow[] {
  return buildPhaseTableGeneric(sessions, periods, honestBefore, honestAfter);
}

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

export function buildMoodPhaseTable(
  sessions: MoodSession[],
  periods: CyclePeriod[]
): PhaseTableRow[] {
  return buildPhaseTableGeneric(
    sessions,
    periods,
    (s) => s.moodBefore,
    (s) => s.moodAfter
  );
}

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

/** At most one line, only when the gap is >= 1 point with n>=3 both sides —
 *  a question, never a verdict (her ask: "ask/suggest never tell"). Checked
 *  before-capacity first (her named example), then after. */
export function questionLine(sessions: CapacitySession[], periods: CyclePeriod[]): string | null {
  for (const metric of ['before', 'after'] as const) {
    const cmp = prePeriodVsRest(sessions, periods, metric);
    if (cmp && Math.abs(cmp.diff) >= 1) {
      const label = metric === 'before' ? 'Before-workout capacity' : 'After-workout capacity';
      const direction = cmp.diff > 0 ? 'lower' : 'higher';
      const amount = Math.abs(cmp.diff).toFixed(1);
      return `${label} runs ~${amount} ${direction} in the pre-period week (n=${cmp.prePeriodN} vs ${cmp.restN}). Does that match how it feels?`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Timeline (the dot/slope chart's data — app.ts turns this into SVG)
// ---------------------------------------------------------------------------

export type TimelinePoint = {
  date: string;
  before: number | null; // honest
  after: number | null; // honest
  phase: CyclePhase | null;
  estimated: boolean;
};

/** Oldest -> newest, one point per session that has at least one honest
 *  reading. app.ts draws the phase bands from consecutive points' `phase`. */
export function buildTimeline(
  sessions: CapacitySession[],
  periods: CyclePeriod[]
): TimelinePoint[] {
  return [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const info = phaseForDate(s.date, periods);
      return {
        date: s.date,
        before: honestBefore(s),
        after: honestAfter(s),
        phase: info?.phase ?? null,
        estimated: info?.estimated ?? false,
      };
    })
    .filter((p) => p.before !== null || p.after !== null);
}
