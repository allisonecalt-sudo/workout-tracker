// progression.ts — the progression engine's LOGIC (Sep 25 2026)
//
// WHAT: pure decision-making for "what does next week's program look like".
// No DOM, no fetch — everything it needs comes in as plain data, and
// everything it produces is plain data. app.ts (or a test) does the reading
// from Supabase and the writing back to `progression_steps`.
//
// WHY pure: PROGRESSION-ENGINE-SPEC-2026-09-24.md §7 — "progression.ts: pure
// logic, no DOM, no fetch" — so `decideWeek` and `composeWeekPlan` can be
// exercised by the heavy unit-test suite (§12) without a browser, a clock hack,
// or a live Supabase table.
//
// REPLAY, NOT RECOMPUTE (spec §7, §11): a week's decision, once taken, is
// stored (as a `progression_steps` row in the real app; as a `WeekDecision` in
// tests). Every later week folds forward from the STORED decisions
// (`foldDecisions`), not by re-deriving from raw session history + the current
// LADDERS data — so editing ladders.ts later can never quietly rewrite a week
// that already happened.

import {
  LADDERS,
  LADDERS_BY_LANE,
  START_STATE,
  START_LANE_QUEUE,
  ENGINE_VERSION,
  getLadder,
  sidePlankHasStarted,
  type Ladder,
  type LadderState,
  type Lane,
  type Letter,
  type Rung,
  type RungKind,
  type Clearance,
  type Exercise,
  type Workout,
  type WeekPlan,
  type Block,
} from './ladders.js';

export type WorkoutId = Letter;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One saved session, reduced to only what the engine needs to see. */
export type SessionSignal = {
  date: string; // ISO date
  workout: WorkoutId;
  liteDay: boolean;
  /** The exercise name she stopped before, or null if she finished (or the field wasn't recorded). */
  stoppedEarlyAt: string | null;
  /** null = not answered. 0 = Fine. Never treat null as 0 (spec §9 readiness floor). */
  backPain: number | null;
  wristPain: number | null;
  /** v51 · back & wrist BEFORE (Sep 25 2026): the same pre-log reading as
   *  backPain/wristPain, taken before the workout instead of after. The
   *  engine's safety gates keep reading the post-workout value the same way
   *  they always did (findFlare below) — this is an ADDITIONAL signal: a
   *  before-reading of 3+ on its own also counts as that session's flare,
   *  even when the after-reading came back 0/null (spec follow-up, her
   *  words: "and all metrics bf workout have after as well"). */
  backPainBefore: number | null;
  wristPainBefore: number | null;
  stepFeel: 'fine' | 'too_much' | null;
  /** "curl=easy;row=right" (v48 shape) — only read for the rowcurl ladder's V-rule. */
  armFeel: string | null;
  wallSitSec: number | null;
  /** Minutes actually ridden this session, however she logged it (elliptical_time_sec ?? cardio_minutes). */
  cardioMinutes: number | null;
  durationSec: number | null; // measured session length; null/undefined/>90min excluded from the length gate
};

export type WeekHistory = {
  weekStart: string; // Sat ISO, e.g. '2026-09-26'
  sessions: SessionSignal[]; // chronological
};

/** One step/nudge/revert edit inside a WeekDecision. */
export type LadderEdit = {
  ladderId: string;
  from: number;
  to: number;
  reason: string;
  receipt: string;
};

export type WeekMode = 'STEP' | 'HOLD' | 'STEP_BACK' | 'WELCOME_BACK' | 'RESTART';

export type WeekDecision = {
  weekStart: string;
  mode: WeekMode;
  lane: Lane;
  step?: LadderEdit;
  nudge?: LadderEdit;
  reverts: LadderEdit[];
  lisaQuestions: string[];
  gapNotes: string[];
  laneQueue: Lane[]; // the queue AFTER this week (for the next call)
  round: number; // the round number AFTER this week
  askLisaLine: boolean; // true on a back-3+ STEP_BACK (spec §5 "ask whether you want to tell Lisa")
  /** Which safety signal triggered a STEP_BACK — undefined for every other mode.
   *  Sep 25 2026 (engine fix): needed so a later week can tell WHY a lane is
   *  resting (findRevertCandidate's lane list alone can't distinguish a back
   *  revert from a wrist one once folded into plain ladder state). */
  stepBackReason?: 'back' | 'wrist' | 'heaviness';
};

export type DecideWeekInput = {
  weekStart: string;
  /** Chronological, ending at the week immediately before `weekStart`. */
  priorWeeks: WeekHistory[];
  /** Every previously-applied (status='live') decision, chronological. Replayed, never recomputed. */
  priorDecisions: WeekDecision[];
  clearances: Clearance[];
  /** Her answer to spec Q2. Default 45 (her go). */
  sessionLengthBrakeMin?: number;
};

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / MS_PER_DAY
  );
}

function weeksBetween(a: string, b: string): number {
  return daysBetween(a, b) / 7;
}

/** Replays every stored decision from START_STATE — never recomputed from raw history. */
export function foldDecisions(decisions: WeekDecision[]): {
  state: Record<string, LadderState>;
  laneQueue: Lane[];
  round: number;
} {
  let state: Record<string, LadderState> = Object.fromEntries(
    Object.entries(START_STATE).map(([k, v]) => [k, { ...v }])
  );
  let laneQueue = [...START_LANE_QUEUE];
  let round = 2; // she's mid Round 2 at engine cutover (spec §11)
  for (const d of decisions) {
    state = applyDecisionToState(state, d);
    laneQueue = d.laneQueue;
    round = d.round;
  }
  return { state, laneQueue, round };
}

