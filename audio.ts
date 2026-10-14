// audio.ts - the app's sound (code-shape step 11b, Oct 14 2026).
// Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the Web Audio beeps (getAudioCtx, unlockAudio, playBeep, the count / go /
// finish beeps) and the per-exercise voice note player (stopVoiceNote, and the
// <audio> element toggle). The context and the playing element live in ui.ts
// (ui.audioCtx, ui.voiceAudio, ui.voiceAudioSrc).
// WHY: the timer (timer.ts) and the exercise screens (steps 12-17) both play sound; a
// screen cannot import app.ts, so the sound had to leave it first.
// RULE: writes NO DOM. The two things the voice note used to do to the page - flip the
// button's icon/label, and count a play on the session - are CALLBACKS that app.ts
// passes in (`toggleVoiceNote` there is a thin wrapper that supplies them); the order of
// the audio element's listeners is exactly the old one. Imports state / ui only, never
// app.ts or a screen (enforced by tests/import-graph.test.ts).
//
// `window` is read once, for window.AudioContext / webkitAudioContext (the audio
// engine, not the page); the import-graph test allows exactly that name here.

import { getBeepsEnabled } from './state.js';
import { ui } from './ui.js';

export function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ui.audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ui.audioCtx = new Ctx();
  }
  return ui.audioCtx;
}

// Group 1C: must be called synchronously from a user-gesture handler. The Web
// Audio autoplay policy will leave the context suspended until a real click
// resumes it. Calling this from inside a setInterval/rAF callback is too late.
export function unlockAudio(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

export function playBeep(frequency: number, durationMs: number): void {
  // Ship 6: beeps toggle. When off, skip silently — timer logic still runs.
  if (!getBeepsEnabled()) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  osc.type = 'sine';
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

export function playCountBeep(): void {
  playBeep(520, 120);
}

export function playGoBeep(): void {
  playBeep(880, 200);
}

export function playFinishBeep(): void {
  playBeep(660, 180);
  setTimeout(() => playBeep(880, 350), 180);
}

// ---------- per-exercise voice note (Allison Jul 9 2026) ----------

export function stopVoiceNote(): void {
  if (ui.voiceAudio) {
    ui.voiceAudio.pause();
    ui.voiceAudio = null;
  }
  ui.voiceAudioSrc = null;
}

/** What the page does around a voice note: app.ts's two DOM/session effects. */
export interface VoiceNoteHooks {
  /** The button's playing/paused look (play, pause, ended). */
  setPlaying: (playing: boolean) => void;
  /** Once per play that actually starts: count it on the session and save. */
  onFirstPlay: () => void;
}

export function toggleVoiceNote(src: string, hooks: VoiceNoteHooks): void {
  if (typeof Audio === 'undefined') return; // no audio in this environment
  // Same note already playing → stop it.
  if (ui.voiceAudio && ui.voiceAudioSrc === src && !ui.voiceAudio.paused) {
    ui.voiceAudio.pause();
    return;
  }
  stopVoiceNote(); // stop any other note first
  const audio = new Audio(src);
  ui.voiceAudio = audio;
  ui.voiceAudioSrc = src;
  audio.addEventListener('play', () => hooks.setPlaying(true));
  // v48 (Sep 24 2026): count each play that actually STARTS (a stop is not a
  // play; an autoplay-blocked tap never fires this). Her words: "I can hear
  // details in audio better"; Gemini said she never plays them — count instead
  // of guessing. Each tap makes a fresh Audio, so `once` = one count per play.
  audio.addEventListener('play', () => hooks.onFirstPlay(), { once: true });
  audio.addEventListener('pause', () => hooks.setPlaying(false));
  audio.addEventListener('ended', () => hooks.setPlaying(false));
  void audio.play().catch(() => {
    /* gesture/autoplay policy — safe to ignore, she can tap again */
  });
}
