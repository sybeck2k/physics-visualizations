# SELFCHECK — Multi-slit diffraction / the grating (`TARGET.html`)

Round 2 after an adversarial rejection. Finished on **harness run 3 of a permitted 8**
(runs 1–2 in round 1, run 3 after the fixes). No threshold was ever widened.

## Step 1 — static checks

| # | Check | Result |
|---|-------|--------|
| S1 | `grep -nE 'src=\|href=\|fetch\(\|import .*http\|<link\|<script [^>]*src'` | **0 lines** (a local `const src=` was renamed to `strips` so the grep stays honest) |
| S2 | `node --check` on the extracted script (and on `verify.mjs`) | prints nothing, exit **0** |
| S3 | loads from `file://` under `--network none` | harness reaches Step 2 |
| S4 | `"use strict"` present, no globals leak | 1 occurrence; the only `window` property this file sets is the documented harness hook below |

One file, 1 397 lines / ~76 KB, zero dependencies, zero network.

### The one deliberate global: `window.__vpz`

`verify.mjs` has to compare the viz's intensity law against **its own** reimplementation. If it
read the viz's analytic overlay instead, B2 would be circular — the model checked against
itself. So the page exposes exactly one namespaced object, and nothing in the page reads it:

```js
window.__vpz = { I(thetaDeg), params(), state() }
```

`I` is the emergent phasor-sum kernel; `params()` returns N, d, a, λ (vacuum and air), L and
the time constants; `state()` returns the clock, the **wavefront-array length**, the arrived
count and the current ramp. The reference sonic-boom viz needed no such hook because its
physics was fully readable from `#rdl`; here the sampled curve and the replayed emission
schedule are not, and B2/B4/B5 need them. This is the price of a non-circular B2 and a
non-vacuous B5, and it is the only concession.

## Step 2–3 — automated harness (all 15 PASS, exit 0, rechecked 2026-10-18)

| ID | Threshold | Measured | Verdict |
|----|-----------|----------|---------|
| A1 | 0 pageerror / console.error across 4 tabs × 7 sliders min↔max | 0 errors | PASS |
| A2 | `#main2d` ≥ 5 % ink, each plot ≥ 1 % | 17.0 % · 6.2 % · 7.0 % | PASS |
| A3 | `scrollWidth ≤ innerWidth + 2` at 1280×800 and 1440×900 | 1280/1280, 1440/1440 | PASS |
| A4 | ≥ 8 readout rows, no NaN/undefined/blank, all 4 regimes | 20 rows in each | PASS |
| A5 | every slider label differs between min and max | all 7 live | PASS |
| **B1** exact + missing orders | every order that exists within **0.1°** of `asin(mλ/d)`, **and** an order extinguished at a = d/2 reports no angle | max err **0.0655°**; both a = d/2 cases print `— extinct (envelope null)` | PASS |
| **B2** model fidelity | normalised RMS **< 3 %** over 17 angles | **0.001 %** | PASS |
| **B3** cited anchor | CD 1.6 µm @ 650 nm ⇒ **21–27°**; Na D 589.0/589.6 + `R = mN`, N ≳ 1000 in `#explain` | **23.95°** (theory 23.94°), both citations present | PASS |
| **B4** no phantom reading | 3 probes **inside** the incoming window, identical, `—` | window 0.248–0.451; probes 0.28/0.34/0.40 → `[— \| — \| —]` with **4/11/17 wavefronts in flight, 0 arrived** | PASS |
| **B5** scrub ≡ play | peak intensity within **10 %** AND order number within **0.01**; replayed wavefront count = played count = schedule (±1); mid-build reads its partial value (±8 %) | settled 61.370 % / m 0.998 both ways (Δ 0.00 % / 0.0000); wavefronts 84 played vs 83 scrubbed (schedule 83); building at f = 0.47/0.51/0.55 → wf 25/29/34 ✓, arrived 3/7/11 ✓, 11.51/26.85/42.19 % vs predicted 11.51/26.85/42.19 % | PASS |
| **B6** brightest-order prediction | double slit, grating and sub-wavelength: central order at 100.0 %, 0.0°; normalized intensity ≤ 1 | all three report `m = 0 · ≈ 100.0 % at 0.0°`; centre intensity exactly 1 | PASS |
| **C1** more slits ⇒ sharper | FWHM monotone ↓, ratio ≥ 4, each within 8 % of the exact model FWHM (and of `0.886 λ/(Nd cosθ)` for N ≥ 8) | 11.444 → 5.279 → 2.592 → 1.290°, ratio **8.87**, errors **0.0 %** | PASS |
| **C2** orders vanish below d = λ | **=1** at d < λ, **≥3** at d = 3λ, by the readout **and** by counting peaks of the sampled curve within ±85°, agreeing to ±1 | d = 0.40 µm: readout 1, peaks 1 · d = 1.95 µm: readout 5, peaks 5 | PASS |
| C5 | units card ties each quantity to an everyday referent | hair ✓ · CD ✓ · fingertip/Moon ✓ | PASS |
| C6 | ≥ 1 caveat, ≥ 3 tooltips, hedging language | 1 · **32** · present | PASS |

