# Candidate phenomena for the next visualization

## What made the sonic-boom example work

Seven properties, read back off the finished piece. They are the scoring criteria below.

| Key | Criterion | What the example did |
|-----|-----------|----------------------|
| **INS** | **One counterintuitive insight** the picture can make obvious | "The boom is a moving carpet, not a one-off bang at Mach 1"; "the cone is the *envelope* of ordinary wavelets" |
| **CON** | **Constructible on a 2-D canvas from honest primitives** — the effect *emerges*, it isn't asserted | Draw a circle per emission; the Mach cone appears on its own |
| **KNB** | **A small set of knobs that each visibly change the physics** | Mach, altitude, length, acceleration, observer offset — five sliders, five distinct effects |
| **OBS** | **A position-dependent observer plus a time-domain signal panel** | Draggable ground observer → N-wave pressure trace + Δp-vs-range plot |
| **REG** | **Several regimes from one model** | subsonic → transonic → supersonic; accel focus; low-boom shaping; booster Mach cut-off |
| **ANC** | **Real objects and numbers to calibrate and cite** | Concorde ≈ 2 psf, NASA X-59 ≈ 0.3 psf / 75 PLdB, US Std Atmosphere, F9 return |
| **VER** | **Physics a fresh agent can check** — closed-form anchors, not a CFD run | `μ = arcsin(1/M)` exact; Carlson overpressure scaling; `a = √(γRT)` |

Scored 0–3 each (3 = as strong as the example, 0 = absent). Max 21.

---

## The 12 candidates

| # | Phenomenon | Domain | Interaction type | INS | CON | KNB | OBS | REG | ANC | VER | **Σ** |
|---|-----------|--------|------------------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 1 | Kelvin ship wake (19.47° wedge) | Surface gravity waves | Drag: hull speed & water depth | 2 | 3 | 2 | 1 | 2 | 2 | 3 | **15** |
| 2 | Cherenkov radiation | EM in a dielectric / particle physics | Slider: v/c and refractive index n | 2 | 3 | 2 | 1 | 2 | 3 | 3 | **16** |
| 3 | **Multi-slit diffraction → grating** | Wave optics | **Arrange objects**: slit count, spacing, width | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **21** |
| 4 | **Gravitational slingshot** | Orbital mechanics | **Aim & release**: approach vector, impact parameter, pass side | 3 | 3 | 3 | 2 | 3 | 3 | 3 | **20** |
| 5 | Sod shock tube (Riemann problem) | Compressible gas dynamics | Edit fields: left/right p, ρ, u | 2 | 2 | 2 | 2 | 3 | 2 | 3 | **16** |
| 6 | Dipole trapping → aurora | Space plasma physics | Launch: pitch angle, energy, L-shell | 2 | 2 | 3 | 2 | 3 | 3 | 2 | **17** |
| 7 | **SOFAR / sound-speed ducting** | Ocean & atmospheric acoustics | **Sculpt a field**: drag the c(z) profile, fan of rays | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **21** |
| 8 | Roche limit / tidal disruption | Celestial mechanics | Drag a moon inward | 2 | 2 | 2 | 1 | 2 | 3 | 2 | **14** |
| 9 | Phased-array beam steering | Antenna / wave engineering | Set per-element phase, steer angle | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **21** |
| 10 | 2-D Ising model near T_c | Statistical mechanics | Scrub temperature through the transition | 3 | 2 | 2 | 2 | 3 | 2 | 3 | **17** |
| 11 | Dispersive focusing → rogue wave | Deep-water wave dispersion | Set spectrum width & chirp/phase | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **21** |
| 12 | Kármán vortex street | Fluid dynamics / vortex shedding | Slider: Reynolds number | 2 | 2 | 2 | 2 | 3 | 3 | 2 | **16** |

### One line each

