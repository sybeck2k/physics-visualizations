/* verify-physics-viz — executable acceptance harness for a standalone physics viz.
 *
 * This copy is adapted (per SKILL.md §6) to the ROCKET TURBOPUMP piece.
 * Generic rows A1–A5, B5, B6, C5, C6 keep their assertions and thresholds; only the selectors,
 * tab keys and readout-row names changed. The phenomenon rows are:
 *
 *   B1  EXACT closed form   — Euler's pump equation H = η·u₂(σu₂ − c_m2/tanβ)/g, re-derived here
 *                             from the page's geometry, at the design point and off-design
 *   B2  EXACT closed form   — head does not depend on the liquid; pressure is ρ·g·H (slope 1)
 *   B3  CITED ANCHORS       — F-1: 5,500 rpm, flows, ~41 MW for both pumps; SSME: three stages, ~52 MW
 *   B4  MODEL FIDELITY      — cavitation onset speed found here by bisection on NPSH, vs the page's
 *   B7  CONSERVATION        — each stage ends exactly one stage-rise above where it began
 *   C1  insight: same pump, four liquids — same head, pressure in the ratio of the densities
 *   C2  insight: hydrogen needs stages — 3 for the shuttle pump, 1 for the others
 *   C3  insight: the inlet is the weak spot — raise the density or cut the tank pressure and it cavitates
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
const numC = s => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const norm = s => String(s).replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const RPM = Math.PI / 30;

/* ---------- the pump equations, reproduced here independently of the page ----------
 * Euler's pump equation with a Wiesner slip factor, and a Pearsall-form inducer NPSH.
 * Only the geometry (r1, r2, b2, stages, flow) and the named assumptions are read from the page.  */
const refPump = (G, K, { N, rho, beta, pin }) => {
  const w = N * RPM, b = beta * Math.PI / 180;
  const sg = 1 - Math.sqrt(Math.sin(b)) / Math.pow(K.Z_BL, 0.7);
  const u2 = w * G.r2, cm2 = G.Q / (2 * Math.PI * G.r2 * G.b2);
  const cu2 = sg * u2 - cm2 / Math.tan(b);
  const H = G.n * Math.max(K.ETA_H * u2 * cu2 / K.G0, 0);
  const dp = rho * K.G0 * H;
  const A1 = Math.PI * G.r1 * G.r1 * (1 - K.HUB * K.HUB), c1 = G.Q / A1;
  const npshrAt = Nn => { const u1 = Nn * RPM * G.r1, w1s = u1 * u1 + c1 * c1; return (K.LAM_C * c1 * c1 + K.LAM_W * w1s) / (2 * K.G0); };
  const npsha = (pin - G.pv) / (rho * K.G0) + c1 * c1 / (2 * K.G0);
  let lo = 0, hi = 2e6;                                   // bisection: the speed where required = available
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (npshrAt(m) < npsha) lo = m; else hi = m; }
  return { H, dp, u2, npshr: npshrAt(N), npsha, Ncav: npshrAt(0) >= npsha ? 0 : lo };
};

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
const setRho = rho => setRange('#rho', Math.log10(rho).toFixed(3));
const tab = async key => { await page.click(`#tabs button[data-s="${key}"]`); await sleep(500); };
const playing = () => page.$eval('#playBtn', b => /Pause/.test(b.textContent));
const pause = async () => { if (await playing()) await page.click('#playBtn'); };
const scrub = async frac => { await setRange('#prog', frac); await sleep(250); };
const hook = () => page.evaluate(() => window.__pump());
const parcel = t => page.evaluate(t => window.__parcel(t), t);
const inkFrac = sel => page.evaluate(s => {
  const c = document.querySelector(s); if (!c || !c.width) return 0;
  const g = c.getContext('2d'); const { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h).data;
  const br = d[8], bg = d[9], bb = d[10];        // pixel ~(2,2) — a corner, i.e. background
  let n = 0, tot = 0;
  for (let i = 0; i < d.length; i += 40) { tot++; if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 24) n++; }
  return n / tot;
}, sel);
const redPixels = sel => page.evaluate(s => {
  const c = document.querySelector(s); const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 150 && d[i + 2] < 150) n++;
  return n;
}, sel);

