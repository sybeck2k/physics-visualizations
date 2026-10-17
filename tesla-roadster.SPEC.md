# Spec — `tesla-roadster.html` (3D, raw WebGL) for `/home/ubuntu/sonic-boom-viz`

## Context

The collection (`sonic-boom-viz/`) holds standalone physics visualizations built to the house style in `CLAUDE.md`: one self-contained `.html`, zero dependencies, no network, dark instrument panel, 2D canvas, real constants, one shared physics kernel, Play + Timeline where scrubbing == playing, an up-front prediction, five explainer cards.

The user wants a **3D**, "really cool" piece about the 2nd-gen Tesla Roadster (revealed 15 Oct 2026), built from the data pack `~/.claude/uploads/.../4cf1f0df-tesla-roadster-spec.md` (cited below as §N). Decisions made with the user:

- **Tech:** raw WebGL, hand-written shaders/matrices/camera, no library, one file, `file://`-safe.
- **Content:** two tabs, **"Air budget"** (thrusters) and **"Stick to the wall"** (fan suction).

Deliverables: `tesla-roadster.html`, `tesla-roadster.SELFCHECK.md`, a `verify-tesla-roadster.mjs` in `.claude/skills/verify-physics-viz/`, and registering the piece in `build-index.mjs` (then regenerate `index.html`).

## The two insights (one per tab)

1. **Air budget — "the rocket is a 2-second battery."** 250 kg of cold air makes 80 kN, which is ~4× what the tyres can transmit, but blowdown halves thrust in ~0.5 s and hover costs ~24–39 kg/s. So it launches, hops and flips; it cannot fly. Drag tank pressure / Isp / mass and watch 0-60, hover time and the "claims" ghost-race move.
2. **Stick to the wall — "grip is bought with air, not rubber."** Tyres alone give 1.26 g; fans pull the car onto the surface at up to 2 g, so friction capacity = μ·(mg·cosθ + F_suction). Upside-down needs only suction > 1 g of the car's weight. The wall-climb to 170° and the 2 g corner fall out of one inequality.

## Visual and "cool" design (what makes it a wow, not a diagram)

- **Procedural car, no assets.** Body lofted from a small table of cross-section stations (coarse, per the art direction below) (SR-71/F-35 wedge, hidden headlights, full-width glowing tail bar, "Ano White" paint), Fresnel rim light + environment gradient reflection, 4 wheels with procedural spokes. Transparent X-ray toggle reveals the **COPV tanks (200 L + 400 L spheres/cylinders), 4 fans, 4 rear + 6 attitude nozzles** inside the body.
- **Cold-gas plume.** CPU-simulated additive point-sprite particles (cap ~20k, quality toggle). Supersonic core with visible **Mach diamonds** in the first metres, then expansion into white condensation fog (exit T ~54 K → vapour). Particle position is a **pure function of (emit time, index, seeded PRNG)** — no stored state — so scrubbing and playing agree (CLAUDE.md §5).
- **Frosting COPVs.** Tank colour/frost shader driven by the blowdown gas temperature (20 → −12 → −51 → −105 °C from §4c); gauge needle falls with pressure.
- **Post-processing.** See the 8-bit synthwave art direction below (low-res FBO, palette quantize + dither, bloom, CRT).
- **Camera as director.** Orbit (drag), zoom (wheel), plus buttons: `Chase`, `Pad low-angle`, `Top`, `Free`. In `Chase` the camera follows and eases out as the run ends. Time-rate slider goes down to 0.05× for slow-mo; short motion-trail ribbons behind the car.
- **Ghost race (Tab 1 headline).** Translucent ghost cars on parallel lanes with finish ticks at 60 mph for each claim: 2017 Roadster 1.9 s, Performance 1.6 s, Thrust 0.9 s, **live 0.81 s**, Rocket 0.59 s (§5a, §8). Distances to 60 mph painted on the ground (21.5 / 12.1 / 10.9 / 7.9 m). Instantly felt.
- **Force arrows in 3D** (weight, suction, normal, friction, thrust) scaled by one legend (arrow length = N per metre, printed), colour by role: amber thrust, cyan fan suction, green friction/OK, red limit exceeded.
- **Underbody airflow (Tab 2).** Streamline particles pulled from the ground edge into the skirt, plus a pressure-deficit heat patch on the underbody and a ground-contact pad.
- **Optional WebAudio** (default off, button `♪`): synthesized noise hiss scaled by ṁ, fan whine scaled by suction. Zero assets.
- Palette follows `CLAUDE.md` §2 for the UI chrome (cyan interactive, amber phenomenon, green OK/observer, red warning). Mono for all labels. One word of the `h1` in accent: `TESLA <span>ROADSTER</span>`.