1. **Kelvin wake** — the wedge half-angle is *independent of ship speed* (19.47° in deep water), a lovely surprise, but it is the same envelope-of-wavelets construction as the Mach cone and adds little the example didn't already teach. Few knobs actually move the angle.
2. **Cherenkov** — "light's own sonic boom." Strong real anchors (reactor-pool blue glow, IceCube). Again a cone; redundant with the example's core geometry.
3. **Multi-slit diffraction** — adding slits makes the bright lines *narrower*, not just brighter; below `d = λ` the orders vanish. Every knob (N, d, a, λ) reshapes the screen pattern; the screen *is* the observer panel; single-slit → double → grating → sub-wavelength is four regimes from one phasor sum. Grating equation is exact.
4. **Gravitational slingshot** — a probe gains speed in the Sun's frame while its speed *relative to the planet* is unchanged; flip to the leading edge and it brakes. Frame-dependence is the payoff. Direct N-body integration on canvas; Voyager/Cassini/Parker anchors; `v_out = 2v_planet − v_in` in the 1-D limit is an exact check.
5. **Sod shock tube** — one discontinuity splits into a shock, a contact, and a rarefaction moving three different ways. Exact Riemann solution to check against, but the solver is fiddlier than "draw a circle" and the anchors are lab apparatus, not household objects.
6. **Dipole trapping** — particles *bounce and drift* around Earth instead of falling in; the loss cone decides aurora vs escape. Great anchors (Van Allen, South Atlantic Anomaly) but the Lorentz integrator needs careful stepping and the bounce/drift formulas are adiabatic approximations.
7. **SOFAR ducting** — a sound-speed *minimum* traps a whale call or a small blast so it carries for thousands of km, with a shadow zone right next to the source. Snell-law ray tracing through a profile you draw; the hydrophone hears a spread of multipath arrivals — a literal impulse-response panel parallel to the N-wave trace. `n(z)·sinθ = const` exact.
8. **Roche limit** — a moon held together only by self-gravity shreds inside a critical radius; that debris is what rings are. Vivid, but no natural observer-signal panel and the disruption is simulation-driven rather than closed-form.
9. **Phased array** — steer a beam with no moving parts; too-wide spacing spawns grating lobes. Excellent on every axis, but the array-factor sum is the *same* mathematics as candidate 3 framed as emission; picking both would be one idea twice.
10. **2-D Ising** — near T_c domains appear at every scale and magnetization switches on sharply. The "scrub one parameter through a phase transition" interaction is distinct and valuable; Onsager's `T_c = 2/ln(1+√2)` is exact, but verification is statistical (needs averaging) rather than per-frame, and Monte-Carlo isn't a "constructive geometry" build.
11. **Dispersive focusing** — give a wave packet the right chirp and every component arrives at one spot at one instant: a wall of water out of a calm sea. Deep-water `ω² = gk`, group velocity half the phase velocity, Draupner-wave anchor. Superposition of sinusoids on a canvas; stationary-phase focus point is checkable.
12. **Kármán street** — steady flow in, periodic wake out, at a Strouhal number pinned near 0.2 across decades of Reynolds number. Recognisable anchors (chimney strakes, island cloud wakes), but an honest wake needs a real fluid solver and the St–Re relation is empirical, not closed-form.

---

## Picks

Chosen for maximum spread on **domain** (wave optics / gravitation / acoustics) and on **interaction type** (arrange discrete objects / aim a ballistic trajectory / sculpt a continuous field), while each still scores 3 on OBS — the position-dependent-observer-plus-signal-panel move that gives the example its payoff.

### Pick 1 — Multi-slit diffraction and the grating (score 21)

- **Insight to land:** more slits don't just brighten the pattern, they *sharpen* it — principal-maximum width ∝ 1/N — which is why a grating with thousands of lines resolves the sodium doublet when a double slit cannot. Secondary: when slit spacing drops below one wavelength, all non-zero orders disappear.
- **Model:** far-field intensity as the squared magnitude of a phasor sum over the aperture, `I(θ) = [sin(Nφ/2)/sin(φ/2)]² · sinc²(πa sinθ/λ)` with `φ = 2πd sinθ/λ`. Near-field (Fresnel) as an optional direct integral. No solver, just a sum — the honest primitive is "one phasor per aperture strip."
- **Knobs:** slit count N (1→∞), spacing d, slit width a, wavelength λ, screen distance. Each visibly does one thing.
- **Observer panel:** the screen itself — intensity vs position — with a draggable detector that reads out order number, angle, and relative power. Sweep the detector to trace the curve, exactly as the ground observer traces the N-wave.
- **Regimes:** single-slit envelope · two-slit cosine fringes · N-slit grating with narrowing lines · `d < λ` zeroth-order-only · near vs far field.
- **Anchors:** Young 1803; ruled/holographic gratings in spectrometers; CD track pitch 1.6 µm giving visible first-order colour; resolving R = mN vs the Na D lines at 589.0 / 589.6 nm.
- **Exact check a verifier would use:** principal maxima at `d sinθ = mλ` to < 0.1°, and the angular FWHM of a principal maximum equal to `λ/(Nd cosθ)` within 5%.

