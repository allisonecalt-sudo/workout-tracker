// dom.ts - tiny DOM helpers shared by app.ts and the screen modules
// (code-shape step 8a, Oct 14 2026).
//
// Why: a screen's attach...Handlers() binds clicks by element id, exactly as app.ts
// does, and a screen may not import app.ts. So the helper lives here instead of
// being copied into every screen. Moved verbatim out of app.ts - no behaviour change.
//
// DOM only: imports nothing, touches no app state. (12a: wireHoldToSkip + HOLD_TO_SKIP_MS joined, moved verbatim.)

/** Add a click listener to the element with this id, if it is on the page right now. */
export function bindClick(id: string, fn: () => void): void {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

/** Hold-to-skip / hold-to-confirm length (ms): the default when a button has no data-hold-ms. */
export const HOLD_TO_SKIP_MS = 500;

// Group 2H: hold-to-skip implementation. The button shows a fill that
// progresses over HOLD_TO_SKIP_MS; on release before complete, fill resets.
export function wireHoldToSkip(btn: HTMLElement, onSkip: () => void): void {
  const holdMs = parseInt(btn.dataset['holdMs'] ?? `${HOLD_TO_SKIP_MS}`, 10) || HOLD_TO_SKIP_MS;
  const fill = btn.querySelector<HTMLElement>('.hold-fill');
  let holdStart: number | null = null;
  let raf: number | null = null;
  let fired = false;

  function tick(): void {
    if (holdStart === null) return;
    const elapsed = Date.now() - holdStart;
    const pct = Math.min(1, elapsed / holdMs);
    if (fill) fill.style.width = `${pct * 100}%`;
    if (pct >= 1 && !fired) {
      fired = true;
      reset();
      onSkip();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function reset(): void {
    holdStart = null;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    if (fill) fill.style.width = '0%';
  }

  function down(e: Event): void {
    e.preventDefault();
    if (fired) return;
    holdStart = Date.now();
    tick();
  }

  function up(): void {
    if (fired) return;
    reset();
  }

  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
}

// v63 item 3 (Oct 19 2026): one short line that fades by itself ("Got it, skipped."). Lives on <body>, so a
// redraw of #app does not take it away; a new one replaces the old.
let toastTimer: number | undefined;
export function showToast(text: string): void {
  document.getElementById('wt-toast')?.remove();
  window.clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.id = 'wt-toast';
  el.className = 'wt-toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.appendChild(el);
  toastTimer = window.setTimeout(() => el.remove(), 2400);
}
