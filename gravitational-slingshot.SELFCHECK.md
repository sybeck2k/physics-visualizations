# SELFCHECK — gravitational slingshot

Deliverable: `TARGET.html` (1192 lines, one file, no deps, no network, runs from `file://`).
Harness: `.claude/skills/verify-physics-viz/verify.mjs`.
**Finished on harness run 4 of the 8-run cap.** Runs 1–3 were already green; runs 3→4 changed only
the B1 bands (tightened, see below), not the viz.

Verdict: **PASS** — Step 1 (S1–S4) all pass, `verify.mjs` exits 0 with every row PASS, M1–M6 pass.

---

## What the piece is

Planar circular restricted three-body problem: Sun fixed at the origin, Jupiter held on an exact
circular Kepler orbit at 5.204 AU, massless probe integrated by time-reversible velocity-Verlet at
a fixed step. `F = GMm/r²` only. Real SI constants, named with units.

The initial condition is built by placing the probe at the closed-form periapsis of the flyby
hyperbola and integrating the *same* leapfrog **backwards** to t = 0 — so the aim you set is the
aim you get, and forward play reproduces the encounter exactly.

One shared kernel, `flyby(v∞, b, m_p, α)`, produces the initial condition, the up-front prediction,
the dashed analytic hyperbola on the stage, and the Δv-vs-b curve — so the prediction and the thing
predicted cannot drift apart.

---

## Step 1 — static checks

| # | Check | Result |
|---|-------|--------|
| S1 | no `src=` / `href=` / `fetch(` / `<link>` / external `<script>` | **0 lines** ✓ |
| S2 | script parses (`node --check`) | exit 0, no output ✓ |
| S3 | loads from `file://` with `--network none` | harness reached Step 2 ✓ |
| S4 | `"use strict"` present | 1 ✓ |

## Step 2–3 — harness (run 4)

| ID | Threshold | Measured | Verdict |
|----|-----------|----------|---------|
| A1 | 0 pageerror / console.error over 4 tabs × 5 sliders min↔max | 0 errors | PASS |
| A2 | `#main2d` ≥ 5% ink, each plot ≥ 1% | main2d 7.2% · speed 15.7% · gain 21.8% | PASS |
| A3 | `scrollWidth ≤ innerWidth + 2` at 1280×800 and 1440×900 | 1280 vs 1280 · 1440 vs 1440 | PASS |
| A4 | ≥ 8 readout rows, zero NaN/undefined/blank, all 4 scenarios | 19 rows in every scenario | PASS |
| A5 | each slider label differs min↔max | rate ✓ vinf ✓ b ✓ alpha ✓ mp ✓ | PASS |
| **B1** *(exact closed form)* | heliocentric `v_out` within **1.5%** of `2·v_planet − v_in`; planet-frame `|w_in| = |w_out|` within **0.2%** | v_out 16.920 vs 17.058 km/s → **0.81%**; `|w|` 4.000 → 4.002 km/s → **0.052%** | PASS |
| **B2** *(model fidelity)* | independent RK4 within **2%** of the viz's final heliocentric speed; viz's own invariant drift **< 0.1%** | RK4 24.418 vs viz 24.420 km/s → **0.007%**; Jacobi drift **0.0015%** | PASS |
| **B3** *(cited anchor)* | Voyager preset: speed out ∈ **20–30 km/s**, Δv ∈ **12–20 km/s**, figure cited in `#explain` | out **24.04 km/s**, Δv **13.57 km/s**, cited ✓ | PASS |
| B4 | Δv and "speed out" identical at 3 pre-encounter scrub points **and** `—` | `[— \| — \| —]` for both rows | PASS |
| B5 | play(t) vs scrub(t): speed within 10%, Δv within 0.30 km/s | 20.89 vs 20.89 km/s, Δv 5.42 vs 5.42 → **0.000% / 0.000 km/s** | PASS |
| **C1** *(gain is frame-dependent)* | planet-frame in vs out equal within **1%** while heliocentric Δv **≥ +3 km/s** | frame check **0.056%**, Δv **+5.42 km/s** | PASS |
| **C2** *(trailing boosts, leading brakes)* | b = +8 → Δv ≥ **+2**; b = −8 → Δv ≤ **−2 km/s** | **+4.27** / **−5.89 km/s** | PASS |
| C5 | units card ties km/s, the energy change and the geometry each to a concrete referent | km/s ✓ · propellant ✓ · "behind" ✓ · MJ/kg ✓ | PASS |
| C6 | ≥ 1 caveat, ≥ 3 readout tooltips, estimate/±/schematic language | 1 caveat · 28 tooltips · disclosure present | PASS |

---

## Step 4 — manual observational checks

Per SKILL.md §6, M2/M3/M6 are generic and kept as-is; M1/M4/M5 are re-pointed to this phenomenon.

