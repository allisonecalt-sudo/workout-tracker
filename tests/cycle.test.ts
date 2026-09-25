// tests/cycle.test.ts — capacity & cycle phase math (Sep 25 2026)
//
// Pure-logic tests, same shape as tests/progression.test.ts: no `page`
// fixture, so Playwright runs these in Node.

import { test, expect } from '@playwright/test';
import {
  phaseForDate,
  medianCycleLength,
  cycleLengths,
  buildPhaseTable,
  buildMoodPhaseTable,
  prePeriodVsRest,
  questionLine,
  excludedUntouchedCount,
  buildTimeline,
  honestBefore,
  honestAfter,
  MIN_PHASE_N,
  V48_CUTOFF_DATE,
  // v51 · plain-words layer
  plainPhaseFor,
  nextStartEstimateISO,
  periodLogUrgency,
  todayCycleStatus,
  buildPlainPhaseTable,
  buildPlainMoodPhaseTable,
  plainQuestionLine,
  PLAIN_PHASE_ORDER,
  PLAIN_PHASE_LABEL,
  PLAIN_PHASE_HEADER_LABEL,
  type CyclePeriod,
  type CapacitySession,
  type MoodSession,
} from '../cycle';

// Her real logged period starts (self/health/reproductive.md), the exact
// seed the v50 migration wrote into cycle_periods.
const HER_PERIODS: CyclePeriod[] = [
  { startDate: '2026-02-21', source: 'reproductive.md' },
  { startDate: '2026-03-20', source: 'reproductive.md' },
  { startDate: '2026-04-15', source: 'reproductive.md' },
  { startDate: '2026-05-13', source: 'reproductive.md' },
  { startDate: '2026-06-10', source: 'reproductive.md' },
  { startDate: '2026-07-09', source: 'reproductive.md' },
  { startDate: '2026-08-05', source: 'reproductive.md' },
  { startDate: '2026-09-01', source: 'reproductive.md' },
];

test.describe('cycleLengths / medianCycleLength', () => {
  test('reads the real 27-29 day gaps between her logged starts', () => {
    // Feb21->Mar20=27, Mar20->Apr15=26, Apr15->May13=28, May13->Jun10=28,
    // Jun10->Jul9=29, Jul9->Aug5=27, Aug5->Sep1=27.
    expect(cycleLengths(HER_PERIODS)).toEqual([27, 26, 28, 28, 29, 27, 27]);
  });

  test('median of the last 6 (drops the oldest, Feb->Mar 27)', () => {
    // last 6: 26,28,28,29,27,27 -> sorted 26,27,27,28,28,29 -> median (27+28)/2=27.5
    expect(medianCycleLength(HER_PERIODS)).toBe(27.5);
  });

  test('null with fewer than 2 starts (no cycle length yet)', () => {
    expect(medianCycleLength([{ startDate: '2026-09-01' }])).toBeNull();
    expect(medianCycleLength([])).toBeNull();
  });
});

