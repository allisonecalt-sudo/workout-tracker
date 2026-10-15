// session-row.ts - the ONE session row, shared by Sessions (History) and Weekly review (code-shape
// step 13a2, Oct 15 2026).
//
// What: renderSessionRow (badge, date + confirmed time, wall-sit sparkline, meta line, her words),
// its date label and the words it quotes, the back-pain stop line the row and Progress's back-pain
// chart both colour by, and logsNewestFirst (the list History feeds it). Two screens draw this row,
// so it cannot live in either screen module. Moved verbatim out of app.ts - no behaviour change, no
// version bump. Strings out, no DOM writes; reads logs from state.ts only. Never imports app.ts or a screen.

import { formatWorkoutTime } from './timing.js';
import type { LogEntry } from './types.js';
import { loadLogs } from './state.js';
import { SHORT_MONTHS, escapeHtml } from './format.js';
import { splitNotes } from './cardio-notes.js';
import { getWallSitTrend, renderSparkline } from './viz.js';

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Sat Sep 19" — the weekday makes the Saturday swing readable in the list.
export function formatRowDate(iso: string): string {
  const d = new Date(iso);
  return `${SHORT_WEEKDAYS[d.getDay()]} ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// Her words for one session, verbatim: the v48 note, the old one-word box, and
// (v47 rows) whatever she wrote into notes — the machine marker and the app's
// annotations stripped off. One entry per line.
export function sessionWords(l: LogEntry): string {
  const parts: string[] = [];
  const note = (l.sessionNote ?? '').trim();
  if (note) parts.push(note);
  const word = (l.word || '').trim();
  if (word && word !== note) parts.push(word);
  parts.push(...splitNotes(l.notes).words);
  return parts.join('\n');
}

// The back-pain number turns amber only at her own stop line — "Back pain at
// 3/10 → stop that exercise". A 1/10 lit up like a verdict (uxui weekly 2/5).
export const BACK_PAIN_STOP_AT = 3;

// ONE row, everywhere a session is listed (Sessions, Weekly review):
// badge · "Sat Sep 19 · 40 min" · the wall-sit sparkline (A only) · a dim meta
// line · her words, verbatim. `logs` = newest-first by date (for the sparkline).
export function renderSessionRow(l: LogEntry, logs: LogEntry[]): string {
  const idAttr = l.id ? `data-detail="${escapeHtml(l.id)}"` : '';
  const trend = l.workout === 'A' && l.wallSitSec > 0 ? getWallSitTrend(logs, l.id ?? null) : [];
  const spark = renderSparkline(trend);
  // v53 (Sep 26 2026): "back pain" (was "back") — labeled, not converted. The
  // stored number here is still PAIN (higher = worse); only the live 1-10
  // TAP on the pre/post-log screens flipped to "feel" (10 = fine). Naming
  // this one plainly as pain keeps the two screens from reading as the same
  // scale in opposite directions (her ask: "make it all align").
  const back =
    l.backPain === null
      ? 'back pain —'
      : `back pain <span class="session-back${l.backPain >= BACK_PAIN_STOP_AT ? ' session-back-warn' : ''}">${l.backPain}</span>`;
  const wall =
    // v46: B and C have no wall sit — "wall 0s" there read as a zero.
    l.wallSitSec > 0 || l.workout === 'A' ? ` · wall ${l.wallSitSec}s` : '';
  const words = sessionWords(l).split('\n')[0] ?? '';
  // T2 (Sep 27 2026), PLAN-2026-09-26.md §3.4/§10: "about N min" through the
  // one shared formatter, never the app's own tap-to-tap durationSec — that
  // was "76 min"/"1s" shown as fact (her 22:33 "it really doesn't know
  // timing"). formatWorkoutTime already returns '' on an unconfirmed/old row
  // (no her_start_at/her_end_at pair), which is the honest "old rows show no
  // length" behavior §3.4 asks for — no fallback needed here.
  const workoutTime = formatWorkoutTime(l);
  return `
    <button class="history-row history-row-btn session-row" ${idAttr} type="button">
      <span class="history-workout-badge">${l.workout}</span>
      <div class="session-row-body">
        <div class="history-date">${formatRowDate(l.date)}${workoutTime ? ` · ${workoutTime}` : ''}${spark ? ` <span class="history-sparkline-wrap">${spark}</span>` : ''}</div>
        <div class="history-meta">cap ${l.capacityBefore ?? '—'}→${l.capacityAfter ?? '—'}${wall} · ${back}</div>
        ${words ? `<div class="history-word" dir="auto">${escapeHtml(words)}</div>` : ''}
      </div>
      <span class="session-chev" aria-hidden="true">›</span>
    </button>`;
}

export function logsNewestFirst(): LogEntry[] {
  return [...loadLogs()].sort((a, b) => b.date.localeCompare(a.date));
}
