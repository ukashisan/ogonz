// App shell: game loop, pause / speed, the HUD boxes, saving.
// The park plays itself; there is no other input.
// Served by server/server.js, the page is only a viewer: the park runs on the
// computer and streams here, so a TV and a laptop show the same park.

import { WORLD, NEEDS, NEED_LABELS, WEEKDAYS, TRAITS, SCHEMES } from './data.js';
import * as sim from './sim.js';
import { draw } from './render.js';

const SAVE_KEY = 'ogonz-save-v4';
const SPOTLIGHT_SECONDS = 15;
const $ = id => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');
// The map is drawn at native pixel-art resolution, then scaled up crisply.
const pix = document.createElement('canvas');
pix.width = WORLD.w;
pix.height = WORLD.h;
const pctx = pix.getContext('2d');

const remote = await serverRunning();
let s = remote ? null : load() || sim.newGame();
let speed = 4;
let spotlightId = null;
let spotlightSince = 0;

// ---------- viewer mode ----------

async function serverRunning() {
  try {
    const r = await fetch('api/info', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    return r.ok && (await r.json()).game === 'ogonz';
  } catch (e) {
    return false;
  }
}

// Snapshots arrive ten times a second; positions are blended between the
// last two so walking stays smooth.
const SNAPSHOT_MS = 100;
let prev = null, prevAt = 0, gotAt = 0;
function listen() {
  const src = new EventSource('api/stream');
  src.onmessage = e => {
    const msg = JSON.parse(e.data);
    prev = s; prevAt = gotAt;
    s = msg.state; gotAt = performance.now();
    if (msg.speed !== speed) markSpeed(msg.speed);
    $('offline').hidden = true;
  };
  src.onerror = () => { $('offline').hidden = false; };
}
function blended(now) {
  if (!prev) return s;
  const k = Math.min(1, (now - gotAt) / Math.max(1, Math.min(gotAt - prevAt, SNAPSHOT_MS * 3)));
  const before = new Map(prev.ogonz.map(o => [o.id, o]));
  return { ...s, ogonz: s.ogonz.map(o => {
    const p = before.get(o.id);
    if (!p || Math.hypot(o.x - p.x, o.y - p.y) > 40) return o;     // went indoors, launched, moved house
    return { ...o, x: p.x + (o.x - p.x) * k, y: p.y + (o.y - p.y) * k };
  }) };
}

// ---------- saving ----------

function load() {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    return json ? sim.deserialize(json) : null;
  } catch (e) {
    return null;
  }
}
function save() {
  if (remote) return;
  try { localStorage.setItem(SAVE_KEY, sim.serialize(s)); } catch (e) { /* storage full or blocked */ }
}
setInterval(save, 15000);
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---------- canvas sizing ----------

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
}
new ResizeObserver(resize).observe(canvas);
resize();

// ---------- speed ----------

function setSpeed(v) {
  markSpeed(v);
  if (remote) fetch('api/speed?v=' + v, { method: 'POST' }).catch(() => {});
}
function markSpeed(v) {
  speed = v;
  for (const b of document.querySelectorAll('#speeds button')) b.classList.toggle('on', Number(b.dataset.speed) === v);
}
for (const b of document.querySelectorAll('#speeds button')) b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));
addEventListener('keydown', e => {
  if (e.target.closest('button')) return;      // let Space/Enter press the focused button
  // Keyboard, and the Fire TV remote's play / fast-forward / rewind keys.
  const SPEEDS = [0, 1, 4, 15];
  const i = SPEEDS.indexOf(speed);
  const keys = { ' ': speed ? 0 : 4, '1': 1, '2': 4, '3': 15, MediaPlayPause: speed ? 0 : 4,
    MediaFastForward: SPEEDS[Math.min(3, i + 1)], MediaRewind: SPEEDS[Math.max(0, i - 1)] };
  if (e.key in keys) { e.preventDefault(); setSpeed(keys[e.key]); }
});
setSpeed(speed);

// ---------- HUD ----------

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'style') e.style.cssText = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}
const setText = (node, t) => { if (node.textContent !== t) node.textContent = t; };

