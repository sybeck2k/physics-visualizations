# SELFCHECK — SOFAR / sound-speed ducting

Target: `TARGET.html` (1285 lines, one self-contained file, no network, runs from `file://`).
Harness: `.claude/skills/verify-physics-viz/verify.mjs` (adapted per SKILL.md §6).

**Verdict: PASS.** Green on **harness run 3 of 8**, with a **mutation sanity check** confirming
the harness is not vacuous.

---

## Step 1 — static checks

| # | Check | Measured | Threshold | Result |
|---|-------|----------|-----------|--------|
| S1 | Single file, no external fetch | 2 grep hits, both `S.src` / `$('src')` inside the script — no URL, CDN, `<link>`, or sibling file | 0 URL references | PASS |
| S2 | Script parses | `node --check` (node:22-slim) printed nothing, exit 0 | exit 0 | PASS |
| S3 | Opens from `file://` | harness loaded it with `waitUntil:'load'` under `--network none` and reached Step 2 | reaches Step 2 | PASS |
| S4 | `"use strict"`, no globals leak | 1 occurrence; body is top-level `const`/`function` only; the only deliberate globals are the verification hooks `window.__ray` / `window.__nray` | ≥ 1 | PASS |

## Step 2/3 — automated harness (15 rows)

| ID | Measured | Threshold | Result |
|----|----------|-----------|--------|
| A1 | 0 errors across all 5 tabs × 8 sliders swept min↔max | 0 pageerror / console.error | PASS |
| A2 | main2d 28.5% · arrivals 4.5% · TL 9.8% ink | main2d ≥ 5%, each plot ≥ 1% | PASS |
| A3 | 1280×800 scrollW 1280/1280; 1440×900 scrollW 1440/1440 | ≤ innerWidth + 2 | PASS |
| A4 | 16 rows in every one of the 5 scenarios, zero NaN/undefined/blank | ≥ 8 rows, 0 bad | PASS |
| A5 | src ✓ rcvd ✓ rng ✓ fan ✓ rate ✓ | label differs min vs max | PASS |
| **B1** *(exact)* | invariant re-derived from the traced polyline chords deviates **0.019 / 0.017 / 0.033%** (θ = 10.3°, 5.3°, 8.1°); turning depths 286 / 710 / 457 m vs the analytic roots of `c(z)=c_s/cosθ₀` — max **0.5 m** apart | < 0.5%; within one 50 m layer | PASS |
| **B2** *(model)* | Munk `c(z)` max err **0.03 m/s**; Arctic `c(z)` max err **0.05 m/s**; traced skip vs `2·R·sinθ_surf` at θ = 8.8/4.4/4.0/9.5° — max err **0.00%** | < 1 m/s; < 3% | PASS |
| **B3** *(cited anchor)* | axis **1300 m**; max ducted **375 km**; the −10.6° ray **marched to 376 km** with **0** surface and **0** bottom hits; Heard Island 1991 + 18 000 km in `#explain` | 900–1400 m; ≥ 300 km | PASS |
| B4 | `Arrivals` = `—` at scrub 0.30/0.50/0.70 (all before the 200.8 s first arrival), identical | identical and `—` | PASS |
| B5 | played **77.0 dB** / 9 arrivals vs scrubbed **77.0 dB** / 9 arrivals — Δ **0.00%** | ΔTL < 10%, same count | PASS |
| **B6** *(magnitude anchor)* | isovelocity **87 dB** @30 km (ref 89.6, Δ**2.6**) · **107 dB** @300 km (ref 110.6, Δ**3.6**) · decade slope **20.0 dB** · duct **77 dB** = **30 dB** better than spherical | within 7 dB; slope 20 ± 4; gain ≥ 15 dB | PASS |
| **C1** *(insight)* | channel on: 9 arrivals, "trapped in the channel — ducted", **375 km**. ε = 0: "not ducted — surface & bottom bounces", **0 km** | ≥ 3 + trapped; not-ducted + ≥ 5× drop | PASS |
| **C2** *(insight)* | shadow @ 300 m: **1** arrival, "shadow zone — ray-starved, 21 dB below the best depth here", TL **102 dB** (finite) → on-axis @ 1300 m: **7** arrivals, TL **84 dB** — **measured gap 18 dB** | finite TL, ≤ 1 vs ≥ 3 arrivals, ≥ 14 dB | PASS |
| C5 | ten-million-fold ✓ · blue whale ✓ · canyon/echo/shout ✓ | one referent per quantity | PASS |
| C6 | 2 caveat lines · 22 readout tooltips · disclosure language present | ≥ 1 / ≥ 3 / present | PASS |

