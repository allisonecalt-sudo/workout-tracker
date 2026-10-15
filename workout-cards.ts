// workout-cards.ts - the exercise cards under a workout step (code-shape step 17a-0, Oct 15 2026).
// Moved verbatim out of app.ts; no behaviour change, no version bump.
//
// WHAT: the picture / video row (renderExerciseVisual), the one-time kit setup block
// (renderExerciseSetup), the enriched detail card (voice note + muscle target + Steps / Do & Don't /
// Common mistakes dropdowns), the how-to card and its frames, and the "seen this week" mark the
// how-to toggle writes.
// WHY: screens/workout.ts (17a) draws them under the exercise step, and the cool-down list (17c, still
// in app.ts) draws renderExerciseSetup per stretch row - a screen cannot import app.ts, so they live
// below both. Strings out, no DOM writes (markHowToSeenThisWeek writes localStorage only).
// RULE: shared layer - never imports app.ts or a screen (tests/import-graph.test.ts, default-deny).

import { EXERCISE_VISUALS } from './exercise-visuals.js';
import { EXERCISE_HOWTO, type HowToFrame } from './exercise-howto.js';
import { EXERCISE_DETAIL, muscleDiagram } from './exercise-detail.js';
import { EXERCISE_GUIDE, type Exercise } from './program.js';
import { HOWTO_SEEN_KEY_PREFIX, getHowToFirstExpand, state } from './state.js';
import { escapeHtml } from './format.js';
import { currentHowToWeekKey } from './week-clock.js';
import { isLaterRound } from './workout-now.js';

// Primary on-screen still for an exercise: the curated loop JPG if we have one,
// otherwise the first how-to illustration (SVG/JPG). Allison 2026-06-06: every
// actual exercise should show a PICTURE — not just a "watch video" poster —
// AND keep its video. Every real exercise has a how-to frame, so this gives
// picture + video coverage without sourcing new assets.
function getPrimaryStill(exerciseName: string): { svg: string } | { image: string } | null {
  const v = EXERCISE_VISUALS[exerciseName];
  if (v?.loop) return { image: v.loop };
  const frame = EXERCISE_HOWTO[exerciseName]?.frames?.[0];
  if (frame?.svg) return { svg: frame.svg };
  if (frame?.image) return { image: frame.image };
  return null;
}

// One-time kit setup for THIS week's version of an exercise (v37). Opens by
// default the first time she meets it — a step she has not done yet should not
// be hidden behind a tap — and remembers being closed for the rest of the
// session. Its video is a SECOND video, separate from the movement video in
// EXERCISE_VISUALS, because tying a band and doing a clamshell are two things.
export function renderExerciseSetup(ex: Exercise): string {
  const s = ex.setup;
  if (!s) return '';
  const key = `setup:${ex.name}`;
  const open = state.openSections[key] !== false; // default OPEN
  const videoOpen = state.videoExpandedFor === key;
  const stepsHtml = s.steps.map((t) => `<li>${t}</li>`).join('');
  return `
    <div class="setup-block${open ? ' setup-block-open' : ''}">
      <button class="setup-toggle" data-toggle-section="${escapeHtml(key)}" type="button" aria-expanded="${open}">
        <span class="setup-toggle-title">🔧 ${escapeHtml(s.title)}</span>
        <span class="setup-toggle-chev">${open ? '▾' : '▸'}</span>
      </button>
      ${
        open
          ? `<div class="setup-body">
        <ol class="setup-steps">${stepsHtml}</ol>
        ${s.footnote ? `<p class="setup-footnote">${s.footnote}</p>` : ''}
        ${
          s.youtubeId
            ? `<button class="visual-video-toggle" data-expand-video="${escapeHtml(key)}" type="button" aria-expanded="${videoOpen}">
                ${videoOpen ? '× Hide the video' : '▶ Watch someone do it (40 sec)'}
              </button>
              ${
                videoOpen
                  ? `<div class="visual-video-wrap">
                      <iframe
                        src="https://www.youtube.com/embed/${escapeHtml(s.youtubeId)}?rel=0&modestbranding=1"
                        title="${escapeHtml(s.title)}"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen
                        loading="lazy"
                      ></iframe>
                    </div>`
                  : ''
              }
              ${s.attribution ? `<div class="visual-attribution">${escapeHtml(s.attribution)}</div>` : ''}`
            : ''
        }
      </div>`
          : ''
      }
    </div>
  `;
}

