// screens/history.ts - the Sessions list, the Session detail and the history edit
// (code-shape step 14, Oct 15 2026). Moved verbatim out of app.ts; no behaviour change,
// no version bump.
//
// WHAT: renderHistory (the Sessions list), renderHistoryDetail (one session),
// renderHistoryEdit (fix a past ride's numbers + note), and attachHistoryHandlers (the
// Session screen's Back, Edit, the edit form's Back / Save / level steppers / per-keystroke
// inputs). The detail's Back reads where she opened it from and the scroll she left
// (ui.detailOpenedAtScroll: written by the shared data-detail click in app.ts).
// WHY: one screen per module (see screens/README.md). The edit saves through
// actions.ts saveHistoryEdit and keeps its draft in ui.historyEditDraft, because
// actions.ts reads and clears that draft too (so it is shared, not module-local).
// Imports the shared layer only: never app.ts, never another screen.

import { requestRender } from '../bus.js';
import { bindClick } from '../dom.js';
import { state, loadLogs } from '../state.js';
import { ui } from '../ui.js';
import { saveHistoryEdit } from '../actions.js';
import { escapeHtml, formatMmSs } from '../format.js';
import { formatClock, formatDateLong } from '../dates.js';
import { renderActionBar } from '../action-bar.js';
import { splitNotes, sessionCardio, type SessionCardio } from '../cardio-notes.js';
import {
  ELLIPTICAL_MAX_LEVEL,
  ELLIPTICAL_START_LEVEL,
  clampEllipticalLevel,
  lastEllipticalLevel,
  rideTimeReadback,
  rideFitHint,
  parseMmSs,
  parseKmReading,
  parseKcalReading,
} from '../cardio-readings.js';
import { formatWorkoutTime } from '../timing.js';
import { TIMING_LAUNCH_LABEL } from '../sync.js';
import { planForLog } from '../week-clock.js';
import {
  sessionWordParts,
  renderSessionRow,
  logsNewestFirst,
  CLAUDE_NOTE_LABEL,
} from '../session-row.js';
import type { LogEntry } from '../types.js';

// ---------------------------------------------------------------------------
// SESSIONS (v48 · P6, Sep 24 2026). DECISIONS §5 Sessions + Session detail:
// "Three names for one thing, and a Back at the bottom only here" (uxui history
// 3/5) → one name (Sessions / Session), ONE row template for Sessions AND Weekly
// review, × Back in the header, the list's scroll kept when she comes back.
// Voice rule: her words verbatim, never the tail of a machine log line.
// ---------------------------------------------------------------------------

// "Elliptical 10 min · L7 · 1.4 km · 63.4 kcal · 10:02 · pulse 128" /
// "Apartment 10 min" / "Walk 12 min".
function cardioText(c: SessionCardio): string {
  const mins = c.minutes !== null ? ` ${c.minutes} min` : '';
  if (c.lane === 'elliptical') {
    return [
      `Elliptical${mins}`,
      c.level !== null ? `L${c.level}` : '',
      c.km !== null ? `${c.km} km` : '',
      c.kcal !== null ? `${c.kcal} kcal` : '',
      c.timeSec !== null ? formatMmSs(c.timeSec) : '',
      c.pulse !== null ? `pulse ${c.pulse}` : '',
    ]
      .filter((s) => s !== '')
      .join(' · ');
  }
  return `${c.lane === 'apartment' ? 'Apartment' : 'Walk'}${mins}`;
}

// "curl=easy;row=right" → "curl easy · row right".
function armFeelText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .split(';')
    .map((p) => p.split('=').join(' '))
    .filter((p) => p.trim() !== '')
    .join(' · ');
}

export function renderHistory(): string {
  const logs = logsNewestFirst();
  const header = `
    <div class="screen-header">
      <h2>Sessions</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>`;
  if (logs.length === 0) {
    return `${header}<p class="empty">No sessions yet.</p>`;
  }
  // T2 §3.4: said once, here, not per-row — a row before the launch just
  // shows no "· N min" (formatWorkoutTime returns '' for it), which would
  // otherwise read as a silent gap instead of an honest "the app didn't ask".
  // T2 fix r1 (Sep 27 2026, checker's nice): the old wording ("shows from
  // Sep 27 2026") named a hard date, but the real mechanism is whether SHE
  // confirmed her start/finish — a plain fact she can check, not a promise
  // about which rows are old.
  const lengthNote = `<p class="history-length-note">Workout length shows once you've said your start and finish times — from ${TIMING_LAUNCH_LABEL}.</p>`;
  return `${header}${lengthNote}<div class="card session-list">${logs.map((l) => renderSessionRow(l, logs)).join('')}</div>`;
}

