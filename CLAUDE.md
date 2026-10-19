# House style — standalone physics visualizations

Reverse-engineered from `sonic-boom.html`, the reference piece.
This describes what that file *does*, so the next one in the collection looks like it belongs.

The audience is a curious non-specialist. The goal of a piece is that after two minutes of
pressing Play and dragging sliders, one specific counter-intuitive fact is now obvious.

---

## 1. File structure

**One file. No build. No network.**

- A single `.html`, ~1.6k lines / ~80 KB. Opens from `file://`. Never fetches anything.
- Physical order of the file: `<title>` → one `<style>` → `<div id="app">…</div>` → one `<script>`.
  No `<!DOCTYPE>`, `<head>`, or `<body>` — it is an artifact body; the host wraps it.
- `<script>` opens with `"use strict";` and is organised top-to-bottom by banner comments:
  `constants` → `atmosphere/medium model` → `helpers` → `scenarios (SCEN)` → `state (S)` →
  derived-quantity functions (`runLen`, `simDuration`, `peakImpact`, …) → `resetSim` →
  `stepVehicle` → emission → `computeObserver` (the physics kernel) → canvases/camera →
  `draw` + per-layer draw functions → `updateReadouts` → the rAF `loop` → `UI wiring` → `go`.
- Bootstraps by calling `resize()` then clicking the already-active tab
  (`document.querySelector('#tabs button.on').click()`), so first paint runs the same path as
  a user switching scenarios.

**Dependency policy: zero.**

- Vanilla JS + Canvas 2D only. No framework, no CDN, no `<link>`, no ES module imports.
- Everything is hand-rolled, including the small 3-D inset (a by-hand orthographic projection
  drawn from ring/line primitives, and captioned `(schematic)` so nobody over-reads it).
- The only "library" is a handful of pure helpers defined in the file: `clamp`, `lerp`,
  `smooth` (smootherstep), `keyf` (piecewise-linear keyframe table lookup), `rot`.

**Numbers are real and anchored.**

- Physical constants are named with units in a comment (`GAMMA`, `RSPEC`, `G0`, `MAIR`,
  `RSTAR`, `P0`, `T0K`; `A0` is *computed* from them).
- The medium is a real model — US Standard Atmosphere 1976, seven layers, base pressures
  precomputed in an IIFE, exposed as `atmo(z) → {T, P, rho, a}`.
- Fudge factors carry a comment saying what real datum they are fit to
  (`KCAL … fit to Concorde ≈ 100 Pa`; the low-boom factor `tuned so the M1.4 design point
  lands on NASA's published X-59 figures`).
- The live physics and any predictor share **one kernel** (`nominalDp(hGen, mGen, len)`),
  with a comment: *"so the two can't drift apart."* Do not re-derive the same law twice.
- Everything guards against blow-up: `clamp(...)`, `Math.max(x, 1e-4)`, `|| 1`. The sim
  degrades, it never throws.

---

## 2. Visual world

**One committed look: a dark instrument panel.** Not theme-aware — `color-scheme: dark`,
every colour painted explicitly.

- Palette lives in `:root` custom properties.
  - Neutrals, blue-biased, darkest-first: `--bg #06080d`, `--panel`, `--panel2`, `--line`,
    then text `--ink` / `--dim` / `--faint`.
  - Semantic accents, used consistently in CSS *and* on canvas:
    `--cyan` = interactive / primary (tabs, sliders, active state);
    `--amber` = the phenomenon itself (wavefronts, the cone, the headline number);
    `--green` = the observer / on-target / benign;
    `--red` = warning, caustic, cut-off, over-threshold.
- Two type roles: `--sans` (system UI stack) for prose only; `--mono` for **everything
  else** — every control label, value, tab, axis tick, canvas annotation, readout row.
- Body: `font-size: 13px`, `overflow: hidden`. The page itself never scrolls; individual
  panels scroll internally.

---

## 3. Layout grammar

`#app` is a full-viewport flex column: `header` / `main` / `#explain`.

