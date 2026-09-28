// move-feel.ts — Easy/Right/Hard on EVERY move that stepped this week (v58,
// Sep 28 2026). Pure logic only (no DOM) — same discipline as ride.ts/
// step-list.ts: app.ts does the reading of live state and the HTML;
// everything decided here is exercised by tests/move-feel.test.ts without a
// browser.
//
// WHY: her words (Mon Sep 28 08:43) — "to check how many times I said that it
// was hard or that it was easy or that it was right, and as you will
// determine what should be next" — the weekly debrief needs the feel on
// EVERY move that stepped, not just curl/row (training-review v2: "the chip
// on whichever move stepped"). arm_feel (curl/row, the 1 kg/2 kg LOAD CHIP)
// stays exactly as it is — her spec item 1: "keep arm_feel as is (don't
// migrate)" — so this module and its wire-up in app.ts always exclude
// whatever names ARM_FEEL_STEPS already owns.
//
// WHAT COUNTS AS "STEPPED": a move whose PROGRAM prescription changed this
// week vs last week's plan — reps up, seconds up (a hold), minutes up (the
// cardio slot, always encoded as 'Outdoor walk'), or a brand-new variant not
// in last week's list at all. Computed from the same per-exercise diff
// diffWorkout (app.ts) already does for "Coming next week"/"Past weeks" —
// this module reimplements just the per-exercise half of that (never the
// string-line half diffWorkout builds) so it can also carry the SLUG + QTY a
// save needs, which a display-only diff line doesn't.
//
// THE SAVE STRING: "splitsquat=right;wallsit=easy@45s;ride=right@12min" — a
// short a-z-only slug per move (the DB CHECK's own shape,
// migrations/2026-09-28-v58-move-feel.sql), `=` the feel (optional — a tap
// she skipped just isn't in the string at all; unlike arm_feel's LOAD CHIP
// there's no "engaged but no feel" case here, nothing else about a move is
// picked per set), and `@qty` ONLY when the stepped quantity has a unit:
// seconds for a hold, minutes for the ride/walk slot. A plain reps bump
// ("8 reps -> 10 reps") carries no qty — the number lives in the PROGRAM
// diff already, repeating it here would just be a second, driftable copy.

export type MoveFeelValue = 'easy' | 'right' | 'hard';
export const MOVE_FEEL_VALUES: readonly MoveFeelValue[] = ['easy', 'right', 'hard'];

export function isMoveFeelValue(v: unknown): v is MoveFeelValue {
  return typeof v === 'string' && (MOVE_FEEL_VALUES as readonly string[]).includes(v);
}

// Structural subset of app.ts's Exercise — kept separate (not imported), the
// same discipline step-list.ts's own StepExercise already uses, so this file
// stays independently testable.
export type MoveFeelExercise = {
  name: string;
  reps?: string;
  durationSec?: number;
  isTimed?: boolean;
};

export type MoveFeelWorkout = {
  warmup: MoveFeelExercise[];
  main: MoveFeelExercise[];
  upperBack?: MoveFeelExercise[];
};

// The cardio slot's PROGRAM name is always 'Outdoor walk' (app.ts's own
// comment on getCurrentExercise: "PROGRAM always stores the cardio slot as
// 'Outdoor walk' — the elliptical swap is a runtime read"); 'Elliptical' and
// 'Apartment cardio' are the two runtime swaps of that same PROGRAM row.
// All three read/write under the one slug her example uses: "ride".
export const RIDE_NAMES: ReadonlySet<string> = new Set([
  'Outdoor walk',
  'Elliptical',
  'Apartment cardio',
]);
const RIDE_PROGRAM_NAME = 'Outdoor walk';
const RIDE_SLUG = 'ride';