const TABS = ['f1lox', 'f1fuel', 'ssme', 'raptor', 'any'];

/* ============================================================ RENDERING (A) */
try {                                             // A1 no uncaught / console errors while exercising every tab + slider
  for (const k of TABS) {
    await tab(k);
    for (const s of ['#rate', '#spd', '#rho', '#beta', '#pin']) {
      const [mn, mx] = await page.$eval(s, e => [e.min, e.max]);
      await setRange(s, mn); await setRange(s, mx);
    }
    await scrub(0.5); await scrub(1.0);
  }
  await tab('f1lox');
  rec('A1', 'render', errors.length === 0,
    errors.length + ' errors' + (errors[0] ? ' — ' + errors[0] : ''), '0 pageerror / console.error');
} catch (e) { rec('A1', 'render', false, 'threw: ' + e.message, '0 errors'); }

try {                                             // A2 every canvas paints (non-blank once the drop has travelled)
  await tab('f1lox'); await scrub(1.0); await sleep(500);
  const m = await inkFrac('#main2d'), tr = await inkFrac('#cTrace'), rl = await inkFrac('#cRel'), tw = await inkFrac('#c3d');
  rec('A2', 'render', m >= 0.05 && tr >= 0.01 && rl >= 0.01 && tw >= 0.05,
    `main2d ${(m * 100).toFixed(1)}% · trace ${(tr * 100).toFixed(1)}% · relation ${(rl * 100).toFixed(1)}% · tower ${(tw * 100).toFixed(1)}%`,
    'main2d ≥ 5% ink · each plot ≥ 1% · tower inset ≥ 5%');
} catch (e) { rec('A2', 'render', false, 'threw: ' + e.message, 'ink thresholds'); }

try {                                             // A3 no horizontal overflow at two desktop sizes
  const out = [];
  for (const [w, h] of [[1280, 800], [1440, 900]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 }); await sleep(400);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    out.push(`${w}×${h}: scrollW ${sw} vs ${w} ${sw <= w + 2 ? 'ok' : 'OVERFLOW'}`);
  }
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 }); await sleep(300);
  rec('A3', 'render', out.every(s => /ok$/.test(s)), out.join(' · '), 'documentElement.scrollWidth ≤ innerWidth + 2 at every size');
} catch (e) { rec('A3', 'render', false, 'threw: ' + e.message, 'no overflow'); }

try {                                             // A4 readout rows sane on every tab
  const per = [];
  for (const k of TABS) {
    await tab(k); await scrub(1.0); await sleep(250);
    const o = await rows(); const keys = Object.keys(o);
    const bad = keys.filter(x => /NaN|undefined|Infinity/.test(o[x]) || o[x].trim() === '');
    per.push(`${k}:${keys.length}${bad.length ? '✗' + bad.join('/') : '✓'}`);
  }
  rec('A4', 'render', per.every(s => /✓$/.test(s) && parseInt(s.split(':')[1]) >= 20), per.join(' · '), '≥ 20 rows, zero NaN/undefined/blank, all five tabs');
} catch (e) { rec('A4', 'render', false, 'threw: ' + e.message, 'readout sane'); }

try {                                             // A5 every slider's label changes between min and max
  await tab('f1lox');
  const res = [];
  for (const [id, lab] of [['#rate', '#rateV'], ['#spd', '#spdV'], ['#rho', '#rhoV'], ['#beta', '#betaV'], ['#pin', '#pinV']]) {
    const [mn, mx] = await page.$eval(id, e => [e.min, e.max]);
    await setRange(id, mn); const a = await page.$eval(lab, e => e.textContent);
    await setRange(id, mx); const b = await page.$eval(lab, e => e.textContent);
    res.push(`${id.slice(1)}${a !== b ? '✓' : '✗'}`);
  }
  rec('A5', 'render', res.every(s => s.endsWith('✓')), res.join(' '), 'each slider label differs between min and max');
} catch (e) { rec('A5', 'render', false, 'threw: ' + e.message, 'sliders wired'); }

