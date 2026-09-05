---
name: verify-physics-viz
description: Acceptance procedure for a standalone physics visualization in this collection — run it before calling one "done". Covers that it renders, that its numbers are physically correct against closed-form and real-world anchors, and that the intended insight is legible on screen. Every check is executable or observable with a stated pass threshold.
---

# verify-physics-viz

A visualization in this collection is **done** only when every check below passes. Each check
is a command to run or a specific thing to look at, plus a number it must hit. Nothing here is
"looks good" — if you cannot state the threshold you did not run the check.

Run this against the file you were asked to finish (referred to below as `TARGET.html`).

---

## 0. Prerequisites

- Docker. Two images (pull once, no network needed afterwards):
  - `node:22-slim` — static checks.
  - `ghcr.io/puppeteer/puppeteer:latest` — the headless-Chromium harness.
- The target is one self-contained `.html` file (see `../../..//CLAUDE.md` for why). If it
  pulls in a second file or a network resource, it fails at Step 1 — stop there.
- Files in this skill directory:
  - `verify.mjs` — the automated harness (Steps 2–3).

---

## 1. Static checks (Step 1)

All four must hold. Commands are copy-paste.

| # | Check | Command | Pass threshold |
|---|-------|---------|----------------|
| S1 | Single file, no external fetch | `grep -nE 'src=|href=|fetch\(|import .*http|<link|<script [^>]*src' TARGET.html \| grep -v 'favicon'` | **0 lines** that reference a URL, CDN, or sibling file (inline `<script>`/`<style>` only) |
| S2 | Script parses | extract everything between the last `<script>`/`</script>` to `/tmp/app.js`, then `docker run --rm -v /tmp:/t node:22-slim node --check /t/app.js` | prints nothing, exit **0** |
| S3 | Opens from `file://` | `verify.mjs` loads `file://…/TARGET.html` with `waitUntil:'load'` and no navigation error | harness reaches Step 2 (a load failure aborts it) |
| S4 | `"use strict"` and no globals leak | `grep -c '"use strict"' TARGET.html` | **≥ 1**; script body is one IIFE or top-level `const`/`function` only |

---

## 2. Automated harness (Step 2)

```sh
S=/tmp/vpz && mkdir -p "$S" && chmod 777 "$S"
cp TARGET.html "$S/target.html" && chmod 666 "$S/target.html"
docker run --rm --network none \
  -v "$S":/work \
  -v "$PWD/.claude/skills/verify-physics-viz/verify.mjs":/home/pptruser/verify.mjs:ro \
  -w /home/pptruser \
  ghcr.io/puppeteer/puppeteer:latest \
  node verify.mjs /work/target.html
```

- `--network none` proves S3/S1 at runtime: if the page needs the network it cannot paint and
  the A-checks fail.
- `-w /home/pptruser` so the bare `import 'puppeteer'` resolves against the image's bundled
  `node_modules` (ESM ignores `NODE_PATH`).
- **Pass = exit 0** and every row prints `PASS`. Any `FAIL` row names the check and prints the
  measured value beside its threshold.
- Runtime is ~3–6 min (each scenario is played in real time until its boom lands).

---

## 3. What the harness checks (Step 3)

Every row is reproducible by hand: open `TARGET.html`, drive the named control, read the named
readout row. The physics constants for the pass bands are stated so they can be re-derived.

### A — rendering (the page works at all)

| ID | Assertion | How | Threshold |
|----|-----------|-----|-----------|
| A1 | No script errors | cycle all 4 tabs, sweep every visible slider min↔max, collect `pageerror` + `console.error` | **0** |
| A2 | Every canvas paints | after a cruise boom, sample `getImageData` on `#main2d`, `#cNwave`, `#cAtten`; count pixels differing from the corner pixel | `#main2d` **≥ 5%** non-background, each plot **≥ 1%** |
| A3 | No horizontal page scroll | at 1280×800 and 1440×900, compare `documentElement.scrollWidth` to `innerWidth` | `scrollWidth ≤ innerWidth + 2` at every size |
| A4 | Readout never breaks | for all 4 scenarios read every `#rdl dt/dd` pair | **≥ 8 rows**, and **zero** values matching `NaN` / `undefined` / `Infinity` / empty |
| A5 | Controls are wired | for each of `mach alt len lat rate`, set slider to min then max, read its `…V` label | label text **differs** between the two ends |

