// action-bar.ts - the pinned bottom action bar's markup (code-shape step 14a, Oct 15 2026).
//
// WHAT: renderActionBar(inner), the one string helper that wraps a screen's primary
// buttons in the pinned bar. Moved verbatim out of app.ts; no behaviour change.
// WHY: pre-log, post-log, the workout steps AND the history edit screen all use it, and
// a screen (screens/history.ts) may not import app.ts. Strings out, no DOM, no state.

// v48 (Sep 24 2026): the pinned bottom bar. Done sat at the END of each step's
// scroll — under a video, a detail card and a cue paragraph — so on most steps
// it was below the fold (walk-in-her-shoes: "Back and Done pinned to the
// bottom"). One helper so pre-log Start and post-log Save (P5) pin the same way.
// render() gives #app the matching bottom padding whenever a bar is on screen.
export function renderActionBar(inner: string): string {
  return `<div class="action-bar"><div class="action-bar-inner">${inner}</div></div>`;
}