/* ============================================================ PHYSICS (B) */
try {                                             // B1 Euler's pump equation, at the design point and off-design
  const out = []; let worst = 0;
  for (const k of TABS) {
    await tab(k);
    for (const adj of [null, { spd: 1.3, beta: 40 }, { spd: 0.6, beta: 15 }]) {
      if (adj) {
        const h0 = await hook();
        await setRange('#spd', Math.round(h0.G.N0 * adj.spd / 50) * 50); await setRange('#beta', adj.beta);
      }
      const h = await hook(), want = refPump(h.G, h.K, h.R);
      const e1 = rel(h.R.H, want.H), e2 = rel(h.R.dp, want.dp); worst = Math.max(worst, e1, e2);
      if (!adj) out.push(`${k}: H ${h.R.H.toFixed(0)} vs ${want.H.toFixed(0)} m`);
    }
  }
  rec('B1', 'physics', worst < 0.005, out.join(' · ') + ` · worst error over 15 operating points ${(worst * 100).toFixed(3)}%`,
    'head and Δp within 0.5% of an independent Euler-equation recomputation, design and off-design');
} catch (e) { rec('B1', 'physics', false, 'threw: ' + e.message, 'Euler'); }

try {                                             // B2 head is independent of the liquid; pressure is ρ·g·H
  await tab('any');
  const pts = [];
  for (const rho of [70.85, 422.6, 810, 1141]) { await setRho(rho); const h = await hook(); pts.push({ rho: h.R.rho, H: h.R.H, dp: h.R.dp, shown: numC(await val('Head H')) }); }
  const dH = Math.max(...pts.map(p => rel(p.H, pts[0].H)));
  const dRatio = rel(pts[3].dp / pts[0].dp, pts[3].rho / pts[0].rho);   // the slider's actual densities, not the nominal ones
  const shownSame = pts.every(p => Math.abs(p.shown - pts[0].shown) <= 1);
  rec('B2', 'physics', dH < 1e-3 && dRatio < 1e-3 && shownSame,
    `head ${pts.map(p => p.H.toFixed(0)).join(' / ')} m · Δp LOX/LH₂ ${(pts[3].dp / pts[0].dp).toFixed(2)} vs ρ ratio ${(pts[3].rho / pts[0].rho).toFixed(2)} · readout head identical ${shownSame}`,
    'head identical (≤ 0.1%) across four liquids; Δp ratio = density ratio within 0.1%; readout agrees');
} catch (e) { rec('B2', 'physics', false, 'threw: ' + e.message, 'head vs density'); }

try {                                             // B3 cited anchors
  const p = {};
  for (const k of ['f1lox', 'f1fuel', 'ssme', 'raptor']) { await tab(k); p[k] = await hook(); }
  const f1 = (p.f1lox.R.shaft + p.f1fuel.R.shaft) / 1e6, ss = p.ssme.R.shaft / 1e6;
  const stg = ['f1lox', 'f1fuel', 'ssme', 'raptor'].map(k => p[k].G.n).join('/');
  const tips = ['f1lox', 'f1fuel', 'ssme', 'raptor'].map(k => p[k].R.u2.toFixed(0)).join('/');
  const dpOk = ['f1lox', 'f1fuel', 'ssme', 'raptor'].every(k => rel(p[k].R.dp, p[k].G.dp0) < 0.01);
  rec('B3', 'physics', Math.abs(f1 - 41) / 41 < 0.10 && Math.abs(ss - 52) / 52 < 0.10 && stg === '1/1/3/1' && dpOk && p.f1lox.R.N === 5500 && p.ssme.R.N === 37000,
    `F-1 both pumps ${f1.toFixed(1)} MW (reported 41) · SSME ${ss.toFixed(1)} MW (reported ~52) · stages ${stg} · tip speeds ${tips} m/s · design Δp reproduced ${dpOk}`,
    'F-1 total within 10% of 41 MW; SSME within 10% of 52 MW; stages 1/1/3/1; rpm 5,500 and 37,000; design Δp within 1%');
} catch (e) { rec('B3', 'physics', false, 'threw: ' + e.message, 'cited anchors'); }