test.describe('phaseForDate — past cycles (known next start)', () => {
  // Aug5 -> Sep1 = 27 days. menstrual 1-5, follicular 6-12, ovulatory 13-15, luteal 16-27.
  test('day 1 (the start itself) is menstrual', () => {
    const r = phaseForDate('2026-08-05', HER_PERIODS);
    expect(r?.phase).toBe('menstrual');
    expect(r?.cycleDay).toBe(1);
    expect(r?.estimated).toBe(false);
    expect(r?.cycleLength).toBe(27);
  });

  test('day 5 is still menstrual, day 6 is follicular', () => {
    expect(phaseForDate('2026-08-09', HER_PERIODS)?.phase).toBe('menstrual'); // day 5
    expect(phaseForDate('2026-08-10', HER_PERIODS)?.phase).toBe('follicular'); // day 6
  });

  test('the ovulatory window is centred on (next start - 14)', () => {
    // next start Sep1; Sep1-14=Aug18 -> window Aug17-19.
    expect(phaseForDate('2026-08-16', HER_PERIODS)?.phase).toBe('follicular');
    expect(phaseForDate('2026-08-17', HER_PERIODS)?.phase).toBe('ovulatory');
    expect(phaseForDate('2026-08-18', HER_PERIODS)?.phase).toBe('ovulatory');
    expect(phaseForDate('2026-08-19', HER_PERIODS)?.phase).toBe('ovulatory');
    expect(phaseForDate('2026-08-20', HER_PERIODS)?.phase).toBe('luteal');
  });

  test('the day before the next start is luteal, and pre-period', () => {
    const r = phaseForDate('2026-08-31', HER_PERIODS); // day before Sep 1
    expect(r?.phase).toBe('luteal');
    expect(r?.prePeriod).toBe(true);
  });

  test('a 29-day cycle (Jun10->Jul9) shifts the ovulatory window later', () => {
    // Jul9-14 = Jun25 -> window Jun24-26.
    expect(phaseForDate('2026-06-24', HER_PERIODS)?.phase).toBe('ovulatory');
    expect(phaseForDate('2026-06-25', HER_PERIODS)?.phase).toBe('ovulatory');
    expect(phaseForDate('2026-06-26', HER_PERIODS)?.phase).toBe('ovulatory');
    expect(phaseForDate('2026-06-23', HER_PERIODS)?.phase).toBe('follicular');
    expect(phaseForDate('2026-06-27', HER_PERIODS)?.phase).toBe('luteal');
  });

  test('a 26-day cycle (Mar20->Apr15) still partitions cleanly, no gap or overlap', () => {
    // Local date components only (never toISOString, which reinterprets in
    // UTC and can shift the date by a day depending on the runner's timezone —
    // cycle.ts's own arithmetic is anchored to local 'T00:00:00' throughout).
    const isoLocal = (dt: Date): string => {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const days: string[] = [];
    for (let d = 0; d < 26; d++) {
      days.push(isoLocal(new Date(2026, 2, 20 + d)));
    }
    const phases = days.map((d) => phaseForDate(d, HER_PERIODS)?.phase);
    expect(phases.every((p) => p !== undefined)).toBe(true);
    // every day gets exactly one of the 4 phases (no null/undefined mid-cycle)
    expect(phases.filter((p) => p === 'menstrual').length).toBe(5);
    expect(phases.filter((p) => p === 'ovulatory').length).toBe(3);
  });

  test('null before her first logged period', () => {
    expect(phaseForDate('2026-01-01', HER_PERIODS)).toBeNull();
  });
});

test.describe('phaseForDate — the current/open cycle (estimated)', () => {
  test('estimates the next start from the median of the last 6 cycle lengths', () => {
    // last start Sep1 2026; median length 27.5 -> estimated next start rounds
    // to a whole day (v50 · fix Sep 25 2026 — see cycle.ts addDays): Math.round(27.5)=28,
    // Sep1 + 28 days = Sep29. cycleLength itself stays the raw 27.5 (unrounded).
    const r = phaseForDate('2026-09-10', HER_PERIODS); // day 10, into the open cycle
    expect(r?.estimated).toBe(true);
    expect(r?.cycleLength).toBe(27.5);
    expect(r?.nextStart).toBe('2026-09-29');
  });

  // v50 · fix (Sep 25 2026): addDays used to parse at LOCAL midnight but read
  // back via toISOString() (always UTC) — in a positive-offset timezone
  // (Jerusalem, UTC+2/+3) a whole-number median came out ONE DAY EARLY. This
  // pins the correct, timezone-independent output directly: 2 starts exactly
  // 28 days apart (a whole-number median, the case that used to be silently
  // wrong — it was masked before only because her real median happens to be
  // the fractional 27.5, tested above).
  test('a whole-number median estimates the next start correctly, independent of the runtime timezone', () => {
    const periods: CyclePeriod[] = [{ startDate: '2026-01-01' }, { startDate: '2026-01-29' }];
    expect(medianCycleLength(periods)).toBe(28);
    const r = phaseForDate('2026-01-29', periods); // the open cycle's own start
    expect(r?.estimated).toBe(true);
    expect(r?.nextStart).toBe('2026-02-26'); // Jan29 + 28 days
  });

  test('a session logged today (open cycle) still gets a phase, marked estimated', () => {
    const r = phaseForDate('2026-09-25', HER_PERIODS);
    expect(r).not.toBeNull();
    expect(r?.estimated).toBe(true);
  });

  test('an overdue open cycle (past the estimated next start) still reads as luteal, not a crash', () => {
    const r = phaseForDate('2026-10-15', HER_PERIODS); // well past the ~Sep28 estimate
    expect(r?.phase).toBe('luteal');
    expect(r?.prePeriod).toBe(true);
  });

  test('null when there is only one period ever logged (nothing to estimate from)', () => {
    expect(phaseForDate('2026-09-10', [{ startDate: '2026-09-01' }])).toBeNull();
  });
});

test.describe('honest readings — the pre-v48 untouched-5 exclusion', () => {
  test('a pre-cutoff exact 5 is excluded (ambiguous: chosen, or the untouched default)', () => {
    const s: CapacitySession = { date: '2026-09-20', capacityBefore: 5, capacityAfter: 5 };
    expect(honestBefore(s)).toBeNull();
    expect(honestAfter(s)).toBeNull();
  });

  test('a post-cutoff exact 5 is trusted (v48+ only saves a 5 when she chose it)', () => {
    const s: CapacitySession = { date: V48_CUTOFF_DATE, capacityBefore: 5, capacityAfter: 5 };
    expect(honestBefore(s)).toBe(5);
    expect(honestAfter(s)).toBe(5);
  });

  test('a pre-cutoff non-5 reading is trusted (only the ambiguous default is dropped)', () => {
    const s: CapacitySession = { date: '2026-08-01', capacityBefore: 3, capacityAfter: 7 };
    expect(honestBefore(s)).toBe(3);
    expect(honestAfter(s)).toBe(7);
  });

  test('null stays null either side of the cutoff', () => {
    const s: CapacitySession = { date: '2026-08-01', capacityBefore: null, capacityAfter: null };
    expect(honestBefore(s)).toBeNull();
    expect(honestAfter(s)).toBeNull();
  });

  test('excludedUntouchedCount counts each ambiguous 5, before and after separately', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-01', capacityBefore: 5, capacityAfter: 5 }, // 2
      { date: '2026-08-02', capacityBefore: 5, capacityAfter: 6 }, // 1
      { date: V48_CUTOFF_DATE, capacityBefore: 5, capacityAfter: 5 }, // 0 (post-cutoff, trusted)
      { date: '2026-08-03', capacityBefore: 4, capacityAfter: 6 }, // 0
    ];
    expect(excludedUntouchedCount(sessions)).toBe(3);
  });
});

