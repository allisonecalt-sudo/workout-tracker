// tests/sync.test.ts - characterisation tests for sync.ts (code-shape step 9a, Oct 14 2026).
//
// sync.ts left app.ts with no behaviour change, so these assert what the code does TODAY
// (the regression guards the v33 / v53 / T1 fixes left behind), in plain Node with a mocked
// `fetch` and an in-memory localStorage. No `page` fixture, so Playwright runs this in Node.
//
// Covered: the v33 deletion rule (an empty remote never deletes local rows), the 0-row PATCH
// (= not synced), the 6-column edit allow-list, the tiered PGRST204 fallback, and the merge of
// remote sessions (incl. completionClosingSessionIds protecting a week-closing session).

import { test, expect } from '@playwright/test';
import {
  mergeRemoteSessions,
  patchLogToSupabase,
  patchMatchedARow,
  patchSessionRequest,
  pushLogToSupabase,
  pushSessionTiered,
  pullFromSupabase,
  sessionPayload,
  legacySessionPayload,
  timingStrippedSessionPayload,
  syncDisabled,
  SUPABASE_URL,
} from '../sync';
import {
  PULL_LIMIT,
  STORAGE_KEY,
  state,
  loadLogs,
  writeLogs,
  loadCyclePeriods,
  writeCyclePeriods,
  loadWeekMoves,
  writeWeekMoves,
  loadWalks,
  writeWalks,
} from '../state';
import { pushCyclePeriod, pullCyclePeriodsFromSupabase, deleteCyclePeriod } from '../sync-cycle';
import {
  mergeWeekMoves,
  deleteWeekMove,
  weekMovePayload,
  pushWeekMove,
  pullWeekMovesFromSupabase,
} from '../sync-week-moves';
import { pushWalk, fetchFitSteps } from '../sync-movement';
import { setRenderer } from '../bus';
import type { LogEntry } from '../types';

// ---- in-memory localStorage + a recording fetch ------------------------------------------
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[] = [];
let replies: Response[] = [];
const realFetch = globalThis.fetch;

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(status === 204 ? null : text, { status, headers });
}

test.beforeEach(() => {
  store.clear();
  calls = [];
  replies = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    });
    const next = replies.shift();
    if (!next) throw new Error('unexpected fetch: no reply queued');
    return next;
  }) as typeof fetch;
});
test.afterAll(() => {
  globalThis.fetch = realFetch;
});

function log(id: string, date: string, over: Partial<LogEntry> = {}): LogEntry {
  return {
    id,
    date,
    workout: 'A',
    capacityBefore: 5,
    capacityAfter: 6,
    wallSitSec: 0,
    backPain: null,
    word: '',
    synced: true,
    ...over,
  };
}

/** A server row for `merge` (the minimum RemoteSession shape). */
function remoteRow(id: string, date: string, over: Record<string, unknown> = {}) {
  return {
    id,
    date,
    workout_type: 'A' as const,
    capacity_before_1_10: 5,
    capacity_after_1_10: 6,
    wall_sit_seconds: null,
    pain_back_0_10: null,
    one_word: null,
    started_at: null,
    completed_at: null,
    duration_seconds: null,
    ...over,
  };
}

test.describe('sync - the automation gate', () => {
  test('syncDisabled() is false in plain Node (navigator.webdriver is not true)', () => {
    expect(syncDisabled()).toBe(false);
  });
});

