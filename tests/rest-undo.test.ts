// tests/rest-undo.test.ts - v74.2: Undo on a rest day reaches the server (pure Node, fetch mocked).
//
// WHAT: Undo re-saves the SAME server row (PATCH by id, notes = 'rest day undone') through the app's
// session sync path; no new row, no delete, no schema change. An unsynced rest day is never pushed. A
// pulled marked row stays hidden (also on another device). A failed PATCH stays pending and retries.
// WHY: before this, Undo was a local tombstone: a rest row that had already synced stayed a real sick
// day for every other reader (second-brain scripts/workout-pull.py reads rest_days from it).

import { test, expect } from '@playwright/test';
import {
  mergeRestDays,
  pullFromSupabase,
  pushRestDay,
  restUndoneRequest,
  restUndosPending,
  SUPABASE_URL,
  type RemoteSession,
} from '../sync';
import { loadRestDays, loadRestDaysRaw, writeRestDays } from '../state';
import { undoRestDay, flushPendingSyncs, setActionHooks } from '../actions';
import { setRenderer } from '../bus';
import { comingBackActive, REST_UNDONE_MARKER } from '../day-mode';
import { localIsoDate } from '../dates';
import type { RestDay } from '../types';

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
const reply = (status: number, body: unknown): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), { status });

test.beforeEach(() => {
  store.clear();
  calls = [];
  replies = [];
  setRenderer(() => undefined);
  setActionHooks({ updateSyncIndicator: () => undefined, resetState: () => undefined } as never);
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

const NOW = new Date('2026-11-16T09:00:00+02:00');
const TODAY = localIsoDate(NOW);
const rest = (over: Partial<RestDay> = {}): RestDay => ({
  id: 'r1',
  date: NOW.toISOString(),
  mode: 'fever',
  synced: true,
  ...over,
});
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

test.describe('v74.2 - Undo reaches the server', () => {
  test('the request: PATCH by id, only notes, exactly "rest day undone"', () => {
    expect(REST_UNDONE_MARKER).toBe('rest day undone');
    expect(restUndoneRequest('r1')).toEqual({
      url: `${SUPABASE_URL}/rest/v1/workout_sessions?id=eq.r1`,
      body: { notes: 'rest day undone' },
    });
  });

  test('a SYNCED rest day: Undo PATCHes the same row with the marker (no POST, no DELETE)', async () => {
    writeRestDays([rest()]);
    replies.push(reply(200, [{ id: 'r1' }]));
    undoRestDay(TODAY);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe(`${SUPABASE_URL}/rest/v1/workout_sessions?id=eq.r1`);
    expect(calls[0]!.body).toEqual({ notes: 'rest day undone' });
    expect(calls[0]!.headers['Prefer']).toBe('return=representation');
    const raw = loadRestDaysRaw();
    expect(raw[0]).toMatchObject({ undone: true, undoneSynced: true });
    expect(loadRestDays()).toHaveLength(0);
    expect(comingBackActive([], loadRestDays())).toBe(false);
  });

  test('an UNSYNCED rest day: Undo sends nothing, and a later push is a no-op', async () => {
    writeRestDays([rest({ synced: false })]);
    undoRestDay(TODAY);
    await flush();
    expect(calls).toHaveLength(0);
    expect(await pushRestDay(rest({ synced: false }))).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test('a failed PATCH stays pending and the next flush retries it', async () => {
    writeRestDays([rest()]);
    replies.push(reply(500, 'boom'));
    undoRestDay(TODAY);
    await flush();
    expect(restUndosPending(loadRestDaysRaw())).toHaveLength(1);
    replies.push(reply(200, [{ id: 'r1' }]));
    // flushPendingSyncs does nothing under automation only; plain Node is not automation
    await flushPendingSyncs();
    expect(calls.map((c) => c.method)).toEqual(['PATCH', 'PATCH']);
    expect(restUndosPending(loadRestDaysRaw())).toHaveLength(0);
  });

  test('a PATCH that matches no server row never reads as saved', async () => {
    writeRestDays([rest()]);
    replies.push(reply(200, []));
    undoRestDay(TODAY);
    await flush();
    expect(restUndosPending(loadRestDaysRaw())).toHaveLength(1);
  });

  test('Undo tapped while the first push is in flight: the row lands, then gets the marker', async () => {
    const day = rest({ synced: false });
    writeRestDays([day]);
    replies.push(reply(201, null)); // the POST
    replies.push(reply(200, [{ id: 'r1' }])); // the PATCH
    const push = pushRestDay(day);
    writeRestDays([{ ...day, undone: true }]); // she taps Undo while it is in flight
    expect(await push).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['POST', 'PATCH']);
    expect(loadRestDaysRaw()[0]).toMatchObject({ synced: true, undone: true, undoneSynced: true });
  });
});

test.describe('v74.2 - a marked row stays undone when pulled', () => {
  const remote = (notes: string | null): RemoteSession =>
    ({
      id: 'r1',
      date: NOW.toISOString(),
      workout_type: 'R',
      day_mode: 'fever',
      notes,
    }) as unknown as RemoteSession;

  test('another device / a reinstall: the marked row comes back hidden, an unmarked one visible', () => {
    const hidden = mergeRestDays([], [remote(REST_UNDONE_MARKER)]);
    expect(hidden[0]).toMatchObject({ undone: true, undoneSynced: true });
    expect(hidden.filter((d) => d.undone !== true)).toHaveLength(0);
    const shown = mergeRestDays([], [remote(null)]);
    expect(shown.filter((d) => d.undone !== true)).toHaveLength(1);
  });

  test('a full pull keeps a marked rest row out of loadRestDays', async () => {
    replies.push(reply(200, [remote(REST_UNDONE_MARKER)]));
    await pullFromSupabase();
    expect(loadRestDaysRaw()).toHaveLength(1);
    expect(loadRestDays()).toHaveLength(0);
  });

  test('local undone + server not marked yet: stays undone and still pending', () => {
    const merged = mergeRestDays([rest({ undone: true })], [remote(null)]);
    expect(merged[0]).toMatchObject({ undone: true });
    expect(restUndosPending(merged)).toHaveLength(1);
  });
});
