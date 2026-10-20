// what-grew.ts - Progress's "What grew" rows (v64, Oct 20 2026).
//
// What: one row per move, first -> now, each with its OWN since-date, comparing like with
// like: the wall sit (honest readings only), the arm curl load from the load chip, the
// longest ride, and the ride level ONLY across rides of the same length. Then one plain-words
// line. Plain text out (the screen escapes it); no verdict words, nothing coloured.
// Why a module: the rules are pure and worth a Node test; the screen only draws.
// Shared layer: strings out, no DOM, never imports app.ts or a screen.

import type { LogEntry } from './types.js';
import { honestWallSitLogs } from './viz.js';
import { ellipticalRideRecords } from './cardio-notes.js';
import { armFeelLoad } from './workout-feel.js';

export type GrewRow = {
  label: string;
  /** "44 s -> 45 s" (plain text, an arrow glyph). */
  value: string;
  /** ISO date this row's series starts. */
  since: string;
  /** The row's latest ride was in a light-restart week (v64 fix): the screen says so, quietly. */
  lightLatest?: boolean;
};

export type WhatGrew = { rows: GrewRow[]; words: string; restartNote: string };

export const LIGHT_SUFFIX = 'latest was a light week';
export const RESTART_NOTE = "Light-restart rides aren't a step back; they're the restart.";

type RideLen = { id: string; date: string; minutes: number; level: number | null };

/** A ride's length in whole minutes: the console time, else the minutes she logged. */
function rideMinutes(r: { timeSec: number | null; minutes?: number | null }): number | null {
  if (typeof r.timeSec === 'number' && r.timeSec > 0) return Math.round(r.timeSec / 60);
  if (typeof r.minutes === 'number' && r.minutes > 0) return Math.round(r.minutes);
  return null;
}

const kg = (load: '1kg' | '2kg'): string => (load === '2kg' ? '2 kg' : '1 kg');

/** `chrono` = every session, oldest -> newest. */
export function whatGrew(
  chrono: LogEntry[],
  isLight: (l: LogEntry) => boolean = () => false
): WhatGrew {
  const byId = new Map(chrono.map((l) => [l.id, l] as const));
  const lightRide = (r: RideLen): boolean => {
    const l = byId.get(r.id);
    return l !== undefined && isLight(l);
  };
  const rows: GrewRow[] = [];

  // Wall sit: only real measurements (viz.ts honestWallSitLogs), first -> latest.
  const walls = honestWallSitLogs(chrono);
  if (walls.length > 0) {
    const first = walls[0]!;
    const last = walls[walls.length - 1]!;
    rows.push({
      label: 'Wall sit',
      value:
        walls.length === 1
          ? `${last.wallSitSec} s`
          : `${first.wallSitSec} s → ${last.wallSitSec} s`,
      since: first.date,
    });
  }

  // Arm curl: the load chip's own readings, first -> latest.
  const curls = chrono
    .map((l) => ({ date: l.date, load: armFeelLoad(l.armFeel, 'curl') }))
    .filter((c): c is { date: string; load: '1kg' | '2kg' } => c.load !== null);
  if (curls.length > 0) {
    const first = curls[0]!;
    const last = curls[curls.length - 1]!;
    rows.push({
      label: 'Arm curl',
      value: first.load === last.load ? kg(last.load) : `${kg(first.load)} → ${kg(last.load)}`,
      since: first.date,
    });
  }

  // Rides: the first ride's length -> the longest ride so far.
  const rides: RideLen[] = ellipticalRideRecords(chrono)
    .map((r) => ({ id: r.id, date: r.date, minutes: rideMinutes(r), level: r.level }))
    .filter((r): r is RideLen => r.minutes !== null);
  let words = '';
  if (rides.length > 0) {
    const first = rides[0]!;
    let longest = first;
    for (const r of rides) if (r.minutes >= longest.minutes) longest = r;
    rows.push({
      label: 'Longest ride',
      value:
        longest.minutes > first.minutes
          ? `${first.minutes} min → ${longest.minutes} min`
          : `${longest.minutes} min`,
      since: first.date,
      lightLatest: lightRide(longest),
    });
    if (longest.minutes > first.minutes) {
      words =
        longest.level !== null
          ? `Rides got longer; the longest was at level ${longest.level}.`
          : 'Rides got longer.';
    }

    // Level: ONLY across rides of the same length (a level at 10 min next to a level at
    // 30 min says nothing). The length with the most rides; ties go to the newest.
    const byLen = new Map<number, RideLen[]>();
    for (const r of rides) {
      if (r.level === null) continue;
      byLen.set(r.minutes, [...(byLen.get(r.minutes) ?? []), r]);
    }
    let pick: RideLen[] | null = null;
    for (const group of byLen.values()) {
      if (group.length < 2) continue;
      const newer = (g: RideLen[]): string => g[g.length - 1]!.date;
      if (
        pick === null ||
        group.length > pick.length ||
        (group.length === pick.length && newer(group) > newer(pick))
      )
        pick = group;
    }
    if (pick) {
      const a = pick[0]!;
      const b = pick[pick.length - 1]!;
      rows.push({
        label: `Level at ${a.minutes} min`,
        value: a.level === b.level ? `L${a.level}, the same` : `L${a.level} → L${b.level}`,
        since: a.date,
        lightLatest: lightRide(b),
      });
    }
  }
  return { rows, words, restartNote: rows.some((r) => r.lightLatest) ? RESTART_NOTE : '' };
}
