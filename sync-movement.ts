// sync-movement.ts - the walk and Google Fit sync (code-shape step 9b, Oct 14 2026).
// Moved out of app.ts verbatim - no behaviour change, no version bump.
//
// Owns: pushWalk (POST movement_log) with markWalkSynced and flushPendingWalks, and the
// fit-steps edge-function POST. The URL / key / headers / syncDisabled() are sync.ts's.
// Imports state.ts / sync.ts / dates.ts only - NEVER app.ts or a screen. Neither function
// redraws, so there is nothing to route through bus.ts.

import { loadWalks, writeWalks } from './state.js';
import { SUPABASE_URL, supabaseHeaders, syncDisabled } from './sync.js';
import { localIsoDate } from './dates.js';
import type { WalkEntry } from './types.js';

function markWalkSynced(id: string): void {
  const walks = loadWalks();
  const idx = walks.findIndex((w) => w.id === id);
  if (idx === -1) return;
  const entry = walks[idx];
  if (!entry) return;
  walks[idx] = { ...entry, synced: true };
  writeWalks(walks);
}

export async function pushWalk(walk: WalkEntry): Promise<void> {
  if (syncDisabled()) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/movement_log`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        // v48 · P3 (Sep 24 2026): the LOCAL day. The UTC slice filed an evening
        // walk in Jerusalem (after 21:00 in summer) under the next day.
        date: localIsoDate(new Date(walk.date)),
        kind: 'walk',
        minutes: walk.minutes ?? null,
        // v48 · P3: minutes only. A v47 walk still waiting to sync carries the
        // archived sensors' numbers (3 steps in 29 min) — they don't travel.
        meters: null,
        steps: null,
      }),
    });
    if (res.ok) {
      markWalkSynced(walk.id);
      return;
    }
    // v48 (Sep 24 2026): fail loud, same shape as the session push. movement_log
    // has 0 rows EVER and a silent catch couldn't tell "unused" from "broken"
    // (slow-walking audit). Still stays unsynced and is flushed on next load.
    console.warn('[sync] walk push failed:', res.status, await res.text().catch(() => ''));
  } catch (err) {
    console.warn('[sync] walk push threw:', err);
  }
}

export async function flushPendingWalks(): Promise<void> {
  if (syncDisabled()) return;
  for (const w of loadWalks().filter((x) => !x.synced)) {
    await pushWalk(w);
  }
}

// Google Fit step count for a clock window, via the `fit-steps` Supabase edge
// function (v16, Jul 9 2026 — her idea: "when I start walking it knows"). The
// phone counts steps NATIVELY even with the screen off / another app open, so
// asking Fit "how many steps between start and end?" gets the REAL walk count and
// sidesteps the PWA background-sensor limit entirely. The Google token lives
// server-side in the edge function (never in the app). Returns null on any
// failure (offline, test mode, Fit not linked) so callers keep the motion-sensor
// estimate as a graceful fallback — the walk still logs either way.
// v67 (Oct 25 2026): ONLY the three headers the edge function's CORS allows
// ("authorization, apikey, content-type"). supabaseHeaders() also carries
// PostgREST's `Prefer`, which the browser preflight refused — so every Fit call
// since v16 failed with a CORS error and walks fell back to the sensor estimate.
// Found from the live console, her yes Oct 25 14:57.
export const FIT_STEPS_ALLOWED_HEADERS = ['authorization', 'apikey', 'content-type'] as const;

export function fitStepsHeaders(): Record<string, string> {
  const all = supabaseHeaders() as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(all)) {
    if ((FIT_STEPS_ALLOWED_HEADERS as readonly string[]).includes(name.toLowerCase())) {
      out[name] = value;
    }
  }
  return out;
}

export async function fetchFitSteps(startMs: number, endMs: number): Promise<number | null> {
  if (syncDisabled()) return null;
  if (!startMs || !endMs || endMs <= startMs) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/fit-steps`, {
      method: 'POST',
      headers: fitStepsHeaders(),
      body: JSON.stringify({ startMillis: startMs, endMillis: endMs }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const steps = (data as { steps?: unknown }).steps;
    return typeof steps === 'number' && steps >= 0 ? steps : null;
  } catch {
    return null;
  }
}
