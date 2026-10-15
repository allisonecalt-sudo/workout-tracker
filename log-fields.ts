// log-fields.ts - the field markup the pre-log and the post-log share (code-shape step 15a,
// Oct 15 2026). Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the 1-10 chip row (renderChipRow), the body / mood field (renderBodyChips), the
// Back & wrist combined control (renderBackWristControl) and the "is this the time?"
// confirm row (renderTimeConfirmBlock). Strings out, no DOM writes, no state writes.
// WHY: screens/prelog.ts and screens/postlog.ts draw the same components with their own
// ids; a screen may not import another screen, so the shared markup lives here (no copies).
// RULE: imports only dates / format / pain-feel; never app.ts or a screen.

import { feelFromPain } from './pain-feel.js';
import { escapeHtml } from './format.js';
import { formatClock } from './dates.js';

// v48 · P5 (Sep 24 2026) — the body reading as 1-10 tap chips (DECISIONS Q6).
// BLANK until she taps: the v46 fix was made because the invented 5 faked a
// decline (after = 5 in 6 of 8 Round-2 sessions), and a slider pre-set to her
// last number would bring the same lie back as "same as last time". A chip
// keeps an honest reading at one tap; tapping the chosen one again clears it.
// Selected = --accent-progress (a reading, not the primary action — no sage).
export function renderChipRow(
  idPrefix: string,
  value: number,
  touched: boolean,
  ariaLabel: string
): string {
  const chip = (n: number): string => {
    const on = touched && value === n;
    return `<button class="body-chip${on ? ' body-chip-on' : ''}" id="${idPrefix}-${n}" type="button" role="radio" aria-checked="${on ? 'true' : 'false'}" data-body-chip="${idPrefix}" data-value="${n}">${n}</button>`;
  };
  const row = (from: number): string =>
    `<div class="body-chip-row">${[0, 1, 2, 3, 4].map((i) => chip(from + i)).join('')}</div>`;
  return `<div class="body-chips" role="radiogroup" aria-label="${escapeHtml(ariaLabel)}">${row(1)}${row(6)}</div>`;
}

// v50 · mood: same component, a different anchor line — the default stays
// the BODY wording so every other caller is untouched.
export function renderBodyChips(
  idPrefix: string,
  value: number,
  touched: boolean,
  label = '',
  anchor = '1 empty · 5 ordinary · 10 strong'
): string {
  return `
    <div class="field body-field">
      <span class="label-text body-label">${escapeHtml(label)}</span>
      ${renderChipRow(idPrefix, value, touched, label)}
      <div class="body-anchor">${escapeHtml(anchor)}</div>
    </div>`;
}

// v51 (Sep 25 2026): the Back & wrist combined control (Fine · Back · Wrist),
// shared by post-log AND pre-log now — her words: "and all metrics bf
// workout have after as well". Same component either place (one Fine tap for
// a clean session; Back/Wrist each open their own 1-10 row) — only the ids
// and which state fields feed it differ, passed in by the caller so post-
// log's already-shipped ids (and tests) never move.
// v53 (Sep 26 2026): backValue/wristValue arrive here as STORED PAIN — the
// chip row itself is drawn and read back in FEEL (feelFromPain), so the tap
// handler below is the only other place that has to know about the flip.
export function renderBackWristControl(opts: {
  fineId: string;
  backSomeId: string;
  wristSomeId: string;
  backChipGroup: string;
  wristChipGroup: string;
  backValue: number;
  backTouched: boolean;
  backOpen: boolean;
  wristValue: number;
  wristTouched: boolean;
  wristOpen: boolean;
}): string {
  const bothFine =
    opts.backTouched && opts.backValue === 0 && opts.wristTouched && opts.wristValue === 0;
  // v53 fix (CHECK M5, Sep 26 2026): the lit flag used to be `touched &&
  // value > 0` — feel 10 IS pain 0, so tapping the good end (10 · feels
  // fine) saved correctly but never lit, and looked un-tappable/broken (her
  // Cue complaint again). `touched` alone is the right flag: it's already
  // reset on open by the Back/Wrist buttons, so it can't leak a stale light
  // from a previous session.
  const backRow = opts.backOpen
    ? `<div class="label-text body-label">How does your back feel?</div>
       ${renderChipRow(opts.backChipGroup, feelFromPain(opts.backValue), opts.backTouched, 'How does your back feel, 1 to 10')}
       <div class="body-anchor">1 hurts a lot · 10 feels fine</div>`
    : '';
  const wristRow = opts.wristOpen
    ? `<div class="label-text body-label">How does your wrist feel?</div>
       ${renderChipRow(opts.wristChipGroup, feelFromPain(opts.wristValue), opts.wristTouched, 'How does your wrist feel, 1 to 10')}
       <div class="body-anchor">1 hurts a lot · 10 feels fine</div>`
    : '';
  return `
    <div class="field back-field">
      <span class="label-text">Back &amp; wrist</span>
      <div class="back-choice">
        <button class="back-chip${bothFine ? ' body-chip-on' : ''}" id="${opts.fineId}" type="button" aria-pressed="${bothFine ? 'true' : 'false'}">Fine</button>
        <button class="back-chip${opts.backOpen ? ' back-chip-open' : ''}" id="${opts.backSomeId}" type="button" aria-pressed="${opts.backOpen ? 'true' : 'false'}">Back</button>
        <button class="back-chip${opts.wristOpen ? ' back-chip-open' : ''}" id="${opts.wristSomeId}" type="button" aria-pressed="${opts.wristOpen ? 'true' : 'false'}">Wrist</button>
      </div>
      ${backRow}
      ${wristRow}
    </div>`;
}

// T1 (Sep 27 2026), PLAN-2026-09-26.md §3.1/§3.2: the "is this the time?"
// confirm row — shared shape for the pre-log start question and the
// post-log finish question, only the label/ids/kind differing. Live
// (unconfirmed): a plain line + ✓ Right / ✎ Fix, plus the time box + "N min
// ago" chips once ✎ is tapped. Confirmed: one dim line, no buttons.
export function renderTimeConfirmBlock(opts: {
  kind: 'start' | 'end';
  label: string;
  at: string | null;
  confirmed: boolean;
  editingOpen: boolean;
}): string {
  const candidateIso = opts.confirmed && opts.at ? opts.at : new Date().toISOString();
  const clock = formatClock(candidateIso);
  if (opts.confirmed) {
    const verb = opts.kind === 'start' ? 'Started' : 'Finished';
    return `<p class="timing-line timing-confirmed" id="time-${opts.kind}">${verb} ${clock} ✓</p>`;
  }
  const editRow = opts.editingOpen
    ? `<div class="timing-edit">
        <input type="time" id="time-${opts.kind}-input" value="${clock}" />
        <div class="timing-ago-row">
          ${[5, 10, 15]
            .map(
              (m) =>
                `<button class="timing-ago-chip" type="button" data-time-chip="${opts.kind}" data-mins="${m}">${m} min ago</button>`
            )
            .join('')}
        </div>
      </div>`
    : '';
  return `
    <div class="timing-row">
      <p class="timing-line" id="time-${opts.kind}">${escapeHtml(opts.label)} · ${clock}. Right?</p>
      <div class="timing-actions">
        <button class="timing-btn" type="button" id="time-${opts.kind}-ok">✓ Right</button>
        <button class="timing-btn" type="button" id="time-${opts.kind}-fix">✎ Fix</button>
      </div>
    </div>
    ${editRow}
  `;
}