- **`header`** — `h1` (uppercase, letter-spaced, exactly one word wrapped in an
  accent-colour `<span>`) + `.tabs` on the right. Tabs are `<button data-s="key">`, one
  carries `.on`. Tabs are the scenario switcher.
- **`main`** — CSS grid `250px 1fr`: a fixed-width `<aside>` control rail + `#stagewrap`.
  - **`aside`** — a vertical stack of `.grp` blocks. Each opens with a tiny mono
    uppercase underlined `<h2>`. Controls are one of:
    - `label.fld` — a captioned `<input type="range">` with a live value in a mono
      `<span class="v">` to the right of the caption;
    - `label.chk` — a checkbox that toggles a draw overlay;
    - `.btns` — a row of equal-width buttons (`play` gets a highlight class).
  - Groups and individual `label.fld`s carry `data-scen="a b c"`; a scenario switch shows
    only the controls whose list contains the active key. Every scenario reuses the same
    rail, just filtered.
  - `.hint` — a faint one-liner under a group, telling you what you can drag.
- **`#stagewrap`** — flex column: `#stage` (`flex: 1`) over `#plots` (fixed ~168 px).
  - **`#stage`** — a full-bleed `<canvas id="main2d">`, plus two absolutely-positioned
    floating panels pinned top-right:
    - `#inset3d` — a small secondary `<canvas>` (~272×190) in a blurred translucent card
      with a mono uppercase `.cap`. A schematic second viewpoint, never the primary read.
    - `#readouts` — a `<dl id="rdl">` of live `key → value` rows, mono, scrollable,
      anchored `top` and `bottom` so it can never spill past the stage.
  - **`#plots`** — exactly **two** side-by-side `.plot` canvases, each with a mono
    uppercase `.cap` top-left:
    - a **time-domain panel**: the signal one observer actually experiences (here, the
      N-wave / pressure-vs-time). This is the payload — the abstract field turned into a
      lived trace.
    - a **relationship panel**: the dependent quantity against an independent axis,
      usually log–log, with the observer's current point marked and reference slopes drawn
      (here, Δp vs. distance with `r^-1/2` and `r^-3/4` guides).
- **`#explain`** — a bottom strip: a CSS grid of **five** `.ex` cards, `max-height`
  clamped, reflowing `5 → 3 → 2` columns by width, each card scrolling internally.
  Card = mono uppercase accent `<h4>` + 2–3 `<p>`, optionally one `<p class="cav">`
  (italic, faint, tiny) carrying model caveats.

---

## 4. Canvas conventions

- HiDPI: backing store scaled by `min(devicePixelRatio, 2)`, `ctx.setTransform(DPR,0,0,DPR,0,0)`,
  CSS size drives layout. A `fit()` / `resize()` pair; `resize` bound to `window`.
- The main stage uses an **isotropic** world→screen map: `sx` and `sy` share one `cam.s`
  (px per metre), screen-y flipped. Stated in a comment: *"isotropic so angles are true."*
  A drawn angle on the stage is the real physical angle — the picture is the argument.
- World units are SI (metres, seconds). The camera is a `{s, x0, vmax}` object;
  `curVmax()` picks the vertical span per scenario; `updateCam()` picks the horizontal
  origin.
- Every canvas string is drawn as `` `${px}px ` + cssMono() ``.
- Canvas fills are `rgba()` literals whose hue matches the CSS accent for that role
  (amber phenomenon, green observer, red warning). Faint structure (grid lines, guides) is
  low-alpha blue-grey.
- Each optional overlay is a checkbox-backed flag (`S.ov.wf`, `S.ov.cone`, …) and an
  `if (S.ov.x) { … }` block in `draw()`.
- The physically meaningful object is drawn as an **emergent construction**, not asserted:
  the Mach cone is the visible *envelope* of the individually-drawn expanding wavefronts;
  the analytic cone is a separate, secondary, dashed overlay you can toggle off.
- Transient stage events get a short, shouty, mono uppercase label anchored to the thing
  (`SOUND BARRIER — …`, `MACH CUT-OFF — …`, `predicted loudest spot · …`).

---

## 5. Simulation & time model