test.describe('buildPhaseTable — the n<3 rule', () => {
  test('a phase with 0-2 sessions shows notEnough, never an average', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-05', capacityBefore: 4, capacityAfter: 6 }, // menstrual, day1
      { date: '2026-08-06', capacityBefore: 3, capacityAfter: 5 }, // menstrual, day2
    ];
    const rows = buildPhaseTable(sessions, HER_PERIODS);
    const menstrual = rows.find((r) => r.phase === 'menstrual')!;
    expect(menstrual.n).toBe(2);
    expect(menstrual.notEnough).toBe(true);
    expect(menstrual.avgBefore).toBeNull();
    expect(menstrual.avgAfter).toBeNull();
    expect(menstrual.avgChange).toBeNull();
  });

  test('3+ sessions in a phase produces real averages', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-05', capacityBefore: 4, capacityAfter: 6 },
      { date: '2026-08-06', capacityBefore: 2, capacityAfter: 4 },
      { date: '2026-08-07', capacityBefore: 6, capacityAfter: 8 },
    ];
    const rows = buildPhaseTable(sessions, HER_PERIODS);
    const menstrual = rows.find((r) => r.phase === 'menstrual')!;
    expect(menstrual.n).toBe(3);
    expect(menstrual.notEnough).toBe(false);
    expect(menstrual.avgBefore).toBeCloseTo(4, 5); // (4+2+6)/3
    expect(menstrual.avgAfter).toBeCloseTo(6, 5); // (6+4+8)/3
    expect(menstrual.avgChange).toBeCloseTo(2, 5); // avg of +2,+2,+2
  });

  test('pre-cutoff untouched 5s never count toward n', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-05', capacityBefore: 5, capacityAfter: 5 }, // excluded entirely (both ambiguous)
      { date: '2026-08-06', capacityBefore: 3, capacityAfter: 6 },
    ];
    const rows = buildPhaseTable(sessions, HER_PERIODS);
    const menstrual = rows.find((r) => r.phase === 'menstrual')!;
    expect(menstrual.n).toBe(1); // only the second session has an honest reading
    expect(menstrual.notEnough).toBe(true);
  });

  test('all 4 phases are always present, even with zero data', () => {
    const rows = buildPhaseTable([], HER_PERIODS);
    expect(rows.map((r) => r.phase)).toEqual(['menstrual', 'follicular', 'ovulatory', 'luteal']);
    expect(rows.every((r) => r.notEnough)).toBe(true);
  });

  // v50 · fix (Sep 25 2026): Before/After/Δ each gated on their OWN count —
  // n>=3 sessions in the phase isn't enough on its own when only 1-2 of them
  // actually carry an "after" reading (a before-only quick-log day, say).
  // Before this fix: 3 sessions with only 1 after-reading gave avgAfter an
  // average of that ONE reading and notEnough false — exactly the "average
  // of 1-2" the spec forbids.
  test('n>=3 in the phase but only 1-2 after-readings: After (and Δ) still read "not enough", Before does not', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-05', capacityBefore: 4, capacityAfter: null },
      { date: '2026-08-06', capacityBefore: 6, capacityAfter: null },
      { date: '2026-08-07', capacityBefore: 3, capacityAfter: 8 }, // the only after-reading
    ];
    const rows = buildPhaseTable(sessions, HER_PERIODS);
    const menstrual = rows.find((r) => r.phase === 'menstrual')!;
    expect(menstrual.n).toBe(3);
    expect(menstrual.notEnough).toBe(false); // the phase itself has 3 sessions
    expect(menstrual.avgBefore).toBeCloseTo((4 + 6 + 3) / 3, 5); // 3 befores — enough
    expect(menstrual.avgAfter).toBeNull(); // only 1 after — not enough, never averaged
    expect(menstrual.avgChange).toBeNull(); // Δ needs both avgBefore and avgAfter
  });

  // Her named contradiction (evidence, live data): Before/After each averaged
  // over a DIFFERENT subset used to let After read higher than Before while Δ
  // read negative. Δ = avgAfter - avgBefore now, so that can't happen.
  test('Δ is always avgAfter - avgBefore, never a separately-averaged per-session delta', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-05', capacityBefore: 4, capacityAfter: 6 },
      { date: '2026-08-06', capacityBefore: 4, capacityAfter: 6 },
      { date: '2026-08-07', capacityBefore: 8, capacityAfter: 2 }, // one bad session, after < before
    ];
    const rows = buildPhaseTable(sessions, HER_PERIODS);
    const menstrual = rows.find((r) => r.phase === 'menstrual')!;
    expect(menstrual.avgBefore).toBeCloseTo((4 + 4 + 8) / 3, 5);
    expect(menstrual.avgAfter).toBeCloseTo((6 + 6 + 2) / 3, 5);
    expect(menstrual.avgChange).toBeCloseTo(menstrual.avgAfter! - menstrual.avgBefore!, 10);
  });
});

