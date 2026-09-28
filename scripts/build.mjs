#!/usr/bin/env node
// scripts/build.mjs — code-shape R1b (Sep 27 2026).
//
// Why this exists: stack-decision-2026-09-27.md "R1(b)" + the "Second
// opinions" adjustment (content-hashed build filenames instead of a static
// dist/app.js). Replaces `tsc`'s 13 separate dist/*.js files (hand-tracked
// twice over in sw.js — the M1 bug class) with ONE esbuild bundle. `tsc
// --noEmit` (run separately, see package.json "build") stays the type gate;
// this script never type-checks.
//
// Single source of truth for the version: package.json's "appVersion" field.
// Never edit APP_VERSION/BUILD_DATE in app.ts or VERSION in sw.js directly —
// both now read this script's output (app.ts via esbuild --define, sw.js at
// runtime via dist/build-info.js). Bump appVersion in package.json only.
//
// Deterministic: the bundle filename is a hash of its own CODE (not the
// timestamp), so re-running this with no source changes reproduces the same
// dist/app.<hash>.js name and leaves index.html untouched — a structure-only
// commit's `git diff` stays a pure move, never noise from an unrelated build.
//
// Only this script writes dist/, index.html's bundle <script> src, or the
// sw.js precache list. Builders never hand-edit any of those (builder-
// sequence rule 3's spirit, extended to the build outputs).
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');

function readAppVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (!pkg.appVersion) {
    throw new Error(
      'package.json is missing "appVersion" — the single source for APP_VERSION / sw.js / build-info.js (code-shape R1b).'
    );
  }
  return pkg.appVersion;
}

// "Sep 27, 2026 · 22:04" in Asia/Jerusalem — same shape BUILD_DATE always had
// (her Jul 1 2026 rule: version tags carry the time too).
function buildDateJerusalem() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')} ${get('day')}, ${get('year')} · ${get('hour')}:${get('minute')}`;
}

function rewriteIndexHtml(bundleName) {
  const file = path.join(ROOT, 'index.html');
  const src = fs.readFileSync(file, 'utf8');
  const next = src.replace(
    /<script type="module" src="dist\/app[^"]*\.js"><\/script>/,
    `<script type="module" src="dist/${bundleName}"></script>`
  );
  if (next === src && !src.includes(`dist/${bundleName}`)) {
    throw new Error(
      'scripts/build.mjs could not find the app bundle <script> tag in index.html to rewrite — check the tag matches <script type="module" src="dist/app*.js"></script>.'
    );
  }
  fs.writeFileSync(file, next, 'utf8');
}

async function main() {
  const appVersion = readAppVersion();
  const buildDate = buildDateJerusalem();

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'app.ts')],
    bundle: true,
    format: 'esm',
    minify: true,
    sourcemap: 'external',
    write: false,
    outfile: path.join(DIST, 'app.js'), // placeholder name — the real file is never written under it
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __BUILD_DATE__: JSON.stringify(buildDate),
    },
  });

  const jsFile = result.outputFiles.find((f) => f.path.endsWith('.js'));
  const mapFile = result.outputFiles.find((f) => f.path.endsWith('.map'));
  if (!jsFile || !mapFile) {
    throw new Error('esbuild did not produce the expected .js/.map output pair.');
  }

  // esbuild appends a sourceMappingURL comment naming the placeholder outfile.
  // Strip it, hash the CODE only (so the hash doesn't depend on its own final
  // name), then re-append the comment pointing at the correctly-hashed map.
  const codeOnly = jsFile.text.replace(/\n?\/\/# sourceMappingURL=.*$/, '');
  // The hash must be independent of buildDate, or "deterministic" (this
  // script's own promise, and the plan's "Build must stay deterministic")
  // is false: buildDate is a fresh `new Date()` every run, --define bakes it
  // into the bundle as a literal, and hashing that literal in would change
  // dist/app.<hash>.js (and so index.html's <script src>) on EVERY build
  // even with zero source changes — a structure-only commit's diff would
  // never be a pure move again. Hash a copy with that one literal blanked;
  // the SHIPPED file still carries the real buildDate untouched.
  // A plain string search for JSON.stringify(buildDate) does NOT reliably
  // find it: esbuild's minifier may re-encode the non-ASCII "·" as `\xB7`
  // in the emitted source text, so this matches the DATE SHAPE instead of
  // the exact bytes (found by diffing two real consecutive builds that
  // should have hashed identically and didn't).
  const hashInput = codeOnly.replace(
    /"[A-Za-z]{3} \d{1,2}, \d{4}[^"]*?\d{2}:\d{2}"/g,
    '"BUILD_DATE"'
  );
  const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 10);
  const bundleName = `app.${hash}.js`;
  const mapName = `${bundleName}.map`;
  const finalJs = `${codeOnly}\n//# sourceMappingURL=${mapName}\n`;

  fs.writeFileSync(path.join(DIST, bundleName), finalJs, 'utf8');
  fs.writeFileSync(path.join(DIST, mapName), mapFile.text, 'utf8');

  const manifest = { bundle: bundleName, version: appVersion, buildDate };
  fs.writeFileSync(
    path.join(DIST, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );

  // The ONE place sw.js reads the version/bundle name at runtime (via
  // importScripts) — the "version lives in 3 places" bug (decision doc) goes
  // to 1: package.json's appVersion, propagated here and into app.ts's
  // --define above.
  const buildInfoJs = `// GENERATED by scripts/build.mjs — do not edit by hand.\nself.__BUILD_INFO__ = ${JSON.stringify(manifest)};\n`;
  fs.writeFileSync(path.join(DIST, 'build-info.js'), buildInfoJs, 'utf8');

  rewriteIndexHtml(bundleName);

  console.log(
    `[build] dist/${bundleName} (${(finalJs.length / 1024).toFixed(1)} KB) — ${appVersion} · ${buildDate}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
