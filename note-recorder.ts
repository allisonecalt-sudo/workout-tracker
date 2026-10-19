// note-recorder.ts - the microphone for "Note to Claude" (v63 item 1, Oct 19 2026). No DOM.
//
// WHAT: records from the microphone as raw PCM (Web Audio) and hands back a 16 kHz mono 16-bit WAV
// blob, the exact recipe voice-capture's AudioRecorder + wav.ts use, so a recording goes to Gemini
// as audio/wav (Gemini's documented formats include wav; Android Chrome's MediaRecorder webm is not
// guaranteed). The microphone is open ONLY while recording: every track is released on stop / cancel.
// WHY: one recipe for both apps, so a note spoken here transcribes the way a note spoken there does.
// DECIDED: capped at 3 minutes (MAX_SECONDS) so one note is one inline request; under half a second
// is a slip of the finger (TooShortError). ONE AudioContext is made on the first recording and reused
// (suspended between recordings): a context per recording would leak, and closing one is a DOM-looking
// call the shared-layer guard rightly refuses to guess about.
// RULES: shared layer, strings/blobs out, no DOM writes.

/** A note stops by itself here (3 minutes). */
export const MAX_SECONDS = 180;
/** Shorter than this is a slip of the finger, not a note. */
const MIN_MS = 500;
const TARGET_SAMPLE_RATE = 16000;

export type Recording = { blob: Blob; durationSec: number };

export type ActiveRecorder = {
  /** Seconds since it started, by the wall clock. */
  elapsed: () => number;
  stop: () => Promise<Recording>;
  /** Throw it away and release the microphone. */
  cancel: () => void;
};

/** The recording came out empty or under half a second: nothing worth sending. */
export class TooShortError extends Error {}
/** The phone did not let the app use the microphone, or has none. */
export class MicError extends Error {}

let ctx: AudioContext | null = null;

function context(): AudioContext {
  if (ctx) return ctx;
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new Ctx();
  return ctx;
}

function downsample(buffer: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return buffer;
  const ratio = inRate / outRate;
  const n = Math.round(buffer.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const exact = i * ratio;
    const before = Math.floor(exact);
    const after = Math.min(before + 1, buffer.length - 1);
    const frac = exact - before;
    out[i] = (buffer[before] ?? 0) * (1 - frac) + (buffer[after] ?? 0) * frac;
  }
  return out;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

/** Mono Float32 samples at `sampleRate` -> a canonical 44-byte-header 16-bit PCM WAV blob. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2;
  const view = new DataView(new ArrayBuffer(44 + dataSize));
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (const raw of samples) {
    const s = Math.max(-1, Math.min(1, raw));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}

export async function startRecorder(): Promise<ActiveRecorder> {
  if (!navigator.mediaDevices?.getUserMedia) throw new MicError('no microphone');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new MicError('refused');
  }
  const release = (): void => stream.getTracks().forEach((t) => t.stop());
  let audio: AudioContext;
  let source: MediaStreamAudioSourceNode;
  let processor: ScriptProcessorNode;
  const chunks: Float32Array[] = [];
  try {
    audio = context();
    await audio.resume();
    source = audio.createMediaStreamSource(stream);
    // deprecated but universal on Android Chrome and needs no worklet file (voice-capture does the same)
    processor = audio.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e: AudioProcessingEvent): void => {
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); // copy: the audio thread reuses the buffer
    };
    source.connect(processor);
    processor.connect(audio.destination); // a ScriptProcessor only fires when connected
  } catch {
    release();
    throw new MicError('cannot record');
  }
  const startedAt = Date.now();
  let finished = false;
  const stopCapture = async (): Promise<void> => {
    finished = true;
    processor.disconnect();
    processor.onaudioprocess = null;
    source.disconnect();
    release();
    await audio.suspend().catch(() => undefined);
  };
  return {
    elapsed: () => (Date.now() - startedAt) / 1000,
    stop: async () => {
      const heldMs = Date.now() - startedAt;
      await stopCapture();
      let total = 0;
      for (const c of chunks) total += c.length;
      if (total === 0 || heldMs < MIN_MS) throw new TooShortError('too short');
      const merged = new Float32Array(total);
      let at = 0;
      for (const c of chunks) {
        merged.set(c, at);
        at += c.length;
      }
      const blob = encodeWav(
        downsample(merged, audio.sampleRate, TARGET_SAMPLE_RATE),
        TARGET_SAMPLE_RATE
      );
      return { blob, durationSec: Math.max(1, Math.round(heldMs / 1000)) };
    },
    cancel: () => {
      if (finished) return;
      void stopCapture();
    },
  };
}