// v50 · mood (Sep 25 2026): her words (04:45) — "mood 1 being irritable to
// being happy and or calm". Same gating as buildPhaseTable, but no
// V48_CUTOFF_DATE exclusion: mood_before/mood_after didn't exist before v50,
// so there's no ambiguous pre-v48 default to leave out.
test.describe('buildMoodPhaseTable — the same n<3 rule, no cutoff exclusion', () => {
  test('a phase with 0-2 sessions shows notEnough, never an average', () => {
    const sessions: MoodSession[] = [
      { date: '2026-08-05', moodBefore: 4, moodAfter: 6 },
      { date: '2026-08-06', moodBefore: 3, moodAfter: 5 },
    ];
    const rows = buildMoodPhaseTable(sessions, HER_PERIODS);
    const menstrual = rows.find((r) => r.phase === 'menstrual')!;
    expect(menstrual.n).toBe(2);
    expect(menstrual.notEnough).toBe(true);
    expect(menstrual.avgBefore).toBeNull();
    expect(menstrual.avgAfter).toBeNull();
    expect(menstrual.avgChange).toBeNull();
  });

  test('3+ sessions in a phase produces real averages', () => {
    const sessions: MoodSession[] = [
      { date: '2026-08-05', moodBefore: 4, moodAfter: 6 },
      { date: '2026-08-06', moodBefore: 2, moodAfter: 4 },
      { date: '2026-08-07', moodBefore: 6, moodAfter: 8 },
    ];
    const rows = buildMoodPhaseTable(sessions, HER_PERIODS);
    const menstrual = rows.find((r) => r.phase === 'menstrual')!;
    expect(menstrual.n).toBe(3);
    expect(menstrual.notEnough).toBe(false);
    expect(menstrual.avgBefore).toBeCloseTo(4, 5);
    expect(menstrual.avgAfter).toBeCloseTo(6, 5);
    expect(menstrual.avgChange).toBeCloseTo(2, 5);
  });

  // The capacity table excludes a pre-cutoff exact-5 as an ambiguous
  // untouched-slider default (honestReading). Mood has no such history —
  // a logged 5 before V48_CUTOFF_DATE is a real chip tap, not a guess.
  test('a pre-V48_CUTOFF_DATE exact 5 counts toward n (no cutoff exclusion for mood)', () => {
    expect('2026-08-05' < V48_CUTOFF_DATE).toBe(true);
    const sessions: MoodSession[] = [
      { date: '2026-08-05', moodBefore: 5, moodAfter: 5 },
      { date: '2026-08-06', moodBefore: 3, moodAfter: 6 },
    ];
    const rows = buildMoodPhaseTable(sessions, HER_PERIODS);
    const menstrual = rows.find((r) => r.phase === 'menstrual')!;
    expect(menstrual.n).toBe(2); // both count — unlike buildPhaseTable's equivalent test
  });

  test('all 4 phases are always present, even with zero data', () => {
    const rows = buildMoodPhaseTable([], HER_PERIODS);
    expect(rows.map((r) => r.phase)).toEqual(['menstrual', 'follicular', 'ovulatory', 'luteal']);
    expect(rows.every((r) => r.notEnough)).toBe(true);
  });

  test('Before and After are each gated on their OWN count', () => {
    const sessions: MoodSession[] = [
      { date: '2026-08-05', moodBefore: 4, moodAfter: null },
      { date: '2026-08-06', moodBefore: 6, moodAfter: null },
      { date: '2026-08-07', moodBefore: 3, moodAfter: 8 },
    ];
    const rows = buildMoodPhaseTable(sessions, HER_PERIODS);
    const menstrual = rows.find((r) => r.phase === 'menstrual')!;
    expect(menstrual.n).toBe(3);
    expect(menstrual.notEnough).toBe(false);
    expect(menstrual.avgBefore).toBeCloseTo((4 + 6 + 3) / 3, 5);
    expect(menstrual.avgAfter).toBeNull(); // only 1 after-reading — not enough
    expect(menstrual.avgChange).toBeNull();
  });

  test('Δ is always avgAfter - avgBefore, never a separately-averaged per-session delta', () => {
    const sessions: MoodSession[] = [
      { date: '2026-08-05', moodBefore: 4, moodAfter: 6 },
      { date: '2026-08-06', moodBefore: 4, moodAfter: 6 },
      { date: '2026-08-07', moodBefore: 8, moodAfter: 2 },
    ];
    const rows = buildMoodPhaseTable(sessions, HER_PERIODS);
    const menstrual = rows.find((r) => r.phase === 'menstrual')!;
    expect(menstrual.avgChange).toBeCloseTo(menstrual.avgAfter! - menstrual.avgBefore!, 10);
  });
});