### B — physics (the numbers are right)

| ID | Assertion | Reference | Threshold |
|----|-----------|-----------|-----------|
| B1 | Mach angle is exact | `μ = arcsin(1/M)` at M = 1.5, 2.0, 2.5 (cruise) | error **< 0.2°** |
| B2 | Sound speed follows US Std Atm 1976 | `a = √(1.4·287.05·T)`, `T = 288.15 − 6.5·z(km)` (z<11 km) else 216.65 K, at z = 6, 11, 16 km | error **< 1.5 m/s** |
| B3 | **Calibration anchors** | Concorde ≈ 100 Pa / 2 psf at M2, ~18 km, ~62 m; NASA X-59 ≈ 0.3 psf, ~75 PLdB at its design point | Concorde peak Δp **∈ 67–150 Pa**; X-59 **∈ 0.18–0.42 psf** and **71–79 PLdB** |
| B4 | No phantom pre-arrival signature | accel scenario, scrub timeline to 3 points before any wavefront reaches the observer, read `Peak Δp` | identical at all 3 points **and** `—` |
| B5 | Scrub(t) ≡ play(t) | cruise: play through the boom vs. scrub straight to t = 0.95·D | `Peak Δp` within **10%**, `Perceived` within **2 PLdB** |
| B6 | Booster Mach cut-off geometry | last shocks are made high and near M1, descending ≈ as fast as sound, so they land with the booster | `Boom made at` **∈ 3–25 km**; `Boom vs. touchdown` **within ±20 s** |
| B7 | The N-wave ages | `T_N ∝ r^¼`; move observer from on-track to 35 km lateral (path lengthens) at M2 / 15 km | `T_N` grows **≥ 5%** (i.e. the term is live, not pinned to 1) |
| B8 | Superboom is a distinct amplified U-wave | acceleration focuses the cone into a U-wave 2–5× the plain N | `Boom shape` reads `focused U-wave · ×N` with **N ∈ 1.2–8** |

`B1`–`B3` are the phenomenon-specific core: an **exact** closed-form check, an **atmosphere-
model** check, and at least one **cited real-world anchor**. `B4`/`B5` guard the time model
(discrete wavefronts, scrub-equals-play). A multiplicative slip in an overpressure constant
(e.g. the Carlson calibration factor) fails **B3 alone** — the slope, ratio, geometry and
timing checks all cancel it — so B3 is the one that pins magnitude.

### C — the insight lands (a curious non-specialist would actually see it)

| ID | Assertion | On-screen evidence | Threshold |
|----|-----------|--------------------|-----------|
| C1 | "Faster ⇒ narrower cone" | sample `Mach angle μ` repeatedly through the acceleration run | μ monotone non-increasing (≤ +0.3° noise); first − last **≥ 8°** |
| C2 | "There's a boom carpet with a hard edge" | flat `Peak Δp` at 0 and 0.4× the printed half-width; silent past it; edge at `2.64 × altitude` | centre varies **< 25%**; `Peak Δp` = `—` or `Observer` says outside past the edge; `Carpet ½-width` within **15%** of `2.64·h` |
| C4 | "Shape beats size" (X-59) | `vs. plain N-wave` reduction and `Boom shape` | reduction **≥ 20 PLdB**; shape reads `shaped` |
| C5 | Units are anchored to felt experience | the "Reading the units" card | mentions **windows**, **"twice as loud"** (+10), and a **crack/thud/rumble** — one concrete referent per quantity |
| C6 | The model owns its approximations | `.cav` caveat lines in `#explain`; `title=` tooltips in `#rdl`; hedge words in prose | **≥ 1** caveat, **≥ 3** defining tooltips, and the words `estimate` / `±` / `schematic` / `stylised` appear |

---

## 4. Manual observational checks (Step 4)

