/* Phone presentation regression checks. Run alongside verify-sofar-sound-channel.mjs, not instead of it.
 * Usage: node verify-sofar-sound-channel-mobile.mjs /work/sofar-sound-channel.html /work/index.html [screenshot-dir]
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
  src: S.src, rcvd: S.rcvd, rng: S.rng, fan: S.fan, pan: S.pan, span: S.span,
  nArr: S._res.nArr, shadow: S._res.shadow, TL: S._res.TL,
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
    stage: rect('#stage'), plot: rect('#cArr'), controls: rect('#experimentControls'),
    canvasWidth: W, canvasHeight: H,
    mode: E.mode,
    receiver: { x: sxp(RX[S.ridx]), y: syp(S.rcvd) },
    source: { x: sxp(0), y: syp(S.src) },
    PW,
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
  assert(metrics.receiver.x >= 0 && metrics.receiver.x <= metrics.stage.width && metrics.receiver.y >= 0 && metrics.receiver.y <= metrics.stage.height,
    `${label}: hydrophone off stage`);
  assert(metrics.source.x >= 0 && metrics.source.y >= 0 && metrics.source.y <= metrics.stage.height, `${label}: source off stage`);
};
// fraction of the speed plot that differs from its background, and how many pixels are held-trace cyan
const plotInk = context => context.$eval('#cArr', canvas => {
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
    assert.equal(await page.$eval('#experimentScenario', select => select.value), 'deepchannel');
  }
  console.log('PASS P2: 320–430 px portrait layouts fit, stage >=120 px, plot >=100 px');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + file, { waitUntil: 'load' });
  await settle();
  assert.match(await page.$eval('#experimentForecast', element => element.textContent), /^Predicted best depth ≈ \d+ m · ≈ \d+ dB$/,
    'Prediction must be up front, before any sound has arrived');
  assert.equal(await page.$eval('#experimentHeadline', element => element.textContent), '', 'No loss reading before the first arrival');
  assert.equal(await page.evaluate(() => PW), 4, 'Phone drops the c(z) panel');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-start.png` });
  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.t > 5);
  await page.click('#experimentPlay');
  assert.equal((await state(page)).playing, false);
  assert((await state(page)).t > 0);
  await page.click('#experimentRestart');
  await settle();
  assert.equal((await state(page)).t, 0);

  for (const scenario of ['deepchannel', 'surfaceduct', 'doubleduct', 'arctic', 'shadow']) {
    await page.select('#experimentScenario', scenario);
    await settle();
    checkLayout(await layout(page), scenario);
    await setRange(page, '#experimentProgress', 0.98);
    const before = await state(page);
    await page.click('[data-view="lab"]');
    await settle();
    assert.deepEqual(await state(page), before, `${scenario}: switching to Full lab changed simulation`);
    await page.click('[data-view="experiment"]');
    await settle();
    assert.deepEqual(await state(page), before, `${scenario}: returning to Experiment changed simulation`);
    const status = await page.$eval('#experimentStatus', element => element.textContent);
    if (scenario === 'shadow') {
      assert(/^(Shadow zone|Ray-starved zone)$/.test(status), `shadow: status "${status}"`);
      const headline = await page.$eval('#experimentHeadline', element => element.textContent);
      // no ray at all ⇒ no loss figure; ray-starved ⇒ the one feeble path's real, very large loss
      if (status === 'Shadow zone') assert.equal(headline, '', 'A true shadow zone must not invent a loss figure');
      else assert(/^\d+ dB loss$/.test(headline) && Number(headline.match(/\d+/)[0]) > 90, `starved headline "${headline}"`);
    } else {
      assert(before.nArr > 0, `${scenario}: nothing heard at 98 %`);
      assert(await page.$eval('#experimentHeadline', element => /^\d+ dB loss$/.test(element.textContent)), `${scenario}: no loss reading`);
      assert((await plotInk(page)).ink >= 0.01, `${scenario}: arrival plot ink below 1%`);
    }
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
  console.log('PASS P3: playback/restart wired; all five scenarios preserve state across mode switches');

  await page.select('#experimentScenario', 'deepchannel');
  await setRange(page, '#experimentProgress', 0.98);
  assert.equal((await plotInk(page)).cyan, 0, 'No held trace should be drawn before Keep run');
  await page.click('#experimentKeep');
  const held = await page.evaluate(() => ({ n: E.baseline.arr.length, TL: E.baseline.TL, rcvd: E.baseline.rcvd }));
  assert.equal(held.rcvd, 1300);
  await setRange(page, '#experimentLever', 1000);
  await setRange(page, '#experimentProgress', 0.98);
  assert.equal(await page.evaluate(() => E.baseline.rcvd), 1300, 'Held run must not change with the hydrophone');
  assert.equal((await state(page)).rcvd, 1000);
  assert.match(await page.$eval('#experimentComparison', element => element.textContent), /^Held: 1300 m · \d+ paths? · \d+ dB · now (\d+ dB|shadow zone|listening)$/);
  assert((await state(page)).nArr > 0, 'Hydrophone at 1000 m should still hear the channel');
  assert((await plotInk(page)).cyan > 20, 'Held trace must be drawn on the plot');
  checkLayout(await layout(page), 'held comparison');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-comparison.png` });
  await page.click('#experimentKeep');
  assert.equal(await page.evaluate(() => E.baseline), null);
  await page.click('#experimentKeep');
  await page.select('#experimentScenario', 'arctic');
  assert.equal(await page.evaluate(() => E.baseline), null, 'Switching scenario must clear the held run');
  console.log('PASS P4: held arrival train survives a hydrophone move, is drawn, and reports both losses');

  await page.select('#experimentScenario', 'deepchannel');
  await setRange(page, '#experimentProgress', 0.5);
  const metrics = await layout(page);
  const oldDepth = (await state(page)).rcvd;
  const client = await page.createCDPSession();
  const point = { x: metrics.stage.x + metrics.receiver.x, y: metrics.stage.y + metrics.receiver.y };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + 20 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + 45 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  const afterTouch = await state(page);
  assert(Math.abs(afterTouch.rcvd - oldDepth) >= 300, `Touch drag must move the hydrophone (was ${oldDepth} m, now ${afterTouch.rcvd} m)`);
  assert.equal(await page.evaluate(() => dragMode), null, 'Pointer capture must release');
  await settle();
  assert.equal((await state(page)).rcvd, afterTouch.rcvd);
  // dragging empty water pans instead
  const pan0 = (await state(page)).pan;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: metrics.stage.x + metrics.stage.width / 2, y: metrics.stage.y + 30 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: metrics.stage.x + metrics.stage.width / 2 + 50, y: metrics.stage.y + 30 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  assert.notEqual((await state(page)).pan, pan0, 'Touch drag on empty water must pan');
  console.log('PASS P5: actual touch drag moves the hydrophone without snapping back, and pans elsewhere');

  await page.click('#experimentPlay');
  await page.waitForFunction(() => S.playing);
  await page.click('#experimentSettings');
  const paused = await state(page);
  assert.equal(paused.playing, false);
  assert(await page.$eval('#detailContent #src', element => element.getBoundingClientRect().width > 100));
  assert.equal(await page.$eval('#cpReset', element => element.offsetParent), null, 'Profile-drag reset is desktop-only');
  await setRange(page, '#fan', 8);
  assert.equal((await state(page)).fan, 8);
  const edited = await state(page);
  await page.click('[data-detail="measurements"]');
  assert(await page.$eval('#detailContent #rdl', element => element.children.length >= 16));
  assert(await page.$eval('#cTL', element => element.getBoundingClientRect().width >= 250));
  assert(await page.$eval('#inset3d', element => element.getBoundingClientRect().height >= 150));
  assert(await page.$eval('#experimentDetails', element => element.scrollWidth <= element.clientWidth + 2), 'Sheet must not scroll sideways');
  if (screenshots) await page.screenshot({ path: `${screenshots}/phone-measurements.png` });
  await page.click('[data-detail="why"]');
  assert.equal(await page.$$eval('#detailContent .ex', elements => elements.length), 9);
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
  assert.equal(await page.evaluate(() => PW), 158, 'Desktop keeps the c(z) panel');
  assert.equal((await state(page)).scen, 'deepchannel');
  if (screenshots) await page.screenshot({ path: `${screenshots}/desktop-lab.png` });
  console.log('PASS P7: rotation preserves chosen mode; fresh desktop retains Full lab and original scenario');

  await setRange(page, '#prog', 0.5);
  const desk = await layout(page);
  // the source sits on the left edge, clear of the floating readout card that can cover the hydrophone
  const depthBefore = (await state(page)).src;
  await page.mouse.move(desk.stage.x + desk.source.x, desk.stage.y + desk.source.y);
  await page.mouse.down();
  await page.mouse.move(desk.stage.x + desk.source.x, desk.stage.y + desk.source.y + 60, { steps: 4 });
  await page.mouse.up();
  assert(Math.abs((await state(page)).src - depthBefore) >= 300, 'Desktop mouse drag must still move the source');
  const pan0d = (await state(page)).pan;
  await page.mouse.move(desk.stage.x + 600, desk.stage.y + 40);
  await page.mouse.down();
  await page.mouse.move(desk.stage.x + 660, desk.stage.y + 40, { steps: 4 });
  await page.mouse.up();
  assert.notEqual((await state(page)).pan, pan0d, 'Desktop drag must pan');
  await page.mouse.click(desk.stage.x + 600, desk.stage.y + 40, { count: 2, delay: 80 });
  await settle();
  assert.equal((await state(page)).pan, 0);
  const spanBefore = (await state(page)).span;
  await page.mouse.move(desk.stage.x + 600, desk.stage.y + 100);
  await page.mouse.wheel({ deltaY: -300 });
  await settle();
  assert((await state(page)).span < spanBefore, 'Wheel must still zoom the range axis');
  assert.match(await page.$eval('#inset3d .cap', element => element.textContent), /schematic/i);
  assert.equal(await page.$eval('#experimentControls', element => getComputedStyle(element).display), 'none');
  console.log('PASS P10: desktop source drag, pan/recenter, wheel zoom and inset unchanged');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + collection, { waitUntil: 'load' });
  await page.waitForSelector('#frame');
  await page.select('#topicSelect', 'sofar');
  await page.waitForFunction(() => document.querySelector('#tabs button.on').dataset.k === 'sofar');
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
