// dom.ts - tiny DOM helpers shared by app.ts and the screen modules
// (code-shape step 8a, Oct 14 2026).
//
// Why: a screen's attach...Handlers() binds clicks by element id, exactly as app.ts
// does, and a screen may not import app.ts. So the helper lives here instead of
// being copied into every screen. Moved verbatim out of app.ts - no behaviour change.
//
// DOM only: imports nothing, touches no app state.

/** Add a click listener to the element with this id, if it is on the page right now. */
export function bindClick(id: string, fn: () => void): void {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}
