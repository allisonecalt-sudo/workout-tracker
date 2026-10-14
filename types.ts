// types.ts — the shared data shapes the app's modules pass around (code-shape
// step 4a, Oct 13 2026).
//
// WHAT: LogEntry (one saved workout session, as the app holds it) and
// StoredWeekMove (a "Move on without it" row in the synced week_moves table).
// WHY: they lived in app.ts, so any module that wanted to talk about a log
// (program-week.ts, the week clock glue) would have had to import app.ts back
// — a cycle. Types only, no values, no DOM, no storage. Moved verbatim.
// NEXT: later steps (state.ts, screens/*) import these from here too.

import type { AnyWorkoutId } from './program.js';
import type { CyclePeriod } from './cycle.js';

export type LogEntry = {
  id?: string;
  date: string;
  workout: AnyWorkoutId;
  // null = never recorded. BEFORE-capacity goes nullable in v39: the sync used
  // to coerce a missing reading to 0 with `?? 0`, which rendered historical rows
  // as "cap 0 → 0" — and 0 is not a value this slider can produce (its range is
  // 1-10), so it was a hole wearing a number. Named in the May-14 audit, fixed
  // Sep 14 2026 on her word ("ok so fix it").
  capacityBefore: number | null;
  // null = never recorded (v32, Sep 11 2026): a workout logged after the fact
  // from a left-open snapshot has no post-log, so after-capacity and back pain
  // are unknown — shown as "—", never invented as 5/0.
  capacityAfter: number | null;
  // v50 · mood (Sep 25 2026): a second 1-10 reading, separate from capacity on
  // purpose — "your BODY, not your mood" stays true for capacity; this is the
  // mood question itself. Optional AND nullable, same shape as wristPain: a
  // session logged before v50 has no key at all, and null = not answered.
  moodBefore?: number | null;
  moodAfter?: number | null;
  wallSitSec: number;
  backPain: number | null;
  // v49 · engine (Sep 25 2026): the wrist half of the combined "Back & wrist:
  // Fine · Back · Wrist" tap the progression engine needs (PROGRESSION-ENGINE-
  // SPEC-2026-09-24.md §10) — same null-means-not-answered shape as backPain.
  // Optional (not just nullable): a session logged before v49 has no key at
  // all for either field, same as the other engine-era additions below.
  wristPain?: number | null;
  // v51 (Sep 25 2026): the SAME Back & wrist control, asked pre-log instead of
  // post-log. Her words: "and all metrics bf workout have after as well" —
  // body and mood already had before + after; back/wrist only had after.
  // Optional AND nullable, same shape as wristPain: a session logged before
  // v51 has no key at all, and null = not answered.
  backPainBefore?: number | null;
  wristPainBefore?: number | null;
  // The one-tap read on a brand-new rung's first sessions: 'fine' | 'too_much'.
  // null/absent = not asked this session (most sessions — no rung changed recently).
  stepFeel?: 'fine' | 'too_much' | null;
  word: string;
  startedAt?: string;
  completedAt?: string;
  durationSec?: number;
  // In-workout walk numbers (v13, Jul 4 — her idea): the Outdoor-walk step's
  // auto-tracked minutes/steps/meters, saved WITH the session.
  walkMinutes?: number | null;
  walkSteps?: number | null;
  walkMeters?: number | null;
  // System annotations only from v48 ("duration not recorded — left open…").
  // Until v47 it also carried the cardio-lane marker ("cardio: elliptical 10 min
  // · level 7 …") and her note; older rows still do, and are read back by regex.
  notes?: string | null;
  // v48 (Sep 24 2026): real columns instead of prose in `notes` — the numbers she
  // copies off the machine come back to her as numbers (her words: "make it
  // measurable whatever you say I'm gonna copy it"). All optional: a row saved
  // before v48, or an old export, simply has none of them.
  cardioLane?: 'walk' | 'apartment' | 'elliptical' | null;
  cardioMinutes?: number | null;
  ellipticalLevel?: number | null;
  ellipticalKm?: number | null;
  ellipticalPulse?: number | null;
  // v49 (Sep 25 2026): the two more the machine shows — her ask "every time
  // put in" (calories, time). Time is typed from the console but prefilled
  // from the app's own timer when it ran, so a normal ride needs no typing.
  ellipticalTimeSec?: number | null;
  ellipticalKcal?: number | null;
  // Her free-text post-log line, verbatim — never glued to a machine marker.
  sessionNote?: string | null;
  liteDay?: boolean | null;
  // "curl=easy;row=right" — the one-tap Easy/Right/Hard on the 1 kg moves (P5).
  armFeel?: string | null;
  // v58 (Sep 28 2026) — "splitsquat=right;wallsit=easy@45s;ride=right@12min":
  // the SAME one-tap Easy/Right/Hard, generalized to every move that STEPPED
  // this week (reps/seconds/minutes up, or a new variant), never the curl/
  // row pair — those keep arm_feel above, unmigrated (her spec item 1). See
  // move-feel.ts for the slug/qty shape and migrations/2026-09-28-v58-move-
  // feel.sql for the CHECK it round-trips through.
  moveFeel?: string | null;
  // How many voice notes she started this session. Her words: "I can hear
  // details in audio better"; Gemini said she never plays them — count, don't guess.
  voicePlays?: number | null;
  // v50 · jump list (Sep 25 2026): how many warm-up/main/upper-back moves were
  // never marked done when this session saved — null on any session from
  // before the jump list existed (nothing was tracked to skip), 0 on a v50
  // session where everything got a Done tap. No verdict, just the count.
  stepsSkipped?: number | null;
  // T1 (Sep 27 2026), PLAN-2026-09-26.md §3: her OWN start/finish answers —
  // the "two tiers of time" (timing.ts). NEVER the app's own tap time
  // (started_at/completed_at/durationSec above stay exactly what they were,
  // kept for checking only). Optional AND nullable, same shape as the v51
  // before/after fields: a session logged before T1 has no key at all.
  // Confirmed can be true with a value she never touched — beginExercises()/
  // saveCompletedSession() finalize the untouched case at false (her own
  // "Untouched at Start" rule, §3.1) — so `Confirmed` is the only signal
  // she actually said yes; timing.ts's trainingMinutes() reads it, not just
  // whether a timestamp exists.
  herStartAt?: string | null;
  herStartConfirmed?: boolean | null;
  herEndAt?: string | null;
  herEndConfirmed?: boolean | null;
  // 0/5/15/30, matching the migration's CHECK. null = untouched (unknown),
  // never 0 — "None" is an explicit tap, not the default (§3.2).
  breakMinutes?: number | null;
  // v53 (Sep 26 2026): this row's ride numbers were fixed AFTER it already
  // synced (renderHistoryEdit/saveHistoryEdit) — the server already has this
  // id, so the queued write is a PATCH, never another POST (postSession's
  // ignore-duplicates would just no-op against an id it already has and the
  // fix would silently never reach Supabase). Cleared back to false the
  // moment the PATCH lands (markLogEdited). Undefined/false on every session
  // that was never edited after the fact.
  pendingEdit?: boolean;
  synced?: boolean;
  // WK2 fix r2 (Sep 27 2026, checker's must #1 / GATE 1): true when a pull
  // said the server no longer has this row, but it's the CLOSING session of
  // an already-closed completion-model week (see mergeRemoteSessions and
  // completionClosingSessionIds's own comments) — kept locally on purpose
  // rather than silently dropped, so the week model never reopens +
  // renumbers under her without anyone deciding that on purpose. Never sent
  // to Supabase; a local-only flag for a human (her, or Claude) to notice
  // and resolve deliberately.
  staleRemoteDelete?: boolean;
};

