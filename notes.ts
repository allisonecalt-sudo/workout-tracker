// notes.ts - "Note to Claude" (v63 item 1, Oct 19 2026): the queue, the inbox row, the Gemini
// transcription call and the flush. No DOM.
//
// WHAT: a note she records or writes from any screen goes to her Brain dump inbox, the Supabase table
// `voice_captures`, the same inbox her voice-capture app writes to and Claude sweeps every session.
// This file builds the row EXACTLY the way voice-capture's history.ts + supabase.ts do (same columns,
// same key order, same headers, the same 409 rule), turns a recording into text the way
// voice-capture's gemini.ts does (gemini-2.5-flash, then gemini-flash-latest, the same verbatim He/En
// prompt), keeps the queue of notes not yet sent, and flushes it.
// WHY: a note must never be lost. Everything goes into the queue first (a small record in localStorage;
// a recording's audio in IndexedDB, handed in through the BlobStore below), then out to the inbox. Offline,
// a failed send or a failed transcription just leaves the note in the queue for the next open / `online`.
// DECIDED (spec v63-from-maayan-2026-10-19.md item 1):
//   - the row: { transcript, source, id, duration_seconds } in that key order (a typed note sends 0, like voice-capture); `source` = 'text' or
//     'voice'; `category` is never sent (the column default is null, same as voice-capture's own notes);
//     the row id is the note's own UUID, so a retry whose first answer was lost 409s (23505) and counts as sent;
//   - the transcript starts with where she was: "[Workout app · Workout A · Round 2 · Wall sit] " + her words;
//   - the Gemini key is read (never written, never logged) from voice-capture's localStorage slot;
//   - a recording is capped at 3 minutes, so it is one inline request (no chunking needed).
// RULES: shared layer. Imports state / sync (URL + headers) / workout-now (where she is) only; never app.ts
// or a screen; no DOM writes. The audio store arrives as a parameter (screens/notesheet.ts owns IndexedDB).

import { state, GEMINI_KEY_STORAGE } from './state.js';
import {
  loadNotesQueue,
  removeQueuedNote,
  updateQueuedNote,
  type QueuedNote,
} from './notes-queue.js';
import { SUPABASE_URL, supabaseHeaders } from './sync.js';
import {
  getCurrentExercise,
  getCurrentWorkout,
  displayName,
  effectiveRounds,
} from './workout-now.js';

// the screen and the tests take the queue through here
export {
  enqueueNote,
  loadNotesQueue,
  removeQueuedNote,
  unsentNotesCount,
  newNoteId,
} from './notes-queue.js';
export type { NoteKind, QueuedNote } from './notes-queue.js';

// ---------- where she is ----------

const SCREEN_NAMES: Partial<Record<typeof state.screen, string>> = {
  home: 'Home',
  history: 'Sessions',
  'history-detail': 'Session',
  'history-edit': 'Edit session',
  'weekly-review': 'Weekly review',
  progress: 'Progress',
  settings: 'Settings',
  cycle: 'Cycle',
  rides: 'Rides',
};

/** "Workout A · Round 2 · Wall sit": where she is, in words, for the head of the note. */
export function noteWhere(): string {
  const id = state.selectedWorkout;
  const name = id ? `Workout ${id}` : 'Workout';
  if (state.screen === 'pre-log') return `Before ${name}`;
  if (state.screen === 'post-log') return `After ${name}`;
  if (state.screen !== 'workout') return SCREEN_NAMES[state.screen] ?? 'Home';
  const parts = [name];
  const w = getCurrentWorkout();
  if (state.pausedAt !== null) parts.push('Paused');
  if (state.roundBreak) parts.push('Round 1 done');
  else if (state.currentPhase === 'cooldown') parts.push('Cool-down');
  else {
    if (state.currentPhase === 'main' && w && effectiveRounds(w) > 1) {
      parts.push(`Round ${state.currentRound}`);
    } else if (state.currentPhase === 'warmup') parts.push('Warm-up');
    else if (state.currentPhase === 'upperBack') parts.push('Upper back');
    const ex = getCurrentExercise();
    if (ex) parts.push(displayName(ex));
    if (state.isResting) parts.push('Rest');
  }
  return parts.join(' · ');
}

/** The head every note carries. */
export function noteHead(where: string): string {
  return `[Workout app · ${where}] `;
}

// ---------- the inbox row (voice-capture's history.ts + supabase.ts, mirrored) ----------

// v34 in voice-capture: only UUID-shaped ids ride along as the row id (a timestamp-fallback id would
// fail the uuid cast and 400 the whole insert).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CAPTURES_URL = `${SUPABASE_URL}/rest/v1/voice_captures`;

export type CaptureBody = {
  transcript: string;
  source: 'text' | 'voice';
  id?: string;
  duration_seconds?: number;
};

/** The exact INSERT body voice-capture's saveCapture builds: { transcript, source }, then id, then duration_seconds (0 for a typed note, the length in seconds for a recording). */
export function captureBody(note: QueuedNote, transcript: string): CaptureBody {
  return {
    transcript,
    source: note.kind,
    ...(UUID_RE.test(note.id) ? { id: note.id } : {}),
    // voice-capture's typed note sends 0 (app.ts: addCapture(text, 0, 'text')), a recording its length
    ...(note.kind === 'text'
      ? { duration_seconds: 0 }
      : typeof note.durationSec === 'number'
        ? { duration_seconds: Math.round(note.durationSec) }
        : {}),
  };
}

