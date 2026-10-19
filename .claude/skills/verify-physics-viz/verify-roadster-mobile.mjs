/* Run beside verify-tesla-roadster.mjs: node phone.mjs /work/tesla-roadster.html /work/index.html /shots */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const [file, collection, shots] = process.argv.slice(2);
assert(file && collection);
if (shots) fs.mkdirSync(shots, { recursive: true });
const args = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await puppeteer.launch({ headless: true, args });
const page = await browser.newPage(), errors = [], network = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
const settle = async () => {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const snap = () => page.evaluate(() => {
  const s = RDX.S;
  return { pre: s.pre, tab: s.tab, t: s.t, dur: s.dur, rate: s.rate, playing: s.playing, cd: s.cd, P: s.P, cam: { mode: s.cam.mode, dyaw: s.cam.dyaw, dpit: s.cam.dpit, dd: s.cam.dd } };
});
const range = async (selector, value) => {
  await page.$eval(selector, (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await settle();
};
const layout = () => page.evaluate(() => {
  const rect = selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { width: r.width, height: r.height, bottom: r.bottom };
  };
  return { width: innerWidth, height: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
    stage: rect('#stage'), plot: rect('#p1'), controls: rect('#experimentControls') };
});
const fits = (m, label) => {
  assert(m.sw <= m.width + 2 && m.sh <= m.height + 2, `${label}: page overflow`);
  assert(m.stage.height >= 110, `${label}: stage ${m.stage.height} <110px`);
  assert(m.plot.height >= 100 && m.controls.bottom <= m.height + 2, `${label}: controls or plot clipped`);
};
try {
  const source = fs.readFileSync(file, 'utf8');
  new Function(source.match(/<script>([\s\S]*?)<\/script>/)[1]);
  assert(!/<script[^>]*src=|fetch\s*\(|<link\b/i.test(source));
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto('file://' + file);
    await settle();
    assert.equal((await snap()).pre, 'hover');
    fits(await layout(), `${width}x${height}`);
    for (const preset of ['hover', 'launch', 'roll', 'climb', 'park', 'corner']) {
      await page.select('#experimentScenario', preset);
      for (const fraction of [0, .45, .95]) {
        await range('#experimentProgress', fraction);
        fits(await layout(), `${width}x${height} ${preset}`);
        const framing = await page.evaluate(() => {
          const s = RDX.S, matrix = carM(poseAt(s.tr, s.t)), points = [];
          for (const x of [-2.3, 2.3]) for (const y of [0, 1.2]) for (const z of [-1, 1])
            points.push(projPt(mat.pt(matrix, [x, y, z])));
          return { points, width: s.W, height: s.H };
        });
        assert(framing.points.every(point => point && point[0] >= 0 && point[0] <= framing.width && point[1] >= 0 && point[1] <= framing.height),
          `${width}x${height} ${preset}@${fraction}: car clips camera ${JSON.stringify(framing)}`);
      }
    }
  }
  console.log('PASS P1: standalone parses; four portrait sizes fit; phone starts on hover');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await settle();
  for (const preset of ['hover', 'launch', 'roll', 'climb', 'park', 'corner']) {
    await page.select('#experimentScenario', preset);
    await settle();
    await range('#experimentProgress', .45);
    fits(await layout(), preset);
    assert(await page.$eval('#experimentHeadline .tg', el => el.textContent === 'DER'));
    assert(!/NaN|undefined|Infinity/.test(await page.$eval('#experimentResult', el => el.textContent)));
    const before = await snap();
    await page.click('[data-view="lab"]'); await settle();
    assert.deepEqual(await snap(), before, `${preset}: lab changes state`);
    await page.click('[data-view="experiment"]'); await settle();
    assert.deepEqual(await snap(), before, `${preset}: experiment changes state`);
    const ink = await page.$eval('#p1', canvas => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0; for (let i = 0; i < data.length; i += 40) if (data[i] > 80 || data[i + 1] > 80 || data[i + 2] > 80) n++;
      return n / (data.length / 40);
    });
    assert(ink > .01, `${preset}: plot ink ${ink}`);
    if (shots) await page.screenshot({ path: `${shots}/roadster-${preset}.png` });
  }
  console.log('PASS P2: six experiments paint plots, carry confidence chips, preserve state across modes');
  await page.select('#experimentScenario', 'hover');
  await page.click('#experimentPlay');
  await page.waitForFunction(() => RDX.S.t > .1);
  const switchActive = await page.evaluate(() => {
    const before = { t: RDX.S.t, playing: RDX.S.playing };
    document.querySelector('[data-view="lab"]').click(); document.querySelector('[data-view="experiment"]').click();
    return [before, { t: RDX.S.t, playing: RDX.S.playing }];
  });
  assert.deepEqual(...switchActive);
  await page.click('#experimentSettings');
  const paused = await snap(); assert.equal(paused.playing, false);
  await range('#mass', 2000);
  assert.equal((await snap()).P.mass, 2000);
  await page.click('[data-detail="measurements"]'); await settle();
  assert(await page.$eval('#detailContent #rdl', el => el.children.length >= 12));
  assert(await page.$eval('#inset', el => el.getBoundingClientRect().height >= 190));
  assert(await page.$eval('#experimentDetails', el => el.scrollWidth <= el.clientWidth + 2));
  if (shots) await page.screenshot({ path: `${shots}/roadster-measures.png` });
  await page.click('[data-detail="why"]');
  assert.equal(await page.$$eval('#detailContent .ex', elements => elements.length), 5);
  await page.click('#detailClose'); await settle();
  assert.equal((await snap()).t, paused.t);
  assert(await page.$('main>aside')); assert(await page.$('#stage>#inset')); assert(await page.$('#stage>#readouts'));
  await page.click('#experimentKeep');
  await range('#experimentLever', 600);
  assert.equal((await snap()).P.p0, 600);
  assert.equal(await page.$eval('#experimentComparison', el => el.hidden), false);
  if (shots) await page.screenshot({ path: `${shots}/roadster-comparison.png` });
  await page.click('#experimentKeep');
  await settle();
  assert.equal(await page.$eval('#experimentComparison', el => el.hidden), true);
  console.log('PASS P3: active playback survives mode switch; details pause and restore; held comparison survives reparam');

  const client = await page.createCDPSession();
  const r = await page.$eval('#gl', el => { const r = el.getBoundingClientRect(); return { x: r.x + 50, y: r.y + 60 }; });
  const image = await page.screenshot();
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [r] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x + 70, y: r.y + 20 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  assert(await page.evaluate(() => Math.abs(E.yaw) > .1), 'Touch drag must update camera yaw');
  assert(!image.equals(await page.screenshot()), 'Touch orbit must change image');
  await page.click('#experimentSettings');
  await page.$eval('#experimentCenter', element => element.click());
  assert.equal(await page.evaluate(() => E.yaw), 0);
  await page.click('#detailClose'); await settle();
  await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
  await settle();
  assert.equal(await page.$eval('[data-view="experiment"]', el => el.getAttribute('aria-pressed')), 'true');
  console.log('PASS P4: touch orbit changes view; rotation preserves mode');
  await page.setViewport({ width: 1440, height: 940, isMobile: false, hasTouch: false });
  await page.goto('file://' + file); await settle();
  assert.equal((await snap()).pre, 'launch');
  assert.equal(await page.$eval('[data-view="lab"]', el => el.getAttribute('aria-pressed')), 'true');
  if (shots) await page.screenshot({ path: `${shots}/roadster-desktop.png` });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('file://' + collection + '#roadster');
  const frame = await (await page.$('#frame')).contentFrame();
  await frame.waitForSelector('#experimentScenario');
  assert.equal(await frame.$eval('#experimentScenario', el => el.value), 'hover');
  assert.equal(await page.$eval('#intro', el => el.hidden), true);
  if (shots) await page.screenshot({ path: `${shots}/roadster-collection.png` });
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  console.log('PASS P5: desktop defaults retained; collection defaults to phone experiment; zero errors/network');
  const fallback = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-webgl', '--disable-3d-apis'] });
  try {
    const p = await fallback.newPage();
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await p.goto('file://' + file);
    await p.waitForFunction(() => document.querySelector('#experimentHeadline').textContent.length > 0);
    assert.equal(await p.$eval('#nogl', el => getComputedStyle(el).display), 'flex');
    assert(await p.$eval('#rdl', el => el.children.length >= 12));
  } finally { await fallback.close(); }
  console.log('PASS P6: phone without WebGL still shows result, plots and readouts');
} finally { await browser.close(); }
