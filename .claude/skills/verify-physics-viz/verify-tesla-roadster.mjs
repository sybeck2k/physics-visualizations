/* verify-tesla-roadster — executable acceptance harness for tesla-roadster.html.
 *
 * Usage (inside the puppeteer container — see SKILL.md for the exact docker line):
 *   node verify-tesla-roadster.mjs /work/target.html
 *
 * Prints one row per check and exits 1 if any check FAILs.
 *   A* rendering — page runs, WebGL paints (or degrades), every control is wired, scrub == play
 *   B* physics   — numbers match the data pack's closed-form / reported anchors
 *   C* insight   — the thing each tab teaches is legible on screen
 */
import puppeteer from 'puppeteer';

const FILE = process.argv[2];
if (!FILE) { console.error('usage: node verify-tesla-roadster.mjs <path-to.html>'); process.exit(2); }
const results = [];
const rec = (id, cat, pass, measured, threshold) => results.push({ id, cat, pass: !!pass, measured: String(measured), threshold });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const firstNum = s => { const m = String(s ?? '').replace(/−/g, '-').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const near = (v, t, tol) => Math.abs(v - t) <= tol;

const GLARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await puppeteer.launch({ headless: 'new', args: GLARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 940, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.goto('file://' + FILE, { waitUntil: 'load' });
await sleep(1800);

const rows = () => page.evaluate(() => { const o = {}; document.querySelectorAll('#rdl dt').forEach(dt => { const dd = dt.nextElementSibling; if (dd && dd.tagName === 'DD') o[dt.textContent.trim()] = dd.textContent || ''; }); return o; });
const val = async name => { const o = await rows(); const k = Object.keys(o).find(x => x === name) || Object.keys(o).find(x => x.includes(name)); return k ? o[k] : null; };
const setRange = async (sel, v) => { await page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v); await sleep(200); };
const preset = async p => { await page.evaluate(p => { RDX.setPreset(p); }, p); await sleep(500); };
const playing = () => page.$eval('#playBtn', b => /Pause/.test(b.textContent));
const K = (fn, ...a) => page.evaluate((fn, a) => { const r = RDX[fn](...a); return r && r.info ? r.info : r; }, fn, a);
const E = expr => page.evaluate(expr);

/* ============ A. rendering ============ */
const glok = await E('RDX.GL.ok');
const dims = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.width, r.height]; });
rec('A1', 'render', errors.length === 0 && dims[0] > 500 && dims[1] > 250, `errors=${errors.length} stage=${dims.map(Math.round).join('×')} webgl=${glok}`, 'no page errors; stage ≥ 500×250');

const PRESETS = ['launch', 'hover', 'roll', 'climb', 'park', 'corner'];
const shot = async () => {
  const b64 = await page.screenshot({ encoding: 'base64', clip: { x: 260, y: 56, width: 900, height: 330 } });
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, seen = new Map(); let n = 0;
    for (let i = 0; i < d.length; i += 4 * 9) { const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4); seen.set(k, (seen.get(k) || 0) + 1); n++; }
    return { colours: seen.size, top: Math.max(...seen.values()) / n };
  }, b64);
};
const paint = {};
for (const p of PRESETS) { await preset(p); await E('RDX.S.started = true; RDX.S.t = RDX.S.dur * 0.45;'); await sleep(900); paint[p] = await shot(); }
rec('A2', 'render', Object.values(paint).every(s => s.colours >= 12 && s.top < 0.9) || !glok,
  PRESETS.map(p => `${p}:${paint[p].colours}c/${(paint[p].top * 100).toFixed(0)}%`).join(' '), 'each preset paints ≥12 distinct colours, no colour > 90% of the stage');

const rowsOK = {};
for (const p of PRESETS) { await preset(p); const o = await rows(); rowsOK[p] = Object.keys(o).length; }
rec('A3', 'render', PRESETS.every(p => rowsOK[p] >= 6) && errors.length === 0, PRESETS.map(p => `${p}:${rowsOK[p]}`).join(' '), 'every preset fills ≥6 readout rows, no errors while switching');