### Art direction: 8-bit synthwave (user direction, overrides the smooth-render look above)

The 3D scene is rendered **low-res and chunky**, like a 16-bit arcade racer, while the physics stays true-scale.

- **Low-res render target:** scene drawn into an offscreen FBO at fixed ~384×216 (adapts to aspect, integer upscale), shown with `NEAREST` filtering so pixels are crisp. A "pixel size" rail control (1×/2×/3×/4×) trades retro for detail.
- **Limited palette + dither:** final pass quantizes to a ~32-colour synthwave ramp (deep indigo → purple → magenta → hot pink → orange → yellow, with cyan and white accents) using an ordered 4×4 Bayer dither. Palette is a `const` table so it can be swapped.
- **Flat-shaded low-poly car:** the lofted body is coarse (≈10 stations × 8 points), hard-edged facets, 3-step cel shading, chrome-edge outline pass, neon pink/cyan tail bar and underglow. Wheels are 8-gon cylinders. Reads as a sprite-era wedge, not a render.
- **The world:** infinite neon wireframe grid floor scrolling with speed (magenta/cyan lines receding to a horizon), a huge striped retro sun (horizontal slices cut out, banded orange→pink gradient) behind the pad, a starfield with parallax, jagged low-poly mountain silhouettes, the McGregor test tower and the ramp as glowing wireframe-with-dark-fill geometry. Ground lane for the ghost cars drawn as separate neon strips.
- **Plume as pixels:** particles become square 1–3 px sprites snapped to the low-res grid, colour-ramped white → cyan → magenta → purple as the gas cools; Mach diamonds are bright blocky beads. Condensation fog is dithered, not blended.
- **Neon glow:** the bloom pass is retained but runs on the low-res buffer, giving the chunky halo of CRT neon. Tail bar, grid and sun pulse gently to a beat-free idle.
- **CRT finish (toggle, default on):** scanlines, slight barrel curvature, RGB mask / chromatic aberration at the edges, vignette. Scanlines are a cheap full-screen fragment shader; disable via `CRT` checkbox.
- **In-scene text** (`0.81 S`, `3.4 G`, `SOUND BARRIER`-style event shouts like `AIR TANK EMPTY`, `UPSIDE DOWN HOLD`) drawn with a tiny hard-coded **5×7 bitmap font** table (no font file) in the low-res buffer, so it pixelates with the world. UI chrome stays in the house `--mono`, uppercased with letter-spacing, so panels still read cleanly.
- **HUD:** arcade-style bars in the stage corners — a segmented "AIR" tank bar (chunky blocks that blank out as the tank drains, flashing red < 15 %), a segmented "GRIP" meter in Tab 2, a big pixel timer. Title card on load: `TESLA ROADSTER` in a pixel logo with a chrome-gradient and a "PRESS PLAY" blink.
- **Optional chiptune + SFX** (`♪`, default off, WebAudio synthesised, no assets): square/triangle arpeggio loop in a minor key at 100 BPM, noise-burst for thrust scaled by ṁ, falling pitch as the tank empties (the audio literally shows blowdown), fan whine scaled by suction.
- Cost note: this lowers GPU load (tiny render target) and shrinks the geometry table, so target size drops to ≤ ~120 KB.

## Layout (reuses the house grammar, with the 3D adaptations)

`#app` flex column: `header` (h1 + 2 tabs) / `main` (grid `250px 1fr`: `aside` + `#stagewrap`) / `#explain` (5 cards).

