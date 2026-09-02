/* verify-physics-viz — executable acceptance harness for a standalone physics viz.
 *
 * Usage (inside the puppeteer container — see SKILL.md for the exact docker line):
 *   NODE_PATH=/home/pptruser/node_modules node verify.mjs /work/sonic-boom.html
 *
 * Prints one row per check and exits 1 if any check FAILs.
 * Every check has a stated numeric or string threshold. No check reduces to "looks good".
 *
 *   A* rendering    — the page runs, paints, fits, and every control is wired
 *   B* physics      — numbers match closed-form results and real-world calibration anchors
 *   C* insight      — the thing the viz exists to teach is actually legible on screen
 */
import puppeteer from 'puppeteer';

const FILE = process.argv[2];
if (!FILE) { console.error('usage: node verify.mjs <path-to.html>'); process.exit(2); }

const results = [];
const rec = (id, cat, pass, measured, threshold) =>
  results.push({ id, cat, pass: !!pass, measured: String(measured), threshold });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const GAMMA = 1.4, RGAS = 287.05;
const atmoA = z => {                       // US Standard Atmosphere 1976, layers 0–1 (z ≤ 20 km)
  const T = z < 11000 ? 288.15 - 6.5 * (z / 1000) : 216.65;
  return Math.sqrt(GAMMA * RGAS * T);
};
const firstNum = s => { const m = String(s ?? '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const norm = s => String(s).replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();

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
  await sleep(150);
};
const tab = async key => { await page.click(`#tabs button[data-s="${key}"]`); await sleep(340); };
const playing = () => page.$eval('#playBtn', b => /Pause/.test(b.textContent));
const play = async () => { if (!(await playing())) await page.click('#playBtn'); };
const pause = async () => { if (await playing()) await page.click('#playBtn'); };
const restart = async () => { await page.click('#restartBtn'); await sleep(250); };
const scrub = async frac => { await setRange('#prog', frac); await sleep(120); };
const waitBoom = async (maxMs = 40000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const o = await val('Observer');
    if (o && /BOOM|received/i.test(o)) return true;
    if (!(await playing())) return /BOOM|received/i.test((await val('Observer')) || '');
    await sleep(500);
  }
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

/* ============================================================ RENDERING (A) */
try {                                             // A1 no uncaught / console errors while exercising every tab + slider
  for (const k of ['accel', 'cruise', 'booster', 'lowboom']) {
    await tab(k);
    for (const s of ['#rate', '#mach', '#alt', '#len', '#lat', '#mend', '#acc', '#bm', '#bd']) {
      if (await page.$(s) && await page.$eval(s, e => e.offsetParent !== null)) {
        const [mn, mx] = await page.$eval(s, e => [e.min, e.max]);
        await setRange(s, mn); await setRange(s, mx);
      }
    }
  }
  await tab('cruise'); await setRange('#lat', 0);
  rec('A1', 'render', errors.length === 0,
    errors.length + ' errors' + (errors[0] ? ' — ' + errors[0] : ''), '0 pageerror / console.error');
} catch (e) { rec('A1', 'render', false, 'threw: ' + e.message, '0 errors'); }

try {                                             // A2 every canvas paints (non-blank after a boom)
  await tab('cruise'); await setRange('#mach', 2.0); await setRange('#alt', 15000); await setRange('#lat', 0); await setRange('#rate', 5);
  await restart(); await play(); await waitBoom(35000); await sleep(1500); await pause();
  const m = await inkFrac('#main2d'), nw = await inkFrac('#cNwave'), at = await inkFrac('#cAtten');
  rec('A2', 'render', m >= 0.05 && nw >= 0.01 && at >= 0.01,
    `main2d ${(m * 100).toFixed(1)}% · nwave ${(nw * 100).toFixed(1)}% · atten ${(at * 100).toFixed(1)}%`,
    'main2d ≥ 5% ink · each plot ≥ 1% ink');
} catch (e) { rec('A2', 'render', false, 'threw: ' + e.message, 'ink thresholds'); }

try {                                             // A3 body never scrolls horizontally at common sizes
  let ok = true, detail = [];
  for (const [w, h] of [[1280, 800], [1440, 900]]) {
    await page.setViewport({ width: w, height: h }); await sleep(250);
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
  for (const k of ['accel', 'cruise', 'booster', 'lowboom']) {
    await tab(k); await setRange('#lat', 0);
    const o = await rows(); const vals = Object.values(o);
    const bad = vals.filter(v => v === '' || /\b(undefined|NaN|Infinity)\b/.test(v));
    const rowsN = Object.keys(o).length;
    if (rowsN < 8 || bad.length) { ok = false; detail.push(`${k}: ${rowsN} rows, bad=[${bad.join(',')}]`); }
    else detail.push(`${k}:${rowsN}✓`);
  }
  rec('A4', 'render', ok, detail.join(' · '), '≥ 8 rows, zero NaN/undefined/blank, all four scenarios');
} catch (e) { rec('A4', 'render', false, 'threw: ' + e.message, 'readout sane'); }

try {                                             // A5 every slider drives its own label
  await tab('cruise');
  let ok = true, detail = [];
  for (const id of ['mach', 'alt', 'len', 'lat', 'rate']) {
    if (!(await page.$(`#${id}`))) continue;
    const [mn, mx] = await page.$eval(`#${id}`, e => [e.min, e.max]);
    await setRange(`#${id}`, mn); const a = await page.$eval(`#${id}V`, e => e.textContent);
    await setRange(`#${id}`, mx); const b = await page.$eval(`#${id}V`, e => e.textContent);
    if (a === b) { ok = false; detail.push(`${id}:dead`); } else detail.push(`${id}✓`);
  }
  await setRange('#lat', 0);
  rec('A5', 'render', ok, detail.join(' '), 'each slider label differs between min and max');
} catch (e) { rec('A5', 'render', false, 'threw: ' + e.message, 'sliders wired'); }

/* ============================================================ PHYSICS (B) */
try {                                             // B1 Mach angle is exactly arcsin(1/M)
  await tab('cruise'); await setRange('#alt', 12000); let worst = 0, detail = [];
  for (const M of [1.5, 2.0, 2.5]) {
    await setRange('#mach', M);
    const got = firstNum(await val('Mach angle μ'));
    const want = Math.asin(1 / M) * 180 / Math.PI;
    worst = Math.max(worst, Math.abs(got - want));
    detail.push(`M${M}: ${got.toFixed(2)}° vs ${want.toFixed(2)}°`);
  }
  rec('B1', 'physics', worst < 0.2, detail.join(' · ') + ` (max err ${worst.toFixed(3)}°)`, 'error < 0.2°');
} catch (e) { rec('B1', 'physics', false, 'threw: ' + e.message, '< 0.2°'); }

try {                                             // B2 local sound speed matches US Standard Atmosphere
  await tab('cruise'); await setRange('#mach', 1.8); let worst = 0, detail = [];
  for (const z of [6000, 11000, 16000]) {
    await setRange('#alt', z);
    const got = firstNum(await val('Local a')); const want = atmoA(z);
    worst = Math.max(worst, Math.abs(got - want));
    detail.push(`${z / 1000}km: ${got.toFixed(1)} vs ${want.toFixed(1)}`);
  }
  rec('B2', 'physics', worst < 1.5, detail.join(' · ') + ` (max err ${worst.toFixed(2)} m/s)`, 'error < 1.5 m/s');
} catch (e) { rec('B2', 'physics', false, 'threw: ' + e.message, '< 1.5 m/s'); }

try {                                             // B3 CALIBRATION ANCHORS — Concorde and the X-59 land where the real world puts them
  await tab('cruise');
  await setRange('#mach', 2.0); await setRange('#alt', 18000); await setRange('#len', 62); await setRange('#lat', 0); await setRange('#rate', 5);
  await restart(); await play(); const g1 = await waitBoom(45000); await sleep(2500); await pause();
  const concordePa = firstNum(await val('Peak Δp'));
  await tab('lowboom'); await setRange('#lat', 0); await setRange('#rate', 5);
  await restart(); await play(); const g2 = await waitBoom(40000); await sleep(2500); await pause();
  const x59str = (await val('Peak Δp')) || '';
  const x59psf = firstNum(x59str.split('·')[1] || '');           // "NNN Pa · X.XX psf"
  const x59pl = firstNum(await val('Perceived'));
  const okC = g1 && concordePa >= 67 && concordePa <= 150;
  const okX = g2 && x59psf >= 0.18 && x59psf <= 0.42 && x59pl >= 71 && x59pl <= 79;
  rec('B3', 'physics', okC && okX,
    `Concorde ${concordePa.toFixed(0)} Pa · X-59 ${x59psf.toFixed(2)} psf / ${x59pl.toFixed(0)} PLdB`,
    'Concorde ∈ 67–150 Pa · X-59 ∈ 0.18–0.42 psf and 71–79 PLdB');
} catch (e) { rec('B3', 'physics', false, 'threw: ' + e.message, 'calibration anchors'); }

try {                                             // B4 no phantom pre-arrival signature when scrubbing the timeline
  await tab('accel'); await setRange('#lat', 0); await restart(); await pause();
  const seen = [];
  for (const f of [0.08, 0.16, 0.24]) { await scrub(f); seen.push(await val('Peak Δp')); }
  const stable = new Set(seen.map(norm)).size === 1;
  rec('B4', 'physics', stable && /-/.test(norm(seen[0])),
    `Peak Δp at 3 pre-arrival scrub points: [${seen.join(' | ')}]`,
    'identical at all three points, and "—" (no signature before a wavefront arrives)');
} catch (e) { rec('B4', 'physics', false, 'threw: ' + e.message, 'no phantom signature'); }

try {                                             // B5 scrubbing to t gives the same physics as playing to t
  await tab('cruise'); await setRange('#mach', 1.8); await setRange('#alt', 12000); await setRange('#len', 60); await setRange('#lat', 0); await setRange('#rate', 5);
  await restart(); await play(); await waitBoom(35000); await sleep(3000); await pause();
  const dpA = firstNum(await val('Peak Δp')), plA = firstNum(await val('Perceived'));
  await restart(); await scrub(0.95); await sleep(400);
  const dpB = firstNum(await val('Peak Δp')), plB = firstNum(await val('Perceived'));
  const dRel = Math.abs(dpA - dpB) / Math.max(dpA, 1), dPl = Math.abs(plA - plB);
  rec('B5', 'physics', dRel < 0.10 && dPl <= 2,
    `played ${dpA.toFixed(0)} Pa / ${plA} PLdB vs scrubbed ${dpB.toFixed(0)} Pa / ${plB} PLdB (Δ ${(dRel * 100).toFixed(1)}% / ${dPl})`,
    'Δp within 10% and PLdB within 2');
} catch (e) { rec('B5', 'physics', false, 'threw: ' + e.message, 'play == scrub'); }

try {                                             // B6 booster: boom is generated high, near Mach 1, and lands within seconds of touchdown
  await tab('booster'); await setRange('#lat', 0); await setRange('#rate', 5);
  await restart(); await play(); const g = await waitBoom(45000); await sleep(2500); await pause();
  const madeAt = firstNum(await val('Boom made at'));                       // km
  const vs = norm(await val('Boom vs. touchdown') || '');
  const hasNum = /\d/.test(vs);
  const dt = hasNum ? Math.abs(firstNum(vs)) : 0;
  const srcOK = madeAt >= 3 && madeAt <= 25;
  const timeOK = g && /touchdown/i.test(vs) && !/^-/.test(vs) && dt <= 20;
  rec('B6', 'physics', srcOK && timeOK, `made at ${madeAt.toFixed(1)} km · "${vs}"`,
    'source altitude 3–25 km, boom arrives within ±20 s of touchdown');
} catch (e) { rec('B6', 'physics', false, 'threw: ' + e.message, 'Mach cut-off direction / timing'); }

try {                                             // B7 the N-wave ages: T_N grows on a longer slant path
  await tab('cruise'); await setRange('#mach', 2.0); await setRange('#alt', 15000); await setRange('#lat', 0); await setRange('#rate', 5);
  await restart(); await play(); await waitBoom(35000); await sleep(2500); await pause();
  const tn0 = firstNum(await val('N-wave T_N'));
  await setRange('#lat', 35); await sleep(400);
  const tn1 = firstNum(await val('N-wave T_N'));
  rec('B7', 'physics', tn1 > tn0 * 1.05, `T_N ${tn0.toFixed(0)} ms on-track → ${tn1.toFixed(0)} ms at 35 km lateral`,
    'T_N grows ≥ 5% with a longer path (the r^¼ aging term is live, not pinned to 1)');
} catch (e) { rec('B7', 'physics', false, 'threw: ' + e.message, 'N-wave ages'); }

try {                                             // B8 the acceleration superboom is drawn as an amplified U-wave (structural, constant-invariant)
  await tab('accel');
  await setRange('#mend', 2.2); await setRange('#acc', 1.0); await setRange('#alt', 8000);
  await setRange('#lat', 0); await setRange('#rate', 5);
  await restart(); await play();
  let shape = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {                // poll Boom shape directly — immune to auto-pause timing
    shape = (await val('Boom shape')) || '';
    if (/focused/i.test(shape)) break;
    if (!(await playing())) { shape = (await val('Boom shape')) || ''; break; }
    await sleep(800);
  }
  await pause();
  const m = shape.match(/focused U.wave.*×\s*([\d.]+)/);
  const mult = m ? parseFloat(m[1]) : NaN;
  rec('B8', 'physics', !!m && mult >= 1.2 && mult <= 8,
    `Boom shape = "${shape}"`,
    'reads "focused U-wave · ×N" with N ∈ 1.2–8 (a distinct, amplified signature at the focus)');
} catch (e) { rec('B8', 'physics', false, 'threw: ' + e.message, 'superboom U-wave'); }

/* ============================================================ INSIGHT (C) */
try {                                             // C1 the Mach cone visibly narrows as speed climbs
  await tab('accel');
  await setRange('#mend', 2.2); await setRange('#acc', 1.0); await setRange('#alt', 8000);
  await setRange('#lat', 0); await setRange('#rate', 5);
  await restart(); await play();
  const mu = [];
  for (let i = 0; i < 16; i++) { await sleep(400); const v = await val('Mach angle μ'); if (v && v.trim().endsWith('°')) mu.push(firstNum(v)); }
  await pause();
  const mono = mu.length >= 3 && mu.every((v, i) => i === 0 || v <= mu[i - 1] + 0.3);
  const span = mu.length ? mu[0] - mu[mu.length - 1] : 0;
  rec('C1', 'insight', mono && span >= 8, `μ samples ${mu.map(x => x.toFixed(0)).join('→')}° (span ${span.toFixed(0)}°)`,
    'μ monotone non-increasing through the run, first − last ≥ 8°');
} catch (e) { rec('C1', 'insight', false, 'threw: ' + e.message, 'cone narrows'); }

try {                                             // C2 uniform carpet in the middle, sharp edge, and the edge sits at ~2.6 × altitude
  await tab('cruise'); await setRange('#mach', 2.0); await setRange('#alt', 12000); await setRange('#lat', 0); await setRange('#rate', 5);
  await restart(); await play(); await waitBoom(35000); await sleep(2500); await pause();
  const dp0 = firstNum(await val('Peak Δp'));
  const half = firstNum(await val('Carpet ½-width'));                        // km
  await setRange('#lat', (half * 0.4).toFixed(1)); await sleep(300);
  const dpMid = firstNum(await val('Peak Δp'));
  await setRange('#lat', (half + 6).toFixed(1)); await sleep(300);
  const outStr = norm(await val('Peak Δp') || ''), obs = (await val('Observer')) || '';
  const halfErr = Math.abs(half - 2.64 * 12) / (2.64 * 12);
  const flat = Math.abs(dpMid - dp0) / Math.max(dp0, 1) < 0.25;
  const outside = /^-$/.test(outStr) || /outside|silent|carpet/i.test(obs);
  rec('C2', 'insight', flat && outside && halfErr < 0.15,
    `centre ${dp0.toFixed(0)}→${dpMid.toFixed(0)} Pa · half-width ${half.toFixed(1)} km (want ${(2.64 * 12).toFixed(1)}) · beyond: "${outStr}" / "${obs}"`,
    'centre flat within 25%, silent past the printed half-width, half-width within 15% of 2.6×h');
} catch (e) { rec('C2', 'insight', false, 'threw: ' + e.message, 'boom carpet edge'); }

try {                                             // C4 shape beats size — the X-59 shaping buys a large PLdB reduction
  await tab('lowboom'); await setRange('#lat', 0); await setRange('#rate', 5);
  await restart(); await play(); await waitBoom(40000); await sleep(2500); await pause();
  const vsPlain = (await val('vs. plain N-wave')) || '';
  const gain = firstNum((vsPlain.match(/\+\s*(\d+)\s*PLdB/) || [])[1]);
  const shape = (await val('Boom shape')) || '';
  rec('C4', 'insight', gain >= 20 && /shaped/i.test(shape),
    `"${vsPlain}" · shape = "${shape}"`,
    'shaping shows ≥ 20 PLdB reduction vs an unshaped airframe, and boom shape reads "shaped"');
} catch (e) { rec('C4', 'insight', false, 'threw: ' + e.message, 'shape not size'); }

try {                                             // C5 the units primer ties each quantity to an everyday anchor
  const txt = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#explain .ex')].find(d => /reading the units/i.test(d.querySelector('h4')?.textContent || ''));
    return (card || document.querySelector('#explain')).textContent;
  });
  const a1 = /window/i.test(txt), a2 = /twice as loud/i.test(txt), a3 = /(crack|thud|rumble)/i.test(txt);
  rec('C5', 'insight', a1 && a2 && a3, `windows:${a1} · "twice as loud":${a2} · crack/thud/rumble:${a3}`,
    'units card ties Pa, PLdB and ms each to a concrete everyday reference');
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
