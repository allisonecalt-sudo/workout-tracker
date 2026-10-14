// screens/settings.ts - THE SETTINGS SCREEN (Ship 6) + its Gear card, the quiet
// "Period started today" row and the Data fold's export / import / clear
// (code-shape step 12b, Oct 14 2026). Moved out of app.ts verbatim; no behaviour
// change, no version bump.
//
// Why: Settings is reference, not action - one screen, one file. It owns its render
// functions, its click handlers and the data helpers the Data fold drives.
// Imports state / bus / dom / format / actions / week-clock / version / pure modules only -
// NEVER app.ts or another screen. app.ts imports renderSettings (render() switch) and
// attachSettingsHandlers (attachHandlers(), same slot as before).
//
// Decided (ui-field audit): `ui.settingsDataOpen` STAYS in ui - app.ts's home-header gear
// (`open-settings`) resets it to false, so a second file writes it. No other Settings-only
// `let` existed. HOLD_TO_CLEAR_MS moved here (only the Clear button used it);
// HOLD_TO_SKIP_MS / wireHoldToSkip are in dom.ts (the rest screen shares them), APP_VERSION /
// BUILD_DATE in version.ts. showQuitConfirmPanel is NOT Settings' (it is the workout's Quit
// panel) and stays in app.ts.
//
// Next: nothing - the step list continues with the other screens (README.md).

import {
  STORAGE_KEY,
  SETTING_KEYS,
  setSetting,
  getRestSec,
  getPreCountSec,
  getBeepsEnabled,
  getHowToFirstExpand,
  isValidLogEntry,
  loadLogs,
  writeLogs,
} from '../state.js';
import { ui } from '../ui.js';
import { requestRender } from '../bus.js';
import { bindClick, wireHoldToSkip } from '../dom.js';
import { escapeHtml, formatMonthDay } from '../format.js';
import { genId } from '../actions.js';
import { isNowAfterCompletionLaunch, shownWeek } from '../week-clock.js';
import { APP_VERSION, BUILD_DATE } from '../version.js';
import { ROUNDS, getProgramWeekCount } from '../program.js';
import type { LogEntry } from '../types.js';

const HOLD_TO_CLEAR_MS = 500;

// Gear & recovery. Equipment is ownership-gated: a move only appears in a
// workout once Allison says she owns the kit. Also holds Lisa's neck release.
// v48 · P6 (Sep 24 2026): the paragraphs became one row of chips (✅ = in the
// workout now, ⬜ = worth getting) plus the Neck release as its own titled
// card (DECISIONS §5). The "tell Claude" lines are gone — the 2 kg trigger is
// now a question the app asks on home, from her arm-feel taps (her Jul 3 ask).
const GEAR_CHIPS: { have: boolean; text: string }[] = [
  { have: true, text: 'Yellow band · B clamshells' },
  { have: false, text: '2nd 1 kg' },
  // v55 (Sep 27 2026): she has the 2 kg now ("I have 2kg now", 20:08) — the
  // old "ask Lisa when the 1 kg feels easy" line is gone with the rest of
  // the Lisa-gating copy (rule 8e). The LOAD CHIP is where she uses it.
  // v55 · fix r1 (Sep 27 2026): dropped "pairs" — it implied two of each
  // weight, which contradicted the unchecked "2nd 1 kg" chip below it.
  // v55 · fix r3 (Sep 28 2026, nice): "pairs" is back — she does own a pair
  // of each (that's what "your pick by pain" every set implies), and the
  // separate checked "1 kg · A+B arm block" chip above was just this same
  // fact said twice, so it's dropped instead of the word.
  { have: true, text: '1 kg + 2 kg pairs · your pick by pain' },
  { have: false, text: 'Peanut (2 tennis balls in a sock)' },
];

function renderGearCard(): string {
  const chips = GEAR_CHIPS.map(
    (g) =>
      `<span class="gear-chip${g.have ? ' gear-chip-have' : ''}">${g.have ? '✅' : '⬜'} ${escapeHtml(g.text)}</span>`
  ).join('');
  return `
    <div class="card settings-card gear-card">
      <div class="settings-section-label">Gear</div>
      <div class="gear-chips">${chips}</div>
    </div>
    <div class="card settings-card neck-card">
      <div class="settings-section-label">Neck release · ~10 min</div>
      <!-- v55 · fix r1 (Sep 27 2026): "Lisa" was still in this user-visible
           label + copy (checked live at 412x915). A source grep for "Lisa"
           as a user-visible string is the rule (rule 8e, "Get rid of Lisa");
           the attribution moves here, in a comment, not on screen — this
           release traces to Lisa Cohen's original flag, kept for history. -->
      <p class="gear-note">Two tennis balls in a sock at the base of your skull — where the skull meets the neck, one ball either side of your spine. Lie back, let your head’s weight rest on them, breathe slow (3 deep breaths), and relax ~10 min. Releases the neck/shoulder tension. Do it separately from your session.</p>
    </div>
  `;
}

