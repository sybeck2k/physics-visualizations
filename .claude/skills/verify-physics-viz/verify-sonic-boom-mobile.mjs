/* Phone presentation regression checks. Run alongside verify.mjs, not instead of it.
 * Usage: node verify-sonic-boom-mobile.mjs /work/sonic-boom.html /work/index.html [screenshot-dir]
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
  mach: S.mach, alt: S.alt, len: S.len, lat: S.lat, pan: S.pan,
  obs: S.obs.x, moved: S._obsUserMoved, waves: S.wf.length,
  dp: S.res.dp, arrived: S.res.arrived,
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
    stage: rect('#stage'), plot: rect('#cNwave'), controls: rect('#experimentControls'),
    canvasWidth: W, canvasHeight: H,
    mode: E.mode,
    observer: { x: sx(S.obs.x), y: sy(0) },
    vehicle: { x: sx(S.v.x), y: sy(S.v.y) },
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
  assert(metrics.observer.x >= 25 && metrics.observer.x <= metrics.stage.width - 25, `${label}: observer clipped`);
};
const inkFraction = context => context.$eval('#cNwave', canvas => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let ink = 0, samples = 0;
  for (let index = 0; index < data.length; index += 40) {
    samples++;
    if (Math.abs(data[index] - 7) + Math.abs(data[index + 1] - 10) + Math.abs(data[index + 2] - 18) > 24) ink++;
  }
  return ink / samples;
});
try {
  const source = fs.readFileSync(file, 'utf8');
  assert(!/(?:src|href)\s*=\s*["'](?:https?:|\.\/)|fetch\s*\(|<link\b|<script\b[^>]*\bsrc=/i.test(source), 'Standalone dependency');
  assert(source.includes('"use strict";'));
  new Function(source.match(/<script>([\s\S]*?)<\/script>/)[1]);
  console.log('PASS P1: standalone script parses, strict mode, no external dependencies');

  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto('file://' + file, { waitUntil: 'load' });
    await settle();
    checkLayout(await layout(page), `${width}x${height}`);
    assert.equal(await page.$eval('#experimentScenario', select => select.value), 'cruise');
  }
  console.log('PASS P2: 320–430 px portrait layouts fit, stage >=120 px, plot >=100 px');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + file, { waitUntil: 'load' });
  await settle();
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-start.png` });
  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.t > 0.2);
  await page.click('#experimentPlay');
  assert.equal((await state(page)).playing, false);
  assert((await state(page)).t > 0);
  await page.click('#experimentRestart');
  await settle();
  assert.equal((await state(page)).t, 0);

  for (const scenario of ['cruise', 'accel', 'booster', 'lowboom']) {
    await page.select('#experimentScenario', scenario);
    await settle();
    const start = await layout(page);
    checkLayout(start, scenario);
    assert(start.vehicle.y >= 0 && start.vehicle.y < start.stage.height, `${scenario}: source offscreen initially`);
    if (screenshots && scenario === 'booster') await page.screenshot({ path: `${screenshots}/phone-booster.png` });
    await setRange(page, '#experimentProgress', 0.95);
    const before = await state(page);
    await page.click('[data-view="lab"]');
    await settle();
    assert.deepEqual(await state(page), before, `${scenario}: switching to Full lab changed simulation`);
    await page.click('[data-view="experiment"]');
    await settle();
    assert.deepEqual(await state(page), before, `${scenario}: returning to Experiment changed simulation`);
    assert(await inkFraction(page) >= 0.01, `${scenario}: pressure plot ink below 1%`);
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

  await page.select('#experimentScenario', 'cruise');
  await setRange(page, '#experimentProgress', 0.95);
  assert((await state(page)).arrived, 'Default cruise boom must reach observer');
  await page.click('#experimentKeep');
  const held = await page.evaluate(() => E.baseline.result.dp);
  await setRange(page, '#experimentLever', 2.5);
  assert.equal(await page.evaluate(() => E.baseline.result.dp), held);
  assert.notEqual((await state(page)).dp, held);
  assert.match(await page.$eval('#experimentComparison', element => element.textContent), /Pa now/);
  checkLayout(await layout(page), 'held comparison');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-comparison.png` });
  await page.click('#experimentKeep');
  assert.equal(await page.evaluate(() => E.baseline), null);
  console.log('PASS P4: held trace survives parameter changes and reports pressure difference');

  const metrics = await layout(page);
  const oldObserver = (await state(page)).obs;
  const client = await page.createCDPSession();
  const point = { x: metrics.stage.x + metrics.observer.x, y: metrics.stage.y + metrics.observer.y - 9 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 35, y: point.y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  assert(Math.abs((await state(page)).obs - oldObserver) > 100, 'Touch drag must move observer by >100 m');
  assert((await state(page)).moved, 'Observer move must persist');
  assert.equal(await page.evaluate(() => dragMode), null, 'Pointer capture must release');
  const movedObserver = (await state(page)).obs;
  await settle();
  assert.equal((await state(page)).obs, movedObserver);
  console.log('PASS P5: actual touch drag moves observer without snapping back');

  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.playing);
  await page.click('#experimentSettings');
  const paused = await state(page);
  assert.equal(paused.playing, false);
  assert(await page.$eval('#detailContent #mach', element => element.getBoundingClientRect().width > 100));
  await setRange(page, '#mach', 2);
  await page.click('[data-detail="measurements"]');
  assert(await page.$eval('#detailContent #rdl', element => element.children.length >= 16));
  assert(await page.$eval('#cAtten', element => element.getBoundingClientRect().width >= 250));
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-measurements.png` });
  await page.click('[data-detail="why"]');
  assert.equal(await page.$$eval('#detailContent .ex', elements => elements.length), 5);
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-why.png` });
  await page.click('#detailClose');
  await settle();
  assert.equal((await state(page)).t, paused.t);
  assert(await page.$('main > aside'));
  assert(await page.$('#stage > #readouts'));
  assert(await page.$('#plots > .plot:nth-child(2)'));
  assert(await page.$('#app > #explain'));
  console.log('PASS P6: details pause time, expose controls/measurements/prose, restore original nodes');

  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await settle();
  assert.equal(await page.evaluate(() => E.mode), 'experiment', 'Rotation must not change presentation');
  const rotated = await layout(page);
  assert(rotated.observer.x >= 25 && rotated.observer.x <= rotated.stage.width - 25, 'Reframe observer after rotation');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await page.goto('file://' + file, { waitUntil: 'load' });
  await settle();
  assert.equal(await page.evaluate(() => E.mode), 'lab');
  assert.equal((await state(page)).scen, 'accel');
  if (screenshots) await page.screenshot({ path: `${screenshots}/desktop-lab.png` });
  console.log('PASS P7: rotation preserves chosen mode; fresh desktop retains Full lab and original scenario');

  await page.click('#tabs button[data-s="cruise"]');
  await setRange(page, '#mach', 2);
  await setRange(page, '#prog', 0.4);
  const stage = await page.$eval('#stage', element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y };
  });
  await page.mouse.move(stage.x + 150, stage.y + 100);
  await page.mouse.down();
  await page.mouse.move(stage.x + 210, stage.y + 100, { steps: 4 });
  await page.mouse.up();
  assert(Math.abs((await state(page)).pan) > 100);
  await page.mouse.click(stage.x + 150, stage.y + 100, { count: 2, delay: 80 });
  await settle();
  assert.equal((await state(page)).pan, 0);
  const tangentError = await page.evaluate(() => {
    const wave = S.wf.find(wave => wave.boom && wave.t < S.t - 1);
    const distanceToCone = (S.v.x - wave.x) * Math.sin(S.v.mu);
    return Math.abs(distanceToCone - wave.a * (S.t - wave.t)) * cam.s;
  });
  assert(tangentError <= 1, `Analytic cone tangency error ${tangentError} > 1 px`);
  const insetBefore = await page.$eval('#c3d', canvas => canvas.toDataURL());
  await setRange(page, '#mach', 2.5);
  const insetAfter = await page.$eval('#c3d', canvas => canvas.toDataURL());
  assert.notEqual(insetBefore, insetAfter, 'Schematic inset must update');
  assert.match(await page.$eval('#inset3d .cap', element => element.textContent), /schematic/i);
  if (screenshots) await page.screenshot({ path: `${screenshots}/desktop-cruise.png` });
  console.log('PASS P10: desktop pan/recenter, cone tangency <=1 px, schematic inset updates');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + collection, { waitUntil: 'load' });
  await page.waitForSelector('#frame');
  let frame = await (await page.$('#frame')).contentFrame();
  await frame.waitForSelector('#experimentPlay');
  await settle();
  assert(await page.$eval('#intro', element => element.hidden), 'Phone introduction must not block experiment');
  assert(await page.$eval('#topicSelect', element => element.getBoundingClientRect().height >= 36));
  checkLayout(await layout(frame), 'embedded phone');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-collection.png` });
  await page.select('#topicSelect', 'diffraction');
  await page.waitForFunction(() => document.querySelector('#tabs button.on').dataset.k === 'diffraction');
  await page.click('#iClose');
  await page.click('#tabs button[data-k="sonic-boom"]');
  frame = await (await page.$('#frame')).contentFrame();
  await frame.waitForSelector('#experimentPlay');
  await settle();
  checkLayout(await layout(frame), 'return to embedded phone');
  console.log('PASS P8: collection phone menu, intro handling and topic round trip work');
  assert.deepEqual(requests, [], 'No network requests');
  assert.deepEqual(errors, [], 'No browser errors');
  console.log('PASS P9: zero browser errors and zero network requests');
} finally {
  await browser.close();
}
