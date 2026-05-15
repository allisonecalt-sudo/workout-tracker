// hand-routine.archived.ts — extracted from app.ts on 2026-05-15.
//
// Does NOT compile standalone. This is a SNAPSHOT of the hand-routine code
// that lived in app.ts before Allison retired the routine. References types
// (Exercise, AppScreen, LogEntry, etc.) and utilities (genId, syncDisabled,
// supabaseHeaders, SUPABASE_URL, SUPABASE_ANON_KEY, state, render,
// resetState, bindClick, etc.) from app.ts.
//
// To re-enable: see README.md in this folder.

// ---------- types ----------

type HandRoutineId = 'left-hand' | 'right-hand';

type HandRoutine = {
  id: HandRoutineId;
  name: string;
  shortName: string;
  status: 'active';
  description: string;
  frequency: string;
  exercises: Exercise[];
};

type HandLog = {
  id?: string;
  date: string;
  routine: HandRoutineId;
  synced?: boolean;
};

type RemoteHandLog = {
  id: string;
  date: string;
  routine_id: HandRoutineId;
};

// ---------- AppState fields (excerpted) ----------

// Added to AppState while active:
//   selectedHandRoutine: HandRoutineId | null;
//   currentHandExerciseIndex: number;
//
// And to AppScreen union:
//   | 'hand-routine'
//
// Initialized in `state` literal as:
//   selectedHandRoutine: null,
//   currentHandExerciseIndex: 0,
//
// Reset in resetState() as:
//   state.selectedHandRoutine = null;
//   state.currentHandExerciseIndex = 0;

// ---------- constants ----------

const HAND_STORAGE_KEY = 'workout-tracker:hand-logs';

const HAND_ROUTINES: Record<HandRoutineId, HandRoutine> = {
  'left-hand': {
    id: 'left-hand',
    name: 'Left hand · Lisa Cohen PT protocol',
    shortName: 'Left hand',
    status: 'active',
    description:
      'Muscle strain recovery (Lisa Cohen, May 5) — stretch + flexion/extension + radial deviation.',
    frequency: '1x per day · ~5 min',
    exercises: [
      { name: 'Left wrist stretch', reps: '30-sec hold' },
      { name: 'Left flexion/extension (tuna can)', reps: '10 reps each direction' },
      { name: 'Left radial deviation (tuna can)', reps: '10 reps' },
    ],
  },
  'right-hand': {
    id: 'right-hand',
    name: 'Right hand · Lisa Cohen PT protocol',
    shortName: 'Right hand',
    status: 'active',
    description:
      'Same protocol as left side — stretch + flexion/extension + radial deviation strengthening.',
    frequency: '1x per day · ~5 min',
    exercises: [
      { name: 'Right wrist stretch', reps: '30-sec hold' },
      { name: 'Right flexion/extension (tuna can)', reps: '10 reps each direction' },
      { name: 'Right radial deviation (tuna can)', reps: '10 reps' },
    ],
  },
};

// ---------- persistence ----------

