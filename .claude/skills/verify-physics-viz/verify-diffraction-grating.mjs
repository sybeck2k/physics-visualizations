/* verify-physics-viz — executable acceptance harness for a standalone physics viz.
 *
 * Adapted for MULTI-SLIT DIFFRACTION / THE GRATING (TARGET.html).
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
 * A1–A5, B4, B5, C5, C6 are the generic rows, kept in intent; only selectors, tab keys and
 * readout row names are re-pointed at this viz. B1–B3 and C1–C2 are the phenomenon rows.
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
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
const sinc = x => Math.abs(x) < 1e-9 ? 1 : Math.sin(x)/x;
const deg = r => r*180/Math.PI;

/* ---------- independent reimplementation of the governing model ----------
 * Edlén (1966) dispersion of standard air; datum n(589 nm) = 1.000277. The viz uses the
 * wavelength IN AIR, so this harness does too — the vacuum/air difference is 277 ppm,
 * worth 0.02° at 55°, which matters at B1's 0.1° tolerance.                             */
const airN = lamUmVac => {
  const s2 = 1/(lamUmVac*lamUmVac);
  return 1 + 1e-8*(8342.13 + 2406030/(130-s2) + 15997/(38.9-s2));
};
const lamAirUm = lamNm => (lamNm/1000)/airN(lamNm/1000);
// I(θ) = [sin(Nφ/2)/(N sin(φ/2))]² · sinc²(πa sinθ/λ),  φ = 2π d sinθ/λ   (normalised: I(0)=1)
function Iexact(thRad, N, dUm, aUm, lamNm) {
  const lam = lamAirUm(lamNm), s = Math.sin(thRad);
  const phi = 2*Math.PI*dUm*s/lam;
  const den = Math.sin(phi/2);
  const G = Math.abs(den) < 1e-12 ? 1 : Math.pow(Math.sin(N*phi/2)/(N*den), 2);
  const E = Math.pow(sinc(Math.PI*aUm*s/lam), 2);
  return G*E;
}
// exact FWHM of the central principal maximum of that model, by bisection on [0, first null]
function fwhmExactDeg(N, dUm, aUm, lamNm) {
  const lam = lamAirUm(lamNm);
  const hiG = N > 1 ? Math.asin(clamp(lam/(N*dUm), 0, 0.95)) : Math.PI/2;
  const hiE = Math.asin(clamp(0.75*lam/aUm, 0, 0.95));   // past the envelope half-max (0.443 λ/a), short of its null (λ/a)
  let hi = Math.min(hiG, hiE, 85*Math.PI/180), lo = 0;
  if (Iexact(hi, N, dUm, aUm, lamNm) > 0.5) return NaN;
  for (let i = 0; i < 80; i++) {
    const mid = (lo+hi)/2;
    if (Iexact(mid, N, dUm, aUm, lamNm) > 0.5) lo = mid; else hi = mid;
  }
  return 2*deg((lo+hi)/2);
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
const restart = async () => { await page.click('#restartBtn'); await sleep(260); };
const scrub = async frac => { await setRange('#prog', frac); await sleep(160); };
// play until the light has actually reached the far-field arc and the detector reads
const waitPattern = async (maxMs = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const v = await val('Detector power');
    if (v && /\d/.test(v)) return true;
    if (!(await playing())) return /\d/.test((await val('Detector power')) || '');
    await sleep(300);
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
// put the whole apparatus in a known state
const setup = async o => {
  for (const [k, v] of Object.entries(o)) await setRange('#' + k, v);
};

/* ============================================================ RENDERING (A) */
try {                                             // A1 no uncaught / console errors while exercising every tab + slider
  for (const k of ['single', 'double', 'grating', 'subwave']) {
    await tab(k);
    for (const s of ['#rate', '#nSlits', '#dSpace', '#aWidth', '#lam', '#Ldist', '#det']) {
      if (await page.$(s) && await page.$eval(s, e => e.offsetParent !== null)) {
        const [mn, mx] = await page.$eval(s, e => [e.min, e.max]);
        await setRange(s, mn); await setRange(s, mx);
      }
    }
  }
  await tab('grating');
  rec('A1', 'render', errors.length === 0,
    errors.length + ' errors' + (errors[0] ? ' — ' + errors[0] : ''), '0 pageerror / console.error');
} catch (e) { rec('A1', 'render', false, 'threw: ' + e.message, '0 errors'); }

try {                                             // A2 every canvas paints (non-blank once the pattern has arrived)
  await tab('grating'); await setRange('#rate', 5);
  await restart(); await play(); await waitPattern(30000); await sleep(1200); await pause();
  const m = await inkFrac('#main2d'), sc = await inkFrac('#cScreen'), wd = await inkFrac('#cWidth');
  rec('A2', 'render', m >= 0.05 && sc >= 0.01 && wd >= 0.01,
    `main2d ${(m * 100).toFixed(1)}% · screen ${(sc * 100).toFixed(1)}% · width ${(wd * 100).toFixed(1)}%`,
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

try {                                             // A4 readout is never NaN / undefined / blank and has ≥ 8 rows, all regimes
  let ok = true, detail = [];
  for (const k of ['single', 'double', 'grating', 'subwave']) {
    await tab(k);
    const o = await rows(); const vals = Object.values(o);
    const bad = vals.filter(v => v === '' || /\b(undefined|NaN|Infinity)\b/.test(v));
    const rowsN = Object.keys(o).length;
    if (rowsN < 8 || bad.length) { ok = false; detail.push(`${k}: ${rowsN} rows, bad=[${bad.join(',')}]`); }
    else detail.push(`${k}:${rowsN}✓`);
  }
  rec('A4', 'render', ok, detail.join(' · '), '≥ 8 rows, zero NaN/undefined/blank, all four regimes');
} catch (e) { rec('A4', 'render', false, 'threw: ' + e.message, 'readout sane'); }

try {                                             // A5 every slider drives its own label
  await tab('grating');
  let ok = true, detail = [];
  for (const id of ['nSlits', 'dSpace', 'aWidth', 'lam', 'Ldist', 'det', 'rate']) {
    if (!(await page.$(`#${id}`))) continue;
    const [mn, mx] = await page.$eval(`#${id}`, e => [e.min, e.max]);
    await setRange(`#${id}`, mn); const a = await page.$eval(`#${id}V`, e => e.textContent);
    await setRange(`#${id}`, mx); const b = await page.$eval(`#${id}V`, e => e.textContent);
    if (a === b) { ok = false; detail.push(`${id}:dead`); } else detail.push(`${id}✓`);
  }
  await tab('grating');
  rec('A5', 'render', ok, detail.join(' '), 'each slider label differs between min and max');
} catch (e) { rec('A5', 'render', false, 'threw: ' + e.message, 'sliders wired'); }

/* ============================================================ PHYSICS (B) */
try {                                             // B1 EXACT: principal maxima obey d·sinθ_m = mλ
  // Two families of setting, because there are two ways to get this wrong.
  //  (1) ORDERS THAT EXIST must sit at asin(mλ/d). These use N ≥ 16 and a modest slit width:
  //      the single-slit envelope really does pull a maximum off d·sinθ = mλ by
  //      δθ ≈ (E'/E)/(|G''|/G) ∝ a/N² — ~0.08° at N = 8, a = 0.6 µm, m = 2, but < 0.03° here.
  //  (2) ORDERS THAT DO NOT EXIST must not be handed an angle. At a = d/2 the envelope zero
  //      sinc²(πa sinθ/λ) falls exactly on every even order, so m = 2 is extinguished; a peak
  //      search run there returns a shoulder of the envelope, not a maximum. The readout has
  //      to say the order is gone instead of printing that shoulder.
  await tab('grating');
  let worst = 0, ok = true, detail = [];
  for (const [N, dUm, lamNm, aUm] of [[24, 1.6, 650, 0.40], [32, 2.0, 500, 0.40], [16, 3.0, 780, 0.50]]) {
    await setup({ nSlits: N, dSpace: dUm, aWidth: aUm, lam: lamNm });
    const lam = lamAirUm(lamNm);
    for (const m of [1, 2]) {
      const want = deg(Math.asin(m*lam/dUm));
      const got = firstNum(await val(m === 1 ? '1st-order angle' : '2nd-order angle'));
      worst = Math.max(worst, Math.abs(got - want));
      detail.push(`N${N}/d${dUm}/λ${lamNm} m=${m}: ${got.toFixed(3)}° vs ${want.toFixed(3)}°`);
    }
  }
  for (const [N, dUm, lamNm] of [[16, 2.0, 600], [12, 0.9, 405]]) {   // a/d = 0.5 exactly
    const aUm = dUm/2;
    await setup({ nSlits: N, dSpace: dUm, aWidth: aUm, lam: lamNm });
    const lam = lamAirUm(lamNm);
    const v2 = norm(await val('2nd-order angle') || '');
    const gone = !/\d/.test(v2) && /extinct|^-/.test(v2);            // no number, and says why
    const want1 = deg(Math.asin(lam/dUm));
    const got1 = firstNum(await val('1st-order angle'));
    worst = Math.max(worst, Math.abs(got1 - want1));
    if (!gone) ok = false;
    detail.push(`a=d/2 N${N}/d${dUm}/λ${lamNm}: m=2 "${v2}"${gone ? ' ✓extinct' : ' ✗PRINTS A NUMBER'} · m=1 ${got1.toFixed(3)}° vs ${want1.toFixed(3)}°`);
  }
  rec('B1', 'physics', ok && worst < 0.1, detail.join(' · ') + ` (max err ${worst.toFixed(4)}°)`,
    'every order that exists matches asin(mλ/d) within 0.1°, and an order the envelope has extinguished (a = d/2) reports no angle at all');
} catch (e) { rec('B1', 'physics', false, 'threw: ' + e.message, '< 0.1° and no phantom order angle'); }

try {                                             // B2 MODEL FIDELITY: the whole I(θ) law, point by point
  await tab('grating');
  const N = 8, dUm = 2.0, aUm = 0.6, lamNm = 600;
  await setup({ nSlits: N, dSpace: dUm, aWidth: aUm, lam: lamNm });
  const angles = [];
  for (let i = 0; i <= 16; i++) angles.push(-52 + 104*i/16);      // 17 angles spanning the pattern
  const mine = await page.evaluate(as => as.map(a => window.__vpz.I(a)), angles);
  let se = 0, mx = 0, detail = [];
  angles.forEach((a, i) => {
    const want = Iexact(a*Math.PI/180, N, dUm, aUm, lamNm);
    mx = Math.max(mx, want);
    se += (mine[i] - want) ** 2;
    if (i % 4 === 0) detail.push(`${a.toFixed(0)}°:${mine[i].toFixed(4)}/${want.toFixed(4)}`);
  });
  const rms = Math.sqrt(se/angles.length)/Math.max(mx, 1e-9);
  rec('B2', 'physics', rms < 0.03, detail.join(' ') + ` — normalised RMS ${(rms*100).toFixed(3)}%`,
    'viz I(θ) vs [sin(Nφ/2)/(N sin(φ/2))]²·sinc²(πa sinθ/λ) at 17 angles, normalised RMS < 3%');
} catch (e) { rec('B2', 'physics', false, 'threw: ' + e.message, 'RMS < 3%'); }

try {                                             // B3 CITED ANCHOR: a CD (track pitch 1.6 µm) in red light
  // asin(650 nm / 1.6 µm) = 23.94° — the first-order red you see off a disc. A multiplicative
  // slip in d, λ or the phase constant moves this out of the band immediately.
  await tab('grating');
  await setup({ nSlits: 16, dSpace: 1.6, aWidth: 0.6, lam: 650 });
  const th1 = firstNum(await val('1st-order angle'));
  const txt = await page.evaluate(() => document.querySelector('#explain').textContent + ' ' + document.querySelector('#stagewrap').textContent);
  const naD = /589\.0/.test(txt) && /589\.6/.test(txt);
  const rp = /mN/.test(txt) && /(1000|982)/.test(txt);
  rec('B3', 'physics', th1 >= 21 && th1 <= 27 && naD && rp,
    `CD first order ${th1.toFixed(2)}° (want 23.94°) · Na D lines cited ${naD} · R=mN & N≳1000 cited ${rp}`,
    'first-order angle ∈ 21–27° at d = 1.6 µm / λ = 650 nm; sodium D doublet + R = mN called out in #explain');
} catch (e) { rec('B3', 'physics', false, 'threw: ' + e.message, 'CD anchor + Na D citation'); }

try {                                             // B4 no phantom detector reading before the light gets there
  // This viz DOES animate propagation: the plane wave has to cross to the plate (t_ap) and
  // the wavelets then have to cross to the far-field arc (t_ready). The probe points sit in
  // the INCOMING window between the two — light is in flight, wavefronts exist, and a
  // pattern computed from a formula in t rather than from the arrivals would show up here.
  await tab('grating'); await restart(); await pause();
  const P = await page.evaluate(() => window.__vpz.params());
  const D = P.duration, f0 = P.tAp/D, f1 = P.tReady/D;
  const fracs = [0.28, 0.34, 0.40];
  const inWindow = fracs.every(f => f > f0 && f < f1);
  const seen = [], st = [];
  for (const f of fracs) {
    await scrub(f);
    seen.push(await val('Detector power'));
    st.push(await page.evaluate(() => window.__vpz.state()));
  }
  const stable = new Set(seen.map(norm)).size === 1;
  rec('B4', 'physics', inWindow && stable && /^-$/.test(norm(seen[0])),
    `window t_ap..t_ready = ${f0.toFixed(3)}..${f1.toFixed(3)} of the run; probes at ${fracs.join('/')} → ` +
    `[${seen.join(' | ')}] with ${st.map(s => s.wf).join('/')} wavefronts in flight, ${st.map(s => s.arrived).join('/')} arrived`,
    'all three probes inside the incoming window, identical, and "—" (no reading before a wavefront reaches the arc)');
} catch (e) { rec('B4', 'physics', false, 'threw: ' + e.message, 'no phantom reading'); }

try {                                             // B5 scrub(t) ≡ play(t), on quantities that depend on the replay
  // The reading is built from the wavefront ARRAY (arrivedCount scans S.wf), not from a
  // formula in t, so a scrub that failed to replay the emission schedule would read wrong or
  // read nothing. Three clauses: the settled state matches on TWO quantities; the replayed
  // wavefront count matches the deterministic schedule and the count reached by playing; and
  // mid-build, where only part of the wavelet train has landed, the detector reads the
  // corresponding partial value rather than the settled one.
  await tab('grating');
  await setup({ nSlits: 16, dSpace: 1.6, aWidth: 0.6, lam: 650, det: 23.9, rate: 5 });
  const P = await page.evaluate(() => window.__vpz.params());
  const sched = t => t < P.tAp ? 0 : Math.floor((t - P.tAp)/P.period + 1e-9) + 1;
  const arrSched = t => sched(t - (P.tReady - P.tAp));
  await restart(); await play(); await waitPattern(30000); await sleep(2500); await pause();
  const pPow = firstNum(await val('Detector power')), pOrd = firstNum(await val('Detector order m'));
  const pSt = await page.evaluate(() => window.__vpz.state());
  await restart(); await scrub(1.0); await sleep(400);
  const sPow = firstNum(await val('Detector power')), sOrd = firstNum(await val('Detector order m'));
  const sSt = await page.evaluate(() => window.__vpz.state());
  const dPow = Math.abs(pPow - sPow)/Math.max(pPow, 1e-6), dOrd = Math.abs(pOrd - sOrd);
  const wfMatch = Math.abs(pSt.wf - sSt.wf) <= 1 && Math.abs(sSt.wf - sched(sSt.t)) <= 1;
  // mid-build probes
  let build = true, bDetail = [];
  for (const f of [0.47, 0.51, 0.55]) {
    await scrub(f); await sleep(120);
    const s = await page.evaluate(() => window.__vpz.state());
    const pw = firstNum(await val('Detector power'));
    const wantWf = sched(s.t), wantArr = arrSched(s.t);
    const wantPw = sPow*Math.min(wantArr/P.settle, 1);
    const okWf = Math.abs(s.wf - wantWf) <= 1 && Math.abs(s.arrived - wantArr) <= 1;
    const okPw = pw > 0 && pw < sPow*0.995 && Math.abs(pw - wantPw) <= 0.08*Math.max(wantPw, 1e-6) + 0.02*sPow;
    if (!okWf || !okPw) build = false;
    bDetail.push(`f=${f}: wf ${s.wf}/${wantWf}, arrived ${s.arrived}/${wantArr}, ${pw.toFixed(2)}%/${wantPw.toFixed(2)}%`);
  }
  rec('B5', 'physics', dPow < 0.10 && dOrd <= 0.01 && wfMatch && build,
    `settled: played ${pPow.toFixed(3)} % / m ${pOrd.toFixed(3)} vs scrubbed ${sPow.toFixed(3)} % / m ${sOrd.toFixed(3)} ` +
    `(Δ ${(dPow*100).toFixed(2)}% / ${dOrd.toFixed(4)}); wavefronts played ${pSt.wf} vs scrubbed ${sSt.wf} (schedule ${sched(sSt.t)}); building — ${bDetail.join(' · ')}`,
    'peak intensity within 10% AND order number within 0.01; replayed wavefront count = played count = the deterministic schedule (±1); and a mid-build scrub reads the partial value its arrived-wavefront count implies (±8%)');
} catch (e) { rec('B5', 'physics', false, 'threw: ' + e.message, 'play == scrub, on replay-dependent quantities'); }

/* ============================================================ INSIGHT (C) */
try {                                             // C1 more slits ⇒ sharper lines: FWHM ∝ 1/N
  // Reference: the grating factor near a principal maximum is sinc²(Nφ/2); sinc² falls to
  // half at x = 1.3916, so FWHM → 2·1.3916·λ/(π N d cosθ) = 0.8859 λ/(N d cosθ). The often
  // quoted λ/(N d cosθ) is the peak-to-FIRST-NULL half width, 12.9% wider than the FWHM,
  // and the sinc² asymptote itself is only good for large N (at N = 2 the exact width is
  // 0.500 λ/d against the asymptote's 0.443 λ/d — 12.9% out). So the primary comparison is
  // against the EXACT numerical FWHM of the full model, reproduced here; the asymptotic
  // 0.886 λ/(N d cosθ) is additionally asserted only where it is valid, N ≥ 8.
  await tab('grating');
  const dUm = 1.6, aUm = 0.6, lamNm = 650, lam = lamAirUm(lamNm);
  const got = [], detail = [];
  let ok = true;
  for (const N of [2, 4, 8, 16]) {
    await setup({ nSlits: N, dSpace: dUm, aWidth: aUm, lam: lamNm });
    const w = firstNum(await val('Principal-max FWHM'));
    const want = fwhmExactDeg(N, dUm, aUm, lamNm);
    const err = Math.abs(w - want)/want;
    if (!(err < 0.08)) ok = false;
    let asym = '';
    if (N >= 8) {
      const wa = deg(0.8859*lam/(N*dUm));
      const ea = Math.abs(w - wa)/wa;
      if (!(ea < 0.08)) ok = false;
      asym = ` (vs 0.886λ/Nd ${wa.toFixed(3)}°, ${(ea*100).toFixed(1)}%)`;
    }
    got.push(w);
    detail.push(`N${N}: ${w.toFixed(3)}° vs exact ${want.toFixed(3)}° [${(err*100).toFixed(1)}%]${asym}`);
  }
  const mono = got.every((v, i) => i === 0 || v < got[i-1]);
  const ratio = got[0]/got[got.length-1];
  rec('C1', 'insight', ok && mono && ratio >= 4,
    detail.join(' · ') + ` — monotone ${mono}, FWHM(2)/FWHM(16) = ${ratio.toFixed(2)}`,
    'FWHM monotone decreasing, FWHM(2)/FWHM(16) ≥ 4 (theory 9.0), each within 8% of the exact model FWHM (and of 0.886λ/(Nd cosθ) for N ≥ 8)');
} catch (e) { rec('C1', 'insight', false, 'threw: ' + e.message, 'more slits ⇒ sharper'); }

try {                                             // C2 below d = λ every order but m = 0 disappears
  // The readout count is cross-checked against peaks counted independently here, straight
  // off the viz's sampled screen curve: a local maximum in sinθ within ±85° whose intensity
  // clears the extinction floor. Grazing orders (|θ| > 85°) are excluded on both sides —
  // an order that leaves the plate at 88° never lands on anything.
  // A principal maximum is where the grating factor equals 1, so there I(θ) = envelope(θ);
  // a SECONDARY maximum of an N-slit factor never exceeds ~4.7% of it (11% at N = 3). Testing
  // I > 0.25·envelope therefore keeps the principal maxima and drops every subsidiary ripple,
  // while the absolute floor drops an order the envelope has extinguished.
  const countPeaks = async () => {
    const p = await page.evaluate(() => window.__vpz.params());
    const NS = 4000, lim = Math.sin(85*Math.PI/180);
    const I = await page.evaluate((NS, lim) => {
      const out = [];
      for (let i = 0; i <= NS; i++) out.push(window.__vpz.I(Math.asin(-lim + 2*lim*i/NS)*180/Math.PI));
      return out;
    }, NS, lim);
    let n = 0;
    for (let i = 1; i < NS; i++) {
      if (!(I[i] > I[i-1] && I[i] >= I[i+1])) continue;
      const s = -lim + 2*lim*i/NS;
      const env = Math.pow(sinc(Math.PI*p.a*s/p.lamMed), 2);
      if (I[i] > 1e-6 && I[i] > 0.25*env) n++;
    }
    return n;
  };
  await tab('subwave');
  const dSub = firstNum(await page.$eval('#dSpace', e => e.value));
  const lamNm = firstNum(await page.$eval('#lam', e => e.value));
  const nSub = firstNum(await val('Orders visible')), pSub = await countPeaks();
  await setRange('#dSpace', (3*lamAirUm(lamNm)).toFixed(2));   // d = 3λ
  await sleep(300);
  const nWide = firstNum(await val('Orders visible')), pWide = await countPeaks();
  rec('C2', 'insight',
    dSub < lamAirUm(lamNm) && nSub === 1 && pSub === 1 && nWide >= 3 && pWide >= 3 && Math.abs(nWide - pWide) <= 1,
    `d = ${dSub} µm (< λ_air ${lamAirUm(lamNm).toFixed(3)} µm): readout ${nSub}, peaks counted on the curve ${pSub} · ` +
    `d = 3λ: readout ${nWide}, peaks ${pWide}`,
    'exactly 1 principal maximum (m = 0 only) below d = λ and ≥ 3 at d = 3λ, by the readout AND by counting peaks of the sampled curve within ±85°, the two agreeing to ±1');
} catch (e) { rec('C2', 'insight', false, 'threw: ' + e.message, 'orders vanish below d = λ'); }

try {                                             // C5 the units primer ties each quantity to an everyday anchor
  const txt = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#explain .ex')].find(d => /reading the units/i.test(d.querySelector('h4')?.textContent || ''));
    return (card || document.querySelector('#explain')).textContent;
  });
  const a1 = /hair/i.test(txt), a2 = /\bCD\b/.test(txt), a3 = /(fingertip|arm's length|Moon)/i.test(txt);
  rec('C5', 'insight', a1 && a2 && a3, `hair:${a1} · CD:${a2} · fingertip/Moon:${a3}`,
    'units card ties nm, µm and degrees each to a concrete everyday reference');
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
