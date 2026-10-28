// Pixel-art renderer for Sunset Trailer Haven. Everything is drawn at the
// map's native 640x360 resolution with whole-pixel rectangles; main.js scales
// the result up with nearest-neighbour filtering.

import { WORLD, GATE, TRAILER, SCHEMES } from './data.js';
import { clock, mood, isSleeping, byId, stage, statusActive, eventActive, doorOf, isTending } from './sim.js';
import { drawText, textWidth } from './pixelfont.js';

const P = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

// ---------- static scenery (drawn once, cached) ----------

let groundCache = null;

function seeded(seed) {
  let a = seed;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

function buildGround() {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(WORLD.w, WORLD.h) : Object.assign(document.createElement('canvas'), { width: WORLD.w, height: WORLD.h });
  const g = c.getContext('2d');
  const r = seeded(7);
  // Dirt with patches, pebbles and cracks
  P(g, 0, 0, WORLD.w, WORLD.h, '#b6956a');
  for (let i = 0; i < 260; i++) {
    const w = 6 + r() * 30, h = 3 + r() * 10;
    P(g, r() * WORLD.w, 30 + r() * WORLD.h, w, h, ['#a98a5f', '#c2a379', '#9e7f56', '#b08f63'][i % 4]);
  }
  for (let i = 0; i < 900; i++) P(g, r() * WORLD.w, 30 + r() * WORLD.h, 1, 1, ['#8f7350', '#d1b58b', '#7d6545'][i % 3]);
  for (let i = 0; i < 40; i++) {        // cracks
    let x = r() * WORLD.w, y = 40 + r() * 300;
    for (let k = 0; k < 8; k++) { P(g, x, y, 1, 1, '#7a5f3e'); x += r() < 0.5 ? 1 : -1; y += 1; }
  }
  for (let i = 0; i < 70; i++) {        // dry grass tufts
    const x = r() * WORLD.w, y = 40 + r() * 310;
    P(g, x, y, 1, 3, '#8a9a4a'); P(g, x + 2, y + 1, 1, 2, '#9aab55'); P(g, x - 2, y + 1, 1, 2, '#7d8c42');
  }
  for (let i = 0; i < 6; i++) {         // puddles
    const x = 80 + r() * 480, y = 120 + r() * 200;
    g.fillStyle = '#6f8fa8';
    g.beginPath(); g.ellipse(Math.round(x), Math.round(y), 7 + r() * 6, 2 + r() * 2, 0, 0, Math.PI * 2); g.fill();
  }
  // Road along the top
  P(g, 0, 8, WORLD.w, 18, '#5c5f66');
  P(g, 0, 8, WORLD.w, 1, '#7b7f87');
  P(g, 0, 25, WORLD.w, 2, '#8a8f97');
  for (let x = 4; x < WORLD.w; x += 22) P(g, x, 16, 10, 1, '#e8c55a');
  // Mountains peeking behind the road, top right
  g.fillStyle = '#9aa5b5';
  for (const [x, h] of [[470, 7], [500, 6], [535, 8], [575, 6], [610, 7]]) {
    g.beginPath(); g.moveTo(x - 20, 8); g.lineTo(x, 8 - h); g.lineTo(x + 20, 8); g.fill();
  }
  // Track (asphalt oval) and snail track, flat on the ground
  g.fillStyle = '#6b6560';
  g.beginPath(); g.ellipse(300, 158, 74, 30, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b6956a';
  g.beginPath(); g.ellipse(300, 158, 56, 18, 0, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 40; i++) P(g, 230 + r() * 140, 130 + r() * 56, 2, 1, '#57524d');
  P(g, 336, 178, 16, 8, '#8b6a45');                 // wooden ramp
  for (let i = 0; i < 4; i++) P(g, 336, 179 + i * 2, 16, 1, '#6d5235');
  P(g, 528, 268, 92, 46, '#c8aa7c');                // snail racing pen
  g.strokeStyle = '#8a7556'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(574, 291, 36, 14, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.ellipse(574, 291, 28, 9, 0, 0, Math.PI * 2); g.stroke();
  // Chain-link fence around the park (left, right, bottom with gate)
  const fence = (x1, y1, x2, y2) => {
    const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= n; i++) {
      const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n;
      if (i % 8 === 0) P(g, x, y - 8, 1, 9, '#7d8288');
      else if ((i + Math.round(y)) % 2 === 0) P(g, x, y - 6 + (i % 4), 1, 1, '#a3a8ae');
      P(g, x, y - 8, 1, 1, '#8d9298');
    }
  };
  fence(4, 40, 4, 352);
  fence(636, 40, 636, 352);
  fence(4, 352, GATE.x - 26, 352);
  fence(GATE.x + 26, 352, 636, 352);
  return c;
}

// Trees, cacti and junk placed around the edges. [type, x, y]
const DECOR = [
  ['pine', 14, 40], ['pine', 26, 52], ['pine', 92, 38], ['pine', 620, 46], ['pine', 606, 58], ['pine', 186, 40],
  ['joshua', 192, 118], ['joshua', 98, 260], ['joshua', 610, 330], ['cactus', 368, 110], ['cactus', 470, 140],
  ['cactus', 150, 186], ['cactus', 520, 210], ['cactus', 60, 280], ['cactus', 360, 330], ['cactus', 625, 100],
  ['tires', 18, 300], ['tires', 626, 262], ['blocks', 250, 110], ['blocks', 470, 300], ['flamingo', 350, 276],
  ['flamingo', 90, 112], ['dumpster', 608, 350], ['junkcar', 120, 238], ['pole', 70, 30], ['pole', 250, 30],
  ['pole', 430, 30], ['pole', 600, 30]
];

function drawDecor(ctx, type, x, y, t) {
  switch (type) {
    case 'pine':
      P(ctx, x - 1, y - 4, 2, 4, '#5b3b22');
      for (let i = 0; i < 4; i++) P(ctx, x - 6 + i, y - 8 - i * 4, 12 - i * 2, 5, i % 2 ? '#2f5e3b' : '#27503a');
      break;
    case 'joshua':
      P(ctx, x - 1, y - 14, 2, 14, '#6d5838');
      P(ctx, x - 6, y - 12, 5, 1, '#6d5838'); P(ctx, x - 6, y - 16, 1, 4, '#6d5838');
      P(ctx, x + 1, y - 9, 5, 1, '#6d5838'); P(ctx, x + 5, y - 13, 1, 4, '#6d5838');
      for (const [ax, ay] of [[-7, -19], [4, -16], [-2, -18]]) P(ctx, x + ax, y + ay, 4, 4, '#5f7d3a');
      break;
    case 'cactus':
      P(ctx, x - 1, y - 10, 3, 10, '#3f8a43'); P(ctx, x, y - 10, 1, 10, '#56a35a');
      P(ctx, x - 4, y - 7, 2, 4, '#3f8a43'); P(ctx, x - 4, y - 4, 4, 1, '#3f8a43');
      P(ctx, x + 3, y - 8, 2, 3, '#3f8a43'); P(ctx, x + 2, y - 5, 3, 1, '#3f8a43');
      break;
    case 'tires':
      for (let i = 0; i < 3; i++) { P(ctx, x - 5, y - 3 - i * 3, 10, 3, '#222'); P(ctx, x - 2, y - 2 - i * 3, 4, 1, '#555'); }
      break;
    case 'blocks':
      P(ctx, x - 6, y - 4, 5, 4, '#9a9a96'); P(ctx, x, y - 4, 5, 4, '#a5a5a0'); P(ctx, x - 3, y - 8, 5, 4, '#8e8e8a');
      break;
    case 'flamingo':
      P(ctx, x, y - 6, 1, 6, '#333'); P(ctx, x - 3, y - 10, 5, 4, '#f783ac'); P(ctx, x + 1, y - 14, 1, 4, '#f783ac');
      P(ctx, x + 1, y - 15, 3, 2, '#f783ac'); P(ctx, x + 4, y - 14, 1, 1, '#212529');
      break;
    case 'dumpster':
      P(ctx, x - 12, y - 12, 24, 12, '#2f6b46'); P(ctx, x - 13, y - 13, 26, 2, '#245236');
      P(ctx, x - 8, y - 8, 4, 2, '#d9d9d9');
      break;
    case 'junkcar':
      P(ctx, x - 16, y - 9, 32, 7, '#5c7a5a'); P(ctx, x - 10, y - 14, 18, 5, '#4f6b4d');
      P(ctx, x - 8, y - 13, 6, 3, '#9fc5d9'); P(ctx, x + 1, y - 13, 6, 3, '#9fc5d9');
      P(ctx, x - 12, y - 3, 5, 3, '#222'); P(ctx, x + 7, y - 3, 5, 3, '#222');
      for (let i = 0; i < 5; i++) P(ctx, x - 14 + i * 6, y - 8, 2, 1, '#8b4513');
      break;
    case 'pole':
      P(ctx, x, y - 26, 2, 26, '#6d4c2f'); P(ctx, x - 5, y - 24, 12, 1, '#6d4c2f');
      break;
  }
}

function drawPowerLines(ctx) {
  ctx.strokeStyle = 'rgba(30,30,30,0.6)';
  ctx.lineWidth = 1;
  const poles = [70, 250, 430, 600];
  for (let i = 0; i < poles.length - 1; i++) {
    for (const dx of [-5, 6]) {
      ctx.beginPath();
      ctx.moveTo(poles[i] + dx, 6.5);
      ctx.quadraticCurveTo((poles[i] + poles[i + 1]) / 2, 13, poles[i + 1] + dx, 6.5);
      ctx.stroke();
    }
  }
}

// ---------- signs ----------

function sign(ctx, x, y, lines, { board = '#f1e3c4', ink = '#2b2b2b', border = '#6d4c2f', posts = true } = {}) {
  const w = Math.max(...lines.map(l => textWidth(l))) + 6;
  const h = lines.length * 6 + 4;
  const left = Math.round(x - w / 2), top = Math.round(y - h);
  if (posts) { P(ctx, left + 2, top + h, 1, 5, border); P(ctx, left + w - 3, top + h, 1, 5, border); }
  P(ctx, left - 1, top - 1, w + 2, h + 2, border);
  P(ctx, left, top, w, h, board);
  lines.forEach((l, i) => drawText(ctx, l, x, top + 2 + i * 6, ink, { align: 'center' }));
}

// ---------- trailers ----------

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = sh => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function drawTrailer(ctx, s, t, night, time) {
  const x = Math.round(t.x + (t.nudge || 0)), y = Math.round(t.y);
  const { w, face, roof } = TRAILER;
  const l = x - w / 2;
  const top = y - face - roof;
  P(ctx, l + 2, y, w - 2, 3, 'rgba(0,0,0,0.25)');                 // shadow
  P(ctx, l + 1, top, w - 2, roof, shade(t.color, 1.12));           // roof
  P(ctx, l, top + 1, w, roof - 1, shade(t.color, 1.12));
  P(ctx, l, y - face, w, face, t.color);                           // front face
  P(ctx, l, y - face + 5, w, 2, shade(t.color, 0.75));             // stripe
  P(ctx, l, y - 1, w, 1, shade(t.color, 0.6));
  // Rust patches
  const r = seeded(t.id * 31);
  for (let i = 0; i < t.rust * 6; i++) P(ctx, l + r() * (w - 3), y - face + r() * (face - 2), 2 + r() * 3, 1 + r() * 2, r() < 0.5 ? '#8b4513' : '#a0522d');
  // Windows and door
  const inside = s.ogonz.filter(o => o.inside === t.id);
  const lit = inside.length && (night || inside.some(o => !isSleeping(s, o)));
  const glass = lit ? '#ffe08a' : night ? '#1d2a44' : '#7fa7c9';
  for (const wx of [x + 2, x + 15]) {
    P(ctx, wx - 1, y - face + 2, 10, 7, shade(t.color, 0.55));
    P(ctx, wx, y - face + 3, 8, 5, glass);
  }
  const d = doorOf(t);
  P(ctx, d.x - 4 + (t.nudge || 0), y - 13, 8, 13, shade(t.color, 0.5));
  P(ctx, d.x - 3 + (t.nudge || 0), y - 12, 6, 12, shade(t.color, 0.82));
  P(ctx, d.x + 1 + (t.nudge || 0), y - 6, 1, 1, '#333');
  P(ctx, d.x - 5 + (t.nudge || 0), y, 10, 3, '#9a9a96');            // cinder block step
  // Roof gear
  if (t.ac) { P(ctx, l + 8, top + 2, 8, 6, '#adb5bd'); P(ctx, l + 9, top + 3, 6, 1, '#868e96'); }
  if (t.dish) {
    P(ctx, l + w - 12, top + 1, 7, 5, '#e9ecef'); P(ctx, l + w - 10, top + 2, 3, 3, '#ced4da');
  }
  // Snoring
  if (inside.some(o => isSleeping(s, o))) {
    const k = Math.floor(time * 1.5) % 3;
    drawText(ctx, 'Z', x + 18 + k * 2, top - 6 - k * 3, '#ffffff');
  }
}

// ---------- scheme stalls ----------

function drawStall(ctx, s, st, time) {
  const x = Math.round(st.x), y = Math.round(st.y);
  const sc = SCHEMES[st.type];
  const owner = byId(s.ogonz, st.ownerId);
  const open = owner && isTending(owner, st);
  switch (st.type) {
    case 'lemonade':
      P(ctx, x - 10, y - 14, 20, 4, '#e03131'); for (let i = 0; i < 5; i++) P(ctx, x - 10 + i * 4, y - 14, 2, 4, '#fff');
      P(ctx, x - 9, y - 10, 1, 10, '#8b6a45'); P(ctx, x + 8, y - 10, 1, 10, '#8b6a45');
      P(ctx, x - 9, y - 4, 18, 4, '#c9a46a');
      for (let i = 0; i < 4; i++) P(ctx, x - 7 + i * 4, y - 6, 2, 2, '#ffe066');
      sign(ctx, x, y - 16, sc.sign, { board: '#ffe066', ink: '#2f7a1f' });
      break;
    case 'crypto':
      P(ctx, x - 10, y - 6, 20, 6, '#f1f3f5'); P(ctx, x - 9, y - 5, 18, 2, '#74c0fc');
      for (let i = 0; i < 3; i++) {
        P(ctx, x - 8 + i * 6, y - 11, 5, 4, '#212529');
        P(ctx, x - 7 + i * 6, y - 10, 3, 2, Math.floor(time * 3 + i) % 2 ? '#40c057' : '#20c997');
      }
      P(ctx, x + 11, y - 8, 4, 4, '#ced4da'); P(ctx, x + 12 + (Math.floor(time * 8) % 2), y - 7, 1, 2, '#495057');
      sign(ctx, x, y - 13, sc.sign, { board: '#212529', ink: '#40c057' });
      break;
    case 'pyramid':
      for (let i = 0; i < 9; i++) P(ctx, x - 1 - i, y - 16 + i * 2, 2 + i * 2, 2, i % 2 ? '#e03131' : '#f1f3f5');
      P(ctx, x - 2, y - 4, 4, 4, '#3b2314');
      sign(ctx, x + 22, y - 2, sc.sign, { board: '#fff9db', ink: '#7048e8' });
      break;
    case 'alien':
      P(ctx, x - 10, y - 5, 20, 5, '#8b6a45');
      for (let i = 0; i < 4; i++) { P(ctx, x - 9 + i * 5, y - 10, 3, 5, '#a9e34b'); P(ctx, x - 9 + i * 5, y - 11, 3, 1, '#868e96'); }
      sign(ctx, x, y - 12, sc.sign, { board: '#d3f9d8', ink: '#2b8a3e' });
      break;
    case 'oil': {
      ctx.fillStyle = '#4a3622'; ctx.beginPath(); ctx.ellipse(x - 6, y - 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
      P(ctx, x + 4, y - 22, 1, 22, '#343a40'); P(ctx, x + 12, y - 22, 1, 22, '#343a40'); P(ctx, x + 4, y - 22, 9, 1, '#343a40');
      for (let i = 0; i < 5; i++) P(ctx, x + 5 + (i % 2) * 3, y - 20 + i * 4, 4, 1, '#495057');
      if (open) P(ctx, x - 7, y - 4 - (Math.floor(time * 6) % 3), 2, 2, '#8b5a2b');
      sign(ctx, x - 14, y - 6, sc.sign, { board: '#f1e3c4' });
      break;
    }
    case 'air':
      for (let i = 0; i < 3; i++) { P(ctx, x - 7 + i * 5, y - 7, 4, 6, 'rgba(220,240,255,0.7)'); P(ctx, x - 7 + i * 5, y - 8, 4, 1, '#868e96'); }
      sign(ctx, x, y - 9, sc.sign, { board: '#e7f5ff', ink: '#1971c2' });
      break;
    case 'fish':
      ctx.fillStyle = '#4d7c99'; ctx.beginPath(); ctx.ellipse(x, y - 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
      P(ctx, x - 3 + Math.round(Math.sin(time * 2) * 4), y - 3, 3, 1, '#fd7e14');
      sign(ctx, x + 16, y - 6, sc.sign, { board: '#f1e3c4' });
      break;
    case 'worms':
      for (let i = 0; i < 3; i++) {
        P(ctx, x - 12 + i * 8, y - 6, 7, 6, '#a0785a'); P(ctx, x - 11 + i * 8, y - 6, 5, 2, '#5c3d2e');
        drawText(ctx, '$', x - 10 + i * 8, y - 4, '#2b8a3e');
      }
      if (Math.floor(time * 2) % 2) P(ctx, x - 9, y - 8, 3, 1, '#f783ac');
      sign(ctx, x, y - 9, sc.sign, { board: '#f1e3c4' });
      break;
    case 'nft':
      for (let i = 0; i < 2; i++) {
        P(ctx, x - 10 + i * 11, y - 9, 9, 9, '#868e96');
        P(ctx, x - 8 + i * 11, y - 5, 5, 4, '#a0a0a0');
        for (let k = 0; k < 4; k++) P(ctx, x - 10 + i * 11 + k * 2 + 1, y - 9, 1, 9, '#495057');
      }
      sign(ctx, x, y - 11, sc.sign, { board: '#2b8a3e', ink: '#ffffff' });
      break;
    case 'tonic':
      P(ctx, x - 4, y - 10, 9, 10, '#7a5a3a'); P(ctx, x - 5, y - 11, 11, 2, '#5c3d2e');
      for (let i = 0; i < 3; i++) P(ctx, x - 12 + i * 3, y - 4, 2, 4, ['#e64980', '#7048e8', '#40c057'][i]);
      sign(ctx, x + 2, y - 12, sc.sign, { board: '#fff0f6', ink: '#a61e4d' });
      break;
    case 'robot':
      P(ctx, x - 4, y - 12, 9, 8, '#c9a46a'); P(ctx, x - 3, y - 18, 7, 6, '#c9a46a');
      P(ctx, x - 2, y - 16, 1, 1, Math.floor(time * 2) % 2 ? '#e03131' : '#212529'); P(ctx, x + 2, y - 16, 1, 1, '#212529');
      P(ctx, x - 6, y - 11, 2, 6, '#b08a55'); P(ctx, x + 5, y - 11, 2, 6, '#b08a55');
      P(ctx, x - 3, y - 4, 2, 4, '#b08a55'); P(ctx, x + 2, y - 4, 2, 4, '#b08a55');
      sign(ctx, x + 22, y - 4, sc.sign, { board: '#f1e3c4' });
      break;
    case 'tanning':
      P(ctx, x - 14, y - 8, 28, 6, '#7d6b5d'); P(ctx, x - 12, y - 11, 18, 4, '#6b5a4e');
      P(ctx, x - 12, y - 2, 4, 2, '#222'); P(ctx, x + 8, y - 2, 4, 2, '#222');
      sign(ctx, x + 2, y - 13, sc.sign, { board: '#fff3bf' });
      break;
    case 'casino':
      P(ctx, x - 7, y - 16, 14, 16, '#495057'); P(ctx, x - 6, y - 15, 12, 6, '#212529');
      drawText(ctx, '$', x - 1, y - 14, Math.floor(time * 4) % 2 ? '#ff6b6b' : '#ffd43b');
      P(ctx, x - 4, y - 7, 8, 1, '#adb5bd');
      sign(ctx, x, y - 18, sc.sign, { board: '#212529', ink: Math.floor(time * 2) % 2 ? '#f783ac' : '#66d9e8' });
      break;
  }
  if (open && Math.floor(time * 1.2 + st.id) % 4 === 0) drawText(ctx, '$', x + 12, y - 22, '#2b8a3e');
}

// ---------- shared amenities ----------

function drawAmenity(ctx, s, a, time) {
  const x = Math.round(a.x), y = Math.round(a.y);
  const broken = (a.brokenUntil || 0) > s.minutes;
  switch (a.type) {
    case 'bbq': {
      P(ctx, x - 1, y - 2, 1, 4, '#212529'); P(ctx, x + 3, y - 2, 1, 4, '#212529'); P(ctx, x - 5, y - 2, 1, 4, '#212529');
      P(ctx, x - 6, y - 7, 12, 5, '#212529'); P(ctx, x - 5, y - 8, 10, 1, '#495057');
      const party = eventActive(s, 'bbqparty');
      if (a.users.length || party) {
        for (let i = 0; i < 4; i++) P(ctx, x - 4 + i * 2, y - 10 - (Math.floor(time * 8 + i) % 3), 2, 2, i % 2 ? '#ff922b' : '#ffd43b');
        for (let i = 0; i < 3; i++) {
          const k = (time * 0.7 + i / 3) % 1;
          P(ctx, x - 2 + Math.sin(k * 6 + i) * 3, y - 14 - k * 20, 3, 3, `rgba(220,220,220,${0.6 * (1 - k)})`);
        }
        if (party && Math.floor(time * 2) % 2) drawText(ctx, '♪', x + 9, y - 18, '#7048e8');
      }
      break;
    }
    case 'hottub': {
      ctx.fillStyle = '#4dabf7'; ctx.beginPath(); ctx.ellipse(x, y - 4, 22, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a5d8ff'; ctx.beginPath(); ctx.ellipse(x, y - 4, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 6; i++) P(ctx, x - 14 + ((i * 7 + Math.floor(time * 3)) % 28), y - 6 + (i % 3) * 2, 2, 1, '#e7f5ff');
      P(ctx, x + 10 + Math.round(Math.sin(time) * 2), y - 6, 3, 2, '#ffd43b');      // rubber duck
      for (let i = 0; i < 2; i++) {
        const k = (time * 0.5 + i / 2) % 1;
        P(ctx, x - 6 + i * 10, y - 12 - k * 14, 2, 2, `rgba(255,255,255,${0.5 * (1 - k)})`);
      }
      break;
    }
    case 'potty':
      P(ctx, x - 5, y - 18, 10, 18, '#1c7ed6'); P(ctx, x - 5, y - 19, 10, 2, '#1864ab');
      P(ctx, x - 3, y - 15, 6, 14, '#228be6'); P(ctx, x + 1, y - 9, 1, 2, '#fff');
      if (broken) {
        P(ctx, x - 8, y - 13, 16, 7, '#fff'); drawText(ctx, 'OUT', x, y - 12, '#e03131', { align: 'center' });
      }
      break;
    case 'track':
      break;     // drawn flat with the ground; carts are drawn as moving props
    case 'laundry': {
      P(ctx, x - 34, y - 2, 68, 3, 'rgba(0,0,0,0.25)');
      P(ctx, x - 34, y - 28, 68, 12, '#dee2e6'); P(ctx, x - 35, y - 26, 70, 8, '#dee2e6');
      P(ctx, x - 34, y - 18, 68, 18, '#ced4da');
      for (let i = 0; i < 6; i++) P(ctx, x - 32 + i * 11, y - 18, 1, 18, '#adb5bd');
      for (let i = 0; i < 4; i++) {
        P(ctx, x - 28 + i * 14, y - 9, 10, 9, '#f8f9fa');
        P(ctx, x - 25 + i * 14, y - 7, 4, 4, Math.floor(time * 4 + i) % 2 ? '#74c0fc' : '#4dabf7');
      }
      const neon = Math.floor(time * 1.5) % 4 === 0 ? '#c2255c' : '#f783ac';
      P(ctx, x - 26, y - 44, 52, 13, '#212529');
      drawText(ctx, 'CATS', x, y - 42, '#66d9e8', { align: 'center' });
      drawText(ctx, 'LAUNDRY', x, y - 36, neon, { align: 'center' });
      break;
    }
    case 'snails':
      sign(ctx, x + 32, y - 22, ['SNAIL', 'RACING'], { board: '#f1e3c4' });
      break;
    case 'trampoline': {
      const k = a.users.length ? Math.abs(Math.sin(time * 6)) : 0;
      ctx.fillStyle = '#212529'; ctx.beginPath(); ctx.ellipse(x, y - 3, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1c7ed6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y - 3, 14, 5, 0, 0, Math.PI * 2); ctx.stroke();
      P(ctx, x - 1, y - 3 + Math.round(k), 2, 1, '#495057');
      break;
    }
    case 'catapult':
      P(ctx, x - 9, y - 4, 18, 3, '#6d4c2f'); P(ctx, x - 7, y - 1, 3, 3, '#333'); P(ctx, x + 4, y - 1, 3, 3, '#333');
      P(ctx, x - 1, y - 10, 2, 6, '#6d4c2f');
      ctx.strokeStyle = '#8b6a45'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 8, y - 6); ctx.lineTo(x + 9, y - 16); ctx.stroke();
      P(ctx, x + 8, y - 19, 4, 3, '#5c3d2e');
      break;
    case 'podium':
      P(ctx, x - 6, y - 12, 12, 12, '#7a5a3a'); P(ctx, x - 7, y - 13, 14, 2, '#5c3d2e');
      P(ctx, x - 2, y - 8, 4, 4, '#ffd43b');
      sign(ctx, x + 2, y - 16, ['GET RICH', 'QUICK!'], { board: '#fff3bf', ink: '#c92a2a' });
      break;
  }
}

// ---------- residents ----------

function drawResident(ctx, s, o, highlight, time) {
  const x = Math.round(o.x), y = Math.round(o.y);
  const st = o.plan && o.plan.steps[0];
  const walking = st && (st.type === 'goto' || st.type === 'approach');
  const cat = statusActive(s, o, 'cat');
  const kid = o.age < 12, baby = o.age < 3;
  const hair = stage(o) === 'elder' ? '#dee2e6' : o.hair;
  const f = o.facing || 1;
  let lift = 0;
  if (st && st.type === 'use') {
    const a = byId(s.amenities, st.amenityId);
    if (a && a.type === 'trampoline' && a.users.includes(o.id)) lift = Math.round(Math.abs(Math.sin(time * 6)) * 12);
  }
  if (st && st.type === 'gather' && st.event === 'bbqparty') lift = Math.round(Math.abs(Math.sin(time * 5 + o.id)) * 2);
  const flight = s.events.find(e => e.type === 'flight' && e.who === o.id && e.until > s.minutes);

  ctx.save();
  if (statusActive(s, o, 'invisible')) ctx.globalAlpha = 0.25;
  let bx = x, by = y - lift;
  if (flight) {
    const k = (s.minutes - flight.start) / (flight.until - flight.start);
    bx = Math.round(flight.fx + (flight.tx - flight.fx) * k);
    by = Math.round(flight.fy + (flight.ty - flight.fy) * k - Math.sin(k * Math.PI) * 60);
  }
  P(ctx, x - 3, y, 7, 1, 'rgba(0,0,0,0.3)');      // shadow stays on the ground

  if (highlight) {
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x + 0.5, y + 0.5, 6, 2, 0, 0, Math.PI * 2); ctx.stroke();
  }

  if (st && st.type === 'passout') {
    // Lying face down in the dirt
    P(ctx, bx - 6, by - 3, 4, 3, o.skin); P(ctx, bx - 6, by - 4, 4, 1, hair);
    P(ctx, bx - 2, by - 3, 6, 3, o.shirt); P(ctx, bx + 4, by - 2, 3, 2, '#3b4a6b');
    drawText(ctx, 'Z', bx + 4, by - 10 - (Math.floor(time * 2) % 2), '#fff');
    ctx.restore();
    return;
  }

  if (baby) {
    P(ctx, bx - 2, by - 4, 5, 4, o.shirt); P(ctx, bx - 2, by - 8, 5, 4, o.skin); P(ctx, bx - 2, by - 8, 5, 1, hair);
    P(ctx, bx - 1 + Math.max(0, f), by - 7, 1, 1, '#212529');
  } else {
    const sc = kid ? 0 : 1;              // kids are a couple of pixels shorter
    const legH = walking ? 2 + (Math.floor(time * 8) % 2) : 3;
    const pants = o.outfit === 'robe' ? o.skin : '#3b4a6b';
    P(ctx, bx - 2, by - 3, 2, legH, pants);
    P(ctx, bx + 1, by - 3, 2, walking ? 5 - legH : 3, pants);
    const bodyTop = by - 7 - sc;
    if (o.outfit === 'robe') {
      P(ctx, bx - 3, bodyTop, 7, 6 + sc, o.shirt); P(ctx, bx - 3, bodyTop + 3, 7, 1, shade(o.shirt, 0.7));
    } else {
      P(ctx, bx - 3, bodyTop, 7, 4 + sc, o.shirt);
      if (o.outfit === 'tank') { P(ctx, bx - 3, bodyTop, 1, 2, o.skin); P(ctx, bx + 3, bodyTop, 1, 2, o.skin); }
    }
    P(ctx, bx - 4, bodyTop + 1, 1, 3, o.skin); P(ctx, bx + 4, bodyTop + 1, 1, 3, o.skin);
    const headTop = bodyTop - 5;
    P(ctx, bx - 2, headTop, 5, 5, o.skin);
    P(ctx, bx - 2, headTop, 5, 1, hair); P(ctx, bx - 2 - (f > 0 ? 0 : -4), headTop + 1, 1, 2, hair);
    P(ctx, bx + (f > 0 ? 0 : -1), headTop + 2, 1, 1, '#212529'); P(ctx, bx + (f > 0 ? 2 : 1), headTop + 2, 1, 1, '#212529');
    if (cat) {
      P(ctx, bx - 2, headTop - 2, 1, 2, o.skin); P(ctx, bx + 2, headTop - 2, 1, 2, o.skin);
      P(ctx, bx - 5 * f, bodyTop + 1, 1, 4, o.shirt); P(ctx, bx - 6 * f, bodyTop - 1 + (Math.floor(time * 3) % 2), 1, 2, o.shirt);
    } else {
      drawHat(ctx, o.hat, bx, headTop, f);
    }
  }
  ctx.restore();

  // Mood gem and speech bubble
  const top = by - (baby ? 10 : kid ? 15 : 17);
  const m = mood(o);
  const gem = m > 66 ? '#40c057' : m > 33 ? '#fab005' : '#fa5252';
  P(ctx, x, top - 2, 1, 1, gem); P(ctx, x - 1, top - 1, 3, 1, gem); P(ctx, x, top, 1, 1, gem);
  const bubble = bubbleFor(s, o, st, time);
  if (bubble) {
    const [text, color] = bubble;
    const w = textWidth(text) + 4;
    P(ctx, x + 3, top - 9, w, 7, '#ffffff');
    P(ctx, x + 3, top - 2, 2, 1, '#ffffff');
    drawText(ctx, text, x + 5, top - 8, color);
  }
}

const BUBBLES = { chat: ['..', '#495057'], argue: ['#!', '#e03131'], prank: ['HA', '#f76707'],
  flirt: ['♥', '#e64980'], gossip: ['?!', '#7048e8'], pitch: ['$', '#2b8a3e'] };

function bubbleFor(s, o, st, time) {
  if (!st) return null;
  const blink = Math.floor(time * 2 + o.id) % 3 !== 0;
  if (st.type === 'interact') return blink ? BUBBLES[st.kind] : null;
  if (st.type === 'tend' && blink && Math.floor(time / 2 + o.id) % 3 === 0) return ['$', '#2b8a3e'];
  if (st.type === 'gather' && st.event === 'seminar' && o.plan.label.startsWith('Hosting')) return blink ? ['$$$', '#2b8a3e'] : null;
  if (st.type === 'gather' && st.event === 'bbqparty' && blink) return ['♪', '#7048e8'];
  if (statusActive(s, o, 'chased')) return ['!!', '#e03131'];
  if (statusActive(s, o, 'cat') && Math.floor(time / 3 + o.id) % 4 === 0) return ['MEW', '#495057'];
  return null;
}

function drawHat(ctx, hat, x, headTop, f) {
  switch (hat) {
    case 'cap': P(ctx, x - 2, headTop - 1, 5, 2, '#e03131'); P(ctx, x + (f > 0 ? 2 : -4), headTop, 3, 1, '#e03131'); break;
    case 'cowboy': P(ctx, x - 4, headTop, 9, 1, '#8b5a2b'); P(ctx, x - 2, headTop - 2, 5, 2, '#8b5a2b'); break;
    case 'beanie': P(ctx, x - 2, headTop - 1, 5, 2, '#5f3dc4'); P(ctx, x, headTop - 2, 1, 1, '#5f3dc4'); break;
    case 'mohawk': P(ctx, x, headTop - 3, 1, 3, '#40c057'); P(ctx, x - 1, headTop - 2, 3, 1, '#40c057'); break;
    case 'bandana': P(ctx, x - 2, headTop, 5, 1, '#c92a2a'); P(ctx, x - 3 * f, headTop + 1, 1, 2, '#c92a2a'); break;
    case 'tinfoil':
      P(ctx, x, headTop - 4, 1, 1, '#e9ecef'); P(ctx, x - 1, headTop - 3, 3, 1, '#ced4da');
      P(ctx, x - 2, headTop - 2, 5, 2, '#adb5bd'); P(ctx, x - 1, headTop - 2, 1, 1, '#f8f9fa');
      break;
  }
}

// ---------- animals and events ----------

function drawGoose(ctx, x, y, f) {
  x = Math.round(x); y = Math.round(y);
  P(ctx, x - 4, y - 5, 8, 4, '#f8f9fa'); P(ctx, x + 2 * f, y - 10, 2, 5, '#f8f9fa');
  P(ctx, x + 2 * f + (f > 0 ? 2 : -2), y - 10, 2, 1, '#fd7e14'); P(ctx, x - 2, y - 1, 1, 2, '#fd7e14'); P(ctx, x + 1, y - 1, 1, 2, '#fd7e14');
  P(ctx, x + 2 * f + (f > 0 ? 1 : 0), y - 9, 1, 1, '#212529');
}

function drawRaccoon(ctx, x, y, f, carrying) {
  x = Math.round(x); y = Math.round(y);
  P(ctx, x - 4, y - 4, 8, 4, '#868e96'); P(ctx, x + 3 * f, y - 6, 4, 4, '#868e96');
  P(ctx, x + 3 * f, y - 5, 4, 1, '#212529'); P(ctx, x - 6 * f, y - 4, 3, 2, '#495057');
  if (carrying) drawText(ctx, '$', x - 1, y - 11, '#2b8a3e');
}

function drawCat(ctx, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  P(ctx, x - 3, y - 3, 6, 3, c); P(ctx, x + 2, y - 5, 3, 3, c); P(ctx, x + 2, y - 6, 1, 1, c); P(ctx, x + 4, y - 6, 1, 1, c);
  P(ctx, x - 4, y - 5, 1, 3, c);
}

function drawSnail(ctx, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  P(ctx, x - 2, y - 1, 6, 1, '#c5a880'); P(ctx, x - 1, y - 4, 4, 3, c); P(ctx, x + 4, y - 3, 1, 2, '#c5a880');
}

function drawCart(ctx, x, y, rider) {
  x = Math.round(x); y = Math.round(y);
  if (rider) {
    P(ctx, x - 2, y - 13, 5, 5, rider.skin); P(ctx, x - 2, y - 13, 5, 1, rider.hair); P(ctx, x - 3, y - 9, 7, 3, rider.shirt);
  }
  P(ctx, x - 5, y - 7, 10, 5, '#adb5bd');
  for (let i = 0; i < 4; i++) P(ctx, x - 4 + i * 3, y - 7, 1, 5, '#868e96');
  P(ctx, x - 4, y - 1, 2, 1, '#212529'); P(ctx, x + 3, y - 1, 2, 1, '#212529');
}

// ---------- main entry ----------

export function draw(ctx, s, view) {
  const t = view.time;
  const hour = clock(s).hourF;
  const night = hour < 6 || hour >= 20;
  ctx.imageSmoothingEnabled = false;
  if (!groundCache) groundCache = buildGround();
  ctx.drawImage(groundCache, 0, 0);

  // A car driving past on the road
  const carX = ((t * 40) % (WORLD.w + 80)) - 40;
  P(ctx, carX - 10, 11, 20, 7, '#4dabf7'); P(ctx, carX - 6, 9, 12, 3, '#74c0fc'); P(ctx, carX - 8, 17, 4, 2, '#212529'); P(ctx, carX + 4, 17, 4, 2, '#212529');
  drawPowerLines(ctx);

  // Billboard and water towers
  P(ctx, 290, 54, 2, 12, '#6d4c2f'); P(ctx, 370, 54, 2, 12, '#6d4c2f');
  P(ctx, 270, 28, 120, 28, '#6d4c2f');
  P(ctx, 272, 30, 116, 24, '#fff3bf');
  drawText(ctx, 'GET RICH QUICK!', 314, 32, '#c92a2a', { align: 'center' });
  drawText(ctx, 'SEMINAR TONIGHT!', 314, 39, '#2b2b2b', { align: 'center' });
  drawText(ctx, 'FREE HOTDOG!', 314, 46, '#c92a2a', { align: 'center' });
  P(ctx, 360, 38, 22, 6, '#e8b04a'); P(ctx, 362, 39, 18, 3, '#c0392b'); P(ctx, 364, 40, 14, 1, '#ffd43b');
  for (const [wx, label] of [[548, 'CRAP'], [596, 'TOWN']]) {
    P(ctx, wx - 1, 12, 2, 16, '#868e96'); P(ctx, wx - 8, 26, 2, 12, '#868e96'); P(ctx, wx + 6, 26, 2, 12, '#868e96');
    P(ctx, wx - 10, 2, 20, 14, '#adb5bd'); P(ctx, wx - 10, 2, 20, 2, '#ced4da');
    drawText(ctx, label, wx, 7, '#495057', { align: 'center' });
  }

  // Entrance arch
  P(ctx, GATE.x - 30, 326, 2, 28, '#6d4c2f'); P(ctx, GATE.x + 28, 326, 2, 28, '#6d4c2f');
  P(ctx, GATE.x - 44, 318, 88, 10, '#6d4c2f'); P(ctx, GATE.x - 43, 319, 86, 8, '#f1e3c4');
  drawText(ctx, 'SUNSET TRAILER HAVEN', GATE.x, 320, '#c2410c', { align: 'center' });
  for (let i = 0; i < 9; i++) P(ctx, GATE.x - 32 + i * 8, 329, 2, 2, ['#ff6b6b', '#ffd43b', '#69db7c', '#74c0fc'][i % 4]);

  // Depth-sorted things
  const items = [];
  for (const [type, x, y] of DECOR) items.push([y, () => drawDecor(ctx, type, x, y, t)]);
  for (const tr of s.trailers) items.push([tr.y, () => drawTrailer(ctx, s, tr, night, t)]);
  for (const st of s.stalls) items.push([st.y, () => drawStall(ctx, s, st, t)]);
  for (const a of s.amenities) items.push([a.y, () => drawAmenity(ctx, s, a, t)]);

  // Shopping carts on the track: racers during a race, users otherwise
  const track = s.amenities.find(a => a.type === 'track');
  const race = s.events.find(e => e.type === 'race' && e.until > s.minutes);
  const drivers = race ? race.racers.map(id => byId(s.ogonz, id)).filter(o => o && !o.out && !o.inside && Math.hypot(o.x - track.x, o.y - track.y) < 60)
    : track.users.map(id => byId(s.ogonz, id)).filter(Boolean);
  drivers.forEach((o, i) => {
    const k = t * (race ? 0.35 + i * 0.03 : 0.2) + i / Math.max(1, drivers.length);
    const cx = track.x + Math.cos(k * Math.PI * 2) * 65, cy = track.y + Math.sin(k * Math.PI * 2) * 24;
    items.push([cy, () => drawCart(ctx, cx, cy, o)]);
  });
  const racing = new Set(drivers.map(o => o.id));
  for (const o of s.ogonz) {
    if (!o.out && !o.inside && !racing.has(o.id)) items.push([o.y, () => drawResident(ctx, s, o, o.id === view.selectedId, t)]);
  }

  // Cats at the laundromat, snails on their track, the goose and raccoons
  const lx = 470, ly = 228;
  for (let i = 0; i < 4; i++) {
    const cx = lx - 30 + i * 18 + Math.sin(t * 0.5 + i) * 4, cy = ly + 6 + (i % 2) * 6;
    items.push([cy, () => drawCat(ctx, cx, cy, ['#f08c00', '#868e96', '#212529', '#e9ecef'][i])]);
  }
  const derby = eventActive(s, 'derby');
  for (let i = 0; i < 5; i++) {
    const k = (t * (derby ? 0.08 : 0.01) * (1 + i * 0.13) + i * 0.2) % 1;
    const sx = 574 + Math.cos(k * Math.PI * 2) * 32, sy = 293 + Math.sin(k * Math.PI * 2) * 11;
    items.push([sy, () => drawSnail(ctx, sx, sy, ['#e8590c', '#f783ac', '#ffd43b', '#4dabf7', '#40c057'][i])]);
  }
  const gooseEvent = s.events.find(e => e.type === 'goose' && e.until > s.minutes);
  const victim = gooseEvent && byId(s.ogonz, gooseEvent.who);
  if (victim && !victim.out && !victim.inside) {
    const gx = victim.x - 10 * (victim.facing || 1), gy = victim.y + 2;
    items.push([gy, () => drawGoose(ctx, gx, gy, victim.facing || 1)]);
  } else {
    const gx = 540 + Math.sin(t * 0.13) * 50, gy = 120 + Math.cos(t * 0.09) * 12;
    items.push([gy, () => drawGoose(ctx, gx, gy, Math.cos(t * 0.13) > 0 ? 1 : -1)]);
  }
  const heist = s.events.find(e => e.type === 'raccoons' && e.until > s.minutes);
  const ht = heist && byId(s.trailers, heist.trailer);
  for (let i = 0; i < 2; i++) {
    let rx = 596 + i * 10 + Math.sin(t * 0.7 + i) * 3, ry = 352;
    if (ht) { const k = ((t * 0.3) + i * 0.3) % 1; rx = ht.x - 20 + k * 40; ry = ht.y + 8 + i * 3; }
    items.push([ry, () => drawRaccoon(ctx, rx, ry, ht ? 1 : -1, !!ht)]);
  }
  // Chicken mascot dancing under the billboard
  const chx = 400 + Math.sin(t * 0.4) * 6, chy = 62;
  items.push([chy, () => {
    const b = Math.floor(t * 4) % 2;
    P(ctx, chx - 4, chy - 11 - b, 8, 9, '#f8f9fa'); P(ctx, chx - 2, chy - 15 - b, 5, 4, '#f8f9fa');
    P(ctx, chx - 1, chy - 16 - b, 3, 1, '#e03131'); P(ctx, chx + 3, chy - 14 - b, 2, 1, '#fd7e14');
    P(ctx, chx - 2, chy - 2, 1, 2, '#fd7e14'); P(ctx, chx + 1, chy - 2, 1, 2, '#fd7e14');
  }]);

  items.sort((a, b) => a[0] - b[0]);
  for (const [, fn] of items) fn();

  // Hot tub water over the people soaking in it
  const tub = s.amenities.find(a => a.type === 'hottub');
  if (tub.users.length) {
    ctx.fillStyle = 'rgba(77,171,247,0.9)';
    ctx.beginPath(); ctx.ellipse(tub.x, tub.y - 5, 21, 6, 0, 0, Math.PI); ctx.fill();
    P(ctx, tub.x - 21, tub.y - 6, 42, 2, 'rgba(165,216,255,0.9)');
  }

  drawEvents(ctx, s, t);

  // Night: darken, then let the lights shine through
  if (night || hour < 7 || hour >= 19) {
    const dark = night ? 0.5 : 0.25;
    P(ctx, 0, 0, WORLD.w, WORLD.h, `rgba(12,18,50,${dark})`);
    for (const tr of s.trailers) {
      if (s.ogonz.some(o => o.inside === tr.id && !isSleeping(s, o))) {
        for (const wx of [tr.x + 2, tr.x + 15]) P(ctx, wx, tr.y - TRAILER.face + 3, 8, 5, '#ffe08a');
      }
    }
    // String lights between poles near the snail pen and the laundromat
    for (let i = 0; i < 26; i++) {
      const x = 380 + i * 9, y = 196 + Math.sin(i * 0.6) * 3;
      P(ctx, x, y, 2, 2, ['#ff6b6b', '#ffd43b', '#69db7c', '#74c0fc'][i % 4]);
    }
    for (let i = 0; i < 9; i++) P(ctx, GATE.x - 32 + i * 8, 329, 2, 2, ['#ff6b6b', '#ffd43b', '#69db7c', '#74c0fc'][i % 4]);
  }
}

function drawEvents(ctx, s, t) {
  for (const e of s.events) {
    if (e.until <= s.minutes) continue;
    const k = (s.minutes - e.start) / (e.until - e.start);
    switch (e.type) {
      case 'ufo': {
        const y = 40 - k * 30;
        ctx.fillStyle = 'rgba(178,242,187,0.35)';
        ctx.beginPath(); ctx.moveTo(e.x - 4, y + 4); ctx.lineTo(e.x + 4, y + 4); ctx.lineTo(e.x + 14, e.y); ctx.lineTo(e.x - 14, e.y); ctx.fill();
        P(ctx, e.x - 14, y, 28, 4, '#adb5bd'); P(ctx, e.x - 6, y - 4, 12, 4, '#74c0fc');
        for (let i = 0; i < 4; i++) P(ctx, e.x - 11 + i * 7, y + 1, 2, 2, Math.floor(t * 6 + i) % 2 ? '#ffd43b' : '#ff6b6b');
        break;
      }
      case 'pizza':
        for (let i = 0; i < 30; i++) {
          const x = (i * 131) % WORLD.w, y = ((t * 60 + i * 97) % (WORLD.h + 20)) - 10;
          P(ctx, x, y, 5, 2, '#fcc419'); P(ctx, x + 1, y + 2, 3, 1, '#fcc419'); P(ctx, x + 2, y + 3, 1, 1, '#fcc419');
          P(ctx, x + 1, y, 1, 1, '#c92a2a'); P(ctx, x + 3, y + 1, 1, 1, '#c92a2a');
        }
        break;
      case 'gusher':
        P(ctx, e.x - 8, e.y - 70, 4, 66, '#2b1a0e');
        for (let i = 0; i < 40; i++) {
          const p = (t * 1.2 + i / 40) % 1;
          P(ctx, e.x - 6 + Math.sin(i * 7) * p * 26, e.y - 70 + p * p * 70 - Math.sin(p * Math.PI) * 10, 3, 3, i % 2 ? '#2b1a0e' : '#5c3d2e');
        }
        break;
      case 'tornado': {
        const x = e.x + k * 600, y = e.y;
        for (let i = 0; i < 10; i++) {
          const w = 2 + i * 1.5;
          P(ctx, x + Math.sin(t * 8 + i) * 3 - w / 2, y - i * 3, w, 2, `rgba(130,130,130,${0.7 - i * 0.04})`);
        }
        break;
      }
      case 'pottyboom':
        for (let i = 0; i < 14; i++) {
          const p = Math.min(1, k * 3);
          P(ctx, e.x + Math.cos(i) * p * 20, e.y - 10 + Math.sin(i * 1.7) * p * 16, 3, 3, i % 3 ? 'rgba(120,120,120,0.7)' : '#1c7ed6');
        }
        break;
      case 'raccoons':
      case 'seminar':
      case 'race':
      case 'derby':
      case 'bbqparty':
        break;      // shown by the residents gathering and the animals
    }
  }
}

