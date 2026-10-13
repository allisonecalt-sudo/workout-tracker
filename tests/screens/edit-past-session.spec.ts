// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// v53 (Sep 26 2026) — A5: fix a past session's ride numbers. Her words: "I
// don't know how to update this information but ok workout b week 4 did on
// level 5, 10 min, .69 distant 62.4 calories" / "there have to be an easy way
// to enter the data." Sessions → a row → Edit → the same five console fields
// as the live ride-numbers screen, plus her note.
test.describe('v53 · edit a past session (A5)', () => {
  type Row = Record<string, unknown>;

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };
  // The exact session her words describe: an elliptical B day whose ride
  // numbers were never entered (null) — the case "an easy way to enter the
  // data" exists for.
  const rideLog = (extra: Row = {}): Row => ({
    id: 'b-week4',
    date: '2026-09-20T15:00:00.000Z',
    workout: 'B',
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec: 0,
    backPain: 0,
    word: '',
    durationSec: 2400,
    cardioLane: 'elliptical',
    cardioMinutes: null,
    ellipticalLevel: null,
    ellipticalKm: null,
    ellipticalKcal: null,
    ellipticalPulse: null,
    ellipticalTimeSec: null,
    sessionNote: null,
    synced: true,
    ...extra,
  });

  async function readLog(page: Page, id: string): Promise<Row> {
    const raw = await page.evaluate(() => localStorage.getItem('workout-tracker:logs'));
    const logs = JSON.parse(raw ?? '[]') as Row[];
    const found = logs.find((l) => l['id'] === id);
    if (!found) throw new Error(`log ${id} not found`);
    return found;
  }

  async function openEdit(page: Page): Promise<void> {
    await page.locator('#view-history').click();
    await page.locator('[data-detail="b-week4"]').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await page.locator('#edit-history-session').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Edit session');
  }

  test('(a) open → edit → save: the detail shows the new numbers, only the ride fields + note change', async ({
    page,
  }) => {
    await seedLogs(page, [rideLog()]);
    await page.goto('/');
    await openEdit(page);

    // "—" until she touches it — the level stepper starts empty, same rule as
    // the live ride-numbers screen.
    await expect(page.locator('#hist-level')).toHaveText('—');
    await page.locator('#hist-time').fill('10:00');
    await page.locator('#hist-km').fill('0.69');
    await page.locator('#hist-kcal').fill('62.4');
    await page.locator('#hist-level-up').click();
    await page.locator('#hist-level-up').click();
    await expect(page.locator('#hist-level')).toHaveText('5');
    await page.locator('#hist-pulse').fill('118');
    await page.locator('#hist-note').fill('Felt strong.');
    await page.locator('#save-history-edit').click();

    // Back on the Session screen, the numbers she just typed.
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    const cardio = page.locator('#detail-cardio');
    await expect(cardio).toContainText('L5');
    await expect(cardio).toContainText('0.69 km');
    await expect(cardio).toContainText('62.4 kcal');
    await expect(cardio).toContainText('10:00');
    await expect(cardio).toContainText('pulse 118');
    await expect(page.locator('#detail-session-note')).toHaveText('Felt strong.');

    // Only the six fields changed — the date, workout letter and every other
    // reading on the row are exactly what they were.
    const log = await readLog(page, 'b-week4');
    expect(log['date']).toBe('2026-09-20T15:00:00.000Z');
    expect(log['workout']).toBe('B');
    expect(log['capacityBefore']).toBe(6);
    expect(log['capacityAfter']).toBe(7);
    expect(log['backPain']).toBe(0);
    expect(log['ellipticalTimeSec']).toBe(600);
    expect(log['ellipticalKm']).toBe(0.69);
    expect(log['ellipticalKcal']).toBe(62.4);
    expect(log['ellipticalLevel']).toBe(5);
    expect(log['ellipticalPulse']).toBe(118);
    expect(log['sessionNote']).toBe('Felt strong.');
    // Queued like a new session — synced:false — plus pendingEdit so the
    // flush PATCHes the existing row instead of posting a duplicate.
    expect(log['synced']).toBe(false);
    expect(log['pendingEdit']).toBe(true);

    // The pushed payload carries them (sessionPayload is pure — see
    // __wtSessionPayload).
    const payload = await page.evaluate(
      (e) =>
        (window as unknown as { __wtSessionPayload: (x: unknown) => Row }).__wtSessionPayload(e),
      log
    );
    expect(payload['elliptical_level']).toBe(5);
    expect(payload['elliptical_km']).toBe(0.69);
    expect(payload['elliptical_kcal']).toBe(62.4);
    expect(payload['elliptical_time_sec']).toBe(600);
    expect(payload['elliptical_pulse']).toBe(118);
    expect(payload['session_note']).toBe('Felt strong.');

    // And the edit's own request is a PATCH by id, never another POST — the
    // row already exists in Supabase (patchSessionRequest, pure, no fetch).
    const patchReq = await page.evaluate(
      (e) =>
        (
          window as unknown as {
            __wtPatchSessionRequest: (x: unknown) => { url: string; body: Row };
          }
        ).__wtPatchSessionRequest(e),
      log
    );
    expect(patchReq.url).toContain('id=eq.b-week4');
    expect(patchReq.body['id']).toBeUndefined();
    expect(patchReq.body['elliptical_level']).toBe(5);
    // v53 fix (CHECK M3, Sep 26 2026): the body used to be the full
    // sessionPayload minus id (30-odd columns, including date and
    // workout_type) — an explicit allow-list now, so the exact key set is the
    // contract, not just a spot check on one field.
    expect(Object.keys(patchReq.body).sort()).toEqual(
      [
        'elliptical_kcal',
        'elliptical_km',
        'elliptical_level',
        'elliptical_pulse',
        'elliptical_time_sec',
        'session_note',
      ].sort()
    );
    expect(patchReq.body['date']).toBeUndefined();
    expect(patchReq.body['workout_type']).toBeUndefined();
  });

  test('(f) the PATCH body — CHECK M3: only the 6 ride/note columns, never date, workout_type or anything else on the row', async ({
    page,
  }) => {
    // Pure-function test, same shape as (a)'s payload check but exhaustive:
    // walks a REALISTIC full LogEntry (every field a real session carries)
    // through __wtPatchSessionRequest and asserts the body key set exactly —
    // so a future field added to sessionPayload can't silently leak back in.
    await seedLogs(page, [rideLog()]);
    await page.goto('/');
    const patchReq = await page.evaluate(() => {
      const entry = {
        id: 'b-week4',
        date: '2026-09-20T15:00:00.000Z',
        workout: 'B',
        capacityBefore: 6,
        capacityAfter: 7,
        moodBefore: 5,
        moodAfter: 6,
        wallSitSec: 0,
        backPain: 0,
        wristPain: 0,
        backPainBefore: 0,
        wristPainBefore: 0,
        stepFeel: 'fine',
        word: 'strong',
        startedAt: '2026-09-20T15:00:00.000Z',
        completedAt: '2026-09-20T16:00:00.000Z',
        durationSec: 3600,
        walkMinutes: 10,
        walkSteps: 1200,
        walkMeters: 900,
        notes: 'some system note',
        cardioLane: 'elliptical',
        cardioMinutes: 10,
        ellipticalLevel: 5,
        ellipticalKm: 0.69,
        ellipticalPulse: 118,
        ellipticalTimeSec: 600,
        ellipticalKcal: 62.4,
        sessionNote: 'Felt strong.',
        liteDay: false,
        armFeel: null,
        voicePlays: 2,
        stepsSkipped: 1,
        synced: true,
        pendingEdit: true,
      };
      const w = window as unknown as {
        __wtPatchSessionRequest: (x: unknown) => { url: string; body: Record<string, unknown> };
      };
      return {
        normal: w.__wtPatchSessionRequest(entry, false),
        legacy: w.__wtPatchSessionRequest(entry, true),
      };
    });
    expect(Object.keys(patchReq.normal.body).sort()).toEqual(
      [
        'elliptical_kcal',
        'elliptical_km',
        'elliptical_level',
        'elliptical_pulse',
        'elliptical_time_sec',
        'session_note',
      ].sort()
    );
    // The legacy (pre-v48-schema) fallback has no ride-number columns at all —
    // legacySessionPayload folds everything into `notes`, so that's the one
    // key the legacy PATCH body carries.
    expect(Object.keys(patchReq.legacy.body)).toEqual(['notes']);
  });

  // v53 fix (CHECK M2, Sep 26 2026): return=minimal gave a bare 204 on EVERY
  // PATCH, including one that matched 0 rows — `res.ok` alone can't tell an
  // update from a no-op, and the old code read a no-op as saved. Unit-level
  // (pure function, no network — same reasoning as the payload tests above).
  test('(g) CHECK M2 — a PATCH matching 0 rows never reads as success', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const w = window as unknown as { __wtPatchMatchedARow: (rows: unknown) => boolean };
      return {
        empty: w.__wtPatchMatchedARow([]),
        oneRow: w.__wtPatchMatchedARow([{ id: 'b-week4' }]),
        twoRows: w.__wtPatchMatchedARow([{ id: 'a' }, { id: 'b' }]),
        notAnArray: w.__wtPatchMatchedARow(null),
        undefinedBody: w.__wtPatchMatchedARow(undefined),
      };
    });
    expect(result.empty).toBe(false); // 0 rows matched — the exact CHECK M2 case
    expect(result.oneRow).toBe(true);
    expect(result.twoRows).toBe(true);
    expect(result.notAnArray).toBe(false);
    expect(result.undefinedBody).toBe(false);
  });

  // v53 fix (CHECK M2, Sep 26 2026): saveHistoryEdit used to set pendingEdit
  // unconditionally. A session that finished OFFLINE and never reached
  // Supabase (synced:false, no pendingEdit) has no server row for a PATCH to
  // find — every attempt would match 0 rows (see (g)) and never fall back to
  // a POST, so the whole session (not just the edit) was unrecoverable. Now
  // it stays a normal queued row and routes through the same POST path any
  // other never-synced session does.
  test('(h) CHECK M2 — editing a session that never reached Supabase keeps it a normal queued row (POST path), not pendingEdit (PATCH path)', async ({
    page,
  }) => {
    await seedLogs(page, [rideLog({ synced: false, pendingEdit: undefined })]);
    await page.goto('/');
    await openEdit(page);
    await page.locator('#hist-km').fill('0.69');
    await page.locator('#save-history-edit').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');

    const log = await readLog(page, 'b-week4');
    expect(log['ellipticalKm']).toBe(0.69);
    expect(log['synced']).toBe(false);
    // The whole point: NOT pendingEdit — a PATCH-by-id would match nothing.
    expect(log['pendingEdit']).toBeFalsy();

    // Never disappears: mergeRemoteSessions' drop rule only fires on
    // `synced === true` rows missing from the remote pull — this row is
    // synced:false, so a pull where the server has never heard of it (the
    // exact offline-finished case) must keep it, not drop it.
    const survived = await page.evaluate((entry) => {
      const w = window as unknown as {
        __wtMergeRemoteSessions: (l: unknown[], r: unknown[]) => Array<Record<string, unknown>>;
      };
      // Remote pull has OTHER sessions but nothing with this id — the server
      // genuinely never received it, same as "PATCH matched 0 rows" would say.
      return w.__wtMergeRemoteSessions(
        [entry],
        [
          {
            id: 'some-other-session',
            date: '2026-09-01T15:00:00.000Z',
            workout_type: 'A',
            capacity_before_1_10: 5,
            capacity_after_1_10: 5,
            wall_sit_seconds: 0,
            pain_back_0_10: 0,
            one_word: '',
            started_at: null,
            completed_at: null,
            duration_seconds: null,
            notes: null,
          },
        ]
      );
    }, log);
    expect(survived.some((r) => r['id'] === 'b-week4')).toBe(true);
    expect(survived.find((r) => r['id'] === 'b-week4')?.['ellipticalKm']).toBe(0.69);
  });

  // v53 fix (CHECK M2, Sep 26 2026): a queued edit must be VISIBLE on the one
  // session it could be lost from — not just folded into the header's generic
  // "offline · N pending" count.
  test('(i) CHECK M2 — a still-queued edit shows "Not saved online yet — will retry" on the session screen', async ({
    page,
  }) => {
    await seedLogs(page, [rideLog({ synced: false, pendingEdit: true, ellipticalKm: 0.69 })]);
    await page.goto('/');
    await page.locator('#view-history').click();
    await page.locator('[data-detail="b-week4"]').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await expect(page.locator('#detail-edit-unsynced')).toHaveText(
      'Not saved online yet — will retry'
    );
  });

  // mergeRemoteSessions used to mark ANY local-unsynced row synced the moment
  // the server had its id (v45's "an earlier push DID land" rule) — true for
  // a brand-new session, but not for an EDIT: the server already had this id
  // BEFORE the fix, so its presence here proves nothing about whether the
  // PATCH landed. Without the pendingEdit check this pull would wipe out
  // synced:false and the flush would never retry the fix.
  test('(e) a pull mid-flush never marks a pendingEdit row synced off the server’s still-stale copy', async ({
    page,
  }) => {
    const out = await page.evaluate(() => {
      const w = window as unknown as {
        __wtMergeRemoteSessions: (l: unknown[], r: unknown[]) => Array<Record<string, unknown>>;
      };
      const merged = w.__wtMergeRemoteSessions(
        [
          {
            id: 'b-week4',
            date: '2026-09-20T15:00:00.000Z',
            workout: 'B',
            capacityBefore: 6,
            capacityAfter: 7,
            wallSitSec: 0,
            backPain: 0,
            word: '',
            ellipticalKm: 0.69, // her fix — not yet confirmed landed
            synced: false,
            pendingEdit: true,
          },
        ],
        [
          {
            // The server's answer still carries the OLD number: this row
            // existed on the server long before today's edit, so an id match
            // here says nothing about the PATCH's fate.
            id: 'b-week4',
            date: '2026-09-20T15:00:00.000Z',
            workout_type: 'B',
            capacity_before_1_10: 6,
            capacity_after_1_10: 7,
            wall_sit_seconds: 0,
            pain_back_0_10: 0,
            one_word: '',
            started_at: null,
            completed_at: null,
            duration_seconds: null,
            notes: null,
            elliptical_km: 1.4,
          },
        ]
      );
      return merged[0];
    });
    expect(out?.['synced']).toBe(false);
    expect(out?.['pendingEdit']).toBe(true);
    expect(out?.['ellipticalKm']).toBe(0.69); // her fix wins, not the server's stale 1.4
  });

  test('(b) × Back on the edit screen discards the draft — nothing saved', async ({ page }) => {
    await seedLogs(page, [rideLog()]);
    await page.goto('/');
    await openEdit(page);
    await page.locator('#hist-km').fill('9.99');
    await page.locator('#back-history-edit').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await expect(page.locator('#detail-cardio')).not.toContainText('9.99');
    const log = await readLog(page, 'b-week4');
    expect(log['ellipticalKm']).toBeNull();
    expect(log['synced']).toBe(true);
  });

  test('(c) an edit made offline queues (synced:false, pendingEdit:true), survives an app close, and reconnecting never corrupts or drops it', async ({
    page,
    context,
  }) => {
    await seedLogs(page, [rideLog()]);
    await page.goto('/');
    await openEdit(page);
    await page.locator('#hist-km').fill('0.69');
    await page.locator('#save-history-edit').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');

    // Home shows it queued (real sync is off under automation — see
    // syncDisabled — so it stays pending exactly like a brand-new session
    // saved offline would).
    await page.locator('#back-history').click();
    await page.locator('#back-home').click();
    await expect(page.locator('#sync-indicator')).toHaveText('offline · 1 pending');

    // Survives an app close: a fresh page in the SAME context (not another
    // page.goto on `page` — its own init script re-clears+re-seeds storage on
    // every load of `page` itself, same trick the elliptical-firsts test above
    // uses). localStorage is shared per-origin across pages in one context, so
    // `reopened` sees exactly what the edit left there.
    const reopened = await context.newPage();
    const errors: string[] = [];
    reopened.on('pageerror', (e) => errors.push(String(e)));
    await reopened.goto('/');
    await expect(reopened.locator('#sync-indicator')).toHaveText('offline · 1 pending');
    let log = await readLog(reopened, 'b-week4');
    expect(log['pendingEdit']).toBe(true);
    expect(log['ellipticalKm']).toBe(0.69);

    // Reconnecting fires the same flush a brand-new session's does
    // (flushPendingSyncs → patchLogToSupabase for a pendingEdit row). No real
    // network happens under automation (never write to Supabase in tests),
    // so nothing here proves the server accepted it — this proves the new
    // routing doesn't throw or corrupt the queued row while it waits.
    await reopened.evaluate(() => window.dispatchEvent(new Event('online')));
    await reopened.waitForTimeout(200);
    expect(errors).toEqual([]);
    log = await readLog(reopened, 'b-week4');
    expect(log['pendingEdit']).toBe(true);
    expect(log['ellipticalKm']).toBe(0.69);
  });

  test("(d) the Done card on Home opens today's session — same Edit door as Sessions", async ({
    page,
  }) => {
    await mockDate(page, '2026-09-20T18:00:00.000Z'); // same day as rideLog's date
    await seedLogs(page, [rideLog()]);
    await page.goto('/');
    await expect(page.locator('#home-done-card')).toBeVisible();
    await page.locator('#home-done-card').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await page.locator('#edit-history-session').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Edit session');
  });
});