// A live step's displayed name (possibly 'Elliptical'/'Apartment cardio')
// back to the one PROGRAM ever encodes — so a stepped-moves lookup keyed off
// PROGRAM's own diff still matches whichever lane she's actually running.
export function canonicalMoveName(name: string): string {
  return RIDE_NAMES.has(name) ? RIDE_PROGRAM_NAME : name;
}

// CHECK's own [a-z]+ — letters only, no digits/spaces/punctuation. "1 kg
// biceps curl" would collide down to "kgbicepscurl" if it ever reached this
// (it never does — callers exclude ARM_FEEL_STEPS' names first).
export function slugFor(name: string): string {
  if (RIDE_NAMES.has(name)) return RIDE_SLUG;
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

export type SteppedMoveKind = 'reps' | 'seconds' | 'minutes';

export type SteppedMove = {
  name: string; // the canonical PROGRAM name (never a runtime-swapped label)
  slug: string;
  kind: SteppedMoveKind;
  qty?: number; // present for 'seconds' | 'minutes' only
  // "split squat 8 reps" | "wall sit 45s" | "ride 12 min" — the pre-log
  // "Stepped this week" line's own text for this one move.
  summary: string;
};

function ridingMinutes(reps: string | undefined): number | null {
  const m = /(\d+)\s*min/.exec(reps ?? '');
  return m?.[1] ? Number(m[1]) : null;
}

function moveKindAndQty(ex: MoveFeelExercise): { kind: SteppedMoveKind; qty?: number } {
  if (RIDE_NAMES.has(ex.name)) {
    const mins = ridingMinutes(ex.reps);
    return mins !== null ? { kind: 'minutes', qty: mins } : { kind: 'reps' };
  }
  if (ex.isTimed && typeof ex.durationSec === 'number') {
    return { kind: 'seconds', qty: ex.durationSec };
  }
  return { kind: 'reps' };
}

function displayLabel(name: string): string {
  return RIDE_NAMES.has(name) ? RIDE_SLUG : name.toLowerCase();
}

// v58 fix pass (Sep 28 2026, checker's should #2): a plain reps summary used
// to carry the WHOLE `reps` text — but that text often has its own
// ' · '-joined extras ("12 reps · 2 sets each round", "6-8 each side · one
// set per round"), the SAME separator the pre-log "Stepped this week" line
// joins several moves' summaries with, so a week with more than one stepped
// move became unreadable (all the ' · '-parts ran together). Only the first
// ' · '-segment survives — short: the name + the stepped number, nothing
// else.
function summaryFor(ex: MoveFeelExercise, kind: SteppedMoveKind, qty: number | undefined): string {
  const label = displayLabel(ex.name);
  if (kind === 'seconds' && qty !== undefined) return `${label} ${qty}s`;
  if (kind === 'minutes' && qty !== undefined) return `${label} ${qty} min`;
  const firstSegment = (ex.reps ?? '').split(' · ')[0] ?? '';
  return firstSegment ? `${label} ${firstSegment}` : label;
}

// One phase's worth of stepped moves — new-in-`next` (not in `prev` at all,
// by name) or changed (reps text OR durationSec differs). A move dropped
// from `prev` (in prev, not in next) is never "stepped" here — diffWorkout's
// own "- name (removed)" line has nothing to ask a feel about, she isn't
// doing it tonight. `excludeNames` is ARM_FEEL_STEPS' two names (curl/row) —
// callers always pass it; this module never hardcodes them itself so a third
// module never has to import app.ts's own constant just to stay in sync.
export function steppedMovesForPhase(
  prevItems: readonly MoveFeelExercise[] | undefined,
  nextItems: readonly MoveFeelExercise[],
  excludeNames: ReadonlySet<string>
): SteppedMove[] {
  const prevByName = new Map((prevItems ?? []).map((e) => [e.name, e]));
  const out: SteppedMove[] = [];
  for (const nx of nextItems) {
    if (excludeNames.has(nx.name)) continue;
    const pv = prevByName.get(nx.name);
    const changed = !pv || pv.reps !== nx.reps || pv.durationSec !== nx.durationSec;
    if (!changed) continue;
    const { kind, qty } = moveKindAndQty(nx);
    out.push({
      name: nx.name,
      slug: slugFor(nx.name),
      kind,
      qty,
      summary: summaryFor(nx, kind, qty),
    });
  }
  return out;
}

// Every stepped move across warmup -> main -> upper back, in that order —
// never cooldown (same boundary the jump list itself keeps, step-list.ts's
// own header comment). `prev` is undefined for the very first encoded week
// (PROGRAM's own starting point) — every one of its moves reads as "new",
// same as diffWorkout's own `!prev` branch.
export function steppedMovesForWorkout(
  prev: MoveFeelWorkout | undefined,
  next: MoveFeelWorkout,
  excludeNames: ReadonlySet<string> = new Set()
): SteppedMove[] {
  return [
    ...steppedMovesForPhase(prev?.warmup, next.warmup, excludeNames),
    ...steppedMovesForPhase(prev?.main, next.main, excludeNames),
    ...steppedMovesForPhase(prev?.upperBack, next.upperBack ?? [], excludeNames),
  ];
}

const UNIT_FOR_KIND: Record<SteppedMoveKind, string> = { reps: '', seconds: 's', minutes: 'min' };

// The saved string: only the moves she actually tapped a feel on (a step she
// never tapped just isn't in the string — "one tap, optional", her spec item
// 1) — `feels` is keyed by slug (state.moveFeel), `stepped` supplies the qty
// + unit for whichever slugs are actually THIS week's stepped moves. A feel
// recorded for a slug that isn't in `stepped` (a stale tap surviving a plan
// change mid-session) is silently dropped — never saved as a bare, qty-less
// guess about a move nothing here can vouch for.
export function moveFeelString(
  feels: Readonly<Record<string, MoveFeelValue>>,
  stepped: readonly SteppedMove[]
): string | null {
  const bySlug = new Map(stepped.map((s) => [s.slug, s]));
  const parts = Object.entries(feels)
    .filter((entry): entry is [string, MoveFeelValue] => bySlug.has(entry[0]))
    .map(([slug, feel]) => {
      const info = bySlug.get(slug) as SteppedMove;
      const unit = UNIT_FOR_KIND[info.kind];
      return `${slug}=${feel}${info.qty !== undefined ? `@${info.qty}${unit}` : ''}`;
    });
  return parts.length > 0 ? parts.join(';') : null;
}

export type MoveFeelPart = { slug: string; feel: MoveFeelValue | null; qtyRaw: string | null };

// The reverse of moveFeelString — reads a saved "slug=feel@qty" string back
// into its parts. Tolerant of a slug with no feel ("slug=@45s", matching the
// DB CHECK's own optional feel half) and of no qty at all (a plain reps
// step). Never throws on a malformed string — an unreadable part is skipped.
export function parseMoveFeelString(s: string | null | undefined): MoveFeelPart[] {
  if (!s) return [];
  const out: MoveFeelPart[] = [];
  for (const part of s.split(';')) {
    const m = /^([a-z]+)=(easy|right|hard)?(?:@([0-9]+(?:kg|s|min)))?$/.exec(part);
    if (!m) continue;
    out.push({ slug: m[1] as string, feel: (m[2] as MoveFeelValue) ?? null, qtyRaw: m[3] ?? null });
  }
  return out;
}

// Mirrors migrations/2026-09-28-v58-move-feel.sql's CHECK exactly — used by
// tests so the two can never quietly drift apart.
const MOVE_FEEL_STRING_RE =
  /^([a-z]+=(easy|right|hard)?(@[0-9]+(kg|s|min))?)(;[a-z]+=(easy|right|hard)?(@[0-9]+(kg|s|min))?)*$/;

export function isValidMoveFeelString(s: string): boolean {
  return MOVE_FEEL_STRING_RE.test(s);
}
