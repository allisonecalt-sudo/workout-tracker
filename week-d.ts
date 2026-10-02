// week-d.ts — Workout D's own calendar window per completion-model week, as
// a pure module (Oct 2 2026, v61 fix pass 2). Same discipline as week.ts
// itself (no DOM, no fetch, no Supabase): app.ts does the reading, this file
// only decides which week a D belongs to.
//
// WHY: week.ts's own session model (walkWeeks) tracks only A/B/C — D never
// opens or closes a week (unchanged, her rule; week.ts's own header). But
// Home/Progress/the Done card/the weekly peek still need to know WHICH week
// a given D belongs to, for the "N of 4" count and (completionWeekDots,
// app.ts) the week-strip's D dot. `weekHasD`/`weekCountLine` used to live in
// app.ts (v61 fix pass 1), keyed on a single span's own strict
// [openedAt, closedAt ?? now) window. CHECK-v61.md round 2's must #1: that
// window is an EVENT-to-event window, not a calendar one, and undercounts
// her real rows two ways:
//   - a week literally OPENS at the first A/B/C session's own timestamp,
//     which can land HOURS after a D logged earlier the same calendar day
//     (her real Sep 28 order: D first, then A) — the D falls before
//     `openedAt` and drops out.
//   - a week CLOSES at its third A/B/C session's own timestamp, so a D
//     logged later the SAME day (after C closes the week) falls after
//     `closedAt` and drops out too — her exact complaint, CHECK-v61.md
//     round 2: "she did not say one of four."
//
// THE FIX: each week owns a CALENDAR window, not an event-to-event one —
// [min(openedAt, that week's own Sat/Sun anchor weekend), the next week's
// own window start). A D before the window counts back into the PREVIOUS
// week (week.ts's own gap rule 3 — "a session before then counts as an
// extra"); a D at or after the window's start counts toward THIS week even
// before the first A/B/C that formally opens it, because the anchor is
// never LATER than openedAt, only ever earlier or equal (see
// `anchorWeekendStart`'s own comment).
//
// Key-based, not reference-based: a caller may have obtained its target
// WeekSpan from a DIFFERENT `walkWeeks()` call than the `model` it passes
// here (e.g. `shownWeek()` calls `weekModel()` internally) — looking the
// span up again by its own `key` inside `model.spans` means two
// structurally-identical-but-not-reference-equal results still agree,
// instead of silently miscounting on an `indexOf` that never matches.

import type { WeekSpan, WeekKey, PendingWeek } from './week.js';

/** The minimal shape a D log needs for attribution — just its date, same
 * "pure, no app.ts LogEntry import" discipline as week.ts's own SessionLite. */
export type DLogLite = { date: string };

export type DWeekModel = {
  spans: readonly WeekSpan[];
  open: WeekSpan | null;
  pending: PendingWeek | null;
};

/** Which week's D-window to compute: a specific CLOSED span by key (the
 * weekly peek, or Progress's per-week loop), the live open span, or — mid-
 * gap, nothing open yet — the pending week itself. */
export type DWeekTarget = { kind: 'span'; key: WeekKey } | { kind: 'open' } | { kind: 'pending' };

/** The Saturday/Sunday "anchor weekend" that CONTAINS this instant, at local
 * midnight. A week's own `openedAt` (or a pending week's `opensAt`) is
 * sometimes LATER than this (an ordinary same-day timestamp — the session
 * that actually opened the week) and sometimes exactly EQUAL to it (a close
 * that waited past Monday freezes `openedAt` at this exact boundary,
 * week.ts's own `formatLocalIso`) — never earlier. Same local-Date
 * convention as week.ts (getDay()/getDate() — Asia/Jerusalem in practice;
 * see week.ts's own "ALSO STILL OPEN" note on timezone travel, unchanged
 * here). Landing on the Sunday half of an anchor weekend backs up to the
 * Saturday before it, so a D logged Saturday morning still counts even when
 * the week's own opening session landed Sunday.
 */
function anchorWeekendStart(iso: string): Date {
  const d = new Date(iso);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (day === 0) midnight.setDate(midnight.getDate() - 1); // the Sat before it
  return midnight;
}

/** min(openedAt, its own anchor weekend start), as a timestamp — always the
 * anchor in practice (never later than `openedAt` itself, see
 * `anchorWeekendStart`'s own comment). Kept as its own named step so the
 * window-building code below reads like the spec's own words. Exported for
 * the unit tests (CHECK-v61.md round 2 should #7) to probe directly. */
export function weekWindowStart(openedAtOrOpensAt: string): number {
  return Math.min(
    new Date(openedAtOrOpensAt).getTime(),
    anchorWeekendStart(openedAtOrOpensAt).getTime()
  );
}

/** True when a D log's timestamp falls in `[start, end)` — `end: null` means
 * unbounded (the live week, open or pending: nothing has started after it
 * yet, so it owns every D from its own start forward). */
export function hasDInWindow(
  start: number,
  end: number | null,
  dLogs: readonly DLogLite[]
): boolean {
  return dLogs.some((l) => {
    const t = new Date(l.date).getTime();
    return t >= start && (end === null || t < end);
  });
}

