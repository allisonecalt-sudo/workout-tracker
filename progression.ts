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

  // --- 1. Break -------------------------------------------------------------
  let z = 0;
  for (let i = input.priorWeeks.length - 1; i >= 0; i--) {
    if (input.priorWeeks[i]!.sessions.length === 0) z++;
    else break;
  }
  const laneNow = laneQueue[0]!;

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

  const twoWeeksAgo = input.priorWeeks[input.priorWeeks.length - 2] ?? null;

  // --- 3. Back ---------------------------------------------------------------
  const backSessions = lastWeek?.sessions ?? [];
  const backHigh = backSessions.filter((s) => s.backPain !== null && s.backPain >= 3);
  const backLowTwice =
    backSessions.filter((s) => s.backPain !== null && s.backPain >= 1).length >= 2;
  if (backHigh.length >= 1 || backLowTwice) {
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
      gapNotes:
        reverts.length === 0 ? ['Back flagged, but no recent LEGS/CORE change to revert.'] : [],
    });
  }
  if (backSessions.some((s) => s.backPain !== null && s.backPain >= 1)) {
    return emptyDecision('HOLD', laneNow, {
      gapNotes: ['Back at 1-2 once — holding, not stepping back.'],
    });
  }

  // --- 4. Wrist ----------------------------------------------------------------
  const wristSessions = lastWeek?.sessions ?? [];
  const wristHigh = wristSessions.some((s) => s.wristPain !== null && s.wristPain >= 3);
  const stoppedAtHands = wristSessions.some(
    (s) => s.stoppedEarlyAt !== null && /bird dog|wall (lean|push)/i.test(s.stoppedEarlyAt)
  );
  if (wristHigh || stoppedAtHands) {
    const revert = findRevertCandidate(input.priorDecisions, state, ['UPPER'], input.weekStart);
    const reverts = revert ? [revert] : [];
    return emptyDecision('STEP_BACK', laneNow, {
      reverts,
      gapNotes:
        reverts.length === 0 ? ['Wrist flagged, but no recent UPPER change to revert.'] : [],
    });
  }
  if (wristSessions.some((s) => s.wristPain !== null && s.wristPain >= 1)) {
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
        gapNotes: [`${stepBackRung.reason}`],
      });
    }
    return emptyDecision('HOLD', laneNow, {
      gapNotes: ['A heavy-feeling session last week — holding.'],
    });
  }

  // --- 6. STEP + NUDGE -------------------------------------------------------
  const pick = pickStep(
    input.weekStart,
    state,
    laneQueue,
    input.priorWeeks,
    input.priorDecisions,
    input.clearances,
    brakeMin,
    gapNotes,
    lisaQuestions
  );
  if (!pick) {
    return emptyDecision('STEP', laneNow, {
      gapNotes: [...gapNotes, 'No lane had an eligible candidate this week.'],
    });
  }
  const nudge = pickNudge(
    input.weekStart,
    state,
    pick.step.ladderId,
    laneOf(pick.step.ladderId),
    input.priorWeeks
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
  lisaQuestions: string[]
): StepPick | null {
  // Try queue[0]; if it has no candidate, it stays at the front for next week
  // and queue[1] takes this week's step instead (spec §9.6: "the skipped lane
  // goes first next week").
  for (let attempt = 0; attempt < laneQueue.length; attempt++) {
    const tryIdx = attempt === 0 ? 0 : 1;
    const lane = laneQueue[tryIdx];
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
      lisaQuestions
    );
    if (candidate) {
      const nextLaneQueue =
        tryIdx === 0
          ? [...laneQueue.slice(1), laneQueue[0]!]
          : [laneQueue[0]!, ...laneQueue.slice(2), laneQueue[1]!];
      return { lane, step: candidate, nextLaneQueue };
    }
    if (attempt === 0) continue; // fall through to trying queue[1]
    break; // both queue[0] and queue[1] failed — give up (all lanes stuck)
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
  lisaQuestions: string[]
): LadderEdit | null {
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
  stepLadderId: string,
  stepLane: Lane,
  weeks: WeekHistory[]
): LadderEdit | null {
  const candidates: { ladder: Ladder; nextRung: Rung; nextIdx: number }[] = [];
  for (const ladder of LADDERS) {
    if (ladder.id === stepLadderId) continue;
    if (ladder.lane === stepLane) continue;
    if (ladder.lane === 'CARDIO') continue; // never cardio
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
  base: WeekPlan
): WeekPlan {
  const letters: Letter[] = ['A', 'B', 'C'];
  const workouts = {} as Record<WorkoutId, Workout>;
  for (const letter of letters) {
    const baseWorkout = base.workouts[letter]!;
    const main = buildBlock('main', letter, state);
    const upperBack = buildBlock('upperBack', letter, state);
    workouts[letter] = {
      ...baseWorkout,
      main: main.length > 0 ? main : baseWorkout.main,
      upperBack: upperBack.length > 0 ? upperBack : baseWorkout.upperBack,
    };
  }
  return { ...meta, workouts };
}

function buildBlock(block: Block, letter: Letter, state: Record<string, LadderState>): Exercise[] {
  const out: Exercise[] = [];
  for (const ladder of LADDERS) {
    if (ladder.block !== block) continue;
    if (ladder.id === 'plank' && letter === 'B' && sidePlankHasStarted(state)) continue;
    const st = state[ladder.id] ?? { rung: 0, changedWeek: null, herAsk: false };
    const rung = ladder.rungs[st.rung];
    if (!rung) continue;
    const items = rung.slots[letter];
    if (items) out.push(...items);
  }
  return out;
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