### Pick 2 — Gravitational slingshot (score 20)

- **Insight to land:** in the planet's frame the probe leaves at exactly the speed it arrived — the encounter is elastic — yet in the Sun's frame it can gain (trailing pass) or lose (leading pass) many km/s, because it trades momentum with the planet's orbital motion. The gain is frame-dependent, and that is the whole trick.
- **Model:** planar N-body (Sun + planet + massless probe), symplectic leapfrog. Optionally overlay the patched-conic hyperbola for the flyby. Nothing beyond `F = GMm/r²`.
- **Knobs:** approach speed, impact parameter, pass side (leading/trailing/polar), planet mass, arrival phase. All change the outcome qualitatively.
- **Observer panel:** the probe's speed vs time drawn **twice at once** — Sun frame and planet frame — so the viewer sees the planet-frame curve return to its initial value while the Sun-frame curve steps up. A second readout: specific orbital energy before/after. The "position dependence" is where you aim.
- **Regimes:** trailing boost · leading brake · retrograde flyby · gravitational capture · ejection to unbound. Multi-flyby (VVEJGA) as a stretch.
- **Anchors:** Voyager 2's Jupiter pass (~10 → ~25 km/s heliocentric); Cassini's Venus-Venus-Earth-Jupiter route; Parker Solar Probe using seven Venus flybys to *lose* speed and fall sunward; the 1-D elastic-limit identity `v_out = 2v_planet − v_in`.
- **Exact check a verifier would use:** in the planet's rest frame, |v_in| = |v_out| to < 0.5%; and for a near-1-D trailing pass, heliocentric Δv within 5% of `2v_planet·(something)` / the vis-viva prediction; total energy drift over the run < 0.1%.

### Pick 3 — SOFAR / sound-speed ducting (score 21)

- **Insight to land:** sound bends toward lower speed, so a *minimum* in the sound-speed profile acts as a waveguide — a source on the channel axis is heard thousands of km away along ducted paths, while a listener just outside the duct sits in a shadow zone and hears almost nothing. Range depends on the *shape of the profile*, not just distance.
- **Model:** 2-D ray tracing by Snell's law through a horizontally layered medium — integrate `dθ/dz` from the profile, rays are circular arcs in a constant-gradient layer. The honest primitive is "one ray, refracted layer by layer," directly analogous to the example's per-emission wavefront.
- **Knobs:** the sound-speed profile itself (drag 4–6 control points — build a surface duct, a deep channel, a double duct, an Arctic upward-refracting profile), source depth, launch-angle fan width, range to the receiver.
- **Observer panel:** a hydrophone at range R that receives a *train* of arrivals — direct, once-refracted, convergence-zone, bottom-bounce — plotted as amplitude vs arrival time. That impulse response is the acoustic sibling of the N-wave panel; drag the hydrophone and the arrival pattern reshapes.
- **Regimes:** surface duct · deep sound channel · convergence zones · shadow zone · bottom-bounce · Arctic half-channel · (atmospheric analog: infrasound ducted by the stratospheric wind/temperature profile).
- **Anchors:** SOFAR axis ≈ 1000–1300 m at mid-latitudes; the 1991 Heard Island Feasibility Test, detected ~18,000 km away; blue-whale calls; CTBTO hydroacoustic stations; Mediterranean/Arctic profile differences.
- **Exact check a verifier would use:** `c(z)·... ` — ray invariant `cos θ(z) / c(z) = const` conserved along every ray to < 0.5%; turning depth where `c(z) = c_source / cos θ₀` within one layer; skip distance for a linear-gradient duct matching the circular-arc closed form within 3%.

### Why not the other 21-scorers

**Phased-array beamforming** and **dispersive rogue-wave focusing** also score 21, but the array factor is the same phasor sum as Pick 1 (one idea twice), and rogue-wave focusing keeps the piece inside water waves when Pick 3 already covers a wave-guiding acoustic medium. The three picks above keep every axis — domain, interaction, and the specific "aha" — as far apart as the shortlist allows.