// A4 every slider is wired: moving it changes a label and the readouts/plots change
const sliderTests = { launch: ['pres', 'isp', 'mass', 'thr', 'sup', 'mu'], roll: ['v0', 'ang', 'rt'], climb: ['vc'], park: ['th0', 'fade'] };
let wired = 0, total = 0; const bad = [];
for (const [p, ids] of Object.entries(sliderTests)) for (const id of ids) {
  await preset(p); const before = await E(`document.getElementById('${id}V').textContent + '|' + document.getElementById('rdl').textContent`);
  const [mn, mx] = await page.$eval('#' + id, e => [+e.min, +e.max]); await setRange('#' + id, id === 'mass' || id === 'pres' ? mx : mn + (mx - mn) * 0.2);
  const after = await E(`document.getElementById('${id}V').textContent + '|' + document.getElementById('rdl').textContent`);
  total++; if (before !== after) wired++; else bad.push(p + ':' + id);
}
rec('A4', 'render', wired === total, `${wired}/${total} wired${bad.length ? ' — dead: ' + bad.join(',') : ''}`, 'every slider changes its label and the readouts');

// A5 scrub == play: rows at time t are identical after scrubbing from 0, from the end, and after a re-parameterise
let scrubOK = true, scrubNote = [];
for (const p of ['launch', 'climb']) {
  await preset(p); await page.click('#playBtn'); await sleep(900); if (await playing()) await page.click('#playBtn'); await sleep(150);
  const frac = Math.round(await E('RDX.S.t / RDX.S.dur * 1000')) / 1000; await setRange('#prog', frac); await sleep(250); const snap = async () => { const o = await rows(); delete o['Time']; return JSON.stringify(o); };
  const a = await snap();
  await setRange('#prog', 0); await setRange('#prog', frac); const b = await snap();
  await setRange('#prog', 1); await setRange('#prog', frac); const c = await snap();
  const mid = await E(`+document.getElementById('mass').value`); await setRange('#mass', 2000); await setRange('#mass', mid); await setRange('#prog', frac); const d = await snap();
  const ok = a === b && b === c && c === d; scrubOK = scrubOK && ok; if (!ok) scrubNote.push(p);
}
rec('A5', 'render', scrubOK, scrubOK ? 'identical' : 'drift in ' + scrubNote.join(','), 'rows identical after scrub-from-0, scrub-from-end and re-parameterise');

// A6 no-WebGL fallback: sim, plots and readouts keep running
{
  const b2 = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-webgl', '--disable-3d-apis'] });
  const p2 = await b2.newPage(); const er2 = []; p2.on('pageerror', e => er2.push(e.message));
  await p2.goto('file://' + FILE, { waitUntil: 'load' }); await sleep(1200);
  const info = await p2.evaluate(() => ({ nogl: getComputedStyle(document.getElementById('nogl')).display, rows: document.querySelectorAll('#rdl dt').length, ok: RDX.GL.ok }));
  rec('A6', 'render', info.nogl === 'flex' && info.rows >= 6 && er2.length === 0 && info.ok === false, `fallback=${info.nogl} rows=${info.rows} errors=${er2.length}`, 'message shown, readouts still populated, no errors');
  await b2.close();
}
// A7 the optional sound path does not throw
await preset('launch'); await page.click('#snd'); await page.click('#playBtn'); await sleep(500); await page.click('#playBtn'); await page.click('#snd');
rec('A7', 'render', errors.length === 0, `errors=${errors.length}`, 'toggling sound + play raises no error');

