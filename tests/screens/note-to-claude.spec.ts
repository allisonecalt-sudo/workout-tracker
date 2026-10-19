// tests/screens/note-to-claude.spec.ts - v63 item 1 (Oct 19 2026): the 🎤 Note button on every screen
// and the "Note to Claude" sheet.
//
// Every request leaves through a stub: the Supabase inbox (voice_captures) and Gemini are faked here,
// and anything else that is not the local server is aborted, so nothing in this file can reach the
// network. The microphone is Chromium's own fake device (a steady beep), not a stub of the app.
import { test, expect, type Page } from '@playwright/test';
import { setupPage, NEXT } from '../helpers';

const CAPTURES = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co/rest/v1/voice_captures';
const GEMINI_URL = /^https:\/\/generativelanguage\.googleapis\.com\//;
const GEMINI_KEY_SLOT = 'voice-capture.gemini-key';
const FAKE_KEY = 'fake-key-not-real';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test.use({
  reducedMotion: 'reduce',
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
});

type Seen = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

type Net = {
  captures: Seen[];
  gemini: Seen[];
  /** 'ok' | 'down' (network error) | 'dup' (409 / 23505) | 'refuse' (409 / 23503) | 'error' (500) */
  inbox: 'ok' | 'down' | 'dup' | 'refuse' | 'error';
  /** 'ok' | 'down' | 'bad' (400, not retried) */
  gemini_mode: 'ok' | 'down' | 'bad';
  transcript: string;
};

const SEED_LOGS = [
  {
    id: 'note-s1',
    date: '2026-09-20',
    workout: 'A',
    capacityBefore: 7,
    capacityAfter: 7,
    wallSitSec: 20,
    backPain: 1,
    word: 'steady',
    synced: true,
  },
  {
    id: 'note-s2',
    date: '2026-09-21',
    workout: 'C',
    capacityBefore: 7,
    capacityAfter: 7,
    wallSitSec: 20,
    backPain: 1,
    word: 'steady',
    synced: true,
  },
];

let net: Net;

test.beforeEach(async ({ page, context }) => {
  net = {
    captures: [],
    gemini: [],
    inbox: 'ok',
    gemini_mode: 'ok',
    transcript: 'hello from the mic',
  };
  // nothing but the local server may be reached
  await context.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => route.abort()
  );
  await context.route(CAPTURES, async (route) => {
    const req = route.request();
    net.captures.push({
      url: req.url(),
      headers: req.headers(),
      body: JSON.parse(req.postData() ?? '{}') as Record<string, unknown>,
    });
    if (net.inbox === 'down') return route.abort();
    if (net.inbox === 'error') return route.fulfill({ status: 500, body: '{}' });
    if (net.inbox === 'dup') {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: '{"code":"23505"}',
      });
    }
    if (net.inbox === 'refuse') {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: '{"code":"23503"}',
      });
    }
    return route.fulfill({ status: 201, body: '' });
  });
  await context.route(GEMINI_URL, async (route) => {
    const req = route.request();
    net.gemini.push({
      url: req.url(),
      headers: req.headers(),
      body: JSON.parse(req.postData() ?? '{}') as Record<string, unknown>,
    });
    if (net.gemini_mode === 'down') return route.abort();
    if (net.gemini_mode === 'bad') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: '{"error":{"message":"bad"}}',
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ text: `  ${net.transcript} \n` }] } }],
      }),
    });
  });
  await setupPage(page, context);
});

/** Seed her history (and, if asked, the Gemini key) for every load of this page, then load it. */
async function seed(page: Page, withKey: boolean): Promise<void> {
  await page.addInitScript(
    ([logs, slot, key]) => {
      window.localStorage.setItem('workout-tracker:logs', JSON.stringify(logs));
      if (key) window.localStorage.setItem(slot as string, key as string);
    },
    [SEED_LOGS, GEMINI_KEY_SLOT, withKey ? FAKE_KEY : ''] as const
  );
  await page.reload();
}

const queue = (page: Page): Promise<{ id: string; kind: string; text: string | null }[]> =>
  page.evaluate(
    () => JSON.parse(window.localStorage.getItem('workout-tracker:notes-queue') ?? '[]') as never
  );

