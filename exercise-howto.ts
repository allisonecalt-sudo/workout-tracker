// exercise-howto.ts — multi-frame visual how-to data, sourced 2026-05-15.
//
// Built for Allison's content-build pass May 15, 2026. The text-only
// EXERCISE_GUIDE in app.ts is preserved as a fallback for any exercise NOT
// keyed here, per the archive-not-delete rule (memory
// `feedback_archive_never_delete.md`).
//
// Each entry has 3-4 frames. Each frame has:
//   - image (path to JPG/PNG relative to index.html) OR svg (inline SVG string)
//   - do: a single positive cue, ≤ 12 words
//   - avoid: a single common mistake, ≤ 12 words (optional but encouraged)
//
// Sourcing notes:
//   - JPG frames come from yuhonas/free-exercise-db (Unlicense / public domain),
//     same source as exercise-visuals.ts.
//   - Inline SVG stick figures are hand-coded here (CC0-equivalent — this file).
//     They're intentionally simple: phone-on-shelf glanceability beats fine
//     anatomy. Each ~60-100 lines of SVG.
//
// Health-constraint cues integrated:
//   - No palm load on the floor — wrists still off (Lisa Cohen May 15 clearance
//     covered FOREARMS only; hands stay off). Surfaced wherever there's any
//     temptation to drop to palms (planks, dead bug, downward dog-adjacent).
//   - Back protection — squats, bridges, dead bug, planks all carry a flat-back
//     or no-arch avoid line.
//   - Knee — squat / lunge avoid lines surface "Don't push past pain ceiling."
//   - Wrist-PT exercises (Lisa Cohen tuna-can protocol) — cues are literal
//     repeats of her protocol; no editorializing.

export interface HowToFrame {
  image?: string;
  svg?: string;
  do: string;
  avoid?: string;
}

export interface ExerciseHowTo {
  exercise: string;
  frames: HowToFrame[];
  sourceNotes?: string;
}

// ---------- SVG primitives ----------
// Keep all SVGs at viewBox 0 0 240 180 so they share a uniform aspect
// (~4:3) and render at consistent size. Color tokens use currentColor
// and var(--accent) so they pick up the dark-mode theme automatically.

const SVG_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180" class="howto-svg" role="img" aria-hidden="true">`;
const SVG_CLOSE = `</svg>`;

// shared subtleties:
//   - mat: a thin rectangle representing the floor/mat
//   - body: rounded rectangle (torso) + filled circle (head)
//   - line work uses stroke-linecap=round for friendliness

const MAT = `<rect x="10" y="155" width="220" height="6" rx="2" fill="#4a544c" />`;

function s(inner: string): string {
  return `${SVG_OPEN}${MAT}${inner}${SVG_CLOSE}`;
}

function sNoMat(inner: string): string {
  return `${SVG_OPEN}${inner}${SVG_CLOSE}`;
}

// ---------- Specific SVGs (warmup / breathing / wrist PT) ----------

// Belly breathing — lying on back, belly rising
const SVG_BELLY_BREATH_INHALE = s(`
  <!-- supine figure, knees bent, belly rounded up = inhale -->
  <line x1="40" y1="150" x2="180" y2="150" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
  <!-- head -->
  <circle cx="46" cy="140" r="10" fill="#8fbc8f" />
  <!-- torso + belly bulge -->
  <path d="M55 148 Q90 110 130 148" fill="#a3cfa3" opacity="0.7" stroke="#8fbc8f" stroke-width="2.5" />
  <!-- bent legs (knees up) -->
  <path d="M130 148 L150 110 L180 150" fill="none" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <!-- arrow up over belly -->
  <line x1="92" y1="80" x2="92" y2="120" stroke="#e6b450" stroke-width="2.5" stroke-linecap="round" />
  <polygon points="92,75 87,85 97,85" fill="#e6b450" />
  <text x="105" y="92" fill="#e6b450" font-size="13" font-family="sans-serif" font-weight="600">belly rises</text>
`);

const SVG_BELLY_BREATH_EXHALE = s(`
  <!-- supine, knees up, belly flat = exhale -->
  <line x1="40" y1="150" x2="180" y2="150" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
  <circle cx="46" cy="140" r="10" fill="#8fbc8f" />
  <path d="M55 148 Q90 130 130 148" fill="#a3cfa3" opacity="0.5" stroke="#8fbc8f" stroke-width="2.5" />
  <path d="M130 148 L150 110 L180 150" fill="none" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <line x1="92" y1="120" x2="92" y2="80" stroke="#d97757" stroke-width="2.5" stroke-linecap="round" />
  <polygon points="92,125 87,115 97,115" fill="#d97757" />
  <text x="105" y="92" fill="#d97757" font-size="13" font-family="sans-serif" font-weight="600">slow exhale</text>
`);

const SVG_BELLY_BREATH_WRONG = s(`
  <!-- chest rising instead of belly = the mistake -->
  <line x1="40" y1="150" x2="180" y2="150" stroke="#a8a59c" stroke-width="3" stroke-linecap="round" />
  <circle cx="46" cy="140" r="10" fill="#a8a59c" />
  <!-- torso bulges at the CHEST -->
  <path d="M55 148 Q70 100 100 148 Q120 145 130 148" fill="#d97757" opacity="0.5" stroke="#a8a59c" stroke-width="2.5" />
  <path d="M130 148 L150 110 L180 150" fill="none" stroke="#a8a59c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <!-- big red X over chest -->
  <line x1="65" y1="105" x2="85" y2="125" stroke="#d97757" stroke-width="3" stroke-linecap="round" />
  <line x1="85" y1="105" x2="65" y2="125" stroke="#d97757" stroke-width="3" stroke-linecap="round" />
  <text x="100" y="100" fill="#d97757" font-size="12" font-family="sans-serif" font-weight="600">chest rising = wrong</text>
`);

// Slow breathing (cooldown — same template but seated)
const SVG_SLOW_BREATH_IN = sNoMat(`
  <!-- seated figure in profile, breath inhale -->
  <circle cx="80" cy="55" r="14" fill="#8fbc8f" />
  <path d="M80 70 Q85 95 90 130 L110 130 Q105 95 100 70 Z" fill="#a3cfa3" stroke="#8fbc8f" stroke-width="2.5" opacity="0.85" />
  <!-- crossed legs hint -->
  <path d="M90 130 L130 150 M110 130 L75 150" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" fill="none" />
  <!-- inhale arrow into nose -->
  <line x1="130" y1="55" x2="100" y2="55" stroke="#e6b450" stroke-width="2.5" stroke-linecap="round" />
  <polygon points="98,55 108,50 108,60" fill="#e6b450" />
  <text x="138" y="58" fill="#e6b450" font-size="13" font-family="sans-serif" font-weight="600">inhale 4</text>
`);

const SVG_SLOW_BREATH_OUT = sNoMat(`
  <circle cx="80" cy="55" r="14" fill="#8fbc8f" />
  <path d="M80 70 Q85 95 90 130 L110 130 Q105 95 100 70 Z" fill="#a3cfa3" stroke="#8fbc8f" stroke-width="2.5" opacity="0.85" />
  <path d="M90 130 L130 150 M110 130 L75 150" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" fill="none" />
  <!-- exhale arrow out of mouth -->
  <line x1="98" y1="60" x2="170" y2="60" stroke="#d97757" stroke-width="2.5" stroke-linecap="round" />
  <polygon points="170,60 160,55 160,65" fill="#d97757" />
  <text x="135" y="78" fill="#d97757" font-size="13" font-family="sans-serif" font-weight="600">exhale 6</text>
`);

// Glute squeezes — lying down, glutes engaged
const SVG_GLUTE_SQUEEZE = s(`
  <line x1="40" y1="150" x2="200" y2="150" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
  <circle cx="46" cy="140" r="10" fill="#8fbc8f" />
  <!-- supine torso with knees up -->
  <path d="M55 148 L130 148 L150 115 L180 150" fill="none" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <!-- glutes highlight -->
  <ellipse cx="128" cy="146" rx="14" ry="7" fill="#e6b450" opacity="0.75" />
  <text x="118" y="172" fill="#e6b450" font-size="12" font-family="sans-serif" font-weight="600">squeeze + hold 3s</text>
`);

const SVG_GLUTE_SQUEEZE_RELEASE = s(`
  <line x1="40" y1="150" x2="200" y2="150" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
  <circle cx="46" cy="140" r="10" fill="#8fbc8f" />
  <path d="M55 148 L130 148 L150 115 L180 150" fill="none" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <ellipse cx="128" cy="146" rx="14" ry="7" fill="#8fbc8f" opacity="0.3" />
  <text x="118" y="172" fill="#8fbc8f" font-size="12" font-family="sans-serif" font-weight="600">relax 2s</text>
`);

// Wall sit — figure with back flat against wall
const SVG_WALL_SIT = sNoMat(`
  <!-- wall -->
  <line x1="30" y1="20" x2="30" y2="160" stroke="#4a544c" stroke-width="6" stroke-linecap="round" />
  <!-- floor -->
  <line x1="30" y1="160" x2="220" y2="160" stroke="#4a544c" stroke-width="4" stroke-linecap="round" />
  <!-- head -->
  <circle cx="48" cy="40" r="12" fill="#8fbc8f" />
  <!-- torso pressed to wall -->
  <line x1="48" y1="52" x2="48" y2="100" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- thigh (horizontal, knee at 90) -->
  <line x1="48" y1="100" x2="125" y2="100" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- shin (vertical) -->
  <line x1="125" y1="100" x2="125" y2="160" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- 90 degree marker -->
  <path d="M115 100 L115 110 L125 110" fill="none" stroke="#e6b450" stroke-width="1.5" />
  <text x="135" y="106" fill="#e6b450" font-size="12" font-family="sans-serif" font-weight="600">90°</text>
  <!-- arms hanging -->
  <line x1="48" y1="65" x2="42" y2="95" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
`);

const SVG_WALL_SIT_DEEPER = sNoMat(`
  <line x1="30" y1="20" x2="30" y2="160" stroke="#4a544c" stroke-width="6" stroke-linecap="round" />
  <line x1="30" y1="160" x2="220" y2="160" stroke="#4a544c" stroke-width="4" stroke-linecap="round" />
  <circle cx="48" cy="55" r="12" fill="#8fbc8f" />
  <line x1="48" y1="67" x2="48" y2="115" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- thigh slightly steeper -->
  <line x1="48" y1="115" x2="115" y2="120" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="115" y1="120" x2="115" y2="160" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="48" y1="80" x2="42" y2="110" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
  <text x="130" y="100" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">shallower = easier today</text>
`);

const SVG_WALL_SIT_WRONG = sNoMat(`
  <!-- knees past toes — wrong -->
  <line x1="30" y1="20" x2="30" y2="160" stroke="#4a544c" stroke-width="6" stroke-linecap="round" />
  <line x1="30" y1="160" x2="220" y2="160" stroke="#4a544c" stroke-width="4" stroke-linecap="round" />
  <circle cx="48" cy="40" r="12" fill="#a8a59c" />
  <line x1="48" y1="52" x2="48" y2="100" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
  <!-- knees too far forward -->
  <line x1="48" y1="100" x2="150" y2="115" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
  <line x1="150" y1="115" x2="125" y2="160" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
  <!-- red zone over knee -->
  <circle cx="150" cy="115" r="9" fill="none" stroke="#d97757" stroke-width="2.5" />
  <line x1="143" y1="108" x2="157" y2="122" stroke="#d97757" stroke-width="2.5" />
  <text x="100" y="80" fill="#d97757" font-size="12" font-family="sans-serif" font-weight="600">knees past toes</text>
`);