## Mutation sanity check (the harness is not vacuous)

A temp copy of `TARGET.html` with **both** magnitude constants broken —
`10*log10` → `14*log10` in the ray-tube term (line 568) and `BOT_LOSS_DB` 8.0 → 20.0 (line 326):

```
B6  physics  FAIL  isovelocity 123 dB @30 km (ref 89.6, Δ33.4) · 152 dB @300 km (ref 110.6, Δ41.4)
                   · decade slope 29.0 dB · ducted 109 dB = 43 dB better
FAIL — 1 check(s) below threshold: B6            MUTANT EXIT CODE = 1
```

Δ 41.4 dB against a 7 dB band, and the decade slope moves 20.0 → 29.0 against a 20 ± 4 band.
The other 14 rows still pass, which is the point: they are geometries, ratios and timings, and
every one of them cancels a multiplicative error in the spreading law. **B6 is the only row that
pins magnitude**, and it is where a magnitude slip lands.

**Known, deliberate gap:** `BOT_LOSS_DB` is *not* independently anchored by any row. No default
scenario is bottom-limited — the deep-channel fans have zero bottom interactions by construction,
which is exactly what makes them ducted — so a slip in bottom-reflection loss alone would ride
through undetected. It is recorded in SKILL.md §3 rather than papered over; closing it honestly
needs a bottom-limited scenario, which this piece does not have.

## Step 4 — manual observational checks (reasoned against the code)

| ID | Verdict | Evidence in the code |
|----|---------|----------------------|
| M1 | **PASS** | `drawRays()` strokes each traced ray on its own; the duct is whatever those rays leave empty. `drawEnvelope()` is a *separate* dashed overlay behind the `oEnv` checkbox and the axis line behind `oProf` — turn both off and the duct is still visibly there in the rays alone. Nothing draws an asserted duct shape. |
| M2 | **PASS** | `mousedown` picks `pan` when the cursor is not on a glyph or a c(z) handle; `mousemove` shifts `S.pan` by `Δpx / cam.sx`; `wheel` zooms `S.span` about the cursor's world range; `updateCam()` clamps `S.pan` to `[0, xMax−span]` so the view can never leave the section. `dblclick`, `⊙ Center` and every `rng` change refit. |
| M3 | **PASS** | `drawInset()` runs from `draw()`, i.e. every frame, and maps range and depth through **one** scale `sc = W3/6000`, so the angles there are the real angles. Captioned *"1:1 near-source fan (true angles, schematic)"*. Inputs are `S.drawn` (rebuilt by `retrace()`, never empty after the first tab click) and `S.t`; no unguarded division. |
| M4 | **PASS** | Dragging the hydrophone sets `S.rcvd` and `S.ridx` and calls `recomputeEig()`, so `Arrivals`, `Transmission loss`, the arrival train and the TL plot all update inside the drag. On `mouseup`, `retrace()` re-normalises with `xMax = rng·1000/0.8`, putting `RX[RIDX0]` exactly back on the dropped range — it does not snap away. |
| M5 | **PASS** | On `arctic`, `presetC(z) = 1435 + 0.0165 z` increases monotonically, so `ξ·c` only grows downward: every ray turns before the seabed and returns to the surface. Measured: `Max ducted range` 30.9 km with `Duct state` = *not ducted*, every probed ray `nb = 0`, `ns ≥ 2`. The c(z) panel plots `LAYC`, a straight line. |
| M6 | **PASS** | Five `.ex` cards, all non-empty, second person / present tense. Each names the mechanism before any formula (bending toward slow water → `cos θ/c = const`; a minimum traps → `±13°`; multipath → the crescendo). A reader can answer "what would I hear, and why" from cards 2–4 alone. |

---

## Departures and adjustments, with reasons

### A knowing, documented departure from the house style (`CLAUDE.md` §4 / §8.3)