function applyDecisionToState(
  state: Record<string, LadderState>,
  d: WeekDecision
): Record<string, LadderState> {
  const next: Record<string, LadderState> = Object.fromEntries(
    Object.entries(state).map(([k, v]) => [k, { ...v }])
  );
  const edits: LadderEdit[] = [...d.reverts];
  if (d.step) edits.push(d.step);
  if (d.nudge) edits.push(d.nudge);
  for (const e of edits) {
    const prevHerAsk = next[e.ladderId]?.herAsk ?? false;
    next[e.ladderId] = {
      rung: e.to,
      changedWeek: d.weekStart,
      // her-ask is consumed the moment THIS ladder is the one that stepped
      // (spec §9: "Her-ask priority is used up once that ladder steps");
      // a revert (not a chosen step) leaves it untouched.
      herAsk: d.step?.ladderId === e.ladderId ? false : prevHerAsk,
    };
  }
  if (d.mode === 'RESTART') {
    // ~80%, rounded to the nearest lower rung (ESTIMATE — the spec calls the
    // exact rounding a coaching estimate, not a formula). Approximated here as
    // "back one rung, floor 0" for every ladder, which is testable and never
    // ever raises a rung during a RESTART week.
    for (const id of Object.keys(next)) {
      next[id] = { ...next[id]!, rung: Math.max(0, next[id]!.rung - 1) };
    }
  }
  return next;
}

function ladderCurrentRung(
  ladder: Ladder,
  state: Record<string, LadderState>
): { st: LadderState; rung: Rung } {
  const st = state[ladder.id] ?? { rung: 0, changedWeek: null, herAsk: false };
  return { st, rung: ladder.rungs[st.rung] };
}

function laneOf(ladderId: string): Lane {
  return getLadder(ladderId).lane;
}

/** Which workout letters a rung's own exposures should be read from. */
function lettersOf(rung: Rung): Letter[] {
  return Object.keys(rung.slots) as Letter[];
}

// CARDIO ladders carry no slots (display-only) — hardcode which letters' ride
// minutes each one governs (spec §4: "A/B ride" vs "C ride").
const CARDIO_LETTERS: Record<string, Letter[]> = {
  CARDIO_AB: ['A', 'B'],
  CARDIO_C: ['C'],
};

function wallSitTargetOf(rung: Rung): number {
  for (const items of Object.values(rung.slots)) {
    for (const ex of items ?? []) {
      if (ex.name === 'Wall sit' && typeof ex.durationSec === 'number') return ex.durationSec;
    }
  }
  return 0;
}

function isCleanSession(s: SessionSignal, ladderId: string, rung: Rung): boolean {
  if (s.liteDay) return false;
  if (s.stoppedEarlyAt !== null) return false;
  if (s.backPain === null || s.backPain !== 0) return false; // null never counts as Fine
  if (s.wristPain === null || s.wristPain !== 0) return false;
  if (ladderId === 'wallsit') {
    const target = wallSitTargetOf(rung);
    if (target > 0 && (s.wallSitSec === null || s.wallSitSec < target)) return false;
  }
  return true;
}

function positiveFeel(s: SessionSignal, ladderId: string): boolean {
  if (s.stepFeel === 'fine') return true;
  if (ladderId === 'rowcurl' && s.armFeel && /easy/.test(s.armFeel)) return true;
  return false;
}

function exposuresSince(
  ladderId: string,
  rung: Rung,
  changedWeek: string | null,
  weeks: WeekHistory[]
): SessionSignal[] {
  const letters = ladderId in CARDIO_LETTERS ? CARDIO_LETTERS[ladderId]! : lettersOf(rung);
  if (letters.length === 0) return [];
  const out: SessionSignal[] = [];
  for (const w of weeks) {
    if (changedWeek && w.weekStart < changedWeek) continue;
    for (const s of w.sessions) {
      if (letters.includes(s.workout)) out.push(s);
    }
  }
  return out;
}

/** §9 readiness table: is the ladder's CURRENT rung done enough to move past it? */
function readyToAdvance(ladder: Ladder, st: LadderState, weeks: WeekHistory[]): boolean {
  const rung = ladder.rungs[st.rung];
  if (ladder.id in CARDIO_LETTERS) return true; // cardio uses its own §4 gate, not the exposure table
  const kind = rung.kind;
  const letters = lettersOf(rung);
  if (letters.length === 0) return true; // sentinel (e.g. sideplank R0) — nothing to be "ready" about
  const exposures = exposuresSince(ladder.id, rung, st.changedWeek, weeks);
  const clean = exposures.filter((s) => isCleanSession(s, ladder.id, rung));
  if (kind === 'T' || kind === 'MIN') return clean.length >= 2;
  // V and LISA share the same table row: "a clearance + the V rule" — the
  // clearance already let us REACH this rung; advancing PAST it uses the V rule.
  if (clean.length >= 4) return true; // the backstop
  return clean.length >= 2 && clean.some((s) => positiveFeel(s, ladder.id));
}

