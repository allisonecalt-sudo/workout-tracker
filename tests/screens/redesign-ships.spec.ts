// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect } from '@playwright/test';
import { setupPage } from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// --- Redesign Ship 1 (2026-05-15 D-1 Calm Tool Minimalism) -------------------
//
// The next three tests lock in the visual contract introduced by the redesign:
//  - stat numbers use the new display size (40px on phone / 56px tablet, not 28px)
//  - role-named color tokens exist on :root and resolve to sage / amber / blue-gray
//  - cards no longer carry a drop shadow — elevation is now expressed via border
//
// If a future change reintroduces drop shadows or collapses the role tokens
// back to a single --accent, one of these tests will fail loudly.

// v48 · P4 (Sep 24 2026): the 44px stat numbers left home (DECISIONS §2 #2:
// one quiet count, not 3-5). The one large thing on home is now the hero's
// "Workout A" — it keeps the D-1 ramp's heading size (32px), still well above
// the old 28px ceiling this test was written against.
test('redesign: the home hero title uses the heading type scale (>=30px)', async ({ page }) => {
  const title = page.locator('.home-hero .hero-title');
  await expect(title).toBeVisible();
  const fontSize = await title.evaluate(
    (el) => parseFloat(window.getComputedStyle(el).fontSize) || 0
  );
  expect(fontSize).toBeGreaterThanOrEqual(30);
  await expect(page.locator('.stat-number')).toHaveCount(0);
});

test('redesign: role-named accent tokens are defined on :root', async ({ page }) => {
  // Pre-redesign had a single --accent doing 9 jobs. D-1 splits it into roles.
  // Verify the new tokens exist and resolve to non-empty values.
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      accent: cs.getPropertyValue('--accent').trim(),
      accentProgress: cs.getPropertyValue('--accent-progress').trim(),
      accentRest: cs.getPropertyValue('--accent-rest').trim(),
      accentWarn: cs.getPropertyValue('--accent-warn').trim(),
      textDim2: cs.getPropertyValue('--text-dim-2').trim(),
    };
  });
  expect(tokens.accent).toBeTruthy();
  expect(tokens.accentProgress).toBeTruthy();
  expect(tokens.accentRest).toBeTruthy();
  expect(tokens.accentWarn).toBeTruthy();
  expect(tokens.textDim2).toBeTruthy();
  // accent (primary action) and accent-rest (cool blue-gray) must differ —
  // that's the whole point of splitting the role.
  expect(tokens.accent).not.toBe(tokens.accentRest);
});

test('redesign: cards use border-elevation, not drop shadow', async ({ page }) => {
  // D-1: shadows replaced with 1px borders. .card on home should have a border
  // and a "none" (or rgba(0,0,0,0)) box-shadow at the computed-style level.
  const card = page.locator('.card').first();
  await expect(card).toBeVisible();
  const styles = await card.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      boxShadow: cs.boxShadow,
      borderTopWidth: cs.borderTopWidth,
    };
  });
  expect(styles.boxShadow).toBe('none');
  // A 1px border = "1px" exactly. Allow >0 to be safe across browsers.
  expect(parseFloat(styles.borderTopWidth)).toBeGreaterThan(0);
});

// --- Ship 3 (2026-05-15 data viz: sparkline + year-grid) ---------------------
//
// Two inline SVG components: wall-sit sparkline on history rows, year-grid
// heatmap on home. These tests lock in:
//  - year-grid always renders with 7 day-rows (her week, Sat → Fri)
//  - sparkline renders when a history row has ≥2 wall-sit values
//  - sparkline is skipped when a row has 0 or 1 wall-sit value (flat line
//    reads as broken; better to render nothing)
test('ship 3 (v64): the 3-per-week grid is off the Weekly review (it is the weeks grid on Progress now)', async ({
  page,
}) => {
  // The year-grid was replaced 2026-05-15 with a 3-per-week target view; v64 moved it to
  // Progress as one small square per week (tests/screens/progress-v64.spec.ts covers the grid).
  await page.locator('#open-weekly-review').click();
  await expect(page.locator('.consistency-wrap')).toHaveCount(0);
  await expect(page.locator('.weekly-row')).toHaveCount(0);
});

