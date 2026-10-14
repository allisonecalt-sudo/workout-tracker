#!/usr/bin/env node
// scripts/ui-rename.mjs - code-shape step 10a (Oct 14 2026). ONE-OFF, kept so the
// rewrite is reproducible and its proof (re-run on the parent, diff) can be repeated.
//
// WHAT: gathers every top-level `let` of app.ts into ONE exported object `ui`
// (ui.ts). Each `let x = init;` declaration is removed from app.ts (its directly
// attached comment block moves with it, onto the ui.ts property); every read and
// write of `x` becomes `ui.x`. The rename is SYMBOL-AWARE: it uses the TypeScript
// language service (`findRenameLocations`), so a local variable or parameter that
// happens to share a name is a different symbol and is never touched. No regex
// search-and-replace of identifiers anywhere.
// Also moves the four app.ts-local types the lets use (TimerKind, TimerHandle,
// WorkoutWalkResult, HistoryEditDraft) VERBATIM into types.ts, so ui.ts can name
// them without importing app.ts.
//
// USAGE: node scripts/ui-rename.mjs [--root <dir>] [--dry]
//   --root  the checkout to rewrite (default: this repo). TypeScript itself is
//           always loaded from THIS repo's node_modules, so a bare temp copy of an
//           older commit can be rewritten without installing anything.
//   --dry   print the inventory and counts, write nothing.
// Idempotent guard: refuses to run if app.ts already imports ./ui.js.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'package.json'));
const ts = require('typescript');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const rootArg = args.indexOf('--root');
const root = resolve(rootArg >= 0 ? args[rootArg + 1] : join(here, '..'));
const APP = join(root, 'app.ts');
const TYPES = join(root, 'types.ts');
const UI = join(root, 'ui.ts');

const MOVE_TYPES = ['TimerKind', 'TimerHandle', 'WorkoutWalkResult', 'HistoryEditDraft'];
// Where each non-global type a `let` mentions is imported from, for ui.ts.
const TYPE_SOURCES = {
  TimerHandle: './types.js',
  WorkoutWalkResult: './types.js',
  HistoryEditDraft: './types.js',
  ActiveSessionSnapshot: './state.js',
  CycleMetric: './cycle.js',
};
const GLOBAL_TYPES = new Set(['AudioContext', 'HTMLAudioElement', 'ReturnType', 'Promise']);

const appSrc = readFileSync(APP, 'utf8');
if (/from '\.\/ui\.js'/.test(appSrc)) {
  console.error('app.ts already imports ./ui.js - nothing to do.');
  process.exit(1);
}

// ---- language service over the whole project (so references in every file count) ----
const cfgPath = join(root, 'tsconfig.json');
const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
const fileNames = parsed.fileNames.map((f) => resolve(f));
const overrides = new Map(); // fileName -> text (none yet; kept for clarity)
const host = {
  getScriptFileNames: () => fileNames,
  getScriptVersion: () => '1',
  getScriptSnapshot: (f) => {
    const t = overrides.get(resolve(f)) ?? (existsSync(f) ? readFileSync(f, 'utf8') : undefined);
    return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t);
  },
  getCurrentDirectory: () => root,
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());
const sf = ts.createSourceFile(APP, appSrc, ts.ScriptTarget.ES2020, true);

// ---- inventory: every top-level `let` ----
const decls = []; // { name, nameStart, stmt, typeText, initText, comment }
for (const st of sf.statements) {
  if (!ts.isVariableStatement(st)) continue;
  if (!(st.declarationList.flags & ts.NodeFlags.Let)) continue;
  if (st.declarationList.declarations.length !== 1) {
    throw new Error(
      'multi-declarator let at line ' + (sf.getLineAndCharacterOfPosition(st.getStart()).line + 1)
    );
  }
  const d = st.declarationList.declarations[0];
  if (!ts.isIdentifier(d.name)) throw new Error('destructured let: ' + d.getText());
  const initText = d.initializer ? d.initializer.getText() : 'undefined';
  let typeText = d.type ? d.type.getText() : null;
  if (!typeText) {
    if (/^(true|false)$/.test(initText)) typeText = 'boolean';
    else if (/^-?[0-9_.]+$/.test(initText)) typeText = 'number';
    else throw new Error('cannot infer type of ' + d.name.text);
  }
  decls.push({
    name: d.name.text,
    nameStart: d.name.getStart(),
    stmt: st,
    typeText,
    initText,
    line: sf.getLineAndCharacterOfPosition(st.getStart()).line + 1,
  });
}