function isFrozen(st: LadderState, weekStart: string): boolean {
  if (!st.changedWeek) return false;
  return weeksBetween(st.changedWeek, weekStart) < 2;
}

/** Last-2-measured-sessions-over-the-brake check, for any letter a rung touches. */
function lengthGateBlocks(letters: Letter[], weeks: WeekHistory[], brakeMin: number): boolean {
  for (const letter of letters) {
    const measured: number[] = [];
    for (let i = weeks.length - 1; i >= 0 && measured.length < 2; i--) {
      for (let j = weeks[i]!.sessions.length - 1; j >= 0 && measured.length < 2; j--) {
        const s = weeks[i]!.sessions[j]!;
        if (s.workout !== letter) continue;
        if (s.durationSec === null || s.durationSec === undefined) continue;
        if (s.durationSec > 90 * 60) continue; // a left-open runaway row
        measured.push(s.durationSec);
      }
    }
    if (measured.length === 2 && measured.every((d) => d > brakeMin * 60)) return true;
  }
  return false;
}

function cardioReady(ladderId: string, targetMinutes: number, weeks: WeekHistory[]): boolean {
  const letters = CARDIO_LETTERS[ladderId]!;
  const rides: number[] = [];
  for (let i = weeks.length - 1; i >= 0 && rides.length < 2; i--) {
    for (let j = weeks[i]!.sessions.length - 1; j >= 0 && rides.length < 2; j--) {
      const s = weeks[i]!.sessions[j]!;
      if (!letters.includes(s.workout)) continue;
      if (s.cardioMinutes === null || s.cardioMinutes === undefined) continue;
      rides.push(s.cardioMinutes);
    }
  }
  return rides.length === 2 && rides.every((m) => m >= targetMinutes - 2);
}

function hasClearance(rungId: string, clearances: Clearance[]): boolean {
  return clearances.some((c) => c.rungId === rungId);
}

// ---------------------------------------------------------------------------
// Back / wrist flare scanning (Sep 25 2026 engine fix, sev 5 #2 + #3)
//
// WHY: the original checks read ONLY `priorWeeks[-1]` — a back/wrist flare
// followed by a partial week, or by a week off, fell out of the window
// entirely and was never reverted. The probes that found this: 'back3partial'
// (2 sessions, both back 3, used to hit the partial-week HOLD first) and
// 'back4ThenOffWeek' (back 4, then an empty week — the z=1 break check fired
// before back was ever read). Fix: scan a short backward window of WEEKS
// (not just the last one) for the high-pain / twice-in-a-week signal, and
// track which flare a STEP_BACK has already reacted to (via
// `stepBackReason`) so the same flare can't re-fire forever once handled.
// ---------------------------------------------------------------------------

const FLARE_LOOKBACK_WEEKS = 3;

function flareLookbackWindow(
  priorWeeks: WeekHistory[],
  priorDecisions: WeekDecision[],
  reason: 'back' | 'wrist'
): WeekHistory[] {
  const lastHandled = priorDecisions
    .filter((d) => d.mode === 'STEP_BACK' && d.stepBackReason === reason)
    .map((d) => d.weekStart)
    .sort()
    .pop();
  const windowFloor =
    priorWeeks.length > FLARE_LOOKBACK_WEEKS
      ? priorWeeks[priorWeeks.length - FLARE_LOOKBACK_WEEKS]!.weekStart
      : (priorWeeks[0]?.weekStart ?? null);
  return priorWeeks.filter((w) => {
    if (lastHandled && w.weekStart <= lastHandled) return false;
    if (windowFloor && w.weekStart < windowFloor) return false;
    return true;
  });
}

// v51 (Sep 25 2026): field -> its pre-log BEFORE-reading counterpart. Same
// "signal" behind the two names — flareWeek's single-session ≥3 branch checks
// both, so a session that flared going IN also counts, not just one that
// flared coming out.
const BEFORE_FIELD_OF: Record<'backPain' | 'wristPain', 'backPainBefore' | 'wristPainBefore'> = {
  backPain: 'backPainBefore',
  wristPain: 'wristPainBefore',
};

/** A week with one session ≥3, or ≥2 sessions ≥1 (spec §9.3/§9.4's "or 1+ in 2+ sessions").
 *  v51: the ≥3 single-session check also fires on that session's BEFORE
 *  reading (her follow-up ask — before now gets everything after already
 *  had). The "≥1 twice in a week" branch stays post-workout only — that's
 *  the field named in the original spec and unchanged here. */
function flareWeek(
  priorWeeks: WeekHistory[],
  priorDecisions: WeekDecision[],
  reason: 'back' | 'wrist',
  field: 'backPain' | 'wristPain'
): WeekHistory | null {
  const beforeField = BEFORE_FIELD_OF[field];
  const candidates = flareLookbackWindow(priorWeeks, priorDecisions, reason);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const w = candidates[i]!;
    if (w.sessions.some((sess) => (sess[field] ?? -1) >= 3 || (sess[beforeField] ?? -1) >= 3))
      return w;
    if (w.sessions.filter((sess) => (sess[field] ?? -1) >= 1).length >= 2) return w;
  }
  return null;
}

/** Every name any UPPER-lane rung can emit, plus the hinge (holds the 1 kg —
 *  spec's grip-load ceiling), derived from LADDERS_BY_LANE instead of a
 *  hand-written regex (sev 3 #6: the old regex matched only 2 of these). */