// One label + value row on the Session screen; `stack` puts a long value under
// its label (her note), so the label never runs into the text (UX audit #12).
function detailRow(
  label: string,
  value: string,
  opts: { stack?: boolean; id?: string } = {}
): string {
  const id = opts.id ? ` id="${opts.id}"` : '';
  return opts.stack
    ? `<div class="detail-row detail-row-stack"><span class="detail-label">${label}</span><div class="detail-note"${id} dir="auto">${value}</div></div>`
    : `<div class="detail-row"><span class="detail-label">${label}</span><span${id}>${value}</span></div>`;
}

export function renderHistoryDetail(): string {
  const logs = loadLogs();
  const log = logs.find((l) => l.id === state.historyDetailId);
  const header = `
    <div class="screen-header">
      <h2>Session</h2>
      <button class="quit-link" id="back-history" type="button">× Back</button>
    </div>`;
  if (!log) {
    return `${header}<p class="empty">That session isn't here anymore.</p>`;
  }
  // 10 rows → the ones that carry something (DECISIONS §5 Session detail).
  const rows: string[] = [];
  // T2 (Sep 27 2026) §3.4: the app's own open/close tap-time (`span`, from
  // startedAt/completedAt) is kept for CHECKING only from here down — it
  // used to be glued onto this same "Time" row as if it were how long she
  // trained ("TIME 21:48–22:14 · 26 min", her 22:33 "it really doesn't know
  // timing"). The row now shows only her confirmed workout time; `span`
  // moves to its own dim line below the card.
  const span =
    log.startedAt && log.completedAt
      ? `${formatClock(log.startedAt)}–${formatClock(log.completedAt)}`
      : log.startedAt
        ? `from ${formatClock(log.startedAt)}`
        : '';
  // T2 fix r1 (Sep 27 2026, checker's should #2): an unconfirmed row used to
  // push a "Time —" row here — the Sessions list above already says once,
  // at the top, that an old row shows no length, so a dash on every detail
  // repeated a gap she already knows about, and it's a row that "carries
  // nothing" (this card's own rule). Push it only when there's a real,
  // confirmed workout time to show; the dim "App open … — not workout time"
  // line below stays the one place an unconfirmed row is acknowledged.
  const workoutTime = formatWorkoutTime(log);
  if (workoutTime) rows.push(detailRow('Time', workoutTime));
  if (log.capacityBefore !== null || log.capacityAfter !== null) {
    rows.push(
      detailRow(
        'Capacity',
        log.capacityAfter === null
          ? `${log.capacityBefore}`
          : `${log.capacityBefore ?? '—'} → ${log.capacityAfter}`
      )
    );
  }
  // A is the only workout with a wall sit; on B/C the row asked about nothing.
  if (log.workout === 'A') {
    rows.push(detailRow('Wall sit', log.wallSitSec > 0 ? `${log.wallSitSec} s` : '—'));
  }
  rows.push(detailRow('Back pain', log.backPain === null ? '—' : `${log.backPain}/10`));
  // v54 fix r1 (Sep 27 2026), checker's nice #7: wristPain is optional AND
  // nullable (a pre-v49 row has no key at all) — `=== null` missed the
  // undefined case and printed "undefined/10". `== null` catches both.
  rows.push(detailRow('Wrist pain', log.wristPain == null ? '—' : `${log.wristPain}/10`));
  const cardio = sessionCardio(log);
  if (cardio)
    rows.push(detailRow('Cardio', escapeHtml(cardioText(cardio)), { id: 'detail-cardio' }));
  if (log.liteDay) {
    // Lite = one round less than the plan that week had. Swing fix (Sep 26
    // 2026): the plan follows the week the session counted toward. WK4 (Sep 27
    // 2026): planForLog resolves through the completion model post-launch —
    // see its own comment in program-week.ts, next to planDateForLog.
    const rounds = Math.max(1, planForLog(log).rounds - 1);
    rows.push(detailRow('Lite', `${rounds} round${rounds === 1 ? '' : 's'}`));
  }
  const arms = armFeelText(log.armFeel);
  if (arms) rows.push(detailRow('Arms', escapeHtml(arms)));
  // v62.3 F8: a part Claude wrote shows plain behind "Claude's note:", never
  // as if she said it; her own parts are unchanged.
  const wordParts = sessionWordParts(log);
  if (wordParts.length > 0) {
    const noteHtml = wordParts
      .map((p) => (p.claude ? `${CLAUDE_NOTE_LABEL} ${escapeHtml(p.text)}` : escapeHtml(p.text)))
      .join('\n');
    rows.push(detailRow('Note', noteHtml, { stack: true, id: 'detail-session-note' }));
  }
  const system = splitNotes(log.notes).system;
  if (system.length > 0) {
    rows.push(detailRow('System', escapeHtml(system.join(' · ')), { stack: true }));
  }
  // v53 fix (CHECK M2, Sep 26 2026): pendingEdit staying true (a queued edit
  // that hasn't landed, or a PATCH that failed/matched 0 rows) must be
  // VISIBLE here, on the one session this could be lost from — not just in
  // the header's generic "offline · N pending" count.
  const unsyncedLine = log.pendingEdit
    ? `<p class="detail-edit-unsynced" id="detail-edit-unsynced">Not saved online yet — will retry</p>`
    : '';
  // T2 §3.4: "one dim line for checking" — the app's own open/close tap-time,
  // labeled plainly so it never reads as a workout-length claim. Only when
  // there's a span to show at all (an old row with just `startedAt`, or none,
  // has nothing here to check against).
  const appTimeLine = span
    ? `<p class="detail-app-time" id="detail-app-time">App open ${span} — not workout time</p>`
    : '';
  return `
    ${header}
    <p class="detail-sub">Workout ${log.workout} · ${formatDateLong(log.date)}</p>
    <div class="card detail-card">${rows.join('')}</div>
    ${appTimeLine}
    ${unsyncedLine}
    <button class="btn-chip detail-edit-btn" id="edit-history-session" type="button">Edit</button>
  `;
}