test('ship 3 (v64): two wall-sit values draw no sparkline (it needs 5+ honest points)', async ({
  page,
}) => {
  // Seed two B-workouts with wall-sit values, then visit history.
  // localStorage shape is the JSON-stringified array of LogEntry rows.
  // v49 · look fix (Sep 25 2026): dates moved to on/after Sep 24 2026 — the
  // sparkline now reads honestWallSitLogs() only (real v45+ measurements,
  // never a pre-v45 row that saved the week's PRESCRIBED hold as if measured).
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'spark-2',
        date: '2026-09-25T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 28,
        backPain: 1,
        word: 'strong',
        durationSec: 600,
      },
      {
        id: 'spark-1',
        date: '2026-09-24T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 5,
        wallSitSec: 20,
        backPain: 2,
        word: 'tired',
        durationSec: 580,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  // The Sessions list should have a sparkline on the newest row (the one whose
  // trend includes itself + the older value = 2 points). v48 · P4: Recent
  // workouts left home — the same rows live one tap away in Sessions.
  await page.locator('#view-history').click();
  // v64: two honest points are two numbers, not a line (progress-and-dataviz rule 6).
  await expect(page.locator('.history-row')).toHaveCount(2);
  await expect(page.locator('.history-row .sparkline')).toHaveCount(0);
});

test('ship 3: sparkline NOT rendered for row with 0 or 1 wall-sit value', async ({ page }) => {
  // Single log with wallSitSec=0 (workout C, no wall sit) → no sparkline.
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'no-spark',
        date: '2026-05-13T10:00:00.000Z',
        workout: 'C',
        capacityBefore: 4,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: 'walked',
        durationSec: 720,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#view-history').click(); // v48 · P4: rows live in Sessions
  // Row exists, but no sparkline (flat-line render would read as broken).
  await expect(page.locator('.history-row').first()).toBeVisible();
  await expect(page.locator('.history-row .sparkline')).toHaveCount(0);
});

// --- Ship 4 (2026-05-15 Weekly review screen) -------------------------------
//
// New AppScreen `weekly-review` reached from home via the "Weekly review →"
// button (below the consistency card) or by tapping the week-nav label.
// Respects viewedWeekOffset so a past-week label tap opens THAT week's review.
//
// These tests lock in:
//  - reachable from home button
//  - header shows session count for the viewed week
//  - empty state renders calmly for a week with no sessions
//  - per-session cards render her one-word entry verbatim (voice rule —
//    typos preserved, never paraphrased)
test('ship 4: weekly review reachable from home button', async ({ page }) => {
  // v48 · P4: the whole week card is the one door (the separate "📊 Weekly
  // review" row is gone).
  await expect(page.locator('#open-weekly-review-link')).toHaveCount(0);
  const reviewBtn = page.locator('#open-weekly-review');
  await expect(reviewBtn).toBeVisible();
  await reviewBtn.click();
  // Header should now be the weekly-review screen header. WK4 (Sep 27 2026):
  // real "now" is always past the completion launch, so the live page reads
  // the completion model's own title ("Week 5 · since Sat Sep 26", §2.4) —
  // never "This week", which only the legacy calendar pages still say.
  await expect(page.locator('h2').first()).toContainText('Week 5');
  // Subtitle reports session count.
  await expect(page.locator('.weekly-review-subtitle')).toContainText('Sessions:');
});

