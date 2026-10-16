// cardio-readings.ts - the cardio lane's stored readings and the parsers for typed
// ones (code-shape step 10b, Oct 14 2026). Moved verbatim out of app.ts; no behaviour
// change, no version bump.
//
// WHAT: the localStorage readers for the lane a session picked (apartment minutes,
// elliptical minutes / level / km / pulse / time / kcal, the lane's done-minutes) and
// the parsers that turn a typed "mm:ss" / km / pulse / kcal box into a number or null.
// WHY: the save side (actions.ts: saveCompletedSession, saveHistoryEdit) and app.ts's
// ride screens both read these; actions.ts may not import app.ts, so they live here.
// Reads storage keys from state.ts only; no DOM, no app.ts, no screen.
// NEXT: step 17b (ride lanes) may fold the rest of the lane code in beside it.

import {
  WW_APARTMENT_KEY,
  WW_ELLIPTICAL_KEY,
  WW_ELLIPTICAL_KCAL_KEY,
  WW_ELLIPTICAL_KM_KEY,
  WW_ELLIPTICAL_LEVEL_KEY,
  WW_ELLIPTICAL_PULSE_KEY,
  WW_ELLIPTICAL_TIME_KEY,
  WW_LANE_DONE_MIN_KEY,
  WW_LANE_STARTED_KEY,
  loadLogs,
} from './state.js';

export function apartmentCardioMinutes(): number | null {
  const raw = localStorage.getItem(WW_APARTMENT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// York BX200: 24 computerized magnetic levels (Mega Sport spec page, Sep 24).
export const ELLIPTICAL_MAX_LEVEL = 24;

export function ellipticalMinutes(): number | null {
  const raw = localStorage.getItem(WW_ELLIPTICAL_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function clampEllipticalLevel(n: number): number {
  return Math.max(1, Math.min(ELLIPTICAL_MAX_LEVEL, Math.round(n)));
}

// v48 · P3 (Sep 24 2026): the level she RECORDED after this ride, or null.
// Decision Q5: the level is logged after the ride ("the level you rode at is
// only known after"), and a stepper she never touched is not a reading — null
// saves elliptical_level null, the same rule as the untouched sliders (v46).
export function ellipticalLevel(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_LEVEL_KEY));
  return Number.isFinite(n) && n > 0 ? clampEllipticalLevel(n) : null;
}

export function ellipticalKm(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_KM_KEY) ?? '');
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n * 100) / 100 : null;
}

export function ellipticalPulse(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_PULSE_KEY) ?? '');
  return Number.isFinite(n) && n >= 30 && n <= 230 ? Math.round(n) : null;
}

// Typed wins; otherwise the app's own clock — by Save the elliptical step has
// always been left once (captureLaneMinutesIfLeaving, on Done · Next), so
// laneDoneMinutes() is the precise honest number, same one "✓ N min done"
// already showed her. Never null just because she didn't retype what the app
// already knows (her ask: "every time put in").
export function ellipticalTimeSec(): number | null {
  const typed = parseMmSs(localStorage.getItem(WW_ELLIPTICAL_TIME_KEY) ?? '');
  if (typed !== null) return typed;
  const mins = laneDoneMinutes();
  return mins !== null ? mins * 60 : null;
}

export function ellipticalKcal(): number | null {
  const n = Number(localStorage.getItem(WW_ELLIPTICAL_KCAL_KEY) ?? '');
  // v51 (Sep 25 2026) fix: was `n >= 0`, so an untouched field (empty string →
  // Number('') === 0) read back as a real zero instead of null — the one
  // reading on this screen that broke "Skip — no numbers today" leaves every
  // field null (same rule as km/pulse above, and the "Blank = not recorded,
  // never a zero" contract already documented on this block).
  return Number.isFinite(n) && n > 0 && n < 5000 ? Math.round(n * 10) / 10 : null;
}

