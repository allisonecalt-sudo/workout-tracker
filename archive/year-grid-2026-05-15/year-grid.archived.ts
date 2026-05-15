// year-grid.archived.ts — extracted from app.ts on 2026-05-15 ~15:18 JDT.
// Does NOT compile standalone. References LogEntry, loadLogs, getWeekCount,
// formatDate, escapeHtml, PROGRAM_START_DATE from app.ts. See README in this
// folder for revival instructions.

type YearGridCell = {
  date: Date;
  iso: string;
  log: LogEntry | null;
  isToday: boolean;
  isFuture: boolean;
};

type YearGridWeek = {
  cells: YearGridCell[];
  monthLabel: string | null;
};

function buildYearGrid(logs: LogEntry[]): YearGridWeek[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const todayDow = today.getDay();
  const daysSinceSat = (todayDow + 1) % 7;
  const thisSaturday = new Date(today);
  thisSaturday.setDate(today.getDate() - daysSinceSat);

  const programStart = new Date(PROGRAM_START_DATE + 'T00:00:00');
  let startDate: Date;
  if (logs.length < 5) {
    startDate = new Date(programStart);
  } else {
    startDate = new Date(thisSaturday);
    startDate.setDate(thisSaturday.getDate() - 51 * 7);
    if (startDate < programStart) startDate = new Date(programStart);
  }
  const startDow = startDate.getDay();
  const startSatOffset = (startDow + 1) % 7;
  startDate.setDate(startDate.getDate() - startSatOffset);
  startDate.setHours(0, 0, 0, 0);

  const byDate = new Map<string, LogEntry>();
  for (const l of logs) {
    const d = new Date(l.date);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!byDate.has(iso)) byDate.set(iso, l);
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const weeks: YearGridWeek[] = [];
  const cursor = new Date(startDate);
  let prevMonth = -1;
  const endMs = thisSaturday.getTime() + 7 * 24 * 60 * 60 * 1000;
  while (cursor.getTime() < endMs) {
    const cells: YearGridCell[] = [];
    const weekStartMonth = cursor.getMonth();
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(cursor);
      cellDate.setDate(cursor.getDate() + d);
      cellDate.setHours(0, 0, 0, 0);
      const iso = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
      cells.push({
        date: cellDate,
        iso,
        log: byDate.get(iso) ?? null,
        isToday: cellDate.getTime() === todayMs,
        isFuture: cellDate.getTime() > todayMs,
      });
    }
    const monthLabel = weekStartMonth !== prevMonth ? (months[weekStartMonth] ?? null) : null;
    prevMonth = weekStartMonth;
    weeks.push({ cells, monthLabel });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

function renderYearGrid(): string {
  const logs = loadLogs();
  const weeks = buildYearGrid(logs);
  const dayLabels = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const currentWeekCount = getWeekCount(0);

  const CELL = 6;
  const GAP = 2;
  const ROW_LABEL_W = 28;
  const HEADER_H = 14;

  const totalCols = weeks.length;
  const gridW = totalCols * (CELL + GAP) - GAP;
  const gridH = 7 * (CELL + GAP) - GAP;
  const svgW = ROW_LABEL_W + gridW;
  const svgH = HEADER_H + gridH + 4;

  const monthHeaders = weeks
    .map((w, colIdx) => {
      if (!w.monthLabel) return '';
      const x = ROW_LABEL_W + colIdx * (CELL + GAP);
      return `<text x="${x}" y="10" class="year-grid-month">${w.monthLabel}</text>`;
    })
    .join('');

  const rowLabels = dayLabels
    .map((lbl, rowIdx) => {
      const y = HEADER_H + rowIdx * (CELL + GAP) + CELL - 1;
      return `<text x="0" y="${y}" class="year-grid-row-label">${lbl}</text>`;
    })
    .join('');

  const cells = weeks
    .map((w, colIdx) => {
      const x = ROW_LABEL_W + colIdx * (CELL + GAP);
      return w.cells
        .map((c, rowIdx) => {
          if (c.isFuture) return '';
          const y = HEADER_H + rowIdx * (CELL + GAP);
          const colorVar = c.log
            ? c.log.workout === 'A'
              ? 'var(--dot-a)'
              : c.log.workout === 'B'
                ? 'var(--dot-b)'
                : 'var(--dot-c)'
            : 'transparent';
          const strokeVar = c.isToday ? 'var(--accent)' : c.log ? colorVar : 'var(--border-strong)';
          const tooltip = c.log
            ? `${formatDate(c.iso)} · Workout ${c.log.workout} · capacity ${c.log.capacityBefore}→${c.log.capacityAfter}`
            : `${formatDate(c.iso)} · no workout`;
          const clickAttr = c.log?.id ? `data-detail="${escapeHtml(c.log.id)}"` : '';
          const cls = [
            'year-grid-cell',
            c.log ? 'year-grid-cell-active' : 'year-grid-cell-empty',
            c.isToday ? 'year-grid-cell-today' : '',
            c.log ? 'year-grid-cell-clickable' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="1" ry="1"
                       class="${cls}" fill="${colorVar}" stroke="${strokeVar}"
                       ${clickAttr}><title>${escapeHtml(tooltip)}</title></rect>`;
        })
        .join('');
    })
    .join('');

  return `
    <div class="card year-grid-card">
      <div class="year-grid-header">
        <h3 class="year-grid-title">
          Consistency · <span class="year-grid-sub">sessions per week</span>
        </h3>
        <div class="year-grid-stat">
          <span class="year-grid-count">${currentWeekCount} of 3</span>
          <span class="year-grid-stat-label">this week</span>
        </div>
      </div>
      <div class="year-grid-scroll">
        <svg class="year-grid" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}"
             role="img" aria-label="Workout consistency heatmap, last ${weeks.length} weeks">
          ${monthHeaders}
          ${rowLabels}
          ${cells}
        </svg>
      </div>
    </div>
  `;
}
