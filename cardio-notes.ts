// cardio-notes.ts - reading a session's cardio back out of its log row
// (code-shape step 8b, Oct 14 2026). Moved out of app.ts verbatim - no behaviour change.
//
// Why: app.ts (session detail, history) AND the rides page need "was this an elliptical
// ride, and what were its numbers". One reader of the notes marker + the v48 columns,
// shared, so a screen never grows a second parallel reader. Pure: types in, values out;
// no DOM, no storage, no clock.

import type { LogEntry } from './types.js';
import type { RideRecord } from './ride.js';

// v47 rows carry the cardio lane, the machine readings and her words as prose
// in `notes` ("cardio: elliptical 10 min · level 7 · 1.4 km · pulse 128 · knee
// fine · duration not recorded — …"). Same head as ELLIPTICAL_MARKER_RE, with
// the readings captured too, so an old ride shows the same Cardio row as a new one.
const LEGACY_ELLIPTICAL_RE =
  /cardio: elliptical (\d+) min(?: · level (\d+))?(?: · (\d+(?:\.\d+)?) km)?(?: · pulse (\d+))?/;
const LEGACY_APARTMENT_RE = /cardio: apartment (\d+) min/;
// The app's own annotations (v32 left-open / logged after the fact, v48 "Log
// what I did") — "System", never shown as if she wrote them.
const SYSTEM_NOTE_RE = /^(duration not recorded|logged after the fact|stopped early at)/;

export type SessionCardio = {
  lane: 'walk' | 'apartment' | 'elliptical';
  minutes: number | null;
  level: number | null;
  km: number | null;
  pulse: number | null;
  // v49 (Sep 25 2026): calories + time off the console. null on every row
  // logged before v49 — legacy notes never carried them.
  kcal: number | null;
  timeSec: number | null;
};