// Side-lying clamshells
const SVG_CLAMSHELL_CLOSED = s(`
  <!-- side view, hips stacked, knees bent, closed -->
  <circle cx="50" cy="120" r="10" fill="#8fbc8f" />
  <!-- bottom arm extended along floor -->
  <line x1="58" y1="120" x2="40" y2="150" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
  <!-- torso lying on side -->
  <line x1="58" y1="125" x2="125" y2="135" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- bent legs (both together) -->
  <line x1="125" y1="135" x2="170" y2="118" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="170" y1="118" x2="200" y2="148" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <text x="100" y="95" fill="#a8a59c" font-size="11" font-family="sans-serif" font-weight="600">start: knees together</text>
`);

const SVG_CLAMSHELL_OPEN = s(`
  <!-- knee opens upward -->
  <circle cx="50" cy="120" r="10" fill="#8fbc8f" />
  <line x1="58" y1="120" x2="40" y2="150" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
  <line x1="58" y1="125" x2="125" y2="135" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- bottom leg stays low -->
  <line x1="125" y1="135" x2="170" y2="118" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6" />
  <line x1="170" y1="118" x2="200" y2="148" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6" />
  <!-- top knee lifts open -->
  <line x1="125" y1="132" x2="165" y2="80" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <line x1="165" y1="80" x2="200" y2="145" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <path d="M155 110 A 25 25 0 0 1 170 90" fill="none" stroke="#e6b450" stroke-width="2" stroke-dasharray="3 3" />
  <text x="100" y="55" fill="#e6b450" font-size="12" font-family="sans-serif" font-weight="600">open top knee</text>
`);

const SVG_CLAMSHELL_WRONG = s(`
  <!-- hip rolled back — wrong -->
  <circle cx="50" cy="120" r="10" fill="#a8a59c" />
  <line x1="58" y1="120" x2="40" y2="150" stroke="#a8a59c" stroke-width="3" stroke-linecap="round" />
  <line x1="58" y1="125" x2="125" y2="125" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
  <line x1="125" y1="125" x2="175" y2="105" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6" />
  <line x1="175" y1="105" x2="205" y2="138" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6" />
  <!-- hip rolled back, top knee way back -->
  <line x1="125" y1="122" x2="175" y2="55" stroke="#d97757" stroke-width="6" stroke-linecap="round" />
  <line x1="175" y1="55" x2="200" y2="135" stroke="#d97757" stroke-width="6" stroke-linecap="round" />
  <text x="80" y="35" fill="#d97757" font-size="12" font-family="sans-serif" font-weight="600">hip rolled back = cheating</text>
`);

// Forearm plank — Lisa Cohen May 15 cleared; forearms ONLY, no palms
const SVG_FOREARM_PLANK = sNoMat(`
  <!-- floor -->
  <line x1="20" y1="135" x2="220" y2="135" stroke="#4a544c" stroke-width="4" stroke-linecap="round" />
  <!-- head -->
  <circle cx="40" cy="80" r="11" fill="#8fbc8f" />
  <!-- body line: straight from shoulder to ankles -->
  <line x1="50" y1="85" x2="200" y2="120" stroke="#8fbc8f" stroke-width="7" stroke-linecap="round" />
  <!-- forearms on ground (NOT hands) -->
  <line x1="48" y1="88" x2="48" y2="135" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <line x1="48" y1="135" x2="78" y2="135" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <!-- toes -->
  <line x1="200" y1="120" x2="210" y2="135" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <text x="58" y="155" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">forearms only</text>
`);

const SVG_FOREARM_PLANK_BACK_FLAT = sNoMat(`
  <line x1="20" y1="135" x2="220" y2="135" stroke="#4a544c" stroke-width="4" stroke-linecap="round" />
  <circle cx="40" cy="80" r="11" fill="#8fbc8f" />
  <line x1="50" y1="85" x2="200" y2="120" stroke="#8fbc8f" stroke-width="7" stroke-linecap="round" />
  <line x1="48" y1="88" x2="48" y2="135" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="48" y1="135" x2="78" y2="135" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="200" y1="120" x2="210" y2="135" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- dashed straight line showing alignment -->
  <line x1="40" y1="80" x2="210" y2="130" stroke="#e6b450" stroke-width="2" stroke-dasharray="5 5" />
  <text x="80" y="70" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">straight line head→heel</text>
`);

const SVG_FOREARM_PLANK_WRONG = sNoMat(`
  <!-- sagging hips OR hands on floor = both wrong -->
  <line x1="20" y1="135" x2="220" y2="135" stroke="#4a544c" stroke-width="4" stroke-linecap="round" />
  <circle cx="40" cy="80" r="11" fill="#a8a59c" />
  <!-- sagging body -->
  <path d="M50 85 Q120 145 200 120" fill="none" stroke="#d97757" stroke-width="7" stroke-linecap="round" />
  <line x1="48" y1="88" x2="48" y2="135" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
  <line x1="48" y1="135" x2="78" y2="135" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
  <line x1="200" y1="120" x2="210" y2="135" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
  <!-- arrow at sag -->
  <line x1="120" y1="160" x2="120" y2="142" stroke="#d97757" stroke-width="2" stroke-linecap="round" />
  <polygon points="120,138 115,148 125,148" fill="#d97757" />
  <text x="78" y="170" fill="#d97757" font-size="11" font-family="sans-serif" font-weight="600">don't let hips sag</text>
`);

// Standing calf raises — feet rising on toes
const SVG_CALF_DOWN = sNoMat(`
  <line x1="30" y1="160" x2="220" y2="160" stroke="#4a544c" stroke-width="4" stroke-linecap="round" />
  <!-- wall hint -->
  <line x1="30" y1="40" x2="30" y2="160" stroke="#4a544c" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 4" />
  <circle cx="100" cy="50" r="12" fill="#8fbc8f" />
  <!-- body -->
  <line x1="100" y1="62" x2="100" y2="135" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- legs flat -->
  <line x1="100" y1="135" x2="100" y2="160" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- fingertip touching wall -->
  <line x1="100" y1="75" x2="40" y2="80" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
  <circle cx="40" cy="80" r="3" fill="#e6b450" />
  <text x="115" y="58" fill="#a8a59c" font-size="11" font-family="sans-serif" font-weight="600">heels down · 1s reset</text>
`);

const SVG_CALF_UP = sNoMat(`
  <line x1="30" y1="160" x2="220" y2="160" stroke="#4a544c" stroke-width="4" stroke-linecap="round" />
  <line x1="30" y1="40" x2="30" y2="160" stroke="#4a544c" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 4" />
  <circle cx="100" cy="35" r="12" fill="#8fbc8f" />
  <line x1="100" y1="47" x2="100" y2="120" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="100" y1="120" x2="100" y2="145" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- heels lifted -->
  <line x1="95" y1="145" x2="110" y2="160" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <line x1="100" y1="60" x2="40" y2="80" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
  <circle cx="40" cy="80" r="3" fill="#e6b450" />
  <text x="115" y="50" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">heels lifted · hold 1s</text>
`);

// Slow supine bicycle
const SVG_BICYCLE = s(`
  <line x1="20" y1="155" x2="220" y2="155" stroke="#4a544c" stroke-width="3" />
  <circle cx="38" cy="142" r="10" fill="#8fbc8f" />
  <!-- torso -->
  <line x1="46" y1="145" x2="125" y2="145" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- arms by sides palms up -->
  <line x1="60" y1="148" x2="75" y2="155" stroke="#8fbc8f" stroke-width="3" stroke-linecap="round" />
  <!-- left leg knee up -->
  <line x1="125" y1="145" x2="135" y2="85" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <line x1="135" y1="85" x2="160" y2="115" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <!-- right leg extended -->
  <line x1="125" y1="148" x2="180" y2="138" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="180" y1="138" x2="210" y2="148" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" stroke-opacity="0.7" />
  <text x="60" y="40" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">slow alternate pedal</text>
`);

// Heel taps
const SVG_HEEL_TAPS_UP = s(`
  <line x1="20" y1="155" x2="220" y2="155" stroke="#4a544c" stroke-width="3" />
  <circle cx="38" cy="142" r="10" fill="#8fbc8f" />
  <line x1="46" y1="145" x2="125" y2="145" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- both knees up to start -->
  <line x1="125" y1="145" x2="150" y2="95" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="150" y1="95" x2="175" y2="125" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="125" y1="145" x2="155" y2="100" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6" />
  <text x="60" y="40" fill="#a8a59c" font-size="11" font-family="sans-serif" font-weight="600">start: knees up</text>
`);

const SVG_HEEL_TAPS_DOWN = s(`
  <line x1="20" y1="155" x2="220" y2="155" stroke="#4a544c" stroke-width="3" />
  <circle cx="38" cy="142" r="10" fill="#8fbc8f" />
  <line x1="46" y1="145" x2="125" y2="145" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- one knee bent up, one leg extending heel toward floor -->
  <line x1="125" y1="145" x2="150" y2="95" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6" />
  <line x1="150" y1="95" x2="175" y2="125" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6" />
  <line x1="125" y1="148" x2="190" y2="148" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <!-- heel hovering above floor -->
  <line x1="195" y1="148" x2="200" y2="153" stroke="#e6b450" stroke-width="4" stroke-linecap="round" />
  <text x="55" y="40" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">tap heel toward floor</text>
`);

// Wrist PT — Lisa Cohen tuna can protocol
// Stretch (palm out)
const SVG_WRIST_STRETCH_PALM_BACK = sNoMat(`
  <!-- forearm extended forward, palm facing forward, fingers pulled back -->
  <rect x="60" y="80" width="100" height="20" rx="10" fill="#8fbc8f" />
  <!-- hand palm out -->
  <path d="M160 80 L185 65 L185 115 L160 100 Z" fill="#8fbc8f" />
  <!-- fingers bent back -->
  <line x1="185" y1="65" x2="195" y2="50" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <line x1="185" y1="75" x2="200" y2="65" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <!-- helper hand arrow -->
  <line x1="220" y1="80" x2="200" y2="60" stroke="#e6b450" stroke-width="2" stroke-dasharray="3 3" />
  <text x="55" y="135" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">palm out · pull fingers back</text>
`);

// Stretch (palm in / push down)
const SVG_WRIST_STRETCH_PALM_DOWN = sNoMat(`
  <!-- forearm extended, palm facing self, hand pushed down -->
  <rect x="60" y="80" width="100" height="20" rx="10" fill="#8fbc8f" />
  <!-- hand flexed downward -->
  <path d="M160 80 L175 90 L165 130 L150 120 Z" fill="#8fbc8f" />
  <line x1="175" y1="90" x2="190" y2="120" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <line x1="170" y1="110" x2="185" y2="135" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <text x="55" y="155" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">flip · push hand down</text>
`);

