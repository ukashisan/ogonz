// End-to-end check in headless Chromium on phone, tablet and desktop sizes:
// loads the game, gives an order by tapping furniture, buys an item, checks
// time passes, and that the save survives a reload (online and offline).
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
  phone: devices['iPhone 13'],
  tablet: { ...devices['iPad (gen 7) landscape'] },
  desktop: { viewport: { width: 1280, height: 800 } }
};

const fail = msg => { throw new Error(msg); };
const browser = await chromium.launch();

// Clicks a world coordinate on the canvas, accounting for scaling/letterboxing.
async function tapWorld(page, x, y, touch) {
  const p = await page.evaluate(([x, y]) => {
    const r = document.getElementById('view').getBoundingClientRect();
    const scale = Math.min(r.width / 800, r.height / 430);
    return { x: r.left + (r.width - 800 * scale) / 2 + x * scale, y: r.top + (r.height - 430 * scale) / 2 + y * scale };
  }, [x, y]);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

try {
  for (const [name, device] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const touch = !!device.hasTouch;

    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.locator('#panel h2', { hasText: 'Household' }).waitFor();
    const state = () => page.evaluate(() => {
      const s = window.__ogonz.state;
      return { minutes: s.minutes, money: s.money, objects: s.objects.length, ogonz: s.ogonz.length,
        sel: window.__ogonz.ui.selectedId, labels: s.ogonz.map(o => window.__ogonz.sim.activityLabel(o)),
        queue: s.ogonz.map(o => o.queue.length) };
    });

    // Order the selected Ogon to use the TV (ground floor, x=420) by tapping it.
    const before = await state();
    await tapWorld(page, 420, 340, touch);
    const afterOrder = await state();
    const idx = (await page.evaluate(() => window.__ogonz.state.ogonz.findIndex(o => o.id === window.__ogonz.ui.selectedId)));
    if (afterOrder.labels[idx] !== 'Watch TV' && afterOrder.queue[idx] === before.queue[idx]) {
      // The order is queued; give the sim a moment to start it.
      await page.waitForTimeout(300);
      const again = await state();
      if (again.labels[idx] !== 'Watch TV') fail(name + ': order not taken, doing ' + again.labels[idx]);
    }

    // Time passes at top speed.
    await page.click('#speeds button[data-speed="15"]');
    await page.waitForTimeout(1500);
    const later = await state();
    if (later.minutes - before.minutes < 10) fail(name + ': time did not advance');

    // Buy a plant on the upper floor at x=640.
    await page.click('#speeds button[data-speed="0"]');
    await page.click('#panel button:text-is("Buy")');
    await page.click('#panel .catalog button:has-text("Plant")');
    await tapWorld(page, 640, 190, touch);
    const bought = await state();
    if (bought.objects !== before.objects + 1) fail(name + ': plant not bought');
    if (bought.money !== later.money - 60) fail(name + ': money not charged');
    await page.click('#panel button:text-is("Done")');

    // Add an Ogon.
    await page.click('#panel button:text-is("Add Ogon")');
    if ((await state()).ogonz !== before.ogonz + 1) fail(name + ': add Ogon failed');

    await page.evaluate(() => window.__ogonz.save());
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/' + name + '.png' });

    // Reload, then reload offline.
    const saved = await state();
    await page.reload();
    await page.locator('#panel h2', { hasText: 'Household' }).waitFor();
    const reloaded = await state();
    if (reloaded.objects !== saved.objects || reloaded.ogonz !== saved.ogonz) fail(name + ': save not restored');
    await context.setOffline(true);
    await page.reload();
    await page.locator('#panel h2', { hasText: 'Household' }).waitFor();
    if ((await state()).ogonz !== saved.ogonz) fail(name + ': offline reload failed');

    if (errors.length) fail(name + ': page errors: ' + errors.join('; '));
    console.log(name + ' ok');
    await context.close();
  }
  console.log('smoke test passed');
} finally {
  await browser.close();
  server.close();
}