// (Moved here from app.ts, step 18. Technical note: the draft is NOT module-level; it is ui.historyEditDraft, shared with actions.ts saveHistoryEdit.)
// v53 (Sep 26 2026) — the history-edit screen's draft (renderHistoryEdit,
// openHistoryEdit, saveHistoryEdit). Transient, module-level, like the cycle
// fields above — the screen is reached by an explicit tap (Edit, on the
// Session she's already looking at), not something an app close needs to
// resume mid-edit. `state.historyDetailId` still says WHICH session; this is
// only what she's typed so far.

// v53 (Sep 26 2026) — fix a past session's ride numbers. Her words: "I don't
// know how to update this information but ok workout b week 4 did on level 5,
// 10 min, .69 distant 62.4 calories... there have to be an easy way to enter
// the data." The Edit button on the Session screen above opens this: the same
// five console fields as the live ride-numbers screen (renderRideNumbersCard,
// same order — Time, Distance, Calories, Level, Pulse) plus her free-text
// note, but reading from/writing to the saved LogEntry instead of the live
// in-workout localStorage keys. Only these six fields ever change here
// (saveHistoryEdit) — never the date, the workout letter, or anything else on
// the session.
function openHistoryEdit(log: LogEntry): void {
  ui.historyEditDraft = {
    timeStr: typeof log.ellipticalTimeSec === 'number' ? formatMmSs(log.ellipticalTimeSec) : '',
    kmStr: typeof log.ellipticalKm === 'number' ? String(log.ellipticalKm) : '',
    kcalStr: typeof log.ellipticalKcal === 'number' ? String(log.ellipticalKcal) : '',
    level: typeof log.ellipticalLevel === 'number' ? log.ellipticalLevel : null,
    pulseStr: typeof log.ellipticalPulse === 'number' ? String(log.ellipticalPulse) : '',
    note: log.sessionNote ?? '',
  };
  state.screen = 'history-edit';
  requestRender();
}

