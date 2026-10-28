// App shell: game loop, viewing controls (pause / speed), side panel, saving.
// Ogonz plays itself; there is no other input.

import { WORLD, NEEDS, NEED_LABELS, WEEKDAYS, TRAITS } from './data.js';
import * as sim from './sim.js';
import { draw } from './render.js';

const SAVE_KEY = 'ogonz-save-v3';
const SPOTLIGHT_SECONDS = 15;
const $ = id => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');

let s = load() || sim.newGame();
let speed = 4;
let spotlightId = null;
let spotlightSince = 0;

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
  try { localStorage.setItem(SAVE_KEY, sim.serialize(s)); } catch (e) { /* storage full or blocked */ }
}
setInterval(save, 15000);
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ---------- canvas sizing ----------

const fit = { scale: 1, ox: 0, oy: 0, dpr: 1 };
function resize() {
  const r = canvas.getBoundingClientRect();
  fit.dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * fit.dpr);
  canvas.height = Math.round(r.height * fit.dpr);
  fit.scale = Math.min(r.width / WORLD.w, r.height / WORLD.h);
  fit.ox = (r.width - WORLD.w * fit.scale) / 2;
  fit.oy = (r.height - WORLD.h * fit.scale) / 2;
}
new ResizeObserver(resize).observe(canvas);
resize();

// ---------- speed ----------

function setSpeed(v) {
  speed = v;
  for (const b of document.querySelectorAll('#speeds button')) b.classList.toggle('on', Number(b.dataset.speed) === v);
}
for (const b of document.querySelectorAll('#speeds button')) b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));
addEventListener('keydown', e => {
  if (e.target.closest('button')) return;      // let Space/Enter press the focused button
  const keys = { ' ': speed ? 0 : 4, '1': 1, '2': 4, '3': 15 };
  if (e.key in keys) { e.preventDefault(); setSpeed(keys[e.key]); }
});
setSpeed(speed);

// ---------- panel ----------
// Rebuilt only when its structure changes; live values update in place.

let panelKey = '';
let updaters = [];

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
function live(node, fn) { updaters.push(() => fn(node)); return node; }
function text(fn, cls) {
  return live(el('span', cls ? { class: cls } : {}), n => { const t = fn(); if (n.textContent !== t) n.textContent = t; });
}
function meter(get) {
  const fill = el('i');
  live(fill, f => {
    const v = get();
    f.style.width = v + '%';
    f.style.background = `hsl(${Math.round(v * 1.2)}, 70%, 50%)`;
  });
  return el('div', { class: 'meter' }, fill);
}

// The spotlight moves to the next Ogon at home every few seconds.
function updateSpotlight(now) {
  const home = s.ogonz.filter(o => !o.out);
  const pool = home.length ? home : s.ogonz;
  const current = sim.byId(s.ogonz, spotlightId);
  if (!current || now - spotlightSince > SPOTLIGHT_SECONDS * 1000) {
    const next = pool[(pool.indexOf(current) + 1) % pool.length] || null;
    spotlightId = next ? next.id : null;
    spotlightSince = now;
  }
}

function renderPanel() {
  const spot = sim.byId(s.ogonz, spotlightId);
  const key = s.ogonz.map(o => o.id + o.home + (o.partnerId ? 'p' : '')).join(',') + '|' + (spot ? spot.id : '');
  if (key !== panelKey) {
    panelKey = key;
    updaters = [];
    $('panel').replaceChildren(...panelContent(spot));
  }
  for (const u of updaters) u();
}