// A comment block counts as ATTACHED to a declaration/type when there is no blank
// line between its last line and the node (and none inside it).
function attachedCommentStart(node) {
  const text = appSrc;
  const full = node.getFullStart();
  const start = node.getStart();
  const ranges = ts.getLeadingCommentRanges(text, full) ?? [];
  let from = start;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const between = text.slice(ranges[i].end, from);
    if (/\n[ \t]*\r?\n/.test(between)) break; // blank line: not attached
    from = ranges[i].pos;
  }
  return from;
}

// ---- rename locations (symbol-aware) ----
const prefs = { providePrefixAndSuffixTextForRename: true, allowRenameOfImportPath: false };
const edits = []; // { start, end, text }
const counts = {};
for (const d of decls) {
  const locs = service.findRenameLocations(APP, d.nameStart, false, false, prefs) ?? [];
  let n = 0;
  for (const l of locs) {
    if (resolve(l.fileName) !== resolve(APP))
      throw new Error(`${d.name} referenced outside app.ts: ${l.fileName}`);
    const start = l.textSpan.start;
    if (start === d.nameStart) continue; // the declaration itself is removed whole
    edits.push({
      start,
      end: start + l.textSpan.length,
      text: (l.prefixText ?? '') + 'ui.' + d.name + (l.suffixText ?? ''),
    });
    n++;
  }
  counts[d.name] = n;
}

// ---- removals: declarations (with attached comments) and the moved type aliases ----
const lineEnd = (pos) => {
  let e = pos;
  while (e < appSrc.length && appSrc[e] !== '\n') e++;
  return e < appSrc.length ? e + 1 : e;
};
const props = []; // ui.ts members in declaration order
for (const d of decls) {
  const cStart = attachedCommentStart(d.stmt);
  const comment = appSrc.slice(cStart, d.stmt.getStart()).replace(/\s+$/, '');
  edits.push({ start: cStart, end: lineEnd(d.stmt.getEnd()), text: '' });
  props.push({ ...d, comment });
}
const movedTypes = [];
for (const name of MOVE_TYPES) {
  const st = sf.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === name);
  if (!st) throw new Error('type not found: ' + name);
  if (st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
    throw new Error(name + ' already exported');
  movedTypes.push(st.getText());
  edits.push({ start: st.getStart(), end: lineEnd(st.getEnd()), text: '' });
}

// ---- apply edits (bottom-up; overlap = bug) ----
edits.sort((a, b) => b.start - a.start);
for (let i = 1; i < edits.length; i++) {
  if (edits[i].end > edits[i - 1].start) throw new Error('overlapping edits at ' + edits[i].start);
}
let out = appSrc;
for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