test('ship 4: weekly review header shows session count for current week', async ({ page }) => {
  // Seed two sessions inside the CURRENT Sat–Fri window, computed at runtime so
  // the test doesn't rot as the calendar advances (it formerly hardcoded the
  // week of 2026-05-15). The app anchors weeks to Saturday (Shabbat); mirror
  // saturdayForOffset(0) here and place sessions on Sat+2 and Sat+4 (noon).
  await page.addInitScript(() => {
    const now = new Date();
    const satOffset = (now.getDay() + 1) % 7; // Sat=0, Sun=1, ..., Fri=6
    const saturday = new Date(now);
    saturday.setDate(now.getDate() - satOffset);
    saturday.setHours(12, 0, 0, 0);
    const dayInWeek = (add: number): string => {
      const d = new Date(saturday);
      d.setDate(saturday.getDate() + add);
      return d.toISOString();
    };
    const logs = [
      {
        id: 's-1',
        date: dayInWeek(2),
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 25,
        backPain: 0,
        word: 'good',
        durationSec: 420,
      },
      {
        id: 's-2',
        date: dayInWeek(4),
        workout: 'B',
        capacityBefore: 5,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: 'tired',
        durationSec: 480,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-weekly-review').click();
  // 2 of 3 — the count number in the subtitle.
  const subtitle = page.locator('.weekly-review-subtitle');
  await expect(subtitle).toContainText('Sessions:');
  await expect(subtitle.locator('strong')).toHaveText('2');
  // Two session rows rendered (v48 · P6: the same row as Sessions).
  await expect(page.locator('.weekly-review-sessions .session-row')).toHaveCount(2);
});

test('ship 4: weekly review shows one-word verbatim including typos', async ({ page }) => {
  // Voice rule (CLAUDE.md): her one-word entries must appear VERBATIM, never
  // edited or omitted. Even if she typed a typo, render the typo.
  await page.addInitScript(() => {
    // WK4 (Sep 27 2026): dated at "now" itself (real "now" is always after
    // the completion launch) instead of "this calendar week's Saturday" — the
    // live weekly-review page is now the completion model's OPEN span, not a
    // calendar Sat–Fri week, so the session must land inside THAT span, not
    // just "sometime this week".
    const logs = [
      {
        id: 'verbatim',
        date: new Date().toISOString(),
        workout: 'A',
        capacityBefore: 4,
        capacityAfter: 6,
        wallSitSec: 30,
        backPain: 0,
        word: 'gooood start', // intentional typo — must survive untouched
        durationSec: 450,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-weekly-review').click();
  const wordEl = page.locator('.weekly-review-sessions .history-word').first();
  await expect(wordEl).toBeVisible();
  await expect(wordEl).toContainText('gooood start');
});

test('ship 4: weekly review empty state for week with no sessions', async ({ page }) => {
  // No logs → empty state. Subtle line, no nudge, no motivational language.
  await page.goto('/');
  await page.locator('#open-weekly-review').click();
  await expect(page.locator('.weekly-review-empty')).toBeVisible();
  await expect(page.locator('.weekly-review-empty')).toContainText('No sessions this week');
  // No motivational language — the empty state should NOT contain "great",
  // "keep going", "you got this", etc. The system reports, doesn't judge.
  const empty = await page.locator('.weekly-review-empty').textContent();
  expect(empty?.toLowerCase()).not.toContain('great');
  expect(empty?.toLowerCase()).not.toContain('keep going');
  expect(empty?.toLowerCase()).not.toContain('you got');
});

// --- COOLER-LOOK (2026-05-15 evening) → retired by v49 · look (2026-09-25) ---
//
// COOLER-LOOK layered gradients, restrained glass and spring-physics motion on
// top of D-1. The v49 visual pass (SPEC-v49.md §3, §7) retires all of it —
// "Borders, not shadows... No new shadows, glass or gradients" — and aliases
// the old token names to flat/no-op values so the sheet still resolves. These
// tests now lock in THAT: the old names still resolve (nothing references an
// undefined var), but to the new flat, no-glow values — not that glass exists.
test('v49 · look: the retired glass/gradient tokens still resolve, to flat/no-op values', async ({
  page,
}) => {
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      easeSpring: cs.getPropertyValue('--ease-spring').trim(),
      durBase: cs.getPropertyValue('--dur-base').trim(),
      glassBg: cs.getPropertyValue('--glass-bg').trim(),
      gradSurface: cs.getPropertyValue('--grad-surface').trim(),
      gradHero: cs.getPropertyValue('--grad-hero').trim(),
    };
  });
  // Motion still settles (no bounce) — the alias points at the new --ease.
  expect(tokens.easeSpring).toContain('cubic-bezier');
  expect(tokens.durBase).toBeTruthy();
  // Glass retired: transparent, not an rgba wash.
  expect(tokens.glassBg).toBe('transparent');
  // Gradients retired: both resolve to the same flat surface now.
  expect(tokens.gradSurface).toBeTruthy();
  expect(tokens.gradHero).toBeTruthy();
  expect(tokens.gradHero).toBe(tokens.gradSurface);
});

// v48 · P4 (Sep 24 2026): the three tiles became one "Up next" hero + two
// chips. The faint letter sat under the hero's Start, so it went; the letter
// is the hero's own title now, and each chip leads with its letter.
test('cooler-look: the hero names its letter; the chips lead with theirs', async ({ page }) => {
  await expect(page.locator('.workout-card-monogram')).toHaveCount(0);
  await expect(page.locator('.home-hero .hero-title')).toHaveText('Workout A');
  await expect(page.locator('.home-chip').nth(0)).toHaveText(/^B · /);
  await expect(page.locator('.home-chip').nth(1)).toHaveText(/^C · /);
});

test("v49 · look: today's-pick card is a flat hair-strong card, no gradient or glow", async ({
  page,
}) => {
  // Empty history → A is today's pick (per existing test). Spec §6
  // .workout-card-pick: "background: var(--surface)... box-shadow: none" —
  // depth now comes only from the hair-strong border, never a fill or glow.
  const pick = page.locator('.workout-card-pick');
  await expect(pick).toBeVisible();
  const styles = await pick.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      backgroundImage: cs.backgroundImage,
      boxShadow: cs.boxShadow,
      borderRadius: cs.borderRadius,
    };
  });
  expect(styles.backgroundImage).toBe('none');
  expect(styles.boxShadow).toBe('none');
  // Hero radius is the bigger lg value (20px) — visually breaks from the
  // sibling tiles which sit at the default 14px.
  expect(parseFloat(styles.borderRadius)).toBeGreaterThanOrEqual(18);
});

// --- Ship 5 (2026-05-15 Progress screen) -----------------------------------
//
// New AppScreen `progress` — read-only longitudinal view. Reached from home
// via the "📈 Progress →" link below the weekly-review link, and from any
// history-detail screen via "View progress". The screen reports her data; it
// does NOT editorialize. Charts are hand-built inline SVG; no libraries.
//
// These tests lock in:
//  - reachable from home button
//  - wall-sit line chart renders with 2+ data points
//  - empty state renders for fewer than 2 sessions
//  - back-pain bars render only for sessions with backPain > 0
test('ship 5: progress screen reachable from home button', async ({ page }) => {
  const progressBtn = page.locator('#open-progress-link');
  await expect(progressBtn).toBeVisible();
  await progressBtn.click();
  // Header is the progress screen header.
  await expect(page.locator('h2').first()).toHaveText('Progress');
  // v48 · P6: with no sessions there are no A/B/C count chips to show — the
  // count lives in the Start → Now card once sessions exist.
  await expect(page.locator('.progress-subtitle')).toHaveCount(0);
  await expect(page.locator('.progress-empty')).toBeVisible();
});

test('ship 5 (v64): the wall sit shows as a What grew row, first -> latest, with 2+ wall-sit values', async ({
  page,
}) => {
  // Seed three A-workouts with rising wall-sit values across the program.
  // Progress screen should render the wall-sit chart with a 6px emphasized
  // last-point and a dashed max guideline.
  // v49 · look fix (Sep 25 2026): dates moved to on/after Sep 24 2026 — the
  // trend card now reads honestWallSitLogs() only (real v45+ measurements,
  // never a pre-v45 row that saved the week's PRESCRIBED hold as if measured).
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'p-3',
        date: '2026-09-26T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 30,
        backPain: 1,
        word: 'strong',
        durationSec: 600,
      },
      {
        id: 'p-2',
        date: '2026-09-25T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 5,
        wallSitSec: 25,
        backPain: 0,
        word: 'ok',
        durationSec: 580,
      },
      {
        id: 'p-1',
        date: '2026-09-24T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 4,
        capacityAfter: 5,
        wallSitSec: 18,
        backPain: 2,
        word: 'tired',
        durationSec: 540,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  // v64: the wall sit is one What grew row, first -> latest, with its own since-date (no chart:
  // three points is a line with no shape).
  const row = page.locator('.grew-card .start-now-row').filter({ hasText: 'Wall sit' });
  await expect(row).toContainText('18 s → 30 s');
  await expect(row).toContainText('since Sep 24');
  await expect(page.locator('.progress-sparkline')).toHaveCount(0);
  // No motivational language allowed.
  const text = ((await page.locator('.grew-card').textContent()) ?? '').toLowerCase();
  expect(text).not.toContain('great');
  expect(text).not.toContain('you got');
});

test('ship 5: empty state renders for fewer than 2 sessions', async ({ page }) => {
  // No logs → empty state. Calm, no nudge.
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  await expect(page.locator('.progress-empty')).toBeVisible();
  await expect(page.locator('.progress-empty')).toContainText('Progress shows once you have 2+');
  // No motivational language anywhere on the empty screen.
  const body = await page.locator('.progress-empty').textContent();
  expect(body?.toLowerCase()).not.toContain('keep going');
  expect(body?.toLowerCase()).not.toContain('great');
  // No chart rendered when empty.
  await expect(page.locator('.progress-chart')).toHaveCount(0);
});

test('ship 5 (v64): the back reads "pain-free N of M" in the Body check, no bars', async ({
  page,
}) => {
  // 4 sessions: 2 with pain (3, 1), 2 with no pain (0, 0). Bar chart should
  // render 2 visible bars (transparent fill omitted for backPain=0 rows).
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'bp-4',
        date: '2026-05-15T10:00:00.000Z',
        workout: 'B',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 0,
        backPain: 0,
        word: 'fine',
        durationSec: 500,
      },
      {
        id: 'bp-3',
        date: '2026-05-13T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 5,
        wallSitSec: 20,
        backPain: 1,
        word: 'twinge',
        durationSec: 520,
      },
      {
        id: 'bp-2',
        date: '2026-05-10T10:00:00.000Z',
        workout: 'C',
        capacityBefore: 4,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: 'walked',
        durationSec: 720,
      },
      {
        id: 'bp-1',
        date: '2026-05-05T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 4,
        capacityAfter: 4,
        wallSitSec: 15,
        backPain: 3,
        word: 'sore',
        durationSec: 540,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  // v64: the Body check says it in words, pain-free days first; no bar chart.
  const back = page.locator('.body-card .body-line').filter({ hasText: 'Back:' });
  await expect(back).toContainText('Back: pain-free 2 of 4');
  await expect(page.locator('.progress-chart-bar')).toHaveCount(0);
});

// ============================================================================
// Ship 6 — Settings screen + motion polish (2026-05-15)
// ============================================================================
test('ship 6: settings reachable from gear icon in home header', async ({ page }) => {
  // Gear button visible top-right of home header.
  await expect(page.locator('#open-settings')).toBeVisible();
  await page.locator('#open-settings').click();
  // Lands on Settings screen.
  await expect(page.locator('h2')).toHaveText('Settings');
  // v48 · P6: Audio, Timing, Display, Gear, Neck release, About as titled
  // cards; Data is one closed fold ("Data · export · import · clear").
  // v50 · cycle (Sep 25 2026): a Cycle card ("Period started today") joins
  // the lineup, between Display and Gear.
  await expect(page.locator('.settings-section-label')).toHaveText([
    'Audio',
    'Timing',
    'Display',
    'Cycle',
    'Gear',
    'Neck release · ~10 min',
    'About',
  ]);
  await expect(page.locator('details.settings-data')).toHaveJSProperty('open', false);
  // Back returns to home.
  await page.locator('#back-home').click();
  await expect(page.locator('.home-header h1')).toBeVisible();
});

test('ship 6: beep toggle persists to localStorage', async ({ page }) => {
  await page.locator('#open-settings').click();
  // Default = on. Toggle off via the input (force-click bypasses the visual
  // thumb overlay which sits above the input for styling).
  const input = page.locator('#setting-beeps');
  await expect(input).toBeChecked();
  await input.click({ force: true });
  await expect(input).not.toBeChecked();
  // Setting persists in localStorage as JSON literal `false`.
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('workout-tracker:setting-beeps')
  );
  expect(stored).toBe('false');
});

test('ship 6: rest duration stepper updates value and persists', async ({ page }) => {
  await page.locator('#open-settings').click();
  // Default updated 2026-05-15 18:07 to 0s (skip rest entirely) per Allison's
  // "i do not need the brakes anymore" call.
  await expect(page.locator('#rest-val')).toHaveText('0s');
  // Bump up twice — 0 → 5 → 10.
  await page.locator('#rest-inc').click();
  await page.locator('#rest-inc').click();
  await expect(page.locator('#rest-val')).toHaveText('10s');
  // Persisted.
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('workout-tracker:setting-rest-sec')
  );
  expect(stored).toBe('10');
  // Decrement bounded — go to 0 and stop (no negative rest).
  for (let i = 0; i < 20; i++) {
    await page.locator('#rest-dec').click();
  }
  await expect(page.locator('#rest-val')).toHaveText('0s');
});