// Same reading-row markup as renderRideNumbersCard (ell-reading classes), so
// the edit screen looks like the same control she already knows from the
// live ride — just aimed at a saved session instead of the one in progress.
function renderHistoryEditReadingRow(
  id: string,
  label: string,
  value: string,
  unit: string,
  opts: { type?: string; step?: string; min?: string; max?: string } = {}
): string {
  return `
      <label class="ell-reading" for="${id}">
        <span class="ell-reading-label">${label}</span>
        <span class="ell-reading-field">
          <input type="${opts.type ?? 'number'}" id="${id}" inputmode="${opts.type === 'text' ? 'numeric' : 'decimal'}" ${opts.step ? `step="${opts.step}"` : ''} ${opts.min ? `min="${opts.min}"` : ''} ${opts.max ? `max="${opts.max}"` : ''} placeholder="–" value="${escapeHtml(value)}" />
          ${unit ? `<span class="ell-reading-unit">${unit}</span>` : ''}
        </span>
      </label>`;
}

// v62.4 G1: the "can't all be true" line for the typed time + km + kcal (same rule as the live
// ride-numbers screen: ride.ts's plausibility, through cardio-readings.ts).
function historyFitHint(timeStr: string, kmStr: string, kcalStr: string): string {
  return rideFitHint(
    timeStr.trim() ? parseMmSs(timeStr) : null,
    kmStr.trim() ? parseKmReading(kmStr) : null,
    parseKcalReading(kcalStr)
  );
}

// Kept current per keystroke (no re-render): made when there is something to say, removed when
// the numbers fit.
function updateHistoryFitHint(): void {
  const d = ui.historyEditDraft;
  if (!d) return;
  const hint = historyFitHint(d.timeStr, d.kmStr, d.kcalStr);
  let el = document.getElementById('hist-fit-hint');
  if (!hint) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('p');
    el.id = 'hist-fit-hint';
    el.className = 'ell-fit-hint';
    document.getElementById('hist-time-readback')?.after(el);
  }
  el.textContent = hint;
}

export function renderHistoryEdit(): string {
  const header = `
    <div class="screen-header">
      <h2>Edit session</h2>
      <button class="quit-link" id="back-history-edit" type="button">× Back</button>
    </div>`;
  const log = loadLogs().find((l) => l.id === state.historyDetailId);
  if (!log || !ui.historyEditDraft) {
    return `${header}<p class="empty">That session isn't here anymore.</p>`;
  }
  const draft = ui.historyEditDraft;
  const level = draft.level;
  const fitHint = historyFitHint(draft.timeStr, draft.kmStr, draft.kcalStr);
  return `
    ${header}
    <p class="detail-sub">Workout ${log.workout} · ${formatDateLong(log.date)}</p>
    <div class="card ell-after-card">
      <div class="ell-readings-title">Ride numbers</div>
      <p class="ell-numbers-note">Only these numbers and the note change — nothing else about this session.</p>
      <div class="ell-readings-row">
        ${renderHistoryEditReadingRow('hist-time', 'Time', draft.timeStr, '', { type: 'text' })}
        ${renderHistoryEditReadingRow('hist-km', 'Distance', draft.kmStr, 'km', { step: '0.01', min: '0' })}
        ${renderHistoryEditReadingRow('hist-kcal', 'Calories', draft.kcalStr, 'kcal', { step: '0.1', min: '0' })}
      </div>
      <p class="ell-time-readback" id="hist-time-readback"${rideTimeReadback(draft.timeStr) ? '' : ' hidden'}>${escapeHtml(rideTimeReadback(draft.timeStr))}</p>
      ${fitHint ? `<p class="ell-fit-hint" id="hist-fit-hint">${escapeHtml(fitHint)}</p>` : ''}
      <div class="ell-field ell-field-level">
        <span class="ell-field-label">Level</span>
        <div class="ell-level-controls">
          <div class="settings-stepper ell-stepper">
            <button class="settings-stepper-btn" id="hist-level-down" type="button" aria-label="Level down" ${level !== null && level <= 1 ? 'disabled' : ''}>−</button>
            <span class="settings-stepper-val${level === null ? ' is-empty' : ''}" id="hist-level">${level ?? '—'}</span>
            <button class="settings-stepper-btn" id="hist-level-up" type="button" aria-label="Level up" ${level !== null && level >= ELLIPTICAL_MAX_LEVEL ? 'disabled' : ''}>+</button>
          </div>
        </div>
      </div>
      <div class="ell-readings-row">
        ${renderHistoryEditReadingRow('hist-pulse', 'Pulse', draft.pulseStr, 'bpm', { step: '1', min: '30', max: '230' })}
      </div>
      <label class="field note-field">
        <span class="label-text">Note</span>
        <textarea id="hist-note" rows="3" maxlength="500" dir="auto" enterkeyhint="done" placeholder="Knee fine, stopped the elliptical early…">${escapeHtml(draft.note)}</textarea>
      </label>
    </div>
    ${renderActionBar(`<button class="btn-large btn-primary" id="save-history-edit" type="button">Save</button>`)}
  `;
}

