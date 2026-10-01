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
  // Fix pass (Sep 28 2026, checker's nice #R2-N... v59 CHECK, "hinge summary
  // contradiction"): app.ts's Exercise.label (e.g. hip hinge's 'Hip hinge')
  // exists for exactly this — displayLabel used to fall back to `name`
  // ("Bodyweight hip hinge"), so a stepped-move summary line could read
  // "bodyweight hip hinge 1–2 kg", the same "bodyweight vs holding a kg"
  // contradiction the label field was added (v48 fix r2) to stop.
  label?: string;
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

function displayLabel(ex: MoveFeelExercise): string {
  if (RIDE_NAMES.has(ex.name)) return RIDE_SLUG;
  return (ex.label ?? ex.name).toLowerCase();
}

// v59 fix pass (Sep 28 2026, CHECK-v58 round 2 must #R2-S1 / nice #R2-N1):
// round 1 fixed the RUN-ON line (dropping every segment past the first) but
// two bugs remained. (1) the first segment isn't always the one that
// changed — hip hinge's Week-4 reps text is "12 reps · 2 sets each round ·
// holding 1–2 kg (your pick)"; "12 reps" is the SAME number Week 3 already
// had, the real step is the added load, three segments later. `changedSegment`
// picks the segment that's actually new: when the count of ' · '-segments
// grew (a segment was APPENDED — her hip-hinge case), the newest one is the
// real change; same segment count, position 0 already differed for every
// case in the data (a plain rep bump), so that stays the pick. (2) even the
// right segment is still prose ("8-10 each side") — too long once several
// moves step the same week (the R2·Week4 3-move repro clipped the Lite chip
// under the action bar, checker's own must). `extractStepNumber` keeps only
// the number the segment is actually reporting: a leading count/range
// ("8-10"), or — hip hinge's own case — a "N–M kg" load anywhere in the
// text. No number found (rare) → just the name, never the raw prose again.
function changedSegment(nextReps: string, prevReps: string | undefined): string {
  const nextSegs = nextReps.split(' · ').filter((s) => s !== '');
  if (nextSegs.length === 0) return '';
  if (prevReps === undefined) return nextSegs[0] as string;
  const prevSegs = prevReps.split(' · ').filter((s) => s !== '');
  if (nextSegs.length > prevSegs.length) {
    // A segment was appended (her hip-hinge case) — the appended tail is the
    // real change, not whichever segment happens to sit first.
    return nextSegs[nextSegs.length - 1] as string;
  }
  for (let i = 0; i < nextSegs.length; i++) {
    if (nextSegs[i] !== prevSegs[i]) return nextSegs[i] as string;
  }
  return nextSegs[0] as string; // same shape front-to-back — shouldn't happen (changed=true got us here), first segment is the safe fallback
}

// A number/range (hyphen or en dash), optionally "… kg" for a load segment
// ("holding 1–2 kg (your pick)" → "1–2 kg"; "8-10 each side" → "8-10"). Tried
// as a KG phrase first — a load reads better with its unit than a bare
// range would — then as a bare leading number/range.
const KG_RE = /(\d+(?:[–-]\d+)?\s*kg)/;
const LEADING_NUM_RE = /^(\d+(?:[–-]\d+)?)/;
function extractStepNumber(segment: string): string {
  const kg = KG_RE.exec(segment);
  if (kg) return kg[1] as string;
  const lead = LEADING_NUM_RE.exec(segment.trim());
  return lead ? (lead[1] as string) : '';
}

function summaryFor(
  ex: MoveFeelExercise,
  kind: SteppedMoveKind,
  qty: number | undefined,
  prevReps: string | undefined
): string {
  const label = displayLabel(ex);
  if (kind === 'seconds' && qty !== undefined) return `${label} ${qty}s`;
  if (kind === 'minutes' && qty !== undefined) return `${label} ${qty} min`;
  const seg = changedSegment(ex.reps ?? '', prevReps);
  const num = extractStepNumber(seg);
  return num ? `${label} ${num}` : label;
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
      summary: summaryFor(nx, kind, qty, pv?.reps),
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

// v59 (Sep 28 2026), CHECK-v58 round 2 must #R2-S1: even with the short
// numeric summaries above, a week with several stepped moves still didn't
// fit the pre-log's one line (R2·Week4's 3 moves ran past the exact
// zero-scroll floor). This caps what's SHOWN, not what's computed —
// `currentSteppedMoves` still returns every stepped move (the chip still
// asks about all of them mid-workout); only the pre-log preview line
// truncates.
//
// A character-count budget was tried first and DROPPED: real letters vary
// enough in width that it isn't reliable — measured against the real font
// (app.ts's fitSteppedLine, driven live), "Stepped this week: supported
// split squat 8-10" (45 chars) already wraps to 2 lines while "Stepped this
// week: ride 12 min · wall sit 45s" (also 45 chars) doesn't. `steppedLineFor`
// only builds the STRING for a given shown-count; the real fit — shrinking
// `shown` until the text's actual rendered width clears the actual box
// width — is a DOM measurement, so it lives in app.ts's fitSteppedLine, not
// here (this module stays DOM-free on purpose, its own header comment).
const STEPPED_LINE_PREFIX = 'Stepped this week: ';

export function steppedLineFor(stepped: readonly SteppedMove[], shown: number): string {
  if (stepped.length === 0) return '';
  const capped = Math.max(1, Math.min(shown, stepped.length));
  const hidden = stepped.length - capped;
  const more = hidden > 0 ? ` · +${hidden} more` : '';
  const text = stepped
    .slice(0, capped)
    .map((s) => s.summary)
    .join(' · ');
  return `${STEPPED_LINE_PREFIX}${text}${more}`;
}

// The untrimmed line — app.ts renders this first (every stepped move
// shown), then fitSteppedLine trims it live to whatever the real box
// actually fits.
export function steppedLineText(stepped: readonly SteppedMove[]): string {
  return steppedLineFor(stepped, stepped.length);
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

// v61 (Sep 28 2026), spec item f — her words, Sun Sep 27 15:42: "I want to be
// able to also say if it was easy, hard, right" about the elliptical ride,
// EVERY time, not just weeks it "stepped" (steppedMovesForWorkout's own
// gate, above). `withOverrideFeel` bypasses that gate for exactly one slug —
// rebuilding the saved string with that slug's segment replaced (or added),
// everything else untouched. Kept separate from moveFeelString on purpose:
// that function's whole contract is "only slugs `stepped` can vouch for" —
// this is the one deliberate, always-on exception the ride (and Workout D,
// same slug) needs, not a second door into the same rule.
export function withOverrideFeel(
  base: string | null,
  slug: string,
  feel: MoveFeelValue,
  qty: number,
  unit: 'kg' | 's' | 'min'
): string {
  const kept = parseMoveFeelString(base).filter((p) => p.slug !== slug);
  const rebuilt = kept.map(
    (p) => `${p.slug}=${p.feel ?? ''}${p.qtyRaw !== null ? `@${p.qtyRaw}` : ''}`
  );
  rebuilt.push(`${slug}=${feel}@${qty}${unit}`);
  return rebuilt.join(';');
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