const storedRecordings = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('workout-tracker-notes', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('audio');
        req.onsuccess = () => {
          const count = req.result.transaction('audio').objectStore('audio').count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => resolve(-1);
        };
        req.onerror = () => resolve(-1);
      })
  );

async function openSheet(page: Page): Promise<void> {
  await page.locator('#note-pin').click();
  await expect(page.locator('#note-sheet')).toBeVisible();
}

async function record(page: Page, ms = 900): Promise<void> {
  await page.locator('#rec-start').click();
  await expect(page.locator('#rec-time')).toBeVisible();
  await page.waitForTimeout(ms);
  await page.locator('#rec-stop').click();
  await expect(page.locator('#rec-play')).toBeVisible();
}

async function writeNote(page: Page, text: string): Promise<void> {
  await page.locator('#write-start').click();
  await page.locator('#note-text').fill(text);
}

test.describe('v63 item 1: the 🎤 Note button', () => {
  const FORWARD = '#next, #start-round-2, #ww-skip';
  /** Forward through Workout A (Done · Next, Start round 2, Skip cardio) until `stop` is on screen. */
  const walkTo = async (p: Page, stop: string): Promise<void> => {
    for (
      let i = 0;
      i < 60 &&
      !(await p
        .locator(stop)
        .first()
        .isVisible()
        .catch(() => false));
      i++
    ) {
      await p.locator(FORWARD).click();
    }
    await expect(p.locator(stop).first()).toBeVisible();
  };
  const startA = async (p: Page): Promise<void> => {
    await p.locator('button[data-workout="A"]').click();
    await p.locator('button:has-text("Start")').click();
  };

  /** Every screen she can be on, and how to get there from a fresh load of Home. */
  const SCREENS: { name: string; go: (page: Page) => Promise<void> }[] = [
    { name: 'Home', go: async () => undefined },
    { name: 'Sessions', go: (p) => p.locator('#view-history').click() },
    {
      name: 'Session detail',
      go: async (p) => {
        await p.locator('#view-history').click();
        await p.locator('.history-row').first().click();
        await expect(p.locator('#edit-history-session')).toBeVisible();
      },
    },
    { name: 'Settings', go: (p) => p.locator('#open-settings').click() },
    { name: 'Weekly review', go: (p) => p.locator('#open-weekly-review').click() },
    { name: 'Progress', go: (p) => p.locator('#open-progress-link').click() },
    {
      name: 'Rides',
      go: async (p) => {
        await p.locator('#open-progress-link').click();
        await p.locator('#open-rides').click();
      },
    },
    {
      name: 'Cycle',
      go: async (p) => {
        await p.locator('#open-progress-link').click();
        await p.locator('#open-cycle').click();
      },
    },
    { name: 'Pre-log', go: (p) => p.locator('button[data-workout="B"]').click() },
    { name: 'Workout: the cardio choice', go: startA },
    {
      name: 'Workout: a move',
      go: async (p) => {
        await startA(p);
        await p.locator('#ww-skip').click();
      },
    },
    {
      name: 'Workout: rest',
      go: async (p) => {
        await p.addInitScript(() =>
          window.localStorage.setItem('workout-tracker:setting-rest-sec', '30')
        );
        await p.reload();
        await startA(p);
        await walkTo(p, '#skip-rest');
      },
    },
    {
      name: 'Workout: between rounds',
      go: async (p) => {
        await startA(p);
        await walkTo(p, '.round-break-card');
      },
    },
    {
      name: 'Workout: Paused',
      go: async (p) => {
        await startA(p);
        await p.locator('#pause-toggle').click();
        await expect(p.locator('#paused-overlay')).toBeVisible();
      },
    },
    {
      name: 'Workout: the step list',
      go: async (p) => {
        await startA(p);
        await p.locator('#step-list-open').click();
        await expect(p.locator('#step-list-panel')).toBeVisible();
      },
    },
    {
      name: 'Cool-down',
      go: async (p) => {
        await startA(p);
        await walkTo(p, '.stretch-card');
      },
    },
    {
      name: 'Post-log',
      go: async (p) => {
        await startA(p);
        await walkTo(p, 'text=Quick log');
      },
    },
  ];

  for (const screen of SCREENS) {
    test(`pinned top right, covering nothing: ${screen.name}`, async ({ page }) => {
      await seed(page, false);
      await screen.go(page);
      const pin = page.locator('#note-pin');
      await expect(pin).toBeVisible();
      const box = (await pin.boundingBox())!;
      const vw = page.viewportSize()!.width;
      expect(box.y).toBeLessThan(8);
      expect(vw - (box.x + box.width)).toBeLessThan(16);
      expect(box.height).toBeLessThan(32);
      // at the top, and again after scrolling to the bottom: it stays put and covers no button
      for (const at of ['top', 'bottom']) {
        await page.evaluate((where) => window.scrollTo(0, where === 'top' ? 0 : 1e6), at);
        const now = (await pin.boundingBox())!;
        expect(now.y).toBeCloseTo(box.y, 0);
        const clash = await page.evaluate(() => {
          const p = document.getElementById('note-pin')!.getBoundingClientRect();
          const hits: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>(
            'button, a, input, textarea, select'
          )) {
            if (el.id === 'note-pin') continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            const overlap =
              r.right > p.left && r.left < p.right && r.bottom > p.top && r.top < p.bottom;
            if (overlap) hits.push(el.id || el.className || el.tagName);
          }
          return hits;
        });
        expect(clash, `covers ${clash.join(', ')} (${at})`).toEqual([]);
      }
    });
  }
});

