// dates.ts — small pure date/label helpers (code-shape step 4a, Oct 13 2026).
//
// WHAT: formatDate / formatWeekdayDate ("Sep 26" / "Sat Sep 26"), localIsoDate
// and weekStartIso (a Date's LOCAL calendar day as YYYY-MM-DD).
// WHY: program-week.ts (the week clock glue) needs them and must never import
// app.ts. No DOM, no storage, no state — a Date or ISO string in, a string out.
// Moved verbatim from app.ts, which imports them back.

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// WK2 (Sep 27 2026): "Sat Sep 26" — the week card's #week-sub needs the
// weekday named (it's the whole point of the Sat/Sun-anchor line), which
// plain formatDate() doesn't carry and formatDateLong() buries under a full
// "Sat, Sep 26, 2026".
export function formatWeekdayDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${formatDate(iso)}`;
}

// v48 · P3 (Sep 24 2026): a Date's LOCAL calendar day as YYYY-MM-DD.
export function localIsoDate(d: Date): string {
  return weekStartIso(d);
}

export function weekStartIso(weekStart: Date): string {
  const m = String(weekStart.getMonth() + 1).padStart(2, '0');
  const d = String(weekStart.getDate()).padStart(2, '0');
  return `${weekStart.getFullYear()}-${m}-${d}`;
}