function panelContent(spot) {
  const out = [];

  if (spot) {
    const apt = sim.room(spot.home);
    out.push(el('h2', {}, spot.name));
    out.push(el('div', { class: 'muted' }, text(() => {
      const st = sim.stage(spot);
      const role = spot.job ? spot.job.title : st === 'elder' ? 'Retired' : st === 'child' ? 'Little one' : 'Between jobs';
      return Math.floor(spot.age) + ' · ' + spot.traits.map(t => TRAITS[t]).join(', ') + ' · ' + role + ' · ' + apt.name;
    })));
    out.push(el('div', { class: 'now' }, text(() => sim.activityLabel(s, spot))));
    const needs = el('div', { class: 'needs' });
    for (const n of NEEDS) needs.append(el('span', {}, NEED_LABELS[n]), meter(() => spot.needs[n]));
    out.push(needs);
    out.push(el('h3', {}, 'Feelings'));
    out.push(live(el('ul', { class: 'rels' }), n => {
      const rows = s.ogonz.filter(o => o !== spot)
        .map(o => ({ o, v: sim.pairRel(spot, o), label: sim.relLabel(s, spot, o) }))
        .filter(r => r.label !== 'Stranger')
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 5);
      const key = rows.map(r => r.o.id + r.label).join();
      if (n.dataset.key === key) return;
      n.dataset.key = key;
      n.replaceChildren(...(rows.length ? rows.map(r => el('li', {},
        el('span', { class: 'dot', style: 'background:' + r.o.color }), r.o.name + ' ',
        el('span', { class: 'tag ' + tagClass(r.label) }, r.label))) : [el('li', { class: 'muted' }, 'Keeps to themselves')]));
    }));
  }

  out.push(el('h3', {}, 'Gossip'));
  out.push(live(el('div', { class: 'muted' }), n => {
    let love = null, feud = null;
    for (const a of s.ogonz) {
      for (const b of s.ogonz) {
        if (a.id >= b.id) continue;
        const v = sim.pairRel(a, b);
        if (a.partnerId === b.id && (!love || v > love.v)) love = { a, b, v };
        if (!feud || v < feud.v) feud = { a, b, v };
      }
    }
    const t = [love ? '♥ ' + love.a.name + ' & ' + love.b.name : 'Nobody is in love (yet)',
      feud && feud.v < -15 ? '⚔ ' + feud.a.name + ' vs ' + feud.b.name + ' (' + sim.relLabel(s, feud.a, feud.b) + ')'
        : 'No feuds. Suspicious.'].join('  ·  ');
    if (n.textContent !== t) n.textContent = t;
  }));

  out.push(el('h3', {}, 'Residents · ' + s.ogonz.length));
  const chips = el('div', { class: 'chips' });
  for (const o of s.ogonz) {
    chips.append(el('span', { class: 'chip' + (o === spot ? ' on' : '') },
      live(el('span', { class: 'dot' }), d => { d.style.background = `hsl(${Math.round(sim.mood(o) * 1.2)}, 70%, 50%)`; }),
      o.name, el('span', { class: 'muted' }, ' ' + o.home)));
  }
  out.push(chips);

  out.push(el('h3', {}, 'News'));
  out.push(live(el('ul', { class: 'log' }), n => {
    const items = s.log.slice(-10).reverse();
    const key = items.map(l => l.t + l.text).join('\n');
    if (n.dataset.key !== key) {
      n.dataset.key = key;
      n.replaceChildren(...items.map(l => el('li', {}, 'Day ' + (Math.floor(l.t / 1440) + 1) + ' · ' + l.text)));
    }
  }));
  return out;
}

function tagClass(label) {
  if (['In love', 'Crush'].includes(label)) return 'love';
  if (['Best friend', 'Friend', 'Parent', 'Child'].includes(label)) return 'good';
  if (['Rival', 'Enemy', 'Nemesis'].includes(label)) return 'bad';
  return '';
}

function updateBar() {
  const c = sim.clock(s);
  $('clock').textContent = 'Day ' + (c.day + 1) + ' · ' + WEEKDAYS[c.weekday] + ' ' +
    String(c.hour).padStart(2, '0') + ':' + String(c.minute).padStart(2, '0');
  $('money').textContent = s.ogonz.length + ' residents';
}

// ---------- loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (speed) sim.step(s, dt * speed);
  updateSpotlight(now);

  ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
  ctx.fillStyle = '#1b1f2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(fit.dpr * fit.scale, 0, 0, fit.dpr * fit.scale, fit.dpr * fit.ox, fit.dpr * fit.oy);
  draw(ctx, s, { selectedId: spotlightId, time: now / 1000 });

  updateBar();
  renderPanel();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for automated tests.
window.__ogonz = { get state() { return s; }, sim, setSpeed, save };
