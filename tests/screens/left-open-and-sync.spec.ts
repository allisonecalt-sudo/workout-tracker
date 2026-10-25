// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect } from '@playwright/test';
import {
  setupPage,
  ACTIVE_SESSION_KEY,
  LOGS_KEY,
  leftOpenSnapshot,
  FOUR_DAYS,
  TEN_MINUTES,
} from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// ---------- Left-open workout gate (v32, Sep 11 2026) ----------
// She did Workout A on Mon Sep 7 and never tapped Done. The app kept the
// snapshot and, on the next open, would have dropped her straight back into it
// — days later — with no idea it was stale; tapping through to Done from there
// is what logged the Sep 2→4 "B" row as a 46-hour workout. Now a snapshot older
// than 3 hours is a QUESTION on home (did it / throw it away / keep going), not
// a silent resume. Snapshots are seeded on the beforeEach page and read from a
// fresh context page, which has no localStorage-clearing init script.
test('left-open gate: a 4-day-old workout is a question on home, not a silent resume', async ({
  page,
  context,
}) => {
  await page.evaluate(([key, snap]) => localStorage.setItem(key, JSON.stringify(snap)), [
    ACTIVE_SESSION_KEY,
    leftOpenSnapshot(FOUR_DAYS),
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.locator('.home-header h1')).toBeVisible();
  await expect(reopened.locator('#stale-session-card')).toBeVisible();
  await expect(reopened.locator('#stale-session-card')).toContainText('Workout A was left open');
  await expect(reopened.locator('#stale-session-card')).toContainText('never tapped Done');
  await expect(reopened.locator('.round-indicator')).toHaveCount(0);
  await reopened.close();
});

test('left-open gate: "Yes, I did it" logs it for the day it was STARTED with no invented numbers', async ({
  page,
  context,
}) => {
  const snap = leftOpenSnapshot(FOUR_DAYS);
  await page.evaluate(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [
    ACTIVE_SESSION_KEY,
    snap,
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.locator('#stale-finished').click();

  await expect(reopened.locator('#stale-session-card')).toHaveCount(0);
  // Assert the session LANDED, not the week counter. The original assertion
  // here was `.stat-number` = 1, which broke on Mon Sep 14 the moment the
  // Sat-Fri week rolled over: a snapshot four days old is deliberately in the
  // PAST, so it can fall outside the current week and the week stat stays 0.
  // The row's own presence is the thing under test; "recent" is not week-scoped.
  // v48 · P4: Recent left home — the row is read in Sessions (one tap).
  await reopened.locator('#view-history').click();
  await expect(reopened.locator('.history-row')).toHaveCount(1);
  // Duration is unknown → no duration at all, never a multi-day number.
  await expect(reopened.locator('.history-date').first()).not.toContainText(/\d+\s*(h|min|m)\b/);

  const saved = await reopened.evaluate(
    ([logsKey, activeKey]) => ({
      logs: JSON.parse(localStorage.getItem(logsKey) ?? '[]') as Array<Record<string, unknown>>,
      active: localStorage.getItem(activeKey),
    }),
    [LOGS_KEY, ACTIVE_SESSION_KEY] as const
  );
  expect(saved.active).toBeNull();
  expect(saved.logs).toHaveLength(1);
  const row = saved.logs[0]!;
  expect(row['workout']).toBe('A');
  expect(row['date']).toBe(snap.startedAt); // dated the day she started it
  expect(row['capacityBefore']).toBe(6); // the one number she really entered
  expect(row['capacityAfter']).toBeNull();
  expect(row['backPain']).toBeNull();
  expect(row['durationSec']).toBeUndefined();
  expect(row['completedAt']).toBeUndefined();
  expect(String(row['notes'])).toContain('Done was never tapped');
  await reopened.close();
});

test('left-open gate: "No, throw it away" discards it and clears the snapshot', async ({
  page,
  context,
}) => {
  await page.evaluate(([key, snap]) => localStorage.setItem(key, JSON.stringify(snap)), [
    ACTIVE_SESSION_KEY,
    leftOpenSnapshot(FOUR_DAYS),
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.locator('#stale-discard').click();
  await expect(reopened.locator('#stale-session-card')).toHaveCount(0);
  // WK2 (Sep 27 2026): see the "zero sessions" test's own comment above.
  // v61 (Sep 28 2026), spec item d: "of 4" now.
  await expect(reopened.locator('.week-line')).toContainText('0 of 4 · A, B, C and D to go');
  const active = await reopened.evaluate((key) => localStorage.getItem(key), ACTIVE_SESSION_KEY);
  expect(active).toBeNull();
  await reopened.close();
});

test('left-open gate: "Keep going" resumes the workout where she left it', async ({
  page,
  context,
}) => {
  await page.evaluate(([key, snap]) => localStorage.setItem(key, JSON.stringify(snap)), [
    ACTIVE_SESSION_KEY,
    leftOpenSnapshot(FOUR_DAYS),
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.locator('#stale-continue').click();
  await expect(reopened.locator('.round-indicator')).toBeVisible();
  await expect(reopened.locator('.screen-header h2')).toContainText('Workout A');
  await reopened.close();
});

test('left-open gate: a 10-minute-old workout still resumes silently (no card)', async ({
  page,
  context,
}) => {
  await page.evaluate(([key, snap]) => localStorage.setItem(key, JSON.stringify(snap)), [
    ACTIVE_SESSION_KEY,
    leftOpenSnapshot(TEN_MINUTES),
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened.locator('.round-indicator')).toBeVisible();
  await expect(reopened.locator('#stale-session-card')).toHaveCount(0);
  await reopened.close();
});

// v33 (Sep 11 2026): a row deleted in Supabase must vanish from the phone. The
// pull used to only add and update, so the false Thu-Sep-10 "B" (deleted on
// the server the same morning) would have sat in her history forever. The
// merge is pure; the network is off under automation, so the app exposes it
// as window.__wtMergeRemoteSessions only when navigator.webdriver is true.
test('pull merge (v33): a row deleted on the server disappears; unsynced, out-of-window and empty-answer cases stay safe', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Row = { id: string; date: string; synced?: boolean };
    type Merge = (local: unknown[], remote: unknown[]) => Row[];
    const merge = (window as unknown as { __wtMergeRemoteSessions: Merge }).__wtMergeRemoteSessions;
    const local = (id: string, date: string, synced: boolean) => ({
      id,
      date,
      workout: 'A',
      capacityBefore: 5,
      capacityAfter: 5,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      synced,
    });
    const remote = (id: string, date: string) => ({
      id,
      date,
      workout_type: 'B',
      capacity_before_1_10: 5,
      capacity_after_1_10: null,
      wall_sit_seconds: 0,
      pain_back_0_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      notes: null,
    });
    const ids = (rows: Row[]) => rows.map((r) => r.id).sort();

    // Case 1: the server answered with its WHOLE history (fewer than PULL_LIMIT = 200 rows).
    const whole = merge(
      [
        local('deleted-on-server', '2026-09-10T17:24:38.715Z', true),
        local('unsynced-local', '2026-09-11T08:00:00.000Z', false),
        local('ancient-synced', '2026-01-01T10:00:00.000Z', true),
        local('still-there', '2026-09-04T14:22:39.062Z', true),
      ],
      [
        remote('still-there', '2026-09-04T14:22:39.062+00:00'),
        remote('server-new', '2026-09-07T15:00:00+00:00'),
      ]
    );

    // Case 2: the server answered with a full 200-row WINDOW (v45 raised PULL_LIMIT 50 → 200).
    const window50 = Array.from({ length: 200 }, (_, i) =>
      remote(`w${i}`, `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00+00:00`)
    );
    const windowed = merge(
      [
        local('missing-inside-window', '2026-09-15T10:00:00.000Z', true),
        local('older-than-window', '2025-12-31T10:00:00.000Z', true),
        local('unsynced-local', '2026-09-30T10:00:00.000Z', false),
      ],
      window50
    );

    // Case 3: an empty server answer never deletes anything.
    const empty = merge([local('keep-me', '2026-09-04T14:22:39.062Z', true)], []);

    return {
      whole: ids(whole),
      windowedKept: ids(windowed).filter((id) => !id.startsWith('w')),
      windowedCount: windowed.length,
      empty: ids(empty),
      serverNewSynced: whole.find((r) => r.id === 'server-new')?.synced,
    };
  });

  expect(result.whole).toEqual(['server-new', 'still-there', 'unsynced-local']);
  expect(result.serverNewSynced).toBe(true);
  expect(result.windowedKept).toEqual(['older-than-window', 'unsynced-local']);
  expect(result.windowedCount).toBe(202); // 200-row window + older-than-window + unsynced-local
  expect(result.empty).toEqual(['keep-me']);
});

// WK2 fix r2 (Sep 27 2026, checker's must #1 / GATE 1): mergeRemoteSessions
// already drops a synced row the server no longer has (v33, above) — but if
// that row is the ONE that closed a completion-model week (the 3rd distinct
// letter), a naive drop lets week.ts's walkWeeks recompute fresh, see only 2
// distinct letters, and silently REOPEN that week, renumbering everything
// after it. This already happened once, pre-model (the false Thu Sep 10 B,
// deleted Sep 11, covered by the v33 test above) — a future delete of a
// POST-launch closing session would cascade the same way here. The real fix
// (counted_round/counted_week columns, or a stored closed-week record) is a
// schema decision that needs her yes first — this proves the non-schema
// guard that closes the practical risk in the meantime.
test('pull merge (WK2 fix r2, GATE 1): a DELETED closing session survives instead of silently reopening + renumbering the week', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Row = { id: string; date: string; workout: string; staleRemoteDelete?: boolean };
    type Merge = (local: unknown[], remote: unknown[]) => Row[];
    const merge = (window as unknown as { __wtMergeRemoteSessions: Merge }).__wtMergeRemoteSessions;
    const local = (id: string, date: string, workout: string) => ({
      id,
      date,
      workout,
      capacityBefore: 8,
      capacityAfter: 8,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      synced: true,
    });
    const remote = (id: string, date: string, workout_type: string) => ({
      id,
      date,
      workout_type,
      capacity_before_1_10: 8,
      capacity_after_1_10: 8,
      wall_sit_seconds: 0,
      pain_back_0_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      notes: null,
    });
    // Week 5 (post-launch, real COMPLETION_WEEKS_FROM): A Sun, B Mon, then C
    // Tue closes it — 'wk5-c' is the CLOSING session (week.ts: the session
    // whose own date === the span's closedAt). 'wk5-extra' is an ordinary
    // repeat A the next day — no special status, must still behave like v33.
    const localRows = [
      local('wk5-a', '2026-09-27T15:00:00.000Z', 'A'),
      local('wk5-b', '2026-09-28T15:00:00.000Z', 'B'),
      local('wk5-c', '2026-09-29T15:00:00.000Z', 'C'), // closes Week 5
      local('wk5-extra', '2026-09-30T15:00:00.000Z', 'A'), // ordinary repeat
    ];
    // The pull is missing BOTH the closing session AND the ordinary repeat —
    // same "deleted on the server" shape either way.
    const remoteRows = [
      remote('wk5-a', '2026-09-27T15:00:00+00:00', 'A'),
      remote('wk5-b', '2026-09-28T15:00:00+00:00', 'B'),
    ];
    const merged = merge(localRows, remoteRows);
    return {
      ids: merged.map((r) => r.id).sort(),
      closing: merged.find((r) => r.id === 'wk5-c'),
    };
  });

  // The ordinary repeat still disappears — v33 behavior, unchanged.
  expect(result.ids).not.toContain('wk5-extra');
  // The closing session survives instead, flagged rather than silently gone.
  expect(result.ids).toContain('wk5-c');
  expect(result.closing?.staleRemoteDelete).toBe(true);
});

// v50 · mood (Sep 25 2026): mood_before/mood_after round-trip through the pull
// merge the same way capacity does — present → her number, missing (a
// pre-v50 server row) → null, never invented.
test('pull merge (v50): mood_before/mood_after round-trip; a pre-v50 row (no mood keys) merges as null', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Row = { id: string; moodBefore?: number | null; moodAfter?: number | null };
    type Merge = (local: unknown[], remote: unknown[]) => Row[];
    const merge = (window as unknown as { __wtMergeRemoteSessions: Merge }).__wtMergeRemoteSessions;
    const remoteBase = {
      workout_type: 'A',
      capacity_before_1_10: null,
      capacity_after_1_10: null,
      wall_sit_seconds: 0,
      pain_back_0_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      notes: null,
    };
    const merged = merge(
      [],
      [
        {
          ...remoteBase,
          id: 'with-mood',
          date: '2026-09-25T10:00:00+00:00',
          mood_before: 9,
          mood_after: 3,
        },
        {
          ...remoteBase,
          id: 'pre-v50',
          date: '2026-09-20T10:00:00+00:00',
          // no mood_before/mood_after keys at all — a server row from before v50
        },
      ]
    );
    return {
      withMood: merged.find((r) => r.id === 'with-mood'),
      preV50: merged.find((r) => r.id === 'pre-v50'),
    };
  });

  expect(result.withMood?.moodBefore).toBe(9);
  expect(result.withMood?.moodAfter).toBe(3);
  expect(result.preV50?.moodBefore).toBeNull();
  expect(result.preV50?.moodAfter).toBeNull();
});

