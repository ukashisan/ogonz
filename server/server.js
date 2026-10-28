// Ogonz on your computer: runs the park here and serves it to any screen on
// the same Wi-Fi (a browser, or the Fire TV app). No dependencies.
// Usage: node server/server.js   (PORT=8080, OGONZ_SAVE=path/to/save.json)

import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sim from '../src/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const SAVE = process.env.OGONZ_SAVE || join(ROOT, 'ogonz-save.json');
export const DISCOVERY_PORT = 41234;            // the Fire TV app asks "OGONZ?" here
const TICK_MS = 50;
const SEND_MS = 100;
const SAVE_MS = 15000;
const SPEEDS = [0, 1, 4, 15];
const APK = join(ROOT, 'ogonz-tv.apk');
const APK_URL = 'https://github.com/ukashisan/ogonz/releases/download/tv-latest/ogonz-tv.apk';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
// Only the game is served, not the save, the tests or the maker.
const PUBLIC = /^(index\.html|styles\.css|manifest\.webmanifest|sw\.js|icon-\d+\.png|src\/[\w-]+\.js)$/;

export async function start({ port = PORT, save = SAVE, discovery = DISCOVERY_PORT, quiet = false } = {}) {
  let s = await load(save);
  let speed = 4;
  const clients = new Set();
  const say = (...a) => { if (!quiet) console.log(...a); };

  let last = Date.now();
  const ticker = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(1, (now - last) / 1000);
    last = now;
    if (speed) sim.step(s, dt * speed);
  }, TICK_MS);

  const snapshot = () => 'data: ' + JSON.stringify({ speed, state: s }) + '\n\n';
  const sender = setInterval(() => {
    if (!clients.size) return;
    const msg = snapshot();
    for (const res of clients) res.write(msg);
  }, SEND_MS);

  const persist = async () => {
    try {
      await writeFile(save + '.tmp', sim.serialize(s));
      await rename(save + '.tmp', save);
    } catch (e) { say('Could not save:', e.message); }
  };
  const saver = setInterval(persist, SAVE_MS);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/info') return json(res, { game: 'ogonz', speed });
    if (url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(snapshot());
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/api/speed' && req.method === 'POST') {
      const v = Number(url.searchParams.get('v'));
      if (SPEEDS.includes(v)) speed = v;
      return json(res, { speed });
    }
    if (url.pathname === '/apk') {
      // Lets the Fire TV's Downloader app fetch the viewer from this computer.
      if (!existsSync(APK)) { res.writeHead(302, { location: APK_URL }).end(); return; }
      res.writeHead(200, { 'content-type': 'application/vnd.android.package-archive',
        'content-disposition': 'attachment; filename="ogonz-tv.apk"' });
      createReadStream(APK).pipe(res);
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '').replace(/\\/g, '/');
    if (path === '') path = 'index.html';
    if (!PUBLIC.test(path)) { res.writeHead(404).end(); return; }
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, ok); });
  const actualPort = server.address().port;

  // LAN discovery: the TV app broadcasts "OGONZ?" and we answer with our port.
  let udp = null;
  if (discovery !== false) {
    udp = createSocket({ type: 'udp4', reuseAddr: true });
    udp.on('message', (msg, from) => {
      if (msg.toString().trim() === 'OGONZ?') udp.send('OGONZ ' + actualPort, from.port, from.address);
    });
    udp.on('error', e => say('Discovery unavailable (' + e.message + '); enter the address on the TV instead.'));
    udp.bind(discovery);
  }

  say('Sunset Trailer Haven is running.');
  say('  On this computer:  http://localhost:' + actualPort);
  for (const ip of lanAddresses()) say('  On your Wi-Fi:     http://' + ip + ':' + actualPort + '   (Fire TV app finds this by itself)');
  say('Press Ctrl+C to stop. The park is saved to ' + save);

  async function stop() {
    clearInterval(ticker); clearInterval(sender); clearInterval(saver);
    for (const res of clients) res.end();
    if (udp) udp.close();
    await new Promise(ok => server.close(ok));
    await persist();
  }
  return { port: actualPort, stop, get state() { return s; }, get speed() { return speed; } };
}

async function load(path) {
  try {
    return sim.deserialize(await readFile(path, 'utf8'));
  } catch {
    return sim.newGame();
  }
}

function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
  res.end(JSON.stringify(body));
}

function lanAddresses() {
  return Object.values(networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const app = await start().catch(e => {
    console.error(e.code === 'EADDRINUSE' ? 'Port ' + PORT + ' is busy. Try: PORT=8081 npm start' : e.message);
    process.exit(1);
  });
  const quit = () => app.stop().then(() => process.exit(0));
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}