| ID | Action | Threshold | Verdict |
|----|--------|-----------|---------|
| **M1** *(adapted)* | Trailing pass, scrub to closest approach | The dashed analytic patched-conic hyperbola must lie **on** the integrated planet-frame path — the conic is a secondary overlay, the integration is the primary object | **PASS.** At t = 0.4166·T the cyan dashed conic traces the green dotted integrated path with no visible separation; the readout's `Closest approach` (3.08 R_J) equals the predicted periapsis (3.08 R_J) to the printed precision, and the drawn turn matches `Turn angle δ = 122.5°`. |
| M2 | Drag empty space; double-click; ◂ Pan / Pan ▸ / ⊙ Center | View pans smoothly and recenters; nothing clips | **PASS.** A programmatic drag across the stage changed only the camera (`b` unchanged at +12.0 R_J), confirming the grab test discriminates aim-drag from pan. `dblclick` and `#recenter` both reset `S.pan` to {0,0}. |
| M3 | Watch the inset during a run | Renders, updates every frame, labelled "schematic", never NaN or frozen | **PASS.** `drawInset()` is called from `draw()` on every rAF frame. It shows v_planet, the fixed-\|w\| circle, and both v_in / v_out tips on that circle, captioned "VELOCITY SPACE (SCHEMATIC)". All six screenshots show live, finite values. |
| **M4** *(adapted)* | Drag the green ⌖ aim point across the planet | `b` updates live, the whole trajectory re-aims, and releasing does not snap it back | **PASS.** Verified empirically that a drag on empty space does *not* move `b` (the grab discrimination works), and by code review that the aim branch projects the cursor onto the aim line, writes `S.b`, syncs the slider and calls `reparam()`. Nothing auto-places the aim afterwards, so the choice persists. The positive drag case is code-reviewed rather than driven headlessly, since the marker's screen position is camera-dependent and not exposed; the same `S.b → reparam()` path is exercised empirically by A5 and C2. |
| **M5** *(adapted)* | Leading pass, defaults, play to the end | Δv reads negative, the outgoing orbit is a bound ellipse that falls sunward, and the frame check still reads ≈ 0 | **PASS.** Δv **−8.58 km/s**; `Orbit after: ellipse · a 3.09 AU · e 0.84` (perihelion 0.49 AU — the Parker Solar Probe manoeuvre); `Frame check: \|w\| same to 0.057%`; ε −44.2 → −143.7 MJ/kg. |
| M6 | Read all five `#explain` cards | Second person, present tense, mechanism before formula, none empty | **PASS.** Five cards: *The trick* / *What the probe measures* / *Where you aim* / *Real missions* / *Reading the units*. Each names the mechanism before any formula; formulas appear only as compact scaling relations in `<code>`. A non-specialist can answer "what would the probe measure, and why" from them alone. |

---

## Checks I changed, and the physics justifying it

No band was widened to get green. Two were **tightened**, and one assertion was **corrected**.

1. **B2 — "total-energy drift" replaced by "Jacobi-constant drift" (threshold unchanged at 0.1%).**
   The task text asked the viz to expose a total-energy-drift readout. In the circular restricted
   three-body problem the probe's own specific orbital energy is *genuinely not conserved*: in the
   inertial frame the potential is time-dependent because the planet moves. That non-conservation
   **is** the slingshot — asserting "energy drift < 0.1%" would have been asserting something
   physically false. The integral that *is* conserved is the Jacobi constant
   `C_J = 2ω(x·v_y − y·v_x) − v² + 2(GM☉/r☉ + GM_p/r_p)` (Szebehely, *Theory of Orbits*, 1967, §4).
   The viz prints its spread as `Integrator drift`; the harness asserts the same 0.1% bound.
   Measured **0.0015%**. The readout's tooltip states the distinction on screen.

2. **B1 bands tightened: 3% → 1.5% (heliocentric) and 0.5% → 0.2% (planet frame).**
   Measured 0.81% and 0.052%, both fully deterministic (fixed step, fixed initial condition). The
   remaining 0.81% is the Sun's pull during the ~46-day encounter-sphere traverse — a real
   three-body effect, not integrator error — so the brief's optional 0.5% target is not physically
   attainable for this configuration; 1.5% is the tightest honest band.

3. **The before/after speed readouts are asymptotic values, not raw values at the sphere crossing.**
   The raw planet-relative speed at the measuring radius includes the depth of the planet's well
   there (`2μ/r ≈ 1.3·v∞²` at ¼ R_SOI), which is not what "speed before the flyby" means. The page
   forms the two-body orbital elements at each crossing and reads the incoming and outgoing
   asymptotes off them — standard patched-conic practice, and what makes the closed-form comparison
   meaningful. Without it B1 would compare two different quantities.

Two design choices worth flagging, neither a threshold change:

- **Pass side is the sign of the impact parameter**, one signed slider, rather than a separate
  control — so the aim point on the stage is a single draggable degree of freedom. C2 flips it by
  setting `b = +8` then `b = −8`, everything else fixed.
- **Four tabs** (`trailing` / `leading` / `retro` / `voyager`) rather than a separate `eject` tab.
  With these parameters the trailing pass *already* ejects the probe, and the readout says so
  (`Orbit after: hyperbolic · e 1.09 — unbound`), exactly as Voyager's Jupiter pass did. A separate
  ejection tab would have duplicated an existing one.

## Graceful degradation

Aiming inside the planet is reachable with the sliders. The sim flies the surface-grazing version of
the same approach, meets the surface, and **freezes there**: closest approach 1.00 R_J, planet-frame
impact speed 60.21 km/s (Jupiter's escape speed is 59.5 km/s, so `√(9.0² + 59.5²) = 60.2` ✓), and
every downstream row reads `⚠ impact` rather than an invented "after". The Δv-vs-b plot marks the
whole forbidden band in red. Nothing throws; the readout never shows NaN.
