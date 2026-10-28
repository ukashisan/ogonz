// App shell: game loop, input, side panel, saving.

import { WORLD, FLOORS, FLOOR_H, NEEDS, NEED_LABELS, CATALOG, MAX_OGONZ, WEEKDAYS } from './data.js';
import * as sim from './sim.js';
import { draw, ogonPosition } from './render.js';

const SAVE_KEY = 'ogonz-save-v1';
const $ = id => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');

let s = load() || sim.newGame();
let speed = 1;
const ui = {
  selectedId: s.ogonz[0] ? s.ogonz[0].id : null,
  mode: 'live',        // 'live' | 'buy'
  buyType: null,       // catalog key being placed
  ghost: null,
  sellId: null,
  cursorId: null       // furniture highlighted by keyboard / TV remote
};

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

function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - fit.ox) / fit.scale, y: (e.clientY - r.top - fit.oy) / fit.scale };
}

// ---------- input ----------

function floorAt(y) {
  for (let f = 0; f < FLOORS.length; f++) if (y <= FLOORS[f] + 8 && y > FLOORS[f] - FLOOR_H) return f;
  return null;
}

function hitOgon(p) {
  for (const o of [...s.ogonz].reverse()) {
    if (o.away) continue;
    const pos = ogonPosition(o);
    if (Math.abs(p.x - pos.x) < 16 && p.y < pos.y + 16 && p.y > pos.y - 64) return o;
  }
  return null;
}

function hitObject(p) {
  return s.objects.find(o => {
    const cat = CATALOG[o.type];
    return Math.abs(p.x - o.x) <= cat.w / 2 + 4 && p.y <= FLOORS[o.floor] + 6 && p.y >= FLOORS[o.floor] - cat.h - 6;
  }) || null;
}

function updateGhost(p) {
  const floor = floorAt(p.y);
  if (floor === null || !ui.buyType) { ui.ghost = null; return; }
  const x = Math.round(p.x / 2) * 2;
  ui.ghost = { type: ui.buyType, floor, x, ok: sim.canPlace(s, ui.buyType, floor, x) };
}

canvas.addEventListener('pointermove', e => {
  if (ui.mode === 'buy' && ui.buyType && e.pointerType === 'mouse') updateGhost(toWorld(e));
});
canvas.addEventListener('pointerleave', () => { if (ui.mode === 'buy') ui.ghost = null; });

canvas.addEventListener('pointerdown', e => {
  const p = toWorld(e);
  if (ui.mode === 'buy') return buyTap(p);

  const o = hitOgon(p);
  if (o) {
    ui.selectedId = o.id;
    return;
  }
  const obj = hitObject(p);
  if (obj) orderUse(obj);
});

function orderUse(obj) {
  const cat = CATALOG[obj.type];
  const sel = sim.byId(s.ogonz, ui.selectedId);
  if (!cat.verb) return toast(cat.name + ' is decoration');
  if (!sel) return toast('Tap an Ogon first');
  if (sel.away) return toast(sel.name + ' is at work');
  sim.commandUse(s, sel.id, obj.id);
  toast(sel.name + ': ' + cat.verb);
}

function buyTap(p) {
  if (ui.buyType) {
    updateGhost(p);
    if (!ui.ghost) return;
    const r = sim.buy(s, ui.buyType, ui.ghost.floor, ui.ghost.x);
    if (r.ok) {
      toast('Bought ' + CATALOG[ui.buyType].name);
      ui.ghost = null;
      save();
    } else {
      toast(r.reason);
    }
    return;
  }
  const obj = hitObject(p);
  ui.sellId = obj ? obj.id : null;
}

addEventListener('keydown', e => {
  if (e.target.closest('input, textarea')) return;
  if (e.target === canvas && canvasKey(e)) { e.preventDefault(); return; }
  if (e.target.closest('button')) return;      // let Space/Enter press the button
  const keys = { ' ': speed ? 0 : 1, '1': 1, '2': 4, '3': 15 };
  if (e.key in keys) { e.preventDefault(); setSpeed(keys[e.key]); }
  if (e.key === 'Escape') { ui.buyType = null; ui.ghost = null; ui.sellId = null; }
});