- `SCEN[key]` holds only the per-scenario *differences* (display name, camera framing
  constants, active-phase length, keyframe tables). One flat mutable `S` holds everything
  else: `scen`, playback (`playing`, `t`, `rate`), every control value, `ov` sub-object,
  vehicle kinematic state `v`, the wavefront array `wf`, `obs.x`, `pan`, and transient
  caches prefixed `_` (`S._heardG`, `S._arrivedAt`, `S._peak`, `S._holdBase`,
  `S._obsUserMoved`).
- **Loop**: `requestAnimationFrame`; real dt clamped to 0.05 s; sub-stepped at fixed
  `h ≤ 0.02 s`; per substep `stepVehicle(h); emit();`. Then `computeObserver()`, then
  `draw()`. Physics is frame-rate independent.
- **Emission model**: the source drops a discrete spherical `wavefront` every `DT_EMIT`
  seconds, each carrying its emission `{x, y, t, a, M, spd, mu, boom}`. The array is FIFO
  capped at `WF_CAP`. The interesting structure is the envelope of these; it is never
  stored, only drawn.
- **`computeObserver()`** is the kernel and returns one plain result object `R` consumed by
  both the readout and the plots. It scans the wavefronts, finds the first that *arrives*
  (physical test: `radius ≥ distance`) for timing, and the strongest that has arrived for
  strength/character. It represents "nothing yet", "incoming + countdown", "arrived",
  "outside the carpet", and "refracted away" as **distinct named states**, each with its
  own copy. It never invents a signature for a boom that has not reached the observer in a
  scenario where the source is not in steady state.
- **Timeline**: Play / Pause, a Restart, a `Time rate` slider (0.15–5×), and a **Timeline**
  scrubber. `simDuration()` computes from the current parameters how long the run must be
  (active phase + boom propagation time + a margin) so the payoff always fits on screen.
- **Scrubbing ≠ resetting.** `rebuildTo(t)` replays the *deterministic* emission schedule
  from 0, so dragging the Timeline lands on a fully-populated frame. `play(to t)` and
  `scrub(to t)` are required to agree. Comments say so.
- **Predict, don't only reveal.** `peakImpact()` computes up-front, from parameters alone,
  *where* on the ground the loudest boom lands and *how loud* it is there, and surfaces it
  in the readout and as a stage marker before the run plays out. It reuses `nominalDp()`.

---

## 6. Interaction grammar

- **Tabs** re-key everything: apply a per-scenario slider-defaults map, then `resetSim`.
- **Sliders**: `oninput` → set `S.*` → `refreshSliderLabels()` (update the mono value span)
  → then either `reparam()` (a change that alters the *trajectory* — rebuild the wavefront
  trail at the current `t`) or `nudge()` (a change that only alters the *reading* —
  recompute + redraw). `rate` does neither of those; it just scales dt.
- **The stage is directly manipulable.** Drag the observer glyph to move it along the
  ground; drag anywhere else to pan; double-click to recenter; `◂ Pan / Pan ▸ / ⊙ Center`
  buttons mirror it. A user drag sets `S._obsUserMoved` so the auto-placement stops
  overriding the choice.
- **The camera is a director.** It follows the vehicle, then *glides* to frame the observer
  as the boom approaches, then *freezes* the instant the boom lands so the wavefronts
  visibly expand on screen. Each mode is a commented branch of `updateCam()`.
- **Readout rows carry `title=` tooltips** (dotted underline, `cursor: help`) that define
  the quantity in one plain sentence. `<dd>` gets `.hi` (amber headline), `.warn` (red
  attention), or `.ok` (green on-target).

---

## 7. Tone of the explanatory text

From the five `.ex` cards, the tooltips, and the canvas labels:

- **Second person, present tense, active voice.** *"Every instant the vehicle radiates a
  pressure pulse…"* · *"Nothing until the cone sweeps past — then pressure jumps to +Δp…"*
- **Name the mechanism before the maths.** Formulas appear inline in `<code>` as compact
  *scaling* relations only — `μ = arcsin(1/M)`, `Δp ∝ r^-¾`, `half-width ≈ 2.6 × altitude` —
  never a derivation.