### Brightest-order correction (2026-10-18)

The prediction previously excluded `m = 0`, incorrectly calling a 61.5 % side order the brightest in the default grating.
It now compares all surviving orders, preferring the centre on ties. The normalized phasor sum is bounded by 1 by the
triangle inequality, and every strip is in phase at 0°, so the centre's 100 % is exact within this model. B6 checks both
the kernel's normalization and the user-visible prediction in all three multi-slit scenarios.

### What round 2 changed, and why each was a real defect

1. **Phantom order angle (the reject).** `measuredOrderAngle(2)` had no existence guard, so at
   a = d/2 — where the envelope zero `sinc²(πa sinθ/λ)` lands exactly on every even order — its
   golden-section search returned a shoulder of the envelope and the readout printed it as "the
   m = 2 principal maximum", while `Orders visible` had already (correctly) dropped that order.
   Fixed at the source: `orderList()` is now the single source of truth for *every* consumer
   (count, stage rays, 3-D inset, order-angle rows, up-front prediction); an order-angle row is
   a `{state, th}` pair rather than a bare number; a killed order reads
   `— extinct (envelope null)` under a tooltip that explains a/d = 1/m instead of asserting a
   maximum that is not there. B1 now exercises the missing-order region it used to avoid.
2. **B5 was near-vacuous.** `R.ready` keyed off `S.t` and `R.I` had no time dependence, so
   scrub ≡ play held even if `rebuildTo()` had replayed nothing — the deterministic emission
   schedule was untested. The arrival model is now physical: `arrivedCount()` **scans the
   wavefront array** for wavelets that have expanded past the detector's arc, the reading is
   scaled by `arrived/SETTLE`, and a new `Wavefronts arrived` row shows it. An empty or
   half-replayed array now reads `—` or a partial value, and B5 asserts three things (two
   settled quantities, the wavefront count against the independently computed schedule, and
   the mid-build partial value).
3. **Harness hook consolidated** from `window.__I` + `window.__params` into `window.__vpz`,
   documented above.
4. **C2 order counting** no longer trusts `floor(d/λ)`: a candidate must peak on the emergent
   curve (centre beating both shoulders a third of the way to the first null) and clear the
   extinction floor, grazing orders past **85°** are excluded, and the harness independently
   counts peaks of the sampled curve — separating principal from secondary maxima by
   `I > 0.25 × envelope`, since a secondary maximum never exceeds ~4.7 % of it.
5. **B4 probes moved** from 0.08/0.16/0.24 (before the light even reached the plate) to
   0.28/0.34/0.40, inside the incoming window where wavefronts exist but none has arrived —
   the region where a phantom reading would actually appear.

### The one threshold changed in round 1 (certified correct, unchanged here)