// `compact` (v48, Sep 24 2026): one quiet "▶ Watch how it looks" row that
// expands on tap — used from round 2 on (she has just done the move; walk:
// "Round 2 notes closed") and ALWAYS for moves with no still, where the old
// face was a 342×257 black poster with a play icon (split squat, bird dog).
export function renderExerciseVisual(exerciseName: string, compact = false): string {
  const v = EXERCISE_VISUALS[exerciseName];
  const still = getPrimaryStill(exerciseName);
  const youtubeId = v?.youtubeId;

  // Nothing to show at all.
  if (!still && !youtubeId) return '';

  const isExpanded = state.videoExpandedFor === exerciseName;
  const safeAlt = escapeHtml(`${exerciseName} — exercise demonstration`);
  const attribution = v?.attribution ? escapeHtml(v.attribution) : '';

  const stillMarkup = still
    ? 'svg' in still
      ? `<div class="exercise-visual-still exercise-visual-still-svg">${still.svg}</div>`
      : `<img class="exercise-visual-still" src="${escapeHtml(still.image)}" alt="${safeAlt}" loading="lazy" />`
    : '';

  const videoIframe = youtubeId
    ? `<div class="visual-video-wrap">
        <iframe
          src="https://www.youtube.com/embed/${escapeHtml(youtubeId)}?rel=0&modestbranding=1"
          title="${safeAlt}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          loading="lazy"
        ></iframe>
      </div>`
    : '';

  // v48: the compact row (round 2+, or no still to show). Open = the picture
  // (if any) and the video together, closed = one quiet line.
  if (compact || !still) {
    return `
      <div class="exercise-visual exercise-visual-compact">
        <button class="visual-video-toggle" data-expand-video="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isExpanded}">
          ${isExpanded ? '× Hide' : '▶ Watch how it looks'}
        </button>
        ${isExpanded ? `${stillMarkup}${videoIframe}` : ''}
        ${isExpanded && attribution ? `<div class="visual-attribution">${attribution}</div>` : ''}
      </div>
    `;
  }

  // Still picture (trusted inline SVG, or a curated/illustration JPG). Shown as
  // the primary visual; the video sits behind a "Watch full video" expander.
  // (v48: the no-still video POSTER that used to follow is gone — a still-less
  // move takes the compact row above. Autoplay stays off: the embed loads on tap.)
  const videoBlock = youtubeId
    ? `
      <button class="visual-video-toggle" data-expand-video="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isExpanded}">
        ${isExpanded ? '× Hide video' : '▶ Watch full video'}
      </button>
      ${isExpanded ? videoIframe : ''}`
    : '';

  return `
      <div class="exercise-visual">
        ${stillMarkup}
        ${videoBlock}
        ${attribution ? `<div class="visual-attribution">${attribution}</div>` : ''}
      </div>
    `;
}

function renderHowToFrame(frame: HowToFrame, idx: number, exerciseName: string): string {
  const safeAlt = escapeHtml(`${exerciseName} — frame ${idx + 1}`);
  // Visual: either an <img> or inline SVG. SVG is trusted (hand-coded in our
  // own source) so we render it directly.
  const visualHtml = frame.svg
    ? `<div class="howto-frame-visual howto-frame-visual-svg">${frame.svg}</div>`
    : frame.image
      ? `<div class="howto-frame-visual"><img src="${escapeHtml(frame.image)}" alt="${safeAlt}" loading="lazy" /></div>`
      : '<div class="howto-frame-visual howto-frame-visual-empty"></div>';

  return `
    <div class="howto-frame">
      ${visualHtml}
      <div class="howto-frame-text">
        <div class="howto-cue howto-cue-do">
          <span class="howto-cue-icon" aria-hidden="true">✓</span>
          <span class="howto-cue-label">Do:</span>
          <span class="howto-cue-body">${escapeHtml(frame.do)}</span>
        </div>
        ${
          frame.avoid
            ? `<div class="howto-cue howto-cue-avoid">
            <span class="howto-cue-icon" aria-hidden="true">✗</span>
            <span class="howto-cue-label">Avoid:</span>
            <span class="howto-cue-body">${escapeHtml(frame.avoid)}</span>
          </div>`
            : ''
        }
      </div>
    </div>
  `;
}

// One collapsed dropdown inside the enriched detail card. Closed by default;
// its open-state lives in state.openSections keyed "<exercise>::<section>".
function renderDetailSection(
  exerciseName: string,
  sectionKey: string,
  label: string,
  icon: string,
  innerHtml: string
): string {
  const key = `${exerciseName}::${sectionKey}`;
  const isOpen = !!state.openSections[key];
  return `
    <div class="detail-section ${isOpen ? 'detail-section-open' : ''}">
      <button class="detail-section-toggle" data-toggle-section="${escapeHtml(key)}" type="button" aria-expanded="${isOpen}">
        <span class="detail-section-label"><span class="detail-section-icon" aria-hidden="true">${icon}</span> ${escapeHtml(label)}</span>
        <span class="detail-chev" aria-hidden="true">▸</span>
      </button>
      ${isOpen ? `<div class="detail-section-body">${innerHtml}</div>` : ''}
    </div>`;
}