// "10:02" → 602. Bare 1-2 digits are a plain second count ("45" → 45).
// v49 · look fix (Sep 25 2026): the box opens a numeric phone pad with no ':'
// key, so she types the console's digits with nothing between them — "1002"
// for 10:02, "958" for 9:58. Bare 3-4 digits are read as mm:ss, last two
// digits the seconds (ss ≥ 60 is invalid, not a reading). Anything else
// (empty, garbled) is not a reading — null, same rule as every other field.
export function parseMmSs(raw: string): number | null {
  const v = raw.trim();
  if (v === '') return null;
  const mmss = /^(\d{1,3}):([0-5]?\d)$/.exec(v);
  if (mmss?.[1] && mmss[2]) {
    const sec = Number(mmss[1]) * 60 + Number(mmss[2]);
    return sec > 0 && sec < 18000 ? sec : null;
  }
  const bareDigits = /^\d{1,4}$/.exec(v);
  if (bareDigits) {
    if (v.length <= 2) {
      const sec = Number(v);
      return sec > 0 && sec < 18000 ? sec : null;
    }
    const ss = Number(v.slice(-2));
    const mm = Number(v.slice(0, -2));
    if (ss >= 60) return null;
    const sec = mm * 60 + ss;
    return sec > 0 && sec < 18000 ? sec : null;
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 18000 ? Math.round(n) : null;
}

// v53 (Sep 26 2026) — the same three console-reading validators as
// ellipticalKm()/ellipticalPulse()/ellipticalKcal() above, but pure (a plain
// string in, never localStorage): the history-edit screen (renderHistoryEdit)
// edits a saved LogEntry's fields directly, not the live in-workout keys those
// three read. Same rule as every reading in this app: blank or out-of-range
// is not a value — null, never a guess or a zero.
export function parseKmReading(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n * 100) / 100 : null;
}

export function parsePulseReading(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 30 && n <= 230 ? Math.round(n) : null;
}

export function parseKcalReading(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 5000 ? Math.round(n * 10) / 10 : null;
}

// v48 · P3 (Sep 24 2026) — decision Q7: the generic how-to card on the
// elliptical said the same ride three times (~240 words). A live line,
// derived from the countdown, used to run this ("easy for 2 min, raise the
// level..."). v61 (Sep 28 2026), spec item e: the elliptical has no app
// timer/countdown any more (her words — she uses the bike's own timer), so
// there's no countdown left for a live cue to derive from; removed rather
// than left dead (RidePhase/ridePhase/RIDE_LINE/cueRidePhase, and its one
// call site in the tick loop below).
// v62.3 F9: did the lane's timer ever start this session? (A started lane with no
// stored minutes means the app does not know them - never the prescription.)
export function laneWasStarted(): boolean {
  return localStorage.getItem(WW_LANE_STARTED_KEY) !== null;
}

export function laneDoneMinutes(): number | null {
  const n = Number(localStorage.getItem(WW_LANE_DONE_MIN_KEY) ?? '');
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// v48 · P3 (Sep 24 2026): the level every ride starts AND ends on — "Start on
// level 3, easy". Also where the after-ride stepper starts when there's no last
// level. (v47 guessed 5 before the ride while the steps said 3 — walk §2.)
export const ELLIPTICAL_START_LEVEL = 3;
const ELLIPTICAL_MARKER_RE = /cardio: elliptical \d+ min · level (\d+)/;

// The level from her most recent elliptical session. v48 (Sep 24 2026): the
// real `ellipticalLevel` column first; older rows (and a v47 ride saved tonight)
// only carry the notes marker, so the regex stays as the fallback.
export function lastEllipticalLevel(): number | null {
  const newestFirst = [...loadLogs()].sort((a, b) => b.date.localeCompare(a.date));
  for (const l of newestFirst) {
    if (typeof l.ellipticalLevel === 'number' && l.ellipticalLevel > 0) {
      return clampEllipticalLevel(l.ellipticalLevel);
    }
    // v49 · look fix (Sep 25 2026): skip the notes-marker fallback once a row
    // carries cardioLane — same rule as rideLevel() at L8477. A v48+ ride with
    // a null level was left null ON PURPOSE (Decision Q5); guessing it back
    // from old notes text offered her "5 again" for a level she never rode.
    if (l.cardioLane) continue;
    const m = ELLIPTICAL_MARKER_RE.exec(l.notes ?? '');
    if (m?.[1]) return clampEllipticalLevel(Number(m[1]));
  }
  return null;
}
