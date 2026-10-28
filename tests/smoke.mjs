// End-to-end check in headless Chromium at landscape phone, tablet, desktop
// and TV sizes: the sim runs by itself, days pass at top speed, the panel
// tells the story, and the save survives a reload (online and offline).
// Usage: node tests/smoke.mjs   (SHOTS=dir to save screenshots)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
  if (path === '' || path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const url = 'http://localhost:' + server.address().port + '/';

const VIEWPORTS = {
  phone: devices['iPhone 13 landscape'],
  tablet: devices['iPad (gen 7) landscape'],
  desktop: { viewport: { width: 1280, height: 800 } },
  tv: { viewport: { width: 1920, height: 1080 } }
};

const fail = msg => { throw new Error(msg); };
const browser = await chromium.launch();

try {
  for (const [name, device] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const state = () => page.evaluate(() => {
      const s = window.__ogonz.state;
      return { minutes: s.minutes, ogonz: s.ogonz.length, names: s.ogonz.map(o => o.name), log: s.log.length };
    });

    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.locator('#panel h3', { hasText: 'Residents' }).waitFor();
    const start = await state();
    for (const n of start.names) await page.locator('#panel .chip', { hasText: n }).first().waitFor();

    // It runs by itself; speed it up and let a couple of days pass.
    await page.click('#speeds button[data-speed="15"]');
    await page.evaluate(() => { const { sim, state } = window.__ogonz; sim.step(state, 2 * 1440); });
    await page.waitForTimeout(1500);
    const later = await state();
    if (later.minutes - start.minutes < 2 * 1440) fail(name + ': time did not advance');
    if (!(await page.locator('#panel .log li').count())) fail(name + ': no news');
    if (!(await page.textContent('#clock')).startsWith('Day 3')) fail(name + ': clock shows ' + await page.textContent('#clock'));

    // Pause stops time.
    await page.click('#speeds button[data-speed="0"]');
    const paused = (await state()).minutes;
    await page.waitForTimeout(400);
    if ((await state()).minutes !== paused) fail(name + ': pause did not stop time');

    await page.evaluate(() => window.__ogonz.save());
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/' + name + '.png' });

    // Reload, then reload offline: the same household is still there.
    const saved = await state();
    await page.reload();
    await page.locator('#panel h3', { hasText: 'Residents' }).waitFor();
    const reloaded = await state();
    if (reloaded.names.join() !== saved.names.join()) fail(name + ': save not restored');
    await context.setOffline(true);
    await page.reload();
    await page.locator('#panel h3', { hasText: 'Residents' }).waitFor();
    if ((await state()).names.join() !== saved.names.join()) fail(name + ': offline reload failed');

    if (errors.length) fail(name + ': page errors: ' + errors.join('; '));
    console.log(name + ' ok');
    await context.close();
  }

  // Held upright: the game asks to be turned sideways.
  const context = await browser.newContext(devices['iPhone 13']);
  const page = await context.newPage();
  await page.goto(url);
  if (!(await page.isVisible('#rotate'))) fail('portrait phone: no rotate prompt');
  await context.close();
  console.log('portrait prompt ok');
  console.log('smoke test passed');
} finally {
  await browser.close();
  server.close();
}