try {                                             // B4 cavitation onset speed
  await tab('any');
  const h0 = await hook(), want = refPump(h0.G, h0.K, h0.R);
  const pageNcav = h0.R.Ncav, err = rel(pageNcav, want.Ncav);
  await tab('raptor');                              // the Raptor slider reaches its own onset speed (the F-1 one lies above its slider range)
  const h1 = await hook(), want1 = refPump(h1.G, h1.K, h1.R);
  const err1 = rel(h1.R.Ncav, want1.Ncav);
  const mn = parseFloat(await page.$eval('#spd', e => e.min)), mx = parseFloat(await page.$eval('#spd', e => e.max));
  const below = Math.floor(want1.Ncav * 0.97 / 50) * 50, above = Math.ceil(want1.Ncav * 1.03 / 50) * 50;
  let flips = false;
  if (below >= mn && above <= mx) {
    await setRange('#spd', below); const a = (await hook()).R.cav;
    await setRange('#spd', above); const b = (await hook()).R.cav;
    flips = !a && b;
  }
  rec('B4', 'physics', err < 0.005 && err1 < 0.005 && flips, `F-1 onset ${pageNcav.toFixed(0)} rpm vs bisection ${want.Ncav.toFixed(0)} (${(err * 100).toFixed(3)}%) · Raptor ${h1.R.Ncav.toFixed(0)} vs ${want1.Ncav.toFixed(0)} (${(err1 * 100).toFixed(3)}%) · Raptor flag flips across ±3% ${flips}`,
    'page onset speed within 0.5% of an independent NPSH bisection; cavitation flag flips from no to yes across ±3%');
} catch (e) { rec('B4', 'physics', false, 'threw: ' + e.message, 'cavitation onset'); }

try {                                             // B5 the drop is never "measured" before it arrives; the end equals the kernel
  await tab('ssme');
  const pts = [];
  for (const f of [0.0, 0.2, 0.5]) { await scrub(f); pts.push(await val('Measured rise')); }
  await scrub(1.0);
  const end = numC(await val('Measured rise')), pred = numC(await val('Predicted rise'));
  const h = await hook();
  const pEnd = (await parcel(h.G.D)).p - h.R.pin;
  rec('B5', 'physics', pts.every(s => s.trim() === '—') && rel(end, pred) < 0.01 && rel(pEnd, h.R.dp) < 0.005,
    `measured before arrival: [${pts.join(' | ')}] · at the end ${end} MPa vs predicted ${pred} MPa · trace end ${(pEnd / 1e6).toFixed(2)} vs ${(h.R.dp / 1e6).toFixed(2)} MPa`,
    'no measured rise before the drop leaves the last diffuser; at the end the reading equals the prediction within 1% and the trace within 0.5%');
} catch (e) { rec('B5', 'physics', false, 'threw: ' + e.message, 'no phantom measurement'); }