test('ship 6: export sessions downloads a JSON file', async ({ page }) => {
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'export-1',
        date: '2026-05-15T10:00:00.000Z',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 25,
        backPain: 0,
        word: 'ok',
        durationSec: 540,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-settings').click();
  await page.locator('.settings-data > summary').click(); // v48 · P6: Data is a fold
  await page.locator('#export-sessions').scrollIntoViewIfNeeded();
  // Trigger download. Playwright's waitForEvent captures the file.
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-sessions').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^workout-tracker-export-\d{4}-\d{2}-\d{2}\.json$/);
});

test('ship 6: clear-data hold-to-confirm wipes localStorage', async ({ page }) => {
  await page.addInitScript(() => {
    const logs = [
      {
        id: 'clear-1',
        date: '2026-05-14T10:00:00.000Z',
        workout: 'B',
        capacityBefore: 5,
        capacityAfter: 6,
        wallSitSec: 20,
        backPain: 0,
        word: 'fine',
        durationSec: 520,
      },
    ];
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
  });
  await page.goto('/');
  await page.locator('#open-settings').click();
  // Hold the clear button for 700ms (HOLD_TO_CLEAR_MS = 500ms). Scroll into
  // view first — the Data card lives near the bottom of the screen so on a
  // 1280×720 viewport the mouse coordinates would otherwise be outside it.
  await page.locator('.settings-data > summary').click(); // v48 · P6: Data is a fold
  const clearBtn = page.locator('#clear-local');
  await clearBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const box = await clearBtn.boundingBox();
  if (!box) throw new Error('clear-local button not visible');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  // localStorage cleared.
  const remaining = await page.evaluate(() => window.localStorage.getItem('workout-tracker:logs'));
  expect(remaining).toBeNull();
  // Status banner confirms.
  await expect(page.locator('#data-status')).toContainText('cleared');
});
