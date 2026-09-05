/* verify-physics-viz — executable acceptance harness for a standalone physics viz.
 *
 * Target: the gravitational-slingshot visualization (TARGET.html).
 *
 * Usage (inside the puppeteer container — see SKILL.md for the exact docker line):
 *   node verify.mjs /work/target.html
 *
 * Prints one row per check and exits 1 if any check FAILs.
 * Every check has a stated numeric or string threshold. No check reduces to "looks good".
 *
 *   A* rendering    — the page runs, paints, fits, and every control is wired
 *   B* physics      — numbers match closed-form results and real-world calibration anchors
 *   C* insight      — the thing the viz exists to teach is actually legible on screen
 *
 * A1–A5, B4, B5, C5, C6 are the generic rows from the reference harness: same assertions and
 * same thresholds, only the selectors / tab keys / readout-row names are re-pointed.
 * B1–B3, C1, C2 are the phenomenon-specific rows for this piece.
 */
import puppeteer from 'puppeteer';

const FILE = process.argv[2];
if (!FILE) { console.error('usage: node verify.mjs <path-to.html>'); process.exit(2); }

const results = [];
const rec = (id, cat, pass, measured, threshold) =>
  results.push({ id, cat, pass: !!pass, measured: String(measured), threshold });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const firstNum = s => { const m = String(s ?? '').replace(/−/g, '-').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const norm = s => String(s).replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();

/* reference constants, re-derived here so the pass bands do not depend on the page */
const G = 6.67430e-11, MSUN = 1.98892e30, AORB = 7.78479e11;
const GMS = G * MSUN;
const VPL = Math.sqrt(GMS / AORB);            // 13 058 m/s — circular speed at 5.204 AU

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

await page.goto('file://' + FILE, { waitUntil: 'load' });
await sleep(900);

/* ---------- page helpers ---------- */
const rows = () => page.evaluate(() => {
  const o = {};
  document.querySelectorAll('#rdl dt').forEach(dt => {
    const dd = dt.nextElementSibling;
    if (dd && dd.tagName === 'DD') o[dt.textContent.trim()] = dd.textContent || '';
  });
  return o;
});
const val = async name => {
  const o = await rows();
  const k = Object.keys(o).find(x => norm(x) === norm(name)) || Object.keys(o).find(x => norm(x).includes(norm(name)));
  return k ? o[k] : null;
};
const setRange = async (sel, v) => {
  if (!(await page.$(sel))) return;
  await page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await sleep(160);
};
const tab = async key => { await page.click(`#tabs button[data-s="${key}"]`); await sleep(420); };
const playing = () => page.$eval('#playBtn', b => /Pause/.test(b.textContent));
const play = async () => { if (!(await playing())) await page.click('#playBtn'); };
const pause = async () => { if (await playing()) await page.click('#playBtn'); };
const restart = async () => { await page.click('#restartBtn'); await sleep(250); };
const scrub = async frac => { await setRange('#prog', frac); await sleep(180); };
// play the run through to its end (the loop stops itself at the last step)
const runOut = async (maxMs = 60000) => {
  await restart(); await play();
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (!(await playing())) return true;
    await sleep(300);
  }
  await pause();
  return false;
};
const inkFrac = sel => page.evaluate(s => {
  const c = document.querySelector(s); if (!c || !c.width) return 0;
  const g = c.getContext('2d'); const { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h).data;
  const br = d[8], bg = d[9], bb = d[10];        // pixel ~(2,2) — a corner, i.e. background
  let n = 0, tot = 0;
  for (let i = 0; i < d.length; i += 40) { tot++; if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 24) n++; }
  return n / tot;
}, sel);

const TABS = ['trailing', 'leading', 'retro', 'voyager'];
const SLIDERS = ['rate', 'vinf', 'b', 'alpha', 'mp'];

/* ============================================================ RENDERING (A) */
try {                                             // A1 no uncaught / console errors while exercising every tab + slider
  for (const k of TABS) {
    await tab(k);
    for (const s of SLIDERS) {
      if (await page.$('#' + s)) {
        const [mn, mx] = await page.$eval('#' + s, e => [e.min, e.max]);
        await setRange('#' + s, mn); await setRange('#' + s, mx);
      }
    }
  }
  await tab('trailing');
  rec('A1', 'render', errors.length === 0,
    errors.length + ' errors' + (errors[0] ? ' — ' + errors[0] : ''), '0 pageerror / console.error');
} catch (e) { rec('A1', 'render', false, 'threw: ' + e.message, '0 errors'); }