test.describe('prePeriodVsRest / questionLine', () => {
  // Both sets deliberately avoid the value 5 — every date here is before
  // V48_CUTOFF_DATE, where an exact 5 is the ambiguous untouched default
  // (see the honest-readings tests above) and would get excluded, not
  // counted. 4 and 6 sit either side of it instead.
  function mkSessions(): CapacitySession[] {
    const sessions: CapacitySession[] = [];
    // 6 pre-period sessions — the last 7 days before the Sep1 start (Aug25-30).
    const preDates = [
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
    ];
    for (const d of preDates) sessions.push({ date: d, capacityBefore: 4, capacityAfter: 6 });
    // 18 rest-of-cycle sessions, kept clear of any cycle's own 7-day pre-period
    // window (Jul29-Aug4 belongs to the Aug5 start, Aug25-31 to the Sep1
    // start): Jul10-28 (10 dates, inside Jul9->Aug5) + Aug5-19 (8 dates,
    // inside Aug5->Sep1, all >7 days before Sep1).
    const restDates = [
      '2026-07-10',
      '2026-07-12',
      '2026-07-14',
      '2026-07-16',
      '2026-07-18',
      '2026-07-20',
      '2026-07-22',
      '2026-07-24',
      '2026-07-26',
      '2026-07-28',
      '2026-08-05',
      '2026-08-07',
      '2026-08-09',
      '2026-08-11',
      '2026-08-13',
      '2026-08-15',
      '2026-08-17',
      '2026-08-19',
    ];
    for (const d of restDates) sessions.push({ date: d, capacityBefore: 6, capacityAfter: 7 });
    return sessions;
  }

  test('reports the gap when n>=3 both sides and the diff is >=1', () => {
    const cmp = prePeriodVsRest(mkSessions(), HER_PERIODS, 'before');
    expect(cmp).not.toBeNull();
    expect(cmp!.prePeriodN).toBe(6);
    expect(cmp!.restN).toBe(18);
    expect(cmp!.prePeriodAvg).toBeCloseTo(4, 5);
    expect(cmp!.restAvg).toBeCloseTo(6, 5);
    expect(cmp!.diff).toBeCloseTo(2, 5); // rest 6 - pre 4
  });

  test('questionLine names the direction and n, and asks rather than tells', () => {
    const line = questionLine(mkSessions(), HER_PERIODS);
    expect(line).not.toBeNull();
    expect(line).toContain('lower in the pre-period week');
    expect(line).toContain('n=6 vs 18');
    expect(line).toContain('~2.0');
    expect(line).toContain('?');
    expect(line?.toLowerCase()).not.toMatch(/should|must|need to/);
  });

  test('null (no line) when n<3 on either side', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-30', capacityBefore: 2, capacityAfter: 4 }, // pre-period, only 1
      { date: '2026-07-10', capacityBefore: 6, capacityAfter: 8 },
      { date: '2026-07-12', capacityBefore: 6, capacityAfter: 8 },
      { date: '2026-07-14', capacityBefore: 6, capacityAfter: 8 },
    ];
    expect(prePeriodVsRest(sessions, HER_PERIODS, 'before')).toBeNull();
    expect(questionLine(sessions, HER_PERIODS)).toBeNull();
  });

  test('null when both sides qualify but the gap is under 1 point', () => {
    const sessions: CapacitySession[] = [];
    for (const d of ['2026-08-27', '2026-08-28', '2026-08-29']) {
      sessions.push({ date: d, capacityBefore: 6, capacityAfter: 7 });
    }
    for (const d of ['2026-07-10', '2026-07-12', '2026-07-14']) {
      sessions.push({ date: d, capacityBefore: 6.3, capacityAfter: 7 });
    }
    expect(questionLine(sessions, HER_PERIODS)).toBeNull();
  });
});

