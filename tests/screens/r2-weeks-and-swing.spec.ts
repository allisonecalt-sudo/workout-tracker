// Split out of tests/app.spec.ts by scripts/split-spec.mjs (code-shape step 1, Oct 13 2026);
// the test bodies below are copied line for line.
import { test, expect } from '@playwright/test';
import {
  setupPage,
  NEXT,
  openCue,
  ACTIVE_SESSION_KEY,
  LOGS_KEY,
  leftOpenSnapshot,
  SWING_WEEK3_A,
  SWING_WEEK3_B,
  SWING_SAT_C,
  openWeekByWeek,
  mockDate,
  TESTS_DIR as __dirname,
} from '../helpers';

test.beforeEach(async ({ page, context }) => setupPage(page, context));

// --- Round 2 Week 3: the band goes on the clamshells (v35, Sep 14 2026) ------
// Her word: "build week 3". One change only — the yellow band, in B, looped.
// These assert BOTH halves: the change landed, and nothing else moved.
test('R2 W3: a date inside Sep 12-18 2026 resolves to Round 2 · Week 3', async ({ page }) => {
  await page.addInitScript(() => {
    const real = Date;
    const fixed = new real('2026-09-14T10:00:00').getTime();
    class MockDate extends real {
      constructor(...args: ConstructorParameters<typeof Date>) {
        super(...(args.length ? args : [fixed]));
      }
      static override now(): number {
        return fixed;
      }
    }
    (globalThis as unknown as { Date: DateConstructor }).Date =
      MockDate as unknown as DateConstructor;
  });
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Round 2 · Week 3');
});

