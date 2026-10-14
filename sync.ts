// sync.ts - Supabase sync for the sessions table (code-shape step 9a, Oct 14 2026).
// Moved out of app.ts verbatim - no behaviour change, no version bump.
//
// Owns: the Supabase URL / anon key (ONE home) and the request headers, syncDisabled()
// (the automation gate: navigator.webdriver), the workout_sessions wire shapes (sessionPayload,
// the legacy and timing-stripped tiers, the V*_SESSION_COLUMNS groups), push (POST, tiered
// PGRST204 fallback), edit push (PATCH, 0 matched rows = not synced), pull, and the id-keyed
// merge of remote sessions (the v33 deletion rule). The other tables (cycle_periods, week_moves,
// movement_log, fit-steps) still sync from app.ts until step 9b.
//
// Imports state.ts / week-clock.ts / bus.ts / pure modules only - NEVER app.ts or a screen.
// The one change from the app.ts original: pullFromSupabase asks for a redraw with
// bus.requestRender() where app.ts called render() (same function, registered at boot).

import { state, loadLogs, writeLogs, PULL_LIMIT } from './state.js';
import { requestRender } from './bus.js';
import { planForLog, completionClosingSessionIds } from './week-clock.js';
import { legacyCardioMarker } from './cardio-notes.js';
import { workoutHasWallSit } from './hold-sets.js';
import type { AnyWorkoutId } from './program.js';
import type { LogEntry } from './types.js';

export const SUPABASE_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaXl2bmZob3Fubm5vdHJtd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzIwNDEsImV4cCI6MjA4ODA0ODA0MX0.AsGhYitkSnyVMwpJII05UseS_gICaXiCy7d8iHsr6Qw';

export function supabaseHeaders(): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