test.describe('sync - mergeRemoteSessions: the v33 deletion rule', () => {
  const local = [
    log('s1', '2026-09-20T10:00:00+03:00'),
    log('s2', '2026-09-22T10:00:00+03:00'),
    log('s3', '2026-09-24T10:00:00+03:00'),
  ];

  test('an EMPTY remote never deletes local rows', () => {
    const merged = mergeRemoteSessions(local, []);
    expect(merged.map((l) => l.id)).toEqual(['s3', 's2', 's1']); // newest first, all kept
    expect(merged.every((l) => l.staleRemoteDelete === undefined)).toBe(true);
  });

  test('a synced local row missing from a short (whole-history) remote is deleted', () => {
    const merged = mergeRemoteSessions(local, [
      remoteRow('s1', local[0]!.date),
      remoteRow('s3', local[2]!.date),
    ]);
    expect(merged.map((l) => l.id)).toEqual(['s3', 's1']);
  });

  test('an UNSYNCED local row missing from the remote is never deleted', () => {
    const withUnsynced = [...local, log('u1', '2026-09-25T10:00:00+03:00', { synced: false })];
    const merged = mergeRemoteSessions(withUnsynced, [remoteRow('s1', local[0]!.date)]);
    expect(merged.map((l) => l.id)).toContain('u1');
    expect(merged.find((l) => l.id === 'u1')?.synced).toBe(false);
  });

  test('a row OLDER than a full window is left alone (it may just be past the window)', () => {
    const remote = Array.from({ length: PULL_LIMIT }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 10, 8, 0, 0) - i * 86_400_000).toISOString();
      return remoteRow(`r${i}`, d);
    });
    const old = log('old', '2026-01-05T10:00:00+03:00'); // older than the oldest remote row
    const merged = mergeRemoteSessions([old], remote);
    expect(merged.some((l) => l.id === 'old')).toBe(true);
    expect(merged).toHaveLength(PULL_LIMIT + 1);
  });

  test('a row INSIDE a full window that the server no longer has is deleted', () => {
    const remote = Array.from({ length: PULL_LIMIT }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 10, 8, 0, 0) - i * 86_400_000).toISOString();
      return remoteRow(`r${i}`, d);
    });
    const inside = log('gone', '2026-10-05T10:00:00+03:00');
    expect(mergeRemoteSessions([inside], remote).some((l) => l.id === 'gone')).toBe(false);
  });
});

test.describe('sync - mergeRemoteSessions: protected and unsynced rows', () => {
  test('a synced session that CLOSED a completion-model week survives the server dropping it, flagged', () => {
    const a = log('c1', '2026-09-27T10:00:00+03:00', { workout: 'A' });
    const b = log('c2', '2026-09-28T10:00:00+03:00', { workout: 'B' });
    const c = log('c3', '2026-09-29T10:00:00+03:00', { workout: 'C' }); // the third letter closes the week
    const errors: unknown[][] = [];
    const realError = console.error;
    console.error = (...a2: unknown[]) => void errors.push(a2);
    try {
      const merged = mergeRemoteSessions(
        [a, b, c],
        [remoteRow('c1', a.date), remoteRow('c2', b.date)]
      );
      const kept = merged.find((l) => l.id === 'c3');
      expect(kept).toBeDefined();
      expect(kept?.staleRemoteDelete).toBe(true);
      expect(String(errors[0]?.[0])).toContain('refusing to drop session c3');
    } finally {
      console.error = realError;
    }
  });

  test('local-unsynced wins on content, and the server having its id marks it synced', () => {
    const mine = log('u1', '2026-09-26T10:00:00+03:00', { synced: false, word: 'mine' });
    const merged = mergeRemoteSessions(
      [mine],
      [remoteRow('u1', mine.date, { one_word: 'theirs' })]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.word).toBe('mine');
    expect(merged[0]?.synced).toBe(true);
  });

  test('an unsynced EDIT (pendingEdit) stays unsynced even though the server has the id', () => {
    const mine = log('u1', '2026-09-26T10:00:00+03:00', { synced: false, pendingEdit: true });
    const merged = mergeRemoteSessions([mine], [remoteRow('u1', mine.date)]);
    expect(merged[0]?.synced).toBe(false);
    expect(merged[0]?.pendingEdit).toBe(true);
  });

  test('a synced local row is replaced by the remote copy, with the round-tripped columns', () => {
    const old = log('s1', '2026-09-26T10:00:00+03:00', { word: 'stale' });
    const merged = mergeRemoteSessions(
      [old],
      [
        remoteRow('s1', old.date, {
          one_word: 'fresh',
          elliptical_km: '3.25',
          elliptical_kcal: '41.5',
          step_feel: 'bogus',
          break_minutes: 7,
          mood_before: 4,
        }),
      ]
    );
    const row = merged[0]!;
    expect(row.word).toBe('fresh');
    expect(row.ellipticalKm).toBe(3.25);
    expect(row.ellipticalKcal).toBe(41.5);
    expect(row.stepFeel).toBeNull(); // only 'fine' / 'too_much' survive
    expect(row.breakMinutes).toBeNull(); // only 0 / 5 / 15 / 30 survive
    expect(row.moodBefore).toBe(4);
    expect(row.synced).toBe(true);
  });
});

