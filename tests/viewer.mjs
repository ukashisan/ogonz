// Viewer mode end to end: the park runs in server/server.js, two screens
// (a laptop and a TV) show the same park, and speed set on one reaches both.
// Usage: node tests/viewer.mjs   (SHOTS=dir to save screenshots)
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start } from '../server/server.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const fail = msg => { throw new Error(msg); };

const app = await start({ port: 0, save: join(await mkdtemp(join(tmpdir(), 'ogonz-')), 's.json'), discovery: false, quiet: true });
const url = 'http://localhost:' + app.port + '/';
const browser = await chromium.launch();
try {
  const open = async size => {
    const page = await (await browser.newContext({ viewport: size })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__ogonz && window.__ogonz.state);
    return { page, errors };
  };
  const tv = await open({ width: 1920, height: 1080 });
  const laptop = await open({ width: 1280, height: 800 });
  if (!(await tv.page.evaluate(() => window.__ogonz.remote))) fail('page did not switch to viewer mode');

  // Both screens show the server's park.
  const names = app.state.ogonz.map(o => o.name).sort().join();
  for (const { page } of [tv, laptop]) {
    const seen = await page.evaluate(() => window.__ogonz.state.ogonz.map(o => o.name).sort().join());
    if (seen !== names) fail('screen shows a different park');
  }

  // Pausing on the laptop pauses the park and shows on the TV.
  await laptop.page.click('#speeds button[data-speed="0"]');
  await tv.page.waitForSelector('#speeds button[data-speed="0"].on');
  if (app.speed !== 0) fail('server did not pause');
  const t0 = app.state.minutes;
  await tv.page.waitForTimeout(500);
  if (app.state.minutes !== t0) fail('park kept running while paused');

  // Fastest on the TV: the clock moves on every screen.
  await tv.page.click('#speeds button[data-speed="15"]');
  const clock = () => laptop.page.textContent('#clock');
  const c1 = await clock();
  await laptop.page.waitForFunction(c => document.getElementById('clock').textContent !== c, c1);
  await tv.page.waitForSelector('#spot .name');
  await tv.page.waitForFunction(() => document.querySelectorAll('#news li').length > 0);

  // The server going away shows a notice instead of a frozen park.
  if (process.env.SHOTS) await tv.page.screenshot({ path: join(process.env.SHOTS, 'viewer-tv.png') });
  await app.stop();
  await tv.page.waitForSelector('#offline:not([hidden])');

  for (const { errors } of [tv, laptop]) if (errors.length) fail('page errors: ' + errors.join('; '));
  console.log('viewer: ok');
} finally {
  await browser.close();
  await app.stop().catch(() => {});
}