export function syncDisabled(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

function markLogSynced(id: string): void {
  const logs = loadLogs();
  const idx = logs.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const entry = logs[idx];
  if (!entry) return;
  logs[idx] = { ...entry, synced: true };
  writeLogs(logs);
}

// The nine columns added in v48 (migrations/2026-09-24-v48-session-columns.sql).
const V48_SESSION_COLUMNS = [
  'cardio_lane',
  'cardio_minutes',
  'elliptical_level',
  'elliptical_km',
  'elliptical_pulse',
  'session_note',
  'lite_day',
  'arm_feel',
  'voice_plays',
] as const;

// The two columns added in v49 (migrations/2026-09-25-v49-elliptical-time-kcal.sql).
const V49_SESSION_COLUMNS = ['elliptical_time_sec', 'elliptical_kcal'] as const;

// The two columns added for the progression engine, shadow mode
// (migrations/2026-09-25-v49-progression-engine.sql).
const V49_ENGINE_SESSION_COLUMNS = ['wrist_pain_0_10', 'step_feel'] as const;

// The two columns added in v51 for the pre-log Back & wrist reading
// (migrations/2026-09-25-v51-back-wrist-before.sql).
const V51_BACK_WRIST_BEFORE_SESSION_COLUMNS = ['back_pain_before', 'wrist_pain_before'] as const;

// The one column added in v50 for the jump list
// (migrations/2026-09-25-v50-jump-list-steps-skipped.sql).
const V50_SESSION_COLUMNS = ['steps_skipped'] as const;

// The two columns added in v50 for mood (migrations/2026-09-25-v50-mood.sql).
const V50_MOOD_SESSION_COLUMNS = ['mood_before', 'mood_after'] as const;

// The one column added in v58 for Easy/Right/Hard on every stepped move
// (migrations/2026-09-28-v58-move-feel.sql). Applied live (her go 09:52,
// Sep 28 2026) — kept as its own strip group anyway, same reasoning as every
// other V-group here: a mirror/branch that hasn't run the migration yet
// still saves cleanly, just without this one column.
const V58_MOVE_FEEL_SESSION_COLUMNS = ['move_feel'] as const;

// The five columns added in T1 for her start/finish "Right?" + breaks
// (migrations/2026-09-27-v53-timing.sql). APPLIED Sep 27 2026 (her 10:49
// yes) — kept as its own strip group anyway (T1 fix r1, checker's should
// #6) so a build that's somehow still ahead of an older mirror/branch of
// the schema keeps landing safely: the PGRST204 retry below strips it and
// the session still saves, nothing lost.
// T2 (Sep 27 2026) §3.4: "Old rows show no length. Sessions says it once, at
// the top." Same applied date as the migration just below (her 10:49 yes) —
// one label, not two dates that could quietly drift apart.
export const TIMING_LAUNCH_LABEL = 'Sep 27 2026';

const V53_TIMING_SESSION_COLUMNS = [
  'her_start_at',
  'her_start_confirmed',
  'her_end_at',
  'her_end_confirmed',
  'break_minutes',
] as const;

// The workout_sessions row for a saved entry — pure, so it's testable without a
// network (v48, Sep 24 2026). Every structured number has its own column now;
// `notes` carries only system annotations.
export function sessionPayload(entry: LogEntry): Record<string, unknown> {
  // WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.6 "Saved-session plan": before the
  // launch, unchanged (the swing fix, Sep 26 2026 — the plan follows the week
  // it COUNTS toward, via planDateForLog in program-week.ts). At/ after it,
  // planForLog resolves through the completion model's own weekOf map instead
  // (see planForLog's own comment, next to planDateForLog there).
  const hasWallSit = workoutHasWallSit(planForLog(entry));
  return {
    id: entry.id,
    date: entry.date,
    workout_type: entry.workout,
    capacity_before_1_10: entry.capacityBefore,
    capacity_after_1_10: entry.capacityAfter,
    mood_before: entry.moodBefore ?? null,
    mood_after: entry.moodAfter ?? null,
    wall_sit_seconds: hasWallSit ? entry.wallSitSec : null,
    pain_back_0_10: entry.backPain,
    wrist_pain_0_10: entry.wristPain,
    // v51: the pre-log BEFORE half of the same reading.
    back_pain_before: entry.backPainBefore ?? null,
    wrist_pain_before: entry.wristPainBefore ?? null,
    step_feel: entry.stepFeel,
    one_word: entry.word || null,
    started_at: entry.startedAt ?? null,
    completed_at: entry.completedAt ?? null,
    duration_seconds: entry.durationSec ?? null,
    walk_minutes: entry.walkMinutes ?? null,
    walk_steps: entry.walkSteps ?? null,
    walk_meters: entry.walkMeters ?? null,
    notes: entry.notes ?? null,
    cardio_lane: entry.cardioLane ?? null,
    cardio_minutes: entry.cardioMinutes ?? null,
    elliptical_level: entry.ellipticalLevel ?? null,
    elliptical_km: entry.ellipticalKm ?? null,
    elliptical_pulse: entry.ellipticalPulse ?? null,
    elliptical_time_sec: entry.ellipticalTimeSec ?? null,
    elliptical_kcal: entry.ellipticalKcal ?? null,
    session_note: entry.sessionNote ?? null,
    lite_day: entry.liteDay ?? null,
    // v55 fix r3 (Sep 28 2026): entry.armFeel may carry the "@1kg"/"@2kg"
    // LOAD CHIP suffix — sent AS-IS now. fix r2's stripArmFeelLoad (deleted
    // this pass) worked around a live CHECK that 400'd on the suffix, but
    // that also meant mergeRemoteSessions overwrote the local row with the
    // server's load-less copy on the very next sync (fix r3's must). She
    // said go on the schema change instead (migrations/2026-09-28-v55-arm-
    // feel-load.sql, applied live) — the suffix is additive to the CHECK, so
    // a pre-v55 row with none still passes.
    arm_feel: entry.armFeel ?? null,
    // v58 (Sep 28 2026): plain passthrough, same as arm_feel above — the
    // slug/qty shape is already the wire shape (move-feel.ts's moveFeelString).
    move_feel: entry.moveFeel ?? null,
    voice_plays: entry.voicePlays ?? null,
    steps_skipped: entry.stepsSkipped ?? null,
    // T1 (Sep 27 2026), §3: her own start/finish answers — see LogEntry's
    // own comment on these five fields for the confirmed-vs-present rule.
    her_start_at: entry.herStartAt ?? null,
    her_start_confirmed: entry.herStartConfirmed ?? null,
    her_end_at: entry.herEndAt ?? null,
    her_end_confirmed: entry.herEndConfirmed ?? null,
    break_minutes: entry.breakMinutes ?? null,
  };
}

// The v47-shaped row, for a server that doesn't have the v48 columns yet
// (PostgREST 400 PGRST204). Nothing is lost: the lane marker and her note go
// back into `notes` the way v47 wrote them, and the indoor minutes back into
// walk_minutes — so a sync is never dropped for being ahead of the schema.
export function legacySessionPayload(entry: LogEntry): Record<string, unknown> {
  const payload = sessionPayload(entry);
  for (const col of V48_SESSION_COLUMNS) delete payload[col];
  for (const col of V49_SESSION_COLUMNS) delete payload[col];
  for (const col of V49_ENGINE_SESSION_COLUMNS) delete payload[col];
  for (const col of V50_SESSION_COLUMNS) delete payload[col];
  for (const col of V50_MOOD_SESSION_COLUMNS) delete payload[col];
  for (const col of V51_BACK_WRIST_BEFORE_SESSION_COLUMNS) delete payload[col];
  for (const col of V53_TIMING_SESSION_COLUMNS) delete payload[col];
  for (const col of V58_MOVE_FEEL_SESSION_COLUMNS) delete payload[col];
  const noteParts = [legacyCardioMarker(entry), entry.sessionNote, entry.notes].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== ''
  );
  payload['notes'] = noteParts.length > 0 ? noteParts.join(' · ') : null;
  if (entry.cardioLane === 'elliptical' || entry.cardioLane === 'apartment') {
    payload['walk_minutes'] = entry.walkMinutes ?? entry.cardioMinutes ?? null;
  }
  return payload;
}