// Tuna can flexion/extension — palm down, lifting hand up
const SVG_TUNA_PALM_DOWN_UP = sNoMat(`
  <!-- table edge -->
  <line x1="20" y1="115" x2="120" y2="115" stroke="#4a544c" stroke-width="4" />
  <!-- forearm on table -->
  <rect x="30" y="95" width="90" height="20" rx="6" fill="#8fbc8f" />
  <!-- hand off edge, can lifted UP (extension, palm down) -->
  <path d="M120 95 L150 65 L160 75 L130 115 Z" fill="#8fbc8f" />
  <!-- tuna can -->
  <rect x="140" y="55" width="22" height="16" rx="3" fill="#e6b450" stroke="#1a1f1c" stroke-width="2" />
  <text x="125" y="40" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">palm down · lift wrist UP</text>
  <!-- arrow up -->
  <line x1="180" y1="100" x2="180" y2="70" stroke="#e6b450" stroke-width="2" stroke-linecap="round" />
  <polygon points="180,65 175,75 185,75" fill="#e6b450" />
`);

// Tuna can flexion — palm up, curl wrist up
const SVG_TUNA_PALM_UP_CURL = sNoMat(`
  <line x1="20" y1="115" x2="120" y2="115" stroke="#4a544c" stroke-width="4" />
  <rect x="30" y="95" width="90" height="20" rx="6" fill="#8fbc8f" />
  <!-- palm up, curling weight up -->
  <path d="M120 115 L150 145 L160 135 L130 95 Z" fill="#8fbc8f" />
  <rect x="140" y="140" width="22" height="16" rx="3" fill="#e6b450" stroke="#1a1f1c" stroke-width="2" />
  <line x1="180" y1="145" x2="180" y2="65" stroke="#e6b450" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 3" />
  <polygon points="180,65 175,75 185,75" fill="#e6b450" />
  <text x="120" y="40" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">flip · palm up · curl UP</text>
`);

// Radial deviation — pinky side on table, lift toward thumb
const SVG_TUNA_RADIAL = sNoMat(`
  <line x1="20" y1="115" x2="160" y2="115" stroke="#4a544c" stroke-width="4" />
  <!-- forearm resting on pinky side, thumb up -->
  <rect x="30" y="85" width="100" height="30" rx="8" fill="#8fbc8f" />
  <!-- hand with thumb pointing up -->
  <path d="M130 85 L160 70 L170 80 L140 115 Z" fill="#8fbc8f" />
  <!-- tuna can held -->
  <rect x="148" y="60" width="20" height="20" rx="3" fill="#e6b450" stroke="#1a1f1c" stroke-width="2" />
  <!-- arc showing lift toward thumb -->
  <path d="M160 65 A 30 30 0 0 0 175 100" fill="none" stroke="#e6b450" stroke-width="2" stroke-dasharray="3 3" />
  <text x="50" y="155" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">thumb UP · only wrist moves</text>
`);

// ---------- Picture-based frames (free-exercise-db jpgs) ----------
// We have 2 jpgs per exercise for these (start + end). They're "0.jpg" and
// "1.jpg" in the existing assets/exercises/ folder.

const EX_DIR = 'assets/exercises';

// ---------- Cooldown / upper-back stretch SVGs (added 2026-06-03) ----------
// Fills the visual gap in the stretch block + upper-back drills, which used to
// render text-only or blank. Same grammar as above: green = body, gold =
// the active stretch, orange = the common mistake, grey = wall/floor/mat.

// Reusable "hold for N" cue card (mirrors the existing 45s/60s text frames).
function holdCard(title: string, sub: string, secs = '45s'): string {
  return sNoMat(`
    <text x="26" y="58" fill="#8fbc8f" font-size="14" font-family="sans-serif" font-weight="700">${title}</text>
    <text x="26" y="86" fill="#a8a59c" font-size="12.5" font-family="sans-serif">${sub}</text>
    <circle cx="120" cy="132" r="24" fill="none" stroke="#e6b450" stroke-width="3" />
    <text x="120" y="139" text-anchor="middle" fill="#e6b450" font-size="16" font-family="sans-serif" font-weight="700">${secs}</text>
  `);
}

// Wrist extension — forearm palm-down, fingers lifted UP toward you
const SVG_WRIST_EXTENSION = sNoMat(`
  <rect x="40" y="92" width="108" height="18" rx="9" fill="#8fbc8f" />
  <path d="M148 92 L150 60 L168 62 L166 110 Z" fill="#8fbc8f" />
  <line x1="159" y1="62" x2="162" y2="44" stroke="#8fbc8f" stroke-width="5" stroke-linecap="round" />
  <line x1="195" y1="95" x2="172" y2="55" stroke="#e6b450" stroke-width="2.5" stroke-dasharray="4 3" />
  <polygon points="170,50 170,64 180,58" fill="#e6b450" />
  <text x="26" y="142" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">palm down · pull fingers UP</text>
`);

// Wrist flexion — forearm palm-down, fingers pressed DOWN
const SVG_WRIST_FLEXION = sNoMat(`
  <rect x="40" y="82" width="108" height="18" rx="9" fill="#8fbc8f" />
  <path d="M148 82 L168 108 L154 118 L138 96 Z" fill="#8fbc8f" />
  <line x1="161" y1="108" x2="170" y2="126" stroke="#8fbc8f" stroke-width="5" stroke-linecap="round" />
  <line x1="190" y1="80" x2="168" y2="118" stroke="#e6b450" stroke-width="2.5" stroke-dasharray="4 3" />
  <polygon points="166,123 178,116 168,108" fill="#e6b450" />
  <text x="26" y="150" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">palm down · press fingers DOWN</text>
`);

// Neck stretch — head tilted toward a shoulder, light hand over the head
const SVG_NECK_STRETCH = sNoMat(`
  <line x1="70" y1="150" x2="170" y2="150" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="120" y1="150" x2="135" y2="95" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <circle cx="140" cy="80" r="16" fill="#8fbc8f" />
  <path d="M150 66 q14 -2 18 8" fill="none" stroke="#e6b450" stroke-width="4" stroke-linecap="round" />
  <path d="M118 110 q-10 -18 6 -34" fill="none" stroke="#e6b450" stroke-width="2.5" stroke-dasharray="3 3" />
  <text x="22" y="38" fill="#e6b450" font-size="12" font-family="sans-serif" font-weight="600">ear toward shoulder · light hand</text>
  <text x="22" y="172" fill="#d97757" font-size="11" font-family="sans-serif" font-weight="600">don't pull hard · no shoulder shrug</text>
`);

// Shoulder stretch — cross-body, opposite forearm cradles above the elbow
const SVG_SHOULDER_STRETCH = sNoMat(`
  <circle cx="120" cy="45" r="15" fill="#8fbc8f" />
  <line x1="120" y1="60" x2="120" y2="120" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="120" y1="78" x2="70" y2="92" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <line x1="120" y1="95" x2="78" y2="100" stroke="#8fbc8f" stroke-width="5" stroke-linecap="round" />
  <line x1="78" y1="100" x2="74" y2="88" stroke="#8fbc8f" stroke-width="5" stroke-linecap="round" />
  <line x1="92" y1="86" x2="74" y2="90" stroke="#e6b450" stroke-width="2" />
  <polygon points="70,91 80,86 80,95" fill="#e6b450" />
  <text x="22" y="150" fill="#e6b450" font-size="12" font-family="sans-serif" font-weight="600">arm across · cradle above the elbow</text>
  <text x="22" y="170" fill="#d97757" font-size="11" font-family="sans-serif" font-weight="600">don't pull on the elbow joint</text>
`);

// Figure-4 supine (Leg cross) — lying, ankle over the opposite bent knee
const SVG_FIGURE4_SUPINE = s(`
  <circle cx="36" cy="140" r="10" fill="#8fbc8f" />
  <line x1="44" y1="146" x2="120" y2="146" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="120" y1="146" x2="150" y2="100" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="150" y1="100" x2="158" y2="70" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="128" y1="120" x2="174" y2="106" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <line x1="174" y1="106" x2="170" y2="78" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <text x="40" y="48" fill="#e6b450" font-size="12" font-family="sans-serif" font-weight="600">ankle over opposite knee · draw in</text>
`);

// Leg up in air (supine hamstring) — one leg straight to the ceiling
const SVG_LEG_UP = s(`
  <circle cx="36" cy="146" r="10" fill="#8fbc8f" />
  <line x1="44" y1="150" x2="120" y2="150" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="120" y1="150" x2="200" y2="150" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" stroke-opacity="0.5" />
  <line x1="120" y1="150" x2="128" y2="58" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <line x1="112" y1="100" x2="128" y2="96" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
  <text x="40" y="44" fill="#e6b450" font-size="12" font-family="sans-serif" font-weight="600">leg to ceiling · soft knee ok</text>
  <text x="40" y="172" fill="#d97757" font-size="11" font-family="sans-serif" font-weight="600">hands behind THIGH — not the knee</text>
`);

// Both knees to chest — supine double-knee hug, low back rounds
const SVG_DOUBLE_KNEE = s(`
  <circle cx="44" cy="142" r="10" fill="#8fbc8f" />
  <line x1="52" y1="146" x2="120" y2="146" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="120" y1="146" x2="106" y2="100" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <line x1="106" y1="100" x2="150" y2="116" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <line x1="122" y1="148" x2="110" y2="104" stroke="#e6b450" stroke-width="6" stroke-linecap="round" stroke-opacity="0.7" />
  <line x1="74" y1="146" x2="118" y2="118" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
  <text x="40" y="48" fill="#e6b450" font-size="12" font-family="sans-serif" font-weight="600">hug both shins · let low back round</text>
`);

// Calf stretch on wall — back leg straight, heel pressed down, lean in
const SVG_CALF_WALL = sNoMat(`
  <line x1="200" y1="20" x2="200" y2="160" stroke="#4a544c" stroke-width="6" stroke-linecap="round" />
  <line x1="20" y1="160" x2="200" y2="160" stroke="#4a544c" stroke-width="4" stroke-linecap="round" />
  <circle cx="120" cy="50" r="12" fill="#8fbc8f" />
  <line x1="120" y1="62" x2="150" y2="105" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="135" y1="82" x2="195" y2="70" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
  <line x1="150" y1="105" x2="160" y2="160" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="150" y1="105" x2="80" y2="158" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <circle cx="80" cy="158" r="4" fill="#e6b450" />
  <text x="18" y="38" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">back leg straight · heel pressed down</text>
`);

// Hip flexor — on a couch edge, near knee hugged in, far leg dangles = stretch
const SVG_HIP_FLEXOR = sNoMat(`
  <rect x="20" y="92" width="150" height="14" rx="3" fill="#4a544c" />
  <circle cx="40" cy="80" r="11" fill="#8fbc8f" />
  <line x1="50" y1="92" x2="120" y2="92" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="120" y1="92" x2="100" y2="58" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="100" y1="58" x2="74" y2="78" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="70" y1="90" x2="98" y2="62" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
  <line x1="158" y1="100" x2="158" y2="158" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <text x="16" y="38" fill="#e6b450" font-size="10.5" font-family="sans-serif" font-weight="600">knee hugged in · other leg hangs = stretch</text>
`);