test.describe('buildTimeline', () => {
  test('chronological, one point per session with at least one honest reading', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-06', capacityBefore: 4, capacityAfter: 6 },
      { date: '2026-08-05', capacityBefore: 3, capacityAfter: 5 },
      { date: '2026-08-01', capacityBefore: null, capacityAfter: null }, // dropped: nothing honest
    ];
    const tl = buildTimeline(sessions, HER_PERIODS);
    expect(tl.map((p) => p.date)).toEqual(['2026-08-05', '2026-08-06']);
    expect(tl[0]!.phase).toBe('menstrual');
    expect(tl[0]!.estimated).toBe(false);
  });

  test('drops a pre-cutoff untouched-5 session entirely when both readings are the ambiguous default', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-05', capacityBefore: 5, capacityAfter: 5 },
    ];
    expect(buildTimeline(sessions, HER_PERIODS)).toEqual([]);
  });
});

// MIN_PHASE_N is re-exercised here so a change to the constant is caught by a
// readable assertion, not just by the n<3 tests above happening to use 3.
test('MIN_PHASE_N is 3 (spec: "If a phase has n < 3... never an average of 1-2")', () => {
  expect(MIN_PHASE_N).toBe(3);
});

// ---------------------------------------------------------------------------
// v51 · plain-words layer (Sep 25 2026) — her words: "the period part is so
// confusing" -> "show gemini get some help". Same HER_PERIODS fixture (Aug5
// -> Sep1 = 27 days, median 27.5 -> estimated next start Sep29) so every
// fact pinned above (menstrual 1-5, follicular 6-12, ovulatory 13-15 /
// Aug17-19, luteal 16-27) carries straight over.
// ---------------------------------------------------------------------------

test.describe('plainPhaseFor', () => {
  test('menstrual -> on-period', () => {
    const r = phaseForDate('2026-08-05', HER_PERIODS)!;
    expect(plainPhaseFor(r)).toBe('on-period');
  });

  test('follicular -> week-after', () => {
    const r = phaseForDate('2026-08-10', HER_PERIODS)!; // day 6
    expect(plainPhaseFor(r)).toBe('week-after');
  });

  test('ovulatory -> mid-cycle', () => {
    const r = phaseForDate('2026-08-18', HER_PERIODS)!;
    expect(plainPhaseFor(r)).toBe('mid-cycle');
  });

  test('early luteal (not yet within 7 days of the next start) -> mid-cycle, not week-before', () => {
    const r = phaseForDate('2026-08-20', HER_PERIODS)!; // luteal, d=12 (>7)
    expect(r.phase).toBe('luteal');
    expect(r.prePeriod).toBe(false);
    expect(plainPhaseFor(r)).toBe('mid-cycle');
  });

  test('the 7 days before the next start -> week-before, even though it is technically luteal', () => {
    const r = phaseForDate('2026-08-31', HER_PERIODS)!; // luteal, prePeriod true
    expect(r.phase).toBe('luteal');
    expect(r.prePeriod).toBe(true);
    expect(plainPhaseFor(r)).toBe('week-before');
  });

  test('an overdue open cycle still reads as week-before, not a crash', () => {
    const r = phaseForDate('2026-10-15', HER_PERIODS)!;
    expect(plainPhaseFor(r)).toBe('week-before');
  });
});

