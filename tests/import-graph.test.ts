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
    const allowed = ['move-feel.ts', 'program-week.ts', 'program.ts', 'types.ts', 'week.ts'];
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
    // actions.ts draws nothing itself: DOM-side effects come in through setActionHooks
    const actionsSrc = files
      .find((f) => f.file === 'actions.ts')!
      .src.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(
      actionsSrc.match(/\b(document|getElementById|querySelector\w*|innerHTML)\b/g) ?? []
    ).toEqual([]);
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
