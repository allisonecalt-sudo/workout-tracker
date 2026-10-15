// viz.ts - the data-viz helpers more than one screen draws with (code-shape step 13a, Oct 15 2026).
//
// What: the wall-sit trend (the honest, real-measurement-only readings behind every wall-sit
// number the app shows) and the 80x20 inline-SVG sparkline drawn from it. Used by the Sessions
// row (History AND Weekly review share that row), Home's Start -> Now card, the hold timer and
// Progress's wall-sit card, so none of them can live in a screen module.
// Moved verbatim out of app.ts - no behaviour change, no version bump. Pure: strings in, strings
// out, no DOM writes. Imports format.ts (escapeHtml) and types only - never app.ts or a screen.

import type { LogEntry } from './types.js';
import { escapeHtml } from './format.js';

// Returns the last N wall-sit values from history (oldest → newest), filtered
// to values > 0. We walk in reverse-history-order (newest first), then reverse
// back to oldest-first so the sparkline draws left → right chronologically.
export function getWallSitTrend(allLogs: LogEntry[], uptoLogId: string | null, max = 10): number[] {
  // logs are stored newest-first. We want all logs up-to-and-including the
  // current row, then take the last N (chronologically).
  let upto = allLogs;
  if (uptoLogId) {
    const idx = allLogs.findIndex((l) => l.id === uptoLogId);
    if (idx >= 0) upto = allLogs.slice(idx); // newest-first slice from this row backwards in time
  }
  // v49 · look fix (Sep 25 2026): honestWallSitLogs() — same real-measurement
  // filter as Home's Start → Now card (see its comment above honestWallSitLogs),
  // so the Sessions sparkline can't show a pre-v45 prescribed number as data.
  const wallSits = honestWallSitLogs(upto)
    .map((l) => l.wallSitSec)
    .reverse(); // now oldest → newest
  if (wallSits.length <= max) return wallSits;
  return wallSits.slice(wallSits.length - max);
}

// Inline SVG sparkline. Returns '' if fewer than 2 points (flat-line reads
// broken). The current row's value is the rightmost point and gets a filled
// dot. v48 · P6 (Sep 24 2026): that dot is --text, not sage — sage means "the
// primary action right now" (DECISIONS §5, one sage per screen).
export function renderSparkline(values: number[]): string {
  if (values.length < 2) return '';

  const W = 80;
  const H = 20;
  const PAD = 2; // breathing room so end dot isn't clipped

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const stepX = (W - 2 * PAD) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = PAD + i * stepX;
    // SVG y axis inverted; higher value = higher on chart = lower y
    const y = H - PAD - ((v - min) / range) * (H - 2 * PAD);
    return [x, y];
  });

  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x?.toFixed(1)} ${y?.toFixed(1)}`)
    .join(' ');

  const lastPoint = points[points.length - 1];
  if (!lastPoint) return '';
  const [lx, ly] = lastPoint;

  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const direction = last > first ? 'trending up' : last < first ? 'trending down' : 'holding';
  const label = `wall sit ${first} to ${last}s, ${direction}`;

  return `
    <svg class="sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
         role="img" aria-label="${escapeHtml(label)}">
      <title>${escapeHtml(label)}</title>
      <path d="${path}" fill="none" stroke="var(--accent-progress)" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${lx?.toFixed(1)}" cy="${ly?.toFixed(1)}" r="2" fill="var(--text)" />
    </svg>
  `;
}

// v49 · look (Sep 25 2026): Home gets its own "Start → Now" card (spec §5
// frame 1; checklist "Start → Now rows (P6 class, and on Home)") — the same
// witnessed-movement-no-verdict rows as the Progress card (guide §2), scoped
// to the three numbers tellable at a glance.
//
// HONEST WALL SIT (spec's own flag): before v45's real timing capture (group
// 1D, Sep 24 2026), a completed wall-sit step saved that WEEK'S PRESCRIBED
// hold length, not what she actually held — showing that as "measured" is
// exactly the fake precision the spec warns against ("never show the 20 s
// prescription as a measured start"). Only a log dated on/after v45 ships is
// a real measurement, so the pair only ever draws from those. Zero honest
// points → the row is omitted; one → the latest shown alone, no "from".
const V45_WALL_SIT_TIMING_SINCE = '2026-09-24';

export function honestWallSitLogs(chronoLogs: LogEntry[]): LogEntry[] {
  return chronoLogs.filter((l) => l.wallSitSec > 0 && l.date >= V45_WALL_SIT_TIMING_SINCE);
}