// Settings' own quiet row (spec: "the Progress card (and a quiet row in
// Settings)") — same logPeriodStart/undoPeriodStart, its own ids so both
// screens' handlers can coexist without clashing.
function renderCycleSettingsRow(): string {
  if (ui.cycleUndoStartDate) {
    if (!ui.cycleUndoCreated) {
      return `
        <div class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Already logged ${formatMonthDay(ui.cycleUndoStartDate)}</div>
          </div>
        </div>`;
    }
    return `
      <div class="settings-row">
        <div class="settings-row-text">
          <div class="settings-row-title">Logged ${formatMonthDay(ui.cycleUndoStartDate)}</div>
        </div>
        <button class="settings-inline-btn" id="settings-cycle-undo" type="button">Undo</button>
      </div>`;
  }
  return `
    <div class="settings-row">
      <div class="settings-row-text">
        <div class="settings-row-title">Period started today</div>
        <div class="settings-row-caption">Logs today's date. More in Progress › Your cycle.</div>
      </div>
      <button class="settings-inline-btn" id="settings-cycle-today" type="button">Log</button>
    </div>`;
}

// ---------- Ship 6: Settings screen ----------
//
// Reachable via the small gear icon in the home header (top-right). NOT a
// primary CTA — settings is reference, not action. Sections: Audio, Timing,
// Display, Gear, Neck release, Data (folded), About.
//
// All toggles persist to localStorage via setSetting/getSetting. Data section
// has export / import / hold-to-confirm clear. Import is merge-only; Clear
// is local-only (Supabase rows preserved) per the archive-not-delete rule.

// APP_VERSION is declared once near the top (single source of truth, shown in
// the home-header tag); the About caption below reuses it.
const GITHUB_REPO_URL = 'https://github.com/allisonecalt-sudo/workout-tracker';