function upperOrGripNames(): Set<string> {
  const names = new Set<string>(['Bodyweight hip hinge']);
  for (const ladder of LADDERS_BY_LANE.UPPER) {
    for (const rung of ladder.rungs) {
      for (const items of Object.values(rung.slots)) {
        for (const ex of items ?? []) names.add(ex.name);
      }
    }
  }
  return names;
}
const UPPER_OR_GRIP_NAMES = upperOrGripNames();

function stoppedAtHandsWeek(priorWeeks: WeekHistory[], priorDecisions: WeekDecision[]): boolean {
  const candidates = flareLookbackWindow(priorWeeks, priorDecisions, 'wrist');
  return candidates.some((w) =>
    w.sessions.some((s) => s.stoppedEarlyAt !== null && UPPER_OR_GRIP_NAMES.has(s.stoppedEarlyAt))
  );
}

/** A lane resting after a safety STEP_BACK (spec §9.3/§9.4's 2-week LEGS/CORE
 *  rest and "wait until 2 clean A/B sessions" for UPPER). Recomputed from
 *  `priorDecisions` on every call — nothing needs to be threaded through
 *  `foldDecisions` because the full decision history is always in hand. */
function activeLaneRests(
  priorDecisions: WeekDecision[],
  priorWeeks: WeekHistory[],
  weekStart: string
): Lane[] {
  const rests = new Set<Lane>();
  const lastBack = [...priorDecisions]
    .reverse()
    .find((d) => d.mode === 'STEP_BACK' && d.stepBackReason === 'back');
  if (lastBack && weeksBetween(lastBack.weekStart, weekStart) <= 2) {
    rests.add('LEGS');
    rests.add('CORE');
  }
  const lastWrist = [...priorDecisions]
    .reverse()
    .find((d) => d.mode === 'STEP_BACK' && d.stepBackReason === 'wrist');
  if (lastWrist) {
    let cleanAB = 0;
    for (const w of priorWeeks) {
      if (w.weekStart <= lastWrist.weekStart) continue;
      for (const sess of w.sessions) {
        if (sess.workout !== 'A' && sess.workout !== 'B') continue;
        if (sess.liteDay || sess.stoppedEarlyAt !== null) continue;
        if (sess.backPain !== 0 || sess.wristPain !== 0) continue;
        cleanAB++;
      }
    }
    if (cleanAB < 2) rests.add('UPPER');
  }
  return [...rests];
}

// ---------------------------------------------------------------------------
// decideWeek
// ---------------------------------------------------------------------------