test.describe('sync - the edit PATCH', () => {
  const entry = log('e1', '2026-09-30T10:00:00+03:00', {
    synced: false,
    pendingEdit: true,
    ellipticalKm: 2.5,
    ellipticalKcal: 30,
    ellipticalTimeSec: 600,
    ellipticalLevel: 4,
    ellipticalPulse: 120,
    sessionNote: 'felt ok',
  });

  test('the PATCH body carries exactly the 6 allow-listed columns; the id is in the URL only', () => {
    const { url, body } = patchSessionRequest(entry);
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/workout_sessions?id=eq.e1`);
    expect(Object.keys(body).sort()).toEqual(
      [
        'elliptical_kcal',
        'elliptical_km',
        'elliptical_level',
        'elliptical_pulse',
        'elliptical_time_sec',
        'session_note',
      ].sort()
    );
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('date');
    expect(body['elliptical_km']).toBe(2.5);
  });

  test('the legacy PATCH body is just `notes`', () => {
    const { body } = patchSessionRequest(entry, true);
    expect(Object.keys(body)).toEqual(['notes']);
  });

  test('patchMatchedARow: only a non-empty array counts as matched', () => {
    expect(patchMatchedARow([])).toBe(false);
    expect(patchMatchedARow([{ id: 'e1' }])).toBe(true);
    expect(patchMatchedARow(null)).toBe(false);
    expect(patchMatchedARow({})).toBe(false);
    expect(patchMatchedARow(undefined)).toBe(false);
  });

  test('a 200 with ZERO matched rows is NOT synced: the row stays queued (synced:false, pendingEdit)', async () => {
    writeLogs([entry]);
    replies.push(reply(200, []));
    const ok = await patchLogToSupabase(entry);
    expect(ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PATCH');
    expect(calls[0]?.headers['Prefer']).toBe('return=representation');
    const stored = loadLogs().find((l) => l.id === 'e1');
    expect(stored?.synced).toBe(false);
    expect(stored?.pendingEdit).toBe(true);
  });

  test('a 200 with a matched row marks the edit synced and clears pendingEdit', async () => {
    writeLogs([entry]);
    replies.push(reply(200, [{ id: 'e1' }]));
    expect(await patchLogToSupabase(entry)).toBe(true);
    const stored = loadLogs().find((l) => l.id === 'e1');
    expect(stored?.synced).toBe(true);
    expect(stored?.pendingEdit).toBe(false);
  });

  test('a PGRST204 400 retries the edit once with the legacy (notes-only) body', async () => {
    writeLogs([entry]);
    replies.push(reply(400, '{"code":"PGRST204"}'), reply(200, [{ id: 'e1' }]));
    expect(await patchLogToSupabase(entry)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[1]?.body as object)).toEqual(['notes']);
  });
});

test.describe('sync - the tiered session push (PGRST204 fallback)', () => {
  const entry = log('p1', '2026-09-29T10:00:00+03:00', {
    synced: false,
    moodBefore: 4,
    herStartAt: '2026-09-29T09:58:00+03:00',
    herStartConfirmed: true,
    breakMinutes: 5,
    cardioLane: 'elliptical',
    cardioMinutes: 30,
    ellipticalLevel: 5,
  });

  function recorder(statuses: Array<[number, string]>) {
    const seen: Record<string, unknown>[] = [];
    let i = 0;
    return {
      seen,
      post: async (payload: Record<string, unknown>) => {
        seen.push(payload);
        const [status, body] = statuses[Math.min(i++, statuses.length - 1)]!;
        return new Response(body, { status });
      },
    };
  }

  test('tier 1 works: one POST of the full row, and the log is marked synced', async () => {
    writeLogs([entry]);
    const r = recorder([[201, '']]);
    expect(await pushSessionTiered(entry, r.post)).toBe(true);
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]).toHaveProperty('her_start_at');
    expect(loadLogs().find((l) => l.id === 'p1')?.synced).toBe(true);
  });

  test('PGRST204 once: tier 2 drops ONLY the 5 timing columns, keeps mood and the ride numbers', async () => {
    writeLogs([entry]);
    const r = recorder([
      [400, '{"code":"PGRST204"}'],
      [201, ''],
    ]);
    expect(await pushSessionTiered(entry, r.post)).toBe(true);
    expect(r.seen).toHaveLength(2);
    for (const col of [
      'her_start_at',
      'her_start_confirmed',
      'her_end_at',
      'her_end_confirmed',
      'break_minutes',
    ])
      expect(r.seen[1]).not.toHaveProperty(col);
    expect(r.seen[1]).toHaveProperty('mood_before', 4);
    expect(r.seen[1]).toHaveProperty('elliptical_level', 5);
    expect(r.seen[1]).toEqual(timingStrippedSessionPayload(entry));
  });

  test('PGRST204 twice: tier 3 is the full legacy row (no v48+ columns, ride marker folded into notes)', async () => {
    writeLogs([entry]);
    const r = recorder([
      [400, '{"code":"PGRST204"}'],
      [400, '{"code":"PGRST204"}'],
      [201, ''],
    ]);
    expect(await pushSessionTiered(entry, r.post)).toBe(true);
    expect(r.seen).toHaveLength(3);
    expect(r.seen[2]).toEqual(legacySessionPayload(entry));
    expect(r.seen[2]).not.toHaveProperty('mood_before');
    expect(r.seen[2]).not.toHaveProperty('elliptical_level');
    expect(String(r.seen[2]?.['notes'])).toContain('cardio: elliptical 30 min');
  });

  test('a 400 that is NOT PGRST204 fails at once: no retry, not marked synced', async () => {
    writeLogs([entry]);
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      const r = recorder([[400, '{"code":"23514"}']]);
      expect(await pushSessionTiered(entry, r.post)).toBe(false);
      expect(r.seen).toHaveLength(1);
      expect(loadLogs().find((l) => l.id === 'p1')?.synced).toBe(false);
    } finally {
      console.warn = warn;
    }
  });

  test('an entry with no id is never pushed', async () => {
    const r = recorder([[201, '']]);
    expect(await pushSessionTiered({ ...entry, id: undefined }, r.post)).toBe(false);
    expect(r.seen).toHaveLength(0);
  });

  test('sessionPayload: the id and the plain column mapping', () => {
    const p = sessionPayload(entry);
    expect(p['id']).toBe('p1');
    expect(p['workout_type']).toBe('A');
    expect(p['mood_before']).toBe(4);
    expect(p['her_start_confirmed']).toBe(true);
    expect(p['notes']).toBeNull();
  });

  test('pushLogToSupabase POSTs a one-row array with ignore-duplicates to workout_sessions', async () => {
    writeLogs([entry]);
    replies.push(reply(201, ''));
    expect(await pushLogToSupabase(entry)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${SUPABASE_URL}/rest/v1/workout_sessions`);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers['Prefer']).toBe('return=minimal,resolution=ignore-duplicates');
    expect(Array.isArray(calls[0]?.body)).toBe(true);
    expect((calls[0]?.body as unknown[]).length).toBe(1);
  });
});