- **`#stage`** = full-bleed `<canvas id="gl">` (WebGL, metric world, **isotropic — no exaggeration**; every angle is the real angle). Floating top-right: `#inset` (2-D schematic of the air system: 200 L + 400 L COPVs → valves → 4 rear + 6 attitude nozzles, lights up live and shows tank pressure/temperature; captioned `(schematic)`) and `#readouts` (`<dl>` with `title=` tooltips).
- **Confidence chips** on every readout row: `OFFICIAL / INTERVIEW / REPORTED / DERIVED / ESTIMATE / ASSUMED`, coloured and explained in a tooltip. This is the piece's honesty device and its differentiator.
- **`#plots`** (168 px, two 2-D canvases, each with a `.cap`):
  - Tab 1 — lived signal: **occupant g-trace** `a(t)/g0` with thrust F(t) overlaid; relationship: **0-60 time (or hover time) vs tank pressure**, horizontal reference lines for the claims, current point marked.
  - Tab 2 — lived signal: **friction margin vs pitch angle θ** along the ramp (available vs required), sliding red when it goes negative; relationship: **max holdable angle / cornering g vs suction g**, with the "tyres only 1.26 g" line.
- **Direct manipulation** (CLAUDE.md §6 "observer"): Tab 1 — drag the **tank-pressure needle** on the 3D gauge and the ghost-lane finish markers; Tab 2 — **drag the car up/down the ramp** to set θ. Orbit camera on empty-space drag, double-click recenters.
- **Presets inside tabs** (a small segmented control in the rail, each re-keys sliders then `resetSim`):
  - Tab 1: `0–60 launch` · `Hover hop` · `Kickflip / barrel roll`
  - Tab 2: `Wall climb` · `Upside-down stand-still` · `2 g corner`

## Physics kernels (one each, shared by sim, prediction and plots)

All constants named with units; values from §9 JSON. Every fudge factor carries a comment naming the datum it is fit to.

### Kernel A — `airBudget(p0, V, Isp, m)` (Tab 1)
- Real-gas Z table (keyframe lookup `keyf`): Z = 1.00 @1 bar, ~0.99 @100 bar, 1.182 @379, 1.221 @414, 1.251 @441, 1.542 @689. High-pressure points are back-computed from §4b densities (381/403/419/531 kg/m³); **generate/verify low-pressure points with CoolProp inside a python container, do not trust memory**. Check: 600 L @379 bar → 228 kg, @437 bar → 250 kg (§4b).
- Blowdown (adiabatic, ideal-gas scaling §4c): `p ∝ m_gas^γ`, `T ∝ m_gas^(γ−1)`, γ = 1.4. Thrust `F = F_ref·(p/p_ref)` with `F_ref = 80 kN @ 379 bar` (four rear nozzles, 20 kN each, §4c). Mass flow `ṁ = F/(Isp·g0)`; Isp slider 54–70.7 s (realistic vs ideal).
- Integrate with a fixed step `h ≤ 0.005 s` (deterministic; scrub replays from 0 — `rebuildTo(t)`).
- Outputs: `F(t)`, `ṁ(t)`, `p(t)`, `T(t)`, remaining air; checks that must reproduce the §4c table (thrust fraction 67/38/14 % at 75/50/25 % air) and the constant-thrust bounds (1.65–2.17 s to empty 250 kg at 80 kN).
- **Launch:** 1-D longitudinal, `m·a = F_thrust + F_motor,tyre-limited`; tyre force = μ_eff·N_rear with fan downforce included. Calibrate the thrust ramp-up so the **default preset lands on the live 0.81 s / ≈11 m**. Prediction shown before Play: `≈ 0.8 s to 60 mph, ≈ 11 m`.
- **Hover hop:** vertical thrust from the four wheel-behind downward nozzles; controller holds `T = m·g` (16.7 kN @ 1,700 kg, 23.0 kN @ 2,350 kg) while blowdown allows, then the car sinks. Prediction: `usable hover ≈ 4–5 s @ 2,350 kg` (§6), printed with `≈`. Note the per-nozzle thrust of the downward jets is **ASSUMED** (report gives none).
- **Kickflip / roll:** `I = (1/12) m (w²+h²)`, `α = 4θ/T²`, `τ = Iα` (§6); readout of required side-thrust for 2.0/1.5/1.0 s roll and flag red when the nose/side nozzles (assumed, not published) can't supply it. Apex ≈ 7 m and 3.3 g @ 6.5 m braking are the **reported telemetry anchors**; compare sim vs anchor in readouts.