// v51 (Sep 25 2026): back_pain_before/wrist_pain_before round-trip the same
// way — present → her number, missing (a pre-v51 server row) → null.
test('pull merge (v51): back_pain_before/wrist_pain_before round-trip; a pre-v51 row (no keys) merges as null', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Row = { id: string; backPainBefore?: number | null; wristPainBefore?: number | null };
    type Merge = (local: unknown[], remote: unknown[]) => Row[];
    const merge = (window as unknown as { __wtMergeRemoteSessions: Merge }).__wtMergeRemoteSessions;
    const remoteBase = {
      workout_type: 'A',
      capacity_before_1_10: null,
      capacity_after_1_10: null,
      wall_sit_seconds: 0,
      pain_back_0_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      notes: null,
    };
    const merged = merge(
      [],
      [
        {
          ...remoteBase,
          id: 'with-before',
          date: '2026-09-25T10:00:00+00:00',
          back_pain_before: 3,
          wrist_pain_before: 0,
        },
        {
          ...remoteBase,
          id: 'pre-v51',
          date: '2026-09-20T10:00:00+00:00',
          // no back_pain_before/wrist_pain_before keys at all — a server row from before v51
        },
      ]
    );
    return {
      withBefore: merged.find((r) => r.id === 'with-before'),
      preV51: merged.find((r) => r.id === 'pre-v51'),
    };
  });

  expect(result.withBefore?.backPainBefore).toBe(3);
  expect(result.withBefore?.wristPainBefore).toBe(0);
  expect(result.preV51?.backPainBefore).toBeNull();
  expect(result.preV51?.wristPainBefore).toBeNull();
});

