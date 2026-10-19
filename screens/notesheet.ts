// screens/notesheet.ts - "Note to Claude" (v63 item 1, Oct 19 2026): the 🎤 Note button pinned in the
// top-right corner of EVERY screen, and the bottom sheet it opens.
//
// WHAT: one small button made once at boot and pinned outside #app (so no screen's re-render ever
// touches it and no golden sees it), and the sheet:
//   🎤 Record -> timer -> ■ Stop -> ▶ Play / Record again / Send        ✎ Write -> textarea -> Send
//   Close with something in it asks "Send this note?" (Send / Discard / Keep editing).
// A note goes to her Brain dump inbox (voice_captures) through notes.ts; a recording becomes text
// with the Gemini key voice-capture keeps on this device. No key, or Gemini says no: the recording
// stays in IndexedDB ("Couldn't turn this into text") with Try again / Write instead.
// WHY: her words (Mon Oct 19 21:10-21:22): take the best of Maayan's app. Behaviour copied from
// alpal-workout's screens/notesheet.ts, written in this app's own structure and look.
// OWNS: the pinned button, the sheet and its states, the recording kept in IndexedDB (the audio of a
// note not yet sent; the small record of it is the localStorage queue in notes.ts), and flushNotesNow
// (app.ts calls it at boot and on `online`).
// RULES: a screen. Imports the shared layer only; never app.ts, never another screen.

import { state } from '../state.js';
import { requestRender } from '../bus.js';
import { escapeHtml } from '../format.js';
import { stopVoiceNote } from '../audio.js';
import {
  MAX_SECONDS,
  MicError,
  TooShortError,
  startRecorder,
  type ActiveRecorder,
  type Recording,
} from '../note-recorder.js';
import {
  enqueueNote,
  flushNotes,
  newNoteId,
  noteHead,
  noteWhere,
  removeQueuedNote,
  sendQueuedNote,
  type BlobStore,
  type QueuedNote,
} from '../notes.js';

// ---------- IndexedDB: the audio of a note not yet sent ----------

const DB_NAME = 'workout-tracker-notes';
const AUDIO_STORE = 'audio';
let opened: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  opened ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(AUDIO_STORE))
          req.result.createObjectStore(AUDIO_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opened;
}

async function idb<T>(
  mode: IDBTransactionMode,
  make: (s: IDBObjectStore) => IDBRequest<T>
): Promise<{ value: T } | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const store = db.transaction(AUDIO_STORE, mode).objectStore(AUDIO_STORE);
    const req = make(store);
    const value = await new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return { value };
  } catch {
    return null;
  }
}

const audioStore: BlobStore = {
  get: async (id) => {
    const r = await idb<unknown>('readonly', (s) => s.get(id));
    return r && r.value instanceof Blob ? r.value : null;
  },
  delete: async (id) => {
    await idb('readwrite', (s) => s.delete(id));
  },
};

/** True when the recording is safely stored. */
async function keepAudio(id: string, blob: Blob): Promise<boolean> {
  return (await idb('readwrite', (s) => s.put(blob, id))) !== null;
}

/** Send everything waiting (boot, `online`). The Home sync line follows. */
export function flushNotesNow(): void {
  void flushNotes(audioStore).then(() => {
    if (state.screen === 'home') requestRender();
  });
}

// ---------- copy ----------

const COPY = {
  pin: '🎤 Note',
  title: 'Note to Claude',
  line: 'It goes to your Brain dump inbox.',
  record: '🎤 Record',
  write: '✎ Write',
  stop: '■ Stop',
  play: '▶ Play',
  pause: '⏸ Pause',
  again: 'Record again',
  send: 'Send',
  close: 'Close',
  placeholder: 'What do you want Claude to know?',
  confirmTitle: 'Send this note?',
  discard: 'Discard',
  keep: 'Keep editing',
  denied: "The microphone isn't available. You can write it instead.",
  tooShort: 'That was too short. Try again, or write it instead.',
  limit: 'Three minutes is the longest. That is where it stopped.',
  failed: "Couldn't turn this into text: try again, or write it instead.",
  tryAgain: 'Try again',
  writeInstead: '✎ Write instead',
  dropAudio: 'Delete the recording',
  kept: 'The recording is kept. It will send when it can.',
  sent: 'Sent ✓',
  savedLocal: "Saved. It will send when you're online.",
  unsaved: "Couldn't keep this note. Try again.",
} as const;

const SHEET_ID = 'note-sheet';
const PIN_ID = 'note-pin';