- **Anchor every quantity to something felt.** *"~100 Pa (2 psf) rattles windows"*,
  *"+10 PLdB ≈ twice as loud"*, *"a ~1 ms rise is a knife-edge crack; tens of ms a soft
  thud."* A dedicated "Reading the units" card does nothing but this.
- **Kill the misconception outright.** *"not a one-off bang at Mach 1"*; *"the many small
  shocks only merge into one N-wave after kilometres of travel."*
- **One idea per sentence.** Em-dashes and `⇒` for cause→effect. Short.
- **Disclose the model's own limits.** At least one `<p class="cav">` — *"Treat every
  figure as an engineering estimate, ±~2×."* Tooltips flag which single number is exact
  (*"μ = arcsin(1/M) — the one exact number here"*). The 3-D inset is captioned
  `(schematic)`. Predicted values are printed with a leading `≈`.
- **Register split.** Mono UPPERCASE for structural labels (card headings, plot captions,
  stage event shouts); sentence case for prose.
- **Readout number formatting** matches the real precision: Mach 3 dp, angle 1 dp,
  psf 2 dp, PLdB 0 dp — always with a unit, `≈` on anything estimated.

---

## 8. The non-negotiables

A new piece is not in this collection unless it is:

1. one self-contained `.html`, no dependencies, no network, runs from `file://`;
2. a single committed dark instrument-panel look built from the same token roles;
3. an isotropic 2-D stage where the drawn geometry is literally the physics, plus a
   secondary schematic inset and two plots — one of which is *one observer's lived signal*;
4. built on a real medium/constants model, calibrated to a citable datum, with one shared
   physics kernel and graceful (never-throwing) degradation;
5. driven by Play + a physics-aware Timeline where scrubbing equals playing, 2–4
   parameter sliders each with a felt consequence, and a directly manipulable observer;
6. scenario tabs that reuse the kernel and reward comparison;
7. explanatory text in the tone of §7, including an explicit caveat about the model's
   accuracy and a units primer with everyday anchors;
8. carrying an up-front prediction of the worst-case location and magnitude, not only a
   reveal.

---

## 9. Exception — pieces whose subject is 3-D

`tesla-roadster.html` is the one piece that deviates from §3/§4, deliberately:

- The stage is a **true-scale WebGL scene** (raw WebGL 1, hand-written shaders and matrices — still zero
  dependencies, one file, `file://`, no network) instead of an isotropic 2-D canvas. The "secondary 3-D inset"
  becomes a **2-D schematic** (there, the air system). Geometry is still metric and un-exaggerated.
- Its in-scene look is **8-bit synthwave** (low-res FBO, 32-colour palette, Bayer dither, CRT pass, bitmap-font HUD).
  The UI chrome, readouts, plots and explainer cards keep the house roles and tone.
- Everything else in §8 still applies: real constants, one kernel per quantity (here the sim is precomputed from
  that kernel, so scrub == play by construction), an up-front prediction, tabs that reuse the kernel, a caveat
  card — plus a **confidence chip on every readout** (OFFICIAL / INTERVIEW / REPORTED / DERIVED / ESTIMATE / ASSUMED)
  because the source data mixes stated, reported and derived numbers.
- A WebGL piece must still **degrade, never throw**: with no WebGL it shows a message and the readouts and plots keep running.

---

## 10. Phone presentation — "Experiment" mode

`sonic-boom.html`, `diffraction-grating.html` and `tesla-roadster.html` carry a second presentation for phones. The other
two pieces (`gravitational-slingshot.html`, `sofar-sound-channel.html`) have **not** been adapted yet. §§2–8 still describe the desktop **Full lab**; Experiment
is an additive layer over the *same* DOM, kernel and state, never a fork of them.

**Mode model**

- `E = {mode, homes, hold, baseline}`. `E.mode` starts `'experiment'` iff `matchMedia('(max-width:700px)')`
  matches, else `'lab'`. It is chosen **once at load**: rotating a phone must not switch modes, and a
  desktop browser always starts in Full lab.