// `missing` is kept as the plain letters string ("B" / "BC", §2.2's own
// `CHECK (missing ~ '^[ABC]{1,2}$')`) — it's never read back INTO the week
// model (movesForWeekModel only needs round/week/at), only used to render
// the moved-note's "closed at N of 3" without re-deriving it from a span
// that may no longer exist by the time she reads the note.
export type StoredWeekMove = {
  round: number;
  week: number;
  at: string;
  missing: string;
  synced?: boolean;
  // WK3 fix r1 (checker must #1, Sep 27 2026): Undo tombstone. `undoWeekMove`
  // used to just filter the row out of local storage and fire a DELETE whose
  // result nobody checked — a still-in-flight push, or a DELETE that failed
  // or never even fires (offline, or syncDisabled() under automation), let
  // the NEXT pull merge the remote row straight back in as synced:true, and
  // the week moved on again with no tap of hers, silently. A tombstone
  // (deleted:true, synced:false) is a normal pending-write instead: it
  // outranks a remote pull the same way any other unsynced row already does
  // (mergeWeekMoves), it's excluded from movesForWeekModel()/todaysWeekMove()
  // immediately, and flushPendingSyncs retries the real DELETE until
  // Supabase confirms it — only then is the tombstone itself dropped.
  deleted?: boolean;
};

// code-shape step 9b (Oct 14 2026): the two stored shapes the sync modules and app.ts share, moved verbatim.
export type WalkEntry = {
  id: string; // local id only; the DB row generates its own uuid
  date: string; // ISO datetime
  minutes?: number | null; // from the start/stop timer (Jul 4); null = logged without timing
  meters?: number | null; // GPS distance (outdoor, screen-on — her call Jul 4); null = no usable fix
  steps?: number | null; // motion-sensor step estimate (works indoors, phone on her)
  synced?: boolean;
};

export type StoredCyclePeriod = CyclePeriod & { synced?: boolean };

// ---- moved verbatim from app.ts (code-shape step 10a): the shapes `ui` holds ----

export type TimerKind = 'pre-countdown' | 'rest' | 'timed-exercise';

export type TimerHandle = {
  kind: TimerKind;
  endsAt: number;
  onComplete: () => void;
  lastSecRendered: number;
};

export type WorkoutWalkResult = {
  minutes: number;
  // The walk's clock window (epoch ms), so we can ask Google Fit how many steps
  // fell inside it — the accurate count, even if the screen was off (v16, Jul 9).
  startMs?: number;
  endMs?: number;
};

export type HistoryEditDraft = {
  timeStr: string;
  kmStr: string;
  kcalStr: string;
  level: number | null;
  pulseStr: string;
  note: string;
};