test.describe('v63 item 1: writing a note', () => {
  test("write -> Send puts one row in the inbox, shaped exactly like voice-capture's", async ({
    page,
  }) => {
    await seed(page, false);
    await openSheet(page);
    await writeNote(page, 'the wall sit felt long today');
    await page.locator('#note-send').click();
    await expect(page.locator('#note-done')).toHaveText('Sent ✓');

    expect(net.captures).toHaveLength(1);
    const c = net.captures[0]!;
    expect(c.url).toBe(CAPTURES);
    // voice-capture's saveCapture: apikey + Bearer anon key, JSON, return=minimal
    expect(c.headers['apikey']).toMatch(/^eyJ/);
    expect(c.headers['authorization']).toBe(`Bearer ${c.headers['apikey']}`);
    expect(c.headers['content-type']).toContain('application/json');
    expect(c.headers['prefer']).toBe('return=minimal');
    // its body, exactly voice-capture's typed note (addCapture(text, 0, 'text')): duration_seconds 0, no category
    expect(Object.keys(c.body)).toEqual(['transcript', 'source', 'id', 'duration_seconds']);
    expect(c.body['duration_seconds']).toBe(0);
    expect(c.body['source']).toBe('text');
    expect(c.body['transcript']).toBe('[Workout app · Home] the wall sit felt long today');
    expect(c.body['id']).toMatch(UUID_RE);
    expect(await queue(page)).toEqual([]); // sent: gone from the queue
    await expect(page.locator('#note-sheet')).toHaveCount(0); // and the sheet closes itself
  });

  test('the note starts with where she was, down to the round and the move', async ({ page }) => {
    await seed(page, false);
    await page.locator('button[data-workout="A"]').click();
    await page.locator('button:has-text("Start")').click();
    // walk to round 2 of the main block, on the wall sit (A has two rounds this week)
    let at = '';
    for (let i = 0; i < 60; i++) {
      const name =
        (await page
          .locator('.exercise-name')
          .textContent({ timeout: 500 })
          .catch(() => null)) ?? '';
      const round =
        (await page
          .locator('.round-indicator')
          .textContent({ timeout: 500 })
          .catch(() => null)) ?? '';
      at = `${round}|${name}`;
      if (round.includes('Round 2') && name === 'Wall sit') break;
      const rest = page.locator('#start-round-2');
      if (await rest.isVisible().catch(() => false)) await rest.click();
      else await page.locator(NEXT).click();
    }
    expect(at).toMatch(/^Main · Round 2 of \d\|Wall sit$/);
    await openSheet(page);
    await writeNote(page, 'x');
    await page.locator('#note-send').click();
    await expect(page.locator('#note-done')).toBeVisible();
    expect(net.captures[0]!.body['transcript']).toBe(
      '[Workout app · Workout A · Round 2 · Wall sit] x'
    );
  });

  test('close with a written note asks "Send this note?": Keep editing / Discard / Send', async ({
    page,
  }) => {
    await seed(page, false);
    await openSheet(page);
    await writeNote(page, 'keep me');
    await page.locator('#note-close').click();
    await expect(page.locator('#confirm-title')).toHaveText('Send this note?');
    // Keep editing: back to the draft, nothing lost
    await page.locator('#confirm-keep').click();
    await expect(page.locator('#note-text')).toHaveValue('keep me');
    // Discard: gone, nothing sent
    await page.locator('#note-close').click();
    await page.locator('#confirm-discard').click();
    await expect(page.locator('#note-sheet')).toHaveCount(0);
    expect(net.captures).toHaveLength(0);
    expect(await queue(page)).toEqual([]);
    // Send: goes
    await openSheet(page);
    await writeNote(page, 'send me');
    await page.locator('#note-close').click();
    await page.locator('#confirm-send').click();
    await expect(page.locator('#note-done')).toBeVisible();
    expect(net.captures).toHaveLength(1);
    expect(net.captures[0]!.body['transcript']).toBe('[Workout app · Home] send me');
  });

  test('close with nothing in it just closes; a tap outside never throws away a draft', async ({
    page,
  }) => {
    await seed(page, false);
    await openSheet(page);
    await page.locator('#note-close').click();
    await expect(page.locator('#note-sheet')).toHaveCount(0);
    await openSheet(page);
    await writeNote(page, 'draft');
    await page.locator('#note-sheet').click({ position: { x: 5, y: 5 } }); // the backdrop
    await expect(page.locator('#note-text')).toHaveValue('draft');
  });

  test('the text box is dir="auto" so Hebrew reads right', async ({ page }) => {
    await seed(page, false);
    await openSheet(page);
    await page.locator('#write-start').click();
    await expect(page.locator('#note-text')).toHaveAttribute('dir', 'auto');
  });
});

