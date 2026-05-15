# Visual Exercise Instruction — Research Report

**Date:** 2026-05-15 (Fri)
**For:** workout-tracker (`c:\Users\allis\Documents\workout-tracker\`, live at https://allisonecalt-sudo.github.io/workout-tracker/)
**Problem:** Text "how-to" paragraphs + YouTube search link per exercise. Allison: _"explanations are hard for me to read… I always have to watch the video… I wish it was like easier for me to just look and visualize understand what I need to do."_
**Bar:** Phone on a shelf, sweaty, mid-set. Under 2 seconds to re-orient.
**Scope:** ~25 unique exercises in `EXERCISE_GUIDE` (warmups, main, cooldowns, wrist PT).

---

## 1. TL;DR — what to build today

**Self-host a small GIF loop per exercise, sourced from MuscleWiki's free API (or the AGPL ExerciseDB GIF set), shown above the existing how-to text — text collapses by default and reveals on tap. Keep the YouTube fallback link.**

Why this and not the others, in five lines:

1. GIF loops are the format every production app converged on (Hevy, Fitbod, Bodybuilding.com, gymvisual) because they autoplay, loop without controls, load fast, and don't need a video player — perfect for a phone on a shelf.
2. Self-hosting ~25 GIFs at ~200 KB each = ~5 MB total, well under the 1 GB GitHub Pages cap and the 100 GB/month bandwidth ceiling.
3. The free-exercise-db / MuscleWiki / ExerciseDB libraries already cover ~80% of your exercise list with permissively-licensed assets — the rest (wrist PT, belly breathing) need 4-5 fallback GIFs sourced or recorded.
4. Stick figures (Nike Training Club style), 3D anatomy renders (Fitbod), and Lottie animations all looked attractive but each adds a build dimension (motion-capture pipeline, 3D mesh management, JSON animation tooling) that's heavy for an app you're maintaining solo on vanilla TS + GH Pages.
5. AI-generated video (Sora 2 / Veo 3.1) is _almost_ good enough as of late-2025 (87 joint tracking, ~89% anatomical accuracy per Kling AI benchmark) but still fails on complex multi-step poses and adds per-asset cost — not the right call yet for a clinician's app where form matters.

---

## 2. Format comparison table

Glanceability is "can I look for ≤2 sec mid-set and re-orient?" — 5 = yes instantly, 1 = need to read/watch.

| Format                                          | Glance (1-5) | Build effort | Maintenance                                                 | Cost                                                           | Licensing risk                                                   | Fits her stack (TS + GH Pages + Supabase)       |
| ----------------------------------------------- | ------------ | ------------ | ----------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| **GIF loop (self-hosted)**                      | 5            | S            | Low — drop file, edit one TS field                          | Free if sourced from yuhonas/MuscleWiki/wger                   | Low (Unlicense / AGPL / CC-BY-SA — attribution column if needed) | **Y** — best fit                                |
| **Short looping MP4 (self-hosted)**             | 5            | S-M          | Low                                                         | Free from Pexels/Mixkit/Pixabay if licensing checked           | Low–Medium (per-clip variability)                                | Y — `<video autoplay loop muted playsinline>`   |
| **Static photo (1-frame)**                      | 3            | S            | Lowest                                                      | Free (same sources)                                            | Low                                                              | Y                                               |
| **Two-frame stills (start + end side-by-side)** | 4            | M            | Low — but each exercise needs a curated pair                | Free (free-exercise-db has exactly this — 2 jpgs per exercise) | Low (Unlicense)                                                  | **Y** — sleeper option                          |
| **Stick-figure animation (Nike-style)**         | 4–5          | L            | Medium — proprietary pipeline; not open                     | N/A (no public library matches Nike's quality)                 | N/A                                                              | N — would need to commission or build           |
| **Lottie animation**                            | 4            | M            | Medium — find/edit JSON, debug player perf on mobile Safari | LottieFiles free tier exists for fitness                       | Medium (per-asset, often free for personal but check)            | Partial — needs lottie-web; bundle adds ~250 KB |
| **3D anatomy + muscle highlight (Fitbod)**      | 3            | XL           | High — Three.js, mesh management, mobile perf               | Free models (Sketchfab/OpenAnatomy) but heavy                  | Per-model licensing                                              | N — overkill                                    |
| **YouTube embed (status quo)**                  | 1            | S            | Low                                                         | Free                                                           | None                                                             | Y but defeats the goal                          |
| **AI-generated video (Sora 2 / Veo 3.1)**       | 4            | M per asset  | Low (one-time gen)                                          | $0.10–$0.50/clip + token costs                                 | Low if you generate; medium if you can't verify form             | Partial — you'd still self-host the output      |

The headline: **GIF loops dominate the production market for a reason** — Hevy, Bodybuilding.com, gymvisual, ExerciseDB, MuscleWiki all converged here. They beat everything else on the glance-and-go metric.

---

## 3. Three concrete proposals

### LEAN — ship in one session (~2 hours)

**What:** Self-host one GIF per exercise in a new `media/exercises/` folder. Show GIF at the top of the active-exercise card. Collapse the existing text paragraph behind a "Read instructions" toggle (closed by default). Keep the YouTube link as a tertiary fallback.

**Specific assets:**

- Source: `yuhonas/free-exercise-db` (Unlicense — public domain, zero attribution required). 800+ exercises, JPGs at `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<exercise-name>/0.jpg` and `/1.jpg`. Two-frame pairs.
- Fallback: MuscleWiki API for things free-exercise-db misses (1,700+ exercises, 6,800+ video clips, free tier on RapidAPI).
- For the 4-5 things neither has (belly breathing, slow breathing, the specific Lisa Cohen wrist routine): record 3-sec phone videos yourself, export as GIF or MP4 at 480p, ~200 KB each.

**Wire-in (minimal diff):**

```ts
const EXERCISE_GUIDE: Record<string, { howTo: string; videoQuery: string; visual?: string }> = {
  'Wall sit': {
    visual: 'media/exercises/wall-sit.gif', // <— new field
    howTo: '…',
    videoQuery: 'wall sit exercise proper form',
  },
  // …
};
```

In the render function, show `<img src="${guide.visual}" alt="${ex.name}" class="exercise-visual" loading="lazy">` above the how-to card, and put the how-to text behind a `<details><summary>Read full instructions</summary>…</details>`.

**Cost:** $0. ~5 MB added to the repo (still under 1% of the 1 GB GH Pages cap).

**Why this is the right answer for today:** Lowest effort. Solves the actual stated problem ("hard for me to read… have to watch video"). Reversible if she hates it. No new dependencies, no build pipeline changes.

---

### STANDARD — the "right answer" most apps land on (~2-3 sessions)

**What:** Hybrid layout — short looping MP4 (3-5 sec, auto-playing, muted, no controls) as the primary visual, with a static start-position frame baked as the poster image so it shows instantly before the video buffers. Text collapses. YouTube link kept as escape hatch.

**Why MP4 over GIF:** Modern MP4 (H.264 or H.265) is 5–10× smaller than equivalent-quality GIF. A 3-sec exercise loop at 480×480 is ~80 KB as MP4 vs ~600 KB as GIF. For 25 exercises: 2 MB vs 15 MB. Quality is also much better.

**Sources, in priority:**

1. **MuscleWiki API** (free RapidAPI tier, 1,700+ exercises, byte-range video streaming). Best matches: bodyweight squat, glute bridge, single-leg bridge, calf raise, clamshell, dead bug, side leg raise, calf raise, all wrist mobility/strengthening. Caveat: requires API key + CDN dependency.
2. **Mixkit / Pexels fitness category** for stretches and breathing demos. All three (Mixkit, Pexels, Pixabay) explicitly grant commercial use with no attribution required.
3. **Custom phone recording** for: belly breathing, slow breathing, knees-to-chest hold, figure-4 stretch, the Lisa Cohen-specific wrist drills. ~10 min total to film, edit to 3-5 sec MP4 loops in any free editor.

**Wire-in:** Same as Lean but `<video src="..." autoplay loop muted playsinline poster="...">`. Add poster frames extracted from the MP4 first frame so the static image shows before video loads — that's the "0 ms glance" magic.

**Optional polish:** On long-press or tap-and-hold, open a modal with the full instructional text _and_ a slower-tempo version of the same clip side-by-side. Hevy and Caliber both use this pattern.

**Cost:** $0 (free tiers), ~30 min of recording for the gap exercises.

---

### AMBITIOUS — if she invests 4-5 sessions

**What:** Custom, branded, consistent visual style across all 25 exercises. Two viable paths:

**Path A — Commissioned/AI-generated stick-figure Lotties.** Produce one Lottie JSON per exercise in a unified visual style (single colour, simplified anatomy, looping 3-sec animation). Lottie payloads are ~10–50 KB each (vector, scalable, gorgeous on retina). Bundle adds ~250 KB for `lottie-web` runtime. Either commission from an animator on Fiverr (~$15-30/exercise = $400-750 total) or attempt with an AI animation tool. Result is the visual quality Nike Training Club has — instantly recognizable.

**Path B — AI-generated video loops via Sora 2 or Veo 3.1.** Generate one short MP4 per exercise from a prompt. Per OpenAI's Sora 2 page, the model "provides anatomically correct motion synthesis" and tracks 87 human joint parameters. Veo 3.1 was preferred in benchmark testing for visual quality. **Caveat to flag:** Kling AI's 3D-reconstruction benchmark put Sora 2 at 89% anatomical accuracy, and the Sora 2 documentation explicitly warns about "human anatomy in complex poses" and "3-4 consecutive logical steps" as failure zones. Wall sit, calf raise, glute bridge — likely fine. Clamshells, dead bug, figure-4 stretch — high failure risk. Cost: ~$0.10-0.50 per clip via Higgsfield or similar. As of May 2026 this is still a 70-80% solution that needs per-clip QA from someone who knows form (you do).

**Recommendation:** Don't go ambitious yet. Ship Lean, see how she feels mid-workout, decide if it's worth the extra investment. Path A (custom Lotties) is the only one I'd revisit and only if a free-time Friday afternoon shows up.

---

## 4. Library / API options inventory

| Source                                                                                                                                         | Coverage                                 | Asset format                                          | License                                                                     | Cost                                                  | Notes                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)**                                                                    | 800+ exercises                           | 2 JPGs per exercise (start + end position)            | **Unlicense (public domain)**                                               | Free, no attribution                                  | **Best license fit.** Has glute bridge, squats, calf raise variants. Missing: clamshell, dead bug, side leg raise, wrist PT (verified via the dist/exercises.json fetch). Raw image URL: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<Name>/0.jpg` |
| **[MuscleWiki API](https://api.musclewiki.com/documentation)**                                                                                 | 1,700+ exercises, 6,800+ video clips     | MP4 video w/ byte-range streaming + JPEG/PNG/GIF/WebP | TBD on commercial terms — check RapidAPI listing                            | **Free tier on RapidAPI**, no CC required             | Best coverage of unusual movements. CDN dependency means uptime risk. Requires API key (server-side proxy needed since GH Pages is static — could route via Supabase edge function)                                                                                               |
| **[ExerciseDB / ExerciseDB API](https://github.com/ExerciseDB/exercisedb-api)**                                                                | 5,000+ GIF animations, 11,000+ exercises | GIF + PNG                                             | **AGPL-3.0**                                                                | Tiered pricing on RapidAPI; v1 docs at exercisedb.dev | AGPL is **risky** for proprietary apps but workout-tracker is a personal repo so it's fine. CDN-hosted.                                                                                                                                                                           |
| **[wger](https://wger.de/en/software/api)**                                                                                                    | Several hundred exercises                | Mostly photos, some illustrations, source-mixed       | **CC-BY-SA 3.0** + AGPL on the API                                          | Free, fully open-source, self-hostable                | Image quality inconsistent (sourced from Wikipedia + contributors). License requires attribution. Good fallback.                                                                                                                                                                  |
| **[LottieFiles fitness collection](https://lottiefiles.com/free-animations/exercise)**                                                         | Hundreds of animations                   | Lottie JSON / dotLottie / MP4 / GIF                   | Per-asset, mostly free for personal use                                     | Free tier extensive                                   | Stylized illustrations, not anatomical. Good for warmup/cooldown vibes, less good for "what muscle does this hit."                                                                                                                                                                |
| **[Pexels](https://help.pexels.com/hc/en-us/articles/360042295214-Can-I-use-the-photos-and-videos-for-a-commercial-project)** fitness category | Hundreds of fitness clips                | MP4 (4K available)                                    | Pexels License — commercial use OK, no attribution required                 | Free                                                  | Real humans, real form, but clips are 10-30 sec — need to crop.                                                                                                                                                                                                                   |
| **[Mixkit](https://mixkit.co/license/)** fitness/sports                                                                                        | Smaller fitness library                  | MP4                                                   | Mixkit License — commercial use OK                                          | Free                                                  | Same as Pexels, less coverage.                                                                                                                                                                                                                                                    |
| **[Pixabay](https://pixabay.com)** fitness videos                                                                                              | Medium fitness library                   | MP4 + GIF                                             | Pixabay License — commercial use OK                                         | Free                                                  | Good for stretches, less specific exercise demos.                                                                                                                                                                                                                                 |
| **Sora 2 / Veo 3.1**                                                                                                                           | Generate anything                        | MP4                                                   | Generated content terms (typically you own commercial rights on paid tiers) | ~$0.10-0.50/clip                                      | 2025 quality is "almost there" — verify each clip for form correctness                                                                                                                                                                                                            |

**For the EXERCISE_GUIDE specifically — what each source covers:**

| Exercise                         | yuhonas             | MuscleWiki | wger     | Needs custom                                      |
| -------------------------------- | ------------------- | ---------- | -------- | ------------------------------------------------- |
| Belly breathing                  | No                  | Maybe      | No       | **Yes (record yourself)**                         |
| Knee-to-chest hugs               | Possible            | Yes        | Yes      | —                                                 |
| Pelvic tilts                     | No                  | Yes        | Possible | —                                                 |
| Knee drops side-to-side          | No                  | Likely     | Possible | —                                                 |
| Glute squeezes (isometric)       | No                  | Yes        | Possible | —                                                 |
| Bodyweight squats                | **Yes**             | Yes        | Yes      | —                                                 |
| Glute bridges                    | **Yes**             | Yes        | Yes      | —                                                 |
| Wall sit                         | No (per JSON probe) | Yes        | Yes      | Fallback to MuscleWiki                            |
| Side-lying clamshells            | No                  | Yes        | Yes      | —                                                 |
| Modified dead bug                | No                  | Yes        | Possible | —                                                 |
| Heel taps / dead-bug-lite        | No                  | Yes        | Possible | —                                                 |
| Knees-to-chest hold              | No                  | Possible   | Yes      | —                                                 |
| Figure-4 stretch                 | No                  | Yes        | Yes      | —                                                 |
| Seated forward fold              | No                  | Yes        | Yes      | —                                                 |
| Slow breathing                   | No                  | No         | No       | **Yes (record yourself)**                         |
| Side-lying leg raises            | No                  | Yes        | Yes      | —                                                 |
| Single-leg glute bridges         | No                  | Yes        | Yes      | —                                                 |
| Slow supine bicycle              | No                  | Yes        | Possible | —                                                 |
| Standing calf raises             | Possible            | Yes        | Yes      | —                                                 |
| Outdoor walk                     | N/A                 | N/A        | N/A      | **Yes (or just an icon)**                         |
| Wrist stretch (L+R)              | No                  | Yes        | Possible | Custom is better — show Lisa Cohen's specific cue |
| Flexion/extension tuna can (L+R) | No                  | Likely     | Possible | Custom is better                                  |
| Radial deviation tuna can (L+R)  | No                  | Likely     | Possible | Custom is better                                  |

Rough estimate: MuscleWiki covers ~18 of 25 cleanly. Self-record 5-7 for breathing + wrist-specific.

---

## 5. Mid-workout UX pattern — recommended screen

The bar is: **glance, get oriented, look back at the timer.** That's a 1-2 second look. The current screen leads with text and buries the visual behind a YouTube link — exactly inverted from how attention should flow.

ASCII mock of the recommended exercise card during active set:

```
+----------------------------------+
|  Wall sit                  2 / 8 |  ← exercise name + position in round
|  Hold 30 sec                     |  ← reps/duration in big text
|                                  |
|   +------------------------+     |
|   |                        |     |
|   |    [LOOPING GIF/MP4    |     |  ← THE visual — fills ~half the card
|   |     of the exercise]   |     |     autoplays, loops, no controls
|   |                        |     |
|   +------------------------+     |
|                                  |
|        ⏱  00:14                  |  ← rest/work timer, huge font
|                                  |
|        [  NEXT ▶  ]              |  ← single primary action
|                                  |
|  › Read instructions             |  ← collapsed text (the existing how-to)
|  🎥 YouTube fallback             |  ← tertiary
+----------------------------------+
```

Design rules backing this:

- **Visual on top, not behind a tap.** NN/g mobile research: users spend <3 sec interpreting health screens; cognitive-load reduction can boost task completion by up to 45%.
- **One primary action per screen.** "Most users abandon apps after 3+ taps per action; limit to 2 taps or less." (zfort, MoldStud fitness UX reviews.)
- **Text is opt-in, not opt-out.** Allison's stated need is that text is hard to read in-the-moment. The text isn't wrong — it's wrong _as the default_.
- **Poster image trick:** When using `<video>`, set `poster="…"` to the first frame so the static image renders instantly before the video buffers. No flash of empty box.
- **Autoplay + loop + muted + playsinline:** All four required on iOS Safari for in-page autoplay. Don't show video controls — they're noise.
- **RTL safe:** The current app is English. If Hebrew copy ever lands here, the visual block sits the same; only labels swap.
- **Accessibility:** Add `alt` text describing the exercise; the text-collapse is keyboard-reachable; for low-vision users the text is still there one tap away.

---

## 6. Failure modes

**GIF self-hosted (Lean path):**

- Repo bloat creeps up if you add many exercises — set a hard limit of 300 KB per file, batch-optimize with `gifsicle` before commit. 25 exercises × 300 KB = 7.5 MB, fine.
- GitHub Pages bandwidth is a _soft_ 100 GB/month — for a personal app it's never going to be a concern, but if you ever go viral it could throttle. Mitigation: move to Cloudflare Pages or push assets to Supabase Storage CDN.
- Low-vision users: GIFs aren't keyboard-controllable. Solution: text fallback always present, just collapsed.

**MP4 self-hosted (Standard path):**

- iOS Safari is strict about autoplay — you MUST have `muted` + `playsinline` or it won't autoplay. Test on real device, not just emulator.
- Some Android browsers throttle multiple concurrent videos. With one visible at a time you're fine.
- Older iPhones may stutter on H.265 — use H.264 baseline profile to be safe.

**Third-party CDN (MuscleWiki / ExerciseDB):**

- API key required → can't ship from a static site. You'd need a Supabase edge function to proxy. Adds latency + a moving part.
- Service can disappear or change terms. Mitigation: download GIFs once, cache locally — but check the license re: redistribution. MuscleWiki's terms on RapidAPI need to be read carefully.
- Rate limits on free tier exist.

**Lottie:**

- `lottie-web` runtime adds ~250 KB JS. Not huge but noticeable on slow connections.
- Mobile Safari JSON parsing can be slow on older devices.
- License-per-file headache — every Lottie has its own terms; auditing 25 of them is a chore.

**AI-generated:**

- Form errors. As a clinician you'd spot a bad demo immediately, but the cost of catching it is your time.
- Re-generation is needed each time you change exercises.
- The Sora 2 docs explicitly call out human anatomy in complex poses as a weakness. Clamshell, dead bug, figure-4 — high risk.

**Licensing — generally:**

- wger and ExerciseDB are AGPL — virally copyleft. For a personal repo, doesn't matter. If you ever spin out a commercial product, AGPL pollutes downstream code. Stick to Unlicense (yuhonas) or proprietary-friendly licenses (Pexels/Mixkit/Pixabay) for the path that scales.
- "Free for personal use" ≠ "free to bundle in a deployed app." Check each per-source.

**Accessibility / RTL:**

- Hebrew RTL mode (your default for Clalit apps) is fine here — visuals aren't directional. But if you ever caption a clip, the caption needs RTL handling.
- For low-vision use, keep alt text rich: "Animated figure performing a wall sit with back flat against wall, knees at 90 degrees."

**Mobile data:**

- 25 × 300 KB = 7.5 MB on first visit. PWA-cache after that. Add `<link rel="preload">` for the next-up exercise during the rest timer so it's there when she needs it.

---

## 7. Decision questions for Allison

Five quick decisions before commit:

1. **Format preference: photographic (real human, MuscleWiki/Pexels) or illustrated (stick figure / line drawing)?** Both work — photographic is faster to source, illustrated is more consistent visually but harder to assemble.

2. **OK self-hosting ~30 small (~200 KB each) assets in the public repo?** If yes → Lean path. If no → CDN proxy via Supabase edge function (1 hr extra build, ongoing dependency).

3. **GIF or MP4?** MP4 is ~10× smaller and looks better but requires `<video>` autoplay flags. GIF is dumber and just works. (Lean recommends GIF, Standard recommends MP4.)

4. **Replace text by default or keep it visible underneath?** Recommend collapse-by-default. If she ever wants the text back, one tap reveals it — the text isn't lost, just demoted.

5. **Wrist PT (Lisa Cohen) exercises — record yourself, or use a generic clip?** Custom 10-sec phone recording is probably better because Lisa Cohen's cues are specific (which direction the can goes, etc.). 10 min total to record all four.

---

## Executive summary (150 words)

Allison's app currently fronts text with a "watch video" escape hatch — exactly inverted from how attention works mid-workout. Every production fitness app of note (Hevy, Bodybuilding.com, Fitbod, Caliber, gymvisual) leads with a short, autoplaying, looping visual; that pattern won because nothing else survives the 2-second mid-set glance test. Recommendation: self-host one ~200 KB GIF or short MP4 loop per exercise above the existing text, collapse the text behind a "Read instructions" toggle, keep the YouTube link as fallback. The free-exercise-db (Unlicense, 800+ exercises, two-frame JPGs) plus MuscleWiki's free tier (1,700+ exercises with video) covers ~80% of her 25-exercise set; the remaining 5-7 — belly breathing, slow breathing, the Lisa Cohen wrist routine — are best filmed by her on her phone in ten minutes. Total build time: one session. Cost: zero. Hold the AI-video and Lottie paths in reserve until the lean version proves the format.

---

## Sources

- [Free Exercise DB (yuhonas) — Unlicense public domain](https://github.com/yuhonas/free-exercise-db)
- [Free Exercise DB browsable frontend](https://yuhonas.github.io/free-exercise-db/)
- [ExerciseDB API (AGPL-3.0, 11,000+ exercises, 5,000+ GIFs)](https://github.com/ExerciseDB/exercisedb-api)
- [ExerciseDB v1 docs](https://www.exercisedb.dev/docs)
- [wger Workout Manager REST API (AGPL-3.0 / CC-BY-SA 3.0)](https://wger.de/en/software/api)
- [wger documentation](https://wger.readthedocs.io/)
- [MuscleWiki API documentation](https://api.musclewiki.com/documentation)
- [MuscleWiki public site](https://musclewiki.com/)
- [LottieFiles free fitness/exercise animations](https://lottiefiles.com/free-animations/exercise)
- [Pexels license — commercial use, no attribution](https://help.pexels.com/hc/en-us/articles/360042295214-Can-I-use-the-photos-and-videos-for-a-commercial-project)
- [Mixkit license](https://mixkit.co/license/)
- [GitHub Pages limits — 1 GB repo, 100 GB/mo bandwidth](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Sora 2 announcement (anatomical motion claims)](https://openai.com/index/sora-2/)
- [Sora 2 limitations writeup (joint tracking, anatomy failure modes)](https://sora2prompt.co/guides/sora-2-limitations)
- [Sora 2 review — 89% anatomical accuracy benchmark](https://skywork.ai/blog/openai-sora-2-review-2025-strengths-limits-scenarios/)
- [Veo 3.1 (Google DeepMind)](https://deepmind.google/models/veo/)
- [3D anatomy / React Three Fiber muscle highlighting guide](https://www.wellally.tech/blog/react-three-fiber-3d-anatomy-model-fitness-app)
- [Exercise GIF best practices roundup](https://gym-animations.com/exercise-gif/)
- [Hevy exercise library overview](https://www.hevyapp.com/features/exercise-library/)
- [Apple Fitness+ UX case study (builtformars)](https://builtformars.com/case-studies/using-apple-fitness)
- [Apple HIG: Workouts](https://developer.apple.com/design/human-interface-guidelines/workouts)
- [Fitness app UX best practices — cognitive load, glanceability (zfort)](https://www.zfort.com/blog/How-to-Design-a-Fitness-App-UX-UI-Best-Practices-for-Engagement-and-Retention)
- [Fitness app UX best practices 2025 (Dataconomy)](https://dataconomy.com/2025/11/11/best-ux-ui-practices-for-fitness-apps-retaining-and-re-engaging-users/)
- [Nielsen Norman Group — Mobile Usability book](https://www.nngroup.com/books/mobile-usability/)
- [Attention residue research (Sophie Leroy 2009)](https://www.sciencedirect.com/science/article/abs/pii/S0749597809000399)
