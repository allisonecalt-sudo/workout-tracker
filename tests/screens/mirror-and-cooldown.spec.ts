// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, mockDate } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// --- v48 P6 · the mirror stops misreporting her (Sep 24 2026) -----------------
// DECISIONS-v48 §2 #5-6, §5 Weekly review / Sessions / Progress / Settings rows.
// Her words today: "really challenge everything … dont take anything at face
// value". The review compares only closed weeks and prints its units; back pain
// is amber only at her own 3/10 line; one session row everywhere, and Back goes
// where she came from; Progress reports where she IS (latest, by date), with no
// chart of invented numbers; Settings loses the switch nobody used.
test.describe('v48 P6 mirror', () => {
  type Row = Record<string, unknown>;
  const THU_WEEK4 = '2026-09-24T15:00:00.000Z'; // Thu inside R2 Week 4 (Sat Sep 19 – Fri Sep 25)

  const seedLogs = async (page: Page, logs: Row[]): Promise<void> => {
    await page.addInitScript((rows) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    }, logs);
  };
  const log = (id: string, date: string, workout: 'A' | 'B' | 'C', extra: Row = {}): Row => ({
    id,
    date,
    workout,
    capacityBefore: 6,
    capacityAfter: 7,
    wallSitSec: workout === 'A' ? 45 : 0,
    backPain: 0,
    word: '',
    synced: true,
    durationSec: 2400,
    ...extra,
  });

  // This week: Sun + Tue. Last week (R2 W3): Sun, Tue, Thu. The week before
  // (R2 W2): Sun, Tue — so "last week" has something to be compared against.
  const threeWeeks = (): Row[] => [
    log('w4a', '2026-09-20T15:00:00.000Z', 'A'),
    log('w4b', '2026-09-22T15:00:00.000Z', 'B'),
    log('w3a', '2026-09-13T15:00:00.000Z', 'A', { durationSec: 2700, wallSitSec: 43 }),
    log('w3b', '2026-09-15T15:00:00.000Z', 'B', { durationSec: 2700 }),
    log('w3c', '2026-09-17T15:00:00.000Z', 'C', { durationSec: 2700 }),
    log('w2a', '2026-09-06T15:00:00.000Z', 'A', { durationSec: 2400, wallSitSec: 40 }),
    log('w2b', '2026-09-08T15:00:00.000Z', 'B', { durationSec: 2400 }),
  ];

  test('(a) live week: no "vs previous week", one quiet "Week still open."; ‹ to last week compares with units', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, threeWeeks());
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toHaveText('This week · R2 · Week 4 · Sep 19–25');
    await expect(page.locator('.weekly-review-sessions .session-row')).toHaveCount(2);
    await expect(page.locator('.weekly-review-delta')).toHaveCount(0);
    await expect(page.locator('.weekly-review-open')).toHaveText('Week still open.');
    // v55 (Sep 27 2026) — CHECK N4 (round 1): "total time —" used to be a
    // permanent 4th tile even with zero confirmed sessions. Now that tile is
    // HIDDEN until a week has a confirmed time, so this week (none) shows
    // only the other three (capacity, max wall sit, back pain).
    await expect(page.locator('.weekly-review-total')).toHaveCount(3);
    await expect(page.locator('.weekly-review-totals')).not.toContainText('total time');
    await expect(page.locator('.weekly-review-totals')).toContainText('6.0 → 7.0');
    await expect(page.locator('.weekly-review-totals')).not.toContainText('avg capacity');
    // The live week has nothing after it: › is hidden.
    await expect(page.locator('#next-week')).toBeHidden();

    await page.locator('#prev-week').click();
    await expect(page.locator('.review-title')).toHaveText('R2 · Week 3 · Sep 12–18');
    const delta = page.locator('.weekly-review-delta');
    await expect(delta).toBeVisible();
    await expect(page.locator('.weekly-review-open')).toHaveCount(0);
    // T2 fix r1 (Sep 27 2026, checker's "must"): none of these seeded rows
    // has a confirmed her_start/her_end (only the app's own `durationSec`,
    // a red herring) — the weekly review must never turn that into a "total
    // time" number or arrow. The row is dropped entirely, not shown as ±0.
    const time = delta.locator('.weekly-review-delta-row').filter({ hasText: 'total time' });
    await expect(time).toHaveCount(0);
    const wall = delta.locator('.weekly-review-delta-row').filter({ hasText: 'max wall sit' });
    await expect(wall.locator('.weekly-review-delta-num')).toHaveText('↑ +3s');
    // › steps forward again.
    await page.locator('#next-week').click();
    await expect(page.locator('.review-title')).toContainText('This week');
  });

  test('(b) a held (break) week: "Held the slot — doesn\'t count.", no "of 3"', async ({
    page,
  }) => {
    await mockDate(page, '2026-09-01T10:00:00.000Z'); // Tue in R2 Week 1
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await page.locator('#prev-week').click();
    await expect(page.locator('.review-title')).toHaveText('Break week · Aug 22–28');
    await expect(page.locator('.weekly-review-empty')).toContainText('Held the slot');
    await expect(page.locator('.weekly-review-subtitle')).toHaveCount(0);
    const text = await page.locator('#app').innerText();
    expect(text).not.toContain('of 3');
    // An ordinary past week with nothing logged says so plainly.
    await mockDate(page, '2026-09-24T10:00:00.000Z');
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await page.locator('#prev-week').click();
    await expect(page.locator('.weekly-review-empty')).toHaveText('No sessions that week.');
  });

  test('(c) back pain 2 is plain; 3 (her stop line) is amber', async ({ page }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [
      log('p2', '2026-09-20T15:00:00.000Z', 'A', { backPain: 2 }),
      log('p3', '2026-09-22T15:00:00.000Z', 'B', { backPain: 3 }),
    ]);
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    const two = page.locator('[data-detail="p2"] .session-back');
    const three = page.locator('[data-detail="p3"] .session-back');
    await expect(two).toHaveText('2');
    await expect(two).not.toHaveClass(/session-back-warn/);
    await expect(three).toHaveText('3');
    await expect(three).toHaveClass(/session-back-warn/);
    const colors = await page.evaluate(() => ({
      two: getComputedStyle(document.querySelector('[data-detail="p2"] .session-back')!).color,
      three: getComputedStyle(document.querySelector('[data-detail="p3"] .session-back')!).color,
    }));
    expect(colors.two).not.toBe(colors.three);
  });

  test('(d) a session opened from the review: × Back lands on the review, on the same week', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, threeWeeks());
    await page.goto('/');
    await page.locator('#open-weekly-review .week-card-head').click();
    await page.locator('.weekly-review-sessions [data-detail="w4a"]').click();
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await page.locator('#back-history').click();
    await expect(page.locator('.screen-header h2')).not.toHaveText('Sessions');
    await expect(page.locator('.review-title')).toContainText('This week');
    // On last week: open, back — still last week (the offset is kept).
    await page.locator('#prev-week').click();
    await page.locator('.weekly-review-sessions [data-detail="w3b"]').click();
    await page.locator('#back-history').click();
    await expect(page.locator('.review-title')).toHaveText('R2 · Week 3 · Sep 12–18');
    // × Back from the review goes home; home's card opens THIS week again.
    await page.locator('#back-home').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    await page.locator('#open-weekly-review .week-card-head').click();
    await expect(page.locator('.review-title')).toContainText('This week');
  });

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('(e) Sessions: header × Back, no bottom slab, "Sat …" rows; Back from a Session keeps the scroll', async ({
      page,
    }) => {
      await mockDate(page, THU_WEEK4);
      const rows: Row[] = [];
      let t = new Date('2026-09-19T16:30:00.000Z').getTime(); // a Saturday
      for (let i = 0; i < 30; i++) {
        rows.push(log(`r${i}`, new Date(t).toISOString(), (['C', 'B', 'A'] as const)[i % 3]!));
        t -= 2 * 86_400_000;
      }
      await seedLogs(page, rows);
      await page.goto('/');
      await page.locator('#view-history').click();
      await expect(page.locator('.screen-header h2')).toHaveText('Sessions');
      await expect(page.locator('.screen-header #back-home')).toHaveText('× Back');
      await expect(page.locator('.btn-large')).toHaveCount(0);
      // T2 (Sep 27 2026): these seeded rows carry the app's own durationSec
      // but no her_start/her_end confirm — "old rows show no length" (§3.4),
      // so the row is the date alone, no "· N min" tacked on.
      await expect(page.locator('.history-date').first()).toHaveText(/^Sat Sep 19$/);
      // Scroll down, open a row, come back: the list is where she left it.
      const target = page.locator('[data-detail="r20"]');
      await target.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(300);
      await target.click();
      await expect(page.locator('.screen-header h2')).toHaveText('Session');
      expect(await page.evaluate(() => window.scrollY)).toBeLessThan(50);
      await page.locator('#back-history').click();
      await expect(page.locator('.screen-header h2')).toHaveText('Sessions');
      const after = await page.evaluate(() => window.scrollY);
      expect(Math.abs(after - before)).toBeLessThan(4);
    });
  });

  test('(e2) T2: one time formatter — the once-only Sessions note, "about N min" only on a confirmed row, never the app tap-time', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [
      // Confirmed her own start/finish (T1): a real 45-minute span.
      log('confirmed', '2026-09-22T15:00:00.000Z', 'B', {
        startedAt: '2026-09-22T15:31:00.000Z',
        completedAt: '2026-09-22T20:04:00.000Z', // the app's own tap span — a red herring
        herStartAt: '2026-09-22T15:00:00.000Z',
        herStartConfirmed: true,
        herEndAt: '2026-09-22T15:45:00.000Z',
        herEndConfirmed: true,
        breakMinutes: 0,
      }),
      // Old-style row: durationSec but no her_start/her_end confirm.
      log('unconfirmed', '2026-09-20T15:00:00.000Z', 'A'),
    ]);
    await page.goto('/');
    await page.locator('#view-history').click();
    // Said once, at the top — not per row. T2 fix r1 (Sep 27 2026, checker's
    // nice): reworded to the real mechanism (her confirmed start/finish),
    // not a bare date claim.
    await expect(page.locator('.history-length-note')).toHaveText(
      "Workout length shows once you've said your start and finish times — from Sep 27 2026."
    );
    const confirmedRow = page.locator('[data-detail="confirmed"]');
    const unconfirmedRow = page.locator('[data-detail="unconfirmed"]');
    await expect(confirmedRow.locator('.history-date')).toHaveText(/^Tue Sep 22 · about 45 min$/);
    await expect(unconfirmedRow.locator('.history-date')).toHaveText(/^Sun Sep 20$/);

    // Session detail: the Time row is HER confirmed minutes, never the app's
    // 15:31–20:04 tap span (4h33m) that's sitting right there in the data.
    await confirmedRow.click();
    const card = page.locator('.detail-card');
    const time = card.locator('.detail-row').filter({ hasText: 'Time' });
    await expect(time).toHaveText('Timeabout 45 min');
    await expect(page.locator('#detail-app-time')).toHaveText(
      /^App open \d\d:\d\d–\d\d:\d\d — not workout time$/
    );
  });

  test('(e) Session: B has no Wall sit row; a ride shows one Cardio row from columns or the old marker; Note = her words only', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    await seedLogs(page, [
      log('b-new', '2026-09-22T15:00:00.000Z', 'B', {
        startedAt: '2026-09-22T15:31:00.000Z',
        completedAt: '2026-09-22T16:04:00.000Z',
        durationSec: 1980,
        cardioLane: 'elliptical',
        cardioMinutes: 10,
        ellipticalLevel: 7,
        ellipticalKm: 1.4,
        ellipticalPulse: 128,
        sessionNote: 'Knee fine',
        armFeel: 'curl=easy;row=right',
        notes: null,
      }),
      log('a-old', '2026-09-20T15:00:00.000Z', 'A', {
        capacityAfter: null,
        word: '',
        notes:
          'cardio: elliptical 10 min · level 7 · 1.4 km · pulse 128 · knee fine · duration not recorded — session was left open 4h before Done',
      }),
      log('c-apt', '2026-09-17T15:00:00.000Z', 'C', {
        notes: 'cardio: apartment 25 min',
        liteDay: true,
      }),
    ]);
    await page.goto('/');
    await page.locator('#view-history').click();
    await page.locator('[data-detail="b-new"]').click();
    const card = page.locator('.detail-card');
    await expect(page.locator('.screen-header h2')).toHaveText('Session');
    await expect(card.locator('.detail-label')).not.toContainText(['Wall sit']);
    await expect(card).not.toContainText('Wall sit');
    await expect(page.locator('#detail-cardio')).toHaveText(
      'Elliptical 10 min · L7 · 1.4 km · pulse 128'
    );
    await expect(card).toContainText('Arms');
    await expect(card).toContainText('curl easy · row right');
    await expect(page.locator('#detail-session-note')).toHaveText('Knee fine');
    // T2 fix r1 (Sep 27 2026, checker's should #2): this row has no
    // her_start/her_end confirm, so there's no Time row at all — the once-
    // only Sessions note already said an old row shows no length, and this
    // card's own "carries nothing" rule drops a row with nothing to show.
    // The app's own open/close tap-time is on its own dim "not workout time"
    // line below the card (§3.4).
    const time = card.locator('.detail-row').filter({ hasText: 'Time' });
    await expect(time).toHaveCount(0);
    await expect(page.locator('#detail-app-time')).toHaveText(
      /^App open \d\d:\d\d–\d\d:\d\d — not workout time$/
    );
    await expect(card.locator('.detail-row').filter({ hasText: 'Capacity' })).toContainText(
      '6 → 7'
    );
    await expect(page.locator('.btn-large, #open-progress-from-detail')).toHaveCount(0);

    // The legacy marker row reads the same, and her words are only her words.
    await page.locator('#back-history').click();
    await page.locator('[data-detail="a-old"]').click();
    await expect(page.locator('#detail-cardio')).toHaveText(
      'Elliptical 10 min · L7 · 1.4 km · pulse 128'
    );
    await expect(page.locator('#detail-session-note')).toHaveText('knee fine');
    const system = card.locator('.detail-row').filter({ hasText: 'System' });
    await expect(system).toContainText('duration not recorded');
    await expect(page.locator('#detail-session-note')).not.toContainText('cardio');
    // A with an after-reading missing: "Capacity 6", and the Wall sit row is there.
    await expect(card.locator('.detail-row').filter({ hasText: 'Capacity' })).toHaveText(
      /Capacity\s*6$/
    );
    await expect(card).toContainText('Wall sit');

    // The apartment marker + lite.
    await page.locator('#back-history').click();
    await page.locator('[data-detail="c-apt"]').click();
    await expect(page.locator('#detail-cardio')).toHaveText('Apartment 25 min');
    await expect(card.locator('.detail-row').filter({ hasText: 'Lite' })).toContainText('1 round');
    await expect(page.locator('#detail-session-note')).toHaveCount(0);
  });

  test('(f) v64 Progress: the weeks grid first, no breakdown, no A/B/C chips; latest by date; held weeks grey; Round 1 and Round 2 rows; v51 "Your cycle" door present (no data yet)', async ({
    page,
  }) => {
    await mockDate(page, THU_WEEK4);
    // Storage order OLDEST first (the reverse of newest-first): v47's
    // `.reverse()` would have called the May 12 hold the "latest".
    await seedLogs(page, [
      log('may', '2026-05-12T15:00:00.000Z', 'A', { wallSitSec: 52 }),
      log('ride1', '2026-09-06T15:00:00.000Z', 'C', {
        cardioLane: 'elliptical',
        cardioMinutes: 25,
        ellipticalLevel: 3,
      }),
      log('sep13', '2026-09-13T15:00:00.000Z', 'A', { wallSitSec: 40 }),
      log('ride2', '2026-09-17T15:00:00.000Z', 'C', {
        cardioLane: 'elliptical',
        cardioMinutes: 25,
        ellipticalLevel: 7,
      }),
      log('sep20', '2026-09-20T15:00:00.000Z', 'A', { wallSitSec: 45 }),
      log('sep22', '2026-09-22T15:00:00.000Z', 'B'),
    ]);
    await page.goto('/');
    await page.locator('#open-progress-link').click();
    const app = page.locator('#app');
    await expect(app).not.toContainText('Exercise breakdown');
    // v50 · cycle: the OLD capacity chart is still gone. v51: "Your cycle" is a door to its
    // own page; v64: the door sits in the More group. No cycle_periods are seeded here, so
    // its sub-line reads the empty state.
    const cc = page.locator('.more-card', { hasText: 'Your cycle' });
    await expect(cc).toContainText('No period logged yet');
    await expect(cc.locator('svg')).toHaveCount(0);
    const cards = page.locator('.progress-screen > .progress-card');
    await expect(cards.first()).toHaveClass(/weeks-card/);
    // The basis under the hero: since the first session, A/B/C counted as workouts.
    await expect(page.locator('.weeks-hero-sub')).toHaveText('since May 12 · 6 workouts');
    // v64: no A/B/C chips (the letters are balanced anyway), no Start -> Now card.
    await expect(page.locator('.progress-subtitle')).toHaveCount(0);
    await expect(page.locator('.start-now-card')).toHaveCount(0);
    // What grew: both rides were logged as 25 minutes, so the level row compares like with
    // like (3 -> 7 at 25 min). Every wallSitSec here predates the v45 real-timing capture
    // (Sep 24), so honestWallSitLogs() leaves the wall sit row out entirely.
    const grew = page.locator('.grew-card .start-now-row');
    await expect(grew.filter({ hasText: 'Level at 25 min' })).toContainText('L3 → L7');
    await expect(grew.filter({ hasText: 'Wall sit' })).toHaveCount(0);
    await expect(page.locator('.wall-sit-card')).toHaveCount(0);
    // The weeks grid: Round 1 and Round 2 each get a row of squares; held weeks are grey and
    // labelled, never an empty "0 / 3"; the last square of Round 2 is "now".
    await expect(page.locator('.wk-round')).toHaveCount(2);
    const r1 = page.locator('.wk-round').first();
    await expect(r1.locator('.wk-cell.wk-skip').filter({ hasText: 'Br' }).first()).toHaveAttribute(
      'aria-label',
      'Break week, not counted'
    );
    const r2 = page.locator('.wk-round').last();
    await expect(r2.locator('.wk-cell')).toHaveCount(4);
    await expect(r2.locator('.wk-cell').last()).toHaveClass(/wk-now/);
    // v48 · fix r1: a plain count, no "target" verdict.
    await expect(page.locator('.weeks-card')).not.toContainText('target');
    // No sage chart ink anywhere on Progress.
    const sage = await page.evaluate(
      () =>
        [...document.querySelectorAll('#app svg [fill], #app svg [stroke]')].filter((el) =>
          /var\(--accent(-hover)?\)/.test(
            `${el.getAttribute('fill') ?? ''} ${el.getAttribute('stroke') ?? ''}`
          )
        ).length
    );
    expect(sage).toBe(0);
  });

  test('(g) Settings: no auto-suggest, Gear chips + Neck release, Data folded, honest captions, 44 px steppers', async ({
    page,
  }) => {
    await page.locator('#open-settings').click();
    const app = page.locator('#app');
    await expect(app).not.toContainText(/auto-suggest/i);
    // v55 · fix r3 (Sep 28 2026, nice): dropped the redundant "1 kg · A+B
    // arm block" chip (same fact as the pairs chip below, said twice) — 5
    // chips down to 4, Yellow band moves up to first.
    await expect(page.locator('.gear-chip')).toHaveCount(4);
    await expect(page.locator('.gear-chip').first()).toHaveText('✅ Yellow band · B clamshells');
    // v55 (Sep 27 2026): she has the 2 kg now, and the Lisa-GATING copy is
    // retired everywhere (rule 8e) — the gear line says so, checked (have).
    // v55 · fix r3: "pairs" is back (she owns a pair of each) — see
    // GEAR_CHIPS' own comment.
    await expect(page.locator('.gear-chip').nth(2)).toHaveText(
      '✅ 1 kg + 2 kg pairs · your pick by pain'
    );
    await expect(app).not.toContainText('tell Claude');
    // v55 · fix r1 (Sep 27 2026): the Settings neck card still said "Lisa" on
    // screen ("Neck release · Lisa · ~10 min" + "...tension Lisa flagged").
    // Broadened from the old /ask lisa/i to /lisa/i everywhere in #app — rule
    // 8e is "Get rid of Lisa", not just the word "ask".
    await expect(app).not.toContainText(/lisa/i);
    await expect(page.locator('.neck-card')).toContainText('Two tennis balls in a sock');
    const data = page.locator('details.settings-data');
    await expect(data).toHaveJSProperty('open', false);
    await expect(data.locator('summary')).toContainText('Data · export · import · clear');
    await expect(app).toContainText('0 = straight on');
    await expect(app).toContainText('Rides never count down.');
    await expect(app).toContainText('Open how-to on first visit');
    await data.locator('summary').click();
    const text = await app.innerText();
    expect(text).not.toContain('app.ts');
    expect(text).not.toContain('localStorage');
    expect(text).not.toContain('Supabase');
    await expect(app).toContainText('This phone only. Cloud copy stays.');
    await expect(page.locator('#data-status')).toBeHidden();
    for (const id of ['#rest-dec', '#rest-inc', '#pre-dec', '#pre-inc']) {
      const box = (await page.locator(id).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // A switch that's on is a state, not the one sage action.
    const onTrack = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.settings-toggle.on .settings-toggle-track')!)
          .backgroundColor
    );
    expect(onTrack).not.toBe('rgb(143, 188, 143)');
  });
});