test.describe('sync - pullFromSupabase', () => {
  test('a pull merges the remote into local storage and redraws Home through the bus', async () => {
    let draws = 0;
    setRenderer(() => void draws++);
    state.screen = 'home';
    writeLogs([log('s1', '2026-09-20T10:00:00+03:00', { word: 'old' })]);
    replies.push(reply(200, [remoteRow('s1', '2026-09-20T10:00:00+03:00', { one_word: 'new' })]));
    await pullFromSupabase();
    expect(calls[0]?.url).toBe(
      `${SUPABASE_URL}/rest/v1/workout_sessions?select=*&order=date.desc&limit=${PULL_LIMIT}`
    );
    expect(loadLogs()[0]?.word).toBe('new');
    expect(draws).toBe(1);
  });

  test('a service-worker-cached answer (X-SW-Cache: 1) is NOT merged', async () => {
    state.screen = 'progress';
    writeLogs([log('s1', '2026-09-20T10:00:00+03:00')]);
    replies.push(reply(200, [], { 'X-SW-Cache': '1' }));
    await pullFromSupabase();
    expect(loadLogs().map((l) => l.id)).toEqual(['s1']); // an empty (cached) answer deleted nothing
    expect(store.get(STORAGE_KEY)).toBeDefined();
  });

  test('a failed pull changes nothing', async () => {
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      writeLogs([log('s1', '2026-09-20T10:00:00+03:00', { word: 'keep' })]);
      replies.push(reply(500, 'boom'));
      await pullFromSupabase();
      expect(loadLogs()[0]?.word).toBe('keep');
    } finally {
      console.warn = warn;
    }
  });
});