test('PLAIN_PHASE_ORDER / PLAIN_PHASE_LABEL / PLAIN_PHASE_HEADER_LABEL — her exact wording, no jargon', () => {
  expect(PLAIN_PHASE_ORDER).toEqual(['on-period', 'week-after', 'mid-cycle', 'week-before']);
  expect(PLAIN_PHASE_LABEL['on-period']).toBe('On your period');
  expect(PLAIN_PHASE_LABEL['week-after']).toBe('Week after period');
  expect(PLAIN_PHASE_LABEL['mid-cycle']).toBe('Mid-cycle');
  expect(PLAIN_PHASE_LABEL['week-before']).toBe('Week before period');
  // The header reads "your" only on the week-before row — every other label
  // is shared verbatim between the header and the Compare list.
  expect(PLAIN_PHASE_HEADER_LABEL['week-before']).toBe('Week before your period');
  expect(PLAIN_PHASE_HEADER_LABEL['on-period']).toBe(PLAIN_PHASE_LABEL['on-period']);
  expect(PLAIN_PHASE_HEADER_LABEL['week-after']).toBe(PLAIN_PHASE_LABEL['week-after']);
  expect(PLAIN_PHASE_HEADER_LABEL['mid-cycle']).toBe(PLAIN_PHASE_LABEL['mid-cycle']);
  // No jargon leaks through either map.
  const allLabels = [
    ...Object.values(PLAIN_PHASE_LABEL),
    ...Object.values(PLAIN_PHASE_HEADER_LABEL),
  ].join(' ');
  expect(allLabels.toLowerCase()).not.toMatch(/menstrual|follicular|ovulatory|luteal/);
});

test.describe('nextStartEstimateISO', () => {
  test('her real data: Sep1 + median 27.5 (rounds to 28) = Sep29', () => {
    expect(nextStartEstimateISO(HER_PERIODS)).toBe('2026-09-29');
  });

  test('null with only one period ever logged (nothing to estimate from)', () => {
    expect(nextStartEstimateISO([{ startDate: '2026-09-01' }])).toBeNull();
  });

  test('null with no periods logged', () => {
    expect(nextStartEstimateISO([])).toBeNull();
  });
});

test.describe('periodLogUrgency — the quiet/primary window around a predicted start', () => {
  // Predicted next start: 2026-09-29.
  test('primary from 3 days before the prediction', () => {
    expect(periodLogUrgency(HER_PERIODS, '2026-09-26')).toBe('primary'); // 3 days before
    expect(periodLogUrgency(HER_PERIODS, '2026-09-25')).toBe('quiet'); // 4 days before
  });

  test('primary on the predicted day itself', () => {
    expect(periodLogUrgency(HER_PERIODS, '2026-09-29')).toBe('primary');
  });

  test('primary stays through 7 days after the prediction (a late period is still open)', () => {
    expect(periodLogUrgency(HER_PERIODS, '2026-10-06')).toBe('primary'); // +7 days
    expect(periodLogUrgency(HER_PERIODS, '2026-10-07')).toBe('quiet'); // +8 days, capped
  });

  test('quiet the rest of the month', () => {
    expect(periodLogUrgency(HER_PERIODS, '2026-09-10')).toBe('quiet');
  });

  test('quiet when there is no estimate yet (no periods, or only one ever logged)', () => {
    expect(periodLogUrgency([], '2026-09-25')).toBe('quiet');
    expect(periodLogUrgency([{ startDate: '2026-09-01' }], '2026-09-25')).toBe('quiet');
  });
});

test.describe('todayCycleStatus — the card header', () => {
  test('on her period: plain phase + cycleDay, not overdue', () => {
    const s = todayCycleStatus(HER_PERIODS, '2026-08-06')!; // day 2
    expect(s.plainPhase).toBe('on-period');
    expect(s.cycleDay).toBe(2);
    expect(s.overdue).toBe(false);
  });

  test('the week before period: not overdue while the prediction is still ahead', () => {
    const s = todayCycleStatus(HER_PERIODS, '2026-08-31')!; // 1 day before Sep1
    expect(s.plainPhase).toBe('week-before');
    expect(s.overdue).toBe(false);
    expect(s.nextStart).toBe('2026-09-01');
  });

  test('overdue: the estimated next start has passed with nothing new logged', () => {
    const s = todayCycleStatus(HER_PERIODS, '2026-10-15')!; // well past the ~Sep29 estimate
    expect(s.plainPhase).toBe('week-before');
    expect(s.overdue).toBe(true);
    expect(s.nextStart).toBe('2026-09-29');
  });

  test('null before her first logged period (nothing to place today in)', () => {
    expect(todayCycleStatus(HER_PERIODS, '2026-01-01')).toBeNull();
  });
});