function numOrNull(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Splits a `notes` string into the legacy cardio marker, her words and the
// app's annotations. A v48 row's notes are annotations only, so its words come
// back empty; a v47 row gets all three pulled apart.
export function splitNotes(notes: string | null | undefined): {
  cardio: SessionCardio | null;
  words: string[];
  system: string[];
} {
  let rest = notes ?? '';
  let cardio: SessionCardio | null = null;
  const ell = LEGACY_ELLIPTICAL_RE.exec(rest);
  if (ell) {
    cardio = {
      lane: 'elliptical',
      minutes: numOrNull(ell[1]),
      level: numOrNull(ell[2]),
      km: numOrNull(ell[3]),
      pulse: numOrNull(ell[4]),
      kcal: null,
      timeSec: null,
    };
    rest = rest.replace(ell[0], '');
  }
  const apt = LEGACY_APARTMENT_RE.exec(rest);
  if (apt) {
    if (!cardio) {
      cardio = {
        lane: 'apartment',
        minutes: numOrNull(apt[1]),
        level: null,
        km: null,
        pulse: null,
        kcal: null,
        timeSec: null,
      };
    }
    rest = rest.replace(apt[0], '');
  }
  const words: string[] = [];
  const system: string[] = [];
  for (const part of rest.split(' · ')) {
    const t = part.trim();
    if (!t) continue;
    (SYSTEM_NOTE_RE.test(t) ? system : words).push(t);
  }
  return { cardio, words, system };
}

// The session's cardio: the v48 columns first; a v47 row falls back to its
// notes marker; an old real walk to walkMinutes.
export function sessionCardio(l: LogEntry): SessionCardio | null {
  if (l.cardioLane) {
    const ell = l.cardioLane === 'elliptical';
    return {
      lane: l.cardioLane,
      minutes: l.cardioMinutes ?? (l.cardioLane === 'walk' ? (l.walkMinutes ?? null) : null),
      level: ell ? (l.ellipticalLevel ?? null) : null,
      km: ell ? (l.ellipticalKm ?? null) : null,
      pulse: ell ? (l.ellipticalPulse ?? null) : null,
      kcal: ell ? (l.ellipticalKcal ?? null) : null,
      timeSec: ell ? (l.ellipticalTimeSec ?? null) : null,
    };
  }
  const legacy = splitNotes(l.notes).cardio;
  if (legacy) return legacy;
  if (typeof l.walkMinutes === 'number' && l.walkMinutes > 0) {
    return {
      lane: 'walk',
      minutes: l.walkMinutes,
      level: null,
      km: null,
      pulse: null,
      kcal: null,
      timeSec: null,
    };
  }
  return null;
}

// THE RIDES PAGE (Sep 27 2026) — every elliptical session, oldest -> newest,
// as ride.ts's plain RideRecord shape. Reuses sessionCardio() (above) so a
// legacy v47 row's notes-marker ride and a v48+ row's real columns build the
// exact same record a v49+ row does — one source of "was this an elliptical
// ride" for the whole app, never a second parallel reader of the columns.
// An id-less log is dropped (same fail-loud rule as sessionsForWeekModel —
// ride.ts's RideRecord.id is how the chart's tap and "usual"/"best" are
// keyed back to a session).
export function ellipticalRideRecords(logs: LogEntry[]): RideRecord[] {
  const records: RideRecord[] = [];
  for (const l of logs) {
    if (!l.id) continue;
    const cardio = sessionCardio(l);
    if (!cardio || cardio.lane !== 'elliptical') continue;
    records.push({
      id: l.id,
      date: l.date,
      workout: l.workout,
      level: cardio.level,
      km: cardio.km,
      kcal: cardio.kcal,
      timeSec: cardio.timeSec,
      // v61 fix pass (CHECK-v61 must #1): carried alongside timeSec so
      // ride-aim.ts can still bucket a row that has no typed time but does
      // have cardio_minutes (her real Sep 28 D row — see ride-aim.ts's
      // effectiveTimeSec()).
      minutes: cardio.minutes,
    });
  }
  return records;
}

// The v47 notes marker, rebuilt from a saved entry's columns. v48 (Sep 24
// 2026): only the legacy push uses it now (a phone ahead of the schema — see
// pushLogToSupabase). Its "cardio: elliptical N min · level L" head is what
// lastEllipticalLevel() reads back; the readings ride after it when present.
export function legacyCardioMarker(entry: LogEntry): string | null {
  const minutes = entry.cardioMinutes;
  if (entry.cardioLane === 'apartment' && minutes != null)
    return `cardio: apartment ${minutes} min`;
  if (entry.cardioLane !== 'elliptical' || minutes == null) return null;
  const parts = [`cardio: elliptical ${minutes} min`];
  if (entry.ellipticalLevel != null) parts.push(`level ${entry.ellipticalLevel}`);
  if (entry.ellipticalKm != null) parts.push(`${entry.ellipticalKm} km`);
  if (entry.ellipticalPulse != null) parts.push(`pulse ${entry.ellipticalPulse}`);
  return parts.join(' · ');
}

// The level / km she recorded on a ride: the v48 columns, else the v47 marker.
export function rideLevel(l: LogEntry): number | null {
  if (typeof l.ellipticalLevel === 'number' && l.ellipticalLevel > 0) return l.ellipticalLevel;
  return l.cardioLane ? null : (splitNotes(l.notes).cardio?.level ?? null);
}

export function rideKm(l: LogEntry): number | null {
  if (typeof l.ellipticalKm === 'number' && l.ellipticalKm > 0) return l.ellipticalKm;
  return l.cardioLane ? null : (splitNotes(l.notes).cardio?.km ?? null);
}

// v51 · Start -> Now's combined elliptical line ("... 0.72 km in 10 min"):
// the real ride duration, v49's own column only (no pre-v49 marker to fall
// back to — those rides predate the elliptical entirely).
export function rideTimeSec(l: LogEntry): number | null {
  return typeof l.ellipticalTimeSec === 'number' && l.ellipticalTimeSec > 0
    ? l.ellipticalTimeSec
    : null;
}

// v62.3 F8 - a session note that starts with "Claude-logged" (case-insensitive,
// after trimming) was written by Claude, not by her. Her voice rule: her words
// outrank Claude's, so a screen never shows it in her italic quote style - it
// shows it plain, behind a small "Claude's note:" label.
export function isClaudeNote(text: string): boolean {
  return /^claude-logged/i.test(text.trim());
}