function loadHandLogs(): HandLog[] {
  try {
    const raw = localStorage.getItem(HAND_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HandLog[];
  } catch {
    return [];
  }
}

function writeHandLogs(logs: HandLog[]): void {
  const sorted = [...logs].sort((a, b) => {
    const aUn = a.synced ? 1 : 0;
    const bUn = b.synced ? 1 : 0;
    if (aUn !== bUn) return aUn - bUn;
    return b.date.localeCompare(a.date);
  });
  localStorage.setItem(HAND_STORAGE_KEY, JSON.stringify(sorted.slice(0, 200)));
}

function saveHandLog(routine: HandRoutineId): HandLog {
  const entry: HandLog = {
    id: genId(),
    date: new Date().toISOString(),
    routine,
    synced: false,
  };
  const logs = loadHandLogs();
  logs.unshift(entry);
  writeHandLogs(logs);
  return entry;
}

function markHandLogSynced(id: string): void {
  const logs = loadHandLogs();
  const idx = logs.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const entry = logs[idx];
  if (!entry) return;
  logs[idx] = { ...entry, synced: true };
  writeHandLogs(logs);
}

async function pushHandLogToSupabase(entry: HandLog): Promise<boolean> {
  if (syncDisabled()) return false;
  if (!entry.id) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hand_routine_logs`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify([{ id: entry.id, date: entry.date, routine_id: entry.routine }]),
    });
    if (res.ok) {
      markHandLogSynced(entry.id);
      return true;
    }
    console.warn('[sync] hand push failed:', res.status);
    return false;
  } catch (err) {
    console.warn('[sync] hand push threw:', err);
    return false;
  }
}

// ---------- sync (excerpted from pullFromSupabase) ----------
//
// The hand_routine_logs fetch + merge block lived inside pullFromSupabase
// alongside the workout_sessions block:
//
//   if (hRes.ok) {
//     const remote: RemoteHandLog[] = await hRes.json();
//     const local = loadHandLogs();
//     const byId = new Map<string, HandLog>();
//     for (const l of local) {
//       if (l.id) byId.set(l.id, l);
//     }
//     for (const r of remote) {
//       const existing = byId.get(r.id);
//       if (existing && !existing.synced) continue;
//       byId.set(r.id, { id: r.id, date: r.date, routine: r.routine_id, synced: true });
//     }
//     const merged = Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
//     writeHandLogs(merged);
//   } else {
//     console.warn('[sync] pull hand failed:', hRes.status);
//   }
//
// And flushPendingSyncs included:
//
//   const pendingHand = loadHandLogs().filter((l) => !l.synced && l.id);
//   for (const entry of pendingHand) {
//     const ok = await pushHandLogToSupabase(entry);
//     if (!ok) allOk = false;
//   }
//
// And syncIndicatorText included:
//
//   const pending = loadLogs().filter((l) => !l.synced).length
//                 + loadHandLogs().filter((l) => !l.synced).length;
//   if (loadLogs().length === 0 && loadHandLogs().length === 0) return '';

// ---------- state machine ----------

function startHandRoutine(id: HandRoutineId): void {
  state.selectedHandRoutine = id;
  state.currentHandExerciseIndex = 0;
  state.screen = 'hand-routine';
  render();
}
if (typeof window !== 'undefined') {
  (window as unknown as { startHandRoutine: typeof startHandRoutine }).startHandRoutine =
    startHandRoutine;
}

function advanceHandExercise(): void {
  if (!state.selectedHandRoutine) return;
  const routine = HAND_ROUTINES[state.selectedHandRoutine];
  if (state.currentHandExerciseIndex < routine.exercises.length - 1) {
    state.currentHandExerciseIndex += 1;
    render();
  } else {
    const stored = saveHandLog(routine.id);
    resetState();
    render();
    state.syncStatus = 'syncing';
    updateSyncIndicator();
    void pushHandLogToSupabase(stored).then((ok) => {
      state.syncStatus = ok ? 'synced' : 'offline';
      updateSyncIndicator();
    });
  }
}

// ---------- render ----------

function renderHandRoutine(): string {
  if (!state.selectedHandRoutine) return '';
  const routine = HAND_ROUTINES[state.selectedHandRoutine];
  const ex = routine.exercises[state.currentHandExerciseIndex];
  if (!ex) return '';
  const total = routine.exercises.length;
  const isLastExercise = state.currentHandExerciseIndex === total - 1;
  const nextLabel = isLastExercise ? 'Done · Save' : 'Done · Next';

  return `
    <div class="screen-header">
      <h2>${routine.shortName}</h2>
      <button class="quit-link" id="quit-hand" type="button">× Quit</button>
    </div>
    <div class="warning-banner">⚠️ <strong>2/10 pain ceiling, no sharpness.</strong> Stop signs: pain ramps during a hold · lingers >30 min after · new clicking on ulnar side.</div>
    <div class="progress-text">Exercise ${state.currentHandExerciseIndex + 1} of ${total}</div>
    <div class="progress-bar">
      <div class="progress-bar-fill" style="width: ${((state.currentHandExerciseIndex + 1) / total) * 100}%"></div>
    </div>

    <div class="card">
      <div class="exercise-display">
        <div class="exercise-phase">${routine.shortName}</div>
        <div class="exercise-name">${ex.name}</div>
        <div class="exercise-reps">${ex.reps ?? ''}</div>
      </div>
    </div>

    ${renderExerciseVisual(ex.name)}
    ${renderHowToCard(ex.name)}

    <button class="btn-large btn-primary" id="next-hand" type="button">${nextLabel}</button>
  `;
}

// ---------- dispatch case (excerpted from render()) ----------
//
//   case 'hand-routine':
//     html = renderHandRoutine();
//     break;

// ---------- event handlers (excerpted from attachHandlers()) ----------
//
//   bindClick('next-hand', () => {
//     advanceHandExercise();
//   });
//   bindClick('quit-hand', () => {
//     resetState();
//     render();
//   });
