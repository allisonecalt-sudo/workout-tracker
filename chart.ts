// chart.ts — one reusable bar-chart SVG builder, pure (Sep 27 2026)
//
// WHAT: `barChartSvg(bars, opts)` turns a small list of (value, label) pairs
// into one SVG bar chart, as a plain string — no DOM, no charting library
// (PLAN-2026-09-26.md §4.5's own rule: "no library"). Built for the rides
// page's one chart, but the shape is generic on purpose so a later Progress
// card (P2 back & wrist, P3 before -> after) can reuse it instead of hand-
// rolling another one — the plan's own note (§10 R2): "`chart.ts` exports one
// `barChartSvg(bars, opts)` that R2, P2 and P3 and the weeks card can reuse."
//
// WHY THE SHAPE IS THIS PLAIN: her rule (§0b, carried through every chart in
// this app) — no axis, no gridlines, no legend, nothing under 15px except the
// date labels (13px floor here, per the rides-page task spec), bars and dots
// only. A tap opens a one-line readout OUTSIDE this module (app.ts owns that
// — this file only draws the hit targets, `data-ride-id` on each bar's <g>).

export type ChartBar = {
  id: string; // matched back to a ride/session by the caller's click handler
  value: number; // already the number to plot (e.g. kcal a minute) — this
  // module never derives anything, only draws
  label: string; // short text under the bar (a short date, "9/24")
  highlighted?: boolean; // the one bar drawn in --text instead of --text-dim-2
  // v54 fix r1 (Sep 27 2026), checker's should #3 / §4.5: an optional level
  // line under the bar (e.g. "L5") — gives the rides page a level trend
  // without a second chart. Only reserves the extra row when at least one
  // bar in the set supplies it, so a caller that doesn't (a future weeks
  // card, per this module's own header comment) keeps the old height.
  sublabel?: string;
};

export type BarChartOptions = {
  ariaLabel: string;
  width?: number; // default 340 (PLAN §4.5: a 380px card, 20px padding -> 340px content)
  plotHeight?: number; // default 120 — the bars' own area, no axis under it
};

const DEFAULT_WIDTH = 340;
const DEFAULT_PLOT_HEIGHT = 120;
const LABEL_ROW_HEIGHT = 22; // the one date-label row under the bars
const SUBLABEL_ROW_HEIGHT = 18; // v54 fix r1: the optional level row, above the date row

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// One bar per entry, the latest (or whichever the caller flags) drawn in
// --text so it reads as "this one" without a legend explaining why. Scaled
// from 0 (honest — a cropped axis invents differences the data doesn't have,
// the same reasoning §5's cycle-page chart used) to max * 1.15, so the
// tallest bar never touches the value label above it.
export function barChartSvg(bars: ChartBar[], opts: BarChartOptions): string {
  if (bars.length === 0) return '';
  const width = opts.width ?? DEFAULT_WIDTH;
  const plotHeight = opts.plotHeight ?? DEFAULT_PLOT_HEIGHT;
  // v54 fix r1: only reserve the sublabel row when a bar actually has one.
  const hasSublabels = bars.some((b) => !!b.sublabel);
  const sublabelHeight = hasSublabels ? SUBLABEL_ROW_HEIGHT : 0;
  const totalHeight = plotHeight + sublabelHeight + LABEL_ROW_HEIGHT;
  const n = bars.length;
  const slot = width / n;
  const barWidth = Math.max(6, Math.min(22, slot * 0.6));
  const maxValue = Math.max(...bars.map((b) => b.value));
  const scaleMax = maxValue > 0 ? maxValue * 1.15 : 1;

  const groups = bars
    .map((b, i) => {
      const slotX = i * slot;
      const barX = slotX + (slot - barWidth) / 2;
      const barH = Math.max(2, (b.value / scaleMax) * plotHeight);
      const barY = plotHeight - barH;
      const fill = b.highlighted ? 'var(--text)' : 'var(--text-dim-2)';
      const valueLabel = b.highlighted
        ? `<text x="${(barX + barWidth / 2).toFixed(1)}" y="${Math.max(13, barY - 6).toFixed(1)}" font-size="17" font-weight="700" fill="var(--text)" text-anchor="middle">${escapeXml(String(b.value))}</text>`
        : '';
      const dateLabel = `<text x="${(slotX + slot / 2).toFixed(1)}" y="${(plotHeight + sublabelHeight + LABEL_ROW_HEIGHT - 5).toFixed(1)}" font-size="13" fill="var(--text-dim)" text-anchor="middle">${escapeXml(b.label)}</text>`;
      // v54 fix r1: the level line ("L5"), between the bar and the date —
      // 15px, dim, per §4.5 — only when THIS bar has one.
      const sublabelText = b.sublabel
        ? `<text x="${(slotX + slot / 2).toFixed(1)}" y="${(plotHeight + sublabelHeight - 5).toFixed(1)}" font-size="15" fill="var(--text-dim)" text-anchor="middle">${escapeXml(b.sublabel)}</text>`
        : '';
      // The hit target is the FULL slot (not just the visible bar) — a 34px
      // column is easy to tap; the bar itself is often much narrower.
      return `<g data-ride-id="${escapeXml(b.id)}" tabindex="0" role="button" aria-label="${escapeXml(b.label)}: ${escapeXml(String(b.value))}">
        <rect x="${slotX.toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${totalHeight}" fill="transparent" />
        ${valueLabel}
        <rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${fill}" />
        ${sublabelText}
        ${dateLabel}
      </g>`;
    })
    .join('');

  return `
    <svg class="rides-chart-svg" viewBox="0 0 ${width} ${totalHeight}" width="100%" height="${totalHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(opts.ariaLabel)}">
      <title>${escapeXml(opts.ariaLabel)}</title>
      ${groups}
    </svg>`;
}