// --- v48 P7 · the cool-down: her 18 stretches as 11 tick-off rows (Sep 24 2026) ---
// DECISIONS-v48 §4 (cool-down row). Her routine — "i dont do yur stretches i do
// this" (May 29) — and her Jun 6 call: one list, no timer. All 18 stay in the
// data; right/left pairs fold into one "each side" row; rows tick off; one
// honest line instead of "No timer" over "45 sec"; Done · Finish stays pinned.
test.describe('v48 P7 cool-down', () => {
  const TUE_WEEK4 = '2026-09-22T14:00:00.000Z'; // Tue inside Round 2 Week 4
  const STARTED = '2026-09-22T13:30:00.000Z'; // 30 min earlier → a silent resume

  const coolSnap = (liteDay = false): Record<string, unknown> => ({
    screen: 'workout',
    selectedWorkout: 'A',
    capacityBefore: 6,
    capacityAfter: 5,
    wallSitSec: 45,
    backPain: 0,
    word: '',
    currentRound: 2,
    currentPhase: 'cooldown',
    currentExerciseIndex: 0,
    startedAt: STARTED,
    pausedAt: null,
    pausedMs: 0,
    liteDay,
  });

  // Seeded after the beforeEach clear, so every load of `page` lands on A's
  // cool-down list (a fresh snapshot resumes silently).
  const toCooldown = async (page: Page, liteDay = false): Promise<void> => {
    await mockDate(page, TUE_WEEK4);
    await page.addInitScript(([key, snap]) => window.localStorage.setItem(key, snap), [
      'workout-tracker:active-session',
      JSON.stringify(coolSnap(liteDay)),
    ] as const);
    await page.goto('/');
    await expect(page.locator('.stretch-list')).toBeVisible();
  };

  test('(a) A has 11 rows, the chip reads "Stretch · 11", pairs read "~45 s each side"', async ({
    page,
  }) => {
    await toCooldown(page);
    await expect(page.locator('.stretch-row')).toHaveCount(11);
    await expect(page.locator('.round-indicator')).toHaveText('Stretch · 11');
    const wrist = page.locator('.stretch-row', { hasText: 'Wrist extension' });
    await expect(wrist).toHaveCount(1);
    await expect(wrist.locator('.stretch-name')).toHaveText('Wrist extension');
    await expect(wrist.locator('.stretch-reps')).toHaveText('~45 s each side');
    // The hip-flexor pair folds too; a single reads a plain "~45 s".
    await expect(page.locator('.stretch-name', { hasText: 'Hip flexor' })).toHaveText('Hip flexor');
    await expect(
      page.locator('.stretch-row', { hasText: 'Doorway pec stretch' }).locator('.stretch-reps')
    ).toHaveText('~45 s');
    // All 18 are still there: 7 pairs + 4 singles.
    await expect(page.locator('.stretch-reps', { hasText: 'each side' })).toHaveCount(7);
  });

  test('(b) one honest line: "no timer" in the subtitle, no "45 sec" anywhere on the list', async ({
    page,
  }) => {
    await toCooldown(page);
    await expect(page.locator('.subtitle')).toHaveText('About 45 s each — no timer, go by feel.');
    const list = await page.locator('.stretch-list').innerText();
    expect(list).not.toContain('45 sec');
    expect(list).not.toContain('No timer');
    await expect(page.locator('.stretch-reps').first()).toHaveText('~45 s each side');
    // v60 (Sep 28 2026) F2: no tick count any more — just the time estimate.
    await expect(page.locator('.stretch-progress')).toHaveText('~13 min');
  });

  // v60 (Sep 28 2026) — F2: her words (Sep 25 14:54) "when I do the
  // stretches I just say I'm done. I don't mark them in the app and do it
  // on my own." Replaces the old per-row tick test: no [data-stretch-tick]
  // exists any more, and the list is read-only.
  test('(c) no per-stretch tick: the rows are read-only, no [data-stretch-tick] anywhere', async ({
    page,
  }) => {
    await toCooldown(page);
    await expect(page.locator('[data-stretch-tick]')).toHaveCount(0);
    await expect(page.locator('.stretch-check')).toHaveCount(0);
  });

  test('(d) a placeholder cue has no ▸; a real cue opens behind ▸, closed by default', async ({
    page,
  }) => {
    await toCooldown(page);
    const neck = page.locator('.stretch-row', { hasText: 'Neck stretch' });
    await expect(neck.locator('.stretch-cue-toggle')).toHaveCount(0);
    await expect(page.locator('.stretch-cue')).toHaveCount(0);
    const pec = page.locator('.stretch-row', { hasText: 'Doorway pec stretch' });
    await expect(pec.locator('.stretch-cue-toggle')).toHaveAttribute('aria-expanded', 'false');
    await pec.locator('.stretch-cue-toggle').click();
    await expect(pec.locator('.stretch-cue')).toContainText('Stand in a doorway');
    await expect(pec.locator('.stretch-cue-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.stretch-cue')).toHaveCount(1);
  });

  test.describe('at phone size', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('(e) the whole list fits: Done stretching ✓ pinned in view, page ≤ 1400 px, one sage, a quiet Skip', async ({
      page,
    }) => {
      await toCooldown(page);
      const done = page.locator('.action-bar #next');
      await expect(done).toHaveText('Done stretching ✓');
      await expect(done).toBeInViewport();
      const box = (await done.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(915);
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(h).toBeLessThanOrEqual(1400);
      await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
      // v60 F2: no per-stretch ticks any more — the quiet Skip is the only
      // other control, a real 44×44 target.
      const skip = page.locator('#cooldown-skip');
      await expect(skip).toHaveText('Skip');
      const b = (await skip.boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    });
  });

  test('(f) a lite day keeps its own subtitle', async ({ page }) => {
    await toCooldown(page, true);
    await expect(page.locator('.subtitle')).toHaveText(
      'Lite day — do the stretches you need, skip the rest. Done stretching whenever.'
    );
    await expect(page.locator('.round-indicator')).toHaveText('Stretch · 11 · lite');
  });

  test('(g) Done stretching ✓ lands on the post-log; nothing about the stretches is saved', async ({
    page,
  }) => {
    await toCooldown(page);
    await page.locator('#next').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
    await page.locator('#save-log').click();
    await expect(page.locator('.home-header h1')).toBeVisible();
    const raw = (await page.evaluate(() => localStorage.getItem('workout-tracker:logs'))) ?? '';
    expect(raw).toContain('"workout":"A"');
    expect(raw).not.toMatch(/stretch/i);
  });

  test('(h) Skip lands on the post-log too — same handler as Done stretching ✓', async ({
    page,
  }) => {
    await toCooldown(page);
    await page.locator('#cooldown-skip').click();
    await expect(page.locator('text=Quick log')).toBeVisible();
  });
});
