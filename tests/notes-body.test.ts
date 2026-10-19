// tests/notes-body.test.ts - v63 fix round: the inbox row of a note is exactly the row voice-capture's own
// notes make (supabase.ts saveCapture: { transcript, source }, then id, then duration_seconds;
// app.ts: a typed note is addCapture(text, 0, 'text'), a recording carries its length rounded).
import { test, expect } from '@playwright/test';
import { captureBody } from '../notes';
import type { QueuedNote } from '../notes-queue';

const ID = '3f2b8c1e-5d4a-4e7b-9a10-2c6d8e9f0a1b';
const base: QueuedNote = {
  id: ID,
  createdAt: '2026-10-19T10:00:00Z',
  kind: 'text',
  where: 'Home',
  text: null,
  durationSec: null,
};

test.describe('captureBody matches voice-capture exactly', () => {
  test('a typed note: duration_seconds 0, key order transcript, source, id, duration_seconds', () => {
    const body = captureBody({ ...base, kind: 'text' }, '[Workout app · Home] hi');
    expect(JSON.stringify(body)).toBe(
      JSON.stringify({
        transcript: '[Workout app · Home] hi',
        source: 'text',
        id: ID,
        duration_seconds: 0,
      })
    );
  });

  test('a recording: the length rounded to whole seconds, same key order', () => {
    const body = captureBody({ ...base, kind: 'voice', durationSec: 12.6 }, 'spoken');
    expect(JSON.stringify(body)).toBe(
      JSON.stringify({ transcript: 'spoken', source: 'voice', id: ID, duration_seconds: 13 })
    );
  });

  test('a recording with no length sends none (voice-capture omits it too); never a category', () => {
    const body = captureBody({ ...base, kind: 'voice' }, 'spoken');
    expect(Object.keys(body)).toEqual(['transcript', 'source', 'id']);
    expect('category' in body).toBe(false);
  });
});
