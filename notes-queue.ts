// notes-queue.ts - the queue of "Note to Claude" notes not yet in her inbox (v63 item 1, Oct 19 2026).
//
// WHAT: the small record of every note waiting to be sent, in localStorage (text notes carry their
// text; a voice note carries only its id and length: its audio is in IndexedDB, owned by
// screens/notesheet.ts). Read and written by notes.ts (send / flush), by the sheet, and by sync.ts
// (the Home sync line counts unsent notes), which is why it is its own tiny module: sync.ts cannot
// import notes.ts (notes.ts imports sync.ts for the URL and headers).
// RULES: shared layer. Imports state.ts (the key) only. Every read and write is try/catch'd.

import { NOTES_QUEUE_KEY } from './state.js';

export type NoteKind = 'text' | 'voice';

export type QueuedNote = {
  /** The voice_captures row id (a UUID) and the key of the recording in IndexedDB. */
  id: string;
  createdAt: string;
  kind: NoteKind;
  /** Where she was when she opened the sheet, e.g. "Workout A · Round 2 · Wall sit". */
  where: string;
  /** The final transcript (already starting with the "[Workout app · ...]" line). A voice note has none until it is transcribed. */
  text: string | null;
  /** A voice note's length in whole seconds. */
  durationSec: number | null;
};

function isQueuedNote(v: unknown): v is QueuedNote {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    typeof o['createdAt'] === 'string' &&
    (o['kind'] === 'text' || o['kind'] === 'voice') &&
    typeof o['where'] === 'string' &&
    (o['text'] === null || typeof o['text'] === 'string') &&
    (o['durationSec'] === null || typeof o['durationSec'] === 'number')
  );
}

export function loadNotesQueue(): QueuedNote[] {
  try {
    const raw = localStorage.getItem(NOTES_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isQueuedNote) : [];
  } catch {
    return [];
  }
}

function writeNotesQueue(list: QueuedNote[]): boolean {
  try {
    localStorage.setItem(NOTES_QUEUE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** True when the note is safely in the queue. */
export function enqueueNote(note: QueuedNote): boolean {
  const list = loadNotesQueue().filter((n) => n.id !== note.id);
  list.push(note);
  return writeNotesQueue(list);
}

/** Fresh read, targeted write (a note added while a send was in flight is never wiped). */
export function updateQueuedNote(id: string, patch: Partial<QueuedNote>): void {
  const list = loadNotesQueue();
  const i = list.findIndex((n) => n.id === id);
  const cur = list[i];
  if (i === -1 || !cur) return;
  list[i] = { ...cur, ...patch };
  writeNotesQueue(list);
}

export function removeQueuedNote(id: string): void {
  writeNotesQueue(loadNotesQueue().filter((n) => n.id !== id));
}

/** How many notes are not yet in the inbox (the Home sync line reads this). */
export function unsentNotesCount(): number {
  return loadNotesQueue().length;
}

export function newNoteId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the timestamp id below
  }
  return `vc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