export function decideWeek(input: DecideWeekInput): WeekDecision {
  const brakeMin = input.sessionLengthBrakeMin ?? 45;
  const { state, laneQueue, round } = foldDecisions(input.priorDecisions);
  const lastWeek = input.priorWeeks[input.priorWeeks.length - 1] ?? null;
  const gapNotes: string[] = [];
  const lisaQuestions: string[] = [];

  const emptyDecision = (
    mode: WeekMode,
    lane: Lane,
    extra: Partial<WeekDecision> = {}
  ): WeekDecision => ({
    weekStart: input.weekStart,
    mode,
    lane,
    reverts: [],
    lisaQuestions,
    gapNotes,
    laneQueue,
    round,
    askLisaLine: false,
    ...extra,
  });

  const laneNow = laneQueue[0]!;
  const twoWeeksAgo = input.priorWeeks[input.priorWeeks.length - 2] ?? null;

  // --- 3/4 first: Back / Wrist (Sep 25 2026 engine fix, sev 5 #2 + #3) -------
  // MOVED ahead of Break/Partial (spec §9 order 1,2,3,4 → run 3,4 first): a
  // safety signal must win regardless of what the calendar tiers or the
  // partial-week count say — a back-3 week that only got 2 sessions in (the
  // likeliest SHAPE of a flare) used to hit the partial-week HOLD and never
  // revert at all. Both scans look back up to FLARE_LOOKBACK_WEEKS, not just
  // `lastWeek`, so a flare followed by a week off (or a partial week) is still
  // caught the next time decideWeek runs, and `stepBackReason` on the prior
  // decision stops the same flare from re-firing forever once it's handled.
  const backFlare = flareWeek(input.priorWeeks, input.priorDecisions, 'back', 'backPain');
  if (backFlare) {
    const revert = findRevertCandidate(
      input.priorDecisions,
      state,
      ['LEGS', 'CORE'],
      input.weekStart
    );
    const reverts = revert ? [revert] : [];
    return emptyDecision('STEP_BACK', laneNow, {
      reverts,
      askLisaLine: true,
      stepBackReason: 'back',
      gapNotes:
        reverts.length === 0 ? ['Back flagged, but no recent LEGS/CORE change to revert.'] : [],
    });
  }
  if ((lastWeek?.sessions ?? []).some((s) => s.backPain !== null && s.backPain >= 1)) {
    return emptyDecision('HOLD', laneNow, {
      gapNotes: ['Back at 1-2 once — holding, not stepping back.'],
    });
  }

  const wristFlare = flareWeek(input.priorWeeks, input.priorDecisions, 'wrist', 'wristPain');
  const stoppedAtHands = stoppedAtHandsWeek(input.priorWeeks, input.priorDecisions);
  if (wristFlare || stoppedAtHands) {
    const revert = findRevertCandidate(input.priorDecisions, state, ['UPPER'], input.weekStart);
    const reverts = revert ? [revert] : [];
    return emptyDecision('STEP_BACK', laneNow, {
      reverts,
      stepBackReason: 'wrist',
      gapNotes:
        reverts.length === 0 ? ['Wrist flagged, but no recent UPPER change to revert.'] : [],
    });
  }
  if ((lastWeek?.sessions ?? []).some((s) => s.wristPain !== null && s.wristPain >= 1)) {
    return emptyDecision('HOLD', laneNow, { gapNotes: ['Wrist at 1-2 once — holding.'] });
  }
  const maxWrist = (w: WeekHistory | null) =>
    Math.max(0, ...(w?.sessions.map((s) => s.wristPain ?? 0) ?? [0]));
  if (
    twoWeeksAgo &&
    lastWeek &&
    maxWrist(lastWeek) > maxWrist(twoWeeksAgo) &&
    maxWrist(twoWeeksAgo) > 0
  ) {
    return emptyDecision('HOLD', laneNow, {
      gapNotes: ['Wrist max climbing 2 weeks running — holding.'],
    });
  }

  // --- 1. Break -------------------------------------------------------------
  let z = 0;
  for (let i = input.priorWeeks.length - 1; i >= 0; i--) {
    if (input.priorWeeks[i]!.sessions.length === 0) z++;
    else break;
  }

  if (z >= 4) {
    // The ~80% rung drop (§9.1) is applied by applyDecisionToState/foldDecisions
    // the NEXT time this decision is replayed — decideWeek itself just marks
    // the mode and bumps the round; no step, of any kind, in a RESTART week.
    return emptyDecision('RESTART', laneNow, { round: round + 1 });
  }
  if (z >= 2) {
    // WELCOME_BACK: revert the newest step AND the newest nudge one rung each.
    const reverts: LadderEdit[] = [];
    const lastStepDecision = [...input.priorDecisions].reverse().find((d) => d.step);
    const lastNudgeDecision = [...input.priorDecisions].reverse().find((d) => d.nudge);
    for (const found of [lastStepDecision?.step, lastNudgeDecision?.nudge]) {
      if (!found) continue;
      const st = state[found.ladderId]!;
      if (st.rung <= 0) continue;
      reverts.push({
        ladderId: found.ladderId,
        from: st.rung,
        to: st.rung - 1,
        reason: 'welcome back — the newest change steps back one rung',
        receipt: `${z} weeks off`,
      });
    }
    return emptyDecision('WELCOME_BACK', laneNow, { reverts });
  }
  if (z === 1) {
    return emptyDecision('HOLD', laneNow, {
      gapNotes: ['1 week off — same plan, the next step waits a week.'],
    });
  }

  // --- 2. Partial week -------------------------------------------------------
  const lastCount = lastWeek?.sessions.length ?? 0;
  if (lastWeek && lastCount > 0 && lastCount <= 2) {
    return emptyDecision('HOLD', laneNow, { gapNotes: ['Only 1-2 sessions last week.'] });
  }

  // --- 5. Heaviness --------------------------------------------------------------
  const heavySessions = lastWeek?.sessions ?? [];
  if (
    heavySessions.some((s) => s.liteDay || s.stoppedEarlyAt !== null || s.stepFeel === 'too_much')
  ) {
    // "too_much on BOTH of a rung's first 2 exposures" is checked per-ladder below,
    // inside the candidate search (needs the specific rung's own exposure list) —
    // here we just cover the plain single-session HOLD case.
    const stepBackRung = findTooMuchTwiceRevert(state, input.priorWeeks);
    if (stepBackRung) {
      return emptyDecision('STEP_BACK', laneNow, {
        reverts: [stepBackRung],
        stepBackReason: 'heaviness',
        gapNotes: [`${stepBackRung.reason}`],
      });
    }
    return emptyDecision('HOLD', laneNow, {
      gapNotes: ['A heavy-feeling session last week — holding.'],
    });
  }

  // --- 6. STEP + NUDGE -------------------------------------------------------
  // Sep 25 2026 engine fix (sev 5 #1): LEGS/CORE (a recent back STEP_BACK) or
  // UPPER (a recent wrist STEP_BACK, until 2 clean A/B sessions) are excluded
  // from BOTH the step search and the nudge search while resting.
  const restingLanes = activeLaneRests(input.priorDecisions, input.priorWeeks, input.weekStart);
  const pick = pickStep(
    input.weekStart,
    state,
    laneQueue,
    input.priorWeeks,
    input.priorDecisions,
    input.clearances,
    brakeMin,
    gapNotes,
    lisaQuestions,
    restingLanes
  );
  if (!pick) {
    // Sep 25 2026 engine fix (sev 4 #5): a stuck week (every lane empty) used
    // to give up on the nudge too — she'd see literally nothing move, her
    // named quit trigger (spec §14). A nudge can still land even with no step.
    const gapNote = [...gapNotes, 'No lane had an eligible candidate this week.'];
    // sev 4 #6: name the gap when a skipped body tap — not a real hold — is
    // why nothing is ready, so it reads as a fact, not a mystery.
    const unanswered = (input.priorWeeks[input.priorWeeks.length - 1]?.sessions ?? []).filter(
      (s) => s.backPain === null || s.wristPain === null
    ).length;
    if (unanswered > 0) {
      gapNote.push(
        `Back & wrist not answered on ${unanswered} session${unanswered === 1 ? '' : 's'} — the step waits.`
      );
    }
    const fallbackNudge = pickNudge(
      input.weekStart,
      state,
      null,
      null,
      input.priorWeeks,
      restingLanes
    );
    return emptyDecision('STEP', laneNow, {
      nudge: fallbackNudge ?? undefined,
      gapNotes: gapNote,
    });
  }
  const nudge = pickNudge(
    input.weekStart,
    state,
    pick.step.ladderId,
    laneOf(pick.step.ladderId),
    input.priorWeeks,
    restingLanes
  );

  return {
    weekStart: input.weekStart,
    mode: 'STEP',
    lane: pick.lane,
    step: pick.step,
    nudge: nudge ?? undefined,
    reverts: [],
    lisaQuestions,
    gapNotes,
    laneQueue: pick.nextLaneQueue,
    round,
    askLisaLine: false,
  };
}

