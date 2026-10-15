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

// "18:31" — the 24-hour clock she reads (the old locale time could come out as
// "06:31 PM" on one phone and "18:31" on another).
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// T1 (Sep 27 2026), §3.1's ✎ time box — formatClock's inverse. Takes the
// calendar day from `baseIso` (the candidate she's fixing — always tonight,
// never a date she has to also type) and the clock from the native
// `<input type=time>`'s own "HH:MM" value.
export function combineDateAndClock(baseIso: string, hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return baseIso;
  const base = new Date(baseIso);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const combined = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    hours,
    minutes,
    0,
    0
  );
  return combined.toISOString();
}