// ---- step 9b: the other tables (cycle_periods, week_moves, movement_log) -------------------
test.describe('sync - cycle_periods, week_moves and walks (step 9b, characterisation)', () => {
  test('pushCyclePeriod upserts on start_date and marks the local row synced on ok', async () => {
    writeCyclePeriods([{ startDate: '2026-10-01', source: 'app', note: null, synced: false }]);
    replies.push(reply(201, ''));
    await pushCyclePeriod({ startDate: '2026-10-01', source: 'app', note: null, synced: false });
    expect(calls[0]?.url).toBe(`${SUPABASE_URL}/rest/v1/cycle_periods?on_conflict=start_date`);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers['Prefer']).toBe('resolution=merge-duplicates,return=minimal');
    expect(calls[0]?.body).toEqual({ start_date: '2026-10-01', source: 'app', note: null });
    expect(loadCyclePeriods()[0]?.synced).toBe(true);
  });

  test('a failed cycle push leaves the row unsynced (it is retried on the next flush)', async () => {
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      writeCyclePeriods([{ startDate: '2026-10-01', source: 'app', note: null, synced: false }]);
      replies.push(reply(500, 'no'));
      await pushCyclePeriod({ startDate: '2026-10-01', source: 'app', note: null, synced: false });
      expect(loadCyclePeriods()[0]?.synced).toBe(false);
    } finally {
      console.warn = warn;
    }
  });

  test('week_moves: an unsynced local move wins the merge; Undo drops the tombstone only when the DELETE succeeds', async () => {
    const mine = { round: 2, week: 6, at: '2026-10-12T10:00:00Z', missing: 'C', synced: false };
    const merged = mergeWeekMoves(
      [mine],
      [{ round: 2, week: 6, moved_at: '2026-10-11T10:00:00Z', missing: 'B' }]
    );
    expect(merged).toEqual([mine]);
    expect(weekMovePayload(mine)).toEqual({
      round: 2,
      week: 6,
      moved_at: '2026-10-12T10:00:00Z',
      missing: 'C',
    });

    const tomb = { ...mine, deleted: true };
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      writeWeekMoves([tomb]);
      replies.push(reply(500, 'no'));
      await deleteWeekMove(2, 6);
      expect(loadWeekMoves()).toHaveLength(1); // kept for the next retry
      replies.push(reply(204, null));
      await deleteWeekMove(2, 6);
      expect(loadWeekMoves()).toHaveLength(0);
      expect(calls[1]?.url).toBe(`${SUPABASE_URL}/rest/v1/week_moves?round=eq.2&week=eq.6`);
      expect(calls[1]?.method).toBe('DELETE');
    } finally {
      console.warn = warn;
    }
  });

  test('pushWalk POSTs minutes only to movement_log and marks the walk synced', async () => {
    const walk = { id: 'w1', date: '2026-10-12T09:00:00.000Z', minutes: 12, synced: false };
    writeWalks([walk]);
    replies.push(reply(201, ''));
    await pushWalk(walk);
    expect(calls[0]?.url).toBe(`${SUPABASE_URL}/rest/v1/movement_log`);
    expect(calls[0]?.body).toMatchObject({ kind: 'walk', minutes: 12, meters: null, steps: null });
    expect(loadWalks()[0]?.synced).toBe(true);
  });

  test('fetchFitSteps: a number from the edge function, null on any failure or a bad window', async () => {
    replies.push(reply(200, { steps: 4210 }));
    expect(await fetchFitSteps(1000, 5000)).toBe(4210);
    expect(calls[0]?.url).toBe(`${SUPABASE_URL}/functions/v1/fit-steps`);
    expect(calls[0]?.body).toEqual({ startMillis: 1000, endMillis: 5000 });
    replies.push(reply(500, ''));
    expect(await fetchFitSteps(1000, 5000)).toBeNull();
    expect(await fetchFitSteps(5000, 1000)).toBeNull(); // end before start: no request
    expect(calls).toHaveLength(2);
  });
});