function spanByKey(spans: readonly WeekSpan[], key: WeekKey): WeekSpan | null {
  return spans.find((s) => s.key.round === key.round && s.key.week === key.week) ?? null;
}

/** The raw ISO this target's window starts from (before the anchor-weekend
 * floor), or null when the target doesn't exist in `model` (a stale key, or
 * `{kind: 'pending'}` with no actual gap right now) — null means "no window,
 * never has D" rather than guessing. */
function rawStartIso(target: DWeekTarget, model: DWeekModel): string | null {
  if (target.kind === 'pending') return model.pending?.opensAt ?? null;
  if (target.kind === 'open') return model.open?.openedAt ?? null;
  return spanByKey(model.spans, target.key)?.openedAt ?? null;
}

/** The raw ISO the NEXT week's window starts from — i.e. where this
 * target's own window ends (exclusive) — or null when nothing has started
 * after it yet (the open span, or the pending week: both are "the current
 * one"). For a closed span, that's the next span in the array if there is
 * one, else the live open span, else the pending week, else null (the
 * "shouldn't happen" case — every real model has an open or pending week
 * once the completion model has launched at all). */
function rawEndIso(target: DWeekTarget, model: DWeekModel): string | null {
  if (target.kind === 'open' || target.kind === 'pending') return null;
  const idx = model.spans.findIndex(
    (s) => s.key.round === target.key.round && s.key.week === target.key.week
  );
  if (idx === -1) return null;
  const next = model.spans[idx + 1];
  if (next) return next.openedAt;
  if (model.open) return model.open.openedAt;
  if (model.pending) return model.pending.opensAt;
  return null;
}

/** The actual `[start, end)` this target's window resolves to (`end: null` =
 * unbounded), or null when the target doesn't exist in `model` at all.
 * Shared by `weekHasD` (does ANY D fall in THIS week's window) and
 * `weekTargetForD` (which week does THIS ONE D fall in) so the two never
 * disagree about where a boundary sits. */
function weekWindowFor(
  target: DWeekTarget,
  model: DWeekModel
): { start: number; end: number | null } | null {
  const startIso = rawStartIso(target, model);
  if (startIso === null) return null;
  const endIso = rawEndIso(target, model);
  return {
    start: weekWindowStart(startIso),
    end: endIso === null ? null : weekWindowStart(endIso),
  };
}

/** Does Workout D land inside THIS week's own calendar window? Replaces the
 * span-only `weekHasD` app.ts carried through v61's first fix pass — see
 * this file's header for why a strict event-to-event window undercounted
 * her real rows. */
export function weekHasD(
  target: DWeekTarget,
  model: DWeekModel,
  dLogs: readonly DLogLite[]
): boolean {
  const win = weekWindowFor(target, model);
  if (win === null) return false;
  return hasDInWindow(win.start, win.end, dLogs);
}

/** Which week a SINGLE D's own date falls into — the closed span whose
 * window contains it, the live open span, or the pending week — walking the
 * same windows `weekHasD` checks, oldest first (CHECK-v61.md round 2 must
 * #1, repro 3: "C closes then D the same day"). `weekHasD` answers "is
 * there any D at all in week N"; the Done card needs the opposite
 * direction for the week it JUST shows — "which week does THIS ONE D
 * belong to" — because a D saved minutes after a close is still obviously
 * that week's own close, never a brand-new week she hasn't reached yet.
 * Returns null only when `model` has nothing at all (the "shouldn't happen"
 * case `shownWeek()`'s own comment names — no span, no open, no pending). */
export function weekTargetForD(dDateIso: string, model: DWeekModel): DWeekTarget | null {
  const t = new Date(dDateIso).getTime();
  const candidates: DWeekTarget[] = [
    ...model.spans.map((s): DWeekTarget => ({ kind: 'span', key: s.key })),
    ...(model.open ? [{ kind: 'open' } as const] : []),
    ...(model.pending ? [{ kind: 'pending' } as const] : []),
  ];
  for (const target of candidates) {
    const win = weekWindowFor(target, model);
    if (win && t >= win.start && (win.end === null || t < win.end)) return target;
  }
  return null;
}

/** "0 of 4 · A, B and C to go" / "1 of 4 · B and C left" / "4 of 4 ✓" /
 * "complete · 3 of 4" — moved here unchanged from app.ts (v61 fix pass 1's
 * own comment on the string shapes still applies; see its header there). A
 * CLOSED span (all three of A/B/C done) reads "4 of 4 ✓" once D counted too,
 * or "complete · 3 of 4" when it didn't — the week closed on A/B/C alone,
 * exactly as week.ts's own rule says it must; D never closes or opens it. */
export function weekCountLine(shown: { span: WeekSpan | null }, hasD = false): string {
  const missing = shown.span ? shown.span.missing : (['A', 'B', 'C'] as const);
  const doneAbc = shown.span ? shown.span.done.length : 0;
  const done = doneAbc + (hasD ? 1 : 0);
  if (missing.length === 0) return hasD ? '4 of 4 ✓' : 'complete · 3 of 4';
  const missingWords =
    missing.length === 1
      ? (missing[0] as string)
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  const tail = missing.length === 3 ? `${missingWords} to go` : `${missingWords} left`;
  return `${done} of 4 · ${tail}`;
}