// The Session screen's bindings, in the order they had in attachHandlers().
export function attachHistoryHandlers(): void {
  // v48 · P6 (Sep 24 2026): the Session screen's × Back goes where she came
  // from (Weekly review / Sessions / home), at the scroll she left it.
  bindClick('back-history', () => {
    const target = state.detailReturnTo ?? 'history';
    ui.pendingScrollRestore = ui.detailOpenedAtScroll[target] ?? null;
    state.screen = target;
    state.historyDetailId = null;
    state.detailReturnTo = null;
    requestRender();
  });

  // v53 (Sep 26 2026) — fix a past session's ride numbers (her ask: "there
  // have to be an easy way to enter the data"). The Edit button lives on the
  // Session screen; its own × Back just closes the edit and returns there
  // (state.historyDetailId is unchanged either way — still the same session).
  bindClick('edit-history-session', () => {
    const log = loadLogs().find((l) => l.id === state.historyDetailId);
    if (!log) return;
    openHistoryEdit(log);
  });
  bindClick('back-history-edit', () => {
    ui.historyEditDraft = null;
    state.screen = 'history-detail';
    requestRender();
  });
  bindClick('save-history-edit', () => {
    saveHistoryEdit();
  });
  bindClick('hist-level-down', () => {
    if (!ui.historyEditDraft) return;
    const from = ui.historyEditDraft.level ?? lastEllipticalLevel() ?? ELLIPTICAL_START_LEVEL;
    ui.historyEditDraft = { ...ui.historyEditDraft, level: clampEllipticalLevel(from - 1) };
    requestRender();
  });
  bindClick('hist-level-up', () => {
    if (!ui.historyEditDraft) return;
    const from = ui.historyEditDraft.level ?? lastEllipticalLevel() ?? ELLIPTICAL_START_LEVEL;
    ui.historyEditDraft = { ...ui.historyEditDraft, level: clampEllipticalLevel(from + 1) };
    requestRender();
  });
  // Per-keystroke, no re-render (keeps focus) — same pattern as the live
  // ride-numbers screen's ell-km/ell-pulse/ell-kcal/ell-time listeners.
  const histTime = document.getElementById('hist-time') as HTMLInputElement | null;
  histTime?.addEventListener('input', () => {
    if (ui.historyEditDraft) ui.historyEditDraft.timeStr = histTime.value;
    const readback = document.getElementById('hist-time-readback');
    if (readback) {
      readback.textContent = rideTimeReadback(histTime.value);
      readback.hidden = readback.textContent === '';
    }
    updateHistoryFitHint();
  });
  const histKm = document.getElementById('hist-km') as HTMLInputElement | null;
  histKm?.addEventListener('input', () => {
    if (ui.historyEditDraft) ui.historyEditDraft.kmStr = histKm.value;
    updateHistoryFitHint();
  });
  const histKcal = document.getElementById('hist-kcal') as HTMLInputElement | null;
  histKcal?.addEventListener('input', () => {
    if (ui.historyEditDraft) ui.historyEditDraft.kcalStr = histKcal.value;
    updateHistoryFitHint();
  });
  const histPulse = document.getElementById('hist-pulse') as HTMLInputElement | null;
  histPulse?.addEventListener('input', () => {
    if (ui.historyEditDraft) ui.historyEditDraft.pulseStr = histPulse.value;
  });
  const histNote = document.getElementById('hist-note') as HTMLTextAreaElement | null;
  histNote?.addEventListener('input', () => {
    if (ui.historyEditDraft) ui.historyEditDraft.note = histNote.value;
  });
}