**The main stage is not isotropic.** A trapped ray leans over by at most ~13°, so one cycle is
~50 km long and ~3.7 km deep; at 1:1 a 300 km section is a hairline and the piece teaches nothing.
Every ocean-acoustics ray diagram is drawn with vertical exaggeration and so is this one. It is
disclosed and mitigated rather than hidden:

- the factor is **computed from the live window geometry** (`cam.vex = cam.sy / cam.sx`) and
  printed on the stage every frame — *"VERTICAL EXAGGERATION ×N at this window shape — drawn ray
  angles are steepened; the 1:1 inset is true"*. **It is not a fixed ×22**: ×22 is only its value
  at 1280×800 on the `deepchannel` default. It moves with the window aspect *and* with the range
  slider (the probe measured ×2, ×9, ×11 and ×22 across the five scenarios), which is why both
  the label and the readout print the live value and the wording says "at this window shape";
- it carries its own readout row with a tooltip;
- a `.cav` line in `#explain` card 1 states it in prose;
- the `#inset3d` slot is spent on a **true 1:1 view of the same fan** rather than a decorative
  3-D schematic, so there is still a place in the piece where a drawn angle is a real angle.

### Harness adjustments (no assertion or threshold weakened)

1. **B5 scrubs to `0.98·D`, not `0.95·D`.** The timeline is 200+ s of propagation with every
   arrival in the last ~1% (first arrival 200.84 s, `simDuration` 206.6 s), so `0.95·D = 196 s`
   is *correctly* pre-arrival and would test nothing. The assertion and the 10% tolerance are
   unchanged. B5 compares the **t-dependent** `Transmission loss` (`R.TL = sumTL(arr)`, which
   sums only arrivals whose travel time `S.t` has passed) — an amplitude, not a precomputed
   eigenray time — and arrival-count equality is required on top.
2. **C2's shadow point is the ray-starved water above the trapped fan, not a lateral offset.**
   The geometric shadow this piece teaches is the water outside the fan's turning-point envelope.
   The `shadow` tab places the hydrophone at 300 m at 200 km with a ±14° fan, which yields exactly
   one feeble path and therefore a **finite, measurable** transmission loss; the gap to the axis
   at the same range is computed from two finite numbers (102 − 84 = 18 dB). A missing readout
   row is an explicit FAIL rather than a silent pass.
3. **B1 measures the invariant from the geometry.** The march carries θ derived *from* the
   invariant, so re-reading that angle would be circular. `window.__ray` now returns consecutive
   marched `(x, z)` points and the harness recovers θ from each chord — for a circular arc the
   chord direction is the tangent at the arc's mid-angle, so this is an independent
   re-derivation. Worst deviation rose from 0.002% (circular) to 0.033% (real), still far inside
   the 0.5% band.
4. **B3 now checks the traced extent.** `window.__ray` traces to the full `S.xMax` (376 km, was
   187.5 km), and the row asserts `xEnd ≥ 300 km`, so the printed threshold is the range actually
   marched.
5. **B6 is new** — the magnitude anchor described above.

### Viz changes made to support the above

- `bestListening()` scans a 25 m grid **plus the exact axis and source depths**. The old 50 m
  grid straddled the axis peak and under-read the best achievable loss by ~3 dB, which made the
  "best listening depth" prediction wrong and the shadow-zone comparison marginal.
- A shadow zone is now recognised as **ray-starved**, not only ray-free: at most one path *and*
  ≥ `SHADOW_DB` (14 dB) worse than the best depth at the same range. This is the honest
  definition — a real shadow zone is quiet, not silent — and it is what gives C2 a finite number
  to divide.

### Physics constants and their sources

All named with units in the file. Munk (1974) JASA 55, 220 — `c1 = 1492 m/s`, `ε = 0.00737`,
`B = 1300 m`, `z_ax = 1300 m`; Arctic half-channel `c(z) = 1435 + 0.0165 z`; Thorp (1967) volume
absorption 0.0035 dB/km at ~100 Hz; low-grazing-angle bottom loss 8 dB/bounce; 50 m layers over a
5000 m ocean. `traceRay()` is the single kernel: the drawn fan, the eigenrays, the arrival train,
the transmission-loss curve and the up-front "best listening depth" prediction all come out of
it, so the picture and the numbers cannot drift apart.