function updateHud() {
  const c = sim.clock(s);
  setText($('clock'), 'DAY ' + (c.day + 1) + ' · ' + WEEKDAYS[c.weekday].toUpperCase() + ' ' +
    String(c.hour).padStart(2, '0') + ':' + String(c.minute).padStart(2, '0'));
  setText($('cash'), sim.money(s.ogonz.reduce((t, o) => t + o.cash, 0)) + ' park cash');
  const open = s.stalls.filter(st => { const o = sim.byId(s.ogonz, st.ownerId); return o && sim.isTending(o, st); }).length;
  setText($('schemes'), 'SCHEMES · ' + s.stalls.length + ' ACTIVE · ' + open + ' OPEN');
  const rich = s.ogonz.reduce((a, o) => (!a || o.cash > a.cash ? o : a), null);
  setText($('top'), rich ? 'TOP HUSTLER: ' + rich.name + ' ' + sim.money(rich.cash) : '');
}

// The spotlight moves to the next resident who is out and about every few seconds.
function updateSpotlight(now) {
  const seen = s.ogonz.filter(sim.visible);
  const pool = seen.length ? seen : s.ogonz;
  const current = sim.byId(s.ogonz, spotlightId);
  if (!current || now - spotlightSince > SPOTLIGHT_SECONDS * 1000) {
    const next = pool[(pool.indexOf(current) + 1) % pool.length] || null;
    spotlightId = next ? next.id : null;
    spotlightSince = now;
    buildSpot();
  }
}

let spotUpdaters = [];
function buildSpot() {
  const o = sim.byId(s.ogonz, spotlightId);
  spotUpdaters = [];
  const box = $('spot');
  if (!o) { box.replaceChildren(); return; }
  // Look the resident up each time: in viewer mode every snapshot is a new object.
  const live = (node, fn) => { spotUpdaters.push(() => fn(node, sim.byId(s.ogonz, o.id) || o)); return node; };
  const needs = el('div', { class: 'needs' });
  for (const n of NEEDS) {
    const fill = el('i');
    live(fill, (f, o) => { const v = o.needs[n]; f.style.width = v + '%'; f.style.background = `hsl(${Math.round(v * 1.2)}, 70%, 50%)`; });
    needs.append(el('span', {}, NEED_LABELS[n]), el('div', { class: 'meter' }, fill));
  }
  box.replaceChildren(
    el('div', { class: 'name' }, o.name),
    live(el('div', { class: 'muted' }), (n, o) => {
      const st = sim.stallOf(s, o);
      const what = st ? SCHEMES[st.type].name : sim.stage(o) === 'child' ? 'Kid' : 'No scheme';
      setText(n, Math.floor(o.age) + ' · ' + o.traits.map(t => TRAITS[t]).join(', ') + ' · ' + what + ' · ' + sim.money(o.cash));
    }),
    live(el('div', { class: 'now' }), (n, o) => setText(n, sim.activityLabel(s, o))),
    needs,
    live(el('ul', { class: 'rels' }), (n, o) => {
      const rows = s.ogonz.filter(x => x.id !== o.id)
        .map(x => ({ x, v: sim.pairRel(o, x), label: sim.relLabel(s, o, x) }))
        .filter(r => r.label !== 'Stranger')
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3);
      const key = rows.map(r => r.x.id + r.label).join();
      if (n.dataset.key === key) return;
      n.dataset.key = key;
      n.replaceChildren(...rows.map(r => el('li', {}, el('span', {}, r.x.name), el('span', { class: 'tag ' + tagClass(r.label) }, r.label))));
    })
  );
}

function tagClass(label) {
  if (['In love', 'Crush'].includes(label)) return 'love';
  if (['Best friend', 'Friend', 'Parent', 'Child'].includes(label)) return 'good';
  if (['Rival', 'Enemy', 'Nemesis'].includes(label)) return 'bad';
  return '';
}

function updateNews() {
  const items = s.log.slice(-3).reverse();
  const n = $('news');
  const key = items.map(l => l.t + l.text).join('\n');
  if (n.dataset.key === key) return;
  n.dataset.key = key;
  n.replaceChildren(...items.map(l => el('li', {}, 'DAY ' + (Math.floor(l.t / 1440) + 1) + ' · ' + l.text)));
}

// ---------- loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!s) { requestAnimationFrame(frame); return; }          // waiting for the first snapshot
  if (!remote && speed) sim.step(s, dt * speed);
  if (!sim.byId(s.ogonz, spotlightId)) spotlightSince = 0;
  updateSpotlight(now);

  draw(pctx, remote ? blended(now) : s, { selectedId: spotlightId, time: now / 1000 });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pix, 0, 0, canvas.width, canvas.height);

  updateHud();
  for (const u of spotUpdaters) u();
  updateNews();
  requestAnimationFrame(frame);
}
if (remote) listen();
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for automated tests.
window.__ogonz = { get state() { return s; }, sim, setSpeed, save, remote };
