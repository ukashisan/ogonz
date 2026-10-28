import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start } from '../server/server.js';

const dir = await mkdtemp(join(tmpdir(), 'ogonz-'));
const discovery = 42000 + Math.floor(Math.random() * 2000);
const app = await start({ port: 0, save: join(dir, 'save.json'), discovery, quiet: true });
const base = 'http://localhost:' + app.port;
test.after(() => app.stop());

test('serves the game and the info endpoint, not other files', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/src/sim.js')).status, 200);
  assert.deepEqual(await (await fetch(base + '/api/info')).json(), { game: 'ogonz', speed: 4 });
  for (const p of ['/package.json', '/server/server.js', '/tests/sim.test.js', '/../etc/passwd', '/maker/README.md'])
    assert.equal((await fetch(base + p)).status, 404, p);
});

test('streams snapshots of a park that keeps running', async () => {
  const res = await fetch(base + '/api/stream');
  const reader = res.body.getReader();
  let buf = '';
  const read = async () => {
    while (!buf.includes('\n\n')) buf += new TextDecoder().decode((await reader.read()).value);
    const msg = buf.slice(buf.indexOf('data: ') + 6, buf.indexOf('\n\n'));
    buf = buf.slice(buf.indexOf('\n\n') + 2);
    return JSON.parse(msg);
  };
  const a = await read();
  let b = a;
  for (let i = 0; i < 20 && b.state.minutes <= a.state.minutes; i++) b = await read();
  reader.cancel();
  assert.ok(a.state.ogonz.length > 0);
  assert.ok(b.state.minutes > a.state.minutes, a.state.minutes + ' then ' + b.state.minutes);
});

test('speed can be changed from any screen', async () => {
  assert.equal((await (await fetch(base + '/api/speed?v=15', { method: 'POST' })).json()).speed, 15);
  assert.equal((await (await fetch(base + '/api/speed?v=7', { method: 'POST' })).json()).speed, 15);
  await fetch(base + '/api/speed?v=4', { method: 'POST' });
});

test('answers LAN discovery with its port', async () => {
  const sock = createSocket('udp4');
  const reply = new Promise(ok => sock.on('message', m => ok(m.toString())));
  sock.send('OGONZ?', discovery, '127.0.0.1');
  assert.equal(await reply, 'OGONZ ' + app.port);
  sock.close();
});

test('the APK link points to the release when no local copy exists', async () => {
  const r = await fetch(base + '/apk', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /releases\/download\/tv-latest\/ogonz-tv\.apk$/);
});

test('saves the park on stop and picks it up again', async () => {
  const save = join(dir, 'again.json');
  const one = await start({ port: 0, save, discovery: false, quiet: true });
  await new Promise(r => setTimeout(r, 200));
  const names = one.state.ogonz.map(o => o.name);
  await one.stop();
  assert.ok(JSON.parse(await readFile(save, 'utf8')).ogonz.length);
  const two = await start({ port: 0, save, discovery: false, quiet: true });
  assert.deepEqual(two.state.ogonz.map(o => o.name), names);
  await two.stop();
});