// Keyboard / TV remote on the house: arrows move a highlight over furniture
// (or the placement preview in buy mode), Enter acts on it.
function canvasKey(e) {
  if (ui.mode === 'buy' && ui.buyType) {
    const g = ui.ghost || { floor: 0, x: 400 };
    const moves = { ArrowLeft: [0, -10], ArrowRight: [0, 10], ArrowUp: [1, 0], ArrowDown: [-1, 0] };
    if (moves[e.key]) {
      const floor = Math.max(0, Math.min(1, g.floor + moves[e.key][0]));
      const x = Math.max(0, Math.min(WORLD.w, g.x + moves[e.key][1]));
      ui.ghost = { type: ui.buyType, floor, x, ok: sim.canPlace(s, ui.buyType, floor, x) };
      return true;
    }
    if (e.key === 'Enter') { buyTap({ x: g.x, y: FLOORS[g.floor] - 10 }); return true; }
    return false;
  }

  const items = s.objects.filter(o => ui.mode === 'buy' || CATALOG[o.type].verb)
    .sort((a, b) => b.floor - a.floor || a.x - b.x);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (!items.length) return true;
    const i = items.findIndex(o => o.id === ui.cursorId);
    const next = i < 0 ? 0 : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    ui.cursorId = items[next].id;
    return true;
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (ui.mode === 'buy' || !s.ogonz.length) return true;
    const i = s.ogonz.findIndex(o => o.id === ui.selectedId);
    ui.selectedId = s.ogonz[(i + (e.key === 'ArrowDown' ? 1 : -1) + s.ogonz.length) % s.ogonz.length].id;
    return true;
  }
  if (e.key === 'Enter') {
    const obj = sim.byId(s.objects, ui.cursorId);
    if (!obj) return true;
    if (ui.mode === 'buy') ui.sellId = obj.id;
    else orderUse(obj);
    return true;
  }
  return false;
}

// ---------- top bar ----------

function setSpeed(v) {
  speed = v;
  for (const b of document.querySelectorAll('#speeds button')) b.classList.toggle('on', Number(b.dataset.speed) === v);
}
for (const b of document.querySelectorAll('#speeds button')) b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));
setSpeed(1);

function updateBar() {
  const c = sim.clock(s);
  $('clock').textContent = WEEKDAYS[c.weekday] + ' ' + String(c.hour).padStart(2, '0') + ':' + String(c.minute).padStart(2, '0');
  $('money').textContent = '§' + Math.floor(s.money).toLocaleString();
}

// ---------- panel ----------
// The panel is rebuilt only when its structure changes (keyed); live values
// are refreshed in place every frame so taps on buttons are never lost.

let panelKey = '';
let updaters = [];

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'onclick') e.addEventListener('click', attrs[k]);
    else if (k === 'class') e.className = attrs[k];
    else if (k === 'style') e.style.cssText = attrs[k];
    else if (k === 'disabled') e.disabled = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}
function live(node, fn) { updaters.push(() => fn(node)); return node; }
function meter(get, color) {
  const fill = el('i');
  live(fill, f => {
    const v = get();
    f.style.width = v + '%';
    f.style.background = color || `hsl(${Math.round(v * 1.2)}, 70%, 50%)`;
  });
  return el('div', { class: 'meter' }, fill);
}

function renderPanel() {
  const sel = sim.byId(s.ogonz, ui.selectedId);
  const key = [ui.mode, ui.buyType, ui.sellId, sel ? sel.id : '', s.ogonz.length,
    sel ? sel.queue.length : '', s.objects.length].join('|');
  if (key !== panelKey) {
    panelKey = key;
    updaters = [];
    const panel = $('panel');
    panel.replaceChildren(...(ui.mode === 'buy' ? buyPanel() : livePanel(sel)));
  }
  for (const u of updaters) u();
}

function livePanel(sel) {
  const out = [];
  out.push(el('h2', {}, 'Household'));
  out.push(el('div', { class: 'row actions' },
    el('button', { onclick: () => { ui.mode = 'buy'; ui.buyType = null; ui.sellId = null; } }, 'Buy'),
    el('button', {
      disabled: s.ogonz.length >= MAX_OGONZ,
      onclick: () => { const r = sim.addOgon(s); toast(r.ok ? r.ogon.name + ' moved in' : r.reason); if (r.ok) ui.selectedId = r.ogon.id; }
    }, 'Add Ogon')));

  const cards = el('div', { class: 'list' });
  for (const o of s.ogonz) {
    const b = el('button', { class: 'card' + (sel === o ? ' on' : ''), onclick: () => { ui.selectedId = o.id; } },
      el('span', { class: 'dot', style: 'background:' + o.color }),
      el('span', { class: 'grow' }, el('strong', {}, o.name), ' ',
        live(el('span', { class: 'muted' }), n => { n.textContent = sim.activityLabel(o); })),
      el('span', { style: 'width:4rem' }, meter(() => sim.mood(o))));
    cards.append(b);
  }
  out.push(cards);

  if (sel) {
    out.push(el('h3', {}, sel.name + ' · ' + sel.job.title));
    out.push(live(el('div', { class: 'muted' }), n => {
      n.textContent = 'Works ' + hourLabel(sel.job.start) + '–' + hourLabel(sel.job.end) +
        ' Mon–Fri, §' + sel.job.pay + '/day. Now: ' + sim.activityLabel(sel);
    }));
    const needs = el('div', { class: 'needs', style: 'margin-top:.5rem' });
    for (const n of NEEDS) needs.append(el('span', {}, NEED_LABELS[n]), meter(() => sel.needs[n]));
    out.push(needs);

    out.push(el('h3', {}, 'To do'));
    if (sel.queue.length) {
      out.push(el('ol', { class: 'log' }, ...sel.queue.map(p => el('li', {}, p.label))));
    }
    out.push(el('div', { class: 'row' },
      el('span', { class: 'muted grow' }, 'Tap furniture to give ' + sel.name + ' an order.'),
      el('button', { onclick: () => sim.cancelAll(s, sel.id) }, 'Cancel')));

    const others = s.ogonz.filter(o => o !== sel);
    if (others.length) {
      out.push(el('h3', {}, 'Relationships'));
      const list = el('div', { class: 'list' });
      for (const o of others) {
        list.append(el('div', { class: 'row' },
          el('span', { class: 'dot', style: 'background:' + o.color }),
          el('span', { class: 'grow' }, o.name, ' ',
            live(el('span', { class: 'muted' }), n => { n.textContent = relLabel(sel.rel[o.id] || 0); })),
          el('button', { onclick: () => { sim.commandChat(s, sel.id, o.id); toast(sel.name + ': chat with ' + o.name); } }, 'Chat')));
      }
      out.push(list);
    }
  }

  out.push(el('h3', {}, 'News'));
  const news = el('ul', { class: 'log' });
  out.push(live(news, n => {
    const text = s.log.slice(-5).reverse().map(l => l.text).join('\n');
    if (n.dataset.text !== text) {
      n.dataset.text = text;
      n.replaceChildren(...s.log.slice(-5).reverse().map(l => el('li', {}, l.text)));
    }
  }));
  out.push(el('div', { class: 'row', style: 'margin-top:1rem' },
    el('button', { class: 'danger', onclick: newGame }, 'New game')));
  out.push(el('p', { class: 'keys' },
    'Keyboard / remote: focus the house, then ', el('kbd', {}, '←→'), ' furniture, ',
    el('kbd', {}, '↑↓'), ' Ogon, ', el('kbd', {}, 'Enter'), ' order. ',
    el('kbd', {}, 'Space'), ' pause, ', el('kbd', {}, '1'), el('kbd', {}, '2'), el('kbd', {}, '3'), ' speed.'));
  return out;
}

