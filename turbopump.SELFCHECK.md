# SELFCHECK — Rocket turbopump (`turbopump.html`)

One file, ~1.1k lines, zero dependencies, zero network, strict mode, viewport meta. Written with the
phone Experiment presentation from the start (CLAUDE.md §10).

## What is real and what is not

| Quantity | Status | Source |
|---|---|---|
| F-1 pump speed 5,500 rpm; flows 24,811 gal/min LOX, 15,471 gal/min RP-1; 41 MW for both pumps | REPORTED | Wikipedia (F-1), enginehistory.org *One Second in the Life of the F-1* |
| SSME fuel pump ~37,000 rpm, three stages, ~70,000 hp; inlet boosted to ~276 psia | REPORTED | NASA shuttle trivia sheet; secondary sources for the horsepower |
| Pump discharge pressures (F-1 9.7 / 13.2 MPa, SSME 41 MPa) | ESTIMATE, **derived** | Not found in the sources searched; chosen so flow × rise ÷ efficiency reproduces the reported power |
| Raptor: speed, stages, discharge, mass flow | ESTIMATE / DERIVED | Only chamber pressure, thrust and mixture ratio are published; the rest is scaled by the same kernel |
| Liquid densities and vapour pressures | REFERENCE | boiling-point properties |
| η_h = 0.85, slip (Wiesner, 7 blades), φ = 0.15, β₂ = 25°, cavitation coefficients, tip-speed ceiling 700 m/s | ASSUMED / ESTIMATE | the ceiling is fit so the SSME comes out at its 3 stages |

## Step 1 — static checks
Standalone parse, `"use strict"`, no external dependency: **pass** (also asserted by `verify-turbopump-mobile.mjs` P1).

## Step 2 — desktop harness `verify-turbopump.mjs`: 17 / 17 PASS
A1–A5 render (0 errors, every canvas paints, no overflow, ≥ 20 readout rows on all five tabs, sliders wired);
B1 Euler head and Δp re-derived independently at 15 operating points; B2 head identical across four liquids, Δp ∝ ρ;
B3 anchors (F-1 40.1 MW vs reported 41; SSME 53.4 MW vs ~52; stages 1/1/3/1; tip speeds 140/194/666/547 m/s);
B4 cavitation onset by independent bisection, both pumps within 0.001%, the flag flips across ±3%;
B5 no measured rise before the drop leaves the last diffuser, end equals the prediction;
B6 play == scrub; B7 each stage ends exactly one stage-rise above its start, pressure monotone after the inducer;
C1 four liquids, same head, pressure in the ratio of the densities; C2 hydrogen needs 3 stages, oxygen 1;
C3 cutting the tank pressure makes it cavitate; C5 units anchors; C6 caveats, tooltips and confidence chips.

Note on B1: it re-derives the *equations* from first principles, so it guards against wiring and rounding errors,
not against a wrong model. The model is checked against reality only at the anchors in B3, and those are as good
as the reported numbers.

## Step 3 — phone harness `verify-turbopump-mobile.mjs`: P1–P10 PASS
Four portrait sizes fit (stage ≥ 120 px, plot ≥ 100 px, casing and knob on the stage); all five pumps preserve state
across Experiment ⇄ Full lab; **Keep run** survives sliding the density from oxygen to hydrogen, is drawn, and the
strip reports both rises; real touch drag turns the knob and pans; the sheet pauses, exposes controls / measures /
prose and restores the original nodes; rotation keeps the mode; desktop knob drag, pan and inset unchanged;
collection phone menu opens the piece; zero errors, zero network requests.

## Known limits
- 1-D meanline: one velocity triangle per stage, no volute, no leakage, no 3-D or viscous flow. ±30% or worse.
- The flow is held at the engine's design value; in a real engine speed and flow are coupled through the system curve.
- Vapour pressure stays that of the tab's liquid when you change the density slider.