// T1 fix r1 (Sep 27 2026, checker's must #1): the same round-trip PROVEN
// through the real push shape, not a hand-built remote row — sessionPayload
// (a save's own POST body) fed straight into mergeRemoteSessions (a pull's
// own mapper), the way a push-then-pull actually happens. Before this fix,
// RemoteSession simply didn't declare the 5 columns, so this exact round
// trip lost herStartAt/herStartConfirmed/herEndAt/herEndConfirmed/
// breakMinutes on the very next pull. A pre-T1 row (no keys at all,
// same shape mergeRemoteSessions has always had to handle) must still
// merge with all 5 as null, never invented.
test('pull merge (T1 fix r1, must #1): her timing answers survive a push -> pull round trip; a pre-T1 row merges as null', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Row = {
      id: string;
      herStartAt?: string | null;
      herStartConfirmed?: boolean | null;
      herEndAt?: string | null;
      herEndConfirmed?: boolean | null;
      breakMinutes?: number | null;
    };
    type Entry = Record<string, unknown>;
    const w = window as unknown as {
      __wtSessionPayload: (e: Entry) => Record<string, unknown>;
      __wtMergeRemoteSessions: (local: unknown[], remote: unknown[]) => Row[];
    };
    const entry = {
      id: 'with-timing',
      date: '2026-09-27T10:00:00.000Z',
      workout: 'A',
      capacityBefore: 6,
      capacityAfter: 7,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      herStartAt: '2026-09-27T09:04:00.000Z',
      herStartConfirmed: true,
      herEndAt: '2026-09-27T09:52:00.000Z',
      herEndConfirmed: true,
      breakMinutes: 5,
    };
    // The exact row a save's POST sends — id/date/workout_type match a real
    // remote row's shape (sessionPayload already names them that way).
    const remoteRow = w.__wtSessionPayload(entry);
    // A pre-T1 row: no her_*/break_minutes keys at all, same as any server
    // row saved before this migration existed.
    const preT1Remote = {
      id: 'pre-t1',
      date: '2026-09-20T10:00:00+00:00',
      workout_type: 'A',
      capacity_before_1_10: null,
      capacity_after_1_10: null,
      wall_sit_seconds: 0,
      pain_back_0_10: null,
      one_word: null,
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      notes: null,
    };
    const merged = w.__wtMergeRemoteSessions([], [remoteRow, preT1Remote]);
    return {
      withTiming: merged.find((r) => r.id === 'with-timing'),
      preT1: merged.find((r) => r.id === 'pre-t1'),
    };
  });

  expect(result.withTiming?.herStartAt).toBe('2026-09-27T09:04:00.000Z');
  expect(result.withTiming?.herStartConfirmed).toBe(true);
  expect(result.withTiming?.herEndAt).toBe('2026-09-27T09:52:00.000Z');
  expect(result.withTiming?.herEndConfirmed).toBe(true);
  expect(result.withTiming?.breakMinutes).toBe(5);
  // Never false/0 for a row that simply never had the keys.
  expect(result.preT1?.herStartAt).toBeNull();
  expect(result.preT1?.herStartConfirmed).toBeNull();
  expect(result.preT1?.herEndAt).toBeNull();
  expect(result.preT1?.herEndConfirmed).toBeNull();
  expect(result.preT1?.breakMinutes).toBeNull();
});

