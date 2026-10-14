// tests/import-graph.test.ts — the app's import graph stays a tree-like DAG
// (code-shape step 4c, Oct 13 2026).
//
// Rules, from CLAUDE.md "Import direction": app.ts is the ENTRY and sits on
// top; nothing it imports may import it back, and no two modules may import
// each other (directly or through a chain) — type-only imports included, since
// a type cycle is still a cycle the next refactor trips over. program-week.ts
// is held to its own stricter contract: pure (no DOM / globals / storage) and
// importing only the modules it was built on.
//
// Pure Node, no `page`: reads the source text, like clock-guard.test.ts. The
// module set is helpers.ts's bundledSourceFiles() (app.ts + everything it
// imports, nested folders included).

import { test, expect } from '@playwright/test';
import { allSourceFiles, bundledSourceFiles, relativeImports } from './helpers';

const path = require('path') as typeof import('path');

/** file -> the root-relative files it imports (relative imports only). */
function importGraph(files: { file: string; src: string }[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const { file, src } of files) {
    const deps = relativeImports(src).map((spec) =>
      path.posix.normalize(path.posix.join(path.posix.dirname(file), spec))
    );
    graph.set(file, [...new Set(deps)].sort());
  }
  return graph;
}

/** The relative imports in a source that are NOT `import type` / `export type ... from`
 *  (code-shape step 8-0): the value imports, the ones that become runtime edges. */
