/* Phone presentation regression checks. Run alongside verify-gravitational-slingshot.mjs, not instead of it.
 * Usage: node verify-gravitational-slingshot-mobile.mjs /work/gravitational-slingshot.html /work/index.html [screenshot-dir]
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
  scen: S.scen, n: S.n, rate: S.rate, playing: S.playing,
  vinf: S.vinf, b: S.b, alpha: S.alpha, mp: S.mp, pan: { ...S.pan },
  hist: S.hist.length, done: flybyDone(),
  dv: flybyDone() ? S._out.out.sp - S._in.inn.sp : null,
  hit: S._hit,
}));
const layout = context => context.evaluate(() => {
  const rect = selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  };
  const P = pPos(simT());
  return {
    width: innerWidth, height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    stage: rect('#stage'), plot: rect('#cSpeed'), controls: rect('#experimentControls'),
    canvasWidth: W, canvasHeight: H,
    mode: E.mode,
    planet: { x: sx(P[0]), y: sy(P[1]) },
    probe: { x: sx(S.x), y: sy(S.y) },
    aim: aimScreen ? { x: aimScreen.x, y: aimScreen.y } : null,
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
  assert(metrics.planet.x >= 0 && metrics.planet.x <= metrics.stage.width && metrics.planet.y >= 0 && metrics.planet.y <= metrics.stage.height,
    `${label}: planet off stage`);
};
// fraction of the speed plot that differs from its background, and how many pixels are held-trace cyan
const plotInk = context => context.$eval('#cSpeed', canvas => {
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
    assert.equal(await page.$eval('#experimentScenario', select => select.value), 'trailing');
  }
  console.log('PASS P2: 320–430 px portrait layouts fit, stage >=120 px, plot >=100 px');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + file, { waitUntil: 'load' });
  await settle();
  assert.match(await page.$eval('#experimentForecast', element => element.textContent), /^Predicted: ≈ \+\d+\.\d\d km\/s · periapsis ≈ \d+\.\d R_J$/,
    'Prediction must be up front, before the probe arrives');
  assert.equal(await page.$eval('#experimentHeadline', element => element.textContent), '', 'No measured Δv before the flyby is over');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-start.png` });
  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.n > 50);
  await page.click('#experimentPlay');
  assert.equal((await state(page)).playing, false);
  assert((await state(page)).n > 0);
  await page.click('#experimentRestart');
  await settle();
  assert.equal((await state(page)).n, 0);

  for (const scenario of ['trailing', 'leading', 'retro', 'voyager']) {
    await page.select('#experimentScenario', scenario);
    await settle();
    checkLayout(await layout(page), scenario);
    await setRange(page, '#experimentProgress', 0.98);
    const before = await state(page);
    assert(before.done, `${scenario}: flyby not complete at 98 %`);
    await page.click('[data-view="lab"]');
    await settle();
    assert.deepEqual(await state(page), before, `${scenario}: switching to Full lab changed simulation`);
    await page.click('[data-view="experiment"]');
    await settle();
    assert.deepEqual(await state(page), before, `${scenario}: returning to Experiment changed simulation`);
    const { ink } = await plotInk(page);
    assert(ink >= 0.01, `${scenario}: speed plot ink ${ink} below 1%`);
    assert(await page.$eval('#experimentHeadline', element => /^[+−]\d+\.\d\d km\/s$/.test(element.textContent)), `${scenario}: no measured Δv`);
    if (screenshots) await page.screenshot({ path: `${screenshots}/phone-${scenario}.png` });
  }
  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.playing);
  const activeSwitch = await page.evaluate(() => {
    const before = { n: S.n, playing: S.playing };
    document.querySelector('[data-view="lab"]').click();
    document.querySelector('[data-view="experiment"]').click();
    return { before, after: { n: S.n, playing: S.playing } };
  });
  assert.deepEqual(activeSwitch.after, activeSwitch.before, 'Mode switching must preserve active playback');
  await page.click('#experimentPlay');
  console.log('PASS P3: playback/restart wired; all four scenarios preserve state across mode switches');

  await page.select('#experimentScenario', 'trailing');
  await setRange(page, '#experimentProgress', 0.98);
  assert.equal((await plotInk(page)).cyan, 0, 'No held trace should be drawn before Keep run');
  await page.click('#experimentKeep');
  const held = await page.evaluate(() => ({ dv: S._out.out.sp - S._in.inn.sp, label: E.baseline.label }));
  assert(held.dv > 2000, `Trailing pass should boost: ${held.dv}`);
  await setRange(page, '#experimentLever', -12);
  await setRange(page, '#experimentProgress', 0.98);
  assert.equal(await page.evaluate(() => E.baseline.label), held.label, 'Held run must not change with parameters');
  const now = await state(page);
  assert(now.done && now.dv < 0, `Leading pass should brake: ${now.dv}`);
  assert.match(await page.$eval('#experimentComparison', element => element.textContent), /^Held: b \+12\.0 R_J · \+\d+\.\d\d km\/s · now −\d+\.\d\d km\/s$/);
  assert((await plotInk(page)).cyan > 20, 'Held trace must be drawn on the plot');
  checkLayout(await layout(page), 'held comparison');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-comparison.png` });
  await page.click('#experimentKeep');
  assert.equal(await page.evaluate(() => E.baseline), null);
  await page.click('#experimentKeep');
  await page.select('#experimentScenario', 'retro');
  assert.equal(await page.evaluate(() => E.baseline), null, 'Switching scenario must clear the held run');
  console.log('PASS P4: held trace survives an aim change, is drawn, and reports Δv boost vs brake');

  await page.select('#experimentScenario', 'trailing');
  await setRange(page, '#experimentProgress', 0.5);
  const metrics = await layout(page);
  assert(metrics.aim, 'The aim point must exist while the planet fills the view');
  assert(metrics.aim.x >= 0 && metrics.aim.x <= metrics.stage.width && metrics.aim.y >= 0 && metrics.aim.y <= metrics.stage.height, 'Aim point off stage');
  const oldB = (await state(page)).b;
  const client = await page.createCDPSession();
  const point = { x: metrics.stage.x + metrics.aim.x, y: metrics.stage.y + metrics.aim.y };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - 30, y: point.y - 30 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - 60, y: point.y - 60 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  const afterTouch = await state(page);
  assert(Math.abs(afterTouch.b - oldB) >= 1, `Touch drag must re-aim (b was ${oldB}, now ${afterTouch.b})`);
  assert.equal(await page.evaluate(() => dragMode), null, 'Pointer capture must release');
  await settle();
  assert.equal((await state(page)).b, afterTouch.b);
  // dragging empty space pans instead
  const pan0 = (await state(page)).pan;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: metrics.stage.x + 20, y: metrics.stage.y + 20 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: metrics.stage.x + 60, y: metrics.stage.y + 20 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  assert.notEqual((await state(page)).pan.x, pan0.x, 'Touch drag on empty space must pan');
  console.log('PASS P5: actual touch drag re-aims the flyby without snapping back, and pans elsewhere');

  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.playing);
  await page.click('#experimentSettings');
  const paused = await state(page);
  assert.equal(paused.playing, false);
  assert(await page.$eval('#detailContent #vinf', element => element.getBoundingClientRect().width > 100));
  await setRange(page, '#vinf', 15);
  assert.equal((await state(page)).vinf, 15000);
  const edited = await state(page);        // a parameter change rebuilds the run at the same fraction; closing must not move it
  await page.click('[data-detail="measurements"]');
  assert(await page.$eval('#detailContent #rdl', element => element.children.length >= 16));
  assert(await page.$eval('#cGain', element => element.getBoundingClientRect().width >= 250));
  assert(await page.$eval('#inset3d', element => element.getBoundingClientRect().height >= 150));
  assert(await page.$eval('#experimentDetails', element => element.scrollWidth <= element.clientWidth + 2), 'Sheet must not scroll sideways');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-measurements.png` });
  await page.click('[data-detail="why"]');
  assert.equal(await page.$$eval('#detailContent .ex', elements => elements.length), 8);
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-why.png` });
  await page.click('#detailClose');
  await settle();
  assert.equal((await state(page)).n, edited.n);
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
  assert.equal((await state(page)).scen, 'trailing');
  if (screenshots) await page.screenshot({ path: `${screenshots}/desktop-lab.png` });
  console.log('PASS P7: rotation preserves chosen mode; fresh desktop retains Full lab and original scenario');

  await setRange(page, '#prog', 0.5);
  const desk = await layout(page);
  const bBefore = (await state(page)).b;
  await page.mouse.move(desk.stage.x + desk.aim.x, desk.stage.y + desk.aim.y);
  await page.mouse.down();
  await page.mouse.move(desk.stage.x + desk.aim.x - 40, desk.stage.y + desk.aim.y - 40, { steps: 4 });
  await page.mouse.up();
  assert(Math.abs((await state(page)).b - bBefore) >= 1, 'Desktop mouse drag must still re-aim');
  const pan0d = (await state(page)).pan.x;
  await page.mouse.move(desk.stage.x + 150, desk.stage.y + 300);
  await page.mouse.down();
  await page.mouse.move(desk.stage.x + 210, desk.stage.y + 300, { steps: 4 });
  await page.mouse.up();
  assert.notEqual((await state(page)).pan.x, pan0d, 'Desktop drag must pan');
  await page.mouse.click(desk.stage.x + 150, desk.stage.y + 300, { count: 2, delay: 80 });
  await settle();
  assert.equal((await state(page)).pan.x, 0);
  assert.match(await page.$eval('#inset3d .cap', element => element.textContent), /schematic/i);
  assert.equal(await page.$eval('#experimentControls', element => getComputedStyle(element).display), 'none');
  console.log('PASS P10: desktop aim drag, pan/recenter and schematic inset unchanged');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + collection, { waitUntil: 'load' });
  await page.waitForSelector('#frame');
  await page.select('#topicSelect', 'slingshot');
  await page.waitForFunction(() => document.querySelector('#tabs button.on').dataset.k === 'slingshot');
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