try {                                             // B6 play == scrub
  await tab('f1lox'); await page.click('#restartBtn'); await sleep(200);
  await page.click('#playBtn'); await sleep(1800); await pause();
  const played = await page.evaluate(() => ({ t: window.__pump().t, p: window.__parcel(window.__pump().t) }));
  const frac = await page.$eval('#prog', e => parseFloat(e.value));
  await scrub(0.0); await scrub(frac);
  const scrubbed = await page.evaluate(() => ({ t: window.__pump().t, p: window.__parcel(window.__pump().t) }));
  const dt = Math.abs(played.t - scrubbed.t) / played.t, dp = rel(scrubbed.p.p, played.p.p);
  rec('B6', 'physics', played.t > 0 && dt < 0.002 && dp < 0.003 && played.p.phase === scrubbed.p.phase,
    `played t ${(played.t * 1000).toFixed(3)} ms → ${(played.p.p / 1e6).toFixed(3)} MPa (${played.p.phase}) vs scrubbed ${(scrubbed.t * 1000).toFixed(3)} ms → ${(scrubbed.p.p / 1e6).toFixed(3)} MPa (${scrubbed.p.phase})`,
    'time within 0.2%, pressure within 0.3%, same phase between playing to a point and scrubbing to it');
} catch (e) { rec('B6', 'physics', false, 'threw: ' + e.message, 'play == scrub'); }

try {                                             // B7 conservation: each stage ends one stage-rise above where it began; monotone after the inducer
  await tab('ssme');
  const h = await hook(), { G, R } = h;
  const dpSt = R.dpSt ?? R.dp / G.n;
  const ends = [];
  for (let k = 1; k <= G.n; k++) ends.push((await parcel(k * G.Ts - G.Tx - 1e-9)).p - R.pin - k * dpSt);
  const worst = Math.max(...ends.map(e => Math.abs(e) / dpSt));
  let mono = true, last = -Infinity;
  for (let i = 0; i <= 400; i++) { const t = G.D * i / 400; const q = await parcel(t); if (q.tau !== undefined && q.k === 0 && q.tau < 0.1 * G.Ti) continue; if (q.p < last - 1e-6 * R.dp) { mono = false; break; } last = Math.max(last, q.p); }
  rec('B7', 'physics', worst < 0.005 && mono, `stage-end pressure errors ${ends.map(e => (e / dpSt * 100).toFixed(3) + '%').join(' / ')} · monotone after the inducer ${mono}`,
    'each of the 3 stages ends exactly one stage-rise above its start (0.5%); pressure never falls after the inducer dip');
} catch (e) { rec('B7', 'physics', false, 'threw: ' + e.message, 'conservation'); }

try {                                             // B8 the speed slider never reaches a speed that builds no pressure, at any blade angle
  const rows = []; let ok = true;
  for (const k of TABS) {
    await tab(k);
    for (const beta of [10, 25, 60]) {
      await setRange('#beta', beta);
      const mn = parseFloat(await page.$eval('#spd', e => e.min));
      await setRange('#spd', 0);                  // ask for the slowest speed; the browser clamps it to the floor
      const h = await hook();
      const spd = parseFloat(await page.$eval('#spd', e => e.value));
      ok = ok && spd >= mn && h.R.dp > 0 && h.R.dpSt > 0;
      if (beta === 60) rows.push(`${k}: floor ${mn} rpm → ${(h.R.dp / 1e6).toFixed(2)} MPa`);
    }
  }
  rec('B8', 'physics', ok, rows.join(' · '), 'at the slider floor the pump still builds pressure, for every tab and β₂ in {10°, 25°, 60°}');
} catch (e) { rec('B8', 'physics', false, 'threw: ' + e.message, 'speed floor'); }

/* ============================================================ INSIGHT (C) */
try {                                             // C1 same pump, four liquids: same head, pressure follows density
  await tab('any');
  const out = [];
  for (const [n, rho] of [['LH₂', 70.85], ['CH₄', 422.6], ['RP-1', 810], ['LOX', 1141]]) {
    await setRho(rho); await scrub(1.0);
    out.push(`${n} ${(await val('Head H')).replace(/ of liquid/, '')} → ${(await val('Measured rise'))}`);
  }
  const h = await hook();
  rec('C1', 'insight', out.length === 4 && /867/.test(out[3]) && out.every(s => s.split(' ')[1] === out[0].split(' ')[1]),
    out.join(' · '), 'one impeller, four liquids: the same head on screen for all, a measured rise proportional to density (LOX ≈ 16× LH₂)');
} catch (e) { rec('C1', 'insight', false, 'threw: ' + e.message, 'same head, different pressure'); }