function findRevertCandidate(
  priorDecisions: WeekDecision[],
  state: Record<string, LadderState>,
  lanes: Lane[],
  weekStart: string
): LadderEdit | null {
  for (let i = priorDecisions.length - 1; i >= 0; i--) {
    const d = priorDecisions[i]!;
    if (daysBetween(d.weekStart, weekStart) > 14) break;
    for (const edit of [d.step, d.nudge].filter((e): e is LadderEdit => !!e)) {
      if (lanes.includes(laneOf(edit.ladderId))) {
        const st = state[edit.ladderId]!;
        if (st.rung <= 0) continue;
        return {
          ladderId: edit.ladderId,
          from: st.rung,
          to: st.rung - 1,
          reason: `reverting the last ${laneOf(edit.ladderId)} change from the past 2 weeks`,
          receipt: edit.receipt,
        };
      }
    }
  }
  return null;
}

/** "too_much on BOTH of a rung's first 2 exposures" → revert, freeze 2 weeks. */
function findTooMuchTwiceRevert(
  state: Record<string, LadderState>,
  weeks: WeekHistory[]
): LadderEdit | null {
  for (const ladder of LADDERS) {
    const { st, rung } = ladderCurrentRung(ladder, state);
    if (st.rung === 0) continue;
    const exposures = exposuresSince(ladder.id, rung, st.changedWeek, weeks).filter(
      (s) => !s.liteDay && s.stoppedEarlyAt === null
    );
    if (exposures.length >= 2 && exposures.slice(0, 2).every((s) => s.stepFeel === 'too_much')) {
      const firstLetter = Object.keys(rung.slots)[0] as Letter | undefined;
      const name = (firstLetter && rung.slots[firstLetter]?.[0]?.name) ?? ladder.id;
      return {
        ladderId: ladder.id,
        from: st.rung,
        to: st.rung - 1,
        reason: `${name} felt like too much twice — back one rung`,
        receipt: 'too_much × 2',
      };
    }
  }
  return null;
}

type StepPick = { lane: Lane; step: LadderEdit; nextLaneQueue: Lane[] };

function pickStep(
  weekStart: string,
  state: Record<string, LadderState>,
  laneQueue: Lane[],
  weeks: WeekHistory[],
  priorDecisions: WeekDecision[],
  clearances: Clearance[],
  brakeMin: number,
  gapNotes: string[],
  lisaQuestions: string[],
  restingLanes: Lane[] = []
): StepPick | null {
  // Sep 25 2026 engine fix (sev 4 #5): walk the WHOLE queue, not just
  // queue[0]/queue[1] — with CARDIO capped and UPPER Lisa-gated for months at
  // a time, the old 2-lane cap left CORE/LEGS candidates untried and nothing
  // moved (probe 'easy30': 11 weeks straight of "no eligible candidate").
  // Picking at index k rotates ONLY that lane to the back; every lane tried
  // and skipped before it (including k=0) keeps its relative order at the
  // front — spec §9.6 "the skipped lane goes first next week" generalizes the
  // same way whether 1 lane was skipped or 3.
  for (let k = 0; k < laneQueue.length; k++) {
    const lane = laneQueue[k];
    if (lane === undefined) continue;
    const candidate = bestCandidateInLane(
      weekStart,
      lane,
      state,
      weeks,
      priorDecisions,
      clearances,
      brakeMin,
      gapNotes,
      lisaQuestions,
      restingLanes
    );
    if (candidate) {
      const nextLaneQueue = [...laneQueue.slice(0, k), ...laneQueue.slice(k + 1), laneQueue[k]!];
      return { lane, step: candidate, nextLaneQueue };
    }
  }
  return null;
}

