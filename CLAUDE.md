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