try {                                             // C2 hydrogen needs stages
  const r = {};
  for (const k of ['f1lox', 'ssme', 'raptor']) { await tab(k); await scrub(1.0); r[k] = { stages: await val('Stages needed'), head: numC(await val('Head H')) }; }
  rec('C2', 'insight', /^3 \(pump has 3\)/.test(r.ssme.stages) && /^1 \(pump has 1\)/.test(r.f1lox.stages) && r.ssme.head / r.f1lox.head > 50,
    `SSME "${r.ssme.stages}" at ${r.ssme.head} m of hydrogen · F-1 "${r.f1lox.stages}" at ${r.f1lox.head} m of oxygen · head ratio ${(r.ssme.head / r.f1lox.head).toFixed(0)}×`,
    'shuttle hydrogen pump reads 3 stages needed (and has 3), the F-1 reads 1; the hydrogen tower is > 50× taller');
} catch (e) { rec('C2', 'insight', false, 'threw: ' + e.message, 'stages'); }

try {                                             // C3 the inlet is the weak spot
  await tab('any'); await scrub(1.0);
  const before = { cav: (await hook()).R.cav, red: await redPixels('#main2d'), row: await val('Cavitation margin') };
  await setRho(1141); await setRange('#pin', 0.12); await sleep(300);
  const after = { cav: (await hook()).R.cav, red: await redPixels('#main2d'), row: await val('Cavitation margin') };
  rec('C3', 'insight', !before.cav && after.cav && /CAVITATING/.test(after.row) && after.red > before.red + 30,
    `margin ${before.row} → ${after.row} · red pixels on the stage ${before.red} → ${after.red}`,
    'with the design tank pressure no cavitation; cut the tank pressure and the readout says CAVITATING and vapour pockets appear on the blades');
} catch (e) { rec('C3', 'insight', false, 'threw: ' + e.message, 'cavitation'); }

try {                                             // C5 the units card ties its units to everyday things
  const t = await page.evaluate(() => document.querySelector('#explain').textContent);
  const d = { atm: /atmosphere/i.test(t), car: /family car/i.test(t), sound: /speed of sound/i.test(t), rpm: /motorway|rpm/i.test(t) };
  rec('C5', 'insight', Object.values(d).every(Boolean), `atmosphere:${d.atm} · family car:${d.car} · speed of sound:${d.sound} · rpm anchor:${d.rpm}`,
    'units card ties MPa, MW, m/s and rpm each to a concrete everyday reference');
} catch (e) { rec('C5', 'insight', false, 'threw: ' + e.message, 'units card'); }

try {                                             // C6 approximations disclosed, every source chipped
  await tab('raptor');
  const d = await page.evaluate(() => ({
    cav: document.querySelectorAll('#explain .cav').length,
    tips: document.querySelectorAll('#rdl [title]').length,
    chips: document.querySelectorAll('#rdl i.tg').length,
    est: /ESTIMATE/.test(document.querySelector('#rdl').textContent) || document.querySelectorAll('#rdl i.tg.est').length > 0,
    disc: /estimate|±|schematic|meanline/i.test(document.querySelector('#explain').textContent + ' ' + document.querySelector('#stagewrap').textContent),
  }));
  rec('C6', 'insight', d.cav >= 1 && d.tips >= 5 && d.chips >= 5 && d.est && d.disc,
    `caveat lines ${d.cav} · readout tooltips ${d.tips} · confidence chips ${d.chips} · Raptor carries ESTIMATE chips ${d.est} · disclosure language ${d.disc}`,
    '≥ 1 caveat line, ≥ 5 defining tooltips, ≥ 5 confidence chips, ESTIMATE shown for the Raptor tab, explicit estimate/±/meanline language');
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
