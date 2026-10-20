/* Phone presentation regression checks. Run alongside verify-turbopump.mjs, not instead of it.
 * Usage: node verify-turbopump-mobile.mjs /work/turbopump.html /work/index.html [screenshot-dir]
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
  spd: S.spd, rho: S.rho, beta: S.beta, pin: S.pin, pan: { ...S.pan },
  done: parcelAt(S.t, S.R).done, dp: S.R.dp,
}));
const layout = context => context.evaluate(() => {
  const rect = selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  };
  return {
    width: innerWidth, height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    stage: rect('#stage'), plot: rect('#cTrace'), controls: rect('#experimentControls'),
    canvasWidth: W, canvasHeight: H,
    mode: E.mode,
    centre: { x: cam.cx, y: cam.cy, r: cam.s * G.r3 },
    knob: (() => { const [x, y] = knobPos(); return { x, y }; })(),
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
  assert(metrics.centre.x - metrics.centre.r >= 0 && metrics.centre.x + metrics.centre.r <= metrics.stage.width, `${label}: casing clipped sideways`);
  assert(metrics.centre.y - metrics.centre.r >= 0 && metrics.centre.y + metrics.centre.r <= metrics.stage.height, `${label}: casing clipped vertically`);
  assert(metrics.knob.x >= 0 && metrics.knob.x <= metrics.stage.width && metrics.knob.y >= 0 && metrics.knob.y <= metrics.stage.height, `${label}: speed knob off stage`);
};
// fraction of the speed plot that differs from its background, and how many pixels are held-trace cyan
const plotInk = context => context.$eval('#cTrace', canvas => {
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
    assert.equal(await page.$eval('#experimentScenario', select => select.value), 'f1lox');
  }
  console.log('PASS P2: 320–430 px portrait layouts fit, stage >=120 px, plot >=100 px, casing and knob on stage');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + file, { waitUntil: 'load' });
  await settle();
  assert.match(await page.$eval('#experimentForecast', element => element.textContent), /^Predicted: ≈ \d+(\.\d+)? MPa · ≈ \d+ MW$/,
    'Prediction must be up front, before the drop has travelled');
  assert.equal(await page.$eval('#experimentHeadline', element => element.textContent), '', 'No measured rise before the drop is out');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-start.png` });
  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.t > 0.0005);
  await page.click('#experimentPlay');
  assert.equal((await state(page)).playing, false);
  assert((await state(page)).t > 0);
  await page.click('#experimentRestart');
  await settle();
  assert.equal((await state(page)).t, 0);

  for (const scenario of ['f1lox', 'f1fuel', 'ssme', 'raptor', 'any']) {
    await page.select('#experimentScenario', scenario);
    await settle();
    checkLayout(await layout(page), scenario);
    await setRange(page, '#experimentProgress', 0.98);
    const before = await state(page);
    assert(before.done, `${scenario}: the drop has not left the pump at 98 %`);
    await page.click('[data-view="lab"]');
    await settle();
    assert.deepEqual(await state(page), before, `${scenario}: switching to Full lab changed simulation`);
    await page.click('[data-view="experiment"]');
    await settle();
    assert.deepEqual(await state(page), before, `${scenario}: returning to Experiment changed simulation`);
    assert((await plotInk(page)).ink >= 0.01, `${scenario}: trace plot ink below 1%`);
    assert(await page.$eval('#experimentHeadline', element => /^\+\d+(\.\d+)? MPa$/.test(element.textContent)), `${scenario}: no measured rise`);
    if (screenshots) await page.screenshot({ path: `${screenshots}/phone-${scenario}.png` });
  }
  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.playing);
  const activeSwitch = await page.evaluate(() => {
    const before = { t: S.t, playing: S.playing };
    document.querySelector('[data-view="lab"]').click();
    document.querySelector('[data-view="experiment"]').click();
    return { before, after: { t: S.t, playing: S.playing } };
  });
  assert.deepEqual(activeSwitch.after, activeSwitch.before, 'Mode switching must preserve active playback');
  await page.click('#experimentPlay');
  console.log('PASS P3: playback/restart wired; all five pumps preserve state across mode switches');

  await page.select('#experimentScenario', 'f1lox');
  await setRange(page, '#experimentProgress', 0.98);
  assert.equal((await plotInk(page)).cyan, 0, 'No held trace should be drawn before Keep run');
  await page.click('#experimentKeep');
  const held = await page.evaluate(() => ({ dp: E.baseline.dp, label: E.baseline.label }));
  assert(held.dp > 9e6, `LOX pump rise ${held.dp}`);
  await setRange(page, '#experimentLever', Math.log10(71).toFixed(3));
  await setRange(page, '#experimentProgress', 0.98);
  assert.equal(await page.evaluate(() => E.baseline.label), held.label, 'Held run must not change with the liquid');
  const now = await state(page);
  assert(now.dp < held.dp / 10, `Hydrogen must press ≥10× less than oxygen: ${now.dp} vs ${held.dp}`);
  assert.match(await page.$eval('#experimentComparison', element => element.textContent), /^Held: LOX 1141 kg\/m³ · 9\.\d\d MPa · now 0\.\d+ MPa$/);
  assert((await plotInk(page)).cyan > 20, 'Held trace must be drawn on the plot');
  checkLayout(await layout(page), 'held comparison');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-comparison.png` });
  await page.click('#experimentKeep');
  assert.equal(await page.evaluate(() => E.baseline), null);
  await page.click('#experimentKeep');
  await page.select('#experimentScenario', 'ssme');
  assert.equal(await page.evaluate(() => E.baseline), null, 'Switching pump must clear the held run');
  console.log('PASS P4: held trace survives a change of liquid, is drawn, and reports oxygen vs hydrogen pressure');

  await page.select('#experimentScenario', 'f1lox');
  await setRange(page, '#experimentProgress', 0.5);
  const metrics = await layout(page);
  const oldSpd = (await state(page)).spd;
  const client = await page.createCDPSession();
  const point = { x: metrics.stage.x + metrics.knob.x, y: metrics.stage.y + metrics.knob.y };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - 10, y: point.y + 40 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - 40, y: point.y + 90 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  const afterTouch = await state(page);
  assert(Math.abs(afterTouch.spd - oldSpd) >= 300, `Touch drag on the knob must change the speed (was ${oldSpd}, now ${afterTouch.spd})`);
  assert.equal(await page.evaluate(() => dragMode), null, 'Pointer capture must release');
  await settle();
  assert.equal((await state(page)).spd, afterTouch.spd);
  // dragging empty space pans instead
  const pan0 = (await state(page)).pan;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: metrics.stage.x + 15, y: metrics.stage.y + 15 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: metrics.stage.x + 55, y: metrics.stage.y + 15 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  assert.notEqual((await state(page)).pan.x, pan0.x, 'Touch drag on empty space must pan');
  console.log('PASS P5: actual touch drag on the knob changes the speed without snapping back, and pans elsewhere');

  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.playing);
  await page.click('#experimentSettings');
  const paused = await state(page);
  assert.equal(paused.playing, false);
  assert(await page.$eval('#detailContent #spd', element => element.getBoundingClientRect().width > 100));
  await setRange(page, '#pin', 0.9);
  assert.equal((await state(page)).pin, 0.9e6);
  const edited = await state(page);
  await page.click('[data-detail="measurements"]');
  assert(await page.$eval('#detailContent #rdl', element => element.children.length >= 16));
  assert(await page.$eval('#cRel', element => element.getBoundingClientRect().width >= 250));
  assert(await page.$eval('#inset3d', element => element.getBoundingClientRect().height >= 150));
  assert(await page.$eval('#experimentDetails', element => element.scrollWidth <= element.clientWidth + 2), 'Sheet must not scroll sideways');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-measurements.png` });
  await page.click('[data-detail="why"]');
  assert.equal(await page.$$eval('#detailContent .ex', elements => elements.length), 5);
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-why.png` });
  await page.click('#detailClose');
  await settle();
  assert.equal((await state(page)).t, edited.t);
  assert.equal((await state(page)).playing, false);
  assert(await page.$('main > aside'));
  assert(await page.$('#stage > #readouts'));
  assert(await page.$('#stage > #inset3d'));
  assert(await page.$('#plots > .plot:nth-child(2)'));
  assert(await page.$('#app > #explain'));
  console.log('PASS P6: details pause time, expose controls/measurements/prose, restore original nodes');

  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await settle();
  assert.equal(await page.evaluate(() => E.mode), 'experiment', 'Rotation must not change presentation');
  assert(await page.$eval('#experimentControls', element => element.getBoundingClientRect().width > 0));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await page.goto('file://' + file, { waitUntil: 'load' });
  await settle();
  assert.equal(await page.evaluate(() => E.mode), 'lab');
  assert.equal((await state(page)).scen, 'f1lox');
  if (screenshots) await page.screenshot({ path: `${screenshots}/desktop-lab.png` });
  console.log('PASS P7: rotation preserves chosen mode; fresh desktop retains Full lab and original scenario');

  await setRange(page, '#prog', 0.5);
  const desk = await layout(page);
  const spdBefore = (await state(page)).spd;
  await page.mouse.move(desk.stage.x + desk.knob.x, desk.stage.y + desk.knob.y);
  await page.mouse.down();
  await page.mouse.move(desk.stage.x + desk.knob.x - 10, desk.stage.y + desk.knob.y + 60, { steps: 4 });
  await page.mouse.up();
  assert(Math.abs((await state(page)).spd - spdBefore) >= 300, 'Desktop mouse drag must still turn the knob');
  const pan0d = (await state(page)).pan.x;
  await page.mouse.move(desk.stage.x + 60, desk.stage.y + 300);
  await page.mouse.down();
  await page.mouse.move(desk.stage.x + 120, desk.stage.y + 300, { steps: 4 });
  await page.mouse.up();
  assert.notEqual((await state(page)).pan.x, pan0d, 'Desktop drag must pan');
  await page.mouse.click(desk.stage.x + 60, desk.stage.y + 300, { count: 2, delay: 80 });
  await settle();
  assert.equal((await state(page)).pan.x, 0);
  assert.match(await page.$eval('#inset3d .cap', element => element.textContent), /schematic/i);
  assert.equal(await page.$eval('#experimentControls', element => getComputedStyle(element).display), 'none');
  console.log('PASS P10: desktop knob drag, pan/recenter and schematic inset unchanged');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + collection, { waitUntil: 'load' });
  await page.waitForSelector('#frame');
  await page.select('#topicSelect', 'turbopump');
  await page.waitForFunction(() => document.querySelector('#tabs button.on').dataset.k === 'turbopump');
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