- `setView(mode)` toggles `body.experiment`, swaps a few captions (e.g. "Your pressure signature"),
  and calls `resize()`. A header `#viewMode` pair (**Experiment / Full lab**, `aria-pressed`) switches at
  any time **without resetting** scenario, parameters, observer, timeline or playback.
- Needs `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`
  (the one head element the "artifact body" rule in §1 now allows, as the first line after `<title>`).

**Implementation rules**

- All Experiment CSS is scoped `body.experiment …`; phone-only elements carry `.experiment-only`
  (`display:none` by default, `block` under `body.experiment`). Full lab CSS is not edited.
- Mode-dependent canvas code reads `E.mode` (e.g. `const compact = E.mode==='experiment'` for
  bigger paddings) rather than a second draw path.
- Experiment controls are **proxies**: each writes the value into the real desktop control and
  dispatches its `input`/`click`, so `reparam()`/`nudge()` and the kernel run unchanged
  (`$('prog').value=…; dispatchEvent(new Event('input'))`). `updateExperiment()` reads `S`/`S.res`
  back into the phone widgets every frame. Never duplicate physics for the phone.
- Layout is a full-`100dvh` flex column, safe-area insets on header (top) and controls (bottom):
  header (title + `#viewMode`) → `#experimentTop` scenario `<select>` (replaces tabs) → `main`
  (stage, then **one** plot: the observer's lived signal) → `#experimentResult` → `#experimentControls`.
  Rail, 3-D inset, floating readouts, second plot and the five-card `#explain` are hidden.
- `@media (max-height:740px)` shrinks plot and result type; `@media (max-height:520px)` (landscape)
  lets the body scroll over a fixed-height `#app` rather than crushing the stage.
- Letter-spacing is 0 in Experiment (uppercase tracking wastes width); caption type stays mono.

**Anatomy (top to bottom)**

1. **Stage** — unobstructed. Touch: `touch-action:none` on the canvas and **Pointer Events** only
   (`setPointerCapture`, `isPrimary`, handle `pointercancel`/`lostpointercapture`). Observer grab radius
   is generous (≈ ±28 × ±52 px); any other drag pans / orbits; double-click recentres. A drag sets
   `S._obsUserMoved`, and clears `E.hold`, so auto-placement cannot override the user.
2. **Plot** — the time-domain panel only, ~142 px (≥ 100 px at every tested size).
3. **Result strip** — a *state word* in `--green` (or `--red` via `.warn`) (`Arrives in ~N s` /
   `Boom received` / `Outside the carpet` / `Refracted away`), the headline number in `--amber`, then the
   **up-front prediction line** (`Predicted loudest: ~N Pa, where`), then the comparison line in `--cyan`.
   Same named-state discipline as `computeObserver()` — the strip only re-words `S.res`.
   Roadster adds the confidence chip (`.tg`, e.g. `DER`) beside the headline.
4. **Controls** — transport (▶/❚❚, ↻, Timeline), **one primary lever** (the single slider that
   best carries the lesson; its label/min/max/step are copied from the real slider per scenario), and an
   action row: **Keep run · Parameters · Why?**.

**Keep run** — the signature interaction. Freeze the current result into `E.baseline`, draw it as
a dashed trace, change the lever, and compare against the new trace (`Held: … · +N Pa now`). It is
disabled until there is something to keep; switching scenario clears it; tapping again clears it.

**Detail sheet** — one modal `<dialog id="experimentDetails">`, sticky `#detailBar` of `data-detail`
buttons (**Parameters / Measures / Why?**, ✕ close). It **moves the real DOM nodes** (rail, readouts,
second plot, explainer cards) into `#detailContent`, leaving a comment node in `E.homes` so
`restoreDetails()` puts each back exactly. Rules: opening **pauses** playback, and closing leaves it paused at
the same `t`; width `min(100% − 16px, 560px)`, `max-height: calc(100dvh − 32px)`; inside it ranges are
32 px tall, checkboxes and buttons ≥ 44 px, readout rows wrap (`overflow-wrap:anywhere`), the plot is
240 px. Because nodes are *moved* not cloned, ids and listeners survive — never clone.

**Touch & sizing**

- Every tappable control ≥ 44 px (`min-height:44px`); transport icons 44 × 44.
- Must fit with **no page scroll** at 320×568, 375×667, 390×844, 430×932: stage ≥ 120 px (roadster
  ≥ 110), plot ≥ 100 px, controls fully on screen, canvas CSS size == `W`×`H` (±0.5 px), observer / subject
  not clipped.
- Full lab behaviour must be unchanged by any phone edit (the desktop checks in `verify.mjs` still pass).

**Roadster specifics (WebGL)**

- Scenario `<select>` lists six experiments (launch, hover, barrel roll, wall climb, park-and-fade,
  cornering); phone starts on **Hover hop**. Each has a portrait camera table and a per-experiment default map (`{tab, def}`);
  Full lab keeps the launch default.
- Detail sheet's **Measures** also hosts the 2-D air-system schematic and the plot-2 relationship
  plot; the confidence-chip tooltips live there.
- Drag the scene to orbit (`E.yaw` updates on touch); no WebGL ⇒ message shown, result strip, plots and
  measurements keep running.

**Diffraction specifics (2-D, no WebGL)**

- Reuses the desktop stage, drawn through the same `draw()`; Experiment only *removes* clutter that
  does not fit a ~140 px stage (`E.mode!=='experiment'` guards on the stage text labels, the phasor
  box and the stage status banner — the result strip carries those states instead).
- The one lever per scenario comes from a `LEVER` table `{id, name, max?}` (single → slit width,
  double/sub-wavelength → spacing, grating → N); a `max` narrows the range to where the lesson is
  (sub-wavelength stops at 1.6 µm so the d = λ crossing is reachable by thumb).
- Strip = state word (`Light at slits in ~N fs` / `Pattern in ~N fs` / `Pattern building` / `Reading` /
  `On a bright order` / red `Dark null`), detector power in amber, and the prediction from `S._peak`
  (the kernel's `peakImpact()`, shortened to one line so it never wraps at 320 px).
- **Keep run** stores the cached `screenCurve()` object (never mutated, only replaced) plus its ramp, and
  `drawScreenPlot()` draws it dashed cyan, placed by its own screen coordinate so a changed L or aperture
  still lines up. The comparison line is the *line width* (FWHM) held vs now — the lesson, in numbers.
- Stage input was migrated from `mousedown/mousemove/mouseup` to Pointer Events (same for the 3-D
  inset orbit), with wider touch targets for the detector (36 px) and slit-stack handle (24 px).
- Measures sheet order is inset → readouts → width plot so the orbitable schematic is on screen first.

**Collection page (`build-index.mjs` → `index.html`)**

- Also carries the viewport meta. For the adapted pieces (`pocket = sonic-boom | diffraction | roadster`) at ≤ 700 px
  the page gets `body.pocket`: header collapses to a one-line `<select id="topicSelect">`, `100dvh`
  app, and the "what am I looking at" intro is **skipped** (the piece explains itself).
- When a new piece gains a phone mode, add its key to `pocket` in `build-index.mjs`, then rebuild
  `index.html` via the Docker command in `README.md`.

**Verification** — run **alongside** `verify.mjs`, not instead of it, in the Puppeteer container
(`isMobile:true, hasTouch:true, deviceScaleFactor:2`): `verify-sonic-boom-mobile.mjs`,
`verify-diffraction-grating-mobile.mjs`, `verify-roadster-mobile.mjs` (software GL). Between them they check: standalone/strict/no network;
the four portrait sizes fit; play/restart/scenario switches preserve state across modes; held trace
survives parameter changes; real touch drag moves the observer and doesn't snap back; sheet pauses and
restores the original nodes; rotation keeps the chosen mode while a fresh desktop load stays Full
lab; collection phone menu works; zero console errors and zero network requests. A new phone mode
needs an equivalent `verify-<piece>-mobile.mjs`.

**Tone** — phone copy is shorter but follows §7 (second person, state the mechanism, `~` / `≈` on
estimates, a unit on every number). Caveats and the units primer live behind **Why?**, never dropped.
