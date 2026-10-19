/* Phone presentation regression checks. Run alongside verify-diffraction-grating.mjs, not instead of it.
 * Usage: node verify-diffraction-grating-mobile.mjs /work/diffraction-grating.html /work/index.html [screenshot-dir]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const [file, collection, screenshots] = process.argv.slice(2);
assert(file && collection, 'Supply the standalone visualization and collection paths');
if (screenshots) fs.mkdirSync(screenshots, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const errors = [], requests = [];
const page = await browser.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
const settle = () => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));
const setRange = async (context, selector, value) => {
  await context.$eval(selector, (input, value) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await settle();
};
const state = context => context.evaluate(() => ({
  scen: S.scen, t: S.t, rate: S.rate, playing: S.playing,
  nSlits: S.nSlits, dSpace: S.dSpace, aWidth: S.aWidth, lam: S.lam, Ldist: S.Ldist,
  det: S.det, moved: S._detUserMoved, pan: S.pan, yOff: S.yOff,
  waves: S.wf.length, ready: S.res.ready, ramp: S.res.ramp, I: S.res.I,
}));
const layout = context => context.evaluate(() => {
  const rect = selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  };
  const rr = RFF() * cam.s, th = rad(S.det);
  return {
    width: innerWidth, height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    stage: rect('#stage'), plot: rect('#cScreen'), controls: rect('#experimentControls'),
    canvasWidth: W, canvasHeight: H,
    mode: E.mode,
    detector: { x: sx(0) + Math.cos(th) * rr, y: sy(S.yOff) - Math.sin(th) * rr },
    plate: { x: sx(0), y: sy(S.yOff) },
  };
});
const checkLayout = (metrics, label) => {
  assert.equal(metrics.mode, 'experiment', label);
  assert(metrics.scrollWidth <= metrics.width + 2, `${label}: horizontal overflow`);
  assert(metrics.scrollHeight <= metrics.height + 2, `${label}: vertical overflow`);
  assert(metrics.stage.height >= 120, `${label}: stage below 120 px: ${metrics.stage.height}`);
  assert(metrics.plot.height >= 100, `${label}: plot below 100 px`);
  assert(metrics.controls.bottom <= metrics.height + 2, `${label}: controls clipped`);
  assert(Math.abs(metrics.stage.width - metrics.canvasWidth) <= 0.5, `${label}: canvas width out of sync`);
  assert(Math.abs(metrics.stage.height - metrics.canvasHeight) <= 0.5, `${label}: canvas height out of sync`);
  assert(metrics.detector.x >= 10 && metrics.detector.x <= metrics.stage.width - 10, `${label}: detector clipped sideways`);
  assert(metrics.detector.y >= 0 && metrics.detector.y <= metrics.stage.height, `${label}: detector off stage`);
  assert(metrics.plate.y >= 0 && metrics.plate.y <= metrics.stage.height, `${label}: slit stack off stage`);
};
// fraction of a plot's pixels that differ from its background, and how many are the held-trace cyan
const plotInk = context => context.$eval('#cScreen', canvas => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let ink = 0, cyan = 0, samples = 0;
  for (let index = 0; index < data.length; index += 4) {
    samples++;
    if (Math.abs(data[index] - 7) + Math.abs(data[index + 1] - 10) + Math.abs(data[index + 2] - 18) > 24) ink++;
    if (data[index] < 110 && data[index + 1] > 150 && data[index + 2] > 200) cyan++;
  }
  return { ink: ink / samples, cyan };
});
try {
  const source = fs.readFileSync(file, 'utf8');
  assert(!/(?:src|href)\s*=\s*["'](?:https?:|\.\/)|fetch\s*\(|<link\b|<script\b[^>]*\bsrc=/i.test(source), 'Standalone dependency');
  assert(source.includes('"use strict";'));
  assert(source.includes('name="viewport"'), 'Missing viewport meta');
  new Function(source.match(/<script>([\s\S]*?)<\/script>/)[1]);
  console.log('PASS P1: standalone script parses, strict mode, viewport meta, no external dependencies');

  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto('file://' + file, { waitUntil: 'load' });
    await settle();
    checkLayout(await layout(page), `${width}x${height}`);
    assert.equal(await page.$eval('#experimentScenario', select => select.value), 'grating');
  }
  console.log('PASS P2: 320–430 px portrait layouts fit, stage >=120 px, plot >=100 px');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + file, { waitUntil: 'load' });
  await settle();
  assert.match(await page.$eval('#experimentForecast', element => element.textContent), /^Predicted: \d+ orders?, outermost at ≈ ±[\d.]+°$/,
    'Prediction must be up front, before any light has arrived');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-start.png` });
  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.t > 5);
  await page.click('#experimentPlay');
  assert.equal((await state(page)).playing, false);
  assert((await state(page)).t > 0);
  await page.click('#experimentRestart');
  await settle();
  assert.equal((await state(page)).t, 0);

  for (const scenario of ['grating', 'single', 'double', 'subwave']) {
    await page.select('#experimentScenario', scenario);
    await settle();
    checkLayout(await layout(page), scenario);
    await setRange(page, '#experimentProgress', 0.95);
    const before = await state(page);
    assert(before.ready && before.ramp >= 1, `${scenario}: pattern not on screen at 95 %`);
    await page.click('[data-view="lab"]');
    await settle();
    assert.deepEqual(await state(page), before, `${scenario}: switching to Full lab changed simulation`);
    await page.click('[data-view="experiment"]');
    await settle();
    assert.deepEqual(await state(page), before, `${scenario}: returning to Experiment changed simulation`);
    const { ink } = await plotInk(page);
    assert(ink >= 0.01, `${scenario}: screen plot ink ${ink} below 1%`);
    assert(await page.$eval('#experimentPower', element => /^\d+(\.\d+)? %$/.test(element.textContent)), `${scenario}: no power reading`);
    if (screenshots) await page.screenshot({ path: `${screenshots}/phone-${scenario}.png` });
  }
  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.playing);
  const activeSwitch = await page.evaluate(() => {
    const before = { time: S.t, playing: S.playing };
    document.querySelector('[data-view="lab"]').click();
    document.querySelector('[data-view="experiment"]').click();
    return { before, after: { time: S.t, playing: S.playing } };
  });
  assert.deepEqual(activeSwitch.after, activeSwitch.before, 'Mode switching must preserve active playback');
  await page.click('#experimentPlay');
  console.log('PASS P3: playback/restart wired; all four scenarios preserve state across mode switches');

  await page.select('#experimentScenario', 'grating');
  await setRange(page, '#experimentProgress', 0.95);
  assert.equal((await plotInk(page)).cyan, 0, 'No held trace should be drawn before Keep run');
  await page.click('#experimentKeep');
  const held = await page.evaluate(() => ({ n: S.nSlits, width: S._der.fwhm, label: E.baseline.label }));
  await setRange(page, '#experimentLever', 64);
  await setRange(page, '#experimentProgress', 0.95);
  assert.equal(await page.evaluate(() => E.baseline.label), held.label, 'Held run must not change with parameters');
  const now = await page.evaluate(() => ({ n: S.nSlits, width: derived().fwhm }));
  assert.equal(now.n, 64);
  assert(now.width < held.width * 0.5, `More slits must sharpen the line: ${held.width} → ${now.width}`);
  assert.match(await page.$eval('#experimentComparison', element => element.textContent), /^Held: N 16 .* · now [\d.]+° wide$/);
  assert((await plotInk(page)).cyan > 20, 'Held trace must be drawn on the plot');
  checkLayout(await layout(page), 'held comparison');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-comparison.png` });
  await page.click('#experimentKeep');
  assert.equal(await page.evaluate(() => E.baseline), null);
  await page.select('#experimentScenario', 'double');
  assert.equal(await page.evaluate(() => E.baseline), null, 'Switching scenario must clear the held run');
  console.log('PASS P4: held trace survives parameter changes, is drawn, and reports line width');

  await page.select('#experimentScenario', 'grating');
  await setRange(page, '#experimentProgress', 0.95);
  const metrics = await layout(page);
  const oldDet = (await state(page)).det;
  const client = await page.createCDPSession();
  const point = { x: metrics.stage.x + metrics.detector.x, y: metrics.stage.y + metrics.detector.y };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 4, y: point.y - 30 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  const afterTouch = await state(page);
  assert(Math.abs(afterTouch.det - oldDet) > 3, `Touch drag must move the detector (was ${oldDet}, now ${afterTouch.det})`);
  assert(afterTouch.moved, 'Detector move must persist');
  assert.equal(await page.evaluate(() => dragMode), null, 'Pointer capture must release');
  await settle();
  assert.equal((await state(page)).det, afterTouch.det);
  // dragging empty sky pans instead
  const pan0 = (await state(page)).pan;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: metrics.stage.x + 40, y: metrics.stage.y + 20 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: metrics.stage.x + 90, y: metrics.stage.y + 20 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  assert.notEqual((await state(page)).pan, pan0, 'Touch drag on empty sky must pan');
  console.log('PASS P5: actual touch drag moves the detector without snapping back, and pans elsewhere');

  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.playing);
  await page.click('#experimentSettings');
  const paused = await state(page);
  assert.equal(paused.playing, false);
  assert(await page.$eval('#detailContent #nSlits', element => element.getBoundingClientRect().width > 100));
  await setRange(page, '#lam', 500);
  assert.equal((await state(page)).lam, 500);
  await page.click('[data-detail="measurements"]');
  assert(await page.$eval('#detailContent #rdl', element => element.children.length >= 16));
  assert(await page.$eval('#cWidth', element => element.getBoundingClientRect().width >= 250));
  assert(await page.$eval('#inset3d', element => element.getBoundingClientRect().height >= 150));
  assert(await page.$eval('#experimentDetails', element => element.scrollWidth <= element.clientWidth + 2), 'Sheet must not scroll sideways');
  await page.$eval('#c3d', canvas => canvas.scrollIntoView({ block: 'center' }));
  const insetBefore = await page.$eval('#c3d', canvas => canvas.toDataURL());
  const insetBox = await page.$eval('#c3d', canvas => { const r = canvas.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [insetBox] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: insetBox.x + 40, y: insetBox.y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  assert.notEqual(insetBefore, await page.$eval('#c3d', canvas => canvas.toDataURL()), 'Touch orbit must turn the schematic inset');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-measurements.png` });
  await page.click('[data-detail="why"]');
  assert.equal(await page.$$eval('#detailContent .ex', elements => elements.length), 8);
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-why.png` });
  await page.click('#detailClose');
  await settle();
  assert.equal((await state(page)).t, paused.t);
  assert(await page.$('main > aside'));
  assert(await page.$('#stage > #readouts'));
  assert(await page.$('#stage > #inset3d'));
  assert(await page.$('#plots > .plot:nth-child(2)'));
  assert(await page.$('#app > #explain'));
  console.log('PASS P6: details pause time, expose controls/measurements/prose, restore original nodes');

  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await settle();
  assert.equal(await page.evaluate(() => E.mode), 'experiment', 'Rotation must not change presentation');
  const rotated = await layout(page);
  assert(rotated.detector.x >= 10 && rotated.detector.x <= rotated.stage.width - 10, 'Reframe detector after rotation');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await page.goto('file://' + file, { waitUntil: 'load' });
  await settle();
  assert.equal(await page.evaluate(() => E.mode), 'lab');
  assert.equal((await state(page)).scen, 'grating');
  if (screenshots) await page.screenshot({ path: `${screenshots}/desktop-lab.png` });
  console.log('PASS P7: rotation preserves chosen mode; fresh desktop retains Full lab and original scenario');

  await setRange(page, '#prog', 0.95);
  const desk = await layout(page);
  const detBefore = (await state(page)).det;
  await page.mouse.move(desk.stage.x + desk.detector.x, desk.stage.y + desk.detector.y);
  await page.mouse.down();
  await page.mouse.move(desk.stage.x + desk.detector.x, desk.stage.y + desk.detector.y - 40, { steps: 4 });
  await page.mouse.up();
  assert(Math.abs((await state(page)).det - detBefore) > 3, 'Desktop mouse drag must still move the detector');
  const pan0d = (await state(page)).pan;
  await page.mouse.move(desk.stage.x + 150, desk.stage.y + 40);
  await page.mouse.down();
  await page.mouse.move(desk.stage.x + 210, desk.stage.y + 40, { steps: 4 });
  await page.mouse.up();
  assert.notEqual((await state(page)).pan, pan0d, 'Desktop drag must pan');
  await page.mouse.click(desk.stage.x + 150, desk.stage.y + 40, { count: 2, delay: 80 });
  await settle();
  assert.equal((await state(page)).pan, 0);
  const insetDesk = await page.$eval('#c3d', canvas => canvas.toDataURL());
  const ib = await page.$eval('#c3d', canvas => { const r = canvas.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(ib.x, ib.y);
  await page.mouse.down();
  await page.mouse.move(ib.x + 40, ib.y, { steps: 4 });
  await page.mouse.up();
  assert.notEqual(insetDesk, await page.$eval('#c3d', canvas => canvas.toDataURL()), 'Desktop inset orbit must still work');
  assert.match(await page.$eval('#inset3d .cap', element => element.textContent), /schematic/i);
  assert.equal(await page.$eval('#experimentControls', element => getComputedStyle(element).display), 'none');
  console.log('PASS P10: desktop detector drag, pan/recenter and inset orbit unchanged');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + collection, { waitUntil: 'load' });
  await page.waitForSelector('#frame');
  await page.select('#topicSelect', 'diffraction');
  await page.waitForFunction(() => document.querySelector('#tabs button.on').dataset.k === 'diffraction');
  const frame = await (await page.$('#frame')).contentFrame();
  await frame.waitForSelector('#experimentPlay');
  await settle();
  assert(await page.$eval('#intro', element => element.hidden), 'Phone introduction must not block experiment');
  checkLayout(await layout(frame), 'embedded phone');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-collection.png` });
  console.log('PASS P8: collection phone menu opens the Experiment view without the intro');
  assert.deepEqual(requests, [], 'No network requests');
  assert.deepEqual(errors, [], 'No browser errors');
  console.log('PASS P9: zero browser errors and zero network requests');
} finally {
  await browser.close();
}