test('R2 W3: workout B carries the yellow band on the clamshells, reps back to 10', async ({
  page,
}) => {
  await page.locator('button[data-workout="B"]').click();
  // The pre-log overview lists exercise NAMES only, so the name must be
  // unchanged there (the detail card, illustration and recorded voice note are
  // all keyed to it) and the band must show up on the step itself.
  const overview = (await page.locator('.overview-phase-items').allTextContents()).join(' | ');
  expect(overview).toContain('Side-lying clamshells');

  await page.locator('button:has-text("Start")').click();
  let repsSeen = '';
  let notesSeen = '';
  for (let i = 0; i < 40; i++) {
    const name =
      (await page
        .locator('.exercise-name')
        .textContent({ timeout: 1000 })
        .catch(() => '')) ?? '';
    if (name.includes('Side-lying clamshells')) {
      await openCue(page);
      repsSeen =
        (await page
          .locator('.exercise-reps')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      notesSeen =
        (await page
          .locator('.exercise-notes')
          .first()
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      break;
    }
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  // The band is the increase, so reps RESET — 10 a side, never 15 this week.
  expect(repsSeen).toContain('10 each side');
  expect(repsSeen).toContain('yellow band');
  // The notes stay about the MOVEMENT (the tying moved to the setup block, so
  // she isn't reading the same paragraph twice).
  expect(notesSeen).toContain('the band is the increase');
  expect(notesSeen).toContain('finish bodyweight');
});

// v37: her kit is FLAT strips, so the step must explain AND show the tying.
// Her ask: "make sure there s avideo and expalation".
test('R2 W3: the clamshell step carries a tying explanation AND its own video, open by default', async ({
  page,
}) => {
  await page.locator('button[data-workout="B"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 40; i++) {
    const name =
      (await page
        .locator('.exercise-name')
        .textContent({ timeout: 1000 })
        .catch(() => '')) ?? '';
    if (name.includes('Side-lying clamshells')) break;
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }

  const setup = page.locator('.setup-block');
  await expect(setup).toBeVisible();
  // Open by DEFAULT — a step she has never done should not hide behind a tap.
  await expect(setup.locator('.setup-body')).toBeVisible();
  await expect(setup).toContainText('Tie the band into a loop');

  // The explanation: the knot, the sizing, the knot position, and the gate line.
  const steps = setup.locator('.setup-steps li');
  expect(await steps.count()).toBeGreaterThanOrEqual(4);
  const allSteps = (await steps.allTextContents()).join(' | ');
  expect(allSteps).toContain('square knot');
  expect(allSteps).toContain('Overlap');
  expect(allSteps).toContain('just above your knees');
  expect(allSteps).toContain('outside');
  await expect(setup.locator('.setup-footnote')).toContainText('not the gripping gate');

  // The video is a SECOND video, separate from the movement video, and it only
  // loads on tap (no unrequested embed).
  await expect(setup.locator('iframe')).toHaveCount(0);
  await setup.locator('.visual-video-toggle').click();
  const frame = page.locator('.setup-block iframe');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('src', /youtube\.com\/embed\/ESNXHhPdIos/);
  await expect(page.locator('.setup-block .visual-attribution')).toContainText('Total Therapy');

  // And the toggle actually CLOSES on the first tap (the default-open bug).
  await page.locator('.setup-toggle').click();
  await expect(page.locator('.setup-block .setup-body')).toHaveCount(0);
});

// The leak this design exists to prevent: EXERCISE_VISUALS and the detail cards
// are keyed by exercise NAME, so anything hung there appears on every week
// carrying that name. Week 2's clamshell is the SAME name and is bodyweight —
// if the tying setup shows up there, the app is lying about last week.
test('R2 W3: the tying setup does NOT leak onto Week 2, whose clamshell is bodyweight', async ({
  page,
}) => {
  await mockDate(page, '2026-09-08T10:00:00.000Z'); // inside Round 2 Week 2
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Week 2');
  await page.locator('button[data-workout="B"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 40; i++) {
    const name =
      (await page
        .locator('.exercise-name')
        .textContent({ timeout: 1000 })
        .catch(() => '')) ?? '';
    if (name.includes('Side-lying clamshells')) {
      await expect(page.locator('.setup-block')).toHaveCount(0);
      await expect(page.locator('.exercise-reps')).not.toContainText('yellow band');
      // v53 fix (CHECK M6, Sep 26 2026): "Bodyweight this week" was pure
      // program bookkeeping, not movement guidance — moved to a PROGRAM
      // comment (Tips audit). No notes left on this step means no Tips row.
      await openCue(page);
      await expect(page.locator('.tips-section')).toHaveCount(0);
      return;
    }
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  throw new Error("never reached Week 2's clamshells");
});

// And nothing in Workout C gets a setup block — C has no banded move at all.
test('R2 W3: workout C carries no setup block anywhere', async ({ page }) => {
  await page.locator('button[data-workout="C"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 40; i++) {
    await expect(page.locator('.setup-block')).toHaveCount(0);
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
});

test('R2 W3: the band is in B ONLY, and the bird dog has NOT been levelled up', async ({
  page,
}) => {
  // C also has clamshells — they stay bodyweight.
  await page.locator('button[data-workout="C"]').click();
  await expect(page.locator('body')).not.toContainText('yellow band');
  await page.locator('.quit-link, #back-home').first().click();

  // The opposite-arm bird dog is gated on legs-only feeling "like nothing";
  // her word was "good". Both A and B must still say legs only.
  for (const w of ['A', 'B']) {
    await page.locator(`button[data-workout="${w}"]`).click();
    await expect(page.locator('body')).toContainText('Bird dog (legs only)');
    await expect(page.locator('body')).not.toContainText('opposite arm reaches back');
    await page.locator('.quit-link, #back-home').first().click();
  }
});

// v42 (Sep 19 2026): Round 2 Week 4 — two raises, two catch-ups, C untouched.
test('R2 W4: split squat replaces the squat in A only, wall sit reads 45, the 1 kg is back in A+B', async ({
  page,
}) => {
  await mockDate(page, '2026-09-22T10:00:00.000Z'); // Tue inside Round 2 Week 4
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Week 4');

  // A: split squat in, bodyweight squat out, wall sit 45, 1 kg pair present.
  await page.locator('button[data-workout="A"]').click();
  const bodyA = page.locator('body');
  await expect(bodyA).toContainText('Supported split squat');
  await expect(bodyA).not.toContainText('Bodyweight squats');
  // v55 fix r2: the overview renders displayName(), same as the running
  // step — 'Biceps curl' (label), not the '1 kg biceps curl' name key. Reps
  // like "holding the 1 kg" are checked on the running step in the
  // walk-the-steps test below.
  await expect(bodyA).toContainText('Biceps curl');
  await expect(bodyA).toContainText('Prone row');
  // Holds: bird dog still legs-only; wall lean still last.
  await expect(bodyA).toContainText('Bird dog (legs only)');
  await expect(bodyA).toContainText('Wall lean');
  await page.locator('.quit-link, #back-home').first().click();

  // B: no split squat (B never had a squat), hinge says 1 kg, 1 kg pair present, band clamshell held.
  await page.locator('button[data-workout="B"]').click();
  const bodyB = page.locator('body');
  await expect(bodyB).not.toContainText('Supported split squat');
  await expect(bodyB).toContainText('Biceps curl');
  await expect(bodyB).toContainText('Prone row');
  await expect(bodyB).toContainText('Side-lying clamshells');
  await page.locator('.quit-link, #back-home').first().click();

  // C: untouched — its 10 squats stay, no split squat, no 1 kg, no band.
  await page.locator('button[data-workout="C"]').click();
  const bodyC = page.locator('body');
  await expect(bodyC).toContainText('Bodyweight squats');
  await expect(bodyC).not.toContainText('Supported split squat');
  await expect(bodyC).not.toContainText('Biceps curl');
  await expect(bodyC).not.toContainText('yellow band');
});

// ---------- Saturday is the swing day (v42, Sep 19 2026) ----------
// Her rule: a Saturday session counts toward the week that just ended if that
// week is short of 3; otherwise it opens the new week. Sunday+ never swings.
// The seeded rows keep their TRUE timestamps — only the counting moves.
test('swing: a Saturday session completes a 2-session week — last week shows 3 of 3, this week 0', async ({
  page,
}) => {
  await page.addInitScript(
    (rows: unknown[]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    },
    [SWING_WEEK3_A, SWING_WEEK3_B, SWING_SAT_C]
  );
  await mockDate(page, '2026-09-20T10:00:00.000Z'); // Sun Sep 20 — Week 4
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Week 4');

  // v48 · P4: home's one week line says where Saturday's C went, in words.
  const line = page.locator('.week-line');
  await expect(line).toContainText('0 of 3 this week');
  await expect(line).toContainText("Sat's C went to Week 3");

  await openWeekByWeek(page);
  // This week: three open slots.
  await expect(page.locator('.weekly-row-current .weekly-slot-empty')).toHaveCount(3);
  // Last week (R2 · Wk 3): A, B, C — the Saturday C is its third pill.
  const wk3 = page.locator('.weekly-row').filter({ hasText: 'R2 · Wk 3' }).first();
  await expect(wk3.locator('button.weekly-slot')).toHaveCount(3);
  await expect(wk3.locator('button.weekly-slot').nth(2)).toHaveText('C');
});

test('swing: a Saturday session does NOT swing when last week already has 3 — it opens the new week', async ({
  page,
}) => {
  const full = [
    { ...SWING_WEEK3_A, id: 'full-a', date: '2026-09-13T15:00:00.000Z' }, // Sun
    { ...SWING_WEEK3_B, id: 'full-b', date: '2026-09-15T15:00:00.000Z' }, // Tue
    { ...SWING_WEEK3_B, id: 'full-c', workout: 'C', date: '2026-09-17T15:00:00.000Z' }, // Thu
    SWING_SAT_C,
  ];
  await page.addInitScript((rows: unknown[]) => {
    window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
  }, full);
  await mockDate(page, '2026-09-20T10:00:00.000Z');
  await page.goto('/');
  const line = page.locator('.week-line');
  await expect(line).toContainText('1 of 3 this week');
  await expect(line).not.toContainText("Sat's");
  await openWeekByWeek(page);
  await expect(page.locator('.weekly-row-current button.weekly-slot')).toHaveCount(1);
  const wk3 = page.locator('.weekly-row').filter({ hasText: 'R2 · Wk 3' }).first();
  await expect(wk3.locator('button.weekly-slot')).toHaveCount(3);
});

test('swing: a SUNDAY session never swings, even when last week is short', async ({ page }) => {
  const sunday = { ...SWING_SAT_C, id: 'sun-c', date: '2026-09-20T19:21:00.000Z' }; // Sun Sep 20
  await page.addInitScript(
    (rows: unknown[]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    },
    [SWING_WEEK3_A, SWING_WEEK3_B, sunday]
  );
  await mockDate(page, '2026-09-21T10:00:00.000Z'); // Mon Sep 21
  await page.goto('/');
  const line = page.locator('.week-line');
  await expect(line).toContainText('1 of 3 this week');
  await expect(line).not.toContainText("Sat's");
  await openWeekByWeek(page);
  const wk3 = page.locator('.weekly-row').filter({ hasText: 'R2 · Wk 3' }).first();
  await expect(wk3.locator('button.weekly-slot')).toHaveCount(2);
});

// v46: the swing must show where the big number is. On the Saturday night she
// closed Week 3, home read "0 OF 3 THIS WEEK" next to a lit Saturday dot — the
// win invisible at the moment she earned it (UX audit Sep 24).
// v48 · P4 (DECISIONS Q2): in WORDS, every day — not a Saturday-only swap of
// the big number: "0 of 3 this week · Sat's C went to Week 3". (v49 · look,
// Sep 25 2026: "· N total" moved off this line onto the Start → Now card's
// own Sessions row — "Only one count on Home".)
test('swing (v46): on the Saturday itself the week card carries the week it closed', async ({
  page,
}) => {
  await page.addInitScript(
    (rows: unknown[]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    },
    [SWING_WEEK3_A, SWING_WEEK3_B, SWING_SAT_C]
  );
  await mockDate(page, '2026-09-19T19:30:00.000Z'); // Sat Sep 19, 22:30 Jerusalem — right after the C
  await page.goto('/');
  await expect(page.locator('.week-line')).toHaveText("0 of 3 this week · Sat's C went to Week 3");
  await expect(page.locator('.home-startnow-card .start-now-row').last()).toContainText('3');
  await expect(page.locator('.swing-note')).toHaveCount(0);
  // The next morning (Sunday) the words stay — the swing is worked out every day.
  await mockDate(page, '2026-09-20T10:00:00.000Z');
  await page.goto('/');
  await expect(page.locator('.week-line')).toHaveText("0 of 3 this week · Sat's C went to Week 3");
});

// v52 (Sep 26 2026, main): the standalone ".swing-note" line was folded into
// ".week-line" itself ("N of 3 · <workout> left — tonight counts for Week N")
// so the count and the swing explanation read as one sentence, not two.
test('swing (v52, was v46): Saturday morning with last week at 2 says today will count for it', async ({
  page,
}) => {
  await page.addInitScript(
    (rows: unknown[]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    },
    [SWING_WEEK3_A, SWING_WEEK3_B]
  );
  await mockDate(page, '2026-09-19T06:00:00.000Z'); // Sat Sep 19, 09:00 Jerusalem — nothing done yet
  await page.goto('/');
  // v52 (Sep 26 2026): a swing Saturday now SHOWS last week (her "I want to be
  // very clear that I'm in week 4 right now"), so the count is last week's
  // and the old "today will count for it" note is replaced by the week line.
  await expect(page.locator('.week-line')).toHaveText(
    '2 of 3 · C left — tonight counts for Week 3'
  );
  await expect(page.locator('.home-header h1')).toContainText('Week 3');
  await expect(page.locator('.swing-note')).toHaveCount(0);
});

// v46: only completed program weeks are judged. Break + sick weeks and the week
// in progress were counted as misses, turning 13 of 13 training weeks into
// "13 of 21" (UX audit Sep 24).
// v48 · fix r1 (Sep 24 2026): the line is a plain count ("N full weeks") — no
// "target", no "of N" verdict — and a 0-session week inside the sick/break
// stretch (her real wk 11, Jul 18-24, between "sick" and "break") is "—" with
// no track, never "0 / 3". A 0 week in the middle of training still shows.
test('progress: "N full weeks" counts training weeks only — no break, sick, in-progress or held weeks', async ({
  page,
}) => {
  const mk = (id: string, date: string, workout: 'A' | 'B' | 'C') => ({
    id,
    date,
    workout,
    capacityBefore: 6,
    capacityAfter: 6,
    wallSitSec: 0,
    backPain: 0,
    word: '',
  });
  await page.addInitScript(
    (rows: unknown[]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(rows));
    },
    [
      // R1 Week 10 (Jul 4–10): 3 — full; her last Round 1 session is Jul 8.
      mk('r1a', '2026-07-05T15:00:00.000Z', 'A'),
      mk('r1b', '2026-07-07T15:00:00.000Z', 'B'),
      mk('r1c', '2026-07-08T15:00:00.000Z', 'C'),
      // R2 Week 1 (Aug 29–Sep 4): 3 — hit.
      mk('w1a', '2026-08-30T15:00:00.000Z', 'A'),
      mk('w1b', '2026-09-01T15:00:00.000Z', 'B'),
      mk('w1c', '2026-09-03T15:00:00.000Z', 'C'),
      // R2 Week 2 (Sep 5–11): 3 — hit.
      mk('w2a', '2026-09-06T15:00:00.000Z', 'A'),
      mk('w2b', '2026-09-08T15:00:00.000Z', 'B'),
      mk('w2c', '2026-09-10T15:00:00.000Z', 'C'),
      // R2 Week 3 (Sep 12–18): 2 — a real miss, stays counted.
      mk('w3a', '2026-09-13T15:00:00.000Z', 'A'),
      mk('w3b', '2026-09-15T15:00:00.000Z', 'B'),
      // R2 Week 4, in progress: 1 — not judged yet.
      mk('w4a', '2026-09-22T15:00:00.000Z', 'A'),
    ]
  );
  await mockDate(page, '2026-09-24T08:00:00.000Z'); // Thu inside R2 Week 4
  await page.goto('/');
  await page.locator('#open-progress-link').click();
  const card = page.locator('.progress-card').filter({ hasText: 'Sessions per week' });
  // R1 wk 10 + the two 3/3 R2 weeks = 3 full weeks. No verdict words.
  const meta = card.locator('.progress-card-meta');
  await expect(meta).toHaveText('3 full weeks');
  await expect(meta).not.toContainText('target');
  await expect(meta).not.toContainText(' of ');
  // The bars still show every week, breaks included.
  await expect(card).toContainText('break');
  await expect(card).toContainText('now');
  await card.locator('.spw-older-summary').click();
  // Round 1's rows live in its fold (R2 has its own "wk 1").
  const row = (label: string) =>
    card
      .locator('details.spw-older .spw-row')
      .filter({ has: page.locator(`.spw-label:text-is("${label}")`) });
  // wk 11 sits between "sick" and "break": held, not scored.
  await expect(row('wk 11')).toHaveClass(/spw-row-skipped/);
  await expect(row('wk 11')).toContainText('—');
  await expect(row('wk 11').locator('.spw-track')).toHaveCount(0);
  await expect(row('wk 11')).not.toContainText('/ 3');
  // wk 10 is full; wk 1 (0 sessions mid-round, no break beside it) still shows.
  await expect(row('wk 10')).toContainText('3 / 3');
  await expect(row('wk 1').locator('.spw-track')).toHaveCount(1);
  await expect(row('wk 1')).toContainText('0 / 3');
});

// The overview lists names, not reps — so the wall-sit seconds are checked inside
// the running workout, on the step itself (same walk-the-steps grammar as W3).
test('R2 W4: the wall sit step itself reads 45 sec (the earned nudge from 40)', async ({
  page,
}) => {
  await mockDate(page, '2026-09-22T10:00:00.000Z'); // Tue inside Round 2 Week 4
  await page.goto('/');
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 40; i++) {
    const name =
      (await page
        .locator('.exercise-name')
        .textContent({ timeout: 1000 })
        .catch(() => '')) ?? '';
    if (name.includes('Wall sit')) {
      await expect(page.locator('.exercise-reps')).toContainText('45 sec');
      await openCue(page);
      // v53 Tips audit: "40 → 45" (the bump history) is PROGRAM bookkeeping,
      // moved to a code comment — the movement guidance is what stays visible.
      await expect(page.locator('.exercise-notes').first()).toContainText(
        'Keep the depth: knees toward 90'
      );
      await expect(page.locator('.exercise-notes').first()).not.toContainText('40 → 45');
      return;
    }
    if (name.includes('Supported split squat')) {
      await expect(page.locator('.exercise-reps')).toContainText('6-8 each side');
    }
    // v48 · fix r2 (Sep 25 2026): Week 4 titles it "Hip hinge" (label only).
    // v55 · fix r1 (Sep 27 2026): "holding the 1 kg" (fixed weight) → "holding
    // 1–2 kg (your pick)" — no Lisa gate, her pick by pain (rule 8e).
    if (/hip hinge/i.test(name)) {
      await expect(page.locator('.exercise-reps')).toContainText('holding 1–2 kg (your pick)');
    }
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else break;
  }
  throw new Error("never reached Week 4's wall sit");
});

// The leak guard, same shape as W3's: the split squat is keyed by NAME, so it must
// not appear on any earlier week — Week 3's A still says bodyweight squats.
test('R2 W4: the split squat does NOT leak onto Week 3', async ({ page }) => {
  await mockDate(page, '2026-09-15T10:00:00.000Z'); // Tue inside Round 2 Week 3
  await page.goto('/');
  await expect(page.locator('.home-header h1')).toContainText('Week 3');
  await page.locator('button[data-workout="A"]').click();
  await expect(page.locator('body')).toContainText('Bodyweight squats');
  await expect(page.locator('body')).not.toContainText('Supported split squat');
  await expect(page.locator('body')).not.toContainText('holding the 1 kg');
});

test('R2 W3: gear card no longer says the band is waiting for a future week', async ({ page }) => {
  // v48 · P4: Gear & recovery lives in Settings now. v48 · P6 (Sep 24 2026):
  // chips — the band is a ✅ chip ("in the workout"), not a waiting line.
  await page.locator('#open-settings').click();
  const gear = page.locator('.gear-card');
  // v55 · fix r3 (Sep 28 2026, nice): the redundant "1 kg · A+B arm block"
  // chip is gone (the pairs chip below already says she has the 1 kg) —
  // order shifts, Yellow band is have-chip #1 now.
  await expect(gear.locator('.gear-chip-have')).toContainText([
    'Yellow band · B clamshells',
    '1 kg + 2 kg pairs · your pick by pain',
  ]);
  await expect(gear).not.toContainText('Not in a workout yet');
  await expect(gear).not.toContainText('Booked for');
});

// v39 (Sep 14 2026): before-capacity goes nullable. The sync used to coerce a
// missing reading with `?? 0`, and 0 is not a value the slider can produce (its
// range is 1-10) — so it was a hole wearing a number. Named in the May-14 audit,
// fixed on her word "ok so fix it". One REAL row has this: her very first
// session, May 2 2026, has both capacity columns null and was rendering "0→0".
test('capacity before (v39): a missing reading stays missing through the sync, the week average and the import', async ({
  page,
}) => {
  const out = await page.evaluate(() => {
    const w = window as unknown as {
      __wtMergeRemoteSessions: (l: unknown[], r: unknown[]) => Array<Record<string, unknown>>;
      __wtComputeWeekTotals: (s: unknown[]) => { avgCapBefore: number | null; count: number };
      __wtIsValidLogEntry: (x: unknown) => boolean;
    };
    // The real May-2 shape: both capacity columns null on the server.
    const merged = w.__wtMergeRemoteSessions(
      [],
      [
        {
          id: 'first-ever',
          date: '2026-05-02T19:00:00+00:00',
          workout_type: 'A',
          capacity_before_1_10: null,
          capacity_after_1_10: null,
          wall_sit_seconds: 20,
          pain_back_0_10: null,
          one_word: null,
          started_at: null,
          completed_at: null,
          duration_seconds: null,
          notes: null,
        },
      ]
    );
    const mk = (before: number | null) => ({
      log: {
        id: `x${String(before)}`,
        date: '2026-09-14T10:00:00.000Z',
        workout: 'A',
        capacityBefore: before,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: '',
      },
      durationStr: '—',
    });
    return {
      mergedBefore: merged[0]?.['capacityBefore'],
      // 6 and 8 known, one missing → average must be 7, NOT (6+8+0)/3 = 4.67.
      totals: w.__wtComputeWeekTotals([mk(6), mk(8), mk(null)]),
      allMissing: w.__wtComputeWeekTotals([mk(null)]).avgCapBefore,
      importAcceptsNull: w.__wtIsValidLogEntry({
        date: '2026-05-02',
        workout: 'A',
        capacityBefore: null,
        capacityAfter: null,
        wallSitSec: 20,
        backPain: null,
      }),
      importRejectsJunk: w.__wtIsValidLogEntry({
        date: '2026-05-02',
        workout: 'A',
        capacityBefore: 'five',
        capacityAfter: null,
        wallSitSec: 20,
        backPain: null,
      }),
    };
  });

  // The whole point: null survives the sync instead of becoming 0.
  expect(out.mergedBefore).toBeNull();
  // The average is over the readings that EXIST, so a hole cannot drag it down.
  expect(out.totals.count).toBe(3);
  expect(out.totals.avgCapBefore).toBe(7);
  // Nothing to average → "—", not 0.
  expect(out.allMissing).toBeNull();
  // And a backup containing that row still restores.
  expect(out.importAcceptsNull).toBe(true);
  expect(out.importRejectsJunk).toBe(false);
});

test('capacity before (v39): the history row shows an em dash, never "0"', async ({
  page,
  context,
}) => {
  // Seed on THIS page, then read from a fresh page in the same context: the
  // suite's beforeEach installs an init script that clears localStorage on
  // every navigation, so a goto() here would wipe the row we just wrote.
  await page.evaluate(() => {
    localStorage.setItem(
      'workout-tracker:logs',
      JSON.stringify([
        {
          id: 'first-ever',
          date: '2026-05-02T19:00:00.000Z',
          workout: 'A',
          capacityBefore: null,
          capacityAfter: null,
          wallSitSec: 20,
          backPain: null,
          word: '',
          synced: true,
        },
      ])
    );
  });
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.locator('#view-history').click();
  const meta = reopened.locator('.history-meta').first();
  await expect(meta).toContainText('cap —→—');
  await expect(meta).not.toContainText('cap 0');
  await reopened.close();
});

// v41 (Sep 14 2026): her word — "ok but planks come back in and the wall learn",
// then "plank on forearms still" / "but can do stuff on forearms".
test('R2 W3 (v41): the wall lean is back in A and B, after the bird dog', async ({ page }) => {
  for (const w of ['A', 'B']) {
    await page.goto('/');
    await page.locator(`button[data-workout="${w}"]`).click();
    const overview = (await page.locator('.overview-phase-items').allTextContents()).join(' | ');
    expect(overview).toContain('Wall lean (wrist on-ramp)');
    expect(overview).toContain('Bird dog (legs only)');
    // The wall lean must come AFTER the bird dog: a stop-at-pain exit on the
    // easier move should not cost her the harder one she has already earned.
    expect(overview.indexOf('Wall lean')).toBeGreaterThan(overview.indexOf('Bird dog'));
  }
});

test('R2 W3 (v41): the forearm plank now runs in B too, and stays on FOREARMS', async ({
  page,
}) => {
  await page.locator('button[data-workout="B"]').click();
  const overview = (await page.locator('.overview-phase-items').allTextContents()).join(' | ');
  expect(overview).toContain('Forearm plank');
  // The hands plank stays out — her own ladder puts it at the top and she is on
  // rung 3. "plank on forearms still" is the ruling this pins.
  expect(overview).not.toContain('Plank on hands');
  expect(overview).not.toContain('High plank');
});

test('R2 W3 (v41): the plank in B is the SAME prescription as the one in A', async ({ page }) => {
  const read = async (w: string) => {
    await page.goto('/');
    await page.locator(`button[data-workout="${w}"]`).click();
    await page.locator('button:has-text("Start")').click();
    for (let i = 0; i < 60; i++) {
      const name =
        (await page
          .locator('.exercise-name')
          .textContent({ timeout: 1000 })
          .catch(() => '')) ?? '';
      if (name.includes('Forearm plank')) {
        await openCue(page);
        const reps =
          (await page
            .locator('.exercise-reps')
            .textContent({ timeout: 1000 })
            .catch(() => '')) ?? '';
        const notes =
          (await page
            .locator('.exercise-notes')
            .first()
            .textContent({ timeout: 1000 })
            .catch(() => '')) ?? '';
        return `${reps.trim()} :: ${notes.trim()}`;
      }
      const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
      if (await nextBtn.isVisible()) await nextBtn.click();
      else {
        const skipRest = page.locator('#skip-rest');
        if (await skipRest.isVisible()) {
          const box = await skipRest.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(700);
            await page.mouse.up();
          }
        } else break;
      }
    }
    return null;
  };
  const inA = await read('A');
  const inB = await read('B');
  expect(inA).not.toBeNull();
  expect(inB).toBe(inA);
  expect(String(inA)).toContain('Forearms only, NOT hands');
});

// v40 (Sep 14 2026): `setup` must work on every phase whose type allows it.
// The cooldown list renders Exercise[] through its own markup, so it was the
// one phase where a setup block would have silently vanished. Asserted against
// the renderer rather than the program, since no real stretch carries one.
test('setup blocks (v40): every phase that renders an Exercise also renders its setup', async ({
  page,
}) => {
  // code-shape R1b (Sep 27 2026): this used to fetch the SHIPPED bundle
  // (dist/app.js) and grep it — esbuild's minifier can rename/inline a
  // non-exported function, and the bundle is now content-hashed, so a
  // structural source check reads the TypeScript source directly instead.
  // Same assertion (1 definition + 2 call sites), source of truth moved.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.ts'), 'utf8');
  const callSites = (src.match(/renderExerciseSetup\(/g) ?? []).length;
  // 1 definition + 2 call sites.
  expect(callSites).toBeGreaterThanOrEqual(3);

  // And the cooldown list still renders normally with no setup present.
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  for (let i = 0; i < 60; i++) {
    if (
      await page
        .locator('.stretch-list')
        .isVisible()
        .catch(() => false)
    )
      break;
    const nextBtn = page.locator('#next, #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) await nextBtn.click();
    else {
      const skipRest = page.locator('#skip-rest');
      if (await skipRest.isVisible()) {
        const box = await skipRest.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(700);
          await page.mouse.up();
        }
      } else break;
    }
  }
  await expect(page.locator('.stretch-list')).toBeVisible();
  await expect(page.locator('.stretch-row').first()).toBeVisible();
  // No stretch carries a setup today, so none should show.
  await expect(page.locator('.stretch-list .setup-block')).toHaveCount(0);
});

// v34 (Sep 14 2026): both of these were found by the close's bleed check, not
// by a test — the v32 nullable change had two readers that were never updated.
test('backup restore (v34): a row with null after-capacity / back pain survives the import', async ({
  page,
}) => {
  // The real shape of her Mon Sep 7 row: logged after the fact, so no post-log.
  // Before v34 `isValidLogEntry` demanded `typeof === 'number'` and this row was
  // silently dropped on import — a real session lost with no error shown.
  const dropped = await page.evaluate(() => {
    const rows = [
      {
        id: 'after-the-fact',
        date: '2026-09-07T15:00:00.000Z',
        workout: 'A',
        capacityBefore: 6,
        capacityAfter: null,
        wallSitSec: 0,
        backPain: null,
        word: '',
        notes: 'logged after the fact',
      },
      {
        id: 'ordinary',
        date: '2026-09-11T15:07:00.000Z',
        workout: 'B',
        capacityBefore: 7,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: 'good',
      },
    ];
    const fn = (window as unknown as { __wtIsValidLogEntry: (x: unknown) => boolean })
      .__wtIsValidLogEntry;
    return rows.filter((r) => !fn(r)).map((r) => r.id);
  });
  expect(dropped).toEqual([]);

  // And the guard still rejects genuinely broken rows.
  const rejected = await page.evaluate(() => {
    const fn = (window as unknown as { __wtIsValidLogEntry: (x: unknown) => boolean })
      .__wtIsValidLogEntry;
    return [
      // v54 fix r1 (Sep 27 2026): 'D' joined the valid letters (Workout D, the
      // elliptical extra) — this fixture used to be 'D' as a stand-in for "an
      // unknown workout letter", which the fix would otherwise have silently
      // started accepting. 'E' is a letter the app has never had.
      fn({
        date: '2026-09-07',
        workout: 'E',
        capacityBefore: 5,
        capacityAfter: null,
        wallSitSec: 0,
      }),
      fn({ date: '2026-09-07', workout: 'A', capacityBefore: 'six', wallSitSec: 0 }),
      fn({ workout: 'A', capacityBefore: 5, wallSitSec: 0 }),
      fn({
        date: '2026-09-07',
        workout: 'A',
        capacityBefore: 5,
        capacityAfter: 'none',
        wallSitSec: 0,
        backPain: null,
      }),
      fn(null),
    ];
  });
  expect(rejected).toEqual([false, false, false, false, false]);
});

// v50 · mood: optional AND nullable, same shape as wristPain — a pre-v50
// export has neither key and must still restore; junk in either is rejected.
test('isValidLogEntry (v50): moodBefore/moodAfter are optional, nullable, and typed', async ({
  page,
}) => {
  const out = await page.evaluate(() => {
    const fn = (window as unknown as { __wtIsValidLogEntry: (x: unknown) => boolean })
      .__wtIsValidLogEntry;
    const base = {
      date: '2026-09-25',
      workout: 'A',
      capacityBefore: 5,
      capacityAfter: 5,
      wallSitSec: 0,
      backPain: 0,
    };
    return {
      noMoodKeysAtAll: fn(base), // pre-v50 export
      nullMood: fn({ ...base, moodBefore: null, moodAfter: null }),
      numberMood: fn({ ...base, moodBefore: 8, moodAfter: 3 }),
      junkMood: fn({ ...base, moodBefore: 'happy', moodAfter: 3 }),
    };
  });
  expect(out.noMoodKeysAtAll).toBe(true);
  expect(out.nullMood).toBe(true);
  expect(out.numberMood).toBe(true);
  expect(out.junkMood).toBe(false);
});

test('isValidLogEntry (v51): backPainBefore/wristPainBefore are optional, nullable, and typed', async ({
  page,
}) => {
  const out = await page.evaluate(() => {
    const fn = (window as unknown as { __wtIsValidLogEntry: (x: unknown) => boolean })
      .__wtIsValidLogEntry;
    const base = {
      date: '2026-09-25',
      workout: 'A',
      capacityBefore: 5,
      capacityAfter: 5,
      wallSitSec: 0,
      backPain: 0,
    };
    return {
      noKeysAtAll: fn(base), // pre-v51 export
      nullBefore: fn({ ...base, backPainBefore: null, wristPainBefore: null }),
      numberBefore: fn({ ...base, backPainBefore: 4, wristPainBefore: 0 }),
      junkBefore: fn({ ...base, backPainBefore: 'ouch', wristPainBefore: 0 }),
    };
  });
  expect(out.noKeysAtAll).toBe(true);
  expect(out.nullBefore).toBe(true);
  expect(out.numberBefore).toBe(true);
  expect(out.junkBefore).toBe(false);
});

test('weekly total (v34, rebased on confirmed timing T2 fix r1): a week with an unconfirmed session says how many it counted', async ({
  page,
}) => {
  // T2 fix r1 (Sep 27 2026, checker's "must"): this used to fold `durationSec`
  // — the app's own tap-time — into the total, so a plain `durationSec` on an
  // otherwise-unconfirmed row silently counted as workout time. The total now
  // comes ONLY from confirmed her_start/her_end pairs (timing.ts's
  // trainingMinutes); a row with `durationSec` but no confirm contributes
  // nothing, same as one with neither.
  const out = await page.evaluate(() => {
    const mk = (id: string, date: string, timing?: { herStartAt: string; herEndAt: string }) => ({
      log: {
        id,
        date,
        workout: 'A',
        capacityBefore: 6,
        capacityAfter: 5,
        wallSitSec: 0,
        backPain: 0,
        word: '',
        durationSec: 1951, // app tap-time present either way — must be ignored
        herStartAt: timing ? timing.herStartAt : null,
        herStartConfirmed: !!timing,
        herEndAt: timing ? timing.herEndAt : null,
        herEndConfirmed: !!timing,
      },
    });
    const fn = (
      window as unknown as {
        __wtComputeWeekTotals: (s: unknown[]) => {
          count: number;
          trainingMinSum: number;
          trainingKnownCount: number;
        };
      }
    ).__wtComputeWeekTotals;
    const partial = fn([
      mk('a', '2026-09-07T15:00:00.000Z'), // no confirm — logged after the fact
      mk('b', '2026-09-11T15:07:00.000Z', {
        herStartAt: '2026-09-11T15:07:00.000Z',
        herEndAt: '2026-09-11T15:52:00.000Z', // 45 min
      }),
      mk('c', '2026-09-11T15:25:00.000Z', {
        herStartAt: '2026-09-11T15:25:00.000Z',
        herEndAt: '2026-09-11T15:45:00.000Z', // 20 min
      }),
    ]);
    const complete = fn([
      mk('b', '2026-09-11T15:07:00.000Z', {
        herStartAt: '2026-09-11T15:07:00.000Z',
        herEndAt: '2026-09-11T15:52:00.000Z',
      }),
    ]);
    return { partial, complete };
  });
  // The unconfirmed session must NOT drag the total down, and must be declared.
  expect(out.partial.trainingMinSum).toBe(45 + 20);
  expect(out.partial.count).toBe(3);
  expect(out.partial.trainingKnownCount).toBe(2);
  // A complete week says nothing extra.
  expect(out.complete.count).toBe(1);
  expect(out.complete.trainingKnownCount).toBe(1);
});

// The Done safety net: "Keep going" on a 5-hour-old C, walk it to Save, and the
// duration comes out as 5h+. That is a session that sat open, not a workout
// length — it must be blanked ("—") and explained in the note, never logged.
test('Done safety net: a session that comes out longer than 3h logs no duration, with a note', async ({
  page,
  context,
}) => {
  const FIVE_HOURS = 5 * 60 * 60 * 1000;
  await page.evaluate(([key, snap]) => localStorage.setItem(key, JSON.stringify(snap)), [
    ACTIVE_SESSION_KEY,
    leftOpenSnapshot(FIVE_HOURS, 'C'),
  ] as const);
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.locator('#stale-continue').click();
  await expect(reopened.locator('.exercise-name')).toBeVisible();

  for (let i = 0; i < 30; i++) {
    const isPostLog = await reopened
      .locator('text=Quick log')
      .isVisible()
      .catch(() => false);
    if (isPostLog) break;
    const nextBtn = reopened.locator('#next, #start-round-2, #ww-skip');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    } else {
      const skipRest = reopened.locator('#skip-rest');
      if (await skipRest.isVisible()) {
        const box = await skipRest.boundingBox();
        if (box) {
          await reopened.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await reopened.mouse.down();
          await reopened.waitForTimeout(700);
          await reopened.mouse.up();
        }
      }
    }
  }
  await expect(reopened.locator('text=Quick log')).toBeVisible();
  await reopened.locator('#save-log').click();
  await expect(reopened.locator('.home-header h1')).toBeVisible();

  const row = await reopened.evaluate(
    (logsKey) =>
      (JSON.parse(localStorage.getItem(logsKey) ?? '[]') as Array<Record<string, unknown>>)[0],
    LOGS_KEY
  );
  expect(row).toBeDefined();
  expect(row!['durationSec']).toBeUndefined();
  expect(String(row!['notes'])).toContain('left open');
  // v48 · P4: the row is read in Sessions — no duration shown, never 5h+.
  await reopened.locator('#view-history').click();
  await expect(reopened.locator('.history-date').first()).not.toContainText(/\d+\s*(h|min|m)\b/);
  await reopened.close();
});

// As of v19 (Jul 9 2026) every program exercise has an enriched EXERCISE_DETAIL
// card, so renderWorkout shows the detail card (voice note + muscle target +
// dropdowns) instead of the legacy how-to card. The old how-to card + its
// EXERCISE_HOWTO/EXERCISE_GUIDE data stay in source as the fallback for any
// future unmapped exercise (archive-not-delete). These three tests moved from
// asserting the how-to card to asserting the detail card that now renders on
// the first exercise (Outdoor walk).
test('detail card: a dropdown section opens and closes on click', async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  // A opens on the walk step, which deliberately has NO card (stripped Jul 12) —
  // advance one step to the first real exercise before asserting the card.
  await page.locator(NEXT).click();
  // v48: scoped to the detail card — the step card now has its own "Cue ▸".
  const toggle = page.locator('.detail-card .detail-section-toggle').first();
  await expect(toggle).toBeVisible();
  await toggle.click(); // open
  await expect(page.locator('.detail-section-body')).toHaveCount(1);
  await toggle.click(); // close
  await expect(page.locator('.detail-section-body')).toHaveCount(0);
});

test("detail card: Do & Don't dropdown shows do + don't cues", async ({ page }) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator(NEXT).click(); // past the card-less walk step
  await page.locator('.detail-section-toggle', { hasText: "Do & Don't" }).click();
  await expect(page.locator('.detail-cue-do').first()).toBeVisible();
  await expect(page.locator('.detail-cue-dont').first()).toBeVisible();
});

test('detail card: face shows the voice note + muscle target on the first exercise', async ({
  page,
}) => {
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await page.locator(NEXT).click(); // past the card-less walk step
  // Form guidance always renders — now as the detail card, not the how-to card.
  await expect(page.locator('.voice-note-btn')).toBeVisible();
  await expect(page.locator('.muscle-svg')).toBeVisible();
});

test('walk step: shows no form card — Start walk is the whole interface', async ({ page }) => {
  // The v19 card on the walk step was clutter (handoff note, stripped Jul 12 2026).
  await page.locator('button[data-workout="A"]').click();
  await page.locator('button:has-text("Start")').click();
  await expect(page.locator('.exercise-name')).toHaveText('Cardio');
  await expect(page.locator('.detail-card')).toHaveCount(0);
  await expect(page.locator('.voice-note-btn')).toHaveCount(0);
});