/* ============ B. physics anchors ============ */
const m379 = await K('tankMass', 379), m437 = await K('tankMass', 437);
rec('B1', 'physics', near(m379, 228, 3) && near(m437, 250, 3), `${m379.toFixed(1)} kg @379 bar · ${m437.toFixed(1)} kg @437 bar`, '228 ± 3 kg and 250 ± 3 kg (data pack §4b, CoolProp)');
const blow = await page.evaluate(() => [0.75, 0.5, 0.25].map(f => { const tk = RDX.newTank(437); const target = tk.m0 * f; while (tk.m > target) RDX.tankBurn(tk, 2000, 60, 0.001); return [RDX.thrustAvail(tk.p) / RDX.thrustAvail(437), tk.T - 273.15]; }));
rec('B2', 'physics', blow.every((b, i) => near(b[0], [0.67, 0.38, 0.14][i], 0.02) && near(b[1], [-12, -51, -105][i], 3)), blow.map(b => `${b[0].toFixed(2)}/${b[1].toFixed(0)}°C`).join('  '), 'thrust fraction 0.67/0.38/0.14 and gas T −12/−51/−105 °C at 75/50/25 % air (§4c)');
const te = await page.evaluate(() => [54, 60, 70.7].map(i => RDX.timeToEmpty(250, 80000, i)));
rec('B3', 'physics', te.every((v, i) => near(v, [1.65, 1.84, 2.17][i], 0.05)), te.map(v => v.toFixed(2)).join(' / ') + ' s', '1.65 / 1.84 / 2.17 s to empty 250 kg at 80 kN, Isp 54/60/70.7 (§4c)');
const L = await K('simLaunch', { p0: 437, isp: 60, mass: 1700, thr: 0.49, sup: 2, mu: 1.26 });
rec('B4', 'physics', near(L.t60, 0.81, 0.03) && L.x60 >= 10 && L.x60 <= 12, `t60 ${L.t60.toFixed(3)} s · ${L.x60.toFixed(1)} m`, '0.81 ± 0.03 s and 10–12 m (live run, reported ≈11 m)');
const h1 = await K('hoverThrust', 1700), h2 = await K('hoverThrust', 2350);
rec('B5', 'physics', near(h1 / 1000, 16.7, 0.1) && near(h2 / 1000, 23.0, 0.1), `${(h1 / 1000).toFixed(2)} / ${(h2 / 1000).toFixed(2)} kN`, '16.7 / 23.0 kN to hover 1,700 / 2,350 kg (§6)');
const H = await K('simHover', { p0: 437, isp: 60, mass: 2350, thr: 1 });
rec('B6', 'physics', H.hoverT >= 3.5 && H.hoverT <= 5.5, `${H.hoverT.toFixed(2)} s`, 'usable hover 3.5–5.5 s at 2,350 kg (data pack ≈4–5 s)');
const dfN = await E('RDX.DOWNFORCE_N');
rec('B7', 'physics', near(dfN / 1000, 46.1, 0.1) && near(dfN / (1700 * 9.80665), 2.76, 0.02) && near(dfN / (2350 * 9.80665), 2.0, 0.01), `${(dfN / 1000).toFixed(1)} kN · ${(dfN / (1700 * 9.80665)).toFixed(2)} g @1700 · ${(dfN / (2350 * 9.80665)).toFixed(2)} g @2350`, '46.1 kN; 2.76 g @1,700 kg; 2.00 g @2,350 kg (§3a, §5b)');
const hold = await page.evaluate(() => [RDX.wallState(Math.PI, 1.05, 1.26, 0).ok, RDX.wallState(Math.PI, 0.95, 1.26, 0).ok, RDX.cornerG(0, 1.26), RDX.cornerG(2, 1.26)]);
rec('B8', 'physics', hold[0] === true && hold[1] === false && near(hold[2], 1.26, 0.01) && near(hold[3], 2.2, 0.1), `hold@1.05g=${hold[0]} hold@0.95g=${hold[1]} corner ${hold[2].toFixed(2)} / ${hold[3].toFixed(2)} g`, 'upside-down holds iff s > 1 g; corner 1.26 g without fans, 2.2 ± 0.1 g with 2 g');
const W = await K('simWall', { mode: 'climb', s: 2, mass: 1700, mu: 1.26, vc: 6, p0: 437, isp: 60, hold: 1, fade: 0.25 });
rec('B9', 'physics', W.brakeY >= 5.5 && W.brakeY <= 7.5 && near(W.gPeak, 3.3, 0.1) && W.vTouch < 3 && W.landed, `burn from ${W.brakeY.toFixed(1)} m · peak ${W.gPeak.toFixed(2)} g · touch ${W.vTouch.toFixed(1)} m/s`, 'landing burn from 5.5–7.5 m (reported ≈6.5 m), 3.3 ± 0.1 g, touch-down < 3 m/s');
const R2 = await K('simRoll', { p0: 437, isp: 60, mass: 2350, v0: 14, ang: 49, rt: 2 });
rec('B10', 'physics', near(R2.I, 1020, 5) && near(R2.tauBB / 1000, 6.4, 0.1) && R2.tau / R2.tauBB > 1.3 && R2.tau / R2.tauBB < 1.8, `I ${R2.I.toFixed(0)} kg·m² · gentlest roll ${(R2.tauBB / 1000).toFixed(2)} kN·m · push-coast-brake ${(R2.tau / 1000).toFixed(2)} kN·m`, 'I ≈ 1,020 kg·m² and 6.4 kN·m for the gentlest 2.0 s roll at 2,350 kg (§6); the push-coast-brake pulse needs 1.3–1.8× that');
const Rn = await K('simRoll', { p0: 437, isp: 60, mass: 1700, v0: 14, ang: 49, rt: 2 });
rec('B11', 'physics', Rn.landOK && near(Rn.apex, 7, 0.6), `apex ${Rn.apex.toFixed(1)} m · rolled ${Rn.rolledDeg.toFixed(0)}°`, 'default kick-flip: apex 7 ± 0.6 m (reported ≈7 m), lands after 360°');
const climb = await E('(()=>{const a=RDX.minSuction(170,1.26,0);const b=RDX.thetaMax(1,1.26,0);return [a,b]})()');
rec('B12', 'physics', climb[0] > 1.0 && climb[0] < 1.1 && climb[1] > 110 && climb[1] < 140, `min suction to 170° ${climb[0].toFixed(2)} g · max pitch at 1 g ${climb[1].toFixed(0)}°`, 'getting there needs slightly more than 1 g; at exactly 1 g the climb fails at 110–140°');