test.describe('buildPlainPhaseTable / buildPlainMoodPhaseTable — bucketed into the 4 plain phases', () => {
  test('a phase gathers sessions from across its technical sub-phases (ovulatory + early luteal -> mid-cycle)', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-17', capacityBefore: 8, capacityAfter: 9 }, // ovulatory
      { date: '2026-08-18', capacityBefore: 8, capacityAfter: 9 }, // ovulatory
      { date: '2026-08-20', capacityBefore: 8, capacityAfter: 9 }, // luteal, not pre-period
    ];
    const rows = buildPlainPhaseTable(sessions, HER_PERIODS);
    const midCycle = rows.find((r) => r.plainPhase === 'mid-cycle')!;
    expect(midCycle.n).toBe(3);
    expect(midCycle.avgBefore).toBeCloseTo(8, 5);
    expect(midCycle.avgAfter).toBeCloseTo(9, 5);
    // Every other phase stays untouched by these 3 sessions.
    for (const r of rows) {
      if (r.plainPhase !== 'mid-cycle') expect(r.n).toBe(0);
    }
  });

  test('all 4 plain phases are always present, even with zero data', () => {
    const rows = buildPlainPhaseTable([], HER_PERIODS);
    expect(rows.map((r) => r.plainPhase)).toEqual(PLAIN_PHASE_ORDER);
    expect(rows.every((r) => r.n === 0 && r.avgBefore === null && r.avgAfter === null)).toBe(true);
  });

  test('under 3 sessions: n is still reported, but avgBefore/avgAfter stay null ("not enough yet")', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-05', capacityBefore: 4, capacityAfter: 6 },
      { date: '2026-08-06', capacityBefore: 4, capacityAfter: 6 },
    ];
    const rows = buildPlainPhaseTable(sessions, HER_PERIODS);
    const onPeriod = rows.find((r) => r.plainPhase === 'on-period')!;
    expect(onPeriod.n).toBe(2);
    expect(onPeriod.avgBefore).toBeNull();
    expect(onPeriod.avgAfter).toBeNull();
  });

  test('mood shares the same bucketing, independently gated from capacity', () => {
    const sessions: MoodSession[] = [
      { date: '2026-08-05', moodBefore: 3, moodAfter: 8 },
      { date: '2026-08-06', moodBefore: 4, moodAfter: 9 },
      { date: '2026-08-07', moodBefore: 2, moodAfter: 7 },
    ];
    const rows = buildPlainMoodPhaseTable(sessions, HER_PERIODS);
    const onPeriod = rows.find((r) => r.plainPhase === 'on-period')!;
    expect(onPeriod.avgBefore).toBeCloseTo(3, 5);
    expect(onPeriod.avgAfter).toBeCloseTo(8, 5);
  });
});

test.describe('plainQuestionLine — the one optional line, in plain words', () => {
  test('names the direction and workout counts, in words, and asks rather than tells', () => {
    const sessions: CapacitySession[] = [
      // week-before (Aug25-31, Sep1 cycle): 3 sessions, lower capacity.
      { date: '2026-08-25', capacityBefore: 4, capacityAfter: 6 },
      { date: '2026-08-27', capacityBefore: 4, capacityAfter: 6 },
      { date: '2026-08-29', capacityBefore: 4, capacityAfter: 6 },
      // rest of cycle, well clear of any pre-period window: 3 sessions, higher.
      { date: '2026-07-10', capacityBefore: 6, capacityAfter: 8 },
      { date: '2026-07-12', capacityBefore: 6, capacityAfter: 8 },
      { date: '2026-07-14', capacityBefore: 6, capacityAfter: 8 },
    ];
    const line = plainQuestionLine(sessions, HER_PERIODS);
    expect(line).not.toBeNull();
    expect(line).toBe(
      'Body before workouts runs about 2 points lower in the week before your period (3 vs 3 workouts). Does that match how it feels?'
    );
    // No jargon, no "n=", no raw decimal, and it's shaped as a question.
    expect(line?.toLowerCase()).not.toMatch(/menstrual|follicular|ovulatory|luteal/);
    expect(line).not.toContain('n=');
    expect(line?.endsWith('?')).toBe(true);
    expect(line?.toLowerCase()).not.toMatch(/should|must|need to/);
  });

  test('null when the gap is under 1 point, same gate as questionLine', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-27', capacityBefore: 6, capacityAfter: 7 },
      { date: '2026-08-28', capacityBefore: 6, capacityAfter: 7 },
      { date: '2026-08-29', capacityBefore: 6.3, capacityAfter: 7 },
      { date: '2026-07-10', capacityBefore: 6, capacityAfter: 7 },
      { date: '2026-07-12', capacityBefore: 6, capacityAfter: 7 },
      { date: '2026-07-14', capacityBefore: 6, capacityAfter: 7 },
    ];
    expect(plainQuestionLine(sessions, HER_PERIODS)).toBeNull();
  });

  test('null when n<3 on either side', () => {
    const sessions: CapacitySession[] = [
      { date: '2026-08-30', capacityBefore: 2, capacityAfter: 4 },
      { date: '2026-07-10', capacityBefore: 6, capacityAfter: 8 },
      { date: '2026-07-12', capacityBefore: 6, capacityAfter: 8 },
      { date: '2026-07-14', capacityBefore: 6, capacityAfter: 8 },
    ];
    expect(plainQuestionLine(sessions, HER_PERIODS)).toBeNull();
  });
});
