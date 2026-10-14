// sync-cycle.ts - the cycle_periods sync (code-shape step 9b, Oct 14 2026).
// Moved out of app.ts verbatim - no behaviour change, no version bump.
//
// Owns: the pure merge (local unsynced wins), pull, the pure push body (cyclePeriodPayload),
// push (upsert on start_date) and delete. The localStorage side (loadCyclePeriods /
// writeCyclePeriods) is state.ts's; the URL / key / headers / syncDisabled() are sync.ts's.
// Imports state.ts / sync.ts / bus.ts only - NEVER app.ts or a screen.
// The one change from the app.ts original: pullCyclePeriodsFromSupabase asks for a redraw
// with bus.requestRender() where app.ts called render() (same function, registered at boot).

import { state, loadCyclePeriods, writeCyclePeriods } from './state.js';
import { requestRender } from './bus.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseHeaders, syncDisabled } from './sync.js';
import type { StoredCyclePeriod } from './types.js';

// ---------- v50 · cycle_periods sync (Sep 25 2026) ----------
//
// Tandem rule (CLAUDE.md "Core Role"): her cycle log used to live only in
// self/health/reproductive.md, a file Claude could read but the app never
// could. cycle_periods (migrations/2026-09-25-v50-cycle-periods.sql) is the
// shared table both sides read/write now. The table is tiny (one row per
// period start) so the sync here is simpler than workout_sessions' — no
// pagination, no delete-detection window, just "pull replaces synced rows,
// an unsynced local write always wins until it's confirmed."

type RemoteCyclePeriod = { start_date: string; source?: string | null; note?: string | null };

function mergeCyclePeriods(
  local: StoredCyclePeriod[],
  remote: RemoteCyclePeriod[]
): StoredCyclePeriod[] {
  const byDate = new Map<string, StoredCyclePeriod>();
  for (const l of local) if (l.synced === false) byDate.set(l.startDate, l);
  for (const r of remote) {
    const existing = byDate.get(r.start_date);
    if (existing && existing.synced === false) continue; // local unsynced write wins on content
    byDate.set(r.start_date, {
      startDate: r.start_date,
      source: r.source ?? null,
      note: r.note ?? null,
      synced: true,
    });
  }
  return [...byDate.values()];
}

export async function pullCyclePeriodsFromSupabase(): Promise<void> {
  if (syncDisabled()) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cycle_periods?select=start_date,source,note&order=start_date.desc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok && res.headers.get('X-SW-Cache') !== '1') {
      const remote: RemoteCyclePeriod[] = await res.json();
      writeCyclePeriods(mergeCyclePeriods(loadCyclePeriods(), remote));
      if (
        state.screen === 'progress' ||
        state.screen === 'settings' ||
        state.screen === 'cycle' ||
        state.screen === 'home'
      )
        requestRender();
    } else if (!res.ok) {
      console.warn('[sync] pull cycle_periods failed:', res.status);
    }
  } catch (err) {
    console.warn('[sync] pull cycle_periods threw:', err);
  }
}

// Pure — the exact body a push sends. Kept separate from the fetch call so
// tests can assert it via the __wtCyclePeriodPayload hook the same way
// __wtSessionPayload already covers workout_sessions.
export function cyclePeriodPayload(p: StoredCyclePeriod): RemoteCyclePeriod {
  return { start_date: p.startDate, source: p.source ?? null, note: p.note ?? null };
}

export async function pushCyclePeriod(p: StoredCyclePeriod): Promise<void> {
  if (syncDisabled()) return;
  try {
    // v50 · fix (Sep 25 2026): merge-duplicates alone targets the PRIMARY KEY
    // (id), not start_date — a same-date repeat POST would 409 on the
    // start_date unique index instead of upserting. on_conflict says which
    // column the "duplicate" actually is.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/cycle_periods?on_conflict=start_date`, {
      method: 'POST',
      // start_date is UNIQUE — merge-duplicates makes a repeat tap on the same
      // day an upsert, not a 409.
      headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(cyclePeriodPayload(p)),
    });
    if (res.ok) {
      const periods = loadCyclePeriods();
      const idx = periods.findIndex((x) => x.startDate === p.startDate);
      if (idx >= 0) {
        periods[idx] = { ...periods[idx]!, synced: true };
        writeCyclePeriods(periods);
      }
    } else {
      console.warn('[sync] push cycle_periods failed:', res.status);
    }
  } catch (err) {
    console.warn('[sync] push cycle_periods threw:', err);
  }
}

export async function deleteCyclePeriod(startDate: string): Promise<void> {
  if (syncDisabled()) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/cycle_periods?start_date=eq.${startDate}`, {
      method: 'DELETE',
      headers: supabaseHeaders(),
    });
  } catch (err) {
    console.warn('[sync] delete cycle_periods threw:', err);
  }
}