// B13 the side jets fire in sequence: push (L-down + R-up), coast (none), brake (L-up + R-down), and the roll ends at 360°
const seq = await page.evaluate(() => {
  const tr = RDX.simRoll({ p0: 437, isp: 60, mass: 1700, v0: 14, ang: 49, rt: 2 }), i = tr.info, c = tr.c, at = t => Math.round(t / tr.dt), g = (k, t) => c[k][at(t)];
  const tp = i.t0 + i.ta / 2, tc = i.t0 + i.Teff / 2, tb = i.t0 + i.Teff - i.ta / 2;
  return { push: g('JLd', tp) > 0 && g('JRu', tp) > 0 && g('JLu', tp) === 0 && g('JRd', tp) === 0,
           coast: g('JLd', tc) + g('JRu', tc) + g('JLu', tc) + g('JRd', tc) === 0,
           brake: g('JLu', tb) > 0 && g('JRd', tb) > 0 && g('JLd', tb) === 0 && g('JRu', tb) === 0,
           deg: i.rolledDeg, omega: i.omegaDeg, ok: i.landOK };
});
rec('B13', 'physics', seq.push && seq.coast && seq.brake && seq.ok, `push ${seq.push} · coast ${seq.coast} · brake ${seq.brake} · ω ${seq.omega.toFixed(0)}°/s · ${seq.deg.toFixed(0)}°`, 'side jets: push couple, then none while spinning, then the opposite couple; ends at 360°');