test.describe('v63 item 1: recording a note', () => {
  test('Record -> timer -> Stop -> Play / Record again / Send, then it is transcribed and sent as a voice row', async ({
    page,
  }) => {
    await seed(page, true);
    await openSheet(page);
    await page.locator('#rec-start').click();
    await expect(page.locator('#rec-time')).toBeVisible();
    await page.waitForTimeout(1300);
    await expect(page.locator('#rec-time')).not.toHaveText('0:00'); // the timer runs
    await page.locator('#rec-stop').click();
    await expect(page.locator('#rec-play')).toContainText('▶ Play');
    await expect(page.locator('#rec-again')).toHaveText('Record again');
    await expect(page.locator('#note-send')).toHaveText('Send');
    await page.locator('#rec-play').click(); // plays without a fuss
    await page.locator('#note-send').click();
    await expect(page.locator('#note-done')).toHaveText('Sent ✓');

    // Gemini: the same model, key in the query, the verbatim He/En prompt, the audio as wav
    expect(net.gemini).toHaveLength(1);
    const g = net.gemini[0]!;
    expect(g.url).toContain('/models/gemini-2.5-flash:generateContent?key=');
    expect(g.url).toContain(FAKE_KEY);
    const part = (g.body as { contents: { parts: Record<string, unknown>[] }[] }).contents[0]!
      .parts;
    expect(part[0]!['text']).toBe(
      'Transcribe this audio verbatim. The speaker mixes Hebrew and English in the same ' +
        'sentences — keep every word in the language it was actually spoken in, do not ' +
        'translate. Add natural punctuation and paragraph breaks. Output ONLY the transcript ' +
        'text, with no preamble, commentary, or quotation marks.'
    );
    const inline = part[1]!['inline_data'] as { mime_type: string; data: string };
    expect(inline.mime_type).toBe('audio/wav');
    expect(Buffer.from(inline.data, 'base64').subarray(0, 4).toString()).toBe('RIFF');

    // the inbox row: voice, with the length, after the transcript
    expect(net.captures).toHaveLength(1);
    const c = net.captures[0]!;
    expect(Object.keys(c.body)).toEqual(['transcript', 'source', 'id', 'duration_seconds']);
    expect(c.body['source']).toBe('voice');
    expect(c.body['transcript']).toBe('[Workout app · Home] hello from the mic');
    expect(c.body['id']).toMatch(UUID_RE);
    expect(typeof c.body['duration_seconds']).toBe('number');
    expect(c.body['duration_seconds']).toBeGreaterThanOrEqual(1);
    expect(await queue(page)).toEqual([]);
    expect(await storedRecordings(page)).toBe(0); // the audio is let go once it is in the inbox
  });

  test('Record again throws away the first clip and starts a new one', async ({ page }) => {
    await seed(page, true);
    await openSheet(page);
    await record(page);
    await page.locator('#rec-again').click();
    await expect(page.locator('#rec-time')).toBeVisible();
    await page.waitForTimeout(700);
    await page.locator('#rec-stop').click();
    await expect(page.locator('#rec-play')).toBeVisible();
    expect(net.captures).toHaveLength(0);
  });

  test('closing a finished recording asks "Send this note?", and Discard drops it for real', async ({
    page,
  }) => {
    await seed(page, true);
    await openSheet(page);
    await record(page);
    await page.locator('#note-close').click();
    await expect(page.locator('#confirm-title')).toHaveText('Send this note?');
    await page.locator('#confirm-keep').click();
    await expect(page.locator('#rec-play')).toBeVisible(); // the recording is still there
    await page.locator('#note-close').click();
    await page.locator('#confirm-discard').click();
    await expect(page.locator('#note-sheet')).toHaveCount(0);
    expect(net.captures).toHaveLength(0);
    expect(net.gemini).toHaveLength(0);
    expect(await queue(page)).toEqual([]);
    expect(await storedRecordings(page)).toBe(0);
  });

  test('closing while still recording stops the microphone and asks about what was recorded', async ({
    page,
  }) => {
    await seed(page, true);
    await openSheet(page);
    await page.locator('#rec-start').click();
    await expect(page.locator('#rec-time')).toBeVisible();
    await page.waitForTimeout(800);
    await page.locator('#note-close').click();
    await expect(page.locator('#confirm-title')).toBeVisible();
    await page.locator('#confirm-send').click();
    await expect(page.locator('#note-done')).toHaveText('Sent ✓');
    expect(net.captures[0]!.body['source']).toBe('voice');
  });

  test('a slip of the finger (under half a second) says so and offers Record / Write', async ({
    page,
  }) => {
    await seed(page, true);
    await openSheet(page);
    await page.locator('#rec-start').click();
    await expect(page.locator('#rec-time')).toBeVisible();
    await page.locator('#rec-stop').click();
    await expect(page.locator('#note-short')).toBeVisible();
    await expect(page.locator('#rec-start')).toBeVisible();
    await expect(page.locator('#write-start')).toBeVisible();
  });
});

