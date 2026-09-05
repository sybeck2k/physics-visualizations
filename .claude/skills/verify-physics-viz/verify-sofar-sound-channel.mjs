/* verify-physics-viz — executable acceptance harness for a standalone physics viz.
 *
 * This copy is adapted (per SKILL.md §6) to the SOFAR / sound-speed-ducting piece.
 * Generic rows A1–A5, B4, B5, C5, C6 keep their assertions and thresholds; only the
 * selectors, tab keys and readout-row names changed. The phenomenon rows are:
 *
 *   B1  EXACT closed form   — ray invariant cosθ(z)/c(z) = const along a traced ray,
 *                             and the turning depth where c(z_turn) = c_source/cosθ₀
 *   B2  MODEL FIDELITY      — the Munk profile, the Arctic linear profile, and the
 *                             constant-gradient circular-arc skip distance 2·R·sinθ,
 *                             all reproduced independently here and compared point by point
 *   B3  CITED ANCHOR        — the SOFAR axis sits at 1000–1300 m (Munk z_ax = 1300 m); a
 *                             ±10–12° axial ray stays trapped past 300 km; Heard Island 1991
 *   C1  insight: a c-minimum is a waveguide  — flatten it and the duct dies
 *   C2  insight: a shadow zone sits right beside the loudest path in the ocean
 *
 * Usage (inside the puppeteer container — see SKILL.md for the exact docker line):
 *   node verify.mjs /work/target.html
 *
 * Prints one row per check and exits 1 if any check FAILs.
 */
import puppeteer from 'puppeteer';

const FILE = process.argv[2];
if (!FILE) { console.error('usage: node verify.mjs <path-to.html>'); process.exit(2); }