try {                                             // A2 every canvas paints (non-blank after a flyby)
  await tab('trailing'); await setRange('#rate', 5);
  await runOut(60000); await sleep(600);
  const m = await inkFrac('#main2d'), sp = await inkFrac('#cSpeed'), gn = await inkFrac('#cGain');
  rec('A2', 'render', m >= 0.05 && sp >= 0.01 && gn >= 0.01,
    `main2d ${(m * 100).toFixed(1)}% · speed ${(sp * 100).toFixed(1)}% · gain ${(gn * 100).toFixed(1)}%`,
    'main2d ≥ 5% ink · each plot ≥ 1% ink');
} catch (e) { rec('A2', 'render', false, 'threw: ' + e.message, 'ink thresholds'); }

try {                                             // A3 body never scrolls horizontally at common sizes
  let ok = true, detail = [];
  for (const [w, h] of [[1280, 800], [1440, 900]]) {
    await page.setViewport({ width: w, height: h }); await sleep(280);
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    const clean = sw <= iw + 2;
    if (!clean) ok = false;
    detail.push(`${w}×${h}: scrollW ${sw} vs ${iw}${clean ? ' ok' : ' OVERFLOW'}`);
  }
  await page.setViewport({ width: 1280, height: 800 });
  rec('A3', 'render', ok, detail.join(' · '), 'documentElement.scrollWidth ≤ innerWidth + 2 at every size');
} catch (e) { rec('A3', 'render', false, 'threw: ' + e.message, 'no horizontal overflow'); }

try {                                             // A4 readout is never NaN / undefined / blank and has ≥ 8 rows, all scenarios
  let ok = true, detail = [];
  for (const k of TABS) {
    await tab(k);
    const o = await rows(); const vals = Object.values(o);
    const bad = vals.filter(v => v === '' || /\b(undefined|NaN|Infinity)\b/.test(v));
    const rowsN = Object.keys(o).length;
    if (rowsN < 8 || bad.length) { ok = false; detail.push(`${k}: ${rowsN} rows, bad=[${bad.join(',')}]`); }
    else detail.push(`${k}:${rowsN}✓`);
  }
  rec('A4', 'render', ok, detail.join(' · '), '≥ 8 rows, zero NaN/undefined/blank, all four scenarios');
} catch (e) { rec('A4', 'render', false, 'threw: ' + e.message, 'readout sane'); }

try {                                             // A5 every slider drives its own label
  await tab('trailing');
  let ok = true, detail = [];
  for (const id of SLIDERS) {
    if (!(await page.$(`#${id}`))) continue;
    const [mn, mx] = await page.$eval(`#${id}`, e => [e.min, e.max]);
    await setRange(`#${id}`, mn); const a = await page.$eval(`#${id}V`, e => e.textContent);
    await setRange(`#${id}`, mx); const b = await page.$eval(`#${id}V`, e => e.textContent);
    if (a === b) { ok = false; detail.push(`${id}:dead`); } else detail.push(`${id}✓`);
  }
  rec('A5', 'render', ok, detail.join(' '), 'each slider label differs between min and max');
} catch (e) { rec('A5', 'render', false, 'threw: ' + e.message, 'sliders wired'); }