type View =
  | 'idle'
  | 'recording'
  | 'review'
  | 'write'
  | 'denied'
  | 'short'
  | 'failed'
  | 'confirm'
  | 'sending'
  | 'done';

const fmt = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// ---------- the pinned button ----------

/** Make the 🎤 Note button once, outside #app. */
export function mountNoteButton(): void {
  if (document.getElementById(PIN_ID)) return;
  const btn = document.createElement('button');
  btn.id = PIN_ID;
  btn.type = 'button';
  btn.className = 'note-pin';
  btn.setAttribute('aria-label', COPY.title);
  btn.textContent = COPY.pin;
  btn.addEventListener('click', () => openNoteSheet());
  document.body.appendChild(btn);
}

// ---------- the sheet ----------

let recorder: ActiveRecorder | null = null;
let ticker: number | undefined;
let closer: number | undefined;
let recording: Recording | null = null;
let recordingUrl: string | null = null;
let player: HTMLAudioElement | null = null;
let hitLimit = false;
let draft = '';
/** The kept recording a failed transcription left in the queue (so Try again / Write instead can find it). */
let heldNote: QueuedNote | null = null;
/** Each open is its own epoch; a microphone request answered late checks it. */
let epoch = 0;
let startingIn = -1;

export function noteSheetOpen(): boolean {
  return document.getElementById(SHEET_ID) !== null;
}

function endTicker(): void {
  window.clearInterval(ticker);
  ticker = undefined;
}

function releaseRecording(): void {
  if (player) {
    player.pause();
    player = null;
  }
  if (recordingUrl !== null) URL.revokeObjectURL(recordingUrl);
  recordingUrl = null;
  recording = null;
}

/** Close the sheet; whatever was being recorded is dropped and the microphone let go. */
function closeNoteSheet(): void {
  epoch += 1;
  endTicker();
  window.clearTimeout(closer);
  closer = undefined;
  recorder?.cancel();
  recorder = null;
  releaseRecording();
  hitLimit = false;
  draft = '';
  heldNote = null;
  document.getElementById(SHEET_ID)?.remove();
}