// ---- imports in app.ts ----
const sf2 = ts.createSourceFile(APP, out, ts.ScriptTarget.ES2020, true);
const identCount = (name) => {
  let n = 0;
  const walk = (node) => {
    if (ts.isImportDeclaration(node)) return; // don't count the import lists themselves
    if (ts.isIdentifier(node) && node.text === name) n++;
    ts.forEachChild(node, walk);
  };
  walk(sf2);
  return n;
};
const typesImport = sf2.statements.find(
  (s) => ts.isImportDeclaration(s) && s.moduleSpecifier.text === './types.js'
);
if (!typesImport) throw new Error('no ./types.js import in app.ts');
{
  const names = typesImport.importClause.namedBindings.elements.map((e) => e.getText());
  for (const t of MOVE_TYPES) if (identCount(t) > 0) names.push(t);
  const text = `import type { ${names.join(', ')} } from './types.js';\nimport { ui } from './ui.js';`;
  out = out.slice(0, typesImport.getStart()) + text + out.slice(typesImport.getEnd());
}
// drop named imports the removal left unused (the lets' own type names)
{
  const sf3 = ts.createSourceFile(APP, out, ts.ScriptTarget.ES2020, true);
  const dead = [];
  for (const s of sf3.statements) {
    if (!ts.isImportDeclaration(s) || !s.importClause?.namedBindings?.elements) continue;
    for (const el of s.importClause.namedBindings.elements) {
      const nm = el.name.text;
      if (!Object.keys(TYPE_SOURCES).includes(nm)) continue;
      let n = 0;
      const walk = (node) => {
        if (ts.isImportDeclaration(node)) return;
        if (ts.isIdentifier(node) && node.text === nm) n++;
        ts.forEachChild(node, walk);
      };
      walk(sf3);
      if (n === 0) dead.push({ start: el.getFullStart(), end: el.getEnd(), nm });
    }
  }
  dead.sort((a, b) => b.start - a.start);
  for (const e of dead) {
    // remove "Name," or ", Name" - the element's full start includes its leading comma/space
    out = out.slice(0, e.start) + out.slice(e.end);
  }
  // tidy a leftover leading comma from the first element removal
  out = out.replace(/\{\s*,\s*/g, '{ ');
  if (dead.length) console.log('dropped unused imports: ' + dead.map((d) => d.nm).join(', '));
}

// ---- ui.ts ----
const used = new Map(); // type -> source
for (const p of props) {
  for (const m of p.typeText.matchAll(/\b[A-Z][A-Za-z0-9]*\b/g)) {
    const id = m[0];
    if (GLOBAL_TYPES.has(id)) continue;
    if (!TYPE_SOURCES[id]) throw new Error(`unknown type ${id} in ${p.name}`);
    used.set(id, TYPE_SOURCES[id]);
  }
}
const bySource = new Map();
for (const [t, src] of used) bySource.set(src, [...(bySource.get(src) ?? []), t].sort());
const importLines = [...bySource]
  .sort()
  .map(([src, ts_]) => `import type { ${ts_.join(', ')} } from '${src}';`);
const indent = (c) =>
  c
    .split('\n')
    .map((l) => '  ' + l.trim())
    .join('\n');
const uiText = `// ui.ts - the app's transient UI state in ONE object (code-shape step 10a, Oct 14 2026).
//
// WHAT: every module-level \`let\` that used to sit at the top level of app.ts
// (timers, wake-lock and tick handles, the walk lane, the cycle page's undo and
// compare state, view toggles, scroll-restore keys ...), as properties of one
// exported object. Same names, same initial values, same meaning - moved, not
// redesigned. They are NOT persisted and NOT session progress (that is state.ts).
// WHY: a \`let\` in app.ts cannot be reached by a module that is not app.ts, so
// every function that touched one was stuck there. As properties of an imported
// object they can follow their functions out (steps 10b-17).
// RULE: always read and write \`ui.x\` in place. Never destructure it
// (\`const { x } = ui\`) - the copy would silently stop tracking; ESLint forbids it.
// DECIDED: app-side, type imports only - no value import, so this file can never
// take part in an import cycle.
// BUILT: scripts/ui-rename.mjs did the rewrite (TypeScript language service, not
// text search-and-replace).

${importLines.join('\n')}

export interface Ui {
${props.map((p) => (p.comment ? indent(p.comment) + '\n' : '') + `  ${p.name}: ${p.typeText};`).join('\n')}
}

export const ui: Ui = {
${props.map((p) => `  ${p.name}: ${p.initText},`).join('\n')}
};
`;

const typesText = readFileSync(TYPES, 'utf8');
const typesOut =
  typesText.replace(/\s*$/, '\n') +
  '\n// ---- moved verbatim from app.ts (code-shape step 10a): the shapes `ui` holds ----\n\n' +
  movedTypes.map((t) => 'export ' + t).join('\n\n') +
  '\n';

console.log(`lets: ${decls.length}`);
for (const d of decls)
  console.log(`  ${d.name} (line ${d.line}) -> ${counts[d.name]} refs rewritten`);
console.log('total refs rewritten: ' + Object.values(counts).reduce((a, b) => a + b, 0));
if (dry) process.exit(0);
writeFileSync(APP, out);
writeFileSync(TYPES, typesOut);
writeFileSync(UI, uiText);
console.log('wrote app.ts, types.ts, ui.ts (run prettier on them)');
