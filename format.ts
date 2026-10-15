// format.ts - small pure string/label helpers shared by app.ts and the screen modules
// (code-shape step 8b, Oct 14 2026). Moved out of app.ts verbatim - no behaviour change.
//
// Why: a screen may not import app.ts, and these three are used by app.ts AND by the
// rides page. Pure: imports nothing, touches no DOM, no storage, no clock.

export const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// "Sep 19" — for "since May 2" and the like.
export function formatMonthDay(iso: string): string {
  const d = new Date(iso);
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatMmSs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatWeekRange(start: Date, end: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = `${months[start.getMonth()]} ${start.getDate()}`;
  const endStr = sameMonth ? `${end.getDate()}` : `${months[end.getMonth()]} ${end.getDate()}`;
  return `${startStr}–${endStr}`;
}