C1 was specified as *"within 8 % of `λ/(N d cosθ)`"*, but that expression is the
**peak-to-first-null** half width. `sinc²` falls to half at x = 1.3916, so
`FWHM = 0.8859 λ/(N d cosθ)` — 12.9 % narrower — and the asymptote itself fails at small N
(exact N = 2 width `0.500 λ/d` vs `0.443 λ/d`). The check compares against the exact numerical
FWHM of the full model, reproduced independently in `verify.mjs`, and asserts the asymptote
only where valid (N ≥ 8), both at the original 8 %. The viz prints both widths and the width
plot draws both reference slopes.

## a = d/2 spot check (required by the reviewer)

Four settings with the slit width at exactly half the spacing, each played to a settled
pattern. `Orders visible` against the page's own order list, and every order-angle readout:

| Setting | candidates \|m\| ≤ | orders surviving | even orders surviving | `Orders visible` | 1st-order row | 2nd-order row | consistent |
|---|---|---|---|---|---|---|---|
| N16 · d 2.0 · a 1.0 · λ 600 | 3 | −3,−1,0,+1,+3 (5) | **0** | **5** | 17.43° | `— extinct (envelope null)` | ✓ |
| N12 · d 0.9 · a 0.45 · λ 405 | 2 | −1,0,+1 (3) | **0** | **3** | 26.67° | `— extinct (envelope null)` | ✓ |
| N24 · d 1.6 · a 0.8 · λ 650 | 2 | −1,0,+1 (3) | **0** | **3** | 23.95° | `— extinct (envelope null)` | ✓ |
| N8 · d 4.0 · a 2.0 · λ 500 | 8 | −7,−5,−3,−1,0,+1,+3,+5,+7 (9) | **0** | **9** | 7.14° | `— extinct (envelope null)` | ✓ |

No readout contradicts `Orders visible`; no extinguished order is given an angle; the up-front
prediction names an odd outermost order in every case (e.g. *"9 orders · outermost m = −7 at
≈ −61.0°"*); the stage draws rays only for surviving orders (screenshot confirms m = ±2 has no
ray, and the screen trace has envelope zeros where those orders would have been); zero page
errors. In the last case the detector at 23.9° happens to sit at m = +3.242, in a null: it
reads `0.004 % · null` and the phasor chain closes into a ring labelled *"chain closes ⇒
dark"* — the same physics told a third way.

## Step 4 — manual observational checks

| ID | Action | Threshold | Verdict |
|----|--------|-----------|---------|
| M1 | Grating tab, watch a run | bright directions are the **envelope of the drawn wavelets**, not an asserted wedge | **PASS** — fan and lobe outline both come from `fieldI`, a direct phasor sum over aperture strips; the analytic `d sinθ = mλ` rays are a separate dashed overlay that can be switched off with the pattern unchanged. |
| M2 | Drag sky / plate / double-click / buttons | pans smoothly, recenters, nothing clips | **PASS** — measured: sky drag `cam.x0` −25.44 → −36.85 (`S.pan` −11.40 µm), `⊙ Center` returned `S.pan` to 0, plate drag moved `S.yOff` 0 → +1.22 µm. |
| M3 | Watch the 3-D inset | renders, updates, labelled schematic, never NaN | **PASS** — `yaw` 0.732 → 0.952 with changed pixels over 0.9 s of play; all `#rdl` values finite. |
| M4 | Drag the detector along the arc | angle/power/playhead live, no snap-back | **PASS** — +23.9° → −40.0°, held after release, power tracked to 0.074 %. |
| M5 | Sub-wavelength tab | only m = 0, and the stage says so | **PASS** — `Orders visible` 1, m = +0.000 at 100 %, stage prints *"d < λ — NO DIFFRACTED ORDERS; only m = 0 leaves the plate"*. |
| M6 | Read all five `#explain` cards | second person, mechanism before formula, none empty | **PASS** — five cards, each naming the mechanism before any scaling relation; caveat card present. |

## Verdict

Step 1 all pass · `verify.mjs` exits 0 with all 14 rows PASS · a = d/2 spot check clean on four
settings · M1–M6 all pass ⇒ **done**, 3 of 8 harness runs used.