/* ============================================================ PHYSICS (B) */
try {
  /* B1 EXACT CLOSED FORM — the 1-D elastic limit.
     Head-on trailing pass (α = 180°, so w_in is antiparallel to the planet's motion) with a deep
     aim, i.e. a turn angle δ → 180°. In one dimension a flyby is a perfectly elastic bounce off
     an infinitely massive moving wall, so in the Sun's frame
         v_out = 2·v_planet − v_in                                (Newtonian, exact)
     with v_in the signed incoming heliocentric velocity, v_planet = √(GM☉/a) = 13.058 km/s.
     Here v∞ = 4 km/s ⇒ v_in = 13.058 − 4 = 9.058 km/s ⇒ v_out = 17.058 km/s.
     The residual is the Sun's pull during the ~46-day sphere traverse — a real physical effect,
     not integrator error — so the band cannot go to zero. Measured 0.81%; band tightened from the
     generic 3% to 1.5%. Second half: in the PLANET's frame the pass is elastic, |w_in| = |w_out|
     (measured 0.052%; band tightened from 0.5% to 0.2%). */
  await tab('trailing');
  await setRange('#vinf', 4); await setRange('#b', 18); await setRange('#alpha', 180);
  await setRange('#mp', 1); await setRange('#rate', 5);
  const done = await runOut(70000); await sleep(500);
  const vin  = firstNum(await val('Speed in (Sun)'))  * 1000;
  const vout = firstNum(await val('Speed out (Sun)')) * 1000;
  const win  = firstNum(await val('Speed in (planet)'))  * 1000;
  const wout = firstNum(await val('Speed out (planet)')) * 1000;
  const ideal = Math.abs(2 * VPL - (VPL - 4000));
  const errE = 100 * Math.abs(vout - ideal) / ideal;
  // read the discrepancy off the page's own "Frame check" row rather than differencing two
  // rounded readouts — otherwise the equality would be satisfied by display precision alone
  const errW = firstNum(await val('Frame check'));
  rec('B1', 'physics', done && errE < 1.5 && errW >= 0 && errW < 0.2,
    `v_out ${(vout / 1000).toFixed(3)} vs 2v_p−v_in ${(ideal / 1000).toFixed(3)} km/s (${errE.toFixed(2)}%) · ` +
    `|w| in ${(win / 1000).toFixed(3)} out ${(wout / 1000).toFixed(3)} km/s, frame check ${errW}% · v_in ${(vin / 1000).toFixed(3)}`,
    'heliocentric v_out within 1.5% of 2·v_planet − v_in; planet-frame |w_in| = |w_out| within 0.2%');
} catch (e) { rec('B1', 'physics', false, 'threw: ' + e.message, '1-D elastic limit'); }