function bestCandidateInLane(
  weekStart: string,
  lane: Lane,
  state: Record<string, LadderState>,
  weeks: WeekHistory[],
  priorDecisions: WeekDecision[],
  clearances: Clearance[],
  brakeMin: number,
  gapNotes: string[],
  lisaQuestions: string[],
  restingLanes: Lane[] = []
): LadderEdit | null {
  if (restingLanes.includes(lane)) return null; // sev 5 #1: resting after a back/wrist STEP_BACK
  const ladders = LADDERS_BY_LANE[lane];
  const eligible: { ladder: Ladder; nextRung: Rung; nextIdx: number }[] = [];
  for (const ladder of ladders) {
    const st = state[ladder.id] ?? { rung: 0, changedWeek: null, herAsk: false };
    const nextIdx = st.rung + 1;
    const nextRung = ladder.rungs[nextIdx];
    if (!nextRung) continue; // topped out (a cap, e.g. wall sit finisher / cardio cap)
    if (!readyToAdvance(ladder, st, weeks)) continue;
    eligible.push({ ladder, nextRung, nextIdx });
  }
  // (a) LISA with no clearance → lisaQuestions, not a candidate.
  // (b) contentReady=false → dropped + gapNote.
  // (d) freeze.
  // (e) length gate. (f) cardio's own data gate.
  const usable = eligible.filter(({ ladder, nextRung }) => {
    const st = state[ladder.id]!;
    if (isFrozen(st, weekStart)) return false;
    if (nextRung.kind === 'LISA' && !hasClearance(nextRung.id, clearances)) {
      lisaQuestions.push(nextRung.id);
      return false;
    }
    if (!nextRung.contentReady) {
      gapNotes.push(
        `${ladder.id}: ${nextRung.id} isn't built yet (no card/visual/voice) — skipped.`
      );
      return false;
    }
    if (ladder.id in CARDIO_LETTERS) {
      const target = cardioTargetMinutes(ladder.id, nextRung);
      if (!cardioReady(ladder.id, target, weeks)) {
        gapNotes.push(`${ladder.id}: rides not logged near target yet — the cardio step waits.`);
        return false;
      }
      if (lengthGateBlocks(CARDIO_LETTERS[ladder.id]!, weeks, brakeMin)) return false;
    } else if (nextRung.minutesDelta > 0) {
      if (lengthGateBlocks(lettersOf(nextRung), weeks, brakeMin)) return false;
    }
    return true;
  });
  if (usable.length === 0) return null;

  // Pick order: her-ask → novelty (last 3 steps all T/MIN → prefer a V) → stalest → list order.
  const herAsk = usable.find(({ ladder }) => state[ladder.id]!.herAsk);
  const chosen = herAsk ?? novelty(usable, priorDecisions) ?? stalest(usable, state);
  const st = state[chosen.ladder.id]!;
  return {
    ladderId: chosen.ladder.id,
    from: st.rung,
    to: chosen.nextIdx,
    reason: herAsk ? 'her own ask, still queued' : `${chosen.ladder.id} — the next rung in ${lane}`,
    receipt: chosen.nextRung.id,
  };
}

function cardioTargetMinutes(ladderId: string, rung: Rung): number {
  // The 3 rungs' absolute targets (spec §4): AB 10→12→15, C 25→30→35.
  const table: Record<string, number[]> = { CARDIO_AB: [10, 12, 15], CARDIO_C: [25, 30, 35] };
  const idx = getLadder(ladderId).rungs.indexOf(rung);
  return table[ladderId]![idx]!;
}

function novelty(
  usable: { ladder: Ladder; nextRung: Rung; nextIdx: number }[],
  priorDecisions: WeekDecision[]
): { ladder: Ladder; nextRung: Rung; nextIdx: number } | null {
  const lastSteps = [...priorDecisions]
    .reverse()
    .map((d) => d.step)
    .filter((s): s is LadderEdit => !!s)
    .slice(0, 3);
  if (lastSteps.length < 3) return null;
  const lastKinds = lastSteps.map((s) => getLadder(s.ladderId).rungs[s.to]!.kind);
  const allTorMin = lastKinds.every((k) => k === 'T' || k === 'MIN');
  if (!allTorMin) return null;
  const v = usable.find(({ nextRung }) => nextRung.kind === 'V');
  return v ?? null;
}

function stalest(
  usable: { ladder: Ladder; nextRung: Rung; nextIdx: number }[],
  state: Record<string, LadderState>
): { ladder: Ladder; nextRung: Rung; nextIdx: number } {
  const withDate = usable.map((u) => ({
    u,
    changed: state[u.ladder.id]!.changedWeek ?? '1970-01-01',
    order: u.ladder.order,
  }));
  withDate.sort((a, b) =>
    a.changed < b.changed ? -1 : a.changed > b.changed ? 1 : a.order - b.order
  );
  return withDate[0]!.u;
}

function pickNudge(
  weekStart: string,
  state: Record<string, LadderState>,
  stepLadderId: string | null,
  stepLane: Lane | null,
  weeks: WeekHistory[],
  restingLanes: Lane[] = []
): LadderEdit | null {
  const candidates: { ladder: Ladder; nextRung: Rung; nextIdx: number }[] = [];
  for (const ladder of LADDERS) {
    // sev 4 #5: called with stepLadderId/stepLane = null on a stuck week (no
    // step anywhere) — there's no step lane to avoid, so only the hard
    // exclusions (cardio, resting lanes) still apply.
    if (stepLadderId !== null && ladder.id === stepLadderId) continue;
    if (stepLane !== null && ladder.lane === stepLane) continue;
    if (ladder.lane === 'CARDIO') continue; // never cardio
    if (restingLanes.includes(ladder.lane)) continue; // sev 5 #1
    const st = state[ladder.id] ?? { rung: 0, changedWeek: null, herAsk: false };
    const nextIdx = st.rung + 1;
    const nextRung = ladder.rungs[nextIdx];
    if (!nextRung || nextRung.kind !== 'T') continue; // never V/MIN/LISA
    if (!nextRung.contentReady) continue;
    if (isFrozen(st, weekStart)) continue;
    if (!readyToAdvance(ladder, st, weeks)) continue;
    candidates.push({ ladder, nextRung, nextIdx });
  }
  if (candidates.length === 0) return null;
  const chosen = stalest(candidates, state);
  const st = state[chosen.ladder.id]!;
  return {
    ladderId: chosen.ladder.id,
    from: st.rung,
    to: chosen.nextIdx,
    reason: 'the nudge — one small dial elsewhere',
    receipt: chosen.nextRung.id,
  };
}