export function openNoteSheet(): void {
  if (noteSheetOpen()) return;
  const where = noteWhere(); // where she was when she opened it
  const sheet = document.createElement('div');
  sheet.id = SHEET_ID;
  sheet.className = 'note-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', COPY.title);
  document.body.appendChild(sheet);
  let view: View = 'idle';
  /** The view the "Send this note?" question goes back to. */
  let before: View = 'idle';
  let doneText = '';
  let busy = false;

  const go = (next: View): void => {
    view = next;
    paint();
  };

  const setError = (text: string): void => {
    const el = sheet.querySelector('#note-error');
    if (el) el.textContent = text;
  };

  // a tap on the backdrop only closes the sheet when nothing would be lost
  sheet.addEventListener('click', (e) => {
    if (e.target !== sheet) return;
    if (view === 'recording') return requestClose();
    if (
      view === 'review' ||
      view === 'confirm' ||
      view === 'sending' ||
      (view === 'write' && draft.trim() !== '')
    )
      return;
    closeNoteSheet();
  });

  /** Close: a finished recording or a written note is never dropped without asking. */
  const requestClose = (): void => {
    if (view === 'recording') {
      // still recording: stop (the microphone is let go), then ask about what was recorded
      void stopRecording().then(() => {
        if (view === 'review') {
          before = 'review';
          go('confirm');
        } else closeNoteSheet(); // nothing worth keeping (too short, no microphone)
      });
      return;
    }
    if (view === 'sending') return;
    if (view === 'review' || (view === 'write' && draft.trim() !== '')) {
      before = view;
      if (player) player.pause();
      go('confirm');
      return;
    }
    closeNoteSheet();
  };

  const startRecording = async (): Promise<void> => {
    if (recorder || startingIn === epoch) return;
    const mine = epoch;
    startingIn = mine;
    stopVoiceNote(); // recording pauses an explanation that is playing
    sheet.querySelector<HTMLButtonElement>('#rec-start')?.setAttribute('disabled', '');
    let started: ActiveRecorder;
    try {
      started = await startRecorder();
    } catch (e) {
      if (startingIn === mine) startingIn = -1;
      if (mine !== epoch) return;
      if (e instanceof MicError) return go('denied');
      throw e;
    }
    if (startingIn === mine) startingIn = -1;
    if (mine !== epoch) {
      started.cancel(); // closed while the phone was asking: let the microphone go at once
      return;
    }
    recorder = started;
    hitLimit = false;
    releaseRecording();
    go('recording');
  };

  const stopRecording = async (limit = false): Promise<void> => {
    const r = recorder;
    if (!r) return;
    recorder = null;
    endTicker();
    try {
      recording = await r.stop();
    } catch (e) {
      return go(e instanceof TooShortError ? 'short' : 'denied');
    }
    recordingUrl = URL.createObjectURL(recording.blob);
    hitLimit = limit;
    go('review');
  };

  /** Where a sent / kept note ends: a short thank-you, then the sheet closes itself. */
  const finish = (text: string): void => {
    releaseRecording();
    draft = '';
    heldNote = null;
    doneText = text;
    go('done');
    closer = window.setTimeout(closeNoteSheet, 1600);
    if (state.screen === 'home') requestRender(); // the sync line
  };

  const send = async (): Promise<void> => {
    if (busy) return;
    const base = { id: newNoteId(), createdAt: new Date().toISOString(), where };
    if (view === 'review' && recording) {
      busy = true;
      const rec = recording;
      // the audio is stored FIRST: a recording is never lost, whatever happens next
      const note: QueuedNote = { ...base, kind: 'voice', text: null, durationSec: rec.durationSec };
      if (!(await keepAudio(note.id, rec.blob)) || !enqueueNote(note)) {
        busy = false;
        return setError(COPY.unsaved);
      }
      go('sending');
      const outcome = await sendQueuedNote(note, audioStore);
      busy = false;
      if (outcome === 'sent') return finish(COPY.sent);
      if (outcome === 'queued') return finish(COPY.savedLocal);
      heldNote = note;
      return go('failed');
    }
    if (view === 'write' && draft.trim() !== '') {
      busy = true;
      const note: QueuedNote = {
        ...base,
        kind: 'text',
        text: noteHead(where) + draft.trim(),
        durationSec: null,
      };
      if (!enqueueNote(note)) {
        busy = false;
        return setError(COPY.unsaved);
      }
      go('sending');
      const outcome = await sendQueuedNote(note, audioStore);
      busy = false;
      return finish(outcome === 'sent' ? COPY.sent : COPY.savedLocal);
    }
  };

  /** Try again on a kept recording. */
  const retry = async (): Promise<void> => {
    const note = heldNote;
    if (!note || busy) return;
    busy = true;
    go('sending');
    const outcome = await sendQueuedNote(note, audioStore);
    busy = false;
    if (outcome === 'sent') return finish(COPY.sent);
    if (outcome === 'queued') return finish(COPY.savedLocal);
    go('failed');
  };

  const body = (): string => {
    const head = `<h2 class="note-title">${escapeHtml(COPY.title)}</h2>`;
    switch (view) {
      case 'idle':
        return `${head}
          <p class="note-line">${escapeHtml(COPY.line)}</p>
          <button type="button" class="btn-large btn-primary" id="rec-start">${escapeHtml(COPY.record)}</button>
          <button type="button" class="btn-large btn-back" id="write-start">${escapeHtml(COPY.write)}</button>`;
      case 'recording':
        return `${head}
          <div class="note-rec-row"><span class="note-rec-dot" aria-hidden="true"></span><span class="note-rec-time" id="rec-time" role="timer">0:00</span></div>
          <button type="button" class="btn-large btn-primary" id="rec-stop">${escapeHtml(COPY.stop)}</button>`;
      case 'review':
        return `${head}
          ${hitLimit ? `<p class="note-line" id="note-limit">${escapeHtml(COPY.limit)}</p>` : ''}
          <button type="button" class="btn-large btn-back" id="rec-play">${escapeHtml(COPY.play)} · ${fmt(recording?.durationSec ?? 0)}</button>
          <button type="button" class="btn-large btn-back" id="rec-again">${escapeHtml(COPY.again)}</button>
          <button type="button" class="btn-large btn-primary" id="note-send">${escapeHtml(COPY.send)}</button>
          <p class="note-error" id="note-error" role="alert"></p>`;
      case 'write':
        return `${head}
          <label class="note-sr" for="note-text">${escapeHtml(COPY.title)}</label>
          <textarea id="note-text" class="note-text" dir="auto" rows="5" maxlength="4000" placeholder="${escapeHtml(COPY.placeholder)}">${escapeHtml(draft)}</textarea>
          <button type="button" class="btn-large btn-primary" id="note-send" ${draft.trim() === '' ? 'disabled' : ''}>${escapeHtml(COPY.send)}</button>
          <p class="note-error" id="note-error" role="alert"></p>
          ${heldNote ? `<p class="note-line">${escapeHtml(COPY.kept)}</p><button type="button" class="back-link" id="drop-audio">${escapeHtml(COPY.dropAudio)}</button>` : ''}`;
      case 'confirm':
        return `<h2 class="note-title" id="confirm-title">${escapeHtml(COPY.confirmTitle)}</h2>
          <button type="button" class="btn-large btn-primary" id="confirm-send">${escapeHtml(COPY.send)}</button>
          <button type="button" class="btn-large btn-back" id="confirm-discard">${escapeHtml(COPY.discard)}</button>
          <button type="button" class="btn-large btn-back" id="confirm-keep">${escapeHtml(COPY.keep)}</button>`;
      case 'short':
        return `${head}
          <p class="note-line" id="note-short">${escapeHtml(COPY.tooShort)}</p>
          <button type="button" class="btn-large btn-primary" id="rec-start">${escapeHtml(COPY.record)}</button>
          <button type="button" class="btn-large btn-back" id="write-start">${escapeHtml(COPY.write)}</button>`;
      case 'denied':
        return `${head}
          <p class="note-line" id="mic-denied">${escapeHtml(COPY.denied)}</p>
          <button type="button" class="btn-large btn-primary" id="write-start">${escapeHtml(COPY.write)}</button>`;
      case 'failed':
        return `${head}
          <p class="note-line" id="note-failed" role="alert">${escapeHtml(COPY.failed)}</p>
          <button type="button" class="btn-large btn-primary" id="try-again">${escapeHtml(COPY.tryAgain)}</button>
          <button type="button" class="btn-large btn-back" id="write-instead">${escapeHtml(COPY.writeInstead)}</button>`;
      case 'sending':
        return `${head}<p class="note-line" id="note-sending" role="status">Sending…</p>`;
      case 'done':
        return `<p class="note-done" id="note-done" role="status">${escapeHtml(doneText)}</p>`;
    }
  };

  function paint(): void {
    const closeBtn =
      view === 'done' || view === 'confirm' || view === 'sending'
        ? ''
        : `<button type="button" class="back-link note-close" id="note-close">${escapeHtml(COPY.close)}</button>`;
    sheet.innerHTML = `<div class="note-card">${body()}${closeBtn}</div>`;
    wire();
  }

  function wire(): void {
    const on = (sel: string, fn: () => void): void => {
      sheet.querySelector(sel)?.addEventListener('click', fn);
    };
    on('#note-close', requestClose);
    on('#confirm-keep', () => go(before));
    on('#confirm-discard', closeNoteSheet);
    on('#confirm-send', () => {
      view = before;
      paint();
      void send();
    });
    on('#rec-start', () => void startRecording());
    on('#write-start', () => go('write'));
    on('#write-instead', () => go('write'));
    on('#try-again', () => void retry());
    on('#drop-audio', () => {
      const note = heldNote;
      if (note) {
        removeQueuedNote(note.id);
        void audioStore.delete(note.id);
      }
      heldNote = null;
      go('write');
      if (state.screen === 'home') requestRender();
    });
    on('#note-send', () => void send());
    on('#rec-stop', () => void stopRecording());
    on('#rec-again', () => {
      releaseRecording();
      void startRecording();
    });
    const area = sheet.querySelector<HTMLTextAreaElement>('#note-text');
    if (area) {
      area.addEventListener('input', () => {
        draft = area.value;
        const btn = sheet.querySelector<HTMLButtonElement>('#note-send');
        if (btn) btn.disabled = draft.trim() === '';
      });
      area.focus();
    }
    const play = sheet.querySelector<HTMLButtonElement>('#rec-play');
    if (play && recordingUrl) {
      const label = fmt(recording?.durationSec ?? 0);
      const url = recordingUrl;
      play.addEventListener('click', () => {
        if (player && !player.paused) {
          player.pause();
          return;
        }
        if (!player) {
          const el = new Audio(url);
          player = el;
          el.addEventListener('play', () => {
            play.textContent = `${COPY.pause} · ${label}`;
          });
          const back = (): void => {
            play.textContent = `${COPY.play} · ${label}`;
          };
          el.addEventListener('pause', back);
          el.addEventListener('ended', back);
        }
        void player.play().catch(() => undefined);
      });
    }
    if (view === 'recording') {
      const time = sheet.querySelector<HTMLElement>('#rec-time');
      endTicker();
      ticker = window.setInterval(() => {
        const r = recorder;
        if (!r || !time) return;
        const t = r.elapsed();
        time.textContent = fmt(t);
        if (t >= MAX_SECONDS) void stopRecording(true);
      }, 250);
    }
  }

  paint();
}
