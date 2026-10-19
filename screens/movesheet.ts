// screens/movesheet.ts - the read-only move preview (v63 item 4, Oct 19 2026).
//
// WHAT: tap a move's name in the pre-log "What's in it" overview and a
// bottom sheet opens with that move's existing content, read-only: its name and amount, the picture and
// video row (renderExerciseVisual), the Tips row, the detail card with the spoken "Listen - how to do it"
// note (renderDetailCard) and the how-to card (renderHowToCard). The workout page shows the detail card OR the
// how-to card; a preview shows both, because this is the one place to read them before starting. Nothing new
// is written for it. Close returns to the same place on the page.
// WHY: her words (Mon Oct 19 21:10-21:22): take the best of Maayan's app, where Home lets you look at a
// move before you start (alpal-workout's screens/home.ts openSheet + moveinfo.ts).
// HOW IT STAYS READ-ONLY: the cards read the workout's own state (state.videoExpandedFor, howToOpenFor,
// openSections), so the sheet keeps its OWN open / closed choices and borrows those fields only for the
// instant it draws, then puts them back; it never marks a how-to "seen", never counts a voice note
// toward a session, and never redraws #app.
// WIRING: a name carries data-preview-move="<workout>|<phase>|<index>" (markup only: the pre-log emits it, it never
// imports this file). attachMoveSheetHandlers() (called by app.ts after each render) binds each one directly and
// stops the tap there. NOT DONE: Home's Up next card. Its names would sit inside the card that is itself the Start
// button (a tap on a name would preview instead of starting, and ~60 older tests tap the card's centre), so that
// half of the spec is held for her answer; this file already handles it (resolveMove reads Home refs too).
// RULES: a screen. Imports the shared layer only; never app.ts, never another screen.

import { state } from '../state.js';
import { escapeHtml } from '../format.js';
import { setVoiceBtnPlaying } from '../dom.js';
import { toggleVoiceNote as toggleVoiceNoteAudio, stopVoiceNote } from '../audio.js';
import { SAFETY_LINE, type Exercise, type Workout } from '../program.js';
import { EXERCISE_DETAIL } from '../exercise-detail.js';
import { displayName, getCurrentWorkout, getWorkoutById } from '../workout-now.js';
import {
  renderDetailCard,
  renderExerciseVisual,
  renderHowToCard,
  renderTipsExpander,
} from '../workout-cards.js';

const SHEET_ID = 'move-sheet';

type Local = { video: boolean; howTo: boolean; sections: Record<string, boolean> };

/** Find the move a name points at: "<workout>|<phase>|<index>". */
function resolveMove(ref: string): Exercise | null {
  const [id, phase, index] = ref.split('|');
  if (!id || !phase || index === undefined) return null;
  // On the pre-log she is looking at the plan this session is PINNED to; on Home, the live one.
  const w: Workout | null =
    state.screen === 'pre-log' ? getCurrentWorkout() : getWorkoutById(id as 'A' | 'B' | 'C');
  const list = (w as unknown as Record<string, Exercise[] | undefined> | null)?.[phase];
  return list?.[Number(index)] ?? null;
}

/** Draw the cards the way the workout would, from the sheet's own choices, then put the workout's state back. */
function cardsHtml(ex: Exercise, local: Local): string {
  const saved = {
    video: state.videoExpandedFor,
    howTo: state.howToOpenFor,
    sections: state.openSections,
  };
  state.videoExpandedFor = local.video ? ex.name : null;
  state.howToOpenFor = local.howTo ? ex.name : `__closed__${ex.name}`;
  state.openSections = { ...local.sections };
  try {
    const safety = ex.safety ?? SAFETY_LINE[ex.name];
    return `
      ${renderExerciseVisual(ex.name)}
      ${renderTipsExpander(ex, safety)}
      ${EXERCISE_DETAIL[ex.name] ? renderDetailCard(ex.name) : ''}
      ${renderHowToCard(ex.name)}`;
  } finally {
    state.videoExpandedFor = saved.video;
    state.howToOpenFor = saved.howTo;
    state.openSections = saved.sections;
  }
}