/**
 * POST one note into the inbox. Insert-only (anon cannot read back), so `return=minimal`.
 * true = it is in the inbox (a 409 / 23505 on OUR row id means a first try already landed it);
 * false = it is not (offline, a refusal): the note stays queued for the next try.
 */
export async function postCapture(note: QueuedNote, transcript: string): Promise<boolean> {
  const body = captureBody(note, transcript);
  try {
    const res = await fetch(CAPTURES_URL, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify(body),
    });
    if (res.status === 409 && body.id !== undefined) {
      const j = (await res.json().catch(() => ({}))) as { code?: string };
      return j.code === '23505';
    }
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- the Gemini transcription (voice-capture's gemini.ts, mirrored) ----------

/** No Gemini key in voice-capture's slot on this device. */
export class NoKeyError extends Error {}
/** The phone could not reach Gemini (offline, a dropped connection). The recording is kept. */
export class OfflineError extends Error {}
/** Gemini answered, but not with a transcript (busy, refused, empty). The recording is kept. */
export class TranscribeError extends Error {}

export function geminiKey(): string {
  try {
    return localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() ?? '';
  } catch {
    return '';
  }
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_MODELS = [GEMINI_MODEL, 'gemini-flash-latest'] as const;
const endpointFor = (model: string): string =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const RETRYABLE = new Set([429, 500, 503]);
const MAX_ATTEMPTS = 4;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const TRANSCRIBE_PROMPT =
  'Transcribe this audio verbatim. The speaker mixes Hebrew and English in the same ' +
  'sentences — keep every word in the language it was actually spoken in, do not ' +
  'translate. Add natural punctuation and paragraph breaks. Output ONLY the transcript ' +
  'text, with no preamble, commentary, or quotation marks.';

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

function parseTranscript(data: GeminiResponse): string {
  if (data.error?.message) throw new TranscribeError('Gemini error');
  if (data.promptFeedback?.blockReason) throw new TranscribeError('Gemini blocked the request');
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new TranscribeError('Gemini returned no transcript text');
  }
  return text.trim();
}

/** Send a base64 WAV to Gemini and return the transcript; the key travels to Google only. */
export async function transcribeAudio(base64: string, mimeType: string): Promise<string> {
  const apiKey = geminiKey();
  if (apiKey === '') throw new NoKeyError('no Gemini key on this device');
  const body = {
    contents: [
      {
        parts: [
          { text: TRANSCRIBE_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
  };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = GEMINI_MODELS[attempt % GEMINI_MODELS.length] ?? GEMINI_MODEL;
    const url = `${endpointFor(model)}?key=${encodeURIComponent(apiKey)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(600 * 2 ** attempt);
        continue;
      }
      throw new OfflineError('network problem reaching Gemini');
    }
    let data: GeminiResponse;
    try {
      data = (await res.json()) as GeminiResponse;
    } catch {
      throw new TranscribeError(`Gemini returned a non-JSON response (HTTP ${res.status})`);
    }
    if (res.ok) return parseTranscript(data);
    if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
      await sleep(600 * 2 ** attempt);
      continue;
    }
    throw new TranscribeError(`Gemini request failed (HTTP ${res.status})`);
  }
  throw new TranscribeError('Transcription failed after several tries');
}

/** A Blob as base64 (no data: prefix), the form Gemini's inline_data wants. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string')
        return reject(new Error('FileReader did not return a string'));
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

// ---------- sending ----------

/** Where a voice note's audio is kept (IndexedDB, in screens/notesheet.ts). */
export type BlobStore = {
  /** the audio; 'missing' = the store answered and it is not there; 'unavailable' = the store itself failed (IndexedDB would not open) */
  get: (id: string) => Promise<Blob | 'missing' | 'unavailable'>;
  delete: (id: string) => Promise<void>;
};

export type SendOutcome =
  /** In the inbox; gone from the queue. */
  | 'sent'
  /** Still in the queue: offline, or the inbox said no. Will try again. */
  | 'queued'
  /** A voice note that could not become text (no key / Gemini said no). The recording is kept. */
  | 'no-text'
  /** A voice note whose audio is confirmed gone (cleared site data): removed from the queue. */
  | 'lost';

/**
 * Take one queued note as far as it will go: transcribe it if it is a recording with no text yet,
 * then POST it. Never throws; never drops a recording.
 */
export async function sendQueuedNote(note: QueuedNote, store: BlobStore): Promise<SendOutcome> {
  let text = note.text;
  if (text === null) {
    // a recording: needs its audio and a transcript first
    const blob = await store.get(note.id);
    // a store that failed to OPEN says nothing about the audio: keep the note, try again next time
    if (blob === 'unavailable') return 'queued';
    if (blob === 'missing') {
      // the store answered and the audio is not in it (cleared site data): nothing can be done for this
      // one, and keeping it would block the sync line for ever
      removeQueuedNote(note.id);
      return 'lost';
    }
    try {
      const spoken = await transcribeAudio(await blobToBase64(blob), 'audio/wav');
      text = noteHead(note.where) + spoken;
      updateQueuedNote(note.id, { text });
    } catch (e) {
      return e instanceof OfflineError ? 'queued' : 'no-text';
    }
  }
  if (!(await postCapture(note, text))) return 'queued';
  removeQueuedNote(note.id);
  await store.delete(note.id);
  return 'sent';
}

let flushing: Promise<number> | null = null;

/** Send everything waiting (single-flight). Returns how many reached the inbox. */
export function flushNotes(store: BlobStore, onLost?: () => void): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const note of loadNotesQueue()) {
      const outcome = await sendQueuedNote(note, store);
      if (outcome === 'sent') sent++;
      else if (outcome === 'lost') onLost?.();
    }
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