// Wall angels — back to wall, arms slide up in a Y, wrists stay on the wall
const SVG_WALL_ANGEL = sNoMat(`
  <line x1="60" y1="14" x2="60" y2="168" stroke="#4a544c" stroke-width="6" stroke-linecap="round" />
  <circle cx="74" cy="40" r="13" fill="#8fbc8f" />
  <line x1="74" y1="53" x2="74" y2="120" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="74" y1="120" x2="70" y2="160" stroke="#8fbc8f" stroke-width="5" stroke-linecap="round" />
  <line x1="74" y1="66" x2="96" y2="46" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <line x1="96" y1="46" x2="104" y2="22" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <line x1="120" y1="70" x2="120" y2="40" stroke="#e6b450" stroke-width="2" stroke-dasharray="3 3" />
  <polygon points="120,34 115,46 125,46" fill="#e6b450" />
  <text x="16" y="172" fill="#d97757" font-size="11" font-family="sans-serif" font-weight="600">wrists stay on wall · no low-back arch</text>
`);

// Scapular squeezes — back view, blades drawing toward the spine
const SVG_SCAP_SQUEEZE = sNoMat(`
  <rect x="92" y="50" width="56" height="86" rx="14" fill="#8fbc8f" opacity="0.5" />
  <line x1="120" y1="52" x2="120" y2="134" stroke="#4a544c" stroke-width="2" stroke-dasharray="3 3" />
  <path d="M112 70 L96 64 L100 96 Z" fill="#e6b450" />
  <path d="M128 70 L144 64 L140 96 Z" fill="#e6b450" />
  <line x1="86" y1="80" x2="104" y2="80" stroke="#e6b450" stroke-width="2" />
  <polygon points="107,80 97,75 97,85" fill="#e6b450" />
  <line x1="154" y1="80" x2="136" y2="80" stroke="#e6b450" stroke-width="2" />
  <polygon points="133,80 143,75 143,85" fill="#e6b450" />
  <text x="22" y="36" fill="#e6b450" font-size="12" font-family="sans-serif" font-weight="600">squeeze blades together · hold 5s</text>
  <text x="22" y="160" fill="#d97757" font-size="11" font-family="sans-serif" font-weight="600">feel it between blades, not the neck</text>
`);

// Doorway pec stretch — forearm up the frame (T-shape), step through
const SVG_DOORWAY_PEC = sNoMat(`
  <line x1="150" y1="14" x2="150" y2="168" stroke="#4a544c" stroke-width="6" stroke-linecap="round" />
  <circle cx="96" cy="48" r="13" fill="#8fbc8f" />
  <line x1="96" y1="61" x2="96" y2="122" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="96" y1="74" x2="148" y2="74" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <line x1="148" y1="74" x2="148" y2="44" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <line x1="96" y1="122" x2="132" y2="160" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="96" y1="122" x2="84" y2="160" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6" />
  <line x1="108" y1="138" x2="128" y2="138" stroke="#e6b450" stroke-width="2" />
  <polygon points="131,138 121,133 121,143" fill="#e6b450" />
  <text x="16" y="36" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">elbow at shoulder height · step through</text>
`);

// Biceps stretch — side to wall, palm flat, turn body AWAY from the wall
const SVG_BICEPS_WALL = sNoMat(`
  <line x1="40" y1="14" x2="40" y2="168" stroke="#4a544c" stroke-width="6" stroke-linecap="round" />
  <circle cx="96" cy="48" r="13" fill="#8fbc8f" />
  <line x1="96" y1="61" x2="96" y2="122" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="96" y1="74" x2="46" y2="74" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <line x1="46" y1="66" x2="46" y2="82" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <line x1="96" y1="122" x2="110" y2="160" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="96" y1="122" x2="92" y2="160" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" stroke-opacity="0.6" />
  <path d="M120 100 a 26 26 0 0 1 18 22" fill="none" stroke="#e6b450" stroke-width="2" stroke-dasharray="3 3" />
  <polygon points="138,124 134,112 144,116" fill="#e6b450" />
  <text x="22" y="150" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">palm on wall · turn body AWAY</text>
  <text x="22" y="168" fill="#d97757" font-size="10.5" font-family="sans-serif" font-weight="600">not a wrist stretch — wrist stays comfy</text>
`);

// ---------- Week-6 additions (2026-06-06) ----------
// Bilateral bodyweight hip-hinge (RDL pattern), 1 kg prone row, 1 kg biceps
// curl. Same grammar: green = body, gold = the active cue, orange = mistake,
// grey = wall/floor/mat.

// Hip-hinge START — standing tall, soft knees, neutral spine
const SVG_HIP_HINGE_START = s(`
  <circle cx="120" cy="40" r="13" fill="#8fbc8f" />
  <line x1="120" y1="53" x2="120" y2="108" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- arms resting on thighs -->
  <line x1="120" y1="66" x2="108" y2="104" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
  <!-- legs, slight knee bend -->
  <line x1="120" y1="108" x2="116" y2="150" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <text x="40" y="34" fill="#a8a59c" font-size="12" font-family="sans-serif" font-weight="600">stand tall · soft knees</text>
`);

// Hip-hinge HINGED — hips travel back, flat spine, hands slide down thighs
const SVG_HIP_HINGE_HINGED = s(`
  <!-- head out front, hips back -->
  <circle cx="78" cy="70" r="13" fill="#8fbc8f" />
  <!-- flat back angled forward -->
  <line x1="88" y1="76" x2="150" y2="108" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <!-- hands sliding down the thigh -->
  <line x1="120" y1="92" x2="138" y2="132" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
  <!-- thigh + shin, hips pushed back -->
  <line x1="150" y1="108" x2="138" y2="150" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- arrow showing hips travelling back -->
  <line x1="178" y1="108" x2="158" y2="108" stroke="#e6b450" stroke-width="2" />
  <polygon points="155,108 165,103 165,113" fill="#e6b450" />
  <text x="36" y="36" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">hips back · flat spine · slide hands down</text>
`);

// Hip-hinge WRONG — rounded low back (the danger)
const SVG_HIP_HINGE_WRONG = s(`
  <circle cx="78" cy="78" r="13" fill="#a8a59c" />
  <!-- rounded/curved back -->
  <path d="M88 84 Q120 70 150 112" fill="none" stroke="#d97757" stroke-width="6" stroke-linecap="round" />
  <line x1="150" y1="112" x2="140" y2="150" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
  <line x1="120" y1="96" x2="138" y2="132" stroke="#a8a59c" stroke-width="4" stroke-linecap="round" />
  <text x="40" y="36" fill="#d97757" font-size="12" font-family="sans-serif" font-weight="600">don't round the low back</text>
`);

// 1 kg prone row — face-down, elbow drives up, weight hangs, neutral wrist
const SVG_PRONE_ROW_DOWN = s(`
  <!-- bench/mat figure lying face down, side view -->
  <circle cx="56" cy="120" r="10" fill="#8fbc8f" />
  <line x1="64" y1="124" x2="160" y2="128" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- legs -->
  <line x1="160" y1="128" x2="200" y2="132" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- arm hanging straight down, weight at bottom -->
  <line x1="82" y1="126" x2="82" y2="150" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
  <rect x="75" y="148" width="14" height="9" rx="2" fill="#e6b450" stroke="#1a1f1c" stroke-width="1.5" />
  <text x="40" y="44" fill="#a8a59c" font-size="12" font-family="sans-serif" font-weight="600">start: arm hangs · 1 kg</text>
`);

const SVG_PRONE_ROW_UP = s(`
  <circle cx="56" cy="120" r="10" fill="#8fbc8f" />
  <line x1="64" y1="124" x2="160" y2="128" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="160" y1="128" x2="200" y2="132" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- elbow drives UP toward ceiling, forearm vertical, weight raised -->
  <line x1="82" y1="126" x2="82" y2="100" stroke="#e6b450" stroke-width="4" stroke-linecap="round" />
  <line x1="82" y1="100" x2="84" y2="126" stroke="#e6b450" stroke-width="4" stroke-linecap="round" />
  <rect x="77" y="120" width="14" height="9" rx="2" fill="#e6b450" stroke="#1a1f1c" stroke-width="1.5" />
  <line x1="100" y1="104" x2="100" y2="86" stroke="#e6b450" stroke-width="2" />
  <polygon points="100,82 95,92 105,92" fill="#e6b450" />
  <text x="36" y="44" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">elbow drives UP · squeeze the blade</text>
  <text x="36" y="172" fill="#d97757" font-size="11" font-family="sans-serif" font-weight="600">wrist stays straight — no palm load</text>
`);

// 1 kg biceps curl — neutral wrist, elbow tucked, curl the forearm up
const SVG_BICEPS_CURL_DOWN = sNoMat(`
  <circle cx="100" cy="40" r="13" fill="#8fbc8f" />
  <line x1="100" y1="53" x2="100" y2="120" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- upper arm tucked at side, forearm hanging down -->
  <line x1="100" y1="70" x2="100" y2="100" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
  <line x1="100" y1="100" x2="100" y2="135" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
  <rect x="93" y="134" width="15" height="10" rx="2" fill="#e6b450" stroke="#1a1f1c" stroke-width="1.5" />
  <text x="30" y="36" fill="#a8a59c" font-size="12" font-family="sans-serif" font-weight="600">elbow tucked · start low · 1 kg</text>
`);

const SVG_BICEPS_CURL_UP = sNoMat(`
  <circle cx="100" cy="40" r="13" fill="#8fbc8f" />
  <line x1="100" y1="53" x2="100" y2="120" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <!-- upper arm stays vertical, forearm curls up -->
  <line x1="100" y1="70" x2="100" y2="100" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
  <line x1="100" y1="100" x2="118" y2="74" stroke="#e6b450" stroke-width="4" stroke-linecap="round" />
  <rect x="113" y="66" width="15" height="10" rx="2" fill="#e6b450" stroke="#1a1f1c" stroke-width="1.5" />
  <path d="M104 118 a 30 30 0 0 1 18 -40" fill="none" stroke="#e6b450" stroke-width="2" stroke-dasharray="3 3" />
  <polygon points="122,80 112,76 116,88" fill="#e6b450" />
  <text x="30" y="160" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">curl up · keep the wrist straight</text>
  <text x="30" y="176" fill="#d97757" font-size="11" font-family="sans-serif" font-weight="600">don't swing the body for momentum</text>
`);

// ---------- IWYT + wrist on-ramp (2026-07-08) ----------
// IWYT raises + Wall lean were the only two current-week moves with no how-to
// frames, so the app fell back to their raw notes paragraph = the "big blob"
// Allison flagged Jul 7. These bring them into the same do/avoid card grammar.

// IWYT raises — TOP-DOWN prone figure, arms in the T shape, thumbs up, small lift.
const SVG_IWYT = sNoMat(`
  <circle cx="120" cy="42" r="12" fill="#8fbc8f" />
  <line x1="120" y1="54" x2="120" y2="128" stroke="#8fbc8f" stroke-width="9" stroke-linecap="round" />
  <line x1="120" y1="74" x2="58" y2="74" stroke="#e6b450" stroke-width="7" stroke-linecap="round" />
  <line x1="120" y1="74" x2="182" y2="74" stroke="#e6b450" stroke-width="7" stroke-linecap="round" />
  <circle cx="58" cy="74" r="4.5" fill="#e6b450" />
  <circle cx="182" cy="74" r="4.5" fill="#e6b450" />
  <line x1="90" y1="92" x2="90" y2="80" stroke="#e6b450" stroke-width="2" />
  <polygon points="90,76 86,84 94,84" fill="#e6b450" />
  <text x="34" y="160" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">thumbs UP · lift from the upper back</text>
`);

