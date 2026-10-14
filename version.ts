// version.ts - the build's version and date, in ONE home (code-shape step 12a, Oct 14 2026).
//
// What: scripts/build.mjs replaces `__APP_VERSION__` / `__BUILD_DATE__` at bundle time
// (esbuild --define; package.json's "appVersion" is the one source). app.ts shows them in
// the home-header tag; screens/settings.ts shows them in Settings > About. A screen may not
// import app.ts, so the two constants live here instead of being declared twice.
// Moved verbatim out of app.ts - no behaviour change. Imports nothing, touches nothing.

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;