### Kernel B — `holdLimit(θ, s_g, μ0, m)` (Tab 2)
- Surface at pitch θ (0° road → 170° ramp top). Normal load `N = m·g·cosθ + F_s`, `F_s = s·m·g` (suction in g of own weight). Friction capacity `μ_eff(N)·N` with load sensitivity `μ_eff = μ0·(N/(m g))^(−n)` — **n fit so that s = 2 g gives ≈ 2.2 g cornering (Tesla: ">2 g")**, and s = 0 gives 1.26 g (Moravy). Without that fit the naïve result is 3.78 g; show the naïve value in the tooltip as the upper bound.
- Static hold test: `μ_eff·N ≥ m g sinθ` → `θ_max(s)`. Upside-down (θ = 180°) holds iff `s > 1 g` — the key reveal. Driven climb adds motor thrust along the surface.
- **Mass/downforce conflict toggle** (§5b, §10.9): the on-screen 4,700 kg readout = 46.1 kN = 2.76 g at 1,700 kg but exactly 2.0 g at 2,350 kg. Rail checkbox `Use 2,350 kg reading`; both numbers visible so the user sees the contradiction instead of a hidden choice.
- Fan power: 4 fans × ~20 kW = 80 kW (§3a, INTERVIEW); any suction-work figure beyond that is tagged ESTIMATE. Fan mode switch `Low-speed (suck down)` / `High-speed (open front & rear)`.

## Controls (rail; 2–4 sliders per preset, each with a felt consequence)

| Slider | Range | Tab |
|---|---|---|
| Tank pressure (bar / psi) | 200–689 (437 = 250 kg; 379 = screen readout; 689 = COPV capacity) | 1 |
| Isp (s) | 54–70.7 | 1 |
| Car mass (kg) | 1,700–2,350 | 1, 2 |
| Throttle / burn duration | preset-dependent | 1 |
| Suction (g) | 0–2 (marks at 1 g and 2 g) | 2 |
| Surface pitch θ (°) | 0–170 | 2 |
| Tyre grip μ | 0.8–1.4, default 1.26 | 2 |

Plus: Play/Pause, Restart, Time rate 0.05–5×, **Timeline scrubber** (`simDuration()` sized so the payoff fits, `play(to t) == scrub(to t)`), overlay checkboxes (forces, plume, streamlines, X-ray, ghosts, gauge), camera buttons, `♪` sound.

## Explainer cards (tone per `CLAUDE.md` §7)

Per tab, five `.ex` cards:
1. **What you're looking at** – second person, present tense.
2. **The one equation** – Tab 1: `F = ṁ·v_e` and why Isp ~60 s; Tab 2: `μ·(mg·cosθ + F_s) ≥ mg·sinθ`.
3. **Why it can't last / why it sticks** – blowdown halves thrust in ~0.5 s; upside-down needs >1 g suction.
4. **Reading the units** – 80 kN ≈ 8.2 tonnes of force; 250 kg of air ≈ three adults; 3.4 g ≈ a launch-coaster; 1.26 g tyre grip vs 2 g suction.
5. **Caveats and conflicts** (`<p class="cav">`): estimates ±~2×; thrust-vs-time and nozzle geometry unpublished; Tesla says air, MotorTrend says nitrogen; 5,500 psi screen (228 kg) vs 250 kg (needs 6,338 psi); mass 1,700 vs 2,350 kg; 0-60 timing convention unspecified; production 2028 is a claim. Link each to the §10 numbered conflict. Not affiliated with Tesla.