// ---- step 9c: the four mutants the step-9 checker found alive ------------------------------
test.describe('sync - step 9c: guards on her cycle and week-move data', () => {
  test('cycle undo DELETEs exactly the period start date (eq., one row), nothing broader', async () => {
    replies.push(reply(204, null));
    await deleteCyclePeriod('2026-10-01');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url).toBe(`${SUPABASE_URL}/rest/v1/cycle_periods?start_date=eq.2026-10-01`);
  });

  test('mergeCyclePeriods (through the pull): unsynced local rows win, synced ones follow the remote', async () => {
    state.screen = 'cycle';
    setRenderer(() => undefined);
    writeCyclePeriods([
      { startDate: '2026-10-01', source: 'app', note: 'mine', synced: false }, // unsynced, also on remote
      { startDate: '2026-09-01', source: 'app', note: null, synced: false }, // unsynced, not on remote
      { startDate: '2026-08-01', source: 'app', note: 'old', synced: true }, // synced, on remote
      { startDate: '2026-07-01', source: 'app', note: null, synced: true }, // synced, gone from remote
      { startDate: '2026-06-01', source: 'app', note: null } as never, // legacy row, no flag: treated as synced
    ]);
    replies.push(
      reply(200, [
        { start_date: '2026-10-01', source: 'claude', note: 'theirs' },
        { start_date: '2026-08-01', source: null, note: 'fresh' },
        { start_date: '2026-05-01' }, // new on remote; absent source/note become null
      ])
    );
    await pullCyclePeriodsFromSupabase();
    expect(calls[0]?.url).toBe(
      `${SUPABASE_URL}/rest/v1/cycle_periods?select=start_date,source,note&order=start_date.desc`
    );
    expect(loadCyclePeriods()).toEqual([
      { startDate: '2026-10-01', source: 'app', note: 'mine', synced: false },
      { startDate: '2026-09-01', source: 'app', note: null, synced: false },
      { startDate: '2026-08-01', source: null, note: 'fresh', synced: true },
      { startDate: '2026-05-01', source: null, note: null, synced: true },
    ]);
  });

  test('a service-worker-cached cycle answer (X-SW-Cache: 1) is NOT merged', async () => {
    state.screen = 'cycle';
    setRenderer(() => undefined);
    const mine = [{ startDate: '2026-10-01', source: 'app', note: null, synced: true }];
    writeCyclePeriods(mine);
    replies.push(
      reply(200, [{ start_date: '2026-05-01', source: null, note: null }], { 'X-SW-Cache': '1' })
    );
    await pullCyclePeriodsFromSupabase();
    expect(loadCyclePeriods()).toEqual(mine); // the stale row was not added
  });

  test('a service-worker-cached week_moves answer is NOT merged either', async () => {
    const mine = [{ round: 1, week: 2, at: '2026-10-01T10:00:00Z', missing: '', synced: true }];
    writeWeekMoves(mine);
    replies.push(
      reply(200, [{ round: 3, week: 4, moved_at: '2026-10-02T10:00:00Z', missing: null }], {
        'X-SW-Cache': '1',
      })
    );
    await pullWeekMovesFromSupabase();
    expect(loadWeekMoves()).toEqual(mine);
  });

  test('week-move tombstone guard: a push that lands after Undo leaves the tombstone pending, not synced', async () => {
    const move = { round: 2, week: 6, at: '2026-10-12T10:00:00Z', missing: 'C', synced: false };
    // she tapped Undo while the push was in flight: local now holds the delete tombstone
    writeWeekMoves([{ ...move, deleted: true }]);
    replies.push(reply(201, ''));
    await pushWeekMove(move);
    expect(loadWeekMoves()).toEqual([{ ...move, deleted: true }]); // still pending-delete
    // and the normal case still marks the live move synced
    writeWeekMoves([move]);
    replies.push(reply(201, ''));
    await pushWeekMove(move);
    expect(loadWeekMoves()).toEqual([{ ...move, synced: true }]);
  });
});