// ---------------------------------------------------------------------------
// composeWeekPlan
// ---------------------------------------------------------------------------

/**
 * Builds a WeekPlan from ladder state, laying `main`/`upperBack` per letter
 * over a `base` week for everything the engine doesn't govern (warmup,
 * cooldown, rounds, name/description). `base` is the last hand-written
 * PROGRAM row (R2W4) at cutover, and stays fixed after that — only ladder
 * state changes what's returned.
 */
export function composeWeekPlan(
  meta: { weekNum: number; round?: number; startsOn: string; label?: string },
  state: Record<string, LadderState>,
  base: WeekPlan,
  opts: { deload?: boolean } = {}
): WeekPlan {
  const letters: Letter[] = ['A', 'B', 'C'];
  const workouts = {} as Record<WorkoutId, Workout>;
  for (const letter of letters) {
    const baseWorkout = base.workouts[letter]!;
    const main = buildBlock('main', letter, state);
    const upperBack = buildBlock('upperBack', letter, state);
    const chosenMain = main.length > 0 ? main : baseWorkout.main;
    const chosenUpperBack = upperBack.length > 0 ? upperBack : baseWorkout.upperBack;
    workouts[letter] = {
      ...baseWorkout,
      main: opts.deload ? applyDeload(chosenMain) : chosenMain,
      upperBack: chosenUpperBack && opts.deload ? applyDeload(chosenUpperBack) : chosenUpperBack,
      // sev 4 #8: RESTART's "~80%, like Round 2" (spec §9.1) — see applyDeload.
      rounds: opts.deload ? Math.max(1, baseWorkout.rounds - 1) : baseWorkout.rounds,
    };
  }
  return { ...meta, workouts };
}

// Sep 25 2026 (engine fix, sev 4 #8): a RESTART used to drop every ladder ONE
// rung with a floor of 0 (applyDecisionToState) — a no-op for the ladders
// already AT R0, which is most of them, so a 4+ week break came back at
// 100%, not "~80%, like Round 2" (spec §9.1). `durationSec` and `rounds` are
// unambiguous numbers to scale down; the free-text `reps` field mixes reps,
// sets and weight in one sentence with no reliable position for "the reps
// number" ("2 sets · 12 reps" vs "6-8 each side" vs "holding the 1 kg") — a
// blind find/replace there risks quietly turning "1 kg" into "0.8 kg" or
// "2 sets" into "1 set". Left for a content-authoring pass rather than
// guessed at here; flagged, not silently skipped.
function applyDeload(items: Exercise[]): Exercise[] {
  return items.map((ex) =>
    typeof ex.durationSec === 'number'
      ? { ...ex, durationSec: Math.max(1, Math.floor(ex.durationSec * 0.8)) }
      : ex
  );
}

function buildBlock(block: Block, letter: Letter, state: Record<string, LadderState>): Exercise[] {
  const out: Exercise[] = [];
  for (const ladder of LADDERS) {
    if (ladder.block !== block) continue;
    if (ladder.id === 'plank' && letter === 'B' && sidePlankHasStarted(state)) continue;
    const st = state[ladder.id] ?? { rung: 0, changedWeek: null, herAsk: false };
    const items = latestSlotForLetter(ladder, st.rung, letter);
    if (items) out.push(...items);
  }
  return out;
}

// Sep 25 2026 (engine fix, sev 4 #4): most rungs list ONLY the letter(s) that
// changed (e.g. calf.r1.b15 touches B only), so reading just `rung.slots[letter]`
// silently DROPPED every other letter's move the moment any rung fired — 86
// such losses on the real R2W4 row (the probe). A rung silent on a letter
// means "unchanged", not "removed": walk backward to the most recent earlier
// rung that DID define this letter, same as the ladder's own progression.
function latestSlotForLetter(
  ladder: Ladder,
  rungIdx: number,
  letter: Letter
): Exercise[] | undefined {
  for (let i = rungIdx; i >= 0; i--) {
    const items = ladder.rungs[i]?.slots[letter];
    if (items) return items;
  }
  return undefined;
}

/** For the fallback wiring in app.ts: everything a rung can emit must resolve. */
export function allEmittableNames(): { rungId: string; contentReady: boolean; names: string[] }[] {
  const out: { rungId: string; contentReady: boolean; names: string[] }[] = [];
  for (const ladder of LADDERS) {
    for (const rung of ladder.rungs) {
      const names = new Set<string>();
      for (const items of Object.values(rung.slots)) {
        for (const ex of items ?? []) names.add(ex.name);
      }
      out.push({ rungId: rung.id, contentReady: rung.contentReady, names: [...names] });
    }
  }
  return out;
}

export { ENGINE_VERSION };
export type {
  Ladder,
  LadderState,
  Lane,
  Letter,
  Rung,
  RungKind,
  Clearance,
  Exercise,
  Workout,
  WeekPlan,
};