test.describe('v63 item 1: a recording is never dropped', () => {
  test('no Gemini key on this device: the recording is kept, with Try again / Write instead', async ({
    page,
  }) => {
    await seed(page, false);
    await openSheet(page);
    await record(page);
    await page.locator('#note-send').click();
    await expect(page.locator('#note-failed')).toHaveText(
      "Couldn't turn this into text: try again, or write it instead."
    );
    await expect(page.locator('#try-again')).toHaveText('Try again');
    await expect(page.locator('#write-instead')).toHaveText('✎ Write instead');
    expect(net.gemini).toHaveLength(0); // no key: nothing was sent to Google
    expect(net.captures).toHaveLength(0);
    expect(await storedRecordings(page)).toBe(1); // the audio is in IndexedDB
    expect((await queue(page))[0]).toMatchObject({ kind: 'voice', text: null });

    // she adds the key (voice-capture's slot), Try again: it goes
    await page.evaluate(
      ([slot, key]) => window.localStorage.setItem(slot as string, key as string),
      [GEMINI_KEY_SLOT, FAKE_KEY]
    );
    await page.locator('#try-again').click();
    await expect(page.locator('#note-done')).toHaveText('Sent ✓');
    expect(net.captures).toHaveLength(1);
    expect(net.captures[0]!.body['transcript']).toBe('[Workout app · Home] hello from the mic');
    expect(await storedRecordings(page)).toBe(0);
    expect(await queue(page)).toEqual([]);
  });

  test('Gemini says no: same screen, the recording stays; Write instead keeps it and can delete it on purpose', async ({
    page,
  }) => {
    net.gemini_mode = 'bad';
    await seed(page, true);
    await openSheet(page);
    await record(page);
    await page.locator('#note-send').click();
    await expect(page.locator('#note-failed')).toBeVisible();
    expect(await storedRecordings(page)).toBe(1);
    await page.locator('#write-instead').click();
    await expect(page.locator('#note-text')).toBeVisible();
    await expect(page.locator('#drop-audio')).toBeVisible(); // the recording is named, and deleting it is her own tap
    await page.locator('#drop-audio').click();
    expect(await storedRecordings(page)).toBe(0);
    expect(await queue(page)).toEqual([]);
  });

  test('a kept recording is transcribed and sent on the next open once there is a key', async ({
    page,
    context,
  }) => {
    await seed(page, false);
    await openSheet(page);
    await record(page);
    await page.locator('#note-send').click();
    await expect(page.locator('#note-failed')).toBeVisible();
    await page.evaluate(
      ([slot, key]) => window.localStorage.setItem(slot as string, key as string),
      [GEMINI_KEY_SLOT, FAKE_KEY]
    );
    // the next open: a new page on the same phone (same storage), not a reload of this one
    const next = await context.newPage();
    await next.goto('/');
    await expect.poll(() => net.captures.length).toBe(1);
    expect(net.captures[0]!.body).toMatchObject({
      source: 'voice',
      transcript: '[Workout app · Home] hello from the mic',
    });
    await expect.poll(() => storedRecordings(next)).toBe(0);
  });
});