try {
  /* B2 MODEL FIDELITY — re-integrate the SAME circular restricted three-body problem here, with
     RK4 instead of the page's velocity-Verlet, from the initial conditions the page exposes on
     window.__ic, over the same span. Two independent integrators of the same ODE must agree.
     Also assert the page's own conserved-quantity drift. The invariant of this problem is the
     JACOBI constant, not the probe's orbital energy: the probe moves in a time-dependent
     potential, so its own energy is genuinely not conserved — that is the whole phenomenon.
     C_J = 2ω(x·vy − y·vx) − v² + 2(GM☉/r☉ + GM_p/r_p). */
  await tab('voyager'); await setRange('#rate', 5);
  const done = await runOut(70000); await sleep(500);
  const ic = await page.evaluate(() => window.__ic);
  if (!ic) throw new Error('window.__ic not exposed');
  const pageSpeed = firstNum(await val('Heliocentric speed')) * 1000;
  const { GMS: gs, mu, AORB: aorb, OMEGA: om, THETA0: th0, T } = ic;
  const deriv = (t, s) => {
    const px = aorb * Math.cos(th0 + om * t), py = aorb * Math.sin(th0 + om * t);
    const rs = Math.hypot(s[0], s[1]);
    const dx = s[0] - px, dy = s[1] - py, d = Math.hypot(dx, dy);
    const ks = -gs / (rs * rs * rs), kp = -mu / (d * d * d);
    return [s[2], s[3], ks * s[0] + kp * dx, ks * s[1] + kp * dy];
  };
  let s = [ic.x, ic.y, ic.vx, ic.vy], t = 0;
  const nR = 400000, hR = T / nR;
  for (let i = 0; i < nR; i++) {
    const k1 = deriv(t, s);
    const s2 = s.map((v, j) => v + hR / 2 * k1[j]); const k2 = deriv(t + hR / 2, s2);
    const s3 = s.map((v, j) => v + hR / 2 * k2[j]); const k3 = deriv(t + hR / 2, s3);
    const s4 = s.map((v, j) => v + hR * k3[j]);     const k4 = deriv(t + hR, s4);
    s = s.map((v, j) => v + hR / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    t += hR;
  }
  const rk = Math.hypot(s[2], s[3]);
  const err = 100 * Math.abs(rk - pageSpeed) / Math.max(rk, 1);
  const drift = firstNum(await val('Integrator drift'));
  rec('B2', 'physics', done && err < 2 && drift < 0.1,
    `RK4 ${(rk / 1000).toFixed(3)} vs viz ${(pageSpeed / 1000).toFixed(3)} km/s (${err.toFixed(3)}%) · Jacobi drift ${drift} %`,
    'independent RK4 within 2% of the viz’s final heliocentric speed; viz’s own invariant drift < 0.1%');
} catch (e) { rec('B2', 'physics', false, 'threw: ' + e.message, 'model fidelity'); }

try {
  /* B3 CITED ANCHOR — Voyager 2 at Jupiter, July 1979 (NASA/JPL trajectory data): heliocentric
     speed rose from ~10 km/s to ~25 km/s, a ~15 km/s gain, putting it on a solar-escape orbit.
     A multiplicative slip in GM_Jupiter or in the planet's orbital speed moves the outgoing speed
     straight out of this band, because the gain is bounded by v_planet + |w|. */
  await tab('voyager'); await setRange('#rate', 5);
  const done = await runOut(70000); await sleep(500);
  const vout = firstNum(await val('Speed out (Sun)'));
  const dv = Math.abs(firstNum(await val('Δv (Sun)')));
  const cited = await page.evaluate(() =>
    /voyager\s*2/i.test(document.querySelector('#explain').textContent) &&
    /10\s*km\/s/i.test(document.querySelector('#explain').textContent) &&
    /25\s*km\/s/i.test(document.querySelector('#explain').textContent));
  rec('B3', 'physics', done && vout >= 20 && vout <= 30 && dv >= 12 && dv <= 20 && cited,
    `Speed out ${vout} km/s · Δv ${dv} km/s · cited in #explain: ${cited}`,
    'Voyager preset: speed out ∈ 20–30 km/s, Δv ∈ 12–20 km/s, and the ~10→~25 km/s figure cited');
} catch (e) { rec('B3', 'physics', false, 'threw: ' + e.message, 'Voyager 2 anchor'); }

try {                                             // B4 no phantom result before the encounter happens
  await tab('trailing'); await restart(); await pause();
  const seenDv = [], seenOut = [];
  for (const f of [0.08, 0.16, 0.24]) {
    await scrub(f);
    seenDv.push(await val('Δv (Sun)'));
    seenOut.push(await val('Speed out (Sun)'));
  }
  const stable = new Set(seenDv.map(norm)).size === 1 && new Set(seenOut.map(norm)).size === 1;
  const dash = /^-$/.test(norm(seenDv[0])) && /^-$/.test(norm(seenOut[0]));
  rec('B4', 'physics', stable && dash,
    `Δv at 3 pre-encounter scrub points: [${seenDv.join(' | ')}] · Speed out: [${seenOut.join(' | ')}]`,
    'identical at all three points, and "—" (no "after" before the probe leaves the encounter sphere)');
} catch (e) { rec('B4', 'physics', false, 'threw: ' + e.message, 'no phantom result'); }

try {                                             // B5 scrubbing to t gives the same physics as playing to t
  await tab('trailing'); await setRange('#rate', 5);
  await runOut(70000); await sleep(500);
  const spA = firstNum(await val('Heliocentric speed')), dvA = firstNum(await val('Δv (Sun)'));
  await scrub(0.5);                                 // force a full rewind + deterministic replay
  await scrub(1.0);
  const spB = firstNum(await val('Heliocentric speed')), dvB = firstNum(await val('Δv (Sun)'));
  const dRel = Math.abs(spA - spB) / Math.max(Math.abs(spA), 1e-6);
  const dDv = Math.abs(dvA - dvB);
  rec('B5', 'physics', dRel < 0.10 && dDv <= 0.30,
    `played ${spA} km/s / Δv ${dvA} vs scrubbed ${spB} km/s / Δv ${dvB} (Δ ${(dRel * 100).toFixed(3)}% / ${dDv.toFixed(3)} km/s)`,
    'heliocentric speed within 10% and Δv within 0.30 km/s between play(t) and scrub(t)');
} catch (e) { rec('B5', 'physics', false, 'threw: ' + e.message, 'play == scrub'); }

/* ============================================================ INSIGHT (C) */
try {
  /* C1 THE GAIN IS FRAME-DEPENDENT — after a trailing flyby the planet-frame speed comes back to
     what it was (the encounter is elastic) while the Sun-frame speed has stepped up. Both read
     off named readout rows, not inferred. */
  await tab('trailing'); await setRange('#rate', 5);
  const done = await runOut(70000); await sleep(500);
  const win = firstNum(await val('Speed in (planet)')), wout = firstNum(await val('Speed out (planet)'));
  const dv = firstNum(await val('Δv (Sun)'));
  const wpc = firstNum(await val('Frame check'));   // the page's own measured in-vs-out residue
  rec('C1', 'insight', done && wpc >= 0 && wpc < 1 && dv >= 3,
    `planet frame ${win} → ${wout} km/s (frame check ${wpc}%) while Sun-frame Δv = ${dv} km/s`,
    'planet-frame in vs out equal within 1%, heliocentric Δv ≥ +3 km/s — same encounter, two frames');
} catch (e) { rec('C1', 'insight', false, 'threw: ' + e.message, 'gain is frame-dependent'); }

try {
  /* C2 TRAILING BOOSTS, LEADING BRAKES — flip the pass side (the sign of the impact parameter)
     with everything else held fixed; the Δv readout must change sign, not merely shrink. */
  await tab('trailing'); await setRange('#rate', 5);
  await setRange('#b', 8);
  await runOut(70000); await sleep(500);
  const dvT = firstNum(await val('Δv (Sun)'));
  await setRange('#b', -8);
  await runOut(70000); await sleep(500);
  const dvL = firstNum(await val('Δv (Sun)'));
  rec('C2', 'insight', dvT >= 2 && dvL <= -2,
    `b = +8 R_J → Δv ${dvT} km/s · b = −8 R_J → Δv ${dvL} km/s`,
    'trailing pass boosts ≥ +2 km/s, the identical leading pass brakes ≤ −2 km/s');
} catch (e) { rec('C2', 'insight', false, 'threw: ' + e.message, 'pass side flips the sign'); }

try {                                             // C5 the units primer ties each quantity to an everyday anchor
  const txt = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#explain .ex')].find(d => /reading the units/i.test(d.querySelector('h4')?.textContent || ''));
    return (card || document.querySelector('#explain')).textContent;
  });
  const a1 = /km\/s/i.test(txt), a2 = /(propellant|rocket|fuel)/i.test(txt),
        a3 = /behind/i.test(txt), a4 = /MJ\/kg/i.test(txt);
  rec('C5', 'insight', a1 && a2 && a3 && a4,
    `km/s:${a1} · propellant/rocket anchor:${a2} · "behind":${a3} · MJ/kg:${a4}`,
    'units card ties km/s, the energy change and the flyby geometry each to a concrete referent');
} catch (e) { rec('C5', 'insight', false, 'threw: ' + e.message, 'units anchored'); }

