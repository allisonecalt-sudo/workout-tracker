// bus.ts - the render seam (code-shape step 7b, Oct 14 2026).
//
// Why: the screens that are about to leave app.ts (steps 8+) must be able to say
// "redraw" without importing app.ts (that would be a cycle, and the entry is the
// one file nothing may import). They call requestRender(); app.ts hands over its
// render() once, at boot, with setRenderer(render).
//
// Imports nothing. Not wired into any existing render() call yet: those stay as they
// are until the code that makes them moves (a moved function that called render()
// would call requestRender() instead - none of step 7's moves did).

let renderer: (() => void) | null = null;

/** app.ts registers its render() here once, at boot. */
export function setRenderer(fn: () => void): void {
  renderer = fn;
}

/** Ask the app to redraw. Fail-loud: before setRenderer() has run this logs an error
 *  and returns (it never throws into a click handler), instead of silently drawing nothing. */
export function requestRender(): void {
  if (renderer === null) {
    console.error('bus.requestRender() called before setRenderer(): nothing was drawn');
    return;
  }
  renderer();
}
