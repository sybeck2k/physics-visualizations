# Physics visualizations

A small collection of standalone, interactive physics visualizations. Each is **one self-contained
`.html` file** — no build, no dependencies, no network — and opens straight from `file://`.

Each piece is built so that after two minutes of pressing Play and dragging sliders, one
counter-intuitive fact is obvious.

| Piece | File | The fact |
|---|---|---|
| Sonic boom propagation | `sonic-boom.html` | A boom is not a one-off bang at Mach 1 — it is a carpet that sweeps the ground for as long as the vehicle stays supersonic. |
| Multi-slit diffraction | `diffraction-grating.html` | More slits don't just brighten the lines, they sharpen them; below one wavelength of spacing every order but the centre vanishes. |
| Gravitational slingshot | `gravitational-slingshot.html` | The flyby only turns the probe's velocity in the planet's frame; the speed gain exists only in the Sun's frame. |
| SOFAR sound channel | `sofar-sound-channel.html` | A sound-speed minimum is a waveguide: rays are trapped and carry sound across an ocean, while a phone nearby can sit in silence. |
| Tesla Roadster: air & suction | `tesla-roadster.html` | A cold-air tank is a blowdown bottle — 250 kg of air buys a launch or a hop, not a flight. (WebGL 3-D scene.) |

`index.html` is a landing page that embeds all five behind one set of tabs.

## Using them

Open any `.html` file in a browser. Press **Play**, drag the sliders, drag the observer / aim point /
hydrophone on the stage, and switch scenario tabs. The five cards at the bottom explain what you
are seeing, and they change with the active tab.

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
