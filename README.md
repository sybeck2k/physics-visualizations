# Physics visualizations

A small collection of standalone, interactive physics visualizations. Each is **one self-contained
`.html` file** — no build, no dependencies, no network — and opens straight from `file://`.

Each piece is built so that after two minutes of pressing Play and dragging sliders, one
counter-intuitive fact is obvious.

| Piece | File | The fact |
|---|---|---|
| Sonic boom propagation | [`sonic-boom.html`](https://sybeck2k.github.io/physics-visualizations/sonic-boom.html) | A boom is not a one-off bang at Mach 1 — it is a carpet that sweeps the ground for as long as the vehicle stays supersonic. |
| Multi-slit diffraction | [`diffraction-grating.html`](https://sybeck2k.github.io/physics-visualizations/diffraction-grating.html) | More slits don't just brighten the lines, they sharpen them; below one wavelength of spacing every order but the centre vanishes. |
| Gravitational slingshot | [`gravitational-slingshot.html`](https://sybeck2k.github.io/physics-visualizations/gravitational-slingshot.html) | The flyby only turns the probe's velocity in the planet's frame; the speed gain exists only in the Sun's frame. |
| SOFAR sound channel | [`sofar-sound-channel.html`](https://sybeck2k.github.io/physics-visualizations/sofar-sound-channel.html) | A sound-speed minimum is a waveguide: rays are trapped and carry sound across an ocean, while a phone nearby can sit in silence. |
| Tesla Roadster: air & suction | [`tesla-roadster.html`](https://sybeck2k.github.io/physics-visualizations/tesla-roadster.html) | A cold-air tank is a blowdown bottle — 250 kg of air buys a launch or a hop, not a flight. (WebGL 3-D scene.) |
| Rocket turbopump | [`turbopump.html`](https://sybeck2k.github.io/physics-visualizations/turbopump.html) | A pump holds up a tower of liquid of one fixed height whatever the liquid; pressure is that tower's weight — so the same pump makes ~16× less pressure with hydrogen than with oxygen. |

[`index.html`](https://sybeck2k.github.io/physics-visualizations/) is a landing page that embeds all six behind one set of tabs.

## Using them

**Live:** https://sybeck2k.github.io/physics-visualizations/ (GitHub Pages, served from `main`; every push redeploys).

Or open any `.html` file locally in a browser. Press **Play**, drag the sliders, drag the observer / aim point /
hydrophone on the stage, and switch scenario tabs. The five cards at the bottom explain what you
are seeing, and they change with the active tab.

### Sonic boom phone experiment

[`sonic-boom.html`](./sonic-boom.html) opens in **Experiment** on screens up to 700 CSS pixels wide.
You get an unobstructed scene, your observer's pressure signature, an up-front prediction,
playback and a timeline, and one primary Mach slider. Drag the green observer to move it.
After a boom arrives, tap **Keep run**, change Mach, and compare the retained trace with the new one.
Changing scenarios clears the comparison.

**Parameters** opens a sheet with additional controls, **Measures** contains the full readouts
and distance plot, and **Why?** explains the mechanism and units. Opening the sheet pauses the run;
closing it leaves playback paused at the same time.

**Experiment / Full lab** switches presentation without resetting the scenario, parameters,
observer or timeline. Desktop screens still start in the original Full lab, and rotating a phone
does not switch modes. The collection page uses a compact topic menu for this phone prototype.
All six pieces have a phone presentation, described below.

The existing physics harness and
[phone regression harness](./.claude/skills/verify-physics-viz/verify-sonic-boom-mobile.mjs)
check the two presentations. Run the latter in the same Puppeteer container used by the
physics checks, passing the absolute container paths to `sonic-boom.html` and `index.html`.

### Roadster phone experiments

[`tesla-roadster.html`](./tesla-roadster.html) also defaults to **Experiment** up to 700 CSS pixels,
starting with **Hover hop**. Its selector includes launch, hover, barrel roll, wall climb,
park-and-fade, and cornering. Each has a portrait camera, one primary slider, an up-front
prediction with its confidence chip, and a time trace in physical units.

**Keep run** retains a dashed trace for comparison when you change parameters. Switching
experiments clears it. **Parameters**, **Measures**, and **Why?** open the same pausing detail
sheet as Sonic boom; Measures includes the air-system schematic, source-confidence tooltips,
full readouts, and relationship plot. Drag the scene to orbit; double-click to recenter.
The existing Full lab, launch default, cameras, sound options, and physics remain available.
With no WebGL, the phone result, plots, and measurements still work.

The [Roadster phone harness](./.claude/skills/verify-physics-viz/verify-roadster-mobile.mjs)
complements the existing physics harness. Run it in the Puppeteer container with software GL,
passing the container paths to `tesla-roadster.html` and `index.html`, and optionally a screenshot directory.

### Diffraction phone experiment

[`diffraction-grating.html`](./diffraction-grating.html) defaults to **Experiment** up to 700 CSS pixels,
starting on **Grating**. A selector switches among the four regimes, and one slider carries each lesson:
slit width *a* (single), spacing *d* (double and sub-wavelength) or slit count *N* (grating).
The stage and your screen pattern stay in view, with the detector's power and a prediction of how many
orders exist and where the outermost lands, both shown before any light arrives. Drag the green detector
around the arc to read the pattern. After the pattern builds, **Keep run** retains a dashed trace so you
can add slits (or narrow the slit, or widen the gap) and see the line width change; the strip reports
both widths. Switching regimes clears it.

**Parameters**, **Measures** (schematic inset, full readouts, line-width-vs-N plot) and **Why?** open the
same pausing detail sheet as the other two. Experiment / Full lab, rotation and desktop behave as in
Sonic boom. The [phone harness](./.claude/skills/verify-physics-viz/verify-diffraction-grating-mobile.mjs)
complements `verify-diffraction-grating.mjs`; run it in the Puppeteer container with the container paths
to `diffraction-grating.html` and `index.html`.

### Slingshot phone experiment

[`gravitational-slingshot.html`](./gravitational-slingshot.html) defaults to **Experiment** up to 700 CSS pixels,
starting on **Trailing pass**. A selector switches among the four flybys, and one slider carries the lesson:
the aim, impact parameter *b*, whose sign decides boost (trailing edge) or brake (leading edge).
The camera still dives to the encounter and pulls out to the whole orbit afterwards. The strip shows the
predicted Δv and periapsis before the probe arrives, then the measured Δv once it has left. Drag the
green ⌖ on the stage to re-aim.

**Keep run** retains a dashed Sun-frame speed trace; flip *b* from +12 to −12 R<sub>J</sub> and the strip
reports both Δv values, boost against brake. Switching flybys clears it. **Parameters**, **Measures**
(velocity-space schematic, full readouts, Δv-vs-aim plot) and **Why?** open the same pausing detail sheet as
the other phone pieces. The [phone harness](./.claude/skills/verify-physics-viz/verify-gravitational-slingshot-mobile.mjs)
complements `verify-gravitational-slingshot.mjs`.

### SOFAR phone experiment

[`sofar-sound-channel.html`](./sofar-sound-channel.html) defaults to **Experiment** up to 700 CSS pixels,
starting on **Deep channel**. A selector switches among the five ocean profiles, and one slider carries the
lesson: the hydrophone's depth, because where you listen decides whether the sound is there at all.
The strip names the state (trapped in the channel, bouncing, ray-starved, shadow zone), shows the
transmission loss once sound has arrived, and predicts the best listening depth up front. Drag the green
hydrophone on the stage to move it; drag the cyan source to move that.

**Keep run** retains the arrival train as dashed cyan stems on the same loudness scale as the live one;
move the hydrophone out of the channel and the strip reports both losses. Switching profiles clears it.
**Parameters**, **Measures** (1:1 fan inset, full readouts, loss-vs-range plot) and **Why?** open the same
pausing detail sheet as the other phone pieces. The phone drops the c(z) side panel to give the water the
width; hand-sculpting the profile stays in Full lab. The
[phone harness](./.claude/skills/verify-physics-viz/verify-sofar-sound-channel-mobile.mjs)
complements `verify-sofar-sound-channel.mjs`.

### Turbopump phone experiment

[`turbopump.html`](./turbopump.html) is built with a phone presentation from the start: **Experiment** up to
700 CSS pixels, starting on the **F-1 liquid-oxygen pump**. A selector switches among five pumps — the F-1's two,
the Shuttle's hydrogen pump, a Raptor methane estimate, and the oxygen impeller fed any liquid. One slider carries
the lesson: the liquid's **density**. A pump holds up a tower of liquid of one fixed height, whatever the liquid;
pressure is that tower's weight, so the same impeller gives about 16× less with hydrogen than with oxygen.

**Keep run** retains a dashed pressure trace; slide the density from oxygen down to hydrogen and the strip reports
both pressure rises. The stage is a true-scale impeller (blade angles are the real blade angles) with a pressure
map, a velocity triangle and one drop of liquid riding through; the cyan knob on the casing spins the pump, and on a
phone you can drag it. **Parameters** (speed, density, blade angle, inlet pressure), **Measures** and **Why?** open the
same pausing sheet as the other pieces.

The numbers are anchored where the sources allow: the F-1's reported 5,500 rpm, flows and 41 MW; the Shuttle pump's
37,000 rpm and three stages. Pump discharge pressures are *derived* from reported power and flow, and every Raptor
pump figure is an estimate — each is marked with a confidence chip. The
[phone harness](./.claude/skills/verify-physics-viz/verify-turbopump-mobile.mjs) complements `verify-turbopump.mjs`.

## Rebuilding the landing page

After editing a piece, regenerate `index.html`. There is no host Node install on this setup, so use a container:

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":/w -w /w node:22-slim node build-index.mjs
```

## House style

`CLAUDE.md` describes the conventions every piece follows (dark instrument-panel look, isotropic 2-D
stage, shared physics kernel, scrub == play, up-front prediction, honest caveats).
`*.SELFCHECK.md` files record each piece's acceptance checks; `candidates.md` is the shortlist the
pieces were chosen from.

All figures are engineering estimates for teaching, not for design work. The Tesla Roadster piece is
not affiliated with Tesla.

## Licence

See `LICENSE`.
