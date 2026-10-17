# SELFCHECK — Tesla Roadster · Air & Suction

Deliverable: `tesla-roadster.html` (≈116 KB, one file, no deps, no network, raw WebGL 1, runs from `file://`).
Spec: `tesla-roadster.SPEC.md`. Source data: the 17 Oct 2026 "Science & Demo Data Pack" (cited as §N below).
Harness: `.claude/skills/verify-physics-viz/verify-tesla-roadster.mjs` — **all 28 rows PASS** (exit 0).

Verdict: **PASS**, with the declared deviations and the limits listed at the bottom.

---

## What the piece is

Two tabs, one kernel family each, one sim per run precomputed at a fixed 4 ms step (so Timeline scrub == Play by construction).

1. **Air budget** — cold-gas thrusters on a 600 L tank. `F = ṁ·vₑ`, `ṁ = F/(Isp·g0)`; adiabatic blowdown `p ∝ m^1.4`,
   `T ∝ m^0.4`; real-gas `Z(p)` from CoolProp. Runs: **0–60 launch** (vs ghost cars for the 2017/Performance/Thrust/Rocket claims),
   **hover hop** (down-jets hold a 3 m hop until they cannot carry the car), **barrel roll** (four side jets in flank pods, fired as couples: push, coast, counter-fire; 360°).
2. **Stick to the wall** — fan suction adds load: `μ_eff(N)·N ≥ m·g·sinθ`, `N = m·g·(s + cosθ) (+ v²/R)`. Runs: **wall climb**
   (to 170°, hold, fans off, fall, landing burn), **park & fade** (drag the car along the ramp; fans fade 0.25 g/s),
   **2 g corner** (skid pad vs a fan-less ghost).

One shared kernel per quantity (`tankMass`, `tankBurn`, `thrustAvail`, `simLaunch/Hover/Roll`, `wallState`, `thetaMax`,
`minSuction`, `cornerG`, `simWall`, `simCorner`). The scene, readouts, HUD, plots and predictions all read the same trajectory.

## Step 1 — static checks

| # | Check | Result |
|---|-------|--------|
| S1 | no `src=` / `href=` / `fetch(` / `<link>` / external `<script>` | **0 lines** ✓ |
| S2 | script parses (`node --check` in `node:22-alpine`) | exit 0 ✓ |
| S3 | loads from `file://` with `--network none` | harness runs ✓ |
| S4 | `"use strict"` present | 1 ✓ |

## Step 2–3 — harness

| ID | Threshold | Measured |
|----|-----------|----------|
| A1 | no page errors, stage ≥ 500×250 | 0 errors, 1190×534 |
| A2 | each preset paints ≥12 colours, none > 90 % | 212–270 colours, ≤ 30 % |
| A3 | every preset fills ≥6 readout rows | 7–17 rows |
| A4 | every slider changes label and readouts | 12 / 12 |
| A5 | rows identical after scrub-from-0, scrub-from-end, re-parameterise | identical |
| A6 | no-WebGL fallback shows a message, readouts still populate | `flex`, 13 rows, 0 errors |
| A7 / A8 | sound toggle and whole run raise no error | 0 errors |
| B1 | 600 L: 228 ± 3 kg @379 bar, 250 ± 3 kg @437 bar | 228.4 / 250.0 |
| B2 | blowdown thrust fraction 0.67/0.38/0.14, gas T −12/−51/−105 °C | 0.67/0.38/0.14, −12/−51/−105 |
| B3 | constant-80 kN time to empty 250 kg, Isp 54/60/70.7 | 1.65 / 1.84 / 2.17 s |
| B4 | default launch 0.81 ± 0.03 s, 10–12 m | 0.808 s, 10.7 m |
| B5 | hover thrust 16.7 / 23.0 kN | 16.67 / 23.05 |
| B6 | usable hover at 2,350 kg 3.5–5.5 s | 3.91 s |
| B7 | 4,700 kg readout = 46.1 kN = 2.76 g @1,700 / 2.00 g @2,350 | 46.1 / 2.76 / 2.00 |
| B8 | upside-down holds iff s > 1 g; corner 1.26 g tyres only, 2.2 ± 0.1 g with 2 g | true/false; 1.26 / 2.21 |
| B9 | landing burn from 5.5–7.5 m, 3.3 ± 0.1 g, touch-down < 3 m/s | 6.4 m, 3.30 g, 1.4 m/s |
| B10 | I ≈ 1,020 kg·m²; gentlest 2.0 s roll at 2,350 kg needs 6.4 kN·m; the push-coast-brake pulse needs 1.3–1.8× that | 1020, 6.41, 9.34 |
| B11 | kick-flip apex 7 ± 0.6 m, lands after 360° | 7.3 m, 360° |
| B12 | min suction to reach 170° slightly > 1 g; fails at 110–140° at 1 g | 1.03 g; 124° |
| B13 | side jets fire push couple → none while coasting → opposite couple; ends at 360° | true / true / true, ω 231 °/s, 360° |
| C1–C7 | prediction up front, headline value per preset, confidence chips, 5 cards + caveat, 4,700 kg toggle, gauge drag, orbit/recentre | all met (63/78 rows chipped) |

Numbers that match the reported demo *without being fitted to it*: the landing burn (3.3 g from ≈6.4 m vs reported ≈6.5 m),
the kick-flip apex (7.3 m vs ≈7 m), gentlest-roll torque and inertia (6.4 kN·m, 1,020 kg·m²), blowdown table, hover-time band.

## What is fitted or assumed (also printed in the piece, with chips)

- **Valve opening 49 %** is fitted so the default run lands on Tesla's live 0.81 s (`ASM`). Tesla published no thrust-vs-time.
- **Tyre load-sensitivity exponent 0.49** is fitted so 2 g of suction gives ≈2.2 g of cornering (Tesla: ">2 g"). Without it 3.78 g.
- **Down-jet thrust** (hover, landing burn) is assumed to share the 4 × 20 kN·(p/379 bar) scale of the rear nozzles. **Side roll-jet thrust** (8 kN each at 379 bar, pods 1.05 m off the centreline, push for 22 % of the roll time) is assumed; the report says only that attitude jets exist.
- Valve spin-up 0.1 s, rear-tyre load share 0.55, tyre/torque force cap 36 kN, drag area 0.57 m² are assumptions (`ASM`/`EST`).
- Thrust ∝ tank pressure and `ṁ = F/(Isp·g0)` is the data pack's own simplification (§4c), not a nozzle model.

## Declared deviations from `CLAUDE.md` §8 (see its new §9)

(3) true-scale WebGL 3-D stage instead of an isotropic 2-D canvas, so the secondary inset is a 2-D air-system schematic;
(4) 8-bit synthwave in-scene look instead of the house palette; UI chrome, plots, readouts and cards keep the house roles.

## Limits of this check

- Verified in headless Chromium with **software GL (SwiftShader)**, not on a real GPU. Frame rate on real hardware was not measured.
- Narrow layouts (< 1100 px) hide the inset and shrink the readouts; checked by eye at 900×720 only.
- Sound is synthesised and wired (no errors) but was not *listened to*.
- The wall sim is quasi-static for the climb and a point-mass fall afterwards; it does not model suction ramp-up, tyre slip angle,
  or the real ramp's profile (arc radius 10.6 m is chosen so 170° sits ≈21 m up, per the reported telemetry).