// v55 fix r3 (Sep 28 2026, checker's must): the same push -> pull proof as
// the T1 test above, for the LOAD CHIP's "@1kg"/"@2kg" suffix. Before this
// fix, sessionPayload's stripArmFeelLoad erased the suffix before it ever
// reached Supabase (the live CHECK 400'd on it), so a synced row's own next
// pull silently overwrote the phone's local "curl=easy@2kg" with the
// server's load-less "curl=easy" — the load lived only until the next sync.
// She said go on migrations/2026-09-28-v55-arm-feel-load.sql (widened CHECK,
// applied live) instead, so the fix is: send it as-is, and it must still be
// there after a round trip through the real push shape.
test('pull merge (v55 fix r3, must): the "@2kg"/"@1kg" LOAD CHIP suffix survives a push -> pull round trip', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    type Entry = Record<string, unknown>;
    const w = window as unknown as {
      __wtSessionPayload: (e: Entry) => Record<string, unknown>;
      __wtMergeRemoteSessions: (local: unknown[], remote: unknown[]) => Entry[];
    };
    const entry = {
      id: 'with-load',
      date: '2026-09-28T10:00:00.000Z',
      workout: 'A',
      capacityBefore: 6,
      capacityAfter: 7,
      wallSitSec: 0,
      backPain: 0,
      word: '',
      armFeel: 'curl=easy@2kg;row=right@1kg',
    };
    // The exact row a save's POST sends.
    const remoteRow = w.__wtSessionPayload(entry);
    const merged = w.__wtMergeRemoteSessions([], [remoteRow]);
    return {
      payloadArmFeel: remoteRow['arm_feel'],
      mergedArmFeel: merged.find((r) => r['id'] === 'with-load')?.['armFeel'],
    };
  });
  // The wire carries the suffix now (no more stripArmFeelLoad).
  expect(result.payloadArmFeel).toBe('curl=easy@2kg;row=right@1kg');
  // And the pull hands it straight back — no silent erase on the next sync.
  expect(result.mergedArmFeel).toBe('curl=easy@2kg;row=right@1kg');
});
