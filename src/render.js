// Draws the apartment building, its residents and any silly events onto a 2D
// canvas in world units.

import { WORLD, FLOORS, FLOOR_H, ROOF_Y, ROOMS, BUILDING, ELEVATOR, EXIT_X, CATALOG } from './data.js';
import { clock, mood, isSleeping, byId, stage, statusActive, eventActive } from './sim.js';

export const OGON_SCALE = 1.25;

export function ogonPosition(o) {
  if (!o.ride) return { x: o.x, y: FLOORS[o.floor] };
  return { x: ELEVATOR.x, y: FLOORS[o.ride.from] + (FLOORS[o.ride.to] - FLOORS[o.ride.from]) * o.ride.t };
}

export function draw(ctx, s, view) {
  const hour = clock(s).hourF;
  const t = view.time;
  drawSky(ctx, hour);
  drawCity(ctx, hour);
  drawGround(ctx);
  drawBuilding(ctx, s, hour, t);
  for (const obj of s.objects) drawObject(ctx, obj.type, obj.x, FLOORS[obj.floor], obj.user !== null, t);
  drawEventsBehind(ctx, s, t);
  const float = eventActive(s, 'gravity');
  for (const o of s.ogonz) if (!o.out) drawResident(ctx, s, o, o.id === view.selectedId, t, float);
  drawEventsFront(ctx, s, t);
}

// ---------- scenery ----------

function daylight(hour) {
  const c01 = v => Math.max(0, Math.min(1, v));
  return c01((hour - 5) / 2) * c01((21 - hour) / 2);
}

