// tests/replay-core.ts — the week-clock replay, one shared computation
// (code-shape step 5a, Oct 13 2026).
//
// WHAT: given a set of sessions + "Move on" rows, asks the CURRENT week clock
// (program-week.ts / week.ts) the same questions the app asks, for every day
// of a window at 09:00, 21:00 and 23:59 Asia/Jerusalem, and returns plain JSON.
// WHY: step 5 reshapes week.ts (and later the plan lookup). The refactor must
// change NOTHING a user can see, so the answers are recorded BEFORE it
// (baseline) and compared AFTER it. Two callers share this one function:
//   - tests/replay.test.ts            synthetic, data-free, golden in CI
//   - scripts/replay-week-clock.mjs   her real rows, read-only, local only
// (the script bundles this file with esbuild so plain Node can run it).
// No DOM, no storage, no network here. Runs in the process's local timezone —
// callers pin TZ=Asia/Jerusalem first.

import {
  completionClosingSessionIds,
  currentHowToWeekKey,
  gapCountsBackToWeekKey,
  getProgramWeek,
  getTodaysPick,
  homeWeekOffset,
  isNowAfterCompletionLaunch,
  currentWeekPlan,
  planForLog,
  planKeyForLog,
  shownWeek,
  weekModel,
  weekSubLabel,
  type WeekClockInput,
} from '../program-week';
import { canMoveOn } from '../week';
import { planForWeekKey, ROUNDS, type Workout } from '../program';
import { weekStartIso } from '../dates';
import type { LogEntry } from '../types';

export type ReplaySession = {
  id: string;
  date: string;
  workout: 'A' | 'B' | 'C' | 'D';
  /** When the row came to exist in the app (default: its own date). The app
   *  does NOT filter sessions by date - loadLogs() hands the week clock every
   *  stored row, future-dated ones included - so the replay's only filter is
   *  "did this row exist yet", never "is its date <= now". A fixture row whose
   *  `date` is after its `loggedAt` is a future-dated session the app would
   *  really hold. Her real rows carry no created-at in the replay's read, so
   *  there loggedAt = date (no future-dated rows can be modelled from real data). */
  loggedAt?: string;
};
export type ReplayMove = { round: number; week: number; at: string };
export type ReplayInput = {
  sessions: ReplaySession[];
  moves: ReplayMove[];
  /** Hypothetical extra rounds (e.g. a Round 3), put on ROUNDS only while a
   *  snapshot is computed, and only from `addedAt` (default: the round's own
   *  start) - i.e. the code "gained" the round when it began, as a real Round 3
   *  would be added to program.ts. Since v62.1 a round put on ROUNDS BEFORE its
   *  start date takes effect on its date, not at once (week.ts applies a
   *  RoundStart only when its instant <= now), so an earlier `addedAt` is safe
   *  and tests/replay.test.ts proves it. The golden fixture keeps the default.
   *  Synthetic fixtures only; absent = the real ROUNDS. */
  rounds?: { num: number; start: string; addedAt?: string }[];
};

export const REPLAY_FROM = '2026-09-26'; // the completion launch day
export const REPLAY_TIMES: [number, number][] = [
  [9, 0],
  [21, 0],
  [23, 59],
];

const pad = (n: number): string => String(n).padStart(2, '0');