// T1 fix r1 (Sep 27 2026, checker's must #2): the middle tier between
// sessionPayload and legacySessionPayload — strips ONLY the T1 timing
// columns. A server that has run every migration up to v51 but not yet v53
// (the state most of today's rows describe, per the migration file's own
// "her yes first" note) keeps mood_before, wrist_pain_0_10, the ride numbers
// and everything else; legacySessionPayload used to be the ONLY retry and
// wiped ALL of that too on one unknown column, which the missing PGRST204
// test below would have caught.
export function timingStrippedSessionPayload(entry: LogEntry): Record<string, unknown> {
  const payload = sessionPayload(entry);
  for (const col of V53_TIMING_SESSION_COLUMNS) delete payload[col];
  return payload;
}

async function postSession(payload: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/workout_sessions`, {
    method: 'POST',
    // v45: ignore-duplicates — if an earlier push already landed (the reply
    // was lost), the retry is a no-op success instead of a 409 forever.
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify([payload]),
  });
}

// T1 fix r1 (Sep 27 2026, checker's must #2): the tiered retry itself,
// factored out of pushLogToSupabase and taking `post` so a test can drive it
// with faked responses instead of a real network call — real sync stays off
// under automation everywhere else (syncDisabled, checked by the caller
// below, never by this function). Three tiers, each one PGRST204 further
// than the last: full row -> drop only the v53 timing columns -> the full
// v47-shaped legacy row. A save is never dropped for being ahead of ANY
// subset of the schema, and it only falls back as far as it has to.
export async function pushSessionTiered(
  entry: LogEntry,
  post: (payload: Record<string, unknown>) => Promise<Response> = postSession
): Promise<boolean> {
  if (!entry.id) return false;
  try {
    let res = await post(sessionPayload(entry));
    if (res.status === 400) {
      const body = await res.text().catch(() => '');
      if (!body.includes('PGRST204')) {
        console.warn('[sync] push failed:', res.status, body);
        return false;
      }
      // The v53 timing columns are missing on the server — try dropping
      // JUST those five before giving up every other group too.
      console.warn(
        '[sync] v53 timing columns missing on the server — retrying without them:',
        body
      );
      res = await post(timingStrippedSessionPayload(entry));
      if (res.status === 400) {
        const body2 = await res.text().catch(() => '');
        if (!body2.includes('PGRST204')) {
          console.warn('[sync] push failed (timing-stripped retry):', res.status, body2);
          return false;
        }
        // Still missing columns beyond the v53 group — fall all the way
        // back to the v47 shape (v48: the phone is ahead of the schema).
        console.warn(
          '[sync] more columns missing on the server — retrying with the legacy row:',
          body2
        );
        res = await post(legacySessionPayload(entry));
      }
    }
    if (res.ok) {
      markLogSynced(entry.id);
      return true;
    }
    console.warn('[sync] push failed:', res.status, await res.text().catch(() => ''));
    return false;
  } catch (err) {
    console.warn('[sync] push threw:', err);
    return false;
  }
}

export async function pushLogToSupabase(entry: LogEntry): Promise<boolean> {
  if (syncDisabled()) return false;
  return pushSessionTiered(entry);
}

function markLogEdited(id: string): void {
  const logs = loadLogs();
  const idx = logs.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const entry = logs[idx];
  if (!entry) return;
  logs[idx] = { ...entry, synced: true, pendingEdit: false };
  writeLogs(logs);
}

// v53 fix (CHECK M3, Sep 26 2026): the ONLY columns the edit screen ever
// shows or changes (renderHistoryEdit's own copy: "Only these numbers and
// the note change — nothing else about this session"). An earlier version
// built the PATCH body from the full sessionPayload minus id, which silently
// carried date/workout_type/every other column from the PHONE'S copy — a
// server-side hand fix to any of those would get overwritten by a stale edit
// sync. Explicit allow-list, never derived from the full payload.
const EDIT_SESSION_PATCH_COLUMNS = [
  'elliptical_time_sec',
  'elliptical_km',
  'elliptical_kcal',
  'elliptical_level',
  'elliptical_pulse',
  'session_note',
] as const;

// Pure — the PATCH request for an EDITED session (pendingEdit rows): the row
// already exists in Supabase (it synced once already), so the id goes in the
// URL filter, never the body, and never another POST — postSession's
// ignore-duplicates would just no-op against an id the server already has and
// her fix would silently never land. The legacy (v47-shaped server) case has
// no ride-number columns at all — legacySessionPayload folds them into
// `notes`, so that's the one column the legacy PATCH body carries. Pure, so
// it's testable without a network — see __wtPatchSessionRequest.
export function patchSessionRequest(
  entry: LogEntry,
  legacy = false
): { url: string; body: Record<string, unknown> } {
  const full = legacy ? legacySessionPayload(entry) : sessionPayload(entry);
  const body: Record<string, unknown> = legacy
    ? { notes: full['notes'] }
    : Object.fromEntries(EDIT_SESSION_PATCH_COLUMNS.map((col) => [col, full[col]]));
  return {
    url: `${SUPABASE_URL}/rest/v1/workout_sessions?id=eq.${encodeURIComponent(entry.id ?? '')}`,
    body,
  };
}

// Pure — CHECK M2's fix, isolated so it's testable without a network. With
// `Prefer: return=representation`, PostgREST hands back the rows the filter
// actually matched: a real update is a non-empty array, and 0 matches (a
// deleted row, a stale/wrong id, RLS) comes back `[]` — same 200/204 `res.ok`
// either way, so the row COUNT, not the HTTP status, is the only honest
// signal that something actually landed.
export function patchMatchedARow(rows: unknown): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

async function patchSession(entry: LogEntry, legacy = false): Promise<Response> {
  const { url, body } = patchSessionRequest(entry, legacy);
  return fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      // v53 fix (CHECK M2, Sep 26 2026): return=minimal gave a bare 204 on
      // EVERY PATCH, including one that matched 0 rows (deleted server-side,
      // wrong/stale id) — `res.ok` read that as success and the row got
      // marked synced with the edit never actually landed. representation
      // makes PostgREST hand back the matched rows (an empty array on 0
      // matches), so patchLogToSupabase below can tell the difference.
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
}

// v53 (Sep 26 2026) — her words: "I don't know how to update this
// information... there have to be an easy way to enter the data." Same
// fail-loud + legacy-schema-retry shape as pushLogToSupabase, PATCH instead
// of POST (see patchSessionRequest above for why).
export async function patchLogToSupabase(entry: LogEntry): Promise<boolean> {
  if (syncDisabled()) return false;
  if (!entry.id) return false;
  try {
    let res = await patchSession(entry);
    if (res.status === 400) {
      const body = await res.text().catch(() => '');
      if (!body.includes('PGRST204')) {
        console.warn('[sync] edit push failed:', res.status, body);
        return false;
      }
      console.warn(
        '[sync] v48 columns missing on the server — retrying the edit with the legacy row:',
        body
      );
      res = await patchSession(entry, true);
    }
    if (res.ok) {
      // v53 fix (CHECK M2): a 200/204 with an empty array means the filter
      // matched NO row — that must never read as "saved". Leave the row
      // exactly as it is (still synced:false, pendingEdit:true from
      // saveHistoryEdit) so the next flush retries it instead of the edit
      // silently vanishing.
      const rows: unknown = await res.json().catch(() => null);
      if (patchMatchedARow(rows)) {
        markLogEdited(entry.id);
        return true;
      }
      console.warn('[sync] edit PATCH matched 0 rows — keeping it queued:', entry.id);
      return false;
    }
    console.warn('[sync] edit push failed:', res.status, await res.text().catch(() => ''));
    return false;
  } catch (err) {
    console.warn('[sync] edit push threw:', err);
    return false;
  }
}

type RemoteSession = {
  id: string;
  date: string;
  workout_type: AnyWorkoutId;
  capacity_before_1_10: number | null;
  capacity_after_1_10: number | null;
  wall_sit_seconds: number | null;
  pain_back_0_10: number | null;
  // v49 · engine (Sep 25 2026): optional — a server that hasn't run the
  // migration, or a pre-engine row, simply doesn't carry them.
  wrist_pain_0_10?: number | null;
  step_feel?: 'fine' | 'too_much' | null;
  // v51 (Sep 25 2026): optional — a server that hasn't run the migration, or
  // a pre-v51 row, simply doesn't carry them.
  back_pain_before?: number | null;
  wrist_pain_before?: number | null;
  // v50 · mood (Sep 25 2026): optional — a server that hasn't run the
  // migration, or a pre-v50 row, simply doesn't carry them.
  mood_before?: number | null;
  mood_after?: number | null;
  one_word: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  notes?: string | null;
  walk_minutes?: number | null;
  walk_steps?: number | null;
  walk_meters?: number | null;
  // v48 (Sep 24 2026): the nine new columns. Optional — a server that hasn't
  // run the migration, or an old row, simply doesn't carry them.
  cardio_lane?: 'walk' | 'apartment' | 'elliptical' | null;
  cardio_minutes?: number | null;
  elliptical_level?: number | null;
  // numeric(5,2) — PostgREST may hand it back as a string.
  elliptical_km?: number | string | null;
  elliptical_pulse?: number | null;
  // v49 (Sep 25 2026): calories + time off the machine. kcal is numeric(6,1) —
  // PostgREST may hand it back as a string, same as km.
  elliptical_time_sec?: number | null;
  elliptical_kcal?: number | string | null;
  session_note?: string | null;
  lite_day?: boolean | null;
  arm_feel?: string | null;
  // v58 (Sep 28 2026): optional — a server that hasn't run the migration, or
  // a pre-v58 row, simply doesn't carry it.
  move_feel?: string | null;
  voice_plays?: number | null;
  // v50 · jump list (Sep 25 2026): optional — a server that hasn't run the
  // migration, or a pre-v50 row, simply doesn't carry it.
  steps_skipped?: number | null;
  // T1 fix r1 (Sep 27 2026, checker's must #1): her own start/finish answers
  // — optional the same way as every other group above. Before this fix,
  // RemoteSession simply didn't declare these 5 columns, so the pull
  // (select=*) silently swapped a synced row for a remote-built LogEntry
  // with none of them — the phone forgot what she'd answered, the same bug
  // class v45 fixed for the cardio numbers. The migration IS applied (her
  // 10:49 yes, Sep 27 2026) — a pre-T1 row simply has no keys at all.
  her_start_at?: string | null;
  her_start_confirmed?: boolean | null;
  her_end_at?: string | null;
  her_end_confirmed?: boolean | null;
  break_minutes?: number | null;
};

// How many sessions a pull fetches (newest first) and the phone keeps. The
// merge below uses it to know whether the server's answer is the WHOLE history
// or just a window. v45: 50 → 200 — she had 39 rows and ~12 a month, so the
// phone's History was about a month from silently dropping her oldest weeks.

// Group 1E: id-keyed merge. Remote rows replace local-synced rows with the same
// id; a local-unsynced row never loses its write.
// v33 (Sep 11 2026): a row DELETED in Supabase must vanish from the phone too.
// Until now the pull only added and updated, so a row removed on the server
// (the false Thu-Sep-10 "B") stayed in her history forever. Rule: a local row
// the server once had (synced) that is missing from the fetched window is gone.
// Rows older than a full 50-row window are left alone (they may simply be past
// the window), and an empty server answer is never read as "delete everything".
export function mergeRemoteSessions(local: LogEntry[], remote: RemoteSession[]): LogEntry[] {
  const remoteIds = new Set(remote.map((r) => r.id));
  const windowIsEverything = remote.length < PULL_LIMIT;
  const oldestRemoteMs =
    remote.length > 0 ? Math.min(...remote.map((r) => new Date(r.date).getTime())) : NaN;
  // WK2 fix r2 (Sep 27 2026, checker's must #1 / GATE 1) — computed ONCE, off
  // `local` exactly as it stands before this merge touches it (the same
  // closed weeks she's already seen on Home). See completionClosingSessionIds'
  // own comment for why this exists instead of the schema change the plan's
  // GATE 1 actually asks for.
  const protectedClosingIds = completionClosingSessionIds(local);
  const byId = new Map<string, LogEntry>();
  for (const l of local) {
    if (!l.id) continue;
    if (l.synced && remote.length > 0 && !remoteIds.has(l.id)) {
      const insideWindow = windowIsEverything || new Date(l.date).getTime() >= oldestRemoteMs;
      if (insideWindow) {
        if (protectedClosingIds.has(l.id)) {
          // Refuse to silently drop it (CLAUDE.md fail-loud rule) — see
          // completionClosingSessionIds' own comment. Keep it, flagged, so a
          // real look decides what happened instead of the week model
          // quietly reopening and renumbering everything after it.
          console.error(
            `[week] refusing to drop session ${l.id} (${l.date}, Workout ${l.workout}) — ` +
              `it closed a completion-model week and the server no longer has it. ` +
              `Keeping it locally (PLAN-2026-09-26.md WK2 GATE 1).`
          );
          byId.set(l.id, { ...l, staleRemoteDelete: true });
        }
        continue; // either kept above (protected) or genuinely deleted on the server
      }
    }
    byId.set(l.id, l);
  }
  for (const r of remote) {
    const existing = byId.get(r.id);
    if (existing && !existing.synced) {
      // Local-unsynced wins on content. But the server having its id means an
      // earlier push DID land — mark it synced so it stops re-pushing (v45).
      // v53: an EDIT (pendingEdit) is different — the server already had this
      // id BEFORE the edit, so its presence here proves nothing about whether
      // the PATCH landed. Marking it synced here would drop the fix silently
      // (the flush would never retry it). Stay unsynced + pendingEdit until
      // patchLogToSupabase itself confirms the PATCH (markLogEdited).
      byId.set(r.id, existing.pendingEdit ? existing : { ...existing, synced: true });
      continue;
    }
    byId.set(r.id, {
      id: r.id,
      date: r.date,
      workout: r.workout_type,
      // v39: no `?? 0`. A missing reading stays missing and renders as "—".
      capacityBefore: r.capacity_before_1_10,
      // null stays null (v32): a missing after-reading is "—", not 0.
      capacityAfter: r.capacity_after_1_10 ?? null,
      // v50 · mood: round-trips the same way — a pre-v50 row has neither key.
      moodBefore: r.mood_before ?? null,
      moodAfter: r.mood_after ?? null,
      wallSitSec: r.wall_sit_seconds ?? 0,
      backPain: r.pain_back_0_10 ?? null,
      wristPain: r.wrist_pain_0_10 ?? null,
      // v51: round-trips the same way — a pre-v51 row has neither key.
      backPainBefore: r.back_pain_before ?? null,
      wristPainBefore: r.wrist_pain_before ?? null,
      stepFeel: r.step_feel === 'fine' || r.step_feel === 'too_much' ? r.step_feel : null,
      word: r.one_word ?? '',
      startedAt: r.started_at ?? undefined,
      completedAt: r.completed_at ?? undefined,
      durationSec: r.duration_seconds ?? undefined,
      notes: r.notes ?? null,
      // v45: the cardio numbers round-trip too — before this, every app open
      // rebuilt synced rows without them, so the phone forgot what Supabase held.
      walkMinutes: r.walk_minutes ?? null,
      walkSteps: r.walk_steps ?? null,
      walkMeters: r.walk_meters ?? null,
      // v48: the new columns round-trip the same way; null stays null.
      cardioLane: r.cardio_lane ?? null,
      cardioMinutes: r.cardio_minutes ?? null,
      ellipticalLevel: r.elliptical_level ?? null,
      ellipticalKm: r.elliptical_km == null ? null : Number(r.elliptical_km),
      ellipticalPulse: r.elliptical_pulse ?? null,
      // v49: round-trips the same way — null stays null.
      ellipticalTimeSec: r.elliptical_time_sec ?? null,
      ellipticalKcal: r.elliptical_kcal == null ? null : Number(r.elliptical_kcal),
      sessionNote: r.session_note ?? null,
      liteDay: r.lite_day ?? null,
      // v55 fix r3 (Sep 28 2026, checker's must): plain passthrough, but this
      // USED to be the bug — sessionPayload stripped the "@1kg"/"@2kg" LOAD
      // CHIP suffix before send (fix r2's stripArmFeelLoad, since deleted),
      // so r.arm_feel never had it, and this merge silently overwrote the
      // phone's own local suffix with the server's load-less copy on every
      // pull. Now that the suffix reaches Supabase as-is (the CHECK was
      // widened, see sessionPayload's comment), it comes back the same way —
      // no code change needed here, just the note for the next person who
      // wonders why this looked fine already.
      armFeel: r.arm_feel ?? null,
      // v58: round-trips the same way — null stays null, a pre-v58 row (no
      // key at all) merges as null, never invented.
      moveFeel: r.move_feel ?? null,
      voicePlays: r.voice_plays ?? null,
      stepsSkipped: r.steps_skipped ?? null,
      // T1 fix r1 (Sep 27 2026, checker's must #1): round-trips the same way
      // as every other v50/v51 group — null stays null, a pre-T1 row (no
      // keys at all) merges as null, never invented. break_minutes is only
      // ever 0/5/15/30 (the migration's own CHECK) — anything else merges
      // as null rather than trusting a value the schema itself would reject.
      herStartAt: r.her_start_at ?? null,
      herStartConfirmed: r.her_start_confirmed ?? null,
      herEndAt: r.her_end_at ?? null,
      herEndConfirmed: r.her_end_confirmed ?? null,
      breakMinutes:
        r.break_minutes === 0 ||
        r.break_minutes === 5 ||
        r.break_minutes === 15 ||
        r.break_minutes === 30
          ? r.break_minutes
          : null,
      synced: true,
    });
  }
  return Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export async function pullFromSupabase(): Promise<void> {
  if (syncDisabled()) return;
  try {
    const sRes = await fetch(
      `${SUPABASE_URL}/rest/v1/workout_sessions?select=*&order=date.desc&limit=${PULL_LIMIT}`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      }
    );
    if (sRes.ok && sRes.headers.get('X-SW-Cache') === '1') {
      // v45: offline — the service worker answered from its cache. The phone's
      // own list is at least as fresh as that copy, so don't merge (the v33
      // delete rule would drop anything synced after the cache was taken).
    } else if (sRes.ok) {
      const remote: RemoteSession[] = await sRes.json();
      writeLogs(mergeRemoteSessions(loadLogs(), remote));
    } else {
      console.warn('[sync] pull sessions failed:', sRes.status);
    }
    if (state.screen === 'home') requestRender();
  } catch (err) {
    console.warn('[sync] pull threw:', err);
  }
}