const results = [];
const rec = (id, cat, pass, measured, threshold) =>
  results.push({ id, cat, pass: !!pass, measured: String(measured), threshold });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const firstNum = s => { const m = String(s ?? '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const norm = s => String(s).replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
const DEG = Math.PI / 180;

/* ---------- the medium models, reproduced here independently of the page ----------
 * Munk (1974) JASA 55, 220 — canonical mid-latitude deep sound channel:
 *   c(z) = c1·[1 + ε(η + e^−η − 1)],  η = 2(z − z_ax)/B,
 *   c1 = 1492 m/s, ε = 0.00737, B = 1300 m, z_ax = 1300 m.
 * Arctic upward-refracting half-channel, a standard linear gradient:
 *   c(z) = 1435 + 0.0165 z  (m/s)
 */
const C1M = 1492.0, EPSM = 0.00737, BM = 1300.0, ZAXM = 1300.0;
const munk = (z, zax = ZAXM, eps = EPSM) => {
  const eta = 2 * (z - zax) / BM;
  return C1M * (1 + eps * (eta + Math.exp(-eta) - 1));
};
const ARCTIC_C0 = 1435.0, ARCTIC_G = 0.0165;
const arcticC = z => ARCTIC_C0 + ARCTIC_G * z;
// shallowest depth at which the Munk profile reaches `target` (c decreases downward above the axis)
function munkUpperRoot(target, zax = ZAXM, eps = EPSM) {
  if (munk(0, zax, eps) < target) return NaN;      // never that fast above the axis
  let lo = 0, hi = zax;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (munk(m, zax, eps) > target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// closed-form skip (cycle) distance for a constant-gradient layer: 2·R·sinθ_surf,
// R = c_surface / (g · cosθ_surf), reached from a source at depth zs launched at θ0
function arcticCycle(zs, th0) {
  const cs = arcticC(zs);
  const xi = Math.cos(Math.abs(th0)) / cs;         // ray invariant cosθ/c
  const cosS = Math.min(xi * ARCTIC_C0, 1);
  const sinS = Math.sqrt(Math.max(1 - cosS * cosS, 0));
  const R = ARCTIC_C0 / (ARCTIC_G * Math.max(cosS, 1e-9));
  return 2 * R * sinS;
}

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
await sleep(1200);

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
  await sleep(180);
};
const tab = async key => { await page.click(`#tabs button[data-s="${key}"]`); await sleep(700); };
const playing = () => page.$eval('#playBtn', b => /Pause/.test(b.textContent));
const play = async () => { if (!(await playing())) await page.click('#playBtn'); };
const pause = async () => { if (await playing()) await page.click('#playBtn'); };
const restart = async () => { await page.click('#restartBtn'); await sleep(250); };
const scrub = async frac => { await setRange('#prog', frac); await sleep(300); };
const ray = i => page.evaluate(i => window.__ray(i), i);
// play until the run stops on its own (the timeline ends a little past the last arrival)
const runOut = async (maxMs = 90000) => {
  const t0 = Date.now();
  await play();
  while (Date.now() - t0 < maxMs) {
    if (!(await playing())) return true;
    await sleep(400);
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

const TABS = ['deepchannel', 'surfaceduct', 'doubleduct', 'arctic', 'shadow'];

/* ============================================================ RENDERING (A) */
try {                                             // A1 no uncaught / console errors while exercising every tab + slider
  for (const k of TABS) {
    await tab(k);
    for (const s of ['#rate', '#src', '#fan', '#rng', '#rcvd', '#axis', '#eps', '#mld']) {
      if (await page.$(s) && await page.$eval(s, e => e.offsetParent !== null)) {
        const [mn, mx] = await page.$eval(s, e => [e.min, e.max]);
        await setRange(s, mn); await setRange(s, mx);
      }
    }
  }
  await tab('deepchannel');
  rec('A1', 'render', errors.length === 0,
    errors.length + ' errors' + (errors[0] ? ' — ' + errors[0] : ''), '0 pageerror / console.error');
} catch (e) { rec('A1', 'render', false, 'threw: ' + e.message, '0 errors'); }

try {                                             // A2 every canvas paints (non-blank once the arrivals have landed)
  await tab('deepchannel'); await scrub(1.0); await sleep(600);
  const m = await inkFrac('#main2d'), ar = await inkFrac('#cArr'), tl = await inkFrac('#cTL');
  rec('A2', 'render', m >= 0.05 && ar >= 0.01 && tl >= 0.01,
    `main2d ${(m * 100).toFixed(1)}% · arrivals ${(ar * 100).toFixed(1)}% · TL ${(tl * 100).toFixed(1)}%`,
    'main2d ≥ 5% ink · each plot ≥ 1% ink');
} catch (e) { rec('A2', 'render', false, 'threw: ' + e.message, 'ink thresholds'); }

try {                                             // A3 body never scrolls horizontally at common sizes
  let ok = true, detail = [];
  for (const [w, h] of [[1280, 800], [1440, 900]]) {
    await page.setViewport({ width: w, height: h }); await sleep(300);
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    const clean = sw <= iw + 2;
    if (!clean) ok = false;
    detail.push(`${w}×${h}: scrollW ${sw} vs ${iw}${clean ? ' ok' : ' OVERFLOW'}`);
  }
  await page.setViewport({ width: 1280, height: 800 }); await sleep(250);
  rec('A3', 'render', ok, detail.join(' · '), 'documentElement.scrollWidth ≤ innerWidth + 2 at every size');
} catch (e) { rec('A3', 'render', false, 'threw: ' + e.message, 'no horizontal overflow'); }

try {                                             // A4 readout is never NaN / undefined / blank and has ≥ 8 rows, all scenarios
  let ok = true, detail = [];
  for (const k of TABS) {
    await tab(k); await scrub(1.0);
    const o = await rows(); const vals = Object.values(o);
    const bad = vals.filter(v => v === '' || /\b(undefined|NaN|Infinity)\b/.test(v));
    const rowsN = Object.keys(o).length;
    if (rowsN < 8 || bad.length) { ok = false; detail.push(`${k}: ${rowsN} rows, bad=[${bad.join(',')}]`); }
    else detail.push(`${k}:${rowsN}✓`);
  }
  rec('A4', 'render', ok, detail.join(' · '), '≥ 8 rows, zero NaN/undefined/blank, all five scenarios');
} catch (e) { rec('A4', 'render', false, 'threw: ' + e.message, 'readout sane'); }

try {                                             // A5 every slider drives its own label
  await tab('deepchannel');
  let ok = true, detail = [];
  for (const id of ['src', 'rcvd', 'rng', 'fan', 'rate']) {
    if (!(await page.$(`#${id}`))) continue;
    const [mn, mx] = await page.$eval(`#${id}`, e => [e.min, e.max]);
    await setRange(`#${id}`, mn); const a = await page.$eval(`#${id}V`, e => e.textContent);
    await setRange(`#${id}`, mx); const b = await page.$eval(`#${id}V`, e => e.textContent);
    if (a === b) { ok = false; detail.push(`${id}:dead`); } else detail.push(`${id}✓`);
  }
  await tab('deepchannel');
  rec('A5', 'render', ok, detail.join(' '), 'each slider label differs between min and max');
} catch (e) { rec('A5', 'render', false, 'threw: ' + e.message, 'sliders wired'); }

/* ============================================================ PHYSICS (B) */
try {                                             // B1 EXACT — the ray invariant, and the turning-point condition
  await tab('deepchannel');
  let worstInv = 0, worstTurn = 0, detail = [];
  for (const i of [10, 40, 120]) {
    const r = await ray(i);
    const th0 = Math.abs(r.th0Deg) * DEG;
    const xiRef = Math.cos(th0) / munk(r.zs);                 // cosθ/c from OUR Munk profile
    // Measure the invariant from the ray's GEOMETRY, not from the angle the march carries:
    // take the direction of each chord of the integrated (x, z) polyline. For a circular arc
    // the chord direction is the tangent direction at the arc's mid-angle, so this is an
    // independent re-derivation of θ — a page that integrated the path wrongly fails here even
    // though its own bookkeeping angle would still satisfy cosθ/c = ξ by construction.
    let w = 0, pairs = 0;
    for (let j = 1; j < r.samples.length; j++) {
      const a = r.samples[j - 1], b = r.samples[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      if (!(dx > 1e-6)) continue;
      const thGeo = Math.atan2(Math.abs(dz), dx);
      const v = Math.cos(thGeo) / munk((a.z + b.z) / 2);
      w = Math.max(w, Math.abs(v - xiRef) / xiRef); pairs++;
    }
    if (pairs < 50) w = 9;                                    // too few marched points to judge
    worstInv = Math.max(worstInv, w);
    // turning depth: c(z_turn) = c_source / cos θ₀
    const zRef = munkUpperRoot(munk(r.zs) / Math.cos(th0));
    const dz = Math.abs(zRef - r.turnUp);
    worstTurn = Math.max(worstTurn, dz);
    detail.push(`θ${Math.abs(r.th0Deg).toFixed(1)}°: inv ${(w * 100).toFixed(3)}% · z_turn ${r.turnUp.toFixed(0)} vs ${zRef.toFixed(0)} m`);
  }
  rec('B1', 'physics', worstInv < 0.005 && worstTurn < 50,
    detail.join(' · ') + ` (max ${(worstInv * 100).toFixed(3)}% / ${worstTurn.toFixed(1)} m)`,
    'cosθ/c — with θ re-derived from the traced (x,z) polyline — conserved to < 0.5% along the ray; turning depth within one 50 m layer of c(z)=c_s/cosθ₀');
} catch (e) { rec('B1', 'physics', false, 'threw: ' + e.message, 'ray invariant + turning depth'); }

try {                                             // B2 MODEL FIDELITY — Munk c(z), Arctic c(z), and the circular-arc skip distance
  let worstC = 0, worstSkip = 0, detail = [];
  await tab('deepchannel');
  for (const z of [300, 1300, 3000]) {
    await setRange('#src', z);
    const got = firstNum(await val('c at source'));
    worstC = Math.max(worstC, Math.abs(got - munk(z)));
  }
  detail.push(`Munk c(z) max err ${worstC.toFixed(2)} m/s`);
  await tab('arctic');
  let wA = 0;
  for (const z of [200, 1500, 3000]) {
    await setRange('#src', z);
    const got = firstNum(await val('c at source'));
    wA = Math.max(wA, Math.abs(got - arcticC(z)));
  }
  worstC = Math.max(worstC, wA);
  detail.push(`Arctic c(z) max err ${wA.toFixed(2)} m/s`);
  await tab('arctic');                                        // back to the default 100 m source
  for (const i of [8, 40, 100, 140]) {
    const r = await ray(i);
    if (!isFinite(r.cycle)) { worstSkip = 9; detail.push(`θ${r.th0Deg.toFixed(1)}°: no cycle`); continue; }
    const ref = arcticCycle(r.zs, Math.abs(r.th0Deg) * DEG);
    const rel = Math.abs(r.cycle - ref) / ref;
    worstSkip = Math.max(worstSkip, rel);
    detail.push(`θ${Math.abs(r.th0Deg).toFixed(1)}°: skip ${(r.cycle / 1000).toFixed(2)} vs 2R·sinθ = ${(ref / 1000).toFixed(2)} km`);
  }
  rec('B2', 'physics', worstC < 1.0 && worstSkip < 0.03,
    detail.join(' · ') + ` (skip max err ${(worstSkip * 100).toFixed(2)}%)`,
    'c(z) within 1 m/s of Munk and of 1435+0.0165z; traced skip within 3% of 2·R·sinθ₀ at ≥ 3 angles');
} catch (e) { rec('B2', 'physics', false, 'threw: ' + e.message, 'profile + skip-distance closed form'); }

try {                                             // B3 CITED ANCHOR — the SOFAR axis, its trapped fan, and Heard Island 1991
  await tab('deepchannel');
  await setRange('#rng', 300); await setRange('#fan', 12); await sleep(400);
  const axis = firstNum(await val('Channel axis'));
  const maxD = firstNum(await val('Max ducted range'));
  // a ray launched at 10–12° from the on-axis source must never touch the surface or the seabed
  let axial = null;
  for (const i of [8, 10, 12, 135, 137]) {
    const r = await ray(i);
    if (Math.abs(r.th0Deg) >= 10 && Math.abs(r.th0Deg) <= 12.5) { axial = r; break; }
  }
  // the ray must actually have BEEN marched that far — `xEnd` is how far the trace really got
  const reach = axial ? axial.xEnd / 1000 : 0;
  const trapped = !!axial && axial.ns === 0 && axial.nb === 0 && axial.ducted && reach >= 300;
  const txt = await page.evaluate(() => document.querySelector('#explain').textContent);
  const cited = /heard island/i.test(txt) && /18[\s, ]?000/.test(txt);
  const ok = axis >= 900 && axis <= 1400 && maxD >= 300 && trapped && cited;
  rec('B3', 'physics', ok,
    `axis ${axis.toFixed(0)} m · max ducted ${maxD.toFixed(0)} km · ${axial ? axial.th0Deg.toFixed(1) + '° ray marched to ' + reach.toFixed(0) + ' km, surface/bottom hits ' + axial.ns + '/' + axial.nb : 'no 10–12° ray'} · Heard Island cited ${cited}`,
    'axis ∈ 900–1400 m (Munk z_ax = 1300 m); a ±10–12° axial ray marched to ≥ 300 km with 0 surface and 0 bottom hits; the 1991 Heard Island test (~18 000 km) cited in #explain');
} catch (e) { rec('B3', 'physics', false, 'threw: ' + e.message, 'SOFAR axis anchor'); }

try {                                             // B4 no phantom arrival before a ray has reached the hydrophone
  await tab('deepchannel'); await restart(); await pause();
  const seen = [];
  for (const f of [0.3, 0.5, 0.7]) { await scrub(f); seen.push(await val('Arrivals')); }
  const stable = new Set(seen.map(norm)).size === 1;
  rec('B4', 'physics', stable && /^-$/.test(norm(seen[0])),
    `Arrivals at 3 pre-arrival scrub points: [${seen.join(' | ')}]`,
    'identical at all three points, and "—" (no arrival before its travel time has elapsed)');
} catch (e) { rec('B4', 'physics', false, 'threw: ' + e.message, 'no phantom arrival'); }

try {                                             // B5 scrub(t) ≡ play(t) — rebuildTo replays the deterministic ray march
  await tab('deepchannel'); await restart();
  await runOut(90000); await sleep(600); await pause();
  // Transmission loss is the AMPLITUDE the observer panel is built on, and it is a function of
  // the clock: R.TL sums only the arrivals whose travel time S.t has already passed. Comparing
  // it (not a precomputed eigenray time) is what makes this a real scrub-equals-play test.
  const dA = firstNum(await val('Transmission loss')), nA = firstNum(await val('Arrivals'));
  await restart(); await scrub(0.98); await sleep(500);
  const dB = firstNum(await val('Transmission loss')), nB = firstNum(await val('Arrivals'));
  const dRel = Math.abs(dA - dB) / Math.max(Math.abs(dA), 1e-6);
  rec('B5', 'physics', isFinite(dA) && dRel < 0.10 && nA === nB && nA >= 1,
    `played ${dA.toFixed(1)} dB / ${nA} arrivals vs scrubbed ${dB.toFixed(1)} dB / ${nB} arrivals (ΔTL ${(dRel * 100).toFixed(2)}%)`,
    'transmission loss within 10% and the same arrival count');
} catch (e) { rec('B5', 'physics', false, 'threw: ' + e.message, 'play == scrub'); }

try {                                             // B6 MAGNITUDE ANCHOR — the absolute level, against spreading laws computed here
  // Reference, reproduced independently: an isovelocity ocean has no refraction, so the field
  // is a free-field point source. TL = 20·log10(R) + α·R  (R in metres, α from Thorp 1967 at
  // ~100 Hz = 0.0035 dB/km). Turning the channel back on must buy a large, measurable gain,
  // because a duct spreads cylindrically (10·log R) rather than spherically (20·log R).
  // NOTE: at these ranges absorption is only ~1 dB of the total, so the band below pins the
  // SPREADING coefficient: a 1.15× slip in it (10 → 11.4 log R) moves 300 km by ~14 dB and fails.
  const ALPHA_DB_KM = 0.0035;
  const sph = km => 20 * Math.log10(km * 1000) + ALPHA_DB_KM * km;
  await tab('deepchannel'); await setRange('#eps', 0);
  const flat = {};
  for (const km of [30, 300]) { await setRange('#rng', km); await scrub(1.0); await sleep(350);
    flat[km] = firstNum(await val('Transmission loss')); }
  const e30 = Math.abs(flat[30] - sph(30)), e300 = Math.abs(flat[300] - sph(300));
  const slope = flat[300] - flat[30];                       // one decade of range
  await setRange('#eps', 7.37); await setRange('#rng', 300); await scrub(1.0); await sleep(400);
  const duct = firstNum(await val('Transmission loss'));
  const gain = flat[300] - duct;
  const ok = e30 < 7 && e300 < 7 && slope >= 16 && slope <= 24 && gain >= 15;
  rec('B6', 'physics', ok,
    `isovelocity ${flat[30].toFixed(0)} dB @30 km (ref ${sph(30).toFixed(1)}, Δ${e30.toFixed(1)}) · ${flat[300].toFixed(0)} dB @300 km (ref ${sph(300).toFixed(1)}, Δ${e300.toFixed(1)}) · decade slope ${slope.toFixed(1)} dB · ducted ${duct.toFixed(0)} dB = ${gain.toFixed(0)} dB better`,
    'isovelocity TL within 7 dB of 20·log10(R)+α·R at 30 and 300 km, decade slope 20 ± 4 dB (spherical), and the duct beats spherical by ≥ 15 dB at 300 km');
} catch (e) { rec('B6', 'physics', false, 'threw: ' + e.message, 'absolute level vs spreading laws'); }

/* ============================================================ INSIGHT (C) */
try {                                             // C1 a sound-speed MINIMUM is a waveguide — flatten it and the duct dies
  await tab('deepchannel');
  await setRange('#rng', 300); await setRange('#fan', 12); await scrub(1.0); await sleep(400);
  const nDuct = firstNum(await val('Arrivals'));
  const stDuct = norm(await val('Duct state'));
  const rDuct = firstNum(await val('Max ducted range'));
  await setRange('#eps', 0); await scrub(1.0); await sleep(400);
  const stFlat = norm(await val('Duct state'));
  const rFlat = firstNum(await val('Max ducted range'));
  await setRange('#eps', 7.37);
  const ok = nDuct >= 3 && /trapped/i.test(stDuct) && /not ducted/i.test(stFlat) && rFlat <= rDuct / 5;
  rec('C1', 'insight', ok,
    `ducted: ${nDuct} arrivals, "${stDuct}", ${rDuct.toFixed(0)} km  →  flat (ε=0): "${stFlat}", ${rFlat.toFixed(0)} km`,
    '≥ 3 arrivals and a "trapped/ducted" state with the channel; "not ducted" and max ducted range ≥ 5× smaller without it');
} catch (e) { rec('C1', 'insight', false, 'threw: ' + e.message, 'a c-minimum is a waveguide'); }

try {                                             // C2 a shadow zone sits right beside the loudest path
  // Both points must produce a REAL, finite transmission loss so the ratio is actually measured.
  // The shadow point is ray-starved (at most one feeble path), not necessarily ray-free.
  await tab('shadow'); await scrub(1.0); await sleep(500);
  const rawSh = await val('Arrivals');
  const rawTlSh = await val('Transmission loss');
  if (rawSh === null || rawTlSh === null) throw new Error('Arrivals / Transmission loss row missing');
  const nSh = firstNum(rawSh), tlSh = firstNum(rawTlSh);
  const stSh = norm(await val('Duct state'));
  const zSh = firstNum((await val('Hydrophone') || '').split('·')[1] || '');
  await setRange('#rcvd', 1300); await scrub(1.0); await sleep(500);
  const nAx = firstNum(await val('Arrivals')), tlAx = firstNum(await val('Transmission loss'));
  const gain = tlSh - tlAx;                        // dB, both finite — 14 dB = a 5x pressure ratio
  const ok = isFinite(nSh) && nSh <= 1 && /shadow/i.test(stSh)
           && isFinite(tlSh) && isFinite(tlAx) && isFinite(nAx) && nAx >= 3 && gain >= 14;
  rec('C2', 'insight', ok,
    `shadow @ ${zSh.toFixed(0)} m: ${isFinite(nSh) ? nSh : 'no row'} arrival(s), "${stSh}", TL ${isFinite(tlSh) ? tlSh.toFixed(0) + ' dB' : 'NOT FINITE'}  ->  on-axis @ 1300 m: ${nAx} arrivals, TL ${tlAx.toFixed(0)} dB (measured gap ${gain.toFixed(0)} dB)`,
    'shadow point: a FINITE transmission loss, <= 1 arrival, and a "shadow zone" readout; on-axis at the same range >= 3 arrivals and >= 14 dB louder (a 5x amplitude ratio). A missing row fails.');
} catch (e) { rec('C2', 'insight', false, 'threw: ' + e.message, 'shadow beside a loud path'); }

try {                                             // C5 the units primer ties each quantity to an everyday anchor
  const txt = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#explain .ex')].find(d => /reading the units/i.test(d.querySelector('h4')?.textContent || ''));
    return (card || document.querySelector('#explain')).textContent;
  });
  const a1 = /ten[\s-]?million/i.test(txt);              // dB
  const a2 = /blue whale/i.test(txt);                    // range
  const a3 = /(canyon|echo|shout)/i.test(txt);           // arrival spread in seconds
  rec('C5', 'insight', a1 && a2 && a3, `ten-million-fold:${a1} · blue whale:${a2} · canyon/echo/shout:${a3}`,
    'units card ties dB, kilometres and the arrival spread each to a concrete everyday reference');
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
