// sync-week-moves.ts - the week_moves sync (code-shape step 9b, Oct 14 2026).
// Moved out of app.ts verbatim - no behaviour change, no version bump.
//
// Owns: weekMoveKey, the pure merge (local unsynced wins), pull, the pure push body
// (weekMovePayload), push (upsert on round,week) and delete (the Undo tombstone's DELETE).
// The localStorage side (loadWeekMoves / writeWeekMoves) is state.ts's; the URL / key /
// headers / syncDisabled() are sync.ts's. Imports state.ts / sync.ts / bus.ts / types.ts
// only - NEVER app.ts or a screen.
// The one change from the app.ts original: pullWeekMovesFromSupabase asks for a redraw with
// bus.requestRender() where app.ts called render() (same function, registered at boot).

import { state, loadWeekMoves, writeWeekMoves } from './state.js';
import { requestRender } from './bus.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseHeaders, syncDisabled } from './sync.js';
import type { StoredWeekMove } from './types.js';

// ---------- WK3 · week_moves sync (Sep 27 2026) ----------
//
// PLAN-2026-09-26.md §2.2: "Move on without it" is a quiet, explicit event
// (week.ts's MoveOn), never inferred — the table holds ONLY the exceptions (a
// week she chose to close with 1-2 done); completed weeks are still derived
// from workout_sessions, untouched. Same sync shape as cycle_periods
// (v50, above): no pagination, no delete-detection window — "pull replaces
// synced rows, an unsynced local write always wins until it's confirmed."
// Undo (§2.4) is a plain DELETE by (round, week) — to a fresh walkWeeks()
// recompute that's exactly "this move never happened", no special case
// needed on the read side.
//
// SCHEMA: the table itself (migrations/2026-09-27-v53-week-moves.sql) is
// NOT YET APPLIED — her yes comes first (CLAUDE.md's schema-change rule).
// Until then every pull/push/delete below fails loud (console.warn) exactly
// like any other network hiccup — no app-side change needed once it ships.

type RemoteWeekMove = { round: number; week: number; moved_at: string; missing: string | null };

export function weekMoveKey(round: number, week: number): string {
  return `${round}-${week}`;
}

export function mergeWeekMoves(
  local: StoredWeekMove[],
  remote: RemoteWeekMove[]
): StoredWeekMove[] {
  // v62.2: week_moves deliberately has NO empty-remote guard (unlike sessions since v33 and
  // cycle_periods). This table holds only EXCEPTIONS, so an empty answer is its NORMAL state,
  // not a sign of a wiped table. After the day of the move Undo is gone, and deleting the
  // Supabase row is the only way to take a move back - the next pull must then clear it. A
  // guard here would keep the stale move on the phone for ever (checker, Oct 14). The remote
  // is the truth for synced moves; unsynced local moves (incl. Undo tombstones) still win.
  const byKey = new Map<string, StoredWeekMove>();
  for (const l of local) if (l.synced === false) byKey.set(weekMoveKey(l.round, l.week), l);
  for (const r of remote) {
    const key = weekMoveKey(r.round, r.week);
    const existing = byKey.get(key);
    if (existing && existing.synced === false) continue; // local unsynced write wins on content
    byKey.set(key, {
      round: r.round,
      week: r.week,
      at: r.moved_at,
      missing: r.missing ?? '',
      synced: true,
    });
  }
  return [...byKey.values()];
}

export async function pullWeekMovesFromSupabase(): Promise<void> {
  if (syncDisabled()) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/week_moves?select=round,week,moved_at,missing&order=moved_at.desc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (res.ok && res.headers.get('X-SW-Cache') !== '1') {
      const remote: RemoteWeekMove[] = await res.json();
      writeWeekMoves(mergeWeekMoves(loadWeekMoves(), remote));
      if (state.screen === 'home') requestRender();
    } else if (!res.ok) {
      console.warn('[sync] pull week_moves failed:', res.status);
    }
  } catch (err) {
    console.warn('[sync] pull week_moves threw:', err);
  }
}

// Pure — kept separate from the fetch call so tests can assert it via a
// window hook, the same way cyclePeriodPayload does for cycle_periods.
export function weekMovePayload(m: StoredWeekMove): RemoteWeekMove {
  return { round: m.round, week: m.week, moved_at: m.at, missing: m.missing || null };
}

export async function pushWeekMove(m: StoredWeekMove): Promise<void> {
  if (syncDisabled()) return;
  try {
    // (round, week) is UNIQUE (§2.2) — merge-duplicates makes a repeat push
    // (a retry, a second phone) an upsert, not a 409 — same on_conflict shape
    // as cycle_periods' pushCyclePeriod above.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/week_moves?on_conflict=round,week`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(weekMovePayload(m)),
    });
    if (res.ok) {
      const moves = loadWeekMoves();
      const idx = moves.findIndex((x) => x.round === m.round && x.week === m.week);
      // WK3 fix r1 (checker must #1): a push still in flight when she taps
      // Undo must not resurrect the row. If what's now in local storage for
      // this key is a delete tombstone, leave it exactly as pending-delete —
      // flushPendingSyncs' retry loop (or the Undo tap's own deleteWeekMove
      // call) picks it up and removes the row for real. Only mark synced
      // when it's still the same live (non-deleted) move.
      if (idx >= 0 && !moves[idx]!.deleted) {
        moves[idx] = { ...moves[idx]!, synced: true };
        writeWeekMoves(moves);
      }
    } else {
      console.warn('[sync] push week_moves failed:', res.status);
    }
  } catch (err) {
    console.warn('[sync] push week_moves threw:', err);
  }
}

export async function deleteWeekMove(round: number, week: number): Promise<void> {
  if (syncDisabled()) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/week_moves?round=eq.${round}&week=eq.${week}`,
      {
        method: 'DELETE',
        headers: supabaseHeaders(),
      }
    );
    // WK3 fix r1 (checker must #1): the result used to go unchecked — a
    // failed DELETE left the remote row in place with nothing local to say
    // so. Only drop the tombstone once Supabase actually confirms it's gone;
    // otherwise leave it (still synced:false) for the next retry.
    if (res.ok) {
      writeWeekMoves(
        loadWeekMoves().filter((m) => !(m.round === round && m.week === week && m.deleted === true))
      );
    } else {
      console.warn('[sync] delete week_moves failed:', res.status);
    }
  } catch (err) {
    console.warn('[sync] delete week_moves threw:', err);
  }
}