try {                                             // C6 the model discloses its own approximations
  const d = await page.evaluate(() => ({
    cav: document.querySelectorAll('#explain .cav').length,
    tips: document.querySelectorAll('#rdl [title]').length,
    disc: /estimate|±|schematic|stylised|stylized|teaching device/i.test(
      document.querySelector('#explain').textContent + ' ' + document.querySelector('#stagewrap').textContent),
  }));
  rec('C6', 'insight', d.cav >= 1 && d.tips >= 3 && d.disc,
    `caveat lines ${d.cav} · readout tooltips ${d.tips} · disclosure language present ${d.disc}`,
    '≥ 1 caveat line, ≥ 3 defining tooltips in the readout, explicit estimate/±/schematic language');
} catch (e) { rec('C6', 'insight', false, 'threw: ' + e.message, 'approximations disclosed'); }

await browser.close();

/* ---------- report ---------- */
const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + pad('CHECK', 7) + pad('CAT', 9) + pad('RESULT', 8) + 'MEASURED  /  THRESHOLD');
console.log('-'.repeat(110));
const failed = [];
for (const r of results) {
  console.log(pad(r.id, 7) + pad(r.cat, 9) + pad(r.pass ? 'PASS' : 'FAIL', 8) + r.measured + '  /  ' + r.threshold);
  if (!r.pass) failed.push(r.id);
}
console.log('-'.repeat(110));
if (failed.length) {
  console.log(`\nFAIL — ${failed.length} check(s) below threshold: ${failed.join(', ')}`);
  console.log('A B* failure = a physical claim is wrong. A C* failure = the intended insight does not land on screen.');
  process.exit(1);
} else {
  console.log(`\nPASS — all ${results.length} checks met their thresholds.`);
  process.exit(0);
}