// The enriched, low-overwhelm detail card (Allison Jul 9 2026). Face shows only
// the important, low-reading things — the ▶ voice note + the muscle-target
// picture. Steps / Do & Don't / Common mistakes are each a collapsed dropdown
// she taps to open. See exercise-detail.ts for the "why".
export function renderDetailCard(exerciseName: string): string {
  const d = EXERCISE_DETAIL[exerciseName];
  if (!d) return '';

  const stepsHtml = `<ol class="detail-steps">${d.steps
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join('')}</ol>`;

  const doDontHtml = `<ul class="detail-cues">${d.dos
    .map(
      (x) =>
        `<li class="detail-cue-do"><span class="detail-cue-mark" aria-hidden="true">✓</span>${escapeHtml(x)}</li>`
    )
    .join('')}${d.donts
    .map(
      (x) =>
        `<li class="detail-cue-dont"><span class="detail-cue-mark" aria-hidden="true">✗</span>${escapeHtml(x)}</li>`
    )
    .join('')}</ul>`;

  const mistakesHtml = `<ul class="detail-mistakes">${d.mistakes
    .map(
      (m) =>
        `<li><span class="detail-mistake">${escapeHtml(m.mistake)}</span><span class="detail-fix">${escapeHtml(m.fix)}</span></li>`
    )
    .join('')}</ul>`;

  return `
    <div class="detail-card">
      <div class="detail-face">
        <button class="voice-note-btn is-secondary" data-voice-src="${escapeHtml(d.voiceSrc)}" type="button">
          <span class="voice-note-icon" aria-hidden="true">▶</span>
          <span class="voice-note-label">Listen — how to do it</span>
        </button>
        <div class="muscle-target">
          <div class="muscle-target-diagram">${muscleDiagram(d.muscles)}</div>
          <div class="muscle-target-label"><span class="muscle-target-title">Targets</span>${escapeHtml(d.muscleLabel)}</div>
        </div>
      </div>
      ${renderDetailSection(exerciseName, 'steps', 'Steps', '🔢', stepsHtml)}
      ${renderDetailSection(exerciseName, 'dodont', "Do & Don't", '✓', doDontHtml)}
      ${renderDetailSection(exerciseName, 'mistakes', 'Common mistakes', '⚠️', mistakesHtml)}
    </div>`;
}

export function renderHowToCard(exerciseName: string): string {
  // Prefer multi-frame visual how-to. Fall back to legacy EXERCISE_GUIDE text
  // if the exercise hasn't been mapped to EXERCISE_HOWTO yet (archive-not-
  // delete principle: EXERCISE_GUIDE stays in source as a permanent fallback).
  const howto = EXERCISE_HOWTO[exerciseName];
  const guide = EXERCISE_GUIDE[exerciseName];
  if (!howto && !guide) return '';

  // First-time-this-week → open by default. After that, collapsed.
  // WK4 (Sep 27 2026): currentHowToWeekKey() branches pre/post-launch — see
  // its own comment next to howToWeekKey.
  const week = currentHowToWeekKey();
  const seenKey = `${HOWTO_SEEN_KEY_PREFIX}${howToWeekKey(week)}`;
  let seen: Record<string, boolean> = {};
  try {
    const raw = localStorage.getItem(seenKey);
    if (raw) seen = JSON.parse(raw) as Record<string, boolean>;
  } catch {
    seen = {};
  }
  const isFirstThisWeek = !seen[exerciseName];
  const userOpened = state.howToOpenFor === exerciseName;
  const userClosed = state.howToOpenFor === `__closed__${exerciseName}`;
  // Ship 6: respect "Show how-to expanded first time per week" setting (default
  // on). If off, never auto-expand — only show when user explicitly opens.
  // v48 (Sep 24 2026): never auto-open from round 2 on — she has just done the
  // move (walk-in-her-shoes: "Round 2 notes closed").
  const autoExpand = getHowToFirstExpand() && !isLaterRound();
  const isOpen = userOpened || (autoExpand && isFirstThisWeek && !userClosed);

  const innerHtml = howto
    ? `<div class="howto-frames">
        ${howto.frames.map((f, i) => renderHowToFrame(f, i, exerciseName)).join('')}
      </div>`
    : guide
      ? `<p class="how-to-text">${escapeHtml(guide.howTo)}</p>`
      : '';

  return `
    <div class="how-to-card ${isOpen ? 'how-to-open' : ''}">
      <button class="how-to-toggle" data-toggle-howto="${escapeHtml(exerciseName)}" type="button" aria-expanded="${isOpen}">
        <span>📖 How to do it</span>
        <span class="how-to-chev">▸</span>
      </button>
      ${isOpen ? innerHtml : ''}
    </div>
  `;
}

// Rounds repeat week numbers, so the localStorage seen-key needs the round in
// it from round 2 on. Round-1 keys stay bare numbers (backwards compatible).
function howToWeekKey(week: { num: number; round: number }): string {
  return week.round > 1 ? `r${week.round}-${week.num}` : `${week.num}`;
}

export function markHowToSeenThisWeek(exerciseName: string): void {
  const week = currentHowToWeekKey();
  const seenKey = `${HOWTO_SEEN_KEY_PREFIX}${howToWeekKey(week)}`;
  let seen: Record<string, boolean> = {};
  try {
    const raw = localStorage.getItem(seenKey);
    if (raw) seen = JSON.parse(raw) as Record<string, boolean>;
  } catch {
    seen = {};
  }
  seen[exerciseName] = true;
  try {
    localStorage.setItem(seenKey, JSON.stringify(seen));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}