// ---- v62.2: an empty pull never deletes local rows (the v33 sessions rule, now for all) ----
test.describe('sync - v62.2: an empty remote never deletes local cycle periods or week moves', () => {
  test('cycle_periods: an EMPTY pull keeps synced local rows (and unsynced ones)', async () => {
    state.screen = 'cycle';
    setRenderer(() => undefined);
    const mine = [
      { startDate: '2026-10-01', source: 'app', note: null, synced: false },
      { startDate: '2026-09-01', source: 'app', note: 'x', synced: true },
      { startDate: '2026-08-01', source: null, note: null, synced: true },
    ];
    writeCyclePeriods(mine);
    replies.push(reply(200, []));
    await pullCyclePeriodsFromSupabase();
    expect(loadCyclePeriods()).toEqual(mine);
  });

  test('cycle_periods: a NON-empty pull that lacks one synced row still removes it', async () => {
    state.screen = 'cycle';
    setRenderer(() => undefined);
    writeCyclePeriods([
      { startDate: '2026-09-01', source: 'app', note: null, synced: true },
      { startDate: '2026-08-01', source: 'app', note: null, synced: true },
    ]);
    replies.push(reply(200, [{ start_date: '2026-09-01', source: 'app', note: null }]));
    await pullCyclePeriodsFromSupabase();
    expect(loadCyclePeriods().map((p) => p.startDate)).toEqual(['2026-09-01']);
  });

  test('week_moves differ ON PURPOSE: an EMPTY pull clears synced local moves (empty is their normal state); unsynced moves and Undo tombstones stay', async () => {
    const unsynced = { round: 2, week: 6, at: '2026-10-12T10:00:00Z', missing: '', synced: false };
    const tomb = {
      round: 3,
      week: 1,
      at: '2026-10-13T10:00:00Z',
      missing: 'B',
      synced: false,
      deleted: true,
    };
    writeWeekMoves([
      { round: 1, week: 2, at: '2026-10-01T10:00:00Z', missing: 'A', synced: true },
      unsynced,
      tomb,
    ]);
    replies.push(reply(200, []));
    await pullWeekMovesFromSupabase();
    expect(loadWeekMoves()).toEqual([unsynced, tomb]);
  });

  test('week_moves: a server row can never overwrite a pending Undo tombstone', async () => {
    const tomb = {
      round: 2,
      week: 6,
      at: '2026-10-12T10:00:00Z',
      missing: 'C',
      synced: false,
      deleted: true,
    };
    writeWeekMoves([tomb]);
    replies.push(
      reply(200, [{ round: 2, week: 6, moved_at: '2026-10-12T10:00:00Z', missing: 'C' }])
    );
    await pullWeekMovesFromSupabase();
    expect(loadWeekMoves()).toEqual([tomb]);
  });

  test('week_moves: a NON-empty pull that lacks one synced move still removes it', async () => {
    writeWeekMoves([
      { round: 1, week: 2, at: '2026-10-01T10:00:00Z', missing: 'A', synced: true },
      { round: 1, week: 3, at: '2026-10-02T10:00:00Z', missing: '', synced: true },
    ]);
    replies.push(
      reply(200, [{ round: 1, week: 2, moved_at: '2026-10-01T10:00:00Z', missing: 'A' }])
    );
    await pullWeekMovesFromSupabase();
    expect(loadWeekMoves().map((m) => `${m.round}-${m.week}`)).toEqual(['1-2']);
  });
});
