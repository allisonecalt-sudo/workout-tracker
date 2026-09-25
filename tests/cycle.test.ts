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
  prePeriodVsRest,
  questionLine,
  excludedUntouchedCount,
  buildTimeline,
  honestBefore,
  honestAfter,
  MIN_PHASE_N,
  V48_CUTOFF_DATE,
  type CyclePeriod,
  type CapacitySession,
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
    // last start Sep1 2026; median length 27.5 -> estimated next start = Sep1 + 27.5 (rounds via day math)
    const r = phaseForDate('2026-09-10', HER_PERIODS); // day 10, into the open cycle
    expect(r?.estimated).toBe(true);
    expect(r?.cycleLength).toBe(27.5);
    expect(r?.nextStart).toBe('2026-09-28'); // Sep1 + 27.5 days, floored by Date arithmetic
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