function buyPanel() {
  const out = [];
  out.push(el('div', { class: 'row' },
    el('h2', { class: 'grow' }, ui.buyType ? 'Place ' + CATALOG[ui.buyType].name : 'Buy furniture'),
    el('button', { class: 'primary', onclick: () => { ui.mode = 'live'; ui.buyType = null; ui.ghost = null; ui.sellId = null; } }, 'Done')));

  if (ui.buyType) {
    out.push(el('p', { class: 'muted' }, 'Tap a free spot on either floor. Red means it doesn’t fit.'));
    out.push(el('button', { onclick: () => { ui.buyType = null; ui.ghost = null; } }, 'Back to catalog'));
    return out;
  }
  if (ui.sellId) {
    const obj = sim.byId(s.objects, ui.sellId);
    if (obj) {
      const cat = CATALOG[obj.type];
      out.push(el('div', { class: 'row' },
        el('span', { class: 'grow' }, 'Sell ' + cat.name + ' for §' + Math.floor(cat.cost / 2) + '?'),
        el('button', { class: 'danger', onclick: () => { sim.sell(s, obj.id); ui.sellId = null; save(); } }, 'Sell'),
        el('button', { onclick: () => { ui.sellId = null; } }, 'Keep')));
    }
  } else {
    out.push(el('p', { class: 'muted' }, 'Pick an item, or tap furniture in the house to sell it.'));
  }
  const grid = el('div', { class: 'catalog' });
  for (const type in CATALOG) {
    const cat = CATALOG[type];
    const what = cat.gains ? Object.keys(cat.gains).map(n => NEED_LABELS[n]).join(', ') : 'Decoration';
    grid.append(live(el('button', { onclick: () => { ui.buyType = type; ui.sellId = null; ui.ghost = null; } },
      el('strong', {}, cat.name), el('span', { class: 'muted' }, '§' + cat.cost + ' · ' + what)),
      b => { b.disabled = s.money < cat.cost; }));
  }
  out.push(grid);
  return out;
}

function hourLabel(h) { return String(h).padStart(2, '0') + ':00'; }
function relLabel(v) {
  if (v >= 60) return 'Best friends';
  if (v >= 30) return 'Friends';
  if (v >= 10) return 'Acquaintances';
  if (v <= -30) return 'Enemies';
  return 'Strangers';
}

function newGame() {
  if (!confirm('Start a new game? Your current household will be lost.')) return;
  s = sim.newGame();
  ui.selectedId = s.ogonz[0].id;
  ui.mode = 'live';
  panelKey = '';
  save();
}

// ---------- toast ----------

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

// ---------- loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (speed) sim.step(s, dt * speed);

  ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
  ctx.fillStyle = '#1b1f2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(fit.dpr * fit.scale, 0, 0, fit.dpr * fit.scale, fit.dpr * fit.ox, fit.dpr * fit.oy);
  draw(ctx, s, { selectedId: ui.selectedId, ghost: ui.mode === 'buy' ? ui.ghost : null,
    sellId: ui.mode === 'buy' ? ui.sellId : null, time: now / 1000,
    cursorId: document.activeElement === canvas ? ui.cursorId : null });

  updateBar();
  renderPanel();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for automated tests.
window.__ogonz = { get state() { return s; }, sim, ui, setSpeed, save };