function drawSky(ctx, hour) {
  const light = daylight(hour);
  const g = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  g.addColorStop(0, mix('#0b1026', '#6cb4ee', light));
  g.addColorStop(1, mix('#28305a', '#cfe9ff', light));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  if (light < 0.3) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 50; i++) ctx.fillRect((i * 97) % WORLD.w, (i * 53) % 300, 1.5, 1.5);
    ctx.fillStyle = '#fff9db';
    ctx.beginPath();
    ctx.arc(1080, 60, 22, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(120 + (hour - 6) / 14 * 960, 70, 26, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCity(ctx, hour) {
  ctx.fillStyle = mix('#151a33', '#9fb7cf', daylight(hour));
  for (const [x, y, w] of [[0, 380, 70], [40, 300, 36], [1166, 330, 34], [1180, 260, 20]]) {
    ctx.fillRect(x, y, w, FLOORS[0] - y);
  }
}

function drawGround(ctx) {
  ctx.fillStyle = '#495057';
  ctx.fillRect(0, FLOORS[0], WORLD.w, WORLD.h - FLOORS[0]);
  ctx.fillStyle = '#adb5bd';
  ctx.fillRect(0, FLOORS[0], WORLD.w, 8);
  ctx.fillStyle = '#ffd43b';
  for (let x = 10; x < WORLD.w; x += 60) ctx.fillRect(x, FLOORS[0] + 34, 30, 4);
  // Bus stop
  ctx.fillStyle = '#555';
  ctx.fillRect(EXIT_X - 2, FLOORS[0] - 60, 4, 60);
  ctx.fillStyle = '#1c7ed6';
  ctx.fillRect(EXIT_X - 16, FLOORS[0] - 74, 32, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BUS', EXIT_X, FLOORS[0] - 61);
}

function drawBuilding(ctx, s, hour, t) {
  const { left, right } = BUILDING;
  const night = hour < 6 || hour >= 20;
  // Roof, sign, water tower
  ctx.fillStyle = '#5c4033';
  ctx.fillRect(left - 12, ROOF_Y - 14, right - left + 24, 14);
  ctx.fillStyle = '#8c3b2e';
  ctx.fillRect(left + 40, ROOF_Y - 52, 300, 38);
  ctx.fillStyle = night ? '#ffd43b' : '#fff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OGONZ APARTMENTS', left + 190, ROOF_Y - 26);
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(right - 150, ROOF_Y - 70, 60, 50);
  ctx.fillRect(right - 145, ROOF_Y - 20, 6, 8);
  ctx.fillRect(right - 101, ROOF_Y - 20, 6, 8);
  ctx.beginPath();
  ctx.moveTo(right - 156, ROOF_Y - 70);
  ctx.lineTo(right - 120, ROOF_Y - 92);
  ctx.lineTo(right - 84, ROOF_Y - 70);
  ctx.fill();

  // Rooms
  for (const r of ROOMS) {
    const top = FLOORS[r.floor] - FLOOR_H;
    ctx.fillStyle = r.wall;
    ctx.fillRect(r.l, top, r.r - r.l, FLOOR_H);
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    for (let x = r.l; x < r.r; x += 24) ctx.fillRect(x, top, 12, FLOOR_H);
    const wx = (r.l + r.r) / 2 + 40;
    ctx.fillStyle = night ? '#1b2340' : '#bfe3ff';
    ctx.fillRect(wx, top + 22, 54, 40);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(wx, top + 22, 54, 40);
    // Door plate
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(r.l + 6, top + 6, r.common ? 92 : 34, 18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(r.common ? r.name : r.id, r.l + 11, top + 19);
    if (r.id === 'party') drawPartyLights(ctx, r, top, t, eventActive(s, 'dance'));
  }
  // Floor slabs and outer walls
  ctx.fillStyle = '#8d6e63';
  for (let f = 0; f < FLOORS.length; f++) ctx.fillRect(left, FLOORS[f], right - left, 8);
  ctx.fillStyle = '#6b4f3a';
  ctx.fillRect(left - 6, ROOF_Y, 6, FLOORS[0] - ROOF_Y + 8);
  ctx.fillRect(right, ROOF_Y, 6, FLOORS[0] - ROOF_Y + 8);
  ctx.fillStyle = '#c08552';
  ctx.fillRect(left - 6, FLOORS[0] - 66, 6, 66);   // front door

  // Elevator shaft and car
  const sx = ELEVATOR.x - ELEVATOR.w / 2;
  ctx.fillStyle = '#343a40';
  ctx.fillRect(sx, ROOF_Y, ELEVATOR.w, FLOORS[0] - ROOF_Y);
  ctx.strokeStyle = '#868e96';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ELEVATOR.x, ROOF_Y);
  ctx.lineTo(ELEVATOR.x, FLOORS[0]);
  ctx.stroke();
  // The car follows whoever is riding, or waits where someone just got off.
  const rider = s.ogonz.find(o => o.ride && !o.out) ||
    s.ogonz.find(o => !o.out && Math.abs(o.x - ELEVATOR.x) < ELEVATOR.w / 2);
  const carY = rider ? ogonPosition(rider).y : FLOORS[0];
  ctx.fillStyle = '#ced4da';
  ctx.fillRect(sx + 4, carY - 92, ELEVATOR.w - 8, 92);
  ctx.fillStyle = '#adb5bd';
  ctx.fillRect(sx + 4, carY - 92, ELEVATOR.w - 8, 6);
  if (eventActive(s, 'elevator')) {
    // The sulking elevator has a face.
    ctx.fillStyle = '#212529';
    ctx.fillRect(ELEVATOR.x - 12, carY - 70, 5, 5);
    ctx.fillRect(ELEVATOR.x + 7, carY - 70, 5, 5);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#212529';
    ctx.beginPath();
    ctx.arc(ELEVATOR.x, carY - 40, 9, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
}

function drawPartyLights(ctx, r, top, t, partying) {
  const n = partying ? 10 : 4;
  for (let i = 0; i < n; i++) {
    const hue = (i * 47 + t * (partying ? 120 : 20)) % 360;
    ctx.fillStyle = `hsla(${hue}, 90%, 60%, ${partying ? 0.35 : 0.15})`;
    ctx.beginPath();
    ctx.arc(r.l + 40 + ((i * 89 + t * (partying ? 60 : 8)) % (r.r - r.l - 80)), top + 30 + (i * 37) % 90,
      partying ? 22 : 14, 0, Math.PI * 2);
    ctx.fill();
  }
  if (partying) {
    const x = (r.l + r.r) / 2;
    ctx.strokeStyle = '#adb5bd';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + 18);
    ctx.stroke();
    ctx.fillStyle = '#dee2e6';
    ctx.beginPath();
    ctx.arc(x, top + 28, 11, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- furniture ----------

export function drawObject(ctx, type, x, base, inUse, t) {
  const cat = CATALOG[type];
  const l = x - cat.w / 2, top = base - cat.h, w = cat.w, h = cat.h;
  switch (type) {
    case 'fridge':
      box(ctx, l, top, w, h, '#e9ecef', '#adb5bd');
      ctx.fillStyle = '#adb5bd';
      ctx.fillRect(l, top + h * 0.35, w, 2);
      ctx.fillRect(l + w - 8, top + 8, 3, 14);
      ctx.fillRect(l + w - 8, top + h * 0.45, 3, 18);
      break;
    case 'counter':
      box(ctx, l, top + 16, w, h - 16, '#a0785a', '#7a5a3a');
      box(ctx, l - 2, top + 12, w + 4, 6, '#e9ecef');
      ctx.fillStyle = '#e03131';
      ctx.fillRect(l + 8, top, 12, 12);
      ctx.fillStyle = '#fab005';
      ctx.fillRect(l + 26, top + 4, 14, 8);
      break;
    case 'bed':
      box(ctx, l, base - 18, w, 18, '#8d6e63', '#6d4c41');
      box(ctx, l, top, 10, h, '#6d4c41');
      box(ctx, l + 10, base - 26, w - 10, 9, '#74c0fc', '#4dabf7');
      box(ctx, l + 12, base - 30, 18, 8, '#fff', '#ced4da');
      break;
    case 'crib':
      box(ctx, l, base - 16, w, 16, '#ffd8a8', '#e8590c');
      ctx.fillStyle = '#e8590c';
      for (let i = 0; i < 5; i++) ctx.fillRect(l + 2 + i * 10, top, 2, h - 16);
      ctx.fillRect(l, top, w, 3);
      break;
    case 'toilet':
      box(ctx, l + 14, top, 14, 20, '#f8f9fa', '#ced4da');
      box(ctx, l + 2, base - 18, 26, 8, '#f8f9fa', '#ced4da');
      box(ctx, l + 8, base - 10, 12, 10, '#f8f9fa', '#ced4da');
      break;
    case 'shower':
      box(ctx, l, top, w, h, 'rgba(165,216,255,0.45)', '#74c0fc');
      ctx.fillStyle = '#868e96';
      ctx.fillRect(x - 2, top + 4, 4, 10);
      ctx.fillRect(x - 8, top + 14, 16, 3);
      if (inUse) {
        ctx.fillStyle = 'rgba(77,171,247,0.6)';
        for (let i = 0; i < 5; i++) ctx.fillRect(x - 7 + i * 3, top + 20, 1.5, h - 24);
      }
      break;
    case 'tv':
      box(ctx, l + 4, base - 16, w - 8, 16, '#8d6e63', '#6d4c41');
      box(ctx, l, top, w, 28, '#212529');
      ctx.fillStyle = inUse ? `hsl(${(t * 80) % 360}, 60%, 60%)` : '#343a40';
      ctx.fillRect(l + 3, top + 3, w - 6, 22);
      break;
    case 'sofa':
      box(ctx, l, base - 22, w, 16, '#e599f7', '#be4bdb');
      box(ctx, l, top, w, 14, '#da77f2', '#be4bdb');
      box(ctx, l - 2, base - 26, 8, 20, '#be4bdb');
      box(ctx, l + w - 6, base - 26, 8, 20, '#be4bdb');
      break;
    case 'bookshelf':
      box(ctx, l, top, w, h, '#a0785a', '#7a5a3a');
      for (let r = 0; r < 4; r++) {
        for (let b = 0; b < 6; b++) {
          ctx.fillStyle = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#7048e8', '#495057'][(b + r) % 6];
          ctx.fillRect(l + 4 + b * 6, top + 6 + r * 19, 5, 14);
        }
      }
      break;
    case 'arcade':
      box(ctx, l, top, w, h, '#5f3dc4', '#3b1f8c');
      ctx.fillStyle = inUse ? `hsl(${(t * 200) % 360}, 80%, 60%)` : '#212529';
      ctx.fillRect(l + 5, top + 8, w - 10, 24);
      ctx.fillStyle = '#fa5252';
      ctx.beginPath();
      ctx.arc(l + 12, top + 44, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fcc419';
      ctx.fillRect(l + 22, top + 40, 10, 6);
      break;
    case 'jukebox':
      box(ctx, l, top + 10, w, h - 10, '#c92a2a', '#862e9c');
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      ctx.arc(x, top + 14, w / 2, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = `hsl(${(t * 90) % 360}, 90%, 65%)`;
      ctx.fillRect(l + 6, top + 26, w - 12, 18);
      break;
    case 'plant':
      box(ctx, l + 4, base - 14, w - 8, 14, '#d9480f');
      ctx.fillStyle = '#2b8a3e';
      ctx.beginPath();
      ctx.ellipse(x, base - 26, 11, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function box(ctx, x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  }
}

// ---------- residents ----------

function sizeFor(o) {
  if (o.age < 6) return 0.55;
  if (o.age < 18) return 0.55 + (o.age - 6) / 12 * 0.4;
  return 1;
}

const BUBBLES = {
  chat: ['…', '#212529'], argue: ['#!', '#e03131'], prank: ['ha', '#f76707'],
  flirt: ['♥', '#e64980'], gossip: ['?!', '#7048e8']
};

function drawResident(ctx, s, o, selected, time, float) {
  const pos = ogonPosition(o);
  const k = OGON_SCALE * sizeFor(o);
  const lift = float && !isSleeping(s, o) ? 14 + Math.sin(time * 2 + o.id) * 8 : 0;
  ctx.save();
  if (statusActive(s, o, 'invisible')) ctx.globalAlpha = 0.18;
  ctx.translate(pos.x, pos.y - lift);
  ctx.scale(k, k);
  drawBody(ctx, s, o, selected, time);
  ctx.restore();
}

function drawBody(ctx, s, o, selected, time) {
  const sleeping = isSleeping(s, o);
  const step = o.plan && o.plan.steps[0];
  const walking = step && (step.type === 'goto' || step.type === 'approach') && !o.ride;
  const dancing = step && step.type === 'dance';
  const bob = walking ? Math.abs(Math.sin(time * 10)) * 2 : dancing ? Math.abs(Math.sin(time * 8)) * 5 : 0;
  const cat = statusActive(s, o, 'cat');
  const f = o.facing || 1;

  if (selected) {
    ctx.fillStyle = 'rgba(255,212,59,0.6)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  if (sleeping) {
    const bed = step.type === 'use' ? byId(s.objects, step.objectId) : null;
    ctx.translate(22, -(bed ? 20 : 2) / OGON_SCALE);
    ctx.rotate(-Math.PI / 2);
  } else if (dancing) {
    ctx.rotate(Math.sin(time * 6 + o.id) * 0.2);
  }
  // Legs
  ctx.fillStyle = '#343a40';
  const swing = walking ? Math.sin(time * 10) * 3 : 0;
  ctx.fillRect(-5 + swing, -9, 4, 9);
  ctx.fillRect(1 - swing, -9, 4, 9);
  // Body
  ctx.fillStyle = o.color;
  roundRect(ctx, -8, -27 - bob, 16, 19, 6);
  ctx.fill();
  if (cat) {
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-7 * f, -12 - bob);
    ctx.quadraticCurveTo(-18 * f, -14 - bob, -16 * f, -28 - bob + Math.sin(time * 4) * 3);
    ctx.stroke();
  }
  // Head
  ctx.fillStyle = o.skin;
  ctx.beginPath();
  ctx.arc(0, -34 - bob, 8, 0, Math.PI * 2);
  ctx.fill();
  // Hair (grey for elders)
  ctx.fillStyle = stage(o) === 'elder' ? '#ced4da' : '#5c3d2e';
  ctx.beginPath();
  ctx.arc(0, -35 - bob, 8, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#212529';
  if (sleeping) {
    ctx.fillRect(-4, -35 - bob, 3, 1);
    ctx.fillRect(2, -35 - bob, 3, 1);
  } else {
    ctx.fillRect(f * 2 - 1, -36 - bob, 2, 3);
    ctx.fillRect(f * 5 - 1, -36 - bob, 2, 3);
  }
  if (cat) {
    ctx.fillStyle = o.skin;
    for (const ex of [-6, 3]) {
      ctx.beginPath();
      ctx.moveTo(ex, -40 - bob);
      ctx.lineTo(ex + 1.5, -48 - bob);
      ctx.lineTo(ex + 3, -40 - bob);
      ctx.fill();
    }
    ctx.strokeStyle = '#495057';
    ctx.lineWidth = 0.7;
    for (const dy of [-32, -30]) {
      ctx.beginPath();
      ctx.moveTo(f * 4, dy - bob);
      ctx.lineTo(f * 12, dy - 1 - bob);
      ctx.stroke();
    }
  } else {
    drawHat(ctx, o.hat, bob);
  }
  ctx.restore();

  const headTop = sleeping ? -52 : -50 - bob;
  // Mood diamond
  ctx.fillStyle = `hsl(${Math.round(mood(o) * 1.2)}, 80%, 48%)`;
  ctx.beginPath();
  ctx.moveTo(0, headTop - 14);
  ctx.lineTo(5, headTop - 7);
  ctx.lineTo(0, headTop);
  ctx.lineTo(-5, headTop - 7);
  ctx.closePath();
  ctx.fill();

  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#212529';
  if (sleeping) ctx.fillText(Math.floor(time * 2) % 2 ? 'z Z' : 'Z z', 8, headTop - 4);
  else if (step && step.type === 'interact') {
    const [text, color] = BUBBLES[step.kind] || BUBBLES.chat;
    bubble(ctx, 6, headTop - 10, Math.floor(time * 3 + o.id) % 3 ? text : '…', color);
  } else if (cat && Math.floor(time / 3 + o.id) % 4 === 0) bubble(ctx, 6, headTop - 10, 'mew', '#495057');
  else if (dancing) bubble(ctx, 6, headTop - 10, '♪', '#7048e8');

  // Name
  ctx.font = (selected ? 'bold ' : '') + '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeText(o.name, 0, 12);
  ctx.fillStyle = '#212529';
  ctx.fillText(o.name, 0, 12);
}

function drawHat(ctx, hat, bob) {
  const y = -41 - bob;
  switch (hat) {
    case 'beanie':
      ctx.fillStyle = '#e8590c';
      ctx.beginPath();
      ctx.arc(0, y + 2, 8, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, y - 7, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'tophat':
      ctx.fillStyle = '#212529';
      ctx.fillRect(-9, y, 18, 3);
      ctx.fillRect(-6, y - 12, 12, 12);
      break;
    case 'cap':
      ctx.fillStyle = '#1971c2';
      ctx.beginPath();
      ctx.arc(0, y + 3, 8, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(0, y + 1, 12, 3);
      break;
    case 'flower':
      ctx.fillStyle = '#f783ac';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(5 + Math.cos(i * 1.26) * 3, y + 1 + Math.sin(i * 1.26) * 3, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      ctx.arc(5, y + 1, 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'antenna':
      ctx.strokeStyle = '#495057';
      ctx.lineWidth = 1.2;
      for (const ax of [-3, 3]) {
        ctx.beginPath();
        ctx.moveTo(ax, y + 2);
        ctx.lineTo(ax * 2, y - 8);
        ctx.stroke();
        ctx.fillStyle = '#51cf66';
        ctx.beginPath();
        ctx.arc(ax * 2, y - 9, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'crown':
      ctx.fillStyle = '#fab005';
      ctx.beginPath();
      ctx.moveTo(-7, y + 2);
      ctx.lineTo(-7, y - 6);
      ctx.lineTo(-3.5, y - 2);
      ctx.lineTo(0, y - 8);
      ctx.lineTo(3.5, y - 2);
      ctx.lineTo(7, y - 6);
      ctx.lineTo(7, y + 2);
      ctx.fill();
      break;
    case 'bow':
      ctx.fillStyle = '#e64980';
      ctx.beginPath();
      ctx.moveTo(4, y + 1);
      ctx.lineTo(0, y - 3);
      ctx.lineTo(0, y + 5);
      ctx.moveTo(4, y + 1);
      ctx.lineTo(8, y - 3);
      ctx.lineTo(8, y + 5);
      ctx.fill();
      break;
  }
}

// ---------- silly events ----------

function drawEventsBehind(ctx, s, t) {
  for (const e of s.events) {
    if (e.until <= s.minutes) continue;
    if (e.type === 'ghost') {
      const r = ROOMS.find(x => x.id === e.room);
      const x = r.l + 60 + (Math.sin(t * 0.7) * 0.5 + 0.5) * (r.r - r.l - 120);
      const y = FLOORS[r.floor] - 80 + Math.sin(t * 2) * 8;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(x, y, 16, Math.PI, 0);
      ctx.lineTo(x + 16, y + 26);
      for (let i = 0; i < 4; i++) ctx.lineTo(x + 16 - (i + 0.5) * 8, y + 26 - (i % 2 ? 0 : 6));
      ctx.lineTo(x - 16, y + 26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#212529';
      ctx.fillRect(x - 7, y - 4, 4, 6);
      ctx.fillRect(x + 3, y - 4, 4, 6);
    }
    if (e.type === 'duck') {
      const lobby = ROOMS.find(x => x.id === 'cafe');
      const x = lobby.l + 40 + (Math.sin(t * 0.3) * 0.5 + 0.5) * (lobby.r - lobby.l - 80);
      const y = FLOORS[0];
      const dir = Math.cos(t * 0.3) > 0 ? 1 : -1;
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      ctx.ellipse(x, y - 9, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + dir * 8, y - 20, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f76707';
      ctx.fillRect(x + dir * 12 - (dir < 0 ? 6 : 0), y - 21, 6, 3);
      ctx.fillStyle = '#212529';
      ctx.fillRect(x + dir * 9, y - 23, 2, 2);
      ctx.fillStyle = '#c92a2a';                          // the manager's tie
      ctx.fillRect(x + dir * 6 - 1, y - 15, 3, 7);
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#212529';
      ctx.fillText('MANAGER', x, y - 32);
    }
  }
}

function drawEventsFront(ctx, s, t) {
  for (const e of s.events) {
    if (e.until <= s.minutes) continue;
    if (e.type === 'ufo') {
      const p = (s.minutes - e.start) / (e.until - e.start);
      const y = ROOF_Y - 70 - p * 40;
      ctx.fillStyle = 'rgba(178,242,187,0.35)';
      ctx.beginPath();
      ctx.moveTo(e.x - 14, y + 8);
      ctx.lineTo(e.x + 14, y + 8);
      ctx.lineTo(e.x + 50, FLOORS[e.floor]);
      ctx.lineTo(e.x - 50, FLOORS[e.floor]);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#adb5bd';
      ctx.beginPath();
      ctx.ellipse(e.x, y, 46, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#74c0fc';
      ctx.beginPath();
      ctx.arc(e.x, y - 6, 16, Math.PI, 0);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = Math.floor(t * 6 + i) % 2 ? '#ffd43b' : '#ff6b6b';
        ctx.beginPath();
        ctx.arc(e.x - 32 + i * 16, y + 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (e.type === 'pizza') {
      for (let i = 0; i < 26; i++) {
        const x = (i * 131) % WORLD.w;
        const y = ((t * 120 + i * 97) % (FLOORS[0] + 40)) - 20;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 2 + i);
        ctx.fillStyle = '#fcc419';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(8, 8);
        ctx.lineTo(-8, 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#c92a2a';
        ctx.beginPath();
        ctx.arc(0, 3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

function bubble(ctx, x, y, text, color) {
  ctx.font = 'bold 11px system-ui, sans-serif';
  const w = Math.max(16, ctx.measureText(text).width + 8);
  ctx.fillStyle = '#fff';
  roundRect(ctx, x, y - 12, w, 14, 5);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y - 1);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