/** A Date as local "YYYY-MM-DDTHH:MM" (the process timezone). */
function localStamp(d: Date): string {
  return `${weekStartIso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Every grid instant: each day from `from` to `to` (inclusive, 'YYYY-MM-DD'),
 *  at 09:00, 21:00 and 23:59 local. */
export function replayGrid(from: string, to: string): Date[] {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  const last = new Date(ty, tm - 1, td).getTime();
  const out: Date[] = [];
  for (let day = new Date(fy, fm - 1, fd); day.getTime() <= last; day.setDate(day.getDate() + 1)) {
    for (const [h, m] of REPLAY_TIMES) {
      out.push(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0));
    }
  }
  return out;
}

/** 'YYYY-MM-DD' + n local calendar days. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return weekStartIso(new Date(y, m - 1, d + n));
}

function toLog(s: ReplaySession): LogEntry {
  return {
    id: s.id,
    date: s.date,
    workout: s.workout,
    capacityBefore: null,
    capacityAfter: null,
    wallSitSec: 0,
    backPain: null,
    word: '',
  };
}

/** program-week.ts's planForLog needs app.ts's Workout D; the replay only
 *  reads its name, so a stub with the same name is enough. */
const D_STUB = (): Workout => ({ id: 'D', name: 'D (stub)' }) as unknown as Workout;

const keyStr = (k: { round: number; week: number } | null): string | null =>
  k ? `R${k.round}W${k.week}` : null;

export type ReplaySnapshot = Record<string, unknown>;

/** What the clock says at one instant, given only what existed by then. */
function snapshotAt(now: Date, input: ReplayInput): ReplaySnapshot {
  const t = now.getTime();
  // The app keeps its list newest-first (getTodaysPick reads logs[0]).
  const logs = input.sessions
    .filter((s) => new Date(s.loggedAt ?? s.date).getTime() <= t)
    .map(toLog)
    .sort((a, b) => b.date.localeCompare(a.date));
  const moves = input.moves
    .filter((m) => new Date(m.at).getTime() <= t)
    .map((m) => ({ round: m.round, week: m.week, at: m.at, missing: '' }));
  const wc: WeekClockInput = { logs, moves, now };

  const warns: string[] = [];
  const realWarn = console.warn;
  console.warn = (...a: unknown[]): void => {
    warns.push(a.map(String).join(' '));
  };
  try {
    const model = weekModel(wc);
    const shown = shownWeek(wc);
    // Step 5c: the plan row for "now" is found by week key (pre-5c it went via a
    // synthetic calendar date, captured here as plan.date and programWeek.plan -
    // both gone with it; every plan-ROW field below is unchanged).
    const row = currentWeekPlan(wc);
    const pw = getProgramWeek(now);
    const planKeys: Record<string, string | null> = {};
    const planNames: Record<string, string> = {};
    for (const l of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
      planKeys[l.id ?? l.date] = keyStr(planKeyForLog(l, wc));
      // The plan a SAVED session used (what planForLog hands post-log / history):
      // its workout name is enough to tell two weeks' content apart.
      planNames[l.id ?? l.date] = planForLog(l, wc, D_STUB).name;
    }
    const lookupKey = gapCountsBackToWeekKey(wc) ?? shown.key;
    const keyed = planForWeekKey(lookupKey);
    return {
      t: localStamp(now),
      afterLaunch: isNowAfterCompletionLaunch(now),
      sessions: logs.length,
      week: {
        shown: keyStr(shown.key),
        subLabel: weekSubLabel(shown, wc),
        canMoveOn: model.open ? canMoveOn(model.open, now) : null,
        open: model.open
          ? {
              key: keyStr(model.open.key),
              openedAt: model.open.openedAt,
              done: model.open.done.join(''),
              missing: model.open.missing.join(''),
              sessions: model.open.sessions.map((s) => s.id),
            }
          : null,
        pending: model.pending
          ? { key: keyStr(model.pending.key), opensAt: model.pending.opensAt }
          : null,
        gapCountsBackTo: keyStr(gapCountsBackToWeekKey(wc)),
        howTo: `R${currentHowToWeekKey(wc).round}W${currentHowToWeekKey(wc).num}`,
        closingIds: [...completionClosingSessionIds(wc)].sort(),
        spans: model.spans.map((s) => ({
          key: keyStr(s.key),
          openedAt: s.openedAt,
          closedAt: s.closedAt,
          how: s.how,
          sessions: s.sessions.map((x) => x.id),
          done: s.done.join(''),
          missing: s.missing.join(''),
        })),
        weekOf: [...model.weekOf.entries()].map(([id, k]) => `${id}=${keyStr(k)}`).sort(),
      },
      plan: {
        row: { round: row.round ?? 1, weekNum: row.weekNum, label: row.label ?? null },
        byKey: {
          key: keyStr(lookupKey),
          round: keyed.plan.round ?? 1,
          weekNum: keyed.plan.weekNum,
          label: keyed.plan.label ?? null,
          repeatsWeek: keyed.repeatsWeek,
        },
        A: row.workouts.A.name,
        B: row.workouts.B.name,
        C: row.workouts.C.name,
      },
      programWeek: {
        now: {
          round: pw.round,
          num: pw.num,
          start: weekStartIso(pw.start),
          skipped: pw.skippedLabel,
        },
      },
      homeWeekOffset: homeWeekOffset(logs, now),
      todaysPick: getTodaysPick(logs, now),
      planKeyForLog: planKeys,
      planForLog: planNames,
      warns,
    };
  } finally {
    console.warn = realWarn;
  }
}

export type ReplayResult = {
  meta: { from: string; to: string; times: string[]; snapshots: number };
  snapshots: ReplaySnapshot[];
};

/** Run the whole grid. `to` is the last day replayed (callers pass today+60). */
export function computeReplay(input: ReplayInput, from: string, to: string): ReplayResult {
  const grid = replayGrid(from, to);
  const snapshots = grid.map((now) => {
    const t = now.getTime();
    const added = (input.rounds ?? [])
      .filter((r) => new Date(r.addedAt ?? `${r.start}T00:00:00`).getTime() <= t)
      .filter((r) => !ROUNDS.some((x) => x.num === r.num))
      .map((r) => ({ num: r.num, start: r.start }));
    ROUNDS.push(...added);
    try {
      return snapshotAt(now, input);
    } finally {
      for (const r of added) ROUNDS.splice(ROUNDS.indexOf(r), 1);
    }
  });
  return {
    meta: {
      from,
      to,
      times: REPLAY_TIMES.map(([h, m]) => `${pad(h)}:${pad(m)}`),
      snapshots: grid.length,
    },
    snapshots,
  };
}

/** One snapshot per line, so a diff points at the instant that moved. */
export function replayToJson(r: ReplayResult): string {
  return (
    `{"meta":${JSON.stringify(r.meta)},"snapshots":[\n` +
    r.snapshots.map((s) => JSON.stringify(s)).join(',\n') +
    `\n]}\n`
  );
}

/** Flatten to leaf paths -> primitive, for a field-by-field comparison. */
export function flattenLeaves(
  v: unknown,
  prefix = '',
  out: Map<string, string> = new Map()
): Map<string, string> {
  if (v !== null && typeof v === 'object') {
    if (Array.isArray(v)) {
      if (v.length === 0) out.set(`${prefix}[]`, '[]');
      v.forEach((x, i) => flattenLeaves(x, `${prefix}[${i}]`, out));
    } else {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) out.set(`${prefix}{}`, '{}');
      for (const [k, x] of entries) flattenLeaves(x, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out.set(prefix, JSON.stringify(v));
  }
  return out;
}

/** Compare two replay results by leaf field; returns the counts and every diff. */
export function compareReplays(
  a: ReplayResult,
  b: ReplayResult
): { snapshots: number; fields: number; diffs: string[] } {
  const diffs: string[] = [];
  let fields = 0;
  const n = Math.max(a.snapshots.length, b.snapshots.length);
  for (let i = 0; i < n; i++) {
    const sa = a.snapshots[i];
    const sb = b.snapshots[i];
    const stamp = String((sa ?? sb)?.['t'] ?? i);
    const fa = flattenLeaves(sa ?? null);
    const fb = flattenLeaves(sb ?? null);
    for (const path of new Set([...fa.keys(), ...fb.keys()])) {
      fields++;
      if (fa.get(path) !== fb.get(path))
        diffs.push(
          `${stamp} ${path}: ${fa.get(path) ?? '(missing)'} -> ${fb.get(path) ?? '(missing)'}`
        );
    }
  }
  return { snapshots: n, fields, diffs };
}