test.describe('v63 item 1: offline, then online', () => {
  test('a written note while the inbox is unreachable is queued, named on Home, and goes on `online`', async ({
    page,
  }) => {
    await seed(page, false);
    net.inbox = 'down';
    await openSheet(page);
    await writeNote(page, 'sent from the basement');
    await page.locator('#note-send').click();
    await expect(page.locator('#note-done')).toHaveText("Saved. It will send when you're online.");
    expect(await queue(page)).toHaveLength(1);
    await expect(page.locator('#sync-indicator')).toHaveText('1 note not sent yet');

    net.inbox = 'ok';
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect
      .poll(() => net.captures.at(-1)?.body['transcript'])
      .toBe('[Workout app · Home] sent from the basement');
    await expect.poll(async () => (await queue(page)).length).toBe(0);
    await expect(page.locator('#sync-indicator')).toHaveText('');
  });

  test('the same note retried after a lost answer (409 / 23505) counts as sent, not twice', async ({
    page,
  }) => {
    await seed(page, false);
    net.inbox = 'dup';
    await openSheet(page);
    await writeNote(page, 'once');
    await page.locator('#note-send').click();
    await expect(page.locator('#note-done')).toHaveText('Sent ✓');
    expect(await queue(page)).toEqual([]);
  });

  test('the inbox saying no (a 500, or a 409 that is not our own row) leaves the note queued', async ({
    page,
    context,
  }) => {
    await seed(page, false);
    net.inbox = 'error';
    await openSheet(page);
    await writeNote(page, 'try later');
    await page.locator('#note-send').click();
    await expect(page.locator('#note-done')).toHaveText("Saved. It will send when you're online.");
    expect(await queue(page)).toHaveLength(1);
    net.inbox = 'refuse';
    const next = await context.newPage(); // the next open
    await next.goto('/');
    await expect.poll(() => net.captures.length).toBeGreaterThan(1);
    expect(await queue(next)).toHaveLength(1);
  });

  test('a recording made offline waits (audio kept), then is transcribed and sent when the network is back', async ({
    page,
  }) => {
    await seed(page, true);
    net.gemini_mode = 'down';
    await openSheet(page);
    await record(page);
    await page.locator('#note-send').click();
    await expect(page.locator('#note-done')).toHaveText("Saved. It will send when you're online.");
    expect(await storedRecordings(page)).toBe(1);
    await expect(page.locator('#sync-indicator')).toHaveText('1 note not sent yet');
    net.gemini_mode = 'ok';
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => net.captures.length).toBe(1);
    expect(net.captures[0]!.body).toMatchObject({
      source: 'voice',
      transcript: '[Workout app · Home] hello from the mic',
    });
    await expect.poll(() => storedRecordings(page)).toBe(0);
  });
});