export function renderSettings(): string {
  const beepsOn = getBeepsEnabled();
  const restSec = getRestSec();
  const preCount = getPreCountSec();
  const howToOn = getHowToFirstExpand();
  const logCount = loadLogs().length;
  const latestRound = ROUNDS[ROUNDS.length - 1] ?? ROUNDS[0]!;
  // WK4 (Sep 27 2026), PLAN-2026-09-26.md §2.4 "Settings › About": before the
  // launch, unchanged ("Program weeks: N" — a raw count she'd have to
  // translate). At/after it, the same Round/Week she reads everywhere else on
  // the completion model — the round's own start is still the calendar
  // anchor pre-launch already used ("since Aug 29"); only the WEEK now comes
  // from week.ts instead of a raw PROGRAM-row count.
  const aboutWeekRow = isNowAfterCompletionLaunch()
    ? (() => {
        const key = shownWeek().key;
        const round = ROUNDS.find((r) => r.num === key.round) ?? latestRound;
        return {
          title: `Round ${key.round} · Week ${key.week}`,
          caption: `since ${formatMonthDay(round.start + 'T00:00:00')}`,
        };
      })()
    : {
        title: `Program weeks: ${getProgramWeekCount()}`,
        caption: `Round ${latestRound.num} · from ${formatMonthDay(latestRound.start + 'T00:00:00')}`,
      };

  return `
    <div class="screen-header">
      <h2>Settings</h2>
      <button class="quit-link" id="back-home" type="button">× Back</button>
    </div>

    <div class="settings-screen">

      <div class="card settings-card">
        <div class="settings-section-label">Audio</div>
        <label class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Beep sounds</div>
            <div class="settings-row-caption">Timer count-downs and finish chime.</div>
          </div>
          <span class="settings-toggle ${beepsOn ? 'on' : 'off'}">
            <input type="checkbox" id="setting-beeps" ${beepsOn ? 'checked' : ''} />
            <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
          </span>
        </label>
      </div>

      <div class="card settings-card">
        <div class="settings-section-label">Timing</div>
        <div class="settings-stepper-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Rest duration</div>
            <div class="settings-row-caption">Between main-set exercises. 0 = straight on · up to 180 s.</div>
          </div>
          <div class="settings-stepper" data-stepper="rest">
            <button class="settings-stepper-btn" id="rest-dec" type="button" aria-label="Decrease rest by 5 seconds">−</button>
            <span class="settings-stepper-val" id="rest-val">${restSec}s</span>
            <button class="settings-stepper-btn" id="rest-inc" type="button" aria-label="Increase rest by 5 seconds">+</button>
          </div>
        </div>
        <div class="settings-stepper-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Pre-countdown</div>
            <div class="settings-row-caption">Before holds. 0 skips. Rides never count down.</div>
          </div>
          <div class="settings-stepper" data-stepper="pre">
            <button class="settings-stepper-btn" id="pre-dec" type="button" aria-label="Decrease pre-countdown by 1 second">−</button>
            <span class="settings-stepper-val" id="pre-val">${preCount}s</span>
            <button class="settings-stepper-btn" id="pre-inc" type="button" aria-label="Increase pre-countdown by 1 second">+</button>
          </div>
        </div>
      </div>

      <div class="card settings-card">
        <div class="settings-section-label">Display</div>
        <label class="settings-row">
          <div class="settings-row-text">
            <div class="settings-row-title">Open how-to on first visit</div>
            <div class="settings-row-caption">First time each week.</div>
          </div>
          <span class="settings-toggle ${howToOn ? 'on' : 'off'}">
            <input type="checkbox" id="setting-howto" ${howToOn ? 'checked' : ''} />
            <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
          </span>
        </label>
      </div>

      <div class="card settings-card">
        <div class="settings-section-label">Cycle</div>
        ${renderCycleSettingsRow()}
      </div>

      ${
        // v48 · P4 moved Gear & recovery here; P6 (Sep 24 2026) made it chips +
        // its own Neck release card (DECISIONS §5).
        renderGearCard()
      }

      <details class="card settings-card settings-data"${ui.settingsDataOpen ? ' open' : ''}>
        <summary class="settings-data-summary">
          <span>Data · export · import · clear</span>
          <span class="settings-data-chev" aria-hidden="true">▸</span>
        </summary>
        <div class="settings-data-row">
          <button class="btn-ghost settings-data-btn" id="export-sessions" type="button">Export sessions</button>
          <div class="settings-row-caption">All sessions on this phone (${logCount}).</div>
        </div>
        <div class="settings-data-row">
          <button class="btn-ghost settings-data-btn" id="import-sessions-btn" type="button">Import sessions</button>
          <input type="file" id="import-sessions-input" accept="application/json,.json" style="display:none" />
          <div class="settings-row-caption">Existing entries on this phone win.</div>
        </div>
        <div class="settings-data-row">
          <button class="settings-clear-link hold-to-confirm" id="clear-local" type="button" data-hold-ms="${HOLD_TO_CLEAR_MS}">
            <span class="hold-fill"></span>
            <span class="hold-label">Hold to clear sessions on this phone</span>
          </button>
          <div class="settings-row-caption">This phone only. Cloud copy stays.</div>
        </div>
        <div class="settings-data-status" id="data-status" aria-live="polite"></div>
      </details>

      <div class="card settings-card">
        <div class="settings-section-label">About</div>
        <div class="settings-about-row">
          <div class="settings-row-title">Workout Tracker</div>
          <div class="settings-row-caption">Build ${APP_VERSION} · ${BUILD_DATE}.</div>
        </div>
        <div class="settings-about-row">
          <div class="settings-row-title">${aboutWeekRow.title}</div>
          <div class="settings-row-caption">${aboutWeekRow.caption}</div>
        </div>
        <div class="settings-about-row">
          <a class="settings-link" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">Source on GitHub →</a>
        </div>
        <div class="settings-about-row">
          <div class="settings-row-caption">Made by Allison + Claude.</div>
        </div>
      </div>

    </div>
  `;
}

// ---------- Ship 6: data helpers ----------

function exportSessionsToFile(): void {
  const logs = loadLogs();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `workout-tracker-export-${stamp}.json`;
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showDataStatus(`Exported ${logs.length} session${logs.length === 1 ? '' : 's'}.`);
}

function importSessionsFromFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = reader.result;
      if (typeof raw !== 'string') {
        showDataStatus('Import failed: could not read file.');
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        showDataStatus('Import failed: file is not a session array.');
        return;
      }
      const incoming: LogEntry[] = [];
      for (const item of parsed) {
        if (isValidLogEntry(item)) {
          incoming.push({
            ...item,
            id: item.id ?? genId(),
            word: typeof item.word === 'string' ? item.word : '',
          });
        }
      }
      // Merge by id. Existing local entries win on conflict.
      const local = loadLogs();
      const byId = new Map<string, LogEntry>();
      for (const e of incoming) {
        if (e.id) byId.set(e.id, e);
      }
      for (const e of local) {
        if (e.id) byId.set(e.id, e); // local overrides incoming
      }
      const merged = Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
      writeLogs(merged);
      const added = merged.length - local.length;
      // Re-render so log-count caption updates, THEN surface the status
      // (the new DOM has a fresh #data-status node).
      requestRender();
      showDataStatus(
        `Imported ${incoming.length} entr${incoming.length === 1 ? 'y' : 'ies'}, ${added} new.`
      );
    } catch {
      showDataStatus('Import failed: file is not valid JSON.');
    }
  };
  reader.readAsText(file);
}

function clearLocalSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Re-render first (DOM gets recreated, log-count caption updates), THEN
    // surface the status. If we showed status before requestRender(), the freshly-
    // rendered DOM would have no status node and the message would vanish.
    requestRender();
    showDataStatus('Local sessions cleared.');
  } catch {
    showDataStatus('Clear failed.');
  }
}

function showDataStatus(msg: string): void {
  const el = document.getElementById('data-status');
  if (el) {
    el.textContent = msg;
    el.classList.add('settings-data-status-visible');
    window.setTimeout(() => {
      if (el.textContent === msg) {
        el.classList.remove('settings-data-status-visible');
      }
    }, 4000);
  }
}

// Ship 6: settings handlers — toggles persist immediately; steppers clamp and
// re-render label; data buttons drive export/import/clear.
export function attachSettingsHandlers(): void {
  // Toggles
  const wireToggle = (
    inputId: string,
    key: string,
    onChange?: (v: boolean) => void,
    defaultVal: boolean = true
  ): void => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    input.addEventListener('change', () => {
      const v = input.checked;
      setSetting<boolean>(key, v);
      const wrap = input.closest('.settings-toggle');
      if (wrap) {
        wrap.classList.toggle('on', v);
        wrap.classList.toggle('off', !v);
      }
      if (onChange) onChange(v);
      // Read back to confirm the value persisted; ignore if default.
      void defaultVal;
    });
  };
  wireToggle('setting-beeps', SETTING_KEYS.beeps);
  wireToggle('setting-howto', SETTING_KEYS.howToFirstExpand);
  // v48 · P4 (Sep 24 2026): the auto-suggest toggle is gone (DECISIONS §5) —
  // the hero is always today's rotation and B/C are one chip away; a switch
  // that turned off the one thing carrying the app, never used.

  // Rest stepper (step = 5s, range 5-180).
  const restVal = document.getElementById('rest-val');
  bindClick('rest-dec', () => {
    const next = Math.max(0, getRestSec() - 5);
    setSetting<number>(SETTING_KEYS.restSec, next);
    if (restVal) restVal.textContent = `${next}s`;
  });
  bindClick('rest-inc', () => {
    const next = Math.min(180, getRestSec() + 5);
    setSetting<number>(SETTING_KEYS.restSec, next);
    if (restVal) restVal.textContent = `${next}s`;
  });

  // Pre-countdown stepper (step = 1s, range 0-10).
  const preVal = document.getElementById('pre-val');
  bindClick('pre-dec', () => {
    const next = Math.max(0, getPreCountSec() - 1);
    setSetting<number>(SETTING_KEYS.preCount, next);
    if (preVal) preVal.textContent = `${next}s`;
  });
  bindClick('pre-inc', () => {
    const next = Math.min(10, getPreCountSec() + 1);
    setSetting<number>(SETTING_KEYS.preCount, next);
    if (preVal) preVal.textContent = `${next}s`;
  });

  // Data: Export
  bindClick('export-sessions', () => {
    exportSessionsToFile();
  });

  // Data: Import (file picker)
  bindClick('import-sessions-btn', () => {
    const input = document.getElementById('import-sessions-input') as HTMLInputElement | null;
    input?.click();
  });
  const importInput = document.getElementById('import-sessions-input') as HTMLInputElement | null;
  if (importInput) {
    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (file) importSessionsFromFile(file);
      importInput.value = ''; // allow re-import of same filename
    });
  }

  // v48 · P6: keep the Data fold's open state across its own re-render.
  const dataFold = document.querySelector<HTMLDetailsElement>('details.settings-data');
  dataFold?.addEventListener('toggle', () => {
    ui.settingsDataOpen = dataFold.open;
  });

  // Data: Clear — hold-to-confirm via the same wireHoldToSkip helper.
  const clearBtn = document.getElementById('clear-local');
  if (clearBtn) {
    wireHoldToSkip(clearBtn, () => {
      clearLocalSessions();
    });
  }
}