/* ============ C. insight legible ============ */
await preset('launch'); let r = await rows();
const pred = firstNum(r['Predicted 0–60 mph']);
rec('C1', 'insight', near(pred, 0.81, 0.03) && /≈/.test(r['Predicted 0–60 mph'] || ''), r['Predicted 0–60 mph'], 'prediction printed up front with a leading ≈ before Play');
const preds = {};
for (const [p, k] of [['hover', 'Predicted hover time'], ['roll', 'Apex height'], ['climb', 'Max pitch held'], ['corner', 'Cornering limit (fans)']]) { await preset(p); preds[p] = await val(k); }
rec('C2', 'insight', Object.values(preds).every(v => v && !isNaN(firstNum(v))), JSON.stringify(preds), 'every preset shows its headline prediction at t = 0');
let chipped = 0, all = 0; for (const p of PRESETS) { await preset(p); const c = await page.evaluate(() => [...document.querySelectorAll('#rdl dd')].map(d => !!d.querySelector('i.tg'))); all += c.length; chipped += c.filter(Boolean).length; }
rec('C3', 'insight', chipped / all >= 0.6, `${chipped}/${all} rows carry a confidence chip`, '≥ 60 % of readout rows carry an OFFICIAL/INTERVIEW/REPORTED/DERIVED/ESTIMATE/ASSUMED chip');
const cards = {}; for (const s of ['launch', 'climb']) { await preset(s); cards[s] = await page.evaluate(() => [document.querySelectorAll('#explain .ex').length, document.querySelectorAll('#explain p.cav').length]); }
rec('C4', 'insight', Object.values(cards).every(c => c[0] === 5 && c[1] >= 1), JSON.stringify(cards), 'five explainer cards per tab, at least one italic model caveat');
await preset('climb'); await page.click('#fixed'); await sleep(250);
const fan = await val('Fan suction now'); await page.click('#fixed');
await E('RDX.S.t = RDX.S.dur * 0.2'); await sleep(300);
rec('C5', 'insight', /2\.76/.test(fan || '') || near(firstNum(fan), 2.76, 0.02) , fan, 'ticking the 4,700 kg box makes the fans read 2.76 g at 1,700 kg');
// C6 dragging the pressure gauge changes the tank
await preset('launch'); const pBefore = await E(`+document.getElementById('pres').value`);
const box = await page.$eval('#inset2d', e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
await page.mouse.move(box[0] + 20, box[1] + box[3] * (130 / 190)); await page.mouse.down(); await page.mouse.move(box[0] + 22, box[1] + box[3] * (90 / 190), { steps: 4 }); await page.mouse.up(); await sleep(250);
const pAfter = await E(`+document.getElementById('pres').value`);
rec('C6', 'insight', Math.abs(pAfter - pBefore) > 30, `${pBefore} → ${pAfter} bar`, 'dragging the inset gauge moves the tank-pressure slider');
// C7 orbit drag moves the camera; double-click recentres
const cam0 = await E('RDX.S.cam.dyaw'); const gb = await page.$eval('#gl', e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
await page.mouse.move(gb[0] + 300, gb[1] + 200); await page.mouse.down(); await page.mouse.move(gb[0] + 380, gb[1] + 210, { steps: 5 }); await page.mouse.up(); const cam1 = await E('RDX.S.cam.dyaw');
await page.mouse.click(gb[0] + 300, gb[1] + 200, { count: 2 }); await sleep(150); const cam2 = await E('RDX.S.cam.dyaw');
rec('C7', 'insight', cam1 !== cam0 && cam2 === 0, `dyaw ${cam0} → ${cam1.toFixed(2)} → ${cam2}`, 'dragging the scene orbits the camera, double-click recentres');
rec('A8', 'render', errors.length === 0, `errors=${errors.length}${errors.length ? ' — ' + errors[0] : ''}`, 'no page errors across the whole run');

/* ---------- report ---------- */
await browser.close();
const w = Math.max(...results.map(x => x.id.length));
let fail = 0;
for (const x of results.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))) {
  if (!x.pass) fail++;
  console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.id.padEnd(w)}  [${x.cat}]  ${x.measured}   (need: ${x.threshold})`);
}
console.log(fail ? `\n${fail} check(s) FAILED` : '\nall checks PASS');
process.exit(fail ? 1 : 0);