function valueImports(src: string): string[] {
  const noTypeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
    .replace(/\b(?:import|export)\s+type\b[^;]*?\bfrom\s*(['"])[^'"]+\1\s*;?/g, '');
  return relativeImports(noTypeOnly);
}

/** Browser/DOM names a domain module may not use (code-shape step 11-0). Comments are
 *  ignored. `allow` = the few names a module legitimately needs, each with a reason at
 *  the call site; the DOM-WRITE names (getElementById, textContent ...) are never
 *  allowable. */
function domTouches(src: string, allow: string[] = []): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const hits =
    code.match(
      /\b(document|window|navigator|getElementById|querySelector\w*|innerHTML|outerHTML|textContent|insertAdjacentHTML|classList|HTMLElement|HTMLInputElement|alert|confirm)\b/g
    ) ?? [];
  const mayAllow = ['document', 'window', 'navigator'];
  return hits.filter((h) => !(allow.includes(h) && mayAllow.includes(h)));
}

/** DOM WRITES a "reads-only" browser-object allow-list must still reject (code-shape step
 *  12-0). domTouches() lets a module name `window` / `document` / `navigator` to READ a
 *  browser API; that allowance must not become a back door for `document.title = ...`,
 *  `window.location.reload()` or `document.createElement(...)`. Returns every write-shaped
 *  hit, comments ignored. Method names are matched after a dot; property writes need a
 *  single `=` (== / === / => are not writes). */
function domWrites(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const hits: string[] = [];
  const methods =
    /\.(appendChild|append|prepend|insertBefore|replaceChild|replaceWith|removeChild|remove|setAttribute|removeAttribute|toggleAttribute|insertAdjacent\w*|createElement\w*|createTextNode|createDocumentFragment|write|writeln|reload|pushState|replaceState|scrollTo|scrollBy|scrollIntoView|focus|blur|click|dispatchEvent|open|close|print)\s*\(/g;
  for (const m of code.matchAll(methods)) hits.push(m[0].replace(/\s*\($/, '('));
  const props =
    /\.(style|title|className|dataset|hidden|href|src|id|innerText|innerHTML|outerHTML|textContent|cookie|hash|search|pathname|scrollTop|scrollLeft)\s*(?:\|\||&&|\?\?|[-+*/|&^])?=(?![=>])/g;
  for (const m of code.matchAll(props)) hits.push(m[0].replace(/\s*=$/, ' ='));
  // any `.style` / `.classList` / `.dataset` access, and the page-owning globals
  for (const m of code.matchAll(/\.(style|classList|dataset)\b/g)) hits.push(m[0]);
  // (localStorage is NOT here: it is the app's storage layer, not the page. `.value =` is not
  // either: it is a WebAudio AudioParam in audio.ts, not an input.)
  for (const m of code.matchAll(/(?<![\w'"-])(location|history)\s*[.=]/g))
    hits.push(m[0].replace(/\s*[.=]$/, ''));
  for (const m of code.matchAll(
    /\bdocument\s*\.\s*(body|head|documentElement|title|cookie|forms|all|activeElement|scrollingElement)\b/g
  ))
    hits.push(m[0].replace(/\s+/g, ''));
  return hits;
}

/** Every import cycle in the graph, each as "a.ts -> b.ts -> a.ts". */
function findCycles(graph: Map<string, string[]>): string[] {
  const cycles: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (n: string): void => {
    state.set(n, 'visiting');
    stack.push(n);
    for (const d of graph.get(n) ?? []) {
      if (state.get(d) === 'visiting') {
        cycles.push([...stack.slice(stack.indexOf(d)), d].join(' -> '));
      } else if (!state.has(d)) visit(d);
    }
    stack.pop();
    state.set(n, 'done');
  };
  for (const n of [...graph.keys()].sort()) if (!state.has(n)) visit(n);
  return cycles;
}

test.describe('import graph — no cycles, nothing imports the entry (step 4c)', () => {
  const files = bundledSourceFiles();
  const graph = importGraph(files);

  test('the guard itself: it finds a 2-cycle, a 3-cycle through a type-only edge, and passes a clean graph', () => {
    const two = new Map([
      ['a.ts', ['b.ts']],
      ['b.ts', ['a.ts']],
    ]);
    expect(findCycles(two)).toEqual(['a.ts -> b.ts -> a.ts']);
    const three = new Map([
      ['app.ts', ['x.ts']],
      ['x.ts', ['y.ts']],
      ['y.ts', ['z.ts']],
      ['z.ts', ['x.ts']],
    ]);
    expect(findCycles(three)).toEqual(['x.ts -> y.ts -> z.ts -> x.ts']);
    const clean = new Map([
      ['app.ts', ['x.ts', 'y.ts']],
      ['x.ts', ['y.ts']],
      ['y.ts', []],
    ]);
    expect(findCycles(clean)).toEqual([]);
  });

  test('the guard itself: the import reader sees .js, .ts, extensionless, side-effect, export-from, dynamic and double-quoted imports, and skips comments and packages', () => {
    const src = [
      "import { a } from './a.js';",
      "import type { b } from './b.ts';",
      "import { c } from './c';",
      "import './d.js';",
      "export { e } from '../e.js';",
      "const f = await import('./f.js');",
      'import { g } from "./g";',
      "import { h } from 'node:path';",
      'const k = await import(`./k.js`);',
      "const l = require('./l');",
      "const m = require('../m.js');",
      // an interpolated template cannot be resolved statically: not read
      'const n = await import(`./n-${x}.js`);',
      // a package require is not a relative import
      "const o = require('node:fs');",
      "// import { i } from './i.js';",
      "/* import { j } from './j.js'; */",
    ].join('\n');
    expect(relativeImports(src)).toEqual(
      [
        './a.ts',
        './b.ts',
        './c.ts',
        './d.ts',
        '../e.ts',
        './f.ts',
        './g.ts',
        './k.ts',
        './l.ts',
        '../m.ts',
      ].sort()
    );
  });

  test('the graph was actually read: app.ts reaches program-week.ts, types.ts and week.ts', () => {
    const names = files.map((f) => f.file);
    expect(names).toEqual(
      expect.arrayContaining(['app.ts', 'program-week.ts', 'types.ts', 'week.ts'])
    );
    expect(graph.get('app.ts')).toContain('program-week.ts');
  });

  test('no import cycle among the app modules', () => {
    expect(findCycles(graph)).toEqual([]);
  });

  test('no module other than the entry imports app.ts', () => {
    const importers = [...graph.entries()]
      .filter(([file, deps]) => file !== 'app.ts' && deps.includes('app.ts'))
      .map(([file]) => file);
    expect(importers).toEqual([]);
  });

  test('state.ts and bus.ts are in the graph and import neither app.ts nor each other (step 7)', () => {
    expect([...graph.keys()]).toEqual(expect.arrayContaining(['state.ts', 'bus.ts']));
    expect(graph.get('app.ts')).toEqual(expect.arrayContaining(['state.ts', 'bus.ts']));
    // bus.ts imports nothing; state.ts only the pure data modules its types come from
    expect(graph.get('bus.ts')).toEqual([]);
    const allowed = [
      'cycle.ts',
      'move-feel.ts',
      'program-week.ts',
      'program.ts',
      'types.ts',
      'week.ts',
    ];
    expect((graph.get('state.ts') ?? []).filter((d) => !allowed.includes(d))).toEqual([]);
  });

  test('the guard itself: valueImports skips import type / export type and flags value, braces-type, side-effect and dynamic imports', () => {
    const typeOnly = [
      "import type { A } from './a.js';",
      'import type {',
      '  B,',
      "} from './b.js';",
      "export type { C } from './c.js';",
    ].join('\n');
    expect(valueImports(typeOnly)).toEqual([]);
    expect(valueImports("import { type A } from './a.js';")).toEqual(['./a.ts']);
    expect(valueImports("import { a } from './a.js';")).toEqual(['./a.ts']);
    expect(valueImports("import './s.js';")).toEqual(['./s.ts']);
    expect(valueImports("const x = await import('./d.js');")).toEqual(['./d.ts']);
    expect(valueImports(typeOnly + "\nimport { v } from './v.js';")).toEqual(['./v.ts']);
  });

  test('state.ts imports are TYPE-ONLY (import type): it is the bottom of the graph and must not gain a runtime edge (step 8-0)', () => {
    const src = files.find((f) => f.file === 'state.ts')!.src;
    expect(valueImports(src)).toEqual([]);
    // the reader did see its type imports, so [] is not "found nothing at all"
    expect(relativeImports(src).length).toBeGreaterThan(0);
  });

  test('screens/** are in the graph (nested imports are followed) and in every source scan and the type gate (step 8)', () => {
    const names = files.map((f) => f.file);
    expect(names).toContain('screens/rides.ts');
    expect(graph.get('app.ts')).toContain('screens/rides.ts');
    // a screen's own imports resolve against ITS folder: ../state.js -> state.ts
    expect(graph.get('screens/rides.ts')).toEqual(
      expect.arrayContaining(['state.ts', 'bus.ts', 'ride.ts'])
    );
    // every screen module is also in allSourceFiles(), so clock/pain scans cover it
    const scanned = allSourceFiles().map((f) => f.file);
    for (const f of names.filter((n) => n.startsWith('screens/'))) expect(scanned).toContain(f);
    // and tsconfig type-checks them
    const tsconfig = (require('fs') as typeof import('fs')).readFileSync(
      path.join(__dirname, '..', 'tsconfig.json'),
      'utf8'
    );
    expect(tsconfig).toMatch(/"include":\s*\[[^\]]*"screens\/\*\*\/\*\.ts"/);
  });

  test('a screen imports only the shared layer: never app.ts, never another screen (step 8)', () => {
    const allowed = [
      'actions.ts',
      'bus.ts',
      'cardio-notes.ts',
      'cardio-readings.ts',
      'chart.ts',
      'dates.ts',
      'dom.ts',
      'format.ts',
      'program-week.ts',
      'ride-aim.ts',
      'ride.ts',
      'state.ts',
      'sync-cycle.ts',
      'sync-movement.ts',
      'sync-week-moves.ts',
      'sync.ts',
      'types.ts',
      'ui.ts',
      'version.ts',
      'week-clock.ts',
      'week-d.ts',
      'week.ts',
    ];
    for (const [file, deps] of graph) {
      if (!file.startsWith('screens/')) continue;
      expect(
        deps.filter((d) => !allowed.includes(d)),
        file
      ).toEqual([]);
    }
  });

  test('sync*.ts and week-clock.ts are shared-layer modules: they may never import a screen or app.ts (step 9c)', () => {
    const shared = [...graph.keys()].filter(
      (f) => /^sync(-[a-z0-9-]+)?\.ts$/.test(f) || f === 'week-clock.ts'
    );
    // the guard read the modules it names (not "found nothing, so nothing to break")
    expect(shared).toEqual(
      expect.arrayContaining([
        'sync.ts',
        'sync-cycle.ts',
        'sync-movement.ts',
        'sync-week-moves.ts',
        'week-clock.ts',
      ])
    );
    for (const file of shared) {
      expect(
        (graph.get(file) ?? []).filter((d) => d === 'app.ts' || d.startsWith('screens/')),
        file
      ).toEqual([]);
    }
  });

  test('actions.ts (the save side), cardio-readings.ts and ui.ts never import a screen or app.ts, and actions.ts writes no DOM (step 10)', () => {
    const shared = ['actions.ts', 'cardio-readings.ts', 'ui.ts'];
    // the guard read the modules it names (not "found nothing, so nothing to break")
    for (const f of shared) expect([...graph.keys()]).toContain(f);
    expect(graph.get('app.ts')).toEqual(expect.arrayContaining(shared));
    for (const file of shared) {
      expect(
        (graph.get(file) ?? []).filter((d) => d === 'app.ts' || d.startsWith('screens/')),
        file
      ).toEqual([]);
    }
    // ui.ts is type imports only - a value import could pull it into a cycle
    const uiSrc = files.find((f) => f.file === 'ui.ts')!.src;
    expect(valueImports(uiSrc)).toEqual([]);
    // actions.ts and cardio-readings.ts draw nothing and touch no browser object:
    // DOM-side effects come in through setActionHooks (step 11-0 widened the word list
    // and added cardio-readings.ts)
    for (const f of ['actions.ts', 'cardio-readings.ts']) {
      expect(domTouches(files.find((x) => x.file === f)!.src), f).toEqual([]);
      expect(domWrites(files.find((x) => x.file === f)!.src), f + ' DOM write').toEqual([]);
    }
  });

  test('the guard itself: domTouches finds window.alert, textContent, classList, HTMLElement, navigator and honours a reasoned allow-list', () => {
    expect(domTouches('const a = 1; // window.alert("x")')).toEqual([]);
    expect(domTouches('window.alert("x");')).toEqual(['window', 'alert']);
    expect(domTouches('el.textContent = "x"; el.classList.add("y");')).toEqual([
      'textContent',
      'classList',
    ]);
    expect(domTouches('const e = x as HTMLElement; navigator.vibrate(1);')).toEqual([
      'HTMLElement',
      'navigator',
    ]);
    expect(domTouches('navigator.wakeLock.request("screen");', ['navigator'])).toEqual([]);
    expect(domTouches('document.getElementById("x");', ['document'])).toEqual(['getElementById']);
  });

  // code-shape step 11: the domain modules. Each may import the shared layer (and, where
  // named, a sibling domain module) - never app.ts, never a screen - and writes no DOM.
  // `dom` lists the browser objects a module legitimately READS (never a DOM write), each
  // with its reason.
  const domainModules: Record<string, { imports: string[]; dom: string[]; why: string }> = {
    'audio.ts': {
      imports: ['state.ts', 'ui.ts'],
      dom: ['window'],
      why: 'window.AudioContext / webkitAudioContext is the audio engine, not the page',
    },
    'timer.ts': {
      imports: ['audio.ts', 'bus.ts', 'state.ts', 'types.ts', 'ui.ts', 'walk.ts'],
      dom: ['window', 'document'],
      why: 'document.visibilityState + the visibilitychange listener, and window.setTimeout (the no-rAF fallback), are browser APIs, not page writes',
    },
    'walk.ts': {
      imports: [
        'actions.ts',
        'bus.ts',
        'program.ts',
        'state.ts',
        'sync-movement.ts',
        'types.ts',
        'ui.ts',
      ],
      dom: ['window', 'navigator', 'document'],
      why: 'window.setInterval (the 30 s tick) and the Wake Lock API + its visibility guard are browser APIs, not page writes',
    },
  };

  test('the domain modules (audio / timer / walk) import only the shared layer, never app.ts or a screen, and write no DOM (step 11)', () => {
    for (const [file, rule] of Object.entries(domainModules)) {
      expect([...graph.keys()], file).toContain(file);
      expect(graph.get('app.ts'), file).toContain(file);
      const deps = graph.get(file) ?? [];
      expect(
        deps.filter((d) => d === 'app.ts' || d.startsWith('screens/')),
        file
      ).toEqual([]);
      expect(
        deps.filter((d) => !rule.imports.includes(d)),
        file + ': ' + rule.why
      ).toEqual([]);
      expect(domTouches(files.find((x) => x.file === file)!.src, rule.dom), file).toEqual([]);
      // the allowed browser objects are READ-only: no DOM / location / storage writes (step 12-0)
      expect(domWrites(files.find((x) => x.file === file)!.src), file + ' DOM write').toEqual([]);
    }
  });

  test('the guard itself: domWrites flags DOM writes, location, style and createElement but passes reads and comparisons', () => {
    expect(domWrites("document.title = 'x';")).toEqual(['.title =', 'document.title']);
    expect(domWrites('window.location.reload();')).toEqual(['.reload(', 'location']);
    expect(domWrites("const e = document.createElement('div'); e.style.color = 'red';")).toEqual([
      '.createElement(',
      '.style',
    ]);
    expect(domWrites('document.body.appendChild(e);')).toEqual(['.appendChild(', 'document.body']);
    expect(domWrites("e.setAttribute('a','b'); e.remove(); el.innerHTML += 'x';")).toEqual([
      '.setAttribute(',
      '.remove(',
      '.innerHTML + =',
    ]);
    expect(domWrites('history.pushState(1,"","/");')).toEqual(['.pushState(', 'history']);
    // reads and look-alikes pass
    expect(domWrites("if (document.visibilityState === 'visible') x.value == 3;")).toEqual([]);
    expect(domWrites("document.addEventListener('visibilitychange', () => {});")).toEqual([]);
    expect(domWrites('window.setTimeout(f, 100); const v = a.value; // el.style.x = 1')).toEqual(
      []
    );
    expect(domWrites('const cb = () => 1; ui.id = 3;')).toEqual(['.id =']);
  });

  test('program-week.ts is pure and imports only week, week-d, program, types and dates', () => {
    const allowed = ['dates.ts', 'program.ts', 'types.ts', 'week-d.ts', 'week.ts'];
    const deps = graph.get('program-week.ts') ?? [];
    expect(deps.filter((d) => !allowed.includes(d))).toEqual([]);
    const src = files.find((f) => f.file === 'program-week.ts')!.src;
    expect(src.match(/\b(document|window|localStorage|sessionStorage|navigator)\b/g) ?? []).toEqual(
      []
    );
  });
});