## Robustness and non-negotiables check

- `"use strict"`, banner-comment sections in the house order: constants → medium model (air Z table) → helpers → scenarios → state `S` → kernels → `resetSim` → step → GL setup (shaders, buffers, FBOs) → `draw` per layer → `updateReadouts` → rAF `loop` (dt clamp 0.05, substep ≤ 0.02) → UI wiring → `go`.
- Never throws: all `clamp`, `|| 1`, `Math.max(x, 1e-4)`. **WebGL unavailable / context lost** → a styled message panel plus the plots and readouts still run (sim is independent of GL). Shader compile errors are caught and reported on-page.
- **Declared deviations from `CLAUDE.md` §8**, to be written into the file header and SELFCHECK: (3) the stage is a true-scale WebGL 3D scene rather than an isotropic 2D canvas; the "secondary 3D inset" becomes a "secondary 2D schematic inset". `CLAUDE.md` should get a short note that WebGL is permitted for pieces whose subject is 3D. (4) the in-scene look is 8-bit synthwave rather than the house dark-panel palette; UI chrome, force arrows and HUD still use the role colours so meaning is preserved. Everything else (single file, no deps, dark panel, real constants, shared kernels, timeline == scrub, prediction up front, caveat card) is kept.
- Size target: ≤ ~120 KB (shaders, bitmap font and the car table are the extra cost).

## Files to touch

- **new** `/home/ubuntu/sonic-boom-viz/tesla-roadster.html`
- **new** `/home/ubuntu/sonic-boom-viz/tesla-roadster.SELFCHECK.md` (pattern: `gravitational-slingshot.SELFCHECK.md`)
- **new** `/home/ubuntu/sonic-boom-viz/.claude/skills/verify-physics-viz/verify-tesla-roadster.mjs` (pattern: `verify-gravitational-slingshot.mjs`)
- **edit** `build-index.mjs`: add to `SRC`, `META` (scene/watch/act copy), `ORDER`; then regenerate `index.html`.
- **edit** `CLAUDE.md`: one-paragraph note on the WebGL exception.
- Reuse: house helpers `clamp, lerp, smooth, keyf, rot` and the DPR/`fit()`/`resize()` conventions from `sonic-boom.html`; plot and readout code can be lifted from there.

## Verification

Per `.claude/skills/verify-physics-viz/SKILL.md` (done only when every check passes):
1. **Static (S1–S4):** no `src=`/`href=`/`fetch(`/`<link>`; `node --check` on the extracted script in `node:22-slim`; opens from `file://`; `"use strict"`.
2. **Numeric anchors in the harness** (puppeteer image, `--use-gl=swiftshader` for headless WebGL):
   - 600 L @ 379 bar → 228 ± 3 kg; @ 437 bar → 250 ± 3 kg.
   - Blowdown thrust fraction at 75/50/25 % air = 0.67/0.38/0.14 (±0.02); gas T = −12/−51/−105 °C (±3).
   - Constant-80-kN time to empty 250 kg at Isp 54/60/70.7 = 1.65/1.84/2.17 s (±0.05).
   - Default launch preset → 0.81 s ± 0.03 to 60 mph, ≈ 11 ± 1 m.
   - Hover thrust 16.7 kN @ 1,700 kg and 23.0 kN @ 2,350 kg (±0.1).
   - 4,700 kg readout = 46.1 kN; 2.76 g @ 1,700 kg; 2.00 g @ 2,350 kg.
   - Static hold: θ = 180° holds iff s > 1 g; s = 0 corner = 1.26 g; s = 2 g corner ≈ 2.2 g.
   - `rebuildTo(t)` state equals continuous play at t (compare readouts at 3 timestamps).
3. **Visual:** screenshots of each preset (both tabs) at 1280×800 and a narrow width; confirm plume visible, ghosts at the correct finish distances, GL-less fallback panel renders (`--disable-gpu --disable-webgl`).
4. Rebuild the index in `node:22-slim` and confirm the new piece appears and runs inside the embed.

Host constraint: all node/python/CoolProp work happens in Docker containers, never on the host.