// Wall lean — SIDE view, standing lean toward a wall on the right, palms flat.
const SVG_WALL_LEAN = sNoMat(`
  <line x1="204" y1="16" x2="204" y2="164" stroke="#4a544c" stroke-width="6" stroke-linecap="round" />
  <circle cx="70" cy="52" r="12" fill="#8fbc8f" />
  <line x1="74" y1="63" x2="104" y2="146" stroke="#8fbc8f" stroke-width="8" stroke-linecap="round" />
  <line x1="80" y1="78" x2="198" y2="70" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
  <line x1="196" y1="62" x2="196" y2="78" stroke="#e6b450" stroke-width="5" stroke-linecap="round" />
  <line x1="104" y1="146" x2="88" y2="160" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <line x1="104" y1="146" x2="120" y2="160" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
  <text x="20" y="176" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">palms flat · light weight only</text>
`);

// ---------- THE DATA ----------

export const EXERCISE_HOWTO: Record<string, ExerciseHowTo> = {
  // ===== WARMUPS =====

  'Outdoor walk': {
    exercise: 'Outdoor walk',
    sourceNotes:
      'Walks need no anatomical guide. SVG icons only. Three-frame motivational rather than corrective.',
    frames: [
      {
        svg: sNoMat(`
          <circle cx="60" cy="55" r="13" fill="#8fbc8f" />
          <line x1="60" y1="68" x2="60" y2="115" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
          <line x1="60" y1="115" x2="40" y2="155" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
          <line x1="60" y1="115" x2="85" y2="155" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
          <line x1="60" y1="80" x2="40" y2="105" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
          <line x1="60" y1="80" x2="85" y2="100" stroke="#8fbc8f" stroke-width="4" stroke-linecap="round" />
          <!-- sun -->
          <circle cx="190" cy="40" r="14" fill="#e6b450" />
          <text x="100" y="60" fill="#a8a59c" font-size="13" font-family="sans-serif" font-weight="600">outside · sunlight matters</text>
        `),
        do: 'Conversational pace — talk full sentences without panting.',
        avoid: "Don't power-walk if breathing gets ragged.",
      },
      {
        image: `${EX_DIR}/outdoor-walk-0.jpg`,
        do: 'Phone in pocket — eyes up, scan surroundings.',
        avoid: "Don't doom-scroll while walking; defeats the reset.",
      },
      {
        image: `${EX_DIR}/outdoor-walk-1.jpg`,
        do: 'Tap done when minutes complete — counts as cardio.',
        avoid: "Don't skip on low-energy days; even 10 min counts.",
      },
    ],
  },

  'Belly breathing': {
    exercise: 'Belly breathing',
    sourceNotes: 'Hand-coded SVG — no usable stock asset for diaphragmatic breathing diagram.',
    frames: [
      {
        svg: SVG_BELLY_BREATH_INHALE,
        do: 'Inhale 4 sec through nose — belly rises, chest stays still.',
        avoid: "Don't load palms on the floor — arms relaxed at sides.",
      },
      {
        svg: SVG_BELLY_BREATH_EXHALE,
        do: 'Exhale 6 sec through mouth — belly settles flat.',
        avoid: "Don't rush the exhale; longer than the inhale.",
      },
      {
        svg: SVG_BELLY_BREATH_WRONG,
        do: 'Belly should rise, not chest — diaphragm leads.',
        avoid: 'Chest rising = breathing too shallow. Slow down.',
      },
    ],
  },

  'Pelvic tilts': {
    exercise: 'Pelvic tilts',
    sourceNotes: 'Two free-exercise-db frames (start + tilted).',
    frames: [
      {
        image: `${EX_DIR}/pelvic-tilts-0.jpg`,
        do: 'Lie on back, knees bent, feet flat hip-width apart.',
        avoid: "Don't load palms — arms relaxed at sides, palms up.",
      },
      {
        image: `${EX_DIR}/pelvic-tilts-1.jpg`,
        do: 'Tuck tailbone — flatten lower back into the mat.',
        avoid: "Don't over-arch on release; just return to neutral.",
      },
      {
        svg: sNoMat(`
          <line x1="40" y1="120" x2="200" y2="120" stroke="#4a544c" stroke-width="3" />
          <circle cx="46" cy="110" r="10" fill="#a8a59c" />
          <!-- back arched off mat -->
          <path d="M55 115 Q105 70 145 115" fill="none" stroke="#d97757" stroke-width="6" stroke-linecap="round" />
          <line x1="145" y1="115" x2="170" y2="80" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
          <line x1="170" y1="80" x2="195" y2="118" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
          <text x="60" y="55" fill="#d97757" font-size="12" font-family="sans-serif" font-weight="600">don't backbend on release</text>
        `),
        do: 'Movement is small — 1-2 inches at the hip.',
        avoid: "Don't push into a backbend; flat back, then neutral.",
      },
    ],
  },

  'Glute squeezes': {
    exercise: 'Glute squeezes',
    sourceNotes: 'Hand-coded SVG — isometric, no visible movement to photograph well.',
    frames: [
      {
        svg: SVG_GLUTE_SQUEEZE,
        do: 'Tighten butt 50% effort, hold 3 sec like holding a coin.',
        avoid: "Don't max-squeeze — awareness, not maximum effort.",
      },
      {
        svg: SVG_GLUTE_SQUEEZE_RELEASE,
        do: 'Full release for 2 sec between reps. Breathe normally.',
        avoid: "Don't squeeze abs or pelvic floor — isolate glutes.",
      },
    ],
  },

  // ===== WORKOUT A & B MAIN BLOCK =====

  'Bodyweight squats': {
    exercise: 'Bodyweight squats',
    sourceNotes: 'Two free-exercise-db frames (standing + bottom of squat).',
    frames: [
      {
        image: `${EX_DIR}/bodyweight-squats-0.jpg`,
        do: 'Feet hip-width, toes slightly out, arms crossed over chest.',
        avoid: "Don't grip a wall — shoulder touch only if balance wobbly.",
      },
      {
        image: `${EX_DIR}/bodyweight-squats-1.jpg`,
        do: '3 sec down — knees track over middle toes, weight in heels.',
        avoid: "Don't push past today's pain ceiling (left knee).",
      },
      {
        svg: sNoMat(`
          <line x1="30" y1="155" x2="210" y2="155" stroke="#4a544c" stroke-width="3" />
          <circle cx="120" cy="50" r="13" fill="#a8a59c" />
          <line x1="120" y1="63" x2="120" y2="100" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
          <!-- knees caving toward each other -->
          <line x1="120" y1="100" x2="105" y2="125" stroke="#d97757" stroke-width="6" stroke-linecap="round" />
          <line x1="120" y1="100" x2="135" y2="125" stroke="#d97757" stroke-width="6" stroke-linecap="round" />
          <line x1="105" y1="125" x2="85" y2="155" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
          <line x1="135" y1="125" x2="155" y2="155" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
          <!-- arrows showing knees caving in -->
          <line x1="100" y1="120" x2="115" y2="120" stroke="#d97757" stroke-width="2" />
          <polygon points="118,120 110,116 110,124" fill="#d97757" />
          <line x1="140" y1="120" x2="125" y2="120" stroke="#d97757" stroke-width="2" />
          <polygon points="122,120 130,116 130,124" fill="#d97757" />
          <text x="55" y="30" fill="#d97757" font-size="12" font-family="sans-serif" font-weight="600">don't let knees cave in</text>
        `),
        do: 'Push knees out toward pinky toes through the whole rep.',
        avoid: "Don't let knees collapse inward (valgus).",
      },
      {
        svg: SVG_WALL_SIT_DEEPER, // reuse — shows shallow option
        do: 'Stay tall, chest up. Stand up over 3 sec.',
        avoid: "Don't bounce out of the bottom — controlled ascent.",
      },
    ],
  },

  'Glute bridges': {
    exercise: 'Glute bridges',
    sourceNotes: 'Two free-exercise-db frames (down + bridged).',
    frames: [
      {
        image: `${EX_DIR}/glute-bridges-0.jpg`,
        do: 'On back, knees bent, feet flat hip-width — palms up at sides.',
        avoid: "Don't load palms — relaxed at sides, palms up.",
      },
      {
        image: `${EX_DIR}/glute-bridges-1.jpg`,
        do: 'Squeeze glutes FIRST, then lift — straight line knees-to-shoulders.',
        avoid: "Don't over-arch the lower back at the top.",
      },
      {
        svg: sNoMat(`
          <line x1="20" y1="155" x2="220" y2="155" stroke="#4a544c" stroke-width="3" />
          <circle cx="40" cy="142" r="10" fill="#a8a59c" />
          <!-- exaggerated arch into a backbend -->
          <path d="M48 145 Q90 75 140 145" fill="none" stroke="#d97757" stroke-width="7" stroke-linecap="round" />
          <line x1="140" y1="148" x2="165" y2="115" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
          <line x1="165" y1="115" x2="190" y2="155" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
          <text x="50" y="50" fill="#d97757" font-size="12" font-family="sans-serif" font-weight="600">don't go super high</text>
        `),
        do: 'Drive through HEELS, not toes. Hold 2 sec at top.',
        avoid: "Don't push hips into a backbend — knees-to-shoulders straight.",
      },
    ],
  },

  'Wall sit': {
    exercise: 'Wall sit',
    sourceNotes: "Hand-coded SVG — couldn't source a clean wall-sit free image.",
    frames: [
      {
        svg: SVG_WALL_SIT,
        do: 'Back flat on wall · knees at 90° · weekly benchmark hold.',
        avoid: "Don't push on the wall with your hands — let arms hang.",
      },
      {
        svg: SVG_WALL_SIT_WRONG,
        do: 'Knees stay over ankles — slide deeper only as comfortable.',
        avoid: "Don't let knees travel past your toes.",
      },
      {
        svg: SVG_WALL_SIT_DEEPER,
        do: 'Shallower = easier today · always honor a sore-knee day.',
        avoid: "Don't hold your breath — stay relaxed in upper body.",
      },
    ],
  },

  'Side-lying clamshells': {
    exercise: 'Side-lying clamshells',
    sourceNotes: 'Hand-coded SVG — free-exercise-db has no clean side-lying clamshell pair.',
    frames: [
      {
        svg: SVG_CLAMSHELL_CLOSED,
        do: 'On side · hips stacked · head on mat (not propped on forearm).',
        avoid: "Don't prop up on your forearm — wrists still off the floor.",
      },
      {
        svg: SVG_CLAMSHELL_OPEN,
        do: 'Open top knee, feet stay together, lift to comfortable range.',
        avoid: "Don't force range; smaller + clean beats big + sloppy.",
      },
      {
        svg: SVG_CLAMSHELL_WRONG,
        do: 'Keep hips perfectly stacked through the whole rep.',
        avoid: "Don't roll the top hip backward to lift higher.",
      },
    ],
  },

  'Modified dead bug': {
    exercise: 'Modified dead bug',
    sourceNotes: 'Two free-exercise-db frames + corrective SVG.',
    frames: [
      {
        image: `${EX_DIR}/modified-dead-bug-0.jpg`,
        do: 'Hips + knees at 90° — shins parallel to ceiling (tabletop).',
        avoid: "Don't put hands behind your head — arms FLAT, palms UP.",
      },
      {
        image: `${EX_DIR}/modified-dead-bug-1.jpg`,
        do: 'Slowly extend ONE leg, hovering above floor. Exhale on extend.',
        avoid: "Don't lift palms or load wrists — arms stay relaxed.",
      },
      {
        svg: sNoMat(`
          <line x1="20" y1="155" x2="220" y2="155" stroke="#4a544c" stroke-width="3" />
          <circle cx="40" cy="142" r="10" fill="#a8a59c" />
          <!-- back arched off mat -->
          <path d="M48 145 Q85 110 130 145" fill="none" stroke="#d97757" stroke-width="6" stroke-linecap="round" />
          <!-- leg extended too far -->
          <line x1="130" y1="148" x2="210" y2="153" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" />
          <!-- arrow showing back lift -->
          <line x1="80" y1="100" x2="95" y2="115" stroke="#d97757" stroke-width="2" />
          <polygon points="93,118 100,108 103,118" fill="#d97757" />
          <text x="55" y="50" fill="#d97757" font-size="12" font-family="sans-serif" font-weight="600">low back arching = too far</text>
        `),
        do: 'Lower back glued to mat — shorten range if it arches.',
        avoid: "Don't rush; slow = harder = better here.",
      },
    ],
  },

  'Heel taps': {
    exercise: 'Heel taps',
    sourceNotes:
      'Hand-coded SVG — currently archived (replaced by forearm plank in week 3) but kept for fallback weeks.',
    frames: [
      {
        svg: SVG_HEEL_TAPS_UP,
        do: 'On back, both knees bent up, arms relaxed at sides (palms up).',
        avoid: "Don't load palms — arms stay flat, palms facing up.",
      },
      {
        svg: SVG_HEEL_TAPS_DOWN,
        do: "Slowly extend one leg — tap heel toward floor (don't slam).",
        avoid: "Don't let lower back arch — shorten range if it lifts.",
      },
    ],
  },

  'Forearm plank': {
    exercise: 'Forearm plank',
    sourceNotes:
      'Hand-coded SVG. Lisa Cohen May 15 cleared FOREARMS only — hands still off the floor.',
    frames: [
      {
        svg: SVG_FOREARM_PLANK,
        do: 'Forearms on mat, elbows under shoulders, toes tucked.',
        avoid: "DON'T drop to palms — forearms only, wrists off.",
      },
      {
        svg: SVG_FOREARM_PLANK_BACK_FLAT,
        do: 'Straight line head to heels — 15 sec hold (day 1).',
        avoid: "Don't bump to 30 sec yet — start small, week 4 if quiet.",
      },
      {
        svg: SVG_FOREARM_PLANK_WRONG,
        do: 'Squeeze glutes + core — hips stay LEVEL with shoulders.',
        avoid: "Don't let hips sag or pike — flat line, breathe through.",
      },
    ],
  },

  // ===== COOLDOWN =====

  'Knees-to-chest hold': {
    exercise: 'Knees-to-chest hold',
    sourceNotes: 'Two free-exercise-db frames (lying + knees pulled in).',
    frames: [
      {
        image: `${EX_DIR}/knees-to-chest-hold-0.jpg`,
        do: 'On back · bring BOTH thighs gently toward chest.',
        avoid: "Don't grip with hands — wrists still off.",
      },
      {
        image: `${EX_DIR}/knees-to-chest-hold-1.jpg`,
        do: 'Hook FOREARMS behind thighs — legs rest passively.',
        avoid: "Don't pull legs actively; let them rest on your forearms.",
      },
      {
        svg: sNoMat(`
          <line x1="20" y1="155" x2="220" y2="155" stroke="#4a544c" stroke-width="3" />
          <circle cx="40" cy="142" r="10" fill="#a8a59c" />
          <!-- tailbone lifted off mat -->
          <path d="M48 145 L90 140 L120 95 L150 95 L165 140 L175 155" fill="none" stroke="#a8a59c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
          <!-- arrow pointing to lifted tailbone -->
          <line x1="170" y1="170" x2="170" y2="148" stroke="#d97757" stroke-width="2" />
          <polygon points="170,143 165,153 175,153" fill="#d97757" />
          <text x="60" y="40" fill="#d97757" font-size="12" font-family="sans-serif" font-weight="600">if tailbone lifts → too tight</text>
        `),
        do: 'If tailbone lifts, let legs come further from chest.',
        avoid: "Don't crunch into the stretch; passive release only.",
      },
    ],
  },

  'Figure-4 stretch': {
    exercise: 'Figure-4 stretch',
    sourceNotes: 'Two free-exercise-db frames (setup + stretched).',
    frames: [
      {
        image: `${EX_DIR}/figure-4-stretch-0.jpg`,
        do: 'On back, cross RIGHT ankle over LEFT knee (figure-4 shape).',
        avoid: "Don't force the bent knee outward — let it open passively.",
      },
      {
        image: `${EX_DIR}/figure-4-stretch-1.jpg`,
        do: 'Use FOREARMS (not hands) to draw left leg gently toward you.',
        avoid: "Don't grip with hands; forearm-hook only — wrists off.",
      },
      {
        svg: sNoMat(`
          <text x="30" y="60" fill="#8fbc8f" font-size="14" font-family="sans-serif" font-weight="700">45 sec · each side</text>
          <text x="30" y="90" fill="#a8a59c" font-size="13" font-family="sans-serif">breathe slow</text>
          <text x="30" y="120" fill="#a8a59c" font-size="13" font-family="sans-serif">switch ankle, repeat</text>
          <circle cx="195" cy="100" r="22" fill="none" stroke="#e6b450" stroke-width="3" />
          <text x="185" y="106" fill="#e6b450" font-size="16" font-family="sans-serif" font-weight="700">45s</text>
        `),
        do: '45 sec hold · breathe slow · switch sides.',
        avoid: "Don't push for depth — opening, not deepening.",
      },
    ],
  },

  'Seated forward fold': {
    exercise: 'Seated forward fold',
    sourceNotes: 'Two free-exercise-db frames (sit + fold).',
    frames: [
      {
        image: `${EX_DIR}/seated-forward-fold-0.jpg`,
        do: 'Sit with legs extended · slight knee bend totally fine.',
        avoid: "Don't lock the knees; soft bend is fine.",
      },
      {
        image: `${EX_DIR}/seated-forward-fold-1.jpg`,
        do: 'Hinge at HIPS, arms rest in lap — NOT reaching forward.',
        avoid: "Don't round upper back to fake more depth.",
      },
      {
        svg: sNoMat(`
          <text x="30" y="60" fill="#8fbc8f" font-size="14" font-family="sans-serif" font-weight="700">stop at 2/10 stretch</text>
          <text x="30" y="90" fill="#a8a59c" font-size="13" font-family="sans-serif">tall + shallow beats</text>
          <text x="30" y="110" fill="#a8a59c" font-size="13" font-family="sans-serif">collapsed + deep</text>
          <circle cx="195" cy="100" r="22" fill="none" stroke="#e6b450" stroke-width="3" />
          <text x="187" y="106" fill="#e6b450" font-size="16" font-family="sans-serif" font-weight="700">60s</text>
        `),
        do: "Stop at 2/10 stretch — this isn't a depth competition.",
        avoid: "Don't reach with your hands — arms in lap.",
      },
    ],
  },

  'Slow breathing': {
    exercise: 'Slow breathing',
    sourceNotes: 'Hand-coded SVG — seated breathing pose.',
    frames: [
      {
        svg: SVG_SLOW_BREATH_IN,
        do: 'Inhale 4 counts through the nose · eyes can close.',
        avoid: "Don't rush — the cool-down IS where adaptation happens.",
      },
      {
        svg: SVG_SLOW_BREATH_OUT,
        do: 'Exhale 6 counts through mouth — longer than inhale.',
        avoid: "Don't skip; this is the workout-is-over signal to your body.",
      },
    ],
  },

  // ===== WORKOUT B SPECIFICS =====

  'Side-lying leg raises': {
    exercise: 'Side-lying leg raises',
    sourceNotes: 'Two free-exercise-db frames.',
    frames: [
      {
        image: `${EX_DIR}/side-lying-leg-raises-0.jpg`,
        do: 'On side · hips stacked · bottom leg bent for stability.',
        avoid: "Don't prop on forearm — head rests on mat or thin pillow.",
      },
      {
        image: `${EX_DIR}/side-lying-leg-raises-1.jpg`,
        do: 'Lift top leg 30-45° · toes point FORWARD (not ceiling).',
        avoid: "Don't roll hip backward — that hijacks the glute work.",
      },
      {
        svg: sNoMat(`
          <text x="30" y="50" fill="#8fbc8f" font-size="14" font-family="sans-serif" font-weight="700">3 sec down · slow</text>
          <text x="30" y="80" fill="#a8a59c" font-size="13" font-family="sans-serif">height isn't the point</text>
          <text x="30" y="100" fill="#a8a59c" font-size="13" font-family="sans-serif">glute medius is</text>
          <text x="30" y="130" fill="#a8a59c" font-size="13" font-family="sans-serif">12 reps each side</text>
        `),
        do: 'Lower over 3 sec — slow descent does the work.',
        avoid: "Don't bounce — gravity's not your friend here.",
      },
    ],
  },

  'Single-leg glute bridges': {
    exercise: 'Single-leg glute bridges',
    sourceNotes: 'Two free-exercise-db frames.',
    frames: [
      {
        image: `${EX_DIR}/single-leg-glute-bridges-0.jpg`,
        do: 'Setup like regular bridge · lift ONE foot off mat.',
        avoid: "Don't load wrists — arms relaxed at sides, palms up.",
      },
      {
        image: `${EX_DIR}/single-leg-glute-bridges-1.jpg`,
        do: 'Squeeze standing-leg glute first · drive through heel.',
        avoid: "Don't let hips drop toward the lifted-leg side.",
      },
      {
        svg: sNoMat(`
          <text x="30" y="50" fill="#8fbc8f" font-size="14" font-family="sans-serif" font-weight="700">balance a glass of</text>
          <text x="30" y="70" fill="#8fbc8f" font-size="14" font-family="sans-serif" font-weight="700">water on your pelvis</text>
          <text x="30" y="105" fill="#a8a59c" font-size="13" font-family="sans-serif">hips stay LEVEL</text>
          <text x="30" y="130" fill="#a8a59c" font-size="13" font-family="sans-serif">8 reps each side</text>
        `),
        do: 'Pelvis stays level · 2-sec hold at the top.',
        avoid: "Don't push past today's back pain ceiling.",
      },
    ],
  },

  'Slow supine bicycle': {
    exercise: 'Slow supine bicycle',
    sourceNotes: 'Hand-coded SVG — no free-exercise-db match for the supine variant.',
    frames: [
      {
        svg: SVG_BICYCLE,
        do: 'On back · arms RELAXED at sides (never behind head).',
        avoid: "DON'T put hands behind your head — protects neck + wrists.",
      },
      {
        svg: sNoMat(`
          <line x1="20" y1="155" x2="220" y2="155" stroke="#4a544c" stroke-width="3" />
          <circle cx="38" cy="142" r="10" fill="#8fbc8f" />
          <line x1="46" y1="145" x2="125" y2="145" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
          <line x1="125" y1="145" x2="175" y2="140" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
          <line x1="175" y1="140" x2="210" y2="148" stroke="#8fbc8f" stroke-width="6" stroke-linecap="round" />
          <line x1="125" y1="145" x2="170" y2="90" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
          <line x1="170" y1="90" x2="200" y2="115" stroke="#e6b450" stroke-width="6" stroke-linecap="round" />
          <text x="55" y="40" fill="#e6b450" font-size="11" font-family="sans-serif" font-weight="600">slow pedal · alternate</text>
        `),
        do: 'Slow alternation — like pedaling underwater.',
        avoid: "Don't speed up — this is a control exercise, not cardio.",
      },
    ],
  },

  'Standing calf raises': {
    exercise: 'Standing calf raises',
    sourceNotes: 'Hand-coded SVG — free-exercise-db match was inconsistent quality.',
    frames: [
      {
        svg: SVG_CALF_DOWN,
        do: 'Stand tall · fingertip touch wall for balance only.',
        avoid: "Don't GRIP the wall — fingertips only, no weight on hand.",
      },
      {
        svg: SVG_CALF_UP,
        do: 'Lift heels 3 sec up · hold 1 sec · lower 3 sec.',
        avoid: "Don't bounce for momentum — slow tempo IS the exercise.",
      },
    ],
  },

  // ===== WRIST PT (Lisa Cohen protocol) =====
  // Cues are literal repeats of Lisa's protocol — no editorializing.

  'Left wrist stretch': {
    exercise: 'Left wrist stretch',
    sourceNotes: 'Hand-coded SVG — Lisa Cohen May 5 protocol, generic wrist stretch.',
    frames: [
      {
        svg: SVG_WRIST_STRETCH_PALM_BACK,
        do: 'LEFT arm out · with RIGHT hand pull LEFT fingers back.',
        avoid: 'No pain. Mild stretch only — 30 sec.',
      },
      {
        svg: SVG_WRIST_STRETCH_PALM_DOWN,
        do: 'Flip · push LEFT hand DOWN to stretch back of forearm.',
        avoid: 'No pain. 30 sec total. Once a day.',
      },
    ],
  },

  'Right wrist stretch': {
    exercise: 'Right wrist stretch',
    sourceNotes: 'Hand-coded SVG — Lisa Cohen May 5 protocol, generic wrist stretch.',
    frames: [
      {
        svg: SVG_WRIST_STRETCH_PALM_BACK,
        do: 'RIGHT arm out · with LEFT hand pull RIGHT fingers back.',
        avoid: 'No pain. Mild stretch only — 30 sec.',
      },
      {
        svg: SVG_WRIST_STRETCH_PALM_DOWN,
        do: 'Flip · push RIGHT hand DOWN to stretch back of forearm.',
        avoid: 'No pain. 30 sec total. Once a day.',
      },
    ],
  },

  'Left flexion/extension (tuna can)': {
    exercise: 'Left flexion/extension (tuna can)',
    sourceNotes: 'Hand-coded SVG — Lisa Cohen May 5 protocol, tuna-can wrist drill.',
    frames: [
      {
        svg: SVG_TUNA_PALM_DOWN_UP,
        do: 'Forearm on table · PALM DOWN · lift can up (extension).',
        avoid: 'Slow + controlled. No pain.',
      },
      {
        svg: SVG_TUNA_PALM_UP_CURL,
        do: 'Flip · PALM UP · curl can up (flexion). 10 reps each.',
        avoid: 'No pain. Light weight only.',
      },
    ],
  },

  'Right flexion/extension (tuna can)': {
    exercise: 'Right flexion/extension (tuna can)',
    sourceNotes: 'Hand-coded SVG — Lisa Cohen May 5 protocol, tuna-can wrist drill.',
    frames: [
      {
        svg: SVG_TUNA_PALM_DOWN_UP,
        do: 'Forearm on table · PALM DOWN · lift can up (extension).',
        avoid: 'Slow + controlled. No pain.',
      },
      {
        svg: SVG_TUNA_PALM_UP_CURL,
        do: 'Flip · PALM UP · curl can up (flexion). 10 reps each.',
        avoid: 'No pain. Light weight only.',
      },
    ],
  },

  'Left radial deviation (tuna can)': {
    exercise: 'Left radial deviation (tuna can)',
    sourceNotes: 'Hand-coded SVG — Lisa Cohen May 5 protocol.',
    frames: [
      {
        svg: SVG_TUNA_RADIAL,
        do: 'Forearm pinky-side down · THUMB UP · lift hand toward thumb.',
        avoid: 'Only wrist moves — forearm stays put. 10 reps. No pain.',
      },
    ],
  },

  'Right radial deviation (tuna can)': {
    exercise: 'Right radial deviation (tuna can)',
    sourceNotes: 'Hand-coded SVG — Lisa Cohen May 5 protocol.',
    frames: [
      {
        svg: SVG_TUNA_RADIAL,
        do: 'Forearm pinky-side down · THUMB UP · lift hand toward thumb.',
        avoid: 'Only wrist moves — forearm stays put. 10 reps. No pain.',
      },
    ],
  },

  // Upper-back prescription — Lisa Cohen May 31 2026. Text-only cue frames
  // (no SVG yet). Wrist stays neutral on all of these.
  'Wall angels': {
    exercise: 'Wall angels',
    sourceNotes: 'Lisa Cohen May 31 — scapular control, bodyweight, wrist-neutral.',
    frames: [
      {
        svg: SVG_WALL_ANGEL,
        do: 'Back flat on wall, ribs down, chin gently tucked.',
        avoid: "Don't arch your low back to reach higher.",
      },
      {
        do: 'Slide arms up the wall, elbows + wrists lightly touching.',
        avoid: 'If wrists lift off the wall — stop there, no forcing.',
      },
      {
        do: 'Lower slowly with control. 2 sets of 10.',
        avoid: "Don't shrug your shoulders up toward your ears.",
      },
    ],
  },

  'Scapular squeezes': {
    exercise: 'Scapular squeezes',
    sourceNotes: 'Lisa Cohen May 31 — scapular retraction, no equipment.',
    frames: [
      {
        svg: SVG_SCAP_SQUEEZE,
        do: 'Sit or stand tall, arms relaxed at your sides.',
        avoid: 'No grip — wrists stay completely neutral.',
      },
      {
        do: 'Squeeze shoulder blades together, hold 5 seconds.',
        avoid: "Don't shrug up toward your ears.",
      },
      {
        do: 'Release slowly. 2 sets of 10, 5-sec holds.',
        avoid: 'Feel it between the blades, not in the neck.',
      },
    ],
  },

  'IWYT raises': {
    exercise: 'IWYT raises',
    sourceNotes:
      'Lisa Cohen Jun 18 + Allison Jul 4 (added the I). Prone, thumbs up, lift from the upper back — gentle on the neck.',
    frames: [
      {
        svg: SVG_IWYT,
        do: 'Face down, forehead on a towel, thumbs UP throughout.',
        avoid: 'No palm weight — thumbs up protects the wrist.',
      },
      {
        do: 'Make the letter, lift arms off the floor, brief hold, lower.',
        avoid: 'Lift from the upper back — not by craning your neck.',
      },
      {
        do: "Rest hands ON the floor between reps — that's the rest position.",
        avoid: "Don't hover the arms between reps — set them down.",
      },
      {
        do: 'I: arms down your sides. W: elbows to ribs, squeeze the blades.',
        avoid: 'Neck stays long, eyes on the towel throughout.',
      },
      {
        do: 'Y: narrow overhead V. T: arms straight out at shoulder height.',
        avoid: 'Keep it gentle for the neck — stop if it complains.',
      },
    ],
  },

  'Wall lean (wrist on-ramp)': {
    exercise: 'Wall lean (wrist on-ramp)',
    sourceNotes:
      'Allison Jul 3 — wrist weight-bearing on-ramp, the gentlest rung. Separate from the PT-gated loaded arm work.',
    frames: [
      {
        svg: SVG_WALL_LEAN,
        do: 'Stand a small step from the wall, palms flat at shoulder height.',
        avoid: "Fingers point up, elbows soft — don't lock them.",
      },
      {
        do: 'Lean in gently so the palms take LIGHT weight. Breathe.',
        avoid: 'Nothing intense — a rehab on-ramp, not a push-up.',
      },
      {
        do: 'Hold 15-20 sec, shake the hands out, once more.',
        avoid: 'STOP at any wrist or thumb sensation.',
      },
    ],
  },

  'Doorway pec stretch': {
    exercise: 'Doorway pec stretch',
    sourceNotes: 'Lisa Cohen May 31 — ~90° abduction, sternal fibers.',
    frames: [
      {
        svg: SVG_DOORWAY_PEC,
        do: 'Forearms on the door frame, elbows ~90° (T-shape).',
        avoid: "Don't let elbows drop below shoulder height.",
      },
      {
        do: 'Step one foot through until the chest stretches.',
        avoid: "Don't poke your chin forward — head stays neutral.",
      },
      { do: 'Hold ~30–45 sec, breathe, spine tall.', avoid: "Don't arch your low back." },
    ],
  },

  'Biceps stretch — right': {
    exercise: 'Biceps stretch — right',
    sourceNotes: 'Lisa Cohen May 31 — wrist-neutral biceps stretch.',
    frames: [
      {
        svg: SVG_BICEPS_WALL,
        do: 'Side to wall, palm flat at shoulder height, fingers spread.',
        avoid: "Not a wrist stretch — don't force the wrist back.",
      },
      {
        do: 'Turn your body away from the wall until the biceps stretches.',
        avoid: 'Wrist complains? Bend the elbow slightly, or stop.',
      },
      { do: 'Hold ~30 sec, breathe.', avoid: "Don't rotate the palm down." },
    ],
  },

  'Biceps stretch — left': {
    exercise: 'Biceps stretch — left',
    sourceNotes: 'Lisa Cohen May 31 — wrist-neutral biceps stretch.',
    frames: [
      {
        svg: SVG_BICEPS_WALL,
        do: 'Side to wall, palm flat at shoulder height, fingers spread.',
        avoid: "Not a wrist stretch — don't force the wrist back.",
      },
      {
        do: 'Turn your body away from the wall until the biceps stretches.',
        avoid: 'Wrist complains? Bend the elbow slightly, or stop.',
      },
      { do: 'Hold ~30 sec, breathe.', avoid: "Don't rotate the palm down." },
    ],
  },

  // ===== STRETCH COOLDOWN (Week 5+) — added 2026-06-03 to fill the blank
  // stretch block. Keyed to the exact STRETCH_COOLDOWN names in app.ts. =====

  'Wrist extension — right': {
    exercise: 'Wrist extension — right',
    sourceNotes: 'Hand-coded SVG. Right palm down, left hand pulls fingers up.',
    frames: [
      {
        svg: SVG_WRIST_EXTENSION,
        do: 'Right arm forward, palm DOWN · left hand pulls fingers UP.',
        avoid: 'Gentle. Mild stretch on the underside of the forearm only.',
      },
      {
        svg: holdCard('Hold 45 sec', 'breathe · keep the elbow soft'),
        do: 'Easy, steady hold — no bouncing.',
        avoid: 'Any pain or pins-and-needles → ease off.',
      },
    ],
  },

  'Wrist extension — left': {
    exercise: 'Wrist extension — left',
    sourceNotes: 'Hand-coded SVG. Left palm down, right hand pulls fingers up.',
    frames: [
      {
        svg: SVG_WRIST_EXTENSION,
        do: 'Left arm forward, palm DOWN · right hand pulls fingers UP.',
        avoid: 'Gentle. Mild stretch on the underside of the forearm only.',
      },
      {
        svg: holdCard('Hold 45 sec', 'breathe · keep the elbow soft'),
        do: 'Easy, steady hold — no bouncing.',
        avoid: 'Any pain or pins-and-needles → ease off.',
      },
    ],
  },

  'Wrist flexion — right': {
    exercise: 'Wrist flexion — right',
    sourceNotes: 'Hand-coded SVG. Right palm down, left hand presses fingers down.',
    frames: [
      {
        svg: SVG_WRIST_FLEXION,
        do: 'Right arm forward, palm DOWN · left hand presses fingers DOWN.',
        avoid: 'Stretch on the TOP of the forearm. Stay gentle.',
      },
      {
        svg: holdCard('Hold 45 sec', 'breathe · keep the elbow soft'),
        do: 'Easy, steady hold — no bouncing.',
        avoid: 'Any pain or pins-and-needles → ease off.',
      },
    ],
  },

  'Wrist flexion — left': {
    exercise: 'Wrist flexion — left',
    sourceNotes: 'Hand-coded SVG. Left palm down, right hand presses fingers down.',
    frames: [
      {
        svg: SVG_WRIST_FLEXION,
        do: 'Left arm forward, palm DOWN · right hand presses fingers DOWN.',
        avoid: 'Stretch on the TOP of the forearm. Stay gentle.',
      },
      {
        svg: holdCard('Hold 45 sec', 'breathe · keep the elbow soft'),
        do: 'Easy, steady hold — no bouncing.',
        avoid: 'Any pain or pins-and-needles → ease off.',
      },
    ],
  },

  'Neck stretch': {
    exercise: 'Neck stretch',
    sourceNotes: 'Hand-coded SVG — lateral neck stretch, ear toward shoulder.',
    frames: [
      {
        svg: SVG_NECK_STRETCH,
        do: 'Tilt ear gently toward one shoulder · light hand for weight only.',
        avoid: "Don't yank — let the head's weight do the work.",
      },
      {
        svg: holdCard('Hold 45 sec', 'then switch sides · shoulders down'),
        do: 'Keep the opposite shoulder relaxed and down.',
        avoid: "Don't shrug the stretched side up toward the ear.",
      },
    ],
  },

  'Shoulder stretch': {
    exercise: 'Shoulder stretch',
    sourceNotes: 'Hand-coded SVG — cross-body shoulder stretch.',
    frames: [
      {
        svg: SVG_SHOULDER_STRETCH,
        do: 'Bring one arm across the body · cradle it above the elbow.',
        avoid: "Don't pull on the elbow joint itself.",
      },
      {
        svg: holdCard('Hold 45 sec', 'then switch arms · breathe'),
        do: 'Feel it in the back/outside of the shoulder.',
        avoid: "Don't rotate the torso to fake more range.",
      },
    ],
  },

  'Leg cross — right': {
    exercise: 'Leg cross — right',
    sourceNotes: 'Hand-coded SVG — supine figure-4 (glute / piriformis).',
    frames: [
      {
        svg: SVG_FIGURE4_SUPINE,
        do: 'On back · RIGHT ankle over the opposite bent knee (figure-4).',
        avoid: "Don't grip — forearm-hook the thigh, wrists stay off.",
      },
      {
        svg: holdCard('Hold 45 sec', 'draw the support leg gently in'),
        do: 'Let the crossed knee open passively toward the floor.',
        avoid: "Don't force the knee down with your hand.",
      },
    ],
  },

  'Leg cross — left': {
    exercise: 'Leg cross — left',
    sourceNotes: 'Hand-coded SVG — supine figure-4 (glute / piriformis).',
    frames: [
      {
        svg: SVG_FIGURE4_SUPINE,
        do: 'On back · LEFT ankle over the opposite bent knee (figure-4).',
        avoid: "Don't grip — forearm-hook the thigh, wrists stay off.",
      },
      {
        svg: holdCard('Hold 45 sec', 'draw the support leg gently in'),
        do: 'Let the crossed knee open passively toward the floor.',
        avoid: "Don't force the knee down with your hand.",
      },
    ],
  },

  'Leg up in air — right': {
    exercise: 'Leg up in air — right',
    sourceNotes: 'Hand-coded SVG — supine hamstring stretch.',
    frames: [
      {
        svg: SVG_LEG_UP,
        do: 'On back · RIGHT leg straight up · hands behind the THIGH.',
        avoid: "Don't lock the knee — a soft bend is fine.",
      },
      {
        svg: holdCard('Hold 45 sec', 'strap behind thigh if it helps'),
        do: 'Keep the down-leg relaxed along the floor.',
        avoid: "Don't pull on the back of the knee.",
      },
    ],
  },

  'Leg up in air — left': {
    exercise: 'Leg up in air — left',
    sourceNotes: 'Hand-coded SVG — supine hamstring stretch.',
    frames: [
      {
        svg: SVG_LEG_UP,
        do: 'On back · LEFT leg straight up · hands behind the THIGH.',
        avoid: "Don't lock the knee — a soft bend is fine.",
      },
      {
        svg: holdCard('Hold 45 sec', 'strap behind thigh if it helps'),
        do: 'Keep the down-leg relaxed along the floor.',
        avoid: "Don't pull on the back of the knee.",
      },
    ],
  },

  'Both knees to chest': {
    exercise: 'Both knees to chest',
    sourceNotes: 'Hand-coded SVG — supine double-knee hug, low-back release.',
    frames: [
      {
        svg: SVG_DOUBLE_KNEE,
        do: 'Pull BOTH knees gently toward the chest, hands around shins.',
        avoid: "Don't grip hard — let the low back round and soften.",
      },
      {
        svg: holdCard('Hold 45 sec', 'breathe into the low back'),
        do: 'Gentle rock side-to-side is fine if it feels good.',
        avoid: "Don't lift the head/neck off the mat to pull harder.",
      },
    ],
  },

  'Calf stretch on wall — right': {
    exercise: 'Calf stretch on wall — right',
    sourceNotes: 'Hand-coded SVG — standing wall calf stretch.',
    frames: [
      {
        svg: SVG_CALF_WALL,
        do: 'Hands on wall · RIGHT leg back, straight · heel pressed DOWN.',
        avoid: "Don't let the back heel lift — that loses the stretch.",
      },
      {
        svg: holdCard('Hold 45 sec', 'bend the front knee, lean in'),
        do: 'Keep the back leg straight and toes pointing forward.',
        avoid: "Don't bounce — steady lean only.",
      },
    ],
  },

  'Calf stretch on wall — left': {
    exercise: 'Calf stretch on wall — left',
    sourceNotes: 'Hand-coded SVG — standing wall calf stretch.',
    frames: [
      {
        svg: SVG_CALF_WALL,
        do: 'Hands on wall · LEFT leg back, straight · heel pressed DOWN.',
        avoid: "Don't let the back heel lift — that loses the stretch.",
      },
      {
        svg: holdCard('Hold 45 sec', 'bend the front knee, lean in'),
        do: 'Keep the back leg straight and toes pointing forward.',
        avoid: "Don't bounce — steady lean only.",
      },
    ],
  },

  'Hip flexor — right knee in, left leg dangles': {
    exercise: 'Hip flexor — right knee in, left leg dangles',
    sourceNotes: 'Hand-coded SVG — couch-edge hip flexor stretch.',
    frames: [
      {
        svg: SVG_HIP_FLEXOR,
        do: 'On a couch edge · hug RIGHT knee in · LEFT leg dangles off = stretch.',
        avoid: "Don't arch the low back — let the dangling thigh drop.",
      },
      {
        svg: holdCard('Hold 45 sec', 'the dangling leg is the stretch'),
        do: 'Relax the hanging leg toward the floor.',
        avoid: "Don't grip the wall/couch — stay relaxed.",
      },
    ],
  },

  'Hip flexor — left knee in, right leg dangles': {
    exercise: 'Hip flexor — left knee in, right leg dangles',
    sourceNotes: 'Hand-coded SVG — couch-edge hip flexor stretch.',
    frames: [
      {
        svg: SVG_HIP_FLEXOR,
        do: 'On a couch edge · hug LEFT knee in · RIGHT leg dangles off = stretch.',
        avoid: "Don't arch the low back — let the dangling thigh drop.",
      },
      {
        svg: holdCard('Hold 45 sec', 'the dangling leg is the stretch'),
        do: 'Relax the hanging leg toward the floor.',
        avoid: "Don't grip the wall/couch — stay relaxed.",
      },
    ],
  },

  // ===== WEEK-6 ADDITIONS (2026-06-06) =====

  'Bodyweight hip hinge': {
    exercise: 'Bodyweight hip hinge',
    sourceNotes:
      'Hand-coded SVG. Bilateral RDL pattern, bodyweight only — the missing standing hip-dominant move. Teaches neutral spine while the hips move (real-life floor-pickup skill).',
    frames: [
      {
        svg: SVG_HIP_HINGE_START,
        do: 'Stand tall, feet hip-width, soft knees, hands on thighs.',
        avoid: "Don't lock the knees — keep a soft, unlocked bend.",
      },
      {
        svg: SVG_HIP_HINGE_HINGED,
        do: 'Push hips BACK, hands slide down thighs, spine flat/neutral.',
        avoid: "Don't squat down — the movement is hips back, not knees forward.",
      },
      {
        svg: SVG_HIP_HINGE_WRONG,
        do: 'Feel it in hamstrings + glutes. Stand back up, squeeze glutes.',
        avoid: "Don't round the low back — flat spine the whole way.",
      },
    ],
  },

  'Prone row (bodyweight)': {
    exercise: 'Prone row (bodyweight)',
    sourceNotes:
      'Hand-coded SVG. Wrist-safe scapular pick — fires lower trap even unloaded. Bodyweight for now, building toward the 1 kg. Neutral wrist, no palm/hand weight-bearing.',
    frames: [
      {
        svg: SVG_PRONE_ROW_DOWN,
        do: 'Face down, arm hanging straight, NO weight yet, wrist neutral.',
        avoid: "Don't bear weight through the palm — let the arm just hang.",
      },
      {
        svg: SVG_PRONE_ROW_UP,
        do: 'Drive the elbow UP, squeeze the shoulder blade. 2 sets of 12.',
        avoid: "Don't bend the wrist — keep it straight, no palm load.",
      },
    ],
  },

  '1 kg biceps curl': {
    exercise: '1 kg biceps curl',
    sourceNotes:
      'Hand-coded SVG. Light neutral-wrist arm work (cleared). Real stimulus near failure at 5 weeks deconditioned.',
    frames: [
      {
        svg: SVG_BICEPS_CURL_DOWN,
        do: 'Elbow tucked at your side, forearm down, holding the 1 kg.',
        avoid: "Don't let the wrist bend back — keep it straight (neutral).",
      },
      {
        svg: SVG_BICEPS_CURL_UP,
        do: 'Curl the forearm up, elbow stays put. 2 sets of 12.',
        avoid: "Don't swing the body — control the weight up and down.",
      },
    ],
  },
};