export function moveSheetOpen(): boolean {
  return document.getElementById(SHEET_ID) !== null;
}

function closeMoveSheet(scrollY: number): void {
  stopVoiceNote(); // a spoken explanation stops with the sheet
  document.getElementById(SHEET_ID)?.remove();
  document.removeEventListener('keydown', onKey);
  window.scrollTo(0, scrollY); // the same place she was
}

let onKey: (e: KeyboardEvent) => void = () => undefined;

export function openMoveSheet(ex: Exercise): void {
  if (moveSheetOpen()) return;
  const scrollY = window.scrollY;
  const local: Local = { video: false, howTo: true, sections: {} };
  const sheet = document.createElement('div');
  sheet.id = SHEET_ID;
  sheet.className = 'move-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', displayName(ex));
  document.body.appendChild(sheet);

  const close = (): void => closeMoveSheet(scrollY);
  onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });

  const paint = (): void => {
    const card = sheet.querySelector<HTMLElement>('.move-sheet-card');
    const keep = card?.scrollTop ?? 0;
    sheet.innerHTML = `
      <div class="move-sheet-card">
        <div class="move-sheet-head">
          <h2 class="move-sheet-name" id="move-sheet-name">${escapeHtml(displayName(ex))}</h2>
          <button type="button" class="move-sheet-x" id="move-sheet-x" aria-label="Close">×</button>
        </div>
        ${ex.reps ? `<p class="move-sheet-reps" id="move-sheet-reps">${escapeHtml(ex.reps)}</p>` : ''}
        ${cardsHtml(ex, local)}
        <button type="button" class="btn-large btn-primary move-sheet-close" id="move-sheet-close">Close</button>
      </div>`;
    const fresh = sheet.querySelector<HTMLElement>('.move-sheet-card');
    if (fresh) fresh.scrollTop = keep;
    wire();
  };

  const wire = (): void => {
    sheet.querySelector('#move-sheet-close')?.addEventListener('click', close);
    sheet.querySelector('#move-sheet-x')?.addEventListener('click', close);
    sheet.querySelectorAll<HTMLButtonElement>('[data-expand-video]').forEach((btn) =>
      btn.addEventListener('click', () => {
        local.video = !local.video;
        paint();
      })
    );
    sheet.querySelectorAll<HTMLButtonElement>('[data-toggle-howto]').forEach((btn) =>
      btn.addEventListener('click', () => {
        local.howTo = btn.getAttribute('aria-expanded') !== 'true';
        paint();
      })
    );
    sheet.querySelectorAll<HTMLButtonElement>('[data-toggle-section]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const key = btn.dataset['toggleSection'];
        if (!key) return;
        local.sections = { ...local.sections, [key]: btn.getAttribute('aria-expanded') !== 'true' };
        paint();
      })
    );
    sheet.querySelectorAll<HTMLButtonElement>('.voice-note-btn').forEach((btn) =>
      btn.addEventListener('click', () => {
        const src = btn.dataset['voiceSrc'];
        if (!src) return;
        toggleVoiceNoteAudio(src, {
          setPlaying: (playing) => setVoiceBtnPlaying(btn, playing),
          onFirstPlay: () => undefined, // a preview is not a session: no play is counted
        });
      })
    );
    // a how-to picture that cannot load is simply left out
    sheet
      .querySelectorAll<HTMLImageElement>('img')
      .forEach((img) => img.addEventListener('error', () => img.remove()));
  };

  paint();
  sheet.querySelector<HTMLButtonElement>('#move-sheet-close')?.focus({ preventScroll: true });
}

/** Bind every tappable move name on the page (Home's Up next card, the pre-log overview). */
export function attachMoveSheetHandlers(): void {
  document.querySelectorAll<HTMLElement>('[data-preview-move]').forEach((el) => {
    const open = (e: Event): void => {
      e.stopPropagation(); // never let the Up next card (a Start button) see this tap
      e.preventDefault();
      const ex = resolveMove(el.dataset['previewMove'] ?? '');
      if (ex) openMoveSheet(ex);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });
  });
}