The harness cannot judge these. Open `TARGET.html`, do the action, apply the threshold. All
five must pass.

| ID | Action | Pass threshold |
|----|--------|----------------|
| M1 | Cruise M2, watch a few seconds of play | The analytic Mach line lies **tangent to the leading edge of the drawn wavefront circles** — the cone is the visible *envelope*, not a separately-asserted wedge. Gap between line and the outermost circle ≤ ~1 line width. |
| M2 | Drag the sky left/right; double-click | View pans smoothly and recenters. The vehicle and observer stay on the ground line; no clipping of the stage. |
| M3 | Look at the 3D inset during any run | It renders a cone + ground carpet, updates every frame, and is labelled **"schematic"**. It never shows `NaN` or a frozen frame. |
| M4 | Drag the green observer marker along the ground | `Observer → aircraft` distance and the N-wave plot update live; releasing does not snap it back (except the accel focus, which is documented in the tooltip). |
| M5 | Booster scenario, default settings, play to the end | The rocket is drawn **vertical at x = 0**; the boom reads as arriving within seconds of touchdown; `Observer` shows `Mach cut-off` if the observer is placed where refraction kills the boom. |
| M6 | Read all five `#explain` cards | Second person, present tense; each states a mechanism before any formula; no card is empty. A non-specialist can answer "what would I hear, and why" from them alone. |

---

## 5. Verdict

**Done** ⇔ Step 1 all pass **and** `verify.mjs` exits 0 **and** M1–M6 all pass.

If a check fails:

1. Decide **skill wrong** vs **real defect**. A skill is wrong only if the threshold
   contradicts the reference physics or the harness misreads a correct value. Prove it (cite
   the number), fix `verify.mjs` or this table, and re-run — do **not** widen a band to get a
   green.
2. Otherwise it is a real defect in `TARGET.html`. Fix the viz, re-run the whole procedure.

## 6. Applying this to a different visualization in the collection

`A1–A5`, `B4`, `B5`, `C5`, `C6`, `M2`, `M3`, `M6` are generic — keep them as-is. Replace the
phenomenon-specific rows so the new viz still has **all** of:

- **one exact closed-form check** (like B1) — a quantity with a textbook formula, tested to a
  tight absolute tolerance;
- **one model-fidelity check** (like B2) — the viz's governing model reproduced independently
  in `verify.mjs` and compared point-by-point;
- **one cited real-world anchor** (like B3) — a named object or measurement with a source, and
  a band around it that a plausible constant-slip would break;
- **at least two "insight lands" checks** (like C1/C2/C4) — each tied to a specific readout row
  or on-screen value changing in the direction the teaching claims, with a numeric margin.

Name every new check `A#/B#/C#/M#`, give it a threshold in the same table form, and implement
the A/B/C ones in `verify.mjs`.

## 7. Adapted harnesses already in this collection

Each visualization below has its own copy of `verify.mjs`, adapted per §6 (generic `A1–A5`,
`B4`, `B5`, `C5`, `C6` kept at their original assertions and thresholds; phenomenon rows
replaced). This file's own tables above describe `sonic-boom.html`, the reference piece —
they are left as that example, not overwritten per-viz; each piece's own `*.SELFCHECK.md`
carries its adapted check table instead.

| Visualization | Adapted harness | Self-check record |
|---|---|---|
| `sonic-boom.html` | `verify.mjs` (this skill's own copy) | — (the reference piece) |
| `diffraction-grating.html` | `verify-diffraction-grating.mjs` | `../../../diffraction-grating.SELFCHECK.md` |
| `gravitational-slingshot.html` | `verify-gravitational-slingshot.mjs` | `../../../gravitational-slingshot.SELFCHECK.md` |
| `sofar-sound-channel.html` | `verify-sofar-sound-channel.mjs` | `../../../sofar-sound-channel.SELFCHECK.md` |

To run one, swap the harness file in the Step 2 docker command:
`-v "$PWD/.claude/skills/verify-physics-viz/verify-<name>.mjs":/home/pptruser/verify.mjs:ro`.
